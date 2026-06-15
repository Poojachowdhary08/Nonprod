import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
// Offline-first + flexible date search + refined UI & alignment
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Platform,
  UIManager,
  TextInput,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFontScale } from "@/context/FontScaleContext";
import AppFooterNav, { FooterNavItem } from "./AppFooterNav";
import { Alert } from "react-native";
import { encodeRouteUserDetails, parseRouteUserDetails } from "../utils/propertyRouteContext";
import TText from "@/components/TText";
import { useTheme } from "@/src/theme/ThemeProvider";
import { authenticatedFetch } from "../utils/auth";


if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* ---------------------- Types ---------------------- */
type Entry = {
  id: number;
  date: string;
  created_at: string;
  project_id: string;
  property_id: string;
  work_duration_type: "daily" | "hourly" | null;
  day_type: "full" | "half" | "" | null;
  hours_worked: number;
  work_completed_sqft: number;
  work_completed_cubic_meter: number;
  unit_type?: string | null;
  remarks: string | null;
  entry_type: string | null;
  contractor_type: string | null;
  num_workers: number;
  skilled_count: number;
  unskilled_count: number;
  created_by_engineer_id: string | null;
  created_by_engineer_name?: string | null;
  phase_name?: string | null; // ✅ new
  has_payment?: boolean | null;
};

type ApiResp = {
  property: { id: string; name: string };
  worker: {
    type: "labour" | "contractor";
    id: string | number;
    name: string;
    phone?: string;
    work_type?: string | null;
    payment_type?: string | null;
  };
  filters: { start_date: string | null; end_date: string | null };
  pagination?: { page: number; page_size: number; total: number; pages: number };
  sort?: { by: string; dir: "asc" | "desc" };
  entries: Entry[];
};
const footerItems: FooterNavItem[] = [
  { id: 0, title: "Back", iconName: "arrow-back-outline" },
  { id: 2, title: "Schedules", iconName: "calendar-outline" },
  { id: 3, title: "Inventory", iconName: "list-outline" },
  { id: 4, title: "Labour", iconName: "people-outline" },
  { id: 5, title: "Documents", iconName: "document-text-outline" },
  { id: 7, title: "Review", iconName: "construct-outline" },
];
const COLORS = {
  border: "#E6EAF2",
  accent: "#2C7BE5",
  accentSoft: "#E8F1FF",
  muted: "#6B7A90",
  disabledText: "#9AA0A6",
};

type DurationFilter = "all" | "daily" | "hourly";

/* ---------------------- Cache helpers ---------------------- */
type CachedEntries = { ts: number; data: ApiResp | null; entries: Entry[] };
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const norm = (s: string) => String(s || "").trim().toLowerCase();
const cacheKey = (propertyId: string, workerType: string, workerId: string) =>
  `cache:workers:entries:v1:${norm(propertyId)}:${norm(workerType)}:${norm(workerId)}`;

async function saveCache(key: string, payload: CachedEntries) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(payload));
  } catch {}
}
async function loadCache(key: string): Promise<CachedEntries | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed: CachedEntries = JSON.parse(raw);
    if (!parsed?.ts) return null;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

/* ---------------------- Utils ---------------------- */
const toDDMMYYYY = (input: string) => {
  const d = new Date(input);
  if (isNaN(d.getTime())) return input;
  const dd = `${d.getDate()}`.padStart(2, "0");
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const parseUTCDateInput = (input: string) => {
  const raw = String(input || "").trim();
  if (!raw) return null;

  const customFormatMatch = raw.match(
    /^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm]))?$/
  );
  if (customFormatMatch) {
    const [, dd, mm, yyyy, hh = "0", min = "0", ss = "0", meridiem] = customFormatMatch;
    let hours = Number(hh);
    if (meridiem) {
      const period = meridiem.toUpperCase();
      if (period === "PM" && hours < 12) hours += 12;
      if (period === "AM" && hours === 12) hours = 0;
    }
    return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), hours, Number(min), Number(ss)));
  }

  const isoNoTimezoneMatch = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/
  );
  if (isoNoTimezoneMatch) {
    const [, yyyy, mm, dd, hh, min, ss = "0"] = isoNoTimezoneMatch;
    return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss)));
  }

  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
};

const formatUTCToISTDateTime = (input: string) => {
  const d = parseUTCDateInput(input);
  if (!d) return input;

  const istDate = new Date(d.getTime() + (5 * 60 + 30) * 60 * 1000);
  const dd = `${istDate.getUTCDate()}`.padStart(2, "0");
  const mm = `${istDate.getUTCMonth() + 1}`.padStart(2, "0");
  const yyyy = istDate.getUTCFullYear();
  const hours24 = istDate.getUTCHours();
  const minutes = `${istDate.getUTCMinutes()}`.padStart(2, "0");
  const ampm = hours24 >= 12 ? "PM" : "AM";
  const hours12 = `${hours24 % 12 || 12}`.padStart(2, "0");

  return `${dd}-${mm}-${yyyy} ${hours12}:${minutes}${ampm}`;
};

const upper = (s?: string | null) => (s ? String(s).toUpperCase() : "");
const truthy = (v: any) => v !== null && v !== undefined && String(v).trim() !== "";

// normalize entry types: regular / customer_add_on / avenue_add_on / fallback
const normalizeEntryType = (t?: string | null) => {
  if (!t) return "";
  const raw = t.toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (raw === "regular") return "Regular";
  if (raw === "customer_add_on") return "Customer Add-On";
  if (raw === "avenue_add_on") return "Avenue Add-On";
  return t
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
};

/* -------- Flexible date search parsing (DD/MM preferred) -------- */
type ParsedQueryDate = { dd?: number; mm?: number; yy?: number; yyyy?: number };

function parseFlexibleDateQuery(q: string): ParsedQueryDate | null {
  if (!q || !q.trim()) return null;
  const raw = q.trim().toLowerCase();
  const parts = raw.split(/[^0-9]+/).filter(Boolean);
  const digits = raw.replace(/[^0-9]/g, "");

  const n = (s?: string) => (s ? Number(s) : NaN);
  const inRange = (x: number, a: number, b: number) => x >= a && x <= b;

  if (parts.length === 1) {
    const v = n(parts[0]);
    if (inRange(v, 1, 12)) return { mm: v };
    if (inRange(v, 1, 31)) return { dd: v };
    return null;
  }

  if (parts.length >= 2) {
    const a = n(parts[0]),
      b = n(parts[1]),
      c = parts[2] ? n(parts[2]) : NaN;
    const out: ParsedQueryDate = {};
    if (inRange(a, 1, 31) && inRange(b, 1, 12)) {
      out.dd = a;
      out.mm = b;
    } else if (inRange(a, 1, 12) && inRange(b, 1, 31)) {
      out.mm = a;
      out.dd = b;
    }
    if (!Number.isNaN(c)) out.yyyy = c < 100 ? undefined : c;
    return Object.keys(out).length ? out : null;
  }

  if (digits.length === 4) {
    const a = Number(digits.slice(0, 2)),
      b = Number(digits.slice(2));
    const out: ParsedQueryDate = {};
    if (inRange(a, 1, 31) && inRange(b, 1, 12)) {
      out.dd = a;
      out.mm = b;
      return out;
    }
    if (inRange(a, 1, 12) && inRange(b, 1, 31)) {
      out.mm = a;
      out.dd = b;
      return out;
    }
  }

  if (digits.length === 6 || digits.length === 8) {
    const a = Number(digits.slice(0, 2));
    const b = Number(digits.slice(2, 4));
    const y = Number(digits.slice(4));
    const out: ParsedQueryDate = {};
    if (inRange(a, 1, 31) && inRange(b, 1, 12)) {
      out.dd = a;
      out.mm = b;
    } else if (inRange(a, 1, 12) && inRange(b, 1, 31)) {
      out.mm = a;
      out.dd = b;
    }
    if (y >= 1900 && y <= 2100) out.yyyy = y;
    return Object.keys(out).length ? out : null;
  }

  return null;
}

function datePartsFromISO(dstr: string) {
  const d = new Date(dstr);
  if (isNaN(d.getTime())) return null;
  const dd = d.getDate();
  const mm = d.getMonth() + 1;
  const yyyy = d.getFullYear();
  const yy = yyyy % 100;
  return { dd, mm, yyyy, yy };
}

function entryMatchesDateQuery(e: Entry, q: string): boolean {
  const parsed = parseFlexibleDateQuery(q);
  if (!parsed) return false;
  const p = datePartsFromISO(e.date);
  if (!p) return false;

  if (parsed.dd != null && parsed.mm != null) {
    if (p.dd !== parsed.dd || p.mm !== parsed.mm) return false;
  } else if (parsed.dd != null) {
    if (p.dd !== parsed.dd && p.mm !== parsed.dd) return false;
  } else if (parsed.mm != null) {
    if (p.mm !== parsed.mm && p.dd !== parsed.mm) return false;
  }
  if (parsed.yyyy != null && p.yyyy !== parsed.yyyy) return false;
  return true;
}

/* ---------------------- Component ---------------------- */
const WorkerEntriesScreen: React.FC = () => {
  const router = useRouter();
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  const params = useLocalSearchParams();
  const { propertyId: propertyIdRaw, workerType: workerTypeRaw, workerId: workerIdRaw, workerName: workerNameRaw } =
    params;

  const propertyId = useMemo(() => (propertyIdRaw ? String(propertyIdRaw) : ""), [propertyIdRaw]);
  const workerType = useMemo(() => (workerTypeRaw ? String(workerTypeRaw) : ""), [workerTypeRaw]);
  const workerId = useMemo(() => (workerIdRaw ? String(workerIdRaw) : ""), [workerIdRaw]);
  const workerName = useMemo(() => (workerNameRaw ? String(workerNameRaw) : ""), [workerNameRaw]);

  const paramsMeta: ApiResp = useMemo(
    () => ({
      property: { id: propertyId, name: "" },
      worker: {
        type: norm(workerType) === "labour" ? "labour" : "contractor",
        id: workerId,
        name: workerName || "",
      },
      filters: { start_date: null, end_date: null },
      entries: [],
    }),
    [propertyId, workerType, workerId, workerName]
  );

  const baseUrl = useMemo(() => {
    if (!propertyId || !workerType || !workerId) return "";
    return `${APP_API_BASE_URL}/property/${encodeURIComponent(propertyId)}/workers/${encodeURIComponent(
      workerType
    )}/${encodeURIComponent(workerId)}/entries`;
  }, [propertyId, workerType, workerId]);

  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResp | null>(null);
  const [entriesRaw, setEntriesRaw] = useState<Entry[]>([]);
  const [filter, setFilter] = useState<DurationFilter>("all");
  const [searchDraft, setSearchDraft] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  const metaRef = useRef<ApiResp>(paramsMeta);
  const key = useMemo(() => cacheKey(propertyId, workerType, workerId), [propertyId, workerType, workerId]);
  const reconnectRefreshGuard = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const fetchedOnceRef = useRef(false);

  // pagination
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  // connectivity
  useEffect(() => {
    NetInfo.fetch().then((state) => {
      const connected = !!state.isConnected && (state.isInternetReachable ?? true);
      setIsConnected(connected);
    });
    const sub = NetInfo.addEventListener((state: NetInfoState) => {
      const connected = !!state.isConnected && (state.isInternetReachable ?? true);
      setIsConnected(connected);
      if (connected && fetchedOnceRef.current && !reconnectRefreshGuard.current) {
        reconnectRefreshGuard.current = true;
        setTimeout(async () => {
          await onRefresh();
          reconnectRefreshGuard.current = false;
        }, 300);
      }
    });
    return () => sub();
  }, []);

  // ✅ Carry-forward context (for footer navigation back to PropertiesListScreen)
  const projectId = useMemo(
    () => String((params as any)?.projectId ?? (params as any)?.project_id ?? ""),
    [params]
  );
  const propertyName = useMemo(
    () => String((params as any)?.propertyName ?? (params as any)?.property_name ?? ""),
    [params]
  );
  const projectLocation = useMemo(
    () =>
      String(
        (params as any)?.projectLocation ??
          (params as any)?.project_location ??
          ""
      ),
    [params]
  );
  const userDetails = useMemo(
    () => parseRouteUserDetails((params as any)?.userDetails ?? (params as any)?.user_details ?? ""),
    [params]
  );

// Footer selected section (only for highlighting which tab is active)
const [selectedSection, setSelectedSection] = useState<number>(2);

// Treat your existing connectivity as "online"
const online = isConnected !== false;

// Your offline disable rule (keep same as properties screen if you want)
const isDisabledOffline = (id: number) => !online && (id === 5 || id === 7);

// Footer click handler
const onFooterSelect = (item: FooterNavItem) => {
  if (item.id === 0) {
    router.back();
    return;
  }

  if (isDisabledOffline(item.id)) {
    Alert.alert("Offline", "This section is unavailable offline.");
    return;
  }

  setSelectedSection(item.id);

  // Always go to PropertiesListScreen, but tell it which section to open
  router.push({
    pathname: "/PropertiesListScreen",
    params: {
      propertyId,
      selectedSection: String(item.id), // 👈 IMPORTANT
      // optional: if you have these available, pass them too
      projectId,
      propertyName,
      projectLocation,
      userDetails: JSON.stringify(userDetails),
    },
  } as any);
};


  const onChangeSearch = (val: string) => {
    setSearchDraft(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setSearch(val), 220);
  };
  const clearSearch = () => {
    setSearchDraft("");
    setSearch("");
  };

  const buildUrl = useCallback(
    (pageNum?: number) => {
      if (!baseUrl) return "";
      const qs: string[] = [];
      if (pageNum && pageNum > 1) qs.push(`page=${pageNum}`);
      return qs.length ? `${baseUrl}?${qs.join("&")}` : baseUrl;
    },
    [baseUrl]
  );

  const hydrateFromCache = useCallback(async () => {
    const cached = await loadCache(key);
    if (!cached) return false;
    const meta = cached.data ?? paramsMeta;
    const safeMeta: ApiResp = {
      ...paramsMeta,
      ...(meta || {}),
      worker: meta?.worker ?? paramsMeta.worker,
      property: meta?.property ?? paramsMeta.property,
    };
    setData(safeMeta);
    metaRef.current = safeMeta;
    setEntriesRaw(cached.entries || []);
    setHasMore(false);
    setPage(1);
    setError(null);
    return true;
  }, [key, paramsMeta]);

  const loadPage = useCallback(
    async (pageNum: number, mode: "refresh" | "append" | "init" = "init") => {
      const url = buildUrl(pageNum);
      if (!url) {
        setError("Missing route params.");
        setLoading(false);
        return;
      }
      if (isConnected === false) {
        await hydrateFromCache();
        if (mode === "init") setLoading(false);
        return;
      }
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        if (mode !== "append") {
          setError(null);
          if (mode === "init") setLoading(true);
        }

        const res = await authenticatedFetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: ApiResp = await res.json();

        setData((prev) => {
          const merged: ApiResp = {
            ...paramsMeta,
            ...(json || {}),
            worker: json?.worker ?? prev?.worker ?? paramsMeta.worker,
            property: json?.property ?? prev?.property ?? paramsMeta.property,
          };
          metaRef.current = merged;
          return merged;
        });

        if (mode === "append") {
          setEntriesRaw((prev) => {
            const merged = [...prev, ...(json.entries || [])];
            saveCache(key, { ts: Date.now(), data: metaRef.current, entries: merged });
            return merged;
          });
        } else {
          const next = json.entries || [];
          setEntriesRaw(next);
          saveCache(key, { ts: Date.now(), data: metaRef.current, entries: next });
        }

        const p = json.pagination;
        if (p && p.pages && p.page) {
          setHasMore(p.page < p.pages);
          setPage(p.page);
        } else {
          setHasMore(false);
          setPage(1);
        }
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        const cachedOk = await hydrateFromCache();
        if (!cachedOk) setError(e?.message || "Failed to load entries");
        else setError(null);
      } finally {
        if (mode === "init") setLoading(false);
        fetchedOnceRef.current = true;
      }
    },
    [buildUrl, isConnected, hydrateFromCache, key, paramsMeta]
  );

  // initial load
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      await hydrateFromCache();
      if (!mounted) return;
      setPage(1);
      await loadPage(1, "init");
    })();
    return () => {
      mounted = false;
      if (abortRef.current) abortRef.current.abort();
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [key, loadPage, hydrateFromCache]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      setPage(1);
      await loadPage(1, "refresh");
    } finally {
      setRefreshing(false);
    }
  };

  const onLoadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      await loadPage(page + 1, "append");
    } finally {
      setLoadingMore(false);
    }
  };

  // derived header
  const effectiveWorker = data?.worker ?? paramsMeta.worker;
  const EmployeeName = effectiveWorker?.name || workerName || "Worker Details";

  const openEntryDetails = (entry: Entry) => {
    router.push({
      pathname: "/WorkerEntryDetailsScreen",
      params: {
        entry: JSON.stringify(entry),
        propertyId,
        projectId: entry.project_id || projectId,
        workerType,
        workerId,
        workerName: EmployeeName,
        userDetails: encodeRouteUserDetails(userDetails || {}),
      },
    } as any);
  };

  // client transforms
  const entries = useMemo(() => {
    let list = entriesRaw.slice();
    if (filter !== "all") list = list.filter((e) => e.work_duration_type === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((e) => {
        const dateHit = entryMatchesDateQuery(e, q);
        const inRemarks = (e.remarks || "").toLowerCase().includes(q);
        const inEngineer =
          (e.created_by_engineer_name || "").toLowerCase().includes(q) ||
          (e.created_by_engineer_id || "").toLowerCase().includes(q);
        return dateHit || inRemarks || inEngineer;
      });
    }
    list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return list;
  }, [entriesRaw, filter, search]);

  // states
  if (loading && entriesRaw.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <TText style={styles.muted}>Loading entries…</TText>
      </View>
    );
  }
  if (error && entriesRaw.length === 0) {
    return (
      <View style={styles.center}>
        <MaterialIcons name="error-outline" size={22} color={C.danger} />
        <TText style={[styles.muted, { marginTop: 6 }]}>{error}</TText>
        <TouchableOpacity onPress={() => loadPage(1, "init")} style={styles.retryBtn}>
          <TText style={styles.retryTxt}>Retry</TText>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="worker-entries-screen-root">
      {/* Header */}
      <View style={styles.headerContainer}>
        <View style={styles.headerSide}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerIconBtn}>
            <Ionicons name="arrow-back" size={22} color={C.text} />
          </TouchableOpacity>
        </View>

        <TText style={styles.headerTitle} numberOfLines={1}>
          Worker Entries
        </TText>

        <View style={styles.headerSide}>
          <TouchableOpacity onPress={() => router.push("/HomeScreen")} style={styles.headerIconBtn}>
            <Ionicons name="home" size={22} color={C.text} />
          </TouchableOpacity>
        </View>
      </View>

      {isConnected === false && (
        <View style={styles.offlineBanner}>
          <TText style={styles.offlineTxt}>You’re offline. Showing cached entries.</TText>
        </View>
      )}

      {/* Top controls */}
      <View style={styles.topControlsWrapper}>
        <TText style={styles.employeeTitle} numberOfLines={1}>
          {EmployeeName}
        </TText>

        {/* Search pill like screenshot */}
        <View style={styles.searchPill}>
          <Ionicons name="search" size={18} color={C.subtleText} style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Search date, remarks, or engineer…"
            placeholderTextColor={C.subtleText}
            value={searchDraft}
            onChangeText={onChangeSearch}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {searchDraft.length > 0 && (
            <TouchableOpacity onPress={clearSearch} style={styles.clearBtn}>
              <Ionicons name="close" size={18} color={C.mutedText} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.toolsRow}>
          <Segmented
            options={[
              { key: "all", label: "ALL" },
              { key: "daily", label: "DAILY" },
              { key: "hourly", label: "HOURLY" },
            ]}
            value={filter}
            onChange={(v) => setFilter(v as DurationFilter)}
          />
        </View>
      </View>

      {/* List */}
      <FlatList
        data={entries}
        keyExtractor={(it) => String(it.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Platform.OS === "ios" ? C.primaryStrong : undefined} colors={Platform.OS === "android" ? [C.primaryStrong] : undefined} />}
        ListEmptyComponent={
          <View style={[styles.center, { paddingTop: 24 }]}>
            <TText style={styles.muted}>No entries.</TText>
          </View>
        }
        renderItem={({ item }) => <EntryCard e={item} onPress={() => openEntryDetails(item)} />}
        onEndReachedThreshold={0.4}
        onEndReached={isConnected ? onLoadMore : undefined}
        ListFooterComponent={
          hasMore ? (
            <View style={{ paddingVertical: 16, alignItems: "center" }}>
              {loadingMore ? (
                <ActivityIndicator />
              ) : (
                <TouchableOpacity style={styles.loadMoreBtn} onPress={onLoadMore}>
                  <TText style={styles.loadMoreTxt}>Load more</TText>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={{ height: 12 }} />
          )
        }
        contentContainerStyle={{ paddingBottom: 24, paddingTop: 8 }}
      />
      <AppFooterNav
  items={footerItems}
  selectedSection={selectedSection}
  online={online}
  isDisabledOffline={isDisabledOffline}
  onSelect={onFooterSelect}
  colors={{
    border: C.border,
    accent: C.primaryStrong,
    accentSoft: C.primarySoft,
    muted: C.mutedText,
    disabledText: C.subtleText,
  }}
/>

    </View>
  );
};

/* ---------------------- Card ---------------------- */
const EntryCard: React.FC<{ e: Entry; onPress: () => void }> = ({ e, onPress }) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  const isDaily = e.work_duration_type === "daily";
  const durationLabel = upper(e.work_duration_type || "");
  const dayTypeLabel = upper(e.day_type || "");
  const engineerLabel =
    (e.created_by_engineer_name && e.created_by_engineer_name.trim()) ||
    "—";

  // chip stack
  const chips: string[] = [];
  chips.push(`Workers ${e.num_workers}`);
  if ((e.skilled_count ?? 0) > 0 || (e.unskilled_count ?? 0) > 0) {
    chips.push(`S ${e.skilled_count} / U ${e.unskilled_count}`);
  }
  if (truthy(e.entry_type)) chips.push(normalizeEntryType(e.entry_type));
  if (truthy(e.contractor_type)) chips.push(String(e.contractor_type));
  if (e.has_payment === false) chips.push("Editable");

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.88} onPress={onPress}>
      <View style={styles.cardBody}>
        {/* Top row */}
        <View style={styles.rowBetween}>
          <View style={styles.rowLeft}>
            <View style={styles.iconBox}>
              <Ionicons name={isDaily ? "calendar" : "time"} size={14} color={C.text} />
            </View>
            <TText style={styles.dateTxt} numberOfLines={1} ellipsizeMode="tail">
              {toDDMMYYYY(e.date)}
            </TText>
          </View>

          <View style={styles.rightMeta}>
            <TText style={styles.durationTxt} numberOfLines={1}>
              {durationLabel}
              {dayTypeLabel ? ` (${dayTypeLabel})` : ""}
            </TText>
          </View>
        </View>

        {/* Chips */}
        <View style={styles.chipsWrap}>
          {truthy(e.phase_name) && (
            <View style={styles.phaseChip}>
              <Ionicons name="layers-outline" size={11} color={C.primaryStrong} style={{ marginRight: 4 }} />
              <TText style={styles.phaseChipTxt} numberOfLines={1} ellipsizeMode="tail">
                {e.phase_name}
              </TText>
            </View>
          )}

          {chips.map((c, idx) => (
            <MiniChip key={`${e.id}_${idx}`} label={c} />
          ))}
           <View style={styles.metaRow}>
          <Ionicons name="person-circle-outline" size={14} color={C.subtleText} />
          <TText style={styles.metaTxt}>{engineerLabel}</TText>
        </View>
        </View>

        {/* Remarks */}
        {truthy(e.remarks) && <TText style={styles.remarks}>“{e.remarks}”</TText>}

        {/* Engineer */}
       
      </View>
    </TouchableOpacity>
  );
};

const MiniChip: React.FC<{ label: string }> = ({ label }) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  return (
    <View style={styles.miniChip}>
      <TText style={styles.miniChipTxt} numberOfLines={1}>
        {label}
      </TText>
    </View>
  );
};

const Segmented: React.FC<{
  options: { key: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}> = ({ options, value, onChange }) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  return (
    <View style={styles.segmented}>
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <TouchableOpacity
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={[styles.segmentBtn, active && styles.segmentActive]}
            activeOpacity={0.9}
          >
            <TText style={[styles.segmentTxt, active && styles.segmentTxtActive]}>{opt.label}</TText>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

/* ---------------------- Styles ---------------------- */
const createStyles = (C: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { alignItems: "center", justifyContent: "center", padding: 24 },
  muted: { color: C.mutedText, marginTop: 8 },

  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: C.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    ...(Platform.OS === "android"
      ? { elevation: 2 }
      : { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }),
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
    color: C.text,
  },
  headerSide: { width: 48, alignItems: "center", justifyContent: "center" },
  headerIconBtn: {
    padding: 8,
    borderRadius: 14,
    backgroundColor: C.surface,
  },

  offlineBanner: {
    backgroundColor: C.successSoft,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  offlineTxt: { color: C.success, fontWeight: "700", textAlign: "center" },

  topControlsWrapper: {
    backgroundColor: C.bg,
    paddingTop: 10,
    paddingBottom: 10,
  },
  employeeTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: C.text,
    paddingHorizontal: 16,
    textAlign: "center",
  },

  // Search pill (screenshot style)
  searchPill: {
    marginTop: 10,
    marginHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 35,
    ...(Platform.OS === "android"
      ? { elevation: 2 }
      : { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }),
  },
  searchInput: { flex: 1, height: 48, fontSize: 11, color: C.text },
  clearBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: C.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },

  toolsRow: { marginTop: 10, marginHorizontal: 16, alignItems: "center" },

  segmented: {
    flexDirection: "row",
    backgroundColor: C.surface,
    borderRadius: 999,
    padding: 4,
    width: "100%",
    ...(Platform.OS === "android"
      ? { elevation: 1 }
      : { shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }),
  },
  segmentBtn: { flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: "center" },
  segmentActive: { backgroundColor: C.primarySoft },
  segmentTxt: { fontSize: 9, color: C.mutedText, fontWeight: "700" },
  segmentTxtActive: { color: C.primaryStrong },

  // Cards
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: C.surface,
    ...(Platform.OS === "android"
      ? { elevation: 2 }
      : { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }),
    overflow: "hidden",
  },
  stripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 5 },
  stripeDaily: { backgroundColor: "#2F6BFF" }, // daily
  stripeHourly: { backgroundColor: "#F59E0B" }, // hourly (warm)

  cardBody: { paddingHorizontal: 14, paddingVertical: 12 },

  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowLeft: { flexDirection: "row", alignItems: "center", minWidth: 0, flexShrink: 1 },

  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    backgroundColor: C.surfaceAlt,
  },

  dateTxt: { fontSize: 11, fontWeight: "700", color: C.text, minWidth: 0, flexShrink: 1 },

  rightMeta: { alignItems: "flex-end" },
  durationTxt: { fontSize: 10, fontWeight: "700", color: C.mutedText },

  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10, alignItems: "center" },

  miniChip: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    maxWidth: "100%",
  },
  miniChipTxt: { fontSize: 10, color: C.text, fontWeight: "700" },

  phaseChip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  phaseChipTxt: {
    fontSize: 10,
    color: C.primaryStrong,
    fontWeight: "700",
    maxWidth: "100%",
  },

  remarks: { color: C.text, marginTop: 10, lineHeight: 18 },

  metaRow: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6 ,marginLeft:50},
  metaTxt: { color: C.subtleText, fontSize: 10, fontWeight: "700" },

  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  retryTxt: { color: C.text, fontWeight: "900" },

  loadMoreBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  loadMoreTxt: { color: C.text, fontWeight: "900" },

});

export default WorkerEntriesScreen;
