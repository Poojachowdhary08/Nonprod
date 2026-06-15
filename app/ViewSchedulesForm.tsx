import { useSmartSearch } from "../hooks/useSmartSearch";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  FlatList,
  SafeAreaView,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ModalSelector from "@/components/AppModalSelect";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import TText from "@/components/TText";
import { buildScheduleLockState, findBlockingAncestor } from "@/utils/scheduleLocks";
import { isOnline, listenNetwork } from "@/utils/network";
import {
  buildPropertyRouteContext,
  toPropertyRouteParams,
} from "@/utils/propertyRouteContext";
import { useTheme } from "@/src/theme/ThemeProvider";

import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
import { authenticatedFetch } from "../utils/auth";

type Schedule = {
  scheduleid: number;
  phasename: string;
  status: string;
  remarks: string;
  startdate: string;
  enddate: string;
  has_update_today: boolean;
  depends_on_scheduleid?: number[] | null;
};

const INITIAL_BATCH = 12;
const LOAD_MORE_BATCH = 12;

// ---- Status handling ----
const ORDERED_STATUSES = ["in progress", "on hold", "pending", "completed"] as const;
type Status = (typeof ORDERED_STATUSES)[number];
type FilterValue = "all" | Status;

const API_BASE_URL = `${APP_API_BASE_URL}`;
const cacheKeyFor = (propertyId: string) => `schedules:property:${propertyId}`;

const normalizeStatus = (raw: any): Status | null => {
  if (raw == null) return null;
  let s = String(raw).toLowerCase().replace(/[_\s]+/g, " ").trim();
  if (s === "hold") s = "on hold";
  if (s === "inprogress") s = "in progress";
  if (s === "ongoing") s = "in progress";
  if (s === "complete") s = "completed";
  return (ORDERED_STATUSES as readonly string[]).includes(s) ? (s as Status) : null;
};

const statusColors = (status?: string) => {
  switch ((status || "").trim().toLowerCase()) {
    case "pending":
      return { bg: "#FFF7DD", text: "#B45309", border: "#FDE68A" };
    case "on hold":
      return { bg: "#EEF2F7", text: "#374151", border: "#E5E7EB" };
    case "in progress":
      return { bg: "#FFF0D9", text: "#B45309", border: "#FCD34D" };
    case "completed":
      return { bg: "#DFF5E3", text: "#166534", border: "#BBF7D0" };
    default:
      return { bg: "#EEF2F7", text: "#374151", border: "#E5E7EB" };
  }
};

const startOfLocalDay = (value: Date) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();

const parseScheduleDate = (value?: string) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(trimmed);
  return isNaN(date.getTime()) ? null : startOfLocalDay(date);
};

const isScheduledToday = (item: Schedule) => {
  const today = startOfLocalDay(new Date());
  const start = parseScheduleDate(item.startdate);
  const end = parseScheduleDate(item.enddate);

  if (start != null && end != null) return start <= today && today <= end;
  if (start != null) return start === today;
  if (end != null) return end === today;
  return false;
};

type Props = {
  propertyId: string;
  projectId: string;
  userDetails: any;
};

const ViewSchedulesForm = ({ propertyId, projectId, userDetails }: Props) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  const router = useRouter();
  const params = useLocalSearchParams();
  const routeContext = useMemo(
    () =>
      buildPropertyRouteContext(params, {
        propertyId,
        projectId,
        userDetails,
      }),
    [params, propertyId, projectId, userDetails]
  );
  const user = routeContext.userDetails || userDetails || null;
  const firstName = user?.first_name;
  const lastName = user?.last_name;

  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<FilterValue>("all");
  const [visibleCount, setVisibleCount] = useState(INITIAL_BATCH);
  const [refreshing, setRefreshing] = useState(false);
  const isFetchingRef = useRef(false);

  const [online, setOnline] = useState<boolean>(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  // connectivity listener
  useEffect(() => {
    const unsub = listenNetwork(setOnline);
    void (async () => setOnline(await isOnline()))();
    return () => unsub && unsub();
  }, []);

  const loadFromCache = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(cacheKeyFor(propertyId));
      if (!raw) return { items: [] as Schedule[], ts: null as string | null };
      const parsed = JSON.parse(raw) as { items: Schedule[]; ts?: string };
      return { items: parsed.items || [], ts: parsed.ts || null };
    } catch {
      return { items: [] as Schedule[], ts: null };
    }
  }, [propertyId]);

  const saveToCache = useCallback(
    async (items: Schedule[]) => {
      const ts = new Date().toISOString();
      setLastSyncedAt(ts);
      try {
        await AsyncStorage.setItem(
          cacheKeyFor(propertyId),
          JSON.stringify({ items, ts })
        );
      } catch {
        // ignore cache errors
      }
    },
    [propertyId]
  );

  const fetchSchedules = useCallback(async () => {
    if (!propertyId || isFetchingRef.current) return;
    isFetchingRef.current = true;
    setErrorMsg(null);

    try {
      if (!refreshing) setLoading(true);

      // OFFLINE → just load cache
      if (!online) {
        const { items, ts } = await loadFromCache();
        setAllSchedules(items);
        setVisibleCount(INITIAL_BATCH);
        setLastSyncedAt(ts);
        return;
      }

      // ONLINE: show cached immediately first (instant UI), then fetch fresh
      const cached = await loadFromCache();
      if (cached.items.length > 0) {
        setAllSchedules(cached.items);
        setVisibleCount(INITIAL_BATCH);
        setLastSyncedAt(cached.ts);
      }

      // ONLINE → fetch and cache
      const API_URL = `${API_BASE_URL}/properties/${propertyId}/schedule`;
      const response = await authenticatedFetch(API_URL);
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const data = await response.json();

      const validSchedules: any[] = Array.isArray(data?.schedule)
        ? data.schedule.filter((x: any) => x != null)
        : [];

      const cleaned: Schedule[] = validSchedules
        .map((s: any) => {
          const normalized = normalizeStatus(s?.status);
          if (!normalized) return null;
          return {
            scheduleid: Number(s.scheduleid),
            phasename: String(s.phasename ?? "").trim(),
            status: normalized,
            remarks: String(s.remarks ?? ""),
            startdate: String(s.startdate ?? ""),
            enddate: String(s.enddate ?? ""),
            has_update_today: Boolean(s.has_update_today),
            depends_on_scheduleid: Array.isArray(s.depends_on_scheduleid)
              ? s.depends_on_scheduleid
                  .map((id: any) => Number(id))
                  .filter((id: number) => !Number.isNaN(id))
              : null,
          } as Schedule;
        })
        .filter(Boolean) as Schedule[];

      setAllSchedules(cleaned);
      setVisibleCount(INITIAL_BATCH);
      await saveToCache(cleaned);
    } catch (err: any) {
      const { items, ts } = await loadFromCache();
      if (items.length > 0) {
        setAllSchedules(items);
        setVisibleCount(INITIAL_BATCH);
        setLastSyncedAt(ts);
      } else if (err?.message?.includes("404")) {
        setAllSchedules([]);
        setVisibleCount(INITIAL_BATCH);
        setErrorMsg(null);
      } else {
        setErrorMsg(err?.message || "Failed to load schedules.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      isFetchingRef.current = false;
    }
  }, [propertyId, refreshing, online, loadFromCache, saveToCache]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules, propertyId]);

  useFocusEffect(
    useCallback(() => {
      fetchSchedules();
      return () => {};
    }, [fetchSchedules])
  );

  const onRefresh = useCallback(() => {
    if (!online) {
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    fetchSchedules();
  }, [fetchSchedules, online]);

  const searched = useSmartSearch<Schedule>({
    data: allSchedules,
    query: searchQuery,
    keys: ["phasename"],
  });

  const filtered = useMemo(() => {
    if (selectedFilter === "all") return searched;
    return searched.filter((s) => (s.status || "").toLowerCase() === selectedFilter);
  }, [searched, selectedFilter]);

  const finalSchedules = useMemo(() => {
    const idx = (st: string) =>
      ORDERED_STATUSES.indexOf((st || "").toLowerCase() as Status);
    return [...filtered].sort((a, b) => {
      const ai = idx(a.status);
      const bi = idx(b.status);
      if (ai !== bi) return ai - bi;
      return a.phasename.localeCompare(b.phasename);
    });
  }, [filtered]);

  const counters = useMemo(() => {
    const counts: Record<"all" | Status, number> = {
      all: searched.length,
      pending: 0,
      "on hold": 0,
      "in progress": 0,
      completed: 0,
    };
    for (const s of searched) {
      const k = (s.status || "").toLowerCase() as Status;
      if (counts[k] != null) counts[k] += 1;
    }
    return counts;
  }, [searched]);

  const modalOptions = useMemo(
    () => [
      { key: "all", label: `All (${counters.all})` },
      { key: "pending", label: `Pending (${counters.pending})` },
      { key: "on hold", label: `On Hold (${counters["on hold"]})` },
      { key: "in progress", label: `In Progress (${counters["in progress"]})` },
      { key: "completed", label: `Completed (${counters.completed})` },
    ],
    [counters]
  );

  const dataToRender = useMemo(
    () => finalSchedules.slice(0, visibleCount),
    [finalSchedules, visibleCount]
  );

  // Build lock state from all schedules (for dependency-based locks)
  const lockState = useMemo(() => buildScheduleLockState(allSchedules), [allSchedules]);

  // Build a Map for O(1) schedule lookup by scheduleid
  const scheduleMap = useMemo(() => {
    const map = new Map<number, Schedule>();
    allSchedules.forEach((s) => map.set(s.scheduleid, s));
    return map;
  }, [allSchedules]);

  const handleEndReached = useCallback(() => {
    if (visibleCount < finalSchedules.length) {
      setVisibleCount((c) => Math.min(c + LOAD_MORE_BATCH, finalSchedules.length));
    }
  }, [visibleCount, finalSchedules.length]);

  // ---- UI mapping ----
  const statusLabel = (status: string) => {
    const s = (status || "").trim().toLowerCase();
    if (s === "pending") return "PENDING";
    if (s === "on hold") return "ON HOLD";
    if (s === "in progress") return "IN PROGRESS";
    if (s === "completed") return "COMPLETED";
    return (status || "").toUpperCase();
  };

  const formatDate = (d?: string) => {
    if (!d) return "";
    const date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatRange = (start?: string, end?: string) => {
    const a = formatDate(start);
    const b = formatDate(end);
    if (!a && !b) return "-";
    if (a && !b) return a;
    if (!a && b) return b;
    return `${a} – ${b}`;
  };

  const renderItem = ({ item }: { item: Schedule }) => {
    const pill = statusColors(item.status);
    const scheduledToday = isScheduledToday(item);
    const normalizedItemStatus = normalizeStatus(item.status);
    const showUpdateDot =
      !item.has_update_today && normalizedItemStatus === "in progress";

    // Check if this task is locked because a parent/ancestor is on hold
    const isLocked = lockState.lockedIds.has(item.scheduleid);

    // Walk the full ancestor tree to find the on-hold node that is blocking
    const blockingAncestor = isLocked
      ? findBlockingAncestor(scheduleMap, lockState.onHoldIds, item)
      : undefined;
    const lockingParentName = blockingAncestor?.phasename ?? "";

    return (
      <TouchableOpacity
        key={item.scheduleid}
        style={[styles.card, scheduledToday && styles.todayCard]}
        activeOpacity={0.9}
        onPress={() => {
          router.push({
            pathname: "/TaskManagementForm",
            params: toPropertyRouteParams(
              {
                propertyId: routeContext.propertyId || propertyId,
                projectId: routeContext.projectId || projectId,
                propertyName: routeContext.propertyName,
                projectLocation: routeContext.projectLocation,
                userDetails: user,
              },
              {
              schedule: JSON.stringify(item),
              first_name: firstName,
              last_name: lastName,
              employee_code: user?.employee_code,
              employee_email: "",
              isLocked: blockingAncestor ? "true" : "false",
              lockingParentName: lockingParentName,
              }
            ),
          });
        }}
      >
        <View style={styles.cardTopRow}>
          <View style={styles.titleWrap}>
            <TText numberOfLines={1} style={styles.cardTitle}>
              {item.phasename || "Untitled Phase"}
            </TText>
            {showUpdateDot ? <View style={[styles.todayDot, { backgroundColor: C.danger }]} /> : null}
            {scheduledToday ? (
              <View style={styles.todayBadge}>
                <TText style={styles.todayBadgeText}>Today</TText>
              </View>
            ) : null}
          </View>

          <View style={[styles.statusPill, { backgroundColor: pill.bg, borderColor: pill.border }]}>
            <TText style={[styles.statusPillText, { color: pill.text }]}>
              {statusLabel(item.status)}
            </TText>
          </View>
        </View>

        <View style={styles.dateRow}>
          <Ionicons name="calendar-outline" size={16} color={C.subtleText} />
          <TText style={styles.dateText}>
            {formatRange(item.startdate, item.enddate)}
          </TText>
        </View>
      </TouchableOpacity>
    );
  };

  const ListHeader = (
    <View style={styles.headerWrap}>
      {!online && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color={C.danger} />
          <TText style={styles.offlineText}>You're offline</TText>
          {lastSyncedAt ? (
            <TText style={styles.offlineSub}>
              Last synced: {new Date(lastSyncedAt).toLocaleString()}
            </TText>
          ) : (
            <TText style={styles.offlineSub}>No cache found</TText>
          )}
        </View>
      )}

      <View style={styles.searchFilterRow}>
        {/* 90% Search */}
        <View style={styles.searchWrap}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={C.subtleText} />
            <TextInput
              value={searchQuery}
              onChangeText={(t) => {
                setSearchQuery(t);
                setVisibleCount(INITIAL_BATCH);
              }}
              placeholder="Search…"
              placeholderTextColor={C.subtleText}
              style={styles.searchInput}
              autoCorrect={false}
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity
                onPress={() => {
                  setSearchQuery("");
                  setVisibleCount(INITIAL_BATCH);
                }}
                accessibilityLabel="Clear search"
                style={styles.iconBtn}
              >
                <Ionicons name="close-circle" size={18} color={C.subtleText} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* 10% Filter */}
        <View style={styles.filterWrap}>
          <ModalSelector
            data={modalOptions}
            initValue="Filter by Status"
            onChange={(opt: any) => {
              setSelectedFilter(opt.key as FilterValue);
              setVisibleCount(INITIAL_BATCH);
            }}
            optionTextStyle={styles.modalOptionText}
            optionContainerStyle={styles.modalOptionContainer}
            initValueTextStyle={styles.modalInitText}
            cancelText="Cancel"
          >
            <TouchableOpacity
              style={[
                styles.iconBtn,
                selectedFilter !== "all" && styles.iconBtnActive,
              ]}
              activeOpacity={0.85}
              accessibilityLabel="Open status filter"
            >
              <Ionicons
                name="options-outline"
                size={18}
                color={selectedFilter !== "all" ? C.text : C.subtleText}
              />
            </TouchableOpacity>
          </ModalSelector>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={C.primaryStrong} />
          <TText style={styles.loadingText}>Loading schedules…</TText>
        </View>
      </SafeAreaView>
    );
  }

  if (errorMsg) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorWrap}>
          <Ionicons name="alert-circle" size={22} color={C.danger} />
          <TText style={styles.errorText}>{errorMsg}</TText>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchSchedules}>
            <Ionicons name="refresh" size={16} color="#fff" />
            <TText style={styles.retryText}>Retry</TText>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="view-schedules-form-root">
      {dataToRender.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="sparkles-outline" size={20} color="#64748B" />
          <TText style={styles.emptyTitle}>
            {allSchedules.length === 0
              ? "No schedules present"
              : "No schedules match your filters"}
          </TText>
          <TText style={styles.emptySub}>
            {allSchedules.length === 0
              ? "There are no schedules available for this property yet."
              : "Try clearing the search or switching status."}
          </TText>
          {allSchedules.length > 0 ? (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() => {
                setSearchQuery("");
                setSelectedFilter("all");
                setVisibleCount(INITIAL_BATCH);
              }}
            >
              <TText style={styles.clearBtnText}>Clear Filters</TText>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={dataToRender}
          keyExtractor={(item: any) => String(item.scheduleid)}
          renderItem={renderItem}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={styles.listContent}
          onEndReachedThreshold={0.2}
          onEndReached={handleEndReached}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              enabled={online}
              tintColor={C.primaryStrong}
              colors={[C.primaryStrong]}
            />
          }
          ListFooterComponent={
            visibleCount < finalSchedules.length ? (
              <View style={styles.footerLoadMore}>
                <ActivityIndicator size="small" />
                <TText style={styles.footerText}>Loading more…</TText>
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
};

const createStyles = (C: any) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  headerWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
  },

  offlineBanner: {
    backgroundColor: C.dangerSoft,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginTop: 4,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  offlineText: { color: C.text, fontWeight: "900", fontSize: 13 },
  offlineSub: {
    color: C.mutedText,
    fontWeight: "700",
    fontSize: 11,
    marginLeft: "auto",
  },

  searchFilterRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  searchWrap: {
    width: "90%",
  },

  filterWrap: {
    width: "10%",
    alignItems: "flex-end",
  },

  searchBar: {
    backgroundColor: C.surface,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 0,
    height: 44,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    height: 38,
    color: C.text,
    paddingVertical: 0,
    fontWeight: "700",
    fontSize: 13,
    includeFontPadding: false,
    textAlignVertical: "center",
  },

  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  iconBtnActive: {
    backgroundColor: C.primarySoft,
    borderColor: C.primaryStrong,
  },

  modalOptionText: { fontSize: 14, color: C.text, fontWeight: "700" },
  modalOptionContainer: { paddingVertical: 10, backgroundColor: C.surface },
  modalInitText: { color: C.mutedText, fontWeight: "700" },

  listContent: { paddingHorizontal: 16, paddingBottom: 28 },

  card: {
    backgroundColor: C.surface,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginTop: 5,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  todayCard: {
    borderColor: "#FDE68A",
    borderWidth: 2,
    shadowColor: "#FBBF24",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },

  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  titleWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  cardTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: C.text,
    flexShrink: 1,
  },

  todayDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#22C55E",
  },
  todayBadge: {
    borderRadius: 999,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  todayBadgeText: {
    color: "#92400E",
    fontSize: 9,
    fontWeight: "900",
  },

  statusPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 80,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.6,
  },

  dateRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dateText: {
    color: C.mutedText,
    fontWeight: "800",
    fontSize: 13,
  },

  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingText: { color: C.mutedText, fontWeight: "700" },

  errorWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 20,
  },
  errorText: { color: C.danger, textAlign: "center", fontWeight: "700" },
  retryBtn: {
    marginTop: 8,
    flexDirection: "row",
    gap: 6,
    backgroundColor: C.primaryStrong,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  retryText: { color: "#fff", fontWeight: "900" },

  footerLoadMore: { paddingVertical: 16, alignItems: "center", gap: 8 },
  footerText: { color: C.mutedText, fontWeight: "700" },

  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: "900", color: C.text },
  emptySub: { color: C.mutedText, textAlign: "center", fontWeight: "700" },
  clearBtn: {
    marginTop: 8,
    backgroundColor: C.primaryStrong,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  clearBtnText: { color: "#fff", fontWeight: "900" },
});

export default ViewSchedulesForm;
