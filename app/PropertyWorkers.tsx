import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
// PropertyWorkers.tsx  (offline-first full file)
import React, { useEffect, useMemo, useState, useRef } from "react";
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, LayoutAnimation, UIManager, Platform, TextInput, RefreshControl, Alert } from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import ModalSelector from "@/components/AppModalSelect";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import TText from "@/components/TText";
import { parseRouteUserDetails } from "@/utils/propertyRouteContext";
import { useTheme } from "@/src/theme/ThemeProvider";
import { authenticatedFetch } from "../utils/auth";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export type WorkerItem = {
  type: "labour" | "contractor";
  id: string | number;
  name: string;
  phone: string;
  work_type: string | null;
  payment_type: string | null;
  entries: number;
  total_hours: number;
  total_sqft: number;
  total_cubic_m: number;
  full_days: number;
  half_days: number;
  daily_days: string[];
  hourly_days: string[];
  first_seen_date: string | null;
  last_seen_date: string | null;
  last_entry_at: string | null;
  total_workers_reported: number;
  skilled_sum: number;
  unskilled_sum: number;
  daily_days_count: number;
  hourly_days_count: number;
};

export type WorkersPayload = {
  property_id: string;
  property_name: string;
  date_filter: { start_date: string | null; end_date: string | null };
  total_unique_workers: number;
  total_labours: number;
  total_contractors: number;
  workers: WorkerItem[];
  labours: WorkerItem[];
  contractors: WorkerItem[];
  _debug?: any;
};

interface Props {
  propertyId: string;
  initialData?: WorkersPayload;
  projectId:string;
}

// --------- Offline helpers ----------
type Cached<T> = { ts: number; data: T };
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const cacheKey = (propertyId: string) => `cache:property:${propertyId}:workers:v1`;

async function saveCache<T>(key: string, data: T) {
  try {
    const payload: Cached<T> = { ts: Date.now(), data };
    await AsyncStorage.setItem(key, JSON.stringify(payload));
  } catch {}
}

async function loadCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw) as Cached<T>;
    if (!obj?.ts || !obj?.data) return null;
    if (Date.now() - obj.ts > CACHE_TTL_MS) return null;
    return obj.data;
  } catch {
    return null;
  }
}

const PropertyWorkers: React.FC<Props> = ({ propertyId, initialData }) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  const router = useRouter();

  // ⬇️ Also pull userDetails blob so we can forward engineer code + name
  const {
    projectId,
    selectedEmployeeId: selectedEmployeeIdRaw,
    userDetails: userDetailsRaw,
  } = useLocalSearchParams();

  const userDetails = useMemo(() => {
    return parseRouteUserDetails(userDetailsRaw);
  }, [userDetailsRaw]);

  const selectedEmployeeId = useMemo(
    () =>
      selectedEmployeeIdRaw
        ? String(selectedEmployeeIdRaw)
        : userDetails?.employee_code
        ? String(userDetails.employee_code)
        : "",
    [selectedEmployeeIdRaw, userDetails]
  );

  const [data, setData] = useState<WorkersPayload | null>(initialData ?? null);
  const [loading, setLoading] = useState<boolean>(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "labours" | "contractors">("all");
  const [q, setQ] = useState("");
  const [filterType, setFilterType] = useState<"all" | "labour" | "contractor">("all");

  // Offline-related
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const fetchedOnceRef = useRef(false);

  // ---- watch connectivity & auto-refresh on reconnect
  useEffect(() => {
    const sub = NetInfo.addEventListener((state: NetInfoState) => {
      const connected = !!state.isConnected && (state.isInternetReachable ?? true);
      setIsConnected(connected);
      if (connected && fetchedOnceRef.current) {
        // If we have already loaded once, refresh quietly on reconnect
        refresh(false);
      }
    });
    return () => sub();
  }, []);

  // ---- initial load: try network, then cache
  useEffect(() => {
    if (initialData) {
      // If you passed SSR/prop data, still cache it for offline
      saveCache(cacheKey(propertyId), initialData);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);

      // If offline, try cache first
      const connectedNow = isConnected;
      if (connectedNow === false) {
        const cached = await loadCache<WorkersPayload>(cacheKey(propertyId));
        if (cached && !cancelled) {
          setData(cached);
          setLoading(false);
          fetchedOnceRef.current = true;
          return;
        }
      }

      try {
        const url = `${APP_API_BASE_URL}/property/${encodeURIComponent(propertyId)}/workers`;
        const res = await authenticatedFetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: WorkersPayload = await res.json();
        if (!cancelled) {
          setData(json);
          saveCache(cacheKey(propertyId), json);
        }
      } catch (e: any) {
        // On failure, attempt cache
        const cached = await loadCache<WorkersPayload>(cacheKey(propertyId));
        if (cached && !cancelled) {
          setData(cached);
        } else if (!cancelled) {
          setError(e?.message || "Failed to load workers");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          fetchedOnceRef.current = true;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, initialData]);

  // Manual refresh
  const refresh = async (showSpinner = true) => {
    if (showSpinner) setIsRefreshing(true);
    setError(null);
    try {
      if (!isConnected) {
        // offline: just pull from cache
        const cached = await loadCache<WorkersPayload>(cacheKey(propertyId));
        if (cached) setData(cached);
        else setError("No cached data available offline.");
        return;
      }
      const url = `${APP_API_BASE_URL}/property/${encodeURIComponent(propertyId)}/workers`;
      const res = await authenticatedFetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: WorkersPayload = await res.json();
      setData(json);
      saveCache(cacheKey(propertyId), json);
    } catch (e: any) {
      const cached = await loadCache<WorkersPayload>(cacheKey(propertyId));
      if (cached) setData(cached);
      else setError(e?.message || "Failed to refresh");
    } finally {
      if (showSpinner) setIsRefreshing(false);
    }
  };

  const allWorkers = useMemo<WorkerItem[]>(() => {
    if (!data) return [];
    return data.workers && data.workers.length > 0
      ? data.workers
      : [...(data.labours || []), ...(data.contractors || [])];
  }, [data]);

  const filtered = useMemo(() => {
    const pool =
      tab === "all"
        ? allWorkers
        : tab === "labours"
        ? allWorkers.filter((w) => w.type === "labour")
        : allWorkers.filter((w) => w.type === "contractor");

    const afterType = filterType === "all" ? pool : pool.filter((w) => w.type === filterType);

    if (!q.trim()) return afterType;
    const needle = q.trim().toLowerCase();
    return afterType.filter((w) =>
      `${w.name} ${w.id} ${w.phone} ${w.work_type ?? ""} ${w.payment_type ?? ""}`
        .toLowerCase()
        .includes(needle)
    );
  }, [allWorkers, tab, q, filterType]);

  // ✅ OFFLINE GUARD: do not navigate if offline
  const openEntriesScreen = (w: WorkerItem) => {
    if (!isConnected) {
      Alert.alert("Offline", "You’re offline. Connect to the internet to view worker entries.");
      return;
    }
    const workerId = typeof w.id === "number" ? String(w.id) : w.id;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    router.push({
      pathname: "/WorkerEntriesScreen",
      params: {
        propertyId,
        projectId,
        selectedEmployeeId,
        workerType: w.type,
        workerId,
        workerName: w.name,
      },
    });
  };

  const openLabourForm = (w?: WorkerItem) => {
    const workerId = w ? (typeof w.id === "number" ? String(w.id) : w.id) : "";
    router.push({
      pathname: "/LabourDetailsFormScreen",
      params: {
        projectId,
        propertyId,
        selectedEmployeeId,
        // 🔹 pass userDetails so form can get engineer_code + engineer_name
        userDetails: userDetails ? JSON.stringify(userDetails) : "",
        workerType: w?.type ?? "",
        workerId: workerId ?? "",
        workerName: w?.name ?? "",
        workerPhone: w?.phone ?? "",
        workType: w?.work_type ?? "",
        paymentType: w?.payment_type ?? "",
      },
    });
  };

  const onAddPress = () => openLabourForm(undefined);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.primaryStrong} />
        <TText style={styles.muted}>Loading workers…</TText>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <MaterialIcons name="error-outline" size={20} color={C.danger} />
        <TText style={[styles.muted, { marginTop: 6 }]}>Failed to load: {error}</TText>
        <TouchableOpacity
          onPress={() => refresh()}
          style={[styles.actionBtn, { marginTop: 10, paddingHorizontal: 14 }]}
        >
          <TText style={{ color: C.white, fontWeight: "700" }}>Retry</TText>
        </TouchableOpacity>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <TText>No data.</TText>
        <TouchableOpacity
          onPress={() => refresh()}
          style={[styles.actionBtn, { marginTop: 10, paddingHorizontal: 14 }]}
        >
          <TText style={{ color: C.white, fontWeight: "700" }}>Refresh</TText>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="property-workers-root">
      {/* Offline & cached banners */}
      {isConnected === false && (
        <View style={styles.offlineBanner}>
          <TText style={styles.offlineText}>You’re offline. Showing cached data.</TText>
        </View>
      )}

      {/* Search row */}
      <View style={styles.searchRow}>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search" size={18} color="#64748B" />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search by name / id / phone / type"
            placeholderTextColor={C.subtleText}
            style={styles.searchInput}
            autoCorrect={false}
          />
          {q ? (
            <TouchableOpacity onPress={() => setQ("")} style={{ paddingHorizontal: 2 }}>
              <Ionicons name="close-circle" size={18} color={C.subtleText} />
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity onPress={onAddPress} style={styles.actionBtn} accessibilityLabel="Add">
          <Ionicons name="add" size={18} color={C.white} />
        </TouchableOpacity>

      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        {(["all", "labours", "contractors"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <TText style={[styles.tabTxt, tab === t && styles.tabTxtActive]}>
              {t === "all" ? "All" : t === "labours" ? "Labours" : "Contractors"}
            </TText>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          onPress={() => refresh()}
          style={[styles.refreshBtn]}
          accessibilityLabel="Refresh"
        >
          <Ionicons name="refresh" size={18} color={C.text} />
        </TouchableOpacity>
      </View>

      {/* List */}
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => refresh()} tintColor={C.primaryStrong} />
        }
      >
        {filtered.map((w) => {
          const key = `${w.type}:${w.id}`;
          const isContractor = w.type === "contractor";
          const pillText = isContractor ? "CONTRACTOR" : "LABOUR";

          return (
            <TouchableOpacity
              key={key}
              activeOpacity={isConnected ? 0.9 : 1}
              onPress={() => openEntriesScreen(w)}
              disabled={!isConnected}
              style={[styles.card, !isConnected && { opacity: 0.6 }]}
            >
              <View style={styles.cardHeader}>
                <TText style={styles.title} numberOfLines={1}>
                  {w.name}{" "}
                  <TText style={styles.rowId}>
                    ({isContractor ? `C_${w.id}` : String(w.id)})
                  </TText>
                </TText>
                <View
                  style={[
                    styles.typePill,
                    isContractor ? styles.pillContractor : styles.pillLabour,
                  ]}
                >
                  <TText style={styles.typePillText}>{pillText}</TText>
                </View>
              </View>

              <TText style={styles.subMeta} numberOfLines={1}>
                {w.work_type || "—"} • {w.payment_type || "—"}
              </TText>
            </TouchableOpacity>
          );
        })}

        {filtered.length === 0 && (
          <View style={{ alignItems: "center", paddingVertical: 24 }}>
            <TText style={styles.muted}>No matches.</TText>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const MiniBadge: React.FC<{ label: string }> = ({ label }) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  return (
    <View style={styles.miniBadge}>
      <TText style={styles.miniBadgeTxt}>{label}</TText>
    </View>
  );
};

const createStyles = (C: any) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  muted: { color: C.mutedText },
  offlineBanner: {
    backgroundColor: C.dangerSoft,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  offlineText: { color: C.text, fontWeight: "600", textAlign: "center" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  searchInputWrap: {
    flex: 8,
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 0,
  },
  searchInput: {
    flex: 1,
    height: 36,
    paddingHorizontal: 6,
    paddingVertical: 0,
    color: C.text,
    fontSize: 13,
    fontWeight: "600",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  actionBtn: {
    flex: 1,
    height: 35,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.primaryStrong,
  },
  filterBtn: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  tabsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  tabBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  tabBtnActive: { backgroundColor: C.primarySoft, borderColor: C.primaryStrong },
  tabTxt: { fontSize: 10, color: C.mutedText, fontWeight: "700" },
  tabTxtActive: { color: C.primaryStrong },
  refreshBtn: {
    marginLeft: "auto",
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  card: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  title: { flex: 1, fontSize: 10, fontWeight: "600", color: C.text },
  rowId: { color: C.mutedText, fontWeight: "800" },
  typePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillLabour: { backgroundColor: C.successSoft, borderColor: C.border },
  pillContractor: { backgroundColor: C.primarySoft, borderColor: C.border },
  typePillText: {
    fontWeight: "700",
    fontSize: 9,
    color: C.text,
    letterSpacing: 0.4,
  },
  subMeta: { fontSize: 9, color: C.mutedText, marginBottom: 6 },
  miniBadge: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceAlt,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginRight: 6,
    marginTop: 4,
  },
  miniBadgeTxt: { fontSize: 11, color: C.text, fontWeight: "700" },
  badgesWrap: { flexDirection: "row", flexWrap: "wrap" },
});

export default PropertyWorkers;
