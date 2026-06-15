import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
// PropertyInventory.tsx
import { useSmartSearch } from "../hooks/useSmartSearch"; // adjust the path if needed
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  RefreshControl,
  Modal,
  Platform,
  Alert,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ModalSelector from "@/components/AppModalSelect";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import TText from "@/components/TText";
import { useTheme } from "@/src/theme/ThemeProvider";
import { authenticatedFetch } from "../utils/auth";

interface PropertyInventoryProps {
  propertyId: string;
  projectId: string;
  userDetails: any;
}

type RequestItem = {
  request_id: string;
  item_name: string;
  status: "requested" | "raised" | "issued" | "rejected" | string;
  warehouse?: string;
  requested_quantity?: number | string;
  item_type?: string;
  deli_date?: string;
  created_at?: string;
  phase_name?: string;
  total_requested?: number;
  total_issued?: number;
  total_returned?: number;
  total_used?: number;
  project_name?: string;
  property_name?: string;
  canonical_project_name?: string;
  canonical_property_name?: string;
  engineer_name?: string;
};

const STATUSES: Array<{ key: string; label: string }> = [
  { key: "", label: "ALL" },
  { key: "requested", label: "REQUESTED" },
  { key: "raised", label: "RAISED" },
  { key: "issued", label: "ISSUED" },
  { key: "rejected", label: "REJECTED" },
];

const API_BASE_URL = `${APP_API_BASE_URL}`;
const cacheKeyFor = (propertyId: string) => `invreq:property:${propertyId}`;

const ICON_COLOR = "#94A3B8";
const PRIMARY = "#2563EB";

// ---- Status pill helpers ----
const getStatusPill = (status: string) => {
  const s = String(status || "").toLowerCase().trim();
  switch (s) {
    case "requested":
      return { bg: "#E6F0FF", border: "#C7DCFF", text: "#1D4ED8" };
    case "raised":
      return { bg: "#EEF2F7", border: "#D7DFEA", text: "#334155" };
    case "issued":
      return { bg: "#FFF3EA", border: "#FED7AA", text: "#C2410C" };
    case "rejected":
      return { bg: "#FDEBEC", border: "#FECACA", text: "#991B1B" };
    default:
      return { bg: "#EEF0FF", border: "#D9DDFC", text: "#4338CA" };
  }
};

const SkeletonCard = () => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);

  return (
    <View style={styles.skelCard} testID="inventory-skeleton-card">
      <View style={styles.skelTopRow}>
        <View style={styles.skelLineWide} />
        <View style={styles.skelPill} />
      </View>
      <View style={styles.skelMetaRow}>
        <View style={styles.skelLineShort} />
        <View style={styles.skelSep} />
        <View style={styles.skelLineShort} />
        <View style={styles.skelSep} />
        <View style={styles.skelLineShort} />
      </View>
    </View>
  );
};

// ---- small helpers ----
async function isOnline(): Promise<boolean> {
  const st = await NetInfo.fetch();
  return !!(st.isConnected && st.isInternetReachable !== false);
}

const parseInventoryLocked = (raw: unknown): boolean | null => {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const value = raw.trim().toLowerCase();
    if (value === "true") return true;
    if (value === "false") return false;
  }
  if (typeof raw === "number") {
    if (raw === 1) return true;
    if (raw === 0) return false;
  }
  return null;
};

const PropertyInventory: React.FC<PropertyInventoryProps> = ({ propertyId, userDetails, projectId }) => {
  const router = useRouter();
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);

  // ✅ normalize ids (avoid undefined/null surprises)
  const safeProjectId = String(projectId || "").trim();
  const safePropertyId = String(propertyId || "").trim();

  // Data state
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI & filters
  const [searchText, setSearchText] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [selectedPhase, setSelectedPhase] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);

  // offline state
  const [online, setOnline] = useState<boolean>(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  // Inventory gate
  const [invLocked, setInvLocked] = useState<boolean>(false);
  const [invLockMessage, setInvLockMessage] = useState<string>(
    "Inventory Requests locked 🔒 — add a Labour entry (today or yesterday) to enable."
  );
  const [showGateDialog, setShowGateDialog] = useState(false);

  const statusSelectorRef = useRef<any>(null);
  const phaseSelectorRef = useRef<any>(null);
  const fetchingRef = useRef(false);
  const gateFetchingRef = useRef(false);

  const employeeCode: string = userDetails?.employee_code || "";

  // Connectivity listener
  useEffect(() => {
    const unsub = NetInfo.addEventListener((st) => {
      const on = !!(st.isConnected && st.isInternetReachable !== false);
      setOnline(on);
    });
    (async () => setOnline(await isOnline()))();
    return () => unsub && unsub();
  }, []);

  // Cache helpers
  const loadFromCache = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(cacheKeyFor(safePropertyId));
      if (!raw) return { items: [] as RequestItem[], ts: null as string | null };
      const parsed = JSON.parse(raw) as { items: RequestItem[]; ts?: string };
      return { items: parsed.items || [], ts: parsed.ts || null };
    } catch {
      return { items: [] as RequestItem[], ts: null };
    }
  }, [safePropertyId]);

  const saveToCache = useCallback(async (items: RequestItem[]) => {
    const ts = new Date().toISOString();
    setLastSyncedAt(ts);
    try {
      await AsyncStorage.setItem(cacheKeyFor(safePropertyId), JSON.stringify({ items, ts }));
    } catch {}
  }, [safePropertyId]);

  // Fetch home-summary gate (online only)
  const fetchInventoryGate = useCallback(async () => {
    if (!employeeCode) return invLocked;
    if (!online) return invLocked;
    if (gateFetchingRef.current) return invLocked;

    gateFetchingRef.current = true;
    try {
      const res = await authenticatedFetch(`/employees/${employeeCode}/home-summary`);
      if (!res.ok) throw new Error(`home-summary failed (${res.status})`);
      const data = await res.json();

      const hasTodayLabourEntry = data?.labourEntry?.hasToday === true;
      const hasYesterdayLabourEntry = data?.labourEntry?.hasYesterday === true;
      const hasRecentLabourEntry = hasTodayLabourEntry || hasYesterdayLabourEntry;
      const apiLocked = parseInventoryLocked(data?.inventoryGate?.locked);
      const locked = apiLocked ?? !hasRecentLabourEntry;
      const message =
        String(data?.inventoryGate?.message || "").trim() ||
        (locked
          ? "Inventory Requests locked 🔒 — add a Labour entry (today or yesterday) to enable."
          : "Inventory Requests enabled ✅");

      setInvLocked(locked);
      setInvLockMessage(message);
      return locked;
    } catch {
      // keep last known
      return invLocked;
    } finally {
      gateFetchingRef.current = false;
    }
  }, [employeeCode, online, invLocked]);

  // Fetch requests with offline support
  const fetchRequests = useCallback(async () => {
    if (!safePropertyId || fetchingRef.current) return;
    fetchingRef.current = true;

    setError(null);
    if (!refreshing) setLoading(true);

    try {
      if (!online) {
        const { items, ts } = await loadFromCache();
        setRequests(items);
        setLastSyncedAt(ts);
        if (items.length === 0) setError("no-data");
        return;
      }

      // show cache instantly
      const cached = await loadFromCache();
      if (cached.items.length > 0) {
        setRequests(cached.items);
        setLastSyncedAt(cached.ts);
      }

      const res = await fetch(`${API_BASE_URL}/properties/${safePropertyId}/requests`);
      if (!res.ok) throw new Error(`Server error (${res.status})`);
      const data = await res.json();
      const items: RequestItem[] = (data?.requests || []) as RequestItem[];

      setRequests(items);
      await saveToCache(items);
      if (items.length === 0) setError("no-data");
    } catch (e: any) {
      const { items, ts } = await loadFromCache();
      if (items.length > 0) {
        setRequests(items);
        setLastSyncedAt(ts);
      } else {
        setError(e?.message || "Something went wrong");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      fetchingRef.current = false;
    }
  }, [safePropertyId, online, refreshing, loadFromCache, saveToCache]);

  // Initial + refocus fetch
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchRequests();
      fetchInventoryGate();
    }, [fetchRequests, fetchInventoryGate])
  );

  useEffect(() => {
    setLoading(true);
    fetchRequests();
    fetchInventoryGate();
  }, [fetchRequests, fetchInventoryGate]);

  const onRefresh = useCallback(async () => {
    if (!online) {
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    await Promise.all([fetchRequests(), fetchInventoryGate()]);
  }, [fetchRequests, fetchInventoryGate, online]);

  const handleCardPress = (request: RequestItem) => {
    if (!online) {
      Alert.alert("You're offline", "", [{ text: "OK" }], { cancelable: true });
      return;
    }

    const employee_code =
      userDetails?.employee_code ||
      userDetails?.emp_code ||
      userDetails?.employeeCode ||
      "";

    router.push({
      pathname: "/EditDeleteInventory",
      params: {
        request_id: request.request_id,
        item_name: request.item_name,
        status: request.status,

        project_name: request.project_name,
        property_name: request.property_name,
        canonical_project_name: request.canonical_project_name,
        canonical_property_name: request.canonical_property_name,

        employee_code,
        engineer_name: request.engineer_name || "",

        item_type: request.item_type || "",
        warehouse: request.warehouse || "",
        requested_quantity: String(request.requested_quantity ?? ""),
        created_at: request.created_at ?? "",
        deli_date: request.deli_date ?? "",

        total_requested: String(request.total_requested ?? ""),
        total_issued: String(request.total_issued ?? ""),
        total_returned: String(request.total_returned ?? ""),
        total_used: String(request.total_used ?? ""),

        // ✅ also pass current context ids
        projectId: safeProjectId,
        propertyId: safePropertyId,
        project_id: safeProjectId,
        property_id: safePropertyId,
      },
    });
  };

  // Phase options derived from current requests
  const phaseOptions = useMemo(() => {
    const names = Array.from(
      new Set(
        (requests || [])
          .map((r) => (r.phase_name || "").trim())
          .filter((p) => p.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b));
    return [{ key: "all", label: "ALL PHASES" }, ...names.map((p) => ({ key: p, label: p }))];
  }, [requests]);

  // Smart search (client-side)
  const searched = useSmartSearch({
    data: requests,
    query: searchText,
    keys: ["item_name", "status", "warehouse", "phase_name"],
  }) as RequestItem[];

  const visibleRequests = useMemo(() => {
    const st = String(selectedStatus || "").trim();
    const ph = String(selectedPhase || "").trim();

    return searched.filter((r) => {
      const statusOk = !st || String(r.status) === st;
      const phaseOk = !ph || String(r.phase_name || "").trim() === ph;
      return statusOk && phaseOk;
    });
  }, [searched, selectedStatus, selectedPhase]);

  // Add press (block when locked)
  const handleAddPress = useCallback(() => {
    const openAddFlow = () => {
      const { email, first_name, last_name, job_title, phone_number } = userDetails || {};

      router.push({
        pathname: "/PropertiesMasterItems",
        params: {
          email,
          employee_code: employeeCode,
          first_name,
          last_name,
          job_title,
          phone_number,

          projectId: safeProjectId,
          propertyId: safePropertyId,

          project_id: safeProjectId,
          property_id: safePropertyId,
        },
      });
    };

    if (!online) {
      if (invLocked) setShowGateDialog(true);
      else openAddFlow();
      return;
    }

    fetchInventoryGate().then((latestLocked) => {
      if (latestLocked) {
        setShowGateDialog(true);
        return;
      }
      openAddFlow();
    });
  }, [
    invLocked,
    userDetails,
    router,
    employeeCode,
    safeProjectId,
    safePropertyId,
    online,
    fetchInventoryGate,
  ]);

  return (
    <SafeAreaView style={styles.container} testID="property-inventory-root">
      <Modal
        visible={showGateDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGateDialog(false)}
      >
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogCard}>
            <TText style={styles.dialogTitle}>Inventory Requests Locked</TText>
            <TText style={styles.dialogMessage}>
              {invLockMessage || "Please update the task updates to request inventory."}
            </TText>
            <TouchableOpacity
              style={styles.dialogButton}
              onPress={() => setShowGateDialog(false)}
              activeOpacity={0.9}
            >
              <TText style={styles.dialogButtonText}>OK</TText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {!online && (
        <View style={styles.offlineBanner} testID="inventory-offline-banner">
          <Ionicons name="cloud-offline-outline" size={16} color={C.success} />
          <TText style={styles.offlineText}>You’re offline</TText>
          <TText style={styles.offlineSub}>
            {lastSyncedAt ? `Last synced: ${new Date(lastSyncedAt).toLocaleString()}` : "No cache found"}
          </TText>
        </View>
      )}

      <View style={styles.headerRow}>
        <View style={styles.searchBar} testID="inventory-search-bar">
          <Ionicons name="search" size={18} color={C.subtleText} />
          <TextInput
            testID="inventory-search-input"
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search Inventories"
            placeholderTextColor={C.subtleText}
            style={styles.searchInput}
            autoCorrect={false}
          />
          {searchText.length > 0 ? (
            <TouchableOpacity
              testID="inventory-search-clear-btn"
              onPress={() => setSearchText("")}
              style={styles.clearBtn}
              activeOpacity={0.85}
            >
              <Ionicons name="close-circle" size={18} color={C.subtleText} />
            </TouchableOpacity>
          ) : null}
        </View>

        <ModalSelector
          ref={statusSelectorRef}
          data={STATUSES.map((s) => ({ key: s.key || "all", label: s.label }))}
          initValue="Filter"
          onChange={(opt: any) => setSelectedStatus(opt.key === "all" ? "" : String(opt.key))}
          optionTextStyle={styles.modalOptionText}
          optionContainerStyle={styles.modalOptionContainer}
          initValueTextStyle={styles.modalInitText}
          cancelStyle={{ backgroundColor: C.surface }}
          cancelTextStyle={{ color: C.text }}
          overlayStyle={{ backgroundColor: C.overlay }}
          cancelText="Cancel"
        >
          <TouchableOpacity
            testID="inventory-status-filter-btn"
            style={[styles.squareBtn, selectedStatus ? styles.squareBtnActive : null]}
            activeOpacity={0.85}
          >
            <Ionicons name="filter-outline" size={18} color={C.subtleText} />
          </TouchableOpacity>
        </ModalSelector>

        <ModalSelector
          ref={phaseSelectorRef}
          data={phaseOptions}
          initValue="Phase"
          onChange={(opt: any) => setSelectedPhase(opt.key === "all" ? "" : String(opt.key))}
          optionTextStyle={styles.modalOptionText}
          optionContainerStyle={styles.modalOptionContainer}
          initValueTextStyle={styles.modalInitText}
          cancelStyle={{ backgroundColor: C.surface }}
          cancelTextStyle={{ color: C.text }}
          overlayStyle={{ backgroundColor: C.overlay }}
          cancelText="Cancel"
        >
          <TouchableOpacity
            testID="inventory-phase-filter-btn"
            style={[styles.squareBtn, selectedPhase ? styles.squareBtnActive : null]}
            activeOpacity={0.85}
          >
            <Ionicons name="git-branch-outline" size={18} color={C.subtleText} />
          </TouchableOpacity>
        </ModalSelector>

        <TouchableOpacity
          testID="inventory-add-btn"
          style={[styles.addBtnSquare, invLocked ? styles.addBtnDisabled : null]}
          onPress={handleAddPress}
          activeOpacity={0.9}
          accessibilityState={{ disabled: false }}
        >
          <Ionicons name="add" size={22} color={C.white} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ marginTop: 12 }} testID="inventory-loading-state">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : error === "no-data" ? (
        <View style={styles.emptyWrap} testID="inventory-empty-state">
          <Ionicons name="archive-outline" size={36} color={C.subtleText} />
          <TText style={styles.emptyTitle}>No requests yet</TText>
          <TText style={styles.emptySub}>Tap + to create a new request.</TText>
        </View>
      ) : error ? (
        <View style={styles.errorWrap} testID="inventory-error-state">
          <Ionicons name="warning-outline" size={32} color={C.danger} />
          <TText style={styles.errorTitle}>Couldn’t load requests</TText>
          <TText style={styles.errorSub}>{String(error)}</TText>
          <TouchableOpacity testID="inventory-retry-btn" style={styles.retryBtn} onPress={fetchRequests}>
            <TText style={styles.retryText}>Retry</TText>
          </TouchableOpacity>
        </View>
      ) : visibleRequests.length > 0 ? (
        <ScrollView
          testID="inventory-list-scroll"
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              enabled={online}
              tintColor={C.primaryStrong}
              colors={[C.primaryStrong]}
            />
          }
        >
          {visibleRequests.map((request, idx) => {
            const pill = getStatusPill(request.status);
            const qtyRaw = request.requested_quantity ?? "-";
            const qty =
              typeof qtyRaw === "number"
                ? String(qtyRaw).padStart(2, "0")
                : String(qtyRaw).length === 1
                ? `0${qtyRaw}`
                : String(qtyRaw);

            return (
              <TouchableOpacity
                testID={`inventory-card-${request.request_id}`}
                key={`${request.request_id}-${idx}`}
                style={[styles.card, !online && styles.cardDisabled]}
                onPress={() => handleCardPress(request)}
                activeOpacity={0.9}
              >
                <View style={styles.cardHeader}>
                  <TText
                    testID={`inventory-card-title-${request.request_id}`}
                    style={styles.cardTitle}
                    numberOfLines={1}
                  >
                    {request.item_name || "No Item Name"}
                  </TText>

                  <View
                    testID={`inventory-card-status-pill-${request.request_id}`}
                    style={[styles.statusPill, { backgroundColor: pill.bg, borderColor: pill.border }]}
                  >
                    <TText
                      testID={`inventory-card-status-text-${request.request_id}`}
                      style={[styles.statusText, { color: pill.text }]}
                    >
                      {String(request.status || "NO STATUS").toUpperCase()}
                    </TText>
                  </View>
                </View>

                <View style={styles.metaStrip}>
                  <View style={styles.metaItem}>
                    <Ionicons name="cube-outline" size={16} color={C.subtleText} />
                    <TText
                      testID={`inventory-card-qty-${request.request_id}`}
                      style={styles.metaLabel}
                      numberOfLines={1}
                    >
                      Qty: <TText style={styles.metaStrong}>{qty}</TText>
                    </TText>
                  </View>

                  <View style={styles.sep} />

                  <View style={styles.metaItem}>
                    <Ionicons name="git-branch-outline" size={16} color={C.subtleText} />
                    <TText
                      testID={`inventory-card-phase-${request.request_id}`}
                      style={styles.metaLabel}
                      numberOfLines={1}
                    >
                      {request.phase_name || "—"}
                    </TText>
                  </View>

                  <View style={styles.sep} />

                  <View style={styles.metaItem}>
                    <Ionicons name="home-outline" size={16} color={C.subtleText} />
                    <TText
                      testID={`inventory-card-warehouse-${request.request_id}`}
                      style={styles.metaLabel}
                      numberOfLines={1}
                    >
                      WHS <TText style={styles.metaStrong}>{request.warehouse || "—"}</TText>
                    </TText>
                  </View>
                </View>

                {!online && (
                  <View
                    style={styles.lockBanner}
                    testID={`inventory-card-lock-banner-${request.request_id}`}
                  >
                    <Ionicons name="lock-closed-outline" size={14} color={C.text} />
                    <TText style={styles.lockText}>Go online to edit/delete</TText>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.emptyWrap} testID="inventory-no-search-results-state">
          <Ionicons name="search-outline" size={36} color={C.subtleText} />
          <TText style={styles.emptyTitle}>No matching results</TText>
          <TText style={styles.emptySub}>Try another search or clear filters.</TText>
        </View>
      )}
    </SafeAreaView>
  );
};

const createStyles = (C: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 16, paddingTop: 10 },

  offlineBanner: {
    backgroundColor: C.successSoft,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginTop: 4,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  offlineText: { color: C.success, fontWeight: "900", fontSize: 13 },
  offlineSub: { color: C.success, fontWeight: "700", fontSize: 11, marginLeft: "auto" },

  gateBanner: {
    backgroundColor: C.successSoft,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  gateBannerText: { color: C.success, fontWeight: "800", flex: 1, fontSize: 12 },
  dialogOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  dialogCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: C.surface,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 22,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  dialogTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: "900",
  },
  dialogMessage: {
    color: C.mutedText,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 21,
    marginTop: 10,
  },
  dialogButton: {
    marginTop: 18,
    alignSelf: "flex-end",
    backgroundColor: C.primaryStrong,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  dialogButtonText: {
    color: C.white,
    fontWeight: "900",
    fontSize: 13,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
  },
  searchBar: {
    flex: 1,
    height: 48,
    backgroundColor: C.surface,
    borderRadius: 16,
    paddingHorizontal: 12,
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
    fontWeight: "600",
    fontSize: 13,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  clearBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.border,
  },

  squareBtn: {
    width: 40,
    height: 40,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  squareBtnActive: {
    backgroundColor: C.primarySoft,
    borderColor: C.border,
  },

  addBtnSquare: {
    width: 40,
    height: 40,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.primaryStrong,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  addBtnDisabled: { opacity: 0.5 },

  modalOptionText: { fontSize: 12, color: C.text, fontWeight: "700" },
  modalOptionContainer: { paddingVertical: 12, backgroundColor: C.surface, borderBottomColor: C.border },
  modalInitText: { color: C.mutedText, fontWeight: "700" },

  listContainer: { paddingBottom: 80, paddingTop: 12 },

  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  cardDisabled: { opacity: 0.6 },

  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  cardTitle: { fontSize: 11, fontWeight: "700", color: C.text, flex: 1 },

  statusPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 110,
    alignItems: "center",
    justifyContent: "center",
  },
  statusText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.7 },

  metaStrip: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flex: 1,
  },
  metaLabel: { color: C.mutedText, fontSize: 10, fontWeight: "600" },
  metaStrong: { color: C.text, fontWeight: "900" },
  sep: {
    width: 1,
    height: 18,
    backgroundColor: C.border,
    marginHorizontal: 10,
  },

  lockBanner: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceAlt,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  lockText: { color: C.text, fontSize: 12, fontWeight: "800" },

  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 24 },
  emptyTitle: { marginTop: 8, fontSize: 16, fontWeight: "900", color: C.text },
  emptySub: { marginTop: 4, fontSize: 13, color: C.mutedText, fontWeight: "700", textAlign: "center" },

  errorWrap: { alignItems: "center", marginTop: 24, paddingHorizontal: 16 },
  errorTitle: { marginTop: 8, fontSize: 16, fontWeight: "900", color: C.danger },
  errorSub: { marginTop: 4, fontSize: 13, color: C.danger, fontWeight: "700", textAlign: "center" },
  retryBtn: {
    marginTop: 12,
    backgroundColor: C.primaryStrong,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryText: { color: C.white, fontWeight: "900" },

  skelCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  skelTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  skelLineWide: { height: 18, flex: 1, backgroundColor: C.border, borderRadius: 10 },
  skelPill: { width: 120, height: 30, backgroundColor: C.border, borderRadius: 12 },
  skelMetaRow: { marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  skelLineShort: { height: 14, flex: 1, backgroundColor: C.border, borderRadius: 10 },
  skelSep: { width: 1, height: 18, backgroundColor: C.border, marginHorizontal: 10 },
});

export default PropertyInventory;
