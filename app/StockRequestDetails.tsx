import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
import { authenticatedFetch } from "../utils/auth";
// StockRequestDetails.tsx
import React, { useState, useCallback, useRef, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Platform,
  Alert,
  RefreshControl,
  ScrollView,
  TextInput,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "@/src/theme/ThemeProvider";
import { getDecimalInputProps } from "../utils/keyboardProps";

// ---- Types ----
type InventoryLine = {
  request_line_id: number | string;
  item_name: string;
  requested_quantity: number;
  warehouse: string | number;
  status: string;
  item_type: string;
  invoice_id?: string | null;
  location?: string;
  issued_quantity?: number | null;
  remaining_quantity?: number | null;
};

type TransactionRow = {
  transaction_request_id: string;
  parent_request_id: string;
  status: string;
  item_name: string;
  warehouse: string | number;
  transaction_quantity: number;
  created_at?: string;
  issued_on?: string;
};

type MovementLog = {
  log_id: number | string;
  batch_id?: string;
  item_name?: string;
  issued_quantity?: number;
  issued_to?: string;
  issued_by?: string;
  issued_to_name?: string;
  issued_by_name?: string;
  issued_on?: string;
  location?: string;
  warehouse?: string | number;
  request_id?: string;
  movement_type?: string;
  ref_request_id?: string;
};

type AuditEvent = {
  event_id?: number | string;
  parent_request_id?: string;
  request_id?: string;
  child_request_id?: string | null;
  event_type?: string;
  status_from?: string | null;
  status_to?: string | null;
  quantity?: number | null;
  item_name?: string | null;
  warehouse?: string | null;
  location?: string | null;
  actor_employee_code?: string | null;
  actor_name?: string | null;
  reason?: string | null;
  metadata?: Record<string, any> | null;
  created_at?: string | null;
};

type ApiHeader = Partial<{
  request_id: string;
  parent_request_id: string;

  engineer_id: string;
  engineer_name: string;

  project_name: string;
  property_name: string;
  deli_date: string;
  schedule_id: string | number;
  phase_name: string;

  line_count: number;
  transaction_count: number;

  master_status: string;
  total_requested: number | string;
  total_issued: number | string;
  total_closed: number | string;
  total_remaining: number | string;

  total_returned: number | string;
  total_used: number | string;
}>;

type ApiPayload = Partial<{
  success: boolean;
  header: ApiHeader;
  lines: InventoryLine[];
  transactions: TransactionRow[];
  logs_by_transaction: Record<string, MovementLog[]>;
  audit_events: AuditEvent[];
}>;

type RouteParams = {
  request_id?: string;
  employee_code?: string;
  engineer_id?: string;

  project_name?: string;
  property_name?: string;
  canonical_project_name?: string;
  canonical_property_name?: string;

  engineer_name?: string;
  deli_date?: string;
} & Record<string, any>;

// ---- Config ----
const BASE_URL = `${APP_API_BASE_URL}`;
const HIT_SLOP = { top: 8, right: 8, bottom: 8, left: 8 };

// UI tokens
const BRAND_BLUE = "#2F80ED";
const BG = "#F6F7FB";
const TEXT = "#0F172A";
const MUTED = "#64748B";
const BORDER = "#E5E7EB";

// ---- Utils ----
const showError = (msg: string) =>
  Platform.OS === "web" ? console.error(msg) : Alert.alert("Error", msg);

const fetchWithTimeout = async (
  input: RequestInfo,
  init?: RequestInit,
  timeoutMs = 12000
) => {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
};

const safeNum = (v: any, fallback = 0) => {
  const n = Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
};

const prettyLabel = (v: any) =>
  String(v ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normStrict = (v: any) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normWarehouse = (v: any) => {
  const s = String(v ?? "").trim().toLowerCase();
  const digits = (s.match(/\d+/g) || []).join("");
  if (digits) return digits;
  return s.replace(/[_\s-]+/g, "").trim();
};

const getStatusStyle = (status: string) => {
  switch ((status || "").toLowerCase()) {
    case "requested":
      return { bg: { backgroundColor: "#EAF6EE" }, fg: { color: "#136A3A" } };
    case "raised":
      return { bg: { backgroundColor: "#E8F0FE" }, fg: { color: "#1E3A8A" } };
    case "issued":
      return { bg: { backgroundColor: "#FFF2E6" }, fg: { color: "#B05A18" } };
    case "partially_issued":
      return { bg: { backgroundColor: "#FFF7ED" }, fg: { color: "#9A3412" } };
    case "closed":
      return { bg: { backgroundColor: "#F3F4F6" }, fg: { color: "#374151" } };
    case "returned":
      return { bg: { backgroundColor: "#EEF2FF" }, fg: { color: "#3730A3" } };
    case "rejected":
      return { bg: { backgroundColor: "#FCEBEC" }, fg: { color: "#8E1B1B" } };
    default:
      return { bg: { backgroundColor: "#F1F2F4" }, fg: { color: "#2E2E2E" } };
  }
};

const getStatusAccent = (status: string) => {
  switch ((status || "").toLowerCase()) {
    case "requested":
      return "#16A34A";
    case "raised":
      return "#2563EB";
    case "issued":
      return "#F26A16";
    case "partially_issued":
      return "#F59E0B";
    case "closed":
      return "#4B5563";
    case "returned":
      return "#4F46E5";
    case "rejected":
      return "#DC2626";
    default:
      return "#6D28D9";
  }
};

const isIssuedLike = (status: string) => {
  const s = (status || "").toLowerCase().trim();
  return s === "issued" || s === "partially_issued";
};

const computeReturnableForIssuedTx = (
  issuedTxId: string,
  logsByTx: Record<string, MovementLog[]>
) => {
  const issuedLogs = logsByTx[issuedTxId] || [];
  const issuedTotal = issuedLogs
    .filter((l) => (l.movement_type || "").toUpperCase() === "ISSUE")
    .reduce((sum, l) => sum + safeNum(l.issued_quantity, 0), 0);

  let returnedTotal = 0;
  for (const txId of Object.keys(logsByTx || {})) {
    const logs = logsByTx[txId] || [];
    for (const l of logs) {
      const mt = (l.movement_type || "").toUpperCase();
      const ref = String(l.ref_request_id || "").trim();
      if (mt === "RETURN" && ref === issuedTxId) {
        returnedTotal += safeNum(l.issued_quantity, 0);
      }
    }
  }

  const remaining = Math.max(issuedTotal - returnedTotal, 0);
  return { issuedTotal, returnedTotal, remainingReturnable: remaining };
};

// ✅ UI helpers
const SectionTabs = ({
  active,
  onChange,
}: {
  active: "items" | "tx";
  onChange: (v: "items" | "tx") => void;
}) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  return (
    <View style={styles.tabsWrap}>
      <TouchableOpacity
        onPress={() => onChange("items")}
        style={[styles.tabBtn, active === "items" ? styles.tabBtnActive : null]}
        activeOpacity={0.85}
      >
        <Ionicons
          name="list-outline"
          size={16}
          color={active === "items" ? C.text : C.mutedText}
          style={{ marginRight: 6 }}
        />
        <Text style={[styles.tabText, active === "items" ? styles.tabTextActive : null]}>
          Items
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => onChange("tx")}
        style={[styles.tabBtn, active === "tx" ? styles.tabBtnActive : null]}
        activeOpacity={0.85}
      >
        <Ionicons
          name="swap-horizontal-outline"
          size={16}
          color={active === "tx" ? C.text : C.mutedText}
          style={{ marginRight: 6 }}
        />
        <Text style={[styles.tabText, active === "tx" ? styles.tabTextActive : null]}>
          Transactions
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const Chip = ({
  icon,
  label,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
}) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  return (
    <View style={styles.chip}>
      {icon ? (
        <Ionicons name={icon} size={14} color={C.mutedText} style={{ marginRight: 6 }} />
      ) : null}
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
};

const StockRequestDetails: React.FC = () => {
  const router = useRouter();
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  const params = useLocalSearchParams<RouteParams>();
  const { width } = useWindowDimensions();

  const [lines, setLines] = useState<InventoryLine[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [logsByTx, setLogsByTx] = useState<Record<string, MovementLog[]>>({});
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [meta, setMeta] = useState<ApiHeader>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);
  const [auditTimelineOpen, setAuditTimelineOpen] = useState(false);

  const effectiveRequestId = (params.request_id || "").toString();

  const [activeTab, setActiveTab] = useState<"items" | "tx">("items");

  useEffect(() => {
    setAuditTimelineOpen(false);
  }, [effectiveRequestId]);

  // --------------------------
  // RETURN modal state
  // --------------------------
  const [returnModalVisible, setReturnModalVisible] = useState(false);
  const [returnQtyInput, setReturnQtyInput] = useState("");
  const [returnBusy, setReturnBusy] = useState(false);
  const [activeReturnTx, setActiveReturnTx] = useState<TransactionRow | null>(null);
  const [activeReturnMax, setActiveReturnMax] = useState<number>(0);
  const [closeModalVisible, setCloseModalVisible] = useState(false);
  const [closeReasonInput, setCloseReasonInput] = useState("");
  const [closeBusy, setCloseBusy] = useState(false);

  const openReturnModal = useCallback(
    (tx: TransactionRow) => {
      const calc = computeReturnableForIssuedTx(tx.transaction_request_id, logsByTx);
      const max = safeNum(calc.remainingReturnable, 0);

      setActiveReturnTx(tx);
      setActiveReturnMax(max);
      setReturnQtyInput(max > 0 ? String(max) : "");
      setReturnModalVisible(true);
    },
    [logsByTx]
  );

  const closeReturnModal = useCallback(() => {
    setReturnModalVisible(false);
    setReturnQtyInput("");
    setReturnBusy(false);
    setActiveReturnTx(null);
    setActiveReturnMax(0);
  }, []);

  const loadFromApi = useCallback(
    async (isRefresh = false) => {
      if (!effectiveRequestId) {
        showError("Missing request_id.");
        setLoading(false);
        return;
      }

      !isRefresh ? setLoading(true) : setRefreshing(true);

      try {
        const url = `${BASE_URL}/request-inventory/${encodeURIComponent(effectiveRequestId)}`;
        const resp = await authenticatedFetch(url, undefined, true);

        if (!resp.ok) {
          const body = await resp.text().catch(() => "");
          throw new Error(body || `Fetch failed with status ${resp.status}`);
        }

        const json: ApiPayload = await resp.json();
        const header = (json?.header || {}) as ApiHeader;

        setMeta({
          ...header,
          request_id: header.request_id ?? effectiveRequestId,
          engineer_name: header.engineer_name ?? params.engineer_name,
          project_name: header.project_name ?? params.project_name,
          property_name: header.property_name ?? params.property_name,
          deli_date: header.deli_date ?? params.deli_date,
          engineer_id: header.engineer_id ?? params.engineer_id,
          total_closed: header.total_closed ?? 0,
          total_returned: header.total_returned ?? 0,
          total_used: header.total_used ?? 0,
        });

        setLines(Array.isArray(json?.lines) ? (json.lines as InventoryLine[]) : []);
        setTransactions(
          Array.isArray(json?.transactions) ? (json.transactions as TransactionRow[]) : []
        );
        setLogsByTx(json?.logs_by_transaction || {});
        setAuditEvents(Array.isArray(json?.audit_events) ? (json.audit_events as AuditEvent[]) : []);
      } catch (e: any) {
        console.error("Load error:", e);
        showError(e?.message || "Failed to load request details.");
        setLines([]);
        setTransactions([]);
        setLogsByTx({});
        setAuditEvents([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      effectiveRequestId,
      params.engineer_name,
      params.project_name,
      params.property_name,
      params.deli_date,
      params.engineer_id,
    ]
  );

  const didFirstFocus = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (didFirstFocus.current) loadFromApi(true);
      else {
        didFirstFocus.current = true;
        loadFromApi(false);
      }
      return () => {};
    }, [loadFromApi])
  );

  const totalRequested = safeNum(meta.total_requested, 0);
  const totalIssued = safeNum(meta.total_issued, 0);
  const totalClosed = safeNum(meta.total_closed, 0);
  const totalRemaining = safeNum(meta.total_remaining, 0);
  const totalReturned = safeNum(meta.total_returned, 0);
  const totalUsed = safeNum(meta.total_used, 0);
  const canCloseRemaining =
    String(meta.master_status || "").toLowerCase() === "partially_issued" &&
    totalRemaining > 0;

  // ---------- QR Scanner ----------
  const [permission, requestPermission] = useCameraPermissions();
  const [showScanner, setShowScanner] = useState(false);
  const [cameraType, setCameraType] = useState<"back" | "front">("back");
  const [scanned, setScanned] = useState(false);
  const [activeLineItem, setActiveLineItem] = useState<InventoryLine | null>(null);

  // ✅ Dialog instead of toast
  const [qrErrorVisible, setQrErrorVisible] = useState(false);
  const [qrErrorMessage, setQrErrorMessage] = useState("");
  const autoCloseTimerRef = useRef<any>(null);

  const openQrErrorDialog = useCallback((msg: string) => {
    setShowScanner(false);
    setQrErrorMessage(msg);
    setQrErrorVisible(true);
    setScanned(false);

    if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    autoCloseTimerRef.current = setTimeout(() => {
      setQrErrorVisible(false);
    }, 10000);
  }, []);

  const ensureCamera = useCallback(async () => {
    if (!permission || !permission.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        openQrErrorDialog("Camera permission is required to scan QR codes.");
        return false;
      }
    }
    return true;
  }, [permission, requestPermission, openQrErrorDialog]);

  const toggleCameraFacing = () => setCameraType((c) => (c === "back" ? "front" : "back"));

  // ✅ MAIN SCAN HANDLER (Project + Warehouse + Item)
  const handleBarCodeScanned = useCallback(
    async ({ data }: { data: string; type: string }) => {
      if (scanned) return;
      setScanned(true);

      try {
        if (!activeLineItem) {
          openQrErrorDialog("No line item selected for scanning.");
          return;
        }

        let url: URL;
        try {
          url = new URL(data);
        } catch {
          openQrErrorDialog("Invalid QR Code: Not a valid URL.");
          return;
        }

        const parsed_item_name_raw = url.searchParams.get("parsed_item_name");
        const parsed_location_raw = url.searchParams.get("parsed_location");
        const parsed_warehouse_raw = url.searchParams.get("parsed_warehouse");

        if (!parsed_item_name_raw || !parsed_location_raw || !parsed_warehouse_raw) {
          openQrErrorDialog("Invalid QR Code: Missing required parameters.");
          return;
        }

        const expectedProjectCandidates = [
          meta.project_name,
          params.project_name,
          params.canonical_project_name,
        ].filter(Boolean) as string[];

        const expectedProjectOK = expectedProjectCandidates.some(
          (p) => normStrict(p) === normStrict(parsed_location_raw)
        );

        const expectedWarehouseRaw = activeLineItem.warehouse ?? "";
        const warehouseOK = normWarehouse(expectedWarehouseRaw) === normWarehouse(parsed_warehouse_raw);

        const expectedItemRaw = activeLineItem.item_name ?? "";
        const itemOK = normStrict(expectedItemRaw) === normStrict(parsed_item_name_raw);

        if (!expectedProjectOK || !warehouseOK || !itemOK) {
          const expectedProjectDisplay = prettyLabel(
            params.canonical_project_name || meta.project_name || params.project_name || "—"
          );

          const msg =
            `Wrong QR scanned.\n\n` +
            `Selected request line is for:\n` +
            `• Project: ${expectedProjectDisplay}\n` +
            `• Warehouse: ${prettyLabel(expectedWarehouseRaw || "—")}\n` +
            `• Item: ${prettyLabel(expectedItemRaw || "—")}\n\n` +
            `But this QR belongs to:\n` +
            `• Project: ${prettyLabel(parsed_location_raw || "—")}\n` +
            `• Warehouse: ${prettyLabel(parsed_warehouse_raw || "—")}\n` +
            `• Item: ${prettyLabel(parsed_item_name_raw || "—")}\n\n` +
            `Please scan the correct QR for the selected item.`;

          openQrErrorDialog(msg);
          return;
        }

        const lookupUrl = `${BASE_URL}/lookup/inventory?parsed_item_name=${encodeURIComponent(
          parsed_item_name_raw
        )}&parsed_location=${encodeURIComponent(parsed_location_raw)}&parsed_warehouse=${encodeURIComponent(
          parsed_warehouse_raw
        )}`;

        const resp = await fetchWithTimeout(lookupUrl, undefined, 12000);
        if (!resp.ok) {
          openQrErrorDialog("Not Found: Item not found in backend.");
          return;
        }

        setShowScanner(false);

        router.push({
          pathname: "/InventoryScanResult",
          params: {
            parsed_item_name: parsed_item_name_raw,
            parsed_location: parsed_location_raw,
            parsed_warehouse: parsed_warehouse_raw,

            parsed_item_name_display: prettyLabel(parsed_item_name_raw),
            parsed_location_display: prettyLabel(parsed_location_raw),
            parsed_warehouse_display: prettyLabel(parsed_warehouse_raw),

            request_line_id: String(activeLineItem.request_line_id),
            item_name: activeLineItem.item_name,
            requested_quantity: String(activeLineItem.requested_quantity ?? 0),
            item_type: String(activeLineItem.item_type ?? "general"),
            warehouse: String(activeLineItem.warehouse ?? parsed_warehouse_raw),
            location: String(activeLineItem.location ?? parsed_location_raw),

            request_id: String(meta.request_id ?? ""),
            project_name: String(meta.project_name ?? params.project_name ?? ""),
            canonical_project_name: String(params.canonical_project_name ?? ""),
            property_name: String(meta.property_name ?? params.property_name ?? ""),
            canonical_property_name: String(params.canonical_property_name ?? ""),

            engineer_id: String(meta.engineer_id ?? params.engineer_id ?? ""),
            engineer_name: String(meta.engineer_name ?? ""),
            employee_code: String(params.employee_code ?? ""),
            deli_date: meta.deli_date ? String(meta.deli_date).slice(0, 10) : "",
          },
        });
      } catch (e: any) {
        console.error("QR Error:", e);
        openQrErrorDialog(e?.message || "Error: Could not fetch inventory details.");
      } finally {
        setScanned(false);
      }
    },
    [scanned, activeLineItem, meta, params, router, openQrErrorDialog]
  );

  // --------------------------
  // RETURN API call
  // --------------------------
  const postReturnStock = useCallback(
    async (tx: TransactionRow, qty: number) => {
      const issued_request_id = String(tx.transaction_request_id || "").trim();
      if (!issued_request_id) throw new Error("Missing issued_request_id");

      const locationForReturn = String(
        params.canonical_project_name || meta.project_name || params.project_name || ""
      ).trim();

      const performedBy = String(params.employee_code || "Stock Manager").trim();

      const payload = {
        issued_request_id,
        engineer_id: String(meta.engineer_id || params.engineer_id || "").trim() || "NA",
        performed_by: performedBy,

        item_name: String(tx.item_name || "").trim(),
        return_quantity: Number(qty),

        location: locationForReturn,
        warehouse: String(tx.warehouse ?? "1"),

        project_name: String(meta.project_name || params.project_name || ""),
        property_name: String(meta.property_name || params.property_name || ""),

        reason: "Returned from app",
      };

      const resp = await fetchWithTimeout(
        `${BASE_URL}/return-stock`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        20000
      );

      const text = await resp.text().catch(() => "");
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (!resp.ok) {
        const msg = json?.detail || json?.message || text || "Return failed";
        throw new Error(msg);
      }

      return json;
    },
    [meta.engineer_id, meta.project_name, meta.property_name, params, meta]
  );

  const closeRemainingModal = useCallback(() => {
    setCloseModalVisible(false);
    setCloseReasonInput("");
    setCloseBusy(false);
  }, []);

  const submitCloseRemaining = useCallback(async () => {
    const reason = closeReasonInput.trim();
    const employeeCode = String(params.employee_code || "").trim();

    if (!employeeCode) {
      Alert.alert("Missing employee", "Employee code is required to close this request.");
      return;
    }

    if (!reason) {
      Alert.alert("Reason required", "Please enter a reason before closing the request.");
      return;
    }

    setCloseBusy(true);
    try {
      const formData = new FormData();
      formData.append("request_id", String(meta.request_id ?? effectiveRequestId));
      formData.append("employee_code", employeeCode);
      formData.append("reason", reason);

      const response = await authenticatedFetch(`${APP_API_BASE_URL}/close-request-with-remaining-items/`, {
        method: "POST",
        body: formData,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(
          payload?.detail || payload?.message || "Failed to close the remaining quantity."
        );
      }

      closeRemainingModal();
      await loadFromApi(true);
      Alert.alert(
        "Request closed",
        payload?.message ||
          `Request ${String(meta.request_id ?? effectiveRequestId)} moved from partially issued to closed.`
      );
    } catch (e: any) {
      Alert.alert("Close failed", e?.message || "Failed to close the remaining quantity.");
      setCloseBusy(false);
    }
  }, [
    closeReasonInput,
    params.employee_code,
    meta.request_id,
    effectiveRequestId,
    closeRemainingModal,
    loadFromApi,
  ]);

  const onConfirmReturn = useCallback(async () => {
    if (!activeReturnTx) return;

    const input = String(returnQtyInput || "").trim();
    const qty = safeNum(input, 0);

    if (!Number.isFinite(qty) || qty <= 0) {
      Alert.alert("Invalid quantity", "Return quantity must be greater than 0.");
      return;
    }
    if (qty > activeReturnMax + 1e-9) {
      Alert.alert("Too much", `Max returnable for this issued transaction is ${activeReturnMax}.`);
      return;
    }

    setReturnBusy(true);
    try {
      const res = await postReturnStock(activeReturnTx, qty);

      Alert.alert(
        "Returned ✅",
        `Returned ${res?.returned_quantity ?? qty} successfully.\nReturn ID: ${res?.return_request_id || "—"}`
      );

      closeReturnModal();
      loadFromApi(true);
    } catch (e: any) {
      console.error("Return failed:", e);
      Alert.alert("Return failed", e?.message || "Return failed");
      setReturnBusy(false);
    }
  }, [activeReturnTx, activeReturnMax, returnQtyInput, postReturnStock, closeReturnModal, loadFromApi]);

  const renderLine = ({ item }: { item: InventoryLine }) => {
    const accent = getStatusAccent(item.status);
    const s = getStatusStyle(item.status);

    return (
      <View style={styles.itemCard}>
        <View style={[styles.leftAccent, { backgroundColor: accent }]} />
        <View style={styles.itemInner}>
          <View style={styles.itemTopRow}>
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1, minWidth: 0 }}>
              <View style={styles.iconBadge}>
                <Ionicons name="cube-outline" size={18} color={C.primaryStrong} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.itemTitle} numberOfLines={2}>
                  {item.item_name}
                </Text>
                <Text style={styles.itemHint} numberOfLines={1}>
                  Type: {String(item.item_type || "general")} • WH {String(item.warehouse)}
                </Text>
              </View>
            </View>

            {/* <View style={[styles.statusPill, s.bg]}>
              <Text style={[styles.statusText, s.fg]}>{(item.status || "").toUpperCase()}</Text>
            </View> */}
          </View>

          <View style={styles.chipsRow}>
            <Chip icon="calculator-outline" label={`Requested ${safeNum(item.requested_quantity, 0)}`} />
            {item.issued_quantity != null ? (
              <Chip icon="arrow-up-circle-outline" label={`Issued ${safeNum(item.issued_quantity, 0)}`} />
            ) : null}
            {item.remaining_quantity != null ? (
              <Chip icon="hourglass-outline" label={`Remaining ${safeNum(item.remaining_quantity, 0)}`} />
            ) : null}
          </View>

          <View style={styles.actionsRow}>
            {String(meta.master_status || "").toLowerCase() === "issued" ? null : (
              <TouchableOpacity
                hitSlop={HIT_SLOP}
                style={styles.primaryBtn}
                onPress={async () => {
                  setActiveLineItem(item);
                  const ok = await ensureCamera();
                  if (ok) {
                    setScanned(false);
                    setShowScanner(true);
                  }
                }}
                activeOpacity={0.9}
              >
                <Ionicons name="qr-code-outline" size={16} color={C.white} />
                <Text style={styles.primaryBtnText}>Scan QR</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  const KpiItem = ({ label, value }: { label: string; value: string | number }) => (
    <View style={styles.kpiItem}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{String(value)}</Text>
    </View>
  );

  const renderTx = ({ item }: { item: TransactionRow }) => {
    const isOpen = expandedTxId === item.transaction_request_id;
    const txLogs = logsByTx[item.transaction_request_id] || [];
    const s = getStatusStyle(item.status);
    const accent = getStatusAccent(item.status);

    const issuedLike = isIssuedLike(item.status);
    const { remainingReturnable } = issuedLike
      ? computeReturnableForIssuedTx(item.transaction_request_id, logsByTx)
      : { remainingReturnable: 0 };

    const canReturn = issuedLike && remainingReturnable > 0;

    return (
      <View style={styles.txCard}>
        <View style={styles.txHeader}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.txId} numberOfLines={1}>
              {item.transaction_request_id}
            </Text>
            <Text style={styles.txMeta} numberOfLines={2}>
              Qty: {safeNum(item.transaction_quantity, 0)} • {item.item_name} • WH {String(item.warehouse)}
            </Text>

            {issuedLike ? (
              <Text style={[styles.txMeta, { marginTop: 6 }]}>Returnable: {remainingReturnable}</Text>
            ) : null}

            {item.issued_on ? (
              <Text style={styles.txMeta}>Issued On: {new Date(item.issued_on).toLocaleString("en-GB")}</Text>
            ) : null}
          </View>

          <View style={[styles.statusPill, s.bg]}>
            <Text style={[styles.statusText, s.fg]}>{String(item.status || "").toUpperCase()}</Text>
          </View>

          <TouchableOpacity
            style={[styles.txToggle, { backgroundColor: accent }]}
            onPress={() => setExpandedTxId(isOpen ? null : item.transaction_request_id)}
            activeOpacity={0.9}
          >
            <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={C.white} />
          </TouchableOpacity>
        </View>

        {issuedLike ? (
          <View style={styles.txActions}>
            <TouchableOpacity
              disabled={!canReturn}
              onPress={() => openReturnModal(item)}
              style={[styles.returnBtn, canReturn ? styles.returnBtnBlue : styles.returnBtnDisabled]}
              activeOpacity={0.9}
            >
              <Ionicons name="return-down-back-outline" size={16} color={C.white} />
              <Text style={styles.returnBtnText}>{canReturn ? "Return" : "No Return Left"}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {isOpen ? (
          <View style={styles.txBody}>
            <Text style={styles.sectionTitle}>Movement Logs</Text>

            {txLogs.length === 0 ? (
              <Text style={styles.emptySmall}>No logs found for this transaction.</Text>
            ) : (
              txLogs.map((l) => (
                <View key={String(l.log_id)} style={styles.logCard}>
                  <Text style={styles.logLine}>
                    <Text style={styles.logStrong}>#{String(l.log_id)}</Text> • {String(l.movement_type || "—")}
                  </Text>
                  <Text style={styles.logLine}>
                    Batch: {String(l.batch_id || "—")} • Qty: {safeNum(l.issued_quantity, 0)}
                  </Text>
                  <Text style={styles.logLine}>
                    To: {String(l.issued_to_name || "—")} • By: {String(l.issued_by_name || "—")}
                  </Text>
                  <Text style={styles.logLine}>
                    Loc: {String(l.location || "—")} • WH: {String(l.warehouse || "—")}
                  </Text>
                  {l.issued_on ? (
                    <Text style={styles.logLine}>On: {new Date(String(l.issued_on)).toLocaleString("en-GB")}</Text>
                  ) : null}
                  {l.ref_request_id ? <Text style={styles.logLine}>Ref: {String(l.ref_request_id)}</Text> : null}
                </View>
              ))
            )}
          </View>
        ) : null}
      </View>
    );
  };

  const renderAuditEvent = (evt: AuditEvent, index: number) => {
    const label = String(evt.event_type || "EVENT").replace(/_/g, " ");
    const when = evt.created_at ? new Date(String(evt.created_at)).toLocaleString("en-GB") : "—";
    const actor = evt.actor_name || evt.actor_employee_code || "System";
    const qty = evt.quantity != null ? `Qty ${safeNum(evt.quantity, 0)}` : null;
    const remainingBefore =
      evt.metadata?.remaining_before != null ? safeNum(evt.metadata.remaining_before, 0) : null;
    const remainingAfter =
      evt.metadata?.remaining_after != null ? safeNum(evt.metadata.remaining_after, 0) : null;
    const transition =
      evt.status_from || evt.status_to
        ? `${String(evt.status_from || "—").toUpperCase()} -> ${String(evt.status_to || "—").toUpperCase()}`
        : null;

    return (
      <View key={`${evt.event_id ?? index}`} style={styles.logCard}>
        <Text style={styles.logLine}>
          <Text style={styles.logStrong}>{label.toUpperCase()}</Text>
        </Text>
        <Text style={styles.logLine}>By: {String(actor)}</Text>
        {transition ? <Text style={styles.logLine}>State: {transition}</Text> : null}
        {qty ? <Text style={styles.logLine}>{qty}</Text> : null}
        {remainingBefore !== null || remainingAfter !== null ? (
          <Text style={styles.logLine}>
            Remaining: {remainingBefore !== null ? remainingBefore : "—"} {"->"} {remainingAfter !== null ? remainingAfter : "—"}
          </Text>
        ) : null}
        {evt.child_request_id ? <Text style={styles.logLine}>Child: {String(evt.child_request_id)}</Text> : null}
        {evt.reason ? <Text style={styles.logLine}>Reason: {String(evt.reason)}</Text> : null}
        <Text style={styles.logLine}>On: {when}</Text>
      </View>
    );
  };

  const AuditTimeline = auditEvents.length ? (
    <View style={styles.auditWrap}>
      <TouchableOpacity
        style={styles.auditHeader}
        onPress={() => setAuditTimelineOpen((prev) => !prev)}
        activeOpacity={0.88}
      >
        <View style={styles.auditHeaderLeft}>
          <Text style={styles.sectionTitle}>Audit Timeline</Text>
          <View style={styles.auditCountChip}>
            <Text style={styles.auditCountChipText}>{auditEvents.length} events</Text>
          </View>
        </View>
        <Ionicons
          name={auditTimelineOpen ? "chevron-up" : "chevron-down"}
          size={18}
          color={C.mutedText}
        />
      </TouchableOpacity>
      {auditTimelineOpen ? auditEvents.map((evt, index) => renderAuditEvent(evt, index)) : null}
    </View>
  ) : null;

  const displayProject =
    params.canonical_project_name || meta.project_name || params.project_name || "—";
  const displayProperty =
    params.canonical_property_name || meta.property_name || params.property_name || "—";

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={C.primaryStrong} />
        <Text style={{ marginTop: 10, fontWeight: "900", color: C.mutedText }}>Loading request…</Text>
      </View>
    );
  }

  const totalTx = safeNum(meta.transaction_count, 0);

  return (
    <View style={styles.container} testID="stock-request-details-root">
      {/* Header (Back + Title + Home) */}
      <View style={styles.headerBar}>
        
      <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name='arrow-back' size={24} color={C.text} />
          </TouchableOpacity>

        <Text style={styles.headerTitle}>Stock Request</Text>

        <TouchableOpacity onPress={() => router.push('/HomeScreen')}>
          <Ionicons name='home' size={24} color={C.text} />
        </TouchableOpacity>
      </View>

      {/* Meta Card (request id + project/property BELOW header) */}
      <View style={styles.metaCard}>
        <View style={styles.metaTop}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.metaBigTitle} numberOfLines={1}>
              Request #{meta.request_id ?? effectiveRequestId ?? "—"}
            </Text>
            <Text style={styles.metaSubTitle} numberOfLines={1}>
              {String(displayProject)} • {String(displayProperty)}
            </Text>

            <View style={styles.metaRow}>
              <Ionicons name="person-outline" size={14} color={C.mutedText} style={{ marginRight: 6 }} />
              <Text style={styles.metaText} numberOfLines={1}>
                {meta.engineer_name ?? meta.engineer_id ?? "—"}
              </Text>

              <Text style={styles.metaDot}>•</Text>

              <Ionicons name="calendar-outline" size={14} color={C.mutedText} style={{ marginRight: 6 }} />
              <Text style={styles.metaText}>
                {meta.deli_date ? new Date(meta.deli_date).toLocaleDateString("en-GB") : "—"}
              </Text>
            </View>
          </View>

          <View style={[styles.masterPill, { borderColor: getStatusAccent(String(meta.master_status || "")) }]}>
            <View style={[styles.masterDot, { backgroundColor: getStatusAccent(String(meta.master_status || "")) }]} />
            <Text style={styles.masterText}>{String(meta.master_status || "—").toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.kpiStrip}>
          <KpiItem label="Requested" value={totalRequested} />
          <View style={styles.kpiDivider} />
          <KpiItem label="Issued" value={totalIssued} />
          <View style={styles.kpiDivider} />
          <KpiItem label="Closed" value={totalClosed} />
          <View style={styles.kpiDivider} />
          <KpiItem label="Returned" value={totalReturned} />
          <View style={styles.kpiDivider} />
          <KpiItem label="Used" value={totalUsed} />
          <View style={styles.kpiDivider} />
          <KpiItem label="Remaining" value={totalRemaining} />
        </View>

        <View style={styles.metaBottomRow}>
          <View style={[styles.metaChip, { marginRight: 10 }]}>
            <Ionicons name="swap-horizontal-outline" size={14} color={C.mutedText} style={{ marginRight: 6 }} />
            <Text style={styles.metaChipText}>{totalTx} transactions</Text>
          </View>

          <View style={styles.metaChip}>
            <Ionicons name="cube-outline" size={14} color={C.mutedText} style={{ marginRight: 6 }} />
            <Text style={styles.metaChipText}>{lines.length} items</Text>
          </View>
        </View>

        {canCloseRemaining ? (
          <View style={styles.metaActionRow}>
            <TouchableOpacity
              style={styles.closeRemainingBtn}
              onPress={() => setCloseModalVisible(true)}
              activeOpacity={0.9}
            >
              <Ionicons name="close-circle-outline" size={16} color={C.white} />
              <Text style={styles.closeRemainingBtnText}>Close Remaining Qty</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {/* Tabs */}
      <SectionTabs active={activeTab} onChange={setActiveTab} />

      {/* Lists */}
      {activeTab === "items" ? (
        <FlatList
          data={lines}
          keyExtractor={(it) => String(it.request_line_id)}
          renderItem={renderLine}
          contentContainerStyle={styles.listPad}
          ListFooterComponent={AuditTimeline}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadFromApi(true)} />}
          ListEmptyComponent={!loading ? <Text style={styles.emptyText}>No line items found for this request.</Text> : null}
        />
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(it) => String(it.transaction_request_id)}
          renderItem={renderTx}
          contentContainerStyle={styles.listPad}
          ListFooterComponent={AuditTimeline}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadFromApi(true)} />}
          ListEmptyComponent={!loading ? <Text style={styles.emptyText}>No transactions found for this request.</Text> : null}
        />
      )}

      {/* Scanner Modal */}
      <Modal visible={showScanner} animationType="slide" onRequestClose={() => setShowScanner(false)}>
        <CameraView
          style={styles.camera}
          facing={cameraType}
          onBarcodeScanned={handleBarCodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        >
          <View style={styles.cameraBtnsRow}>
            <TouchableOpacity style={styles.cameraBtn} onPress={toggleCameraFacing} hitSlop={HIT_SLOP} activeOpacity={0.9}>
              <Ionicons name="camera-reverse" size={26} color={C.white} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cameraBtn, { backgroundColor: C.danger }]}
              onPress={() => setShowScanner(false)}
              hitSlop={HIT_SLOP}
              activeOpacity={0.9}
            >
              <Ionicons name="close" size={26} color={C.white} />
            </TouchableOpacity>
          </View>
        </CameraView>
      </Modal>

      {/* QR Error Dialog */}
      <Modal visible={qrErrorVisible} transparent animationType="fade" onRequestClose={() => setQrErrorVisible(false)}>
        <View style={styles.dialogBackdrop}>
          <View style={styles.dialogCard}>
            <View style={styles.dialogHeader}>
              <Ionicons name="warning-outline" size={20} color={C.danger} style={{ marginRight: 8 }} />
              <Text style={styles.dialogTitle}>Wrong QR Scanned</Text>
              <TouchableOpacity
                onPress={() => setQrErrorVisible(false)}
                style={styles.dialogClose}
                hitSlop={HIT_SLOP}
                activeOpacity={0.85}
              >
                <Ionicons name="close" size={18} color={C.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.dialogMsg}>{qrErrorMessage}</Text>
            </ScrollView>

            <View style={styles.dialogActions}>
              <TouchableOpacity
                style={[styles.dialogBtn, styles.dialogBtnGhost]}
                onPress={() => setQrErrorVisible(false)}
                activeOpacity={0.9}
              >
                <Text style={styles.dialogGhostText}>Close</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.dialogBtn, styles.dialogBtnPrimary]}
                onPress={async () => {
                  setQrErrorVisible(false);
                  const ok = await ensureCamera();
                  if (ok) {
                    setScanned(false);
                    setShowScanner(true);
                  }
                }}
                activeOpacity={0.9}
              >
                <Ionicons name="qr-code-outline" size={16} color={C.white} style={{ marginRight: 6 }} />
                <Text style={styles.dialogPrimaryText}>Rescan QR</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Return Modal */}
      <Modal visible={returnModalVisible} transparent animationType="fade" onRequestClose={closeReturnModal}>
        <View style={styles.dialogBackdrop}>
          <View style={styles.returnCard}>
            <View style={styles.returnHeader}>
              <Ionicons name="return-down-back-outline" size={18} color={C.text} style={{ marginRight: 8 }} />
              <Text style={styles.returnTitle}>Return Stock</Text>
              <TouchableOpacity onPress={closeReturnModal} style={styles.dialogClose} hitSlop={HIT_SLOP} activeOpacity={0.85}>
                <Ionicons name="close" size={18} color={C.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.returnSub}>
              Transaction: <Text style={{ fontWeight: "900" }}>{activeReturnTx?.transaction_request_id || "—"}</Text>
            </Text>
            <Text style={styles.returnSub}>
              Item: <Text style={{ fontWeight: "900" }}>{activeReturnTx?.item_name || "—"}</Text>
            </Text>
            <Text style={styles.returnSub}>
              Warehouse: <Text style={{ fontWeight: "900" }}>{String(activeReturnTx?.warehouse ?? "—")}</Text>
            </Text>
            <Text style={styles.returnSub}>
              Max returnable: <Text style={{ fontWeight: "900" }}>{activeReturnMax}</Text>
            </Text>

            <View style={{ marginTop: 12 }}>
              <Text style={styles.inputLabel}>Quantity to return</Text>
              <TextInput
                value={returnQtyInput}
                onChangeText={(t) => setReturnQtyInput(t.replace(/[^0-9.]/g, ""))}
                {...getDecimalInputProps()}
                placeholder="e.g. 2"
                style={styles.input}
                editable={!returnBusy}
              />
              <Text style={styles.inputHint}>Must be ≤ {activeReturnMax} and greater than 0</Text>
            </View>

            <View style={styles.returnActions}>
              <TouchableOpacity
                disabled={returnBusy}
                style={[styles.secondaryBtn, returnBusy ? { opacity: 0.7 } : null]}
                onPress={closeReturnModal}
                activeOpacity={0.9}
              >
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={returnBusy}
                style={[styles.primaryBtnWide, returnBusy ? { opacity: 0.7 } : null]}
                onPress={onConfirmReturn}
                activeOpacity={0.9}
              >
                {returnBusy ? (
                  <>
                    <ActivityIndicator size="small" color={C.white} />
                    <Text style={[styles.primaryBtnText, { marginLeft: 8 }]}>Returning…</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={18} color={C.white} style={{ marginRight: 6 }} />
                    <Text style={styles.primaryBtnText}>Return</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={closeModalVisible} transparent animationType="fade" onRequestClose={closeRemainingModal}>
        <View style={styles.dialogBackdrop}>
          <View style={styles.returnCard}>
            <View style={styles.returnHeader}>
              <Ionicons name="close-circle-outline" size={18} color={C.text} style={{ marginRight: 8 }} />
              <Text style={styles.returnTitle}>Close Remaining Quantity</Text>
              <TouchableOpacity onPress={closeRemainingModal} style={styles.dialogClose} hitSlop={HIT_SLOP} activeOpacity={0.85}>
                <Ionicons name="close" size={18} color={C.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.returnSub}>
              Request: <Text style={{ fontWeight: "900" }}>{String(meta.request_id ?? effectiveRequestId)}</Text>
            </Text>
            <Text style={styles.returnSub}>
              Remaining qty: <Text style={{ fontWeight: "900" }}>{totalRemaining}</Text>
            </Text>
            <Text style={styles.returnSub}>
              This will record the unissued balance as closed and move the request to CLOSED.
            </Text>

            <View style={{ marginTop: 12 }}>
              <Text style={styles.inputLabel}>Reason for closing</Text>
              <TextInput
                value={closeReasonInput}
                onChangeText={setCloseReasonInput}
                placeholder="Why is the remaining quantity no longer required?"
                style={[styles.input, styles.reasonInput]}
                multiline
                editable={!closeBusy}
              />
            </View>

            <View style={styles.returnActions}>
              <TouchableOpacity
                disabled={closeBusy}
                style={[styles.secondaryBtn, closeBusy ? { opacity: 0.7 } : null]}
                onPress={closeRemainingModal}
                activeOpacity={0.9}
              >
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={closeBusy}
                style={[styles.closeRemainingBtnWide, closeBusy ? { opacity: 0.7 } : null]}
                onPress={submitCloseRemaining}
                activeOpacity={0.9}
              >
                {closeBusy ? (
                  <>
                    <ActivityIndicator size="small" color={C.white} />
                    <Text style={[styles.primaryBtnText, { marginLeft: 8 }]}>Closing…</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={18} color={C.white} style={{ marginRight: 6 }} />
                    <Text style={styles.primaryBtnText}>Close Request</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const createStyles = (C: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  // Header (Back + Title + Home)
  headerBar: {flexDirection: 'row',alignItems: 'center', padding: 16,backgroundColor: C.headerBg,borderBottomWidth: 1, borderBottomColor: C.border, justifyContent: 'space-between',},

  headerBtn: {
    height: 40,
    width: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "900",
    color: C.text,
  },

  // Meta Card
  metaCard: {
    marginHorizontal: 12,
    marginTop: 0,
    marginBottom: 10,
    padding: 14,
    backgroundColor: C.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  metaTop: { flexDirection: "row", alignItems: "flex-start" },
  metaBigTitle: { fontSize: 14, fontWeight: "900", color: C.text },
  metaSubTitle: { marginTop: 4, fontSize: 11, fontWeight: "800", color: C.mutedText },

  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 10, flexWrap: "wrap" },
  metaText: { color: C.text, fontWeight: "800", fontSize: 11, maxWidth: 200 },
  metaDot: { color: C.subtleText, fontWeight: "900", marginHorizontal: 8 },

  masterPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: C.surface,
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 10,
  },
  masterDot: { height: 8, width: 8, borderRadius: 999, marginRight: 8 },
  masterText: { fontWeight: "900", color: C.text, fontSize: 11, letterSpacing: 0.3 },

  kpiStrip: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceAlt,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  kpiItem: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  kpiLabel: { color: C.mutedText, fontWeight: "800", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.6 },
  kpiValue: { marginTop: 3, color: C.text, fontWeight: "900", fontSize: 12 },
  kpiDivider: { width: 1, height: 34, backgroundColor: C.border },

  metaBottomRow: { flexDirection: "row", marginTop: 12 },
  metaActionRow: { marginTop: 14 },
  metaChip: {
    flex: 1,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  metaChipText: { color: C.mutedText, fontWeight: "900", fontSize: 11 },
  closeRemainingBtn: {
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: C.danger,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  closeRemainingBtnText: { color: C.white, fontWeight: "900", fontSize: 13, marginLeft: 8 },

  // Tabs
  tabsWrap: { flexDirection: "row", paddingHorizontal: 12, paddingBottom: 10, gap: 10 },
  tabBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  tabBtnActive: { backgroundColor: C.primarySoft, borderColor: C.border },
  tabText: { fontWeight: "900", color: C.mutedText, fontSize: 12 },
  tabTextActive: { color: C.text },

  listPad: { paddingHorizontal: 12, paddingBottom: 22 },

  // Item Card
  itemCard: {
    backgroundColor: C.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    marginVertical: 7,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  leftAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  itemInner: { padding: 14, paddingLeft: 16 },
  itemTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },

  iconBadge: {
    height: 34,
    width: 34,
    borderRadius: 12,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  itemTitle: { fontSize: 12, fontWeight: "900", color: C.text },
  itemHint: { marginTop: 4, fontSize: 10, fontWeight: "800", color: C.mutedText },

  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    minHeight: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
  },
  statusText: { fontSize: 10, lineHeight: 14, fontWeight: "900", letterSpacing: 0.3 },

  chipsRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 10 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surfaceAlt,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: C.border,
    marginRight: 8,
    marginBottom: 8,
  },
  chipText: { fontSize: 11, color: C.mutedText, fontWeight: "800" },

  actionsRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 6 },

  primaryBtn: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: C.primaryStrong,
    flexDirection: "row",
    alignItems: "center",
  },
  primaryBtnText: { color: C.white, fontWeight: "900", marginLeft: 8, fontSize: 12 },

  // TX card
  txCard: {
    backgroundColor: C.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    marginVertical: 7,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  txHeader: { padding: 12, flexDirection: "row", alignItems: "center" },
  txId: { fontWeight: "900", color: C.text, fontSize: 12 },
  txMeta: { marginTop: 3, color: C.mutedText, fontWeight: "800", fontSize: 11 },

  txToggle: { height: 36, width: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", marginLeft: 10 },

  txActions: { paddingHorizontal: 12, paddingBottom: 12, paddingTop: 0, flexDirection: "row", justifyContent: "flex-end" },

  returnBtn: { flexDirection: "row", alignItems: "center", height: 36, paddingHorizontal: 14, borderRadius: 12 },
  returnBtnBlue: { backgroundColor: C.primaryStrong },
  returnBtnDisabled: { backgroundColor: C.subtleText },
  returnBtnText: { color: C.white, fontWeight: "900", marginLeft: 8, fontSize: 12 },

  txBody: { padding: 12, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surfaceAlt },
  sectionTitle: { fontWeight: "900", color: C.text },
  emptySmall: { color: C.mutedText, fontWeight: "800", marginTop: 8 },
  auditWrap: { marginTop: 12 },
  auditHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  auditHeaderLeft: { flexDirection: "row", alignItems: "center" },
  auditCountChip: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  auditCountChipText: { color: C.mutedText, fontWeight: "800", fontSize: 10 },

  logCard: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  logLine: { color: C.mutedText, fontWeight: "800", marginTop: 2, fontSize: 10 },
  logStrong: { color: C.text, fontWeight: "900" },

  emptyText: { textAlign: "center", color: C.mutedText, marginTop: 18, fontWeight: "900" },

  // Camera
  camera: { flex: 1 },
  cameraBtnsRow: {
    position: "absolute",
    bottom: 28,
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    paddingHorizontal: 18,
  },
  cameraBtn: { backgroundColor: "rgba(0,0,0,0.45)", padding: 12, borderRadius: 999 },

  // Dialogs
  dialogBackdrop: { flex: 1, backgroundColor: C.overlayStrong || C.overlay, justifyContent: "center", alignItems: "center", padding: 18 },
  dialogCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  dialogHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  dialogTitle: { flex: 1, fontSize: 12, fontWeight: "900", color: C.text },
  dialogClose: {
    height: 34,
    width: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  dialogMsg: { color: C.mutedText, fontWeight: "800", fontSize: 11, lineHeight: 18 },
  dialogActions: { flexDirection: "row", marginTop: 12 },
  dialogBtn: { flex: 1, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row" },
  dialogBtnGhost: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, marginRight: 10 },
  dialogGhostText: { color: C.text, fontWeight: "900" },
  dialogBtnPrimary: { backgroundColor: C.primaryStrong },
  dialogPrimaryText: { color: C.white, fontWeight: "900" },

  // Return modal
  returnCard: { width: "100%", maxWidth: 420, backgroundColor: C.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.border },
  returnHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  returnTitle: { flex: 1, fontSize: 12, fontWeight: "900", color: C.text },
  returnSub: { color: C.mutedText, fontWeight: "800", fontSize: 11, marginTop: 4 },

  inputLabel: { marginTop: 4, color: C.text, fontWeight: "900" },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12,
    fontWeight: "800",
    color: C.text,
    backgroundColor: C.surface,
  },
  reasonInput: {
    minHeight: 96,
    textAlignVertical: "top",
    paddingTop: 12,
  },
  inputHint: { marginTop: 6, color: C.mutedText, fontWeight: "700", fontSize: 11 },

  returnActions: { flexDirection: "row", marginTop: 14, gap: 10 },
  secondaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  secondaryBtnText: { color: C.text, fontWeight: "900" },
  primaryBtnWide: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.primaryStrong,
    flexDirection: "row",
  },
  closeRemainingBtnWide: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.danger,
    flexDirection: "row",
  },
});

export default StockRequestDetails;
