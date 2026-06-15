import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Modal,
  Platform,
  KeyboardTypeOptions,
} from "react-native";
import ModalSelector from "@/components/AppModalSelect";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";

import {
  trackScreen,
  startScreenTimer,
  trackUI,
  trackNetwork,
  updateDynamicContext,
  clearDynamicContext,
  flushTelemetry,
} from "../utils/telemetry";
import {
  loadLastPropertyRouteContext,
  parseRouteUserDetails,
  pickRouteParam,
} from "../utils/propertyRouteContext";
import TText from "@/components/TText";
import { useTheme } from "@/src/theme/ThemeProvider";
import { authenticatedFetch, getStoredAuthUser } from "@/utils/auth";


import { API_BASE_URL } from "../utils/apiBase";
const API_BASE = API_BASE_URL;
const DAILY_WORK_REQUEST_SOURCE = "LabourDetailsFormScreen";

const MS: any = ModalSelector;

const toLocalYMD = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const isNonNegativeNumber = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0;
};

type Contractor = { contractor_id: string; contractor_name: string };
type Labour = { labor_id: string; labor_name: string };
type WorkType = { work_type_id: string; work_type_name: string };
type Phase = { phase_id: string; phase_name: string; status?: string };

type PersonType = "Contractor" | "Labour";
type ContractorType = "Contractor" | "NMR";
type WorkDuration = "hourly" | "daily";
type EntryType = "Regular" | "Customer Add On" | "Avenue Add On";
type DayType = "" | "half" | "full";

type UnitType =
  | "sqft"
  | "rft"
  | "cubic"
  | "auger_12"
  | "auger_15"
  | "auger_18"
  | "cbft";

type SelectorOption<K extends string = string> = { key: K; label: string };

const UNIT_TYPE_OPTIONS: SelectorOption<UnitType>[] = [
  { key: "sqft", label: "Square Feet (SQFT)" },
  { key: "rft", label: "Running Feet (RFT)" },
  { key: "cubic", label: "Cubic Meter (m³)" },
  { key: "auger_12", label: "12 Augurs" },
  { key: "auger_15", label: "15 Augurs" },
  { key: "auger_18", label: "18 Augurs" },
  { key: "cbft", label: "Cubic Feet (CBFT)" },
];

const unitLabel = (u: UnitType) =>
  UNIT_TYPE_OPTIONS.find((x) => x.key === u)?.label ?? u;

/* ------------------------------- Cache + TTL ------------------------------- */

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
type CacheEnvelope<T> = { ts: number; data: T };

const cacheKeyContractors = (projectID: string, propertyID: string) =>
  `cache:manpower:assigned-contractors:v1:${projectID}:${propertyID}`;

const cacheKeyLabours = (projectID: string, propertyID: string) =>
  `cache:manpower:assigned-labours:v1:${projectID}:${propertyID}`;

const cacheKeyWorkTypes = `cache:work-types:v1`;

const cacheKeyPhases = (propertyID: string) =>
  `cache:phases:in-progress:v1:${propertyID}`;

async function saveCache<T>(key: string, data: T) {
  try {
    const env: CacheEnvelope<T> = { ts: Date.now(), data };
    await AsyncStorage.setItem(key, JSON.stringify(env));
  } catch { }
}

async function loadCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const env: CacheEnvelope<T> = JSON.parse(raw);
    if (!env?.ts) return null;
    if (Date.now() - env.ts > TTL_MS) return null;
    return env.data ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------- Outbox ------------------------------- */

type OutboxItem = {
  id: string;
  url: string;
  method: "POST" | "PUT";
  headers: Record<string, string>;
  body: any;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
};

const OUTBOX_KEY = "outbox:daily-work:v1";
const MAX_RETRIES = 8;
const BACKOFF_BASE_MS = 10_000;
let OUTBOX_SENDING_LOCK = false;

async function readOutbox(): Promise<OutboxItem[]> {
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY);
    return raw ? (JSON.parse(raw) as OutboxItem[]) : [];
  } catch {
    return [];
  }
}

async function writeOutbox(items: OutboxItem[]) {
  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
}

async function enqueueOutbox(
  item: Omit<
    OutboxItem,
    "id" | "createdAt" | "attempts" | "nextAttemptAt"
  >
) {
  const list = await readOutbox();
  const now = Date.now();
  const withMeta: OutboxItem = {
    ...item,
    id: `${now}_${Math.random().toString(36).slice(2)}`,
    createdAt: now,
    attempts: 0,
    nextAttemptAt: now,
  };
  list.push(withMeta);
  await writeOutbox(list);
  return withMeta.id;
}

function computeNextAttemptTs(attempts: number): number {
  const base = BACKOFF_BASE_MS * Math.pow(2, Math.min(attempts, 10));
  const jitter = Math.floor(Math.random() * 2000);
  return Date.now() + base + jitter;
}

async function processOutbox(
  setPending?: (n: number) => void,
  extra?: Record<string, any>
) {
  if (OUTBOX_SENDING_LOCK) return;
  OUTBOX_SENDING_LOCK = true;

  try {
    let queue = await readOutbox();
    if (setPending) setPending(queue.length);

    const now = Date.now();
    const candidates = queue.filter((i) => i.nextAttemptAt <= now);

    trackUI?.({
      screen: "LabourDetailsFormScreen",
      element: "outbox",
      action: "process_start",
      extra: { pending: queue.length, candidates: candidates.length, ...extra },
    });

    for (const item of candidates) {
      trackUI?.({
        screen: "LabourDetailsFormScreen",
        element: "outbox_item",
        action: "send_attempt",
        extra: { id: item.id, attempts: item.attempts, url: item.url },
      });

      try {
        const res = await authenticatedFetch(item.url, {
          method: item.method,
          headers: {
            ...item.headers,
            "x-client-sync-mode": "offline_replay",
            "x-client-request-source": DAILY_WORK_REQUEST_SOURCE,
          },
          body: JSON.stringify(item.body),
        });

        if (res.ok) {
          queue = queue.filter((q) => q.id !== item.id);
          await writeOutbox(queue);
          if (setPending) setPending(queue.length);

          trackUI?.({
            screen: "LabourDetailsFormScreen",
            element: "outbox_item",
            action: "send_success",
            extra: { id: item.id, status: res.status },
          });
        } else {
          item.attempts += 1;
          if (item.attempts >= MAX_RETRIES) {
            queue = queue.filter((q) => q.id !== item.id);
            trackUI?.({
              screen: "LabourDetailsFormScreen",
              element: "outbox_item",
              action: "dropped_max_retries",
              extra: { id: item.id, status: res.status },
            });
          } else {
            item.nextAttemptAt = computeNextAttemptTs(item.attempts);
            trackUI?.({
              screen: "LabourDetailsFormScreen",
              element: "outbox_item",
              action: "send_failed_retry_scheduled",
              extra: { id: item.id, status: res.status, attempts: item.attempts },
            });
          }
          await writeOutbox(queue);
          if (setPending) setPending(queue.length);
        }
      } catch (e: any) {
        const idx = queue.findIndex((q) => q.id === item.id);
        if (idx !== -1) {
          queue[idx].attempts += 1;
          if (queue[idx].attempts >= MAX_RETRIES) {
            queue.splice(idx, 1);
            trackUI?.({
              screen: "LabourDetailsFormScreen",
              element: "outbox_item",
              action: "dropped_network_max_retries",
              extra: { id: item.id, message: e?.message ?? "network_error" },
            });
          } else {
            queue[idx].nextAttemptAt = computeNextAttemptTs(queue[idx].attempts);
            trackUI?.({
              screen: "LabourDetailsFormScreen",
              element: "outbox_item",
              action: "network_error_retry_scheduled",
              extra: { id: item.id, attempts: queue[idx].attempts, message: e?.message },
            });
          }
          await writeOutbox(queue);
          if (setPending) setPending(queue.length);
        }
      }
    }
  } finally {
    OUTBOX_SENDING_LOCK = false;
  }
}

/* -------------------------------------------------------------------------- */
/*                                 Dialog Box                                 */
/* -------------------------------------------------------------------------- */

const DialogBox = ({
  visible,
  onClose,
  message,
  isSuccess,
  onSuccessClose,
  styles,
}: {
  visible: boolean;
  onClose: () => void;
  message: string;
  isSuccess?: boolean;
  onSuccessClose?: () => void;
  styles: ReturnType<typeof createStyles>;
}) => {
  const handleOK = () => {
    onClose();
    if (isSuccess && onSuccessClose) onSuccessClose();
  };

  return (
    <Modal transparent visible={visible} animationType="fade" testID="app-labour-details-form-screen-modal-1">
      <View style={styles.modalOverlay}>
        <View style={styles.dialogBox}>
          <TText style={styles.dialogMessage}>{message}</TText>
          <TouchableOpacity style={styles.dialogButton} onPress={handleOK} testID="app-labour-details-form-screen-button-1">
            <TText style={styles.dialogButtonText}>OK</TText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

/* -------------------------------------------------------------------------- */
/*                              UI helpers                                    */
/* -------------------------------------------------------------------------- */

const Field = ({
  label,
  children,
  styles,
}: {
  label: string;
  children: React.ReactNode;
  styles: ReturnType<typeof createStyles>;
}) => (
  <View style={styles.fieldWrap}>
    <TText style={styles.fieldLabel}>{label}</TText>
    {children}
  </View>
);

const TwoCol = ({
  left,
  right,
  styles,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  styles: ReturnType<typeof createStyles>;
}) => (
  <View style={styles.twoColRow}>
    {left}
    <View style={styles.twoColGap} />
    {right}
  </View>
);

/* -------------------------------------------------------------------------- */
/*                              Main Screen                                   */
/* -------------------------------------------------------------------------- */

const LabourDetailsFormScreen = () => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  const modalSelectorSheetTextStyle = useMemo(() => ({ fontSize: 11, color: "#111827" }), []);
  const modalSelectorThemeProps = useMemo(
    () => ({
      overlayStyle: { backgroundColor: C.overlayStrong },
      cancelContainerStyle: {
        backgroundColor: C.card,
        borderColor: C.border,
        borderWidth: 1,
        borderRadius: 12,
      },
      optionContainerStyle: {
        backgroundColor: C.card,
        borderColor: C.border,
        borderWidth: 1,
        borderRadius: 12,
      },
      cancelTextStyle: modalSelectorSheetTextStyle,
      optionTextStyle: modalSelectorSheetTextStyle,
    }),
    [C.card, C.border, C.overlayStrong, modalSelectorSheetTextStyle]
  );
  const params = useLocalSearchParams();

  const userDetailsRaw: any =
    (params as any)?.userDetails ?? (params as any)?.user_details ?? "";
  const routeUserDetails = useMemo(() => parseRouteUserDetails(userDetailsRaw), [userDetailsRaw]);
  const selectedEmployeeId = useMemo(
    () => pickRouteParam((params as any)?.selectedEmployeeId ?? (params as any)?.selected_employee_id),
    [params]
  );
  const [fallbackUserDetails, setFallbackUserDetails] = useState<any>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const [storedAuthUser, lastContext] = await Promise.all([
        getStoredAuthUser(),
        loadLastPropertyRouteContext(),
      ]);
      if (!active) return;
      setFallbackUserDetails(storedAuthUser || lastContext?.userDetails || null);
    })();
    return () => {
      active = false;
    };
  }, []);

  const userDetails = routeUserDetails || fallbackUserDetails || null;

  const engineerCode: string =
    userDetails?.employee_code ||
    userDetails?.emp_code ||
    userDetails?.employeeCode ||
    selectedEmployeeId ||
    "";
  const engineerName: string =
    userDetails?.employee_name ||
    userDetails?.name ||
    userDetails?.full_name ||
    [userDetails?.first_name, userDetails?.last_name].filter(Boolean).join(" ") ||
    "";

  const projectIdParam: any = (params as any)?.projectId;
  const propertyIdParam: any = (params as any)?.propertyId;

  const [projectID, setProjectID] = useState(
    typeof projectIdParam === "string"
      ? projectIdParam
      : Array.isArray(projectIdParam)
        ? projectIdParam[0]
        : ""
  );

  const [propertyID, setPropertyID] = useState(
    typeof propertyIdParam === "string"
      ? propertyIdParam
      : Array.isArray(propertyIdParam)
        ? propertyIdParam[0]
        : ""
  );

  const [contractorOrLabour, setContractorOrLabour] = useState<PersonType>("Contractor");
  const [contractorName, setContractorName] = useState("");
  const [labourName, setLabourName] = useState("");
  const [workerType, setWorkerType] = useState("");
  const [remarks, setRemarks] = useState("");

  const [numHours, setNumHours] = useState("0");
  const [sqUnit, setSqUnit] = useState("0"); // legacy single quantity

  const [numWorkers, setNumWorkers] = useState("");
  const [currentWeekDates, setCurrentWeekDates] = useState<Date[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [labors, setLabors] = useState<Labour[]>([]);
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);

  const [phases, setPhases] = useState<Phase[]>([]);
  const [phaseId, setPhaseId] = useState("");
  const [phaseName, setPhaseName] = useState("");

  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogMessage, setDialogMessage] = useState("");
  const [contractorId, setContractorId] = useState("");
  const [labourId, setLabourId] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  const [workDurationType, setWorkDurationType] = useState<WorkDuration>("hourly");
  const [dayType, setDayType] = useState<DayType>("");
  const [contractorType, setContractorType] = useState<ContractorType>("Contractor");

  // legacy single unit type (non-table case)
  const [unitType, setUnitType] = useState<UnitType>("sqft");

  const [entryType, setEntryType] = useState<EntryType>("Regular");

  // legacy global worker counts (used when NOT in table mode)
  const [skilledCount, setSkilledCount] = useState("");
  const [unskilledCount, setUnskilledCount] = useState("");

  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const lastRemarksLogRef = useRef<{ at: number; len: number }>({ at: 0, len: 0 });
  const lastQtyLogRef = useRef<{ at: number; len: number }>({ at: 0, len: 0 });
  // ----- Unit table column widths (must match header + rows) -----
  const COL_UNIT = 120;
  const COL_QTY = 50;
  const COL_SK = 45;
  const COL_UN = 45;
  const COL_ACTION = 30;
  // ✅ Table mode flag
  const needsUnitTable =
    contractorOrLabour === "Contractor" && contractorType === "Contractor";

  // ✅ Unit table rows now also contain skilled/unskilled per row
  type UnitEntry = {
    id: string;
    unit_type: UnitType;
    quantity: string;
    skilled_count: string;
    unskilled_count: string;
  };

  const makeUnitEntry = (u: UnitType = "sqft"): UnitEntry => ({
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    unit_type: u,
    quantity: "0",
    skilled_count: "",
    unskilled_count: "",
  });

  const [unitEntries, setUnitEntries] = useState<UnitEntry[]>([makeUnitEntry("sqft")]);

  // ✅ totals from table
  const tableTotals = useMemo(() => {
    const skilled = unitEntries.reduce(
      (sum, r) => sum + (parseInt(r.skilled_count || "0", 10) || 0),
      0
    );
    const unskilled = unitEntries.reduce(
      (sum, r) => sum + (parseInt(r.unskilled_count || "0", 10) || 0),
      0
    );
    return { skilled, unskilled, total: skilled + unskilled };
  }, [unitEntries]);

  // ✅ totalWorkers switches based on mode
  const totalWorkers = needsUnitTable
    ? tableTotals.total
    : (parseInt(skilledCount || "0", 10) || 0) +
    (parseInt(unskilledCount || "0", 10) || 0);

  /* ------------------------------- Telemetry: screen mount ------------------------------- */
  useEffect(() => {
    try {
      updateDynamicContext?.({
        screen: "LabourDetailsFormScreen",
        engineerCode: engineerCode || null,
        projectID: projectID || null,
        propertyID: propertyID || null,
      });

      trackScreen?.("LabourDetailsFormScreen", {
        engineerCode: engineerCode || null,
        projectID: projectID || null,
        propertyID: propertyID || null,
      });

      const stop = startScreenTimer?.("LabourDetailsFormScreen", {
        engineerCode: engineerCode || null,
      });

      return () => {
        stop?.();
        clearDynamicContext?.();
        flushTelemetry?.({ reason: "screen_unmount" }).catch?.(() => { });
      };
    } catch {
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------- Connectivity + outbox ------------------------------- */

  useEffect(() => {
    const sub = NetInfo.addEventListener((state: NetInfoState) => {
      const connected = !!state.isConnected && state.isInternetReachable !== false;
      setIsConnected(connected);

      trackUI?.({
        screen: "LabourDetailsFormScreen",
        element: "netinfo",
        action: "change",
        extra: {
          isConnected: connected,
          reachable: state.isInternetReachable,
          type: state.type,
        },
      });

      if (connected) {
        processOutbox(setPendingCount, { reason: "netinfo_connected" });
      }
    });
    return () => sub();
  }, []);

  useEffect(() => {
    (async () => {
      const q = await readOutbox();
      setPendingCount(q.length);
      setTimeout(() => processOutbox(setPendingCount, { reason: "startup_flush" }), 500);
    })();
  }, []);

  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(() => {
      processOutbox(setPendingCount, { reason: "online_poll_flush" });
    }, 4000);

    return () => clearInterval(interval);
  }, [isConnected]);

  /* ------------------------------- Initial data fetch ------------------------------- */

  useEffect(() => {
    fetchContractors();
    fetchLabors();
    fetchWorkTypes();
    fetchPhases();
    calculateCurrentWeekDates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (projectID && propertyID) {
      fetchContractors();
      fetchLabors();
      fetchPhases();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectID, propertyID]);

  // ✅ numWorkers always synced to totalWorkers
  useEffect(() => {
    setNumWorkers(String(totalWorkers));
  }, [totalWorkers]);

  /* ------------------------------- Helpers ------------------------------- */

  const showDialog = (message: string) => {
    setDialogMessage(message);
    setDialogVisible(true);
  };

  /* ------------------------------- Data Fetch ------------------------------- */

  const fetchContractors = async () => {
    if (!projectID || !propertyID) return;
    const ck = cacheKeyContractors(projectID, propertyID);

    if (isConnected === false) {
      const cached = await loadCache<Contractor[]>(ck);
      if (cached && cached.length) {
        setContractors(cached);
        setContractorName(cached[0].contractor_name);
        setContractorId(cached[0].contractor_id);
      }
      return;
    }

    const url = `${API_BASE}/manpower/assigned-contractors?project_id=${encodeURIComponent(
      projectID
    )}&property_id=${encodeURIComponent(propertyID)}`;
    const startedAt = Date.now();

    trackUI?.({
      screen: "LabourDetailsFormScreen",
      element: "fetch_contractors",
      action: "start",
      extra: { projectID, propertyID },
    });

    try {
      const res = await authenticatedFetch(url);
      const durationMs = Date.now() - startedAt;

      trackNetwork?.({
        url,
        method: "GET",
        status: res.status,
        durationMs,
        ok: res.ok,
        extra: { screen: "LabourDetailsFormScreen" },
      });

      if (!res.ok) throw new Error("Failed to fetch contractors");

      const raw = await res.json();
      const arr: any[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.contractors)
          ? raw.contractors
          : [];

      const normalized: Contractor[] = arr
        .map((it: any) => ({
          contractor_id: String(it.contractor_id ?? it.id ?? ""),
          contractor_name: String(it.contractor_name ?? it.name ?? "").trim(),
        }))
        .filter((it: Contractor) => it.contractor_id && it.contractor_name);

      const byKey = new Map<string, Contractor>();
      for (const c of normalized) byKey.set(`${c.contractor_id}::${c.contractor_name}`, c);
      const uniqueContractors = Array.from(byKey.values());

      setContractors(uniqueContractors);
      if (uniqueContractors.length > 0) {
        setContractorName(uniqueContractors[0].contractor_name);
        setContractorId(uniqueContractors[0].contractor_id);
      }

      await saveCache(ck, uniqueContractors);

      trackUI?.({
        screen: "LabourDetailsFormScreen",
        element: "fetch_contractors",
        action: "success",
        extra: { count: uniqueContractors.length, durationMs },
      });
    } catch (e: any) {
      trackUI?.({
        screen: "LabourDetailsFormScreen",
        element: "fetch_contractors",
        action: "error",
        extra: { message: e?.message ?? "unknown_error" },
      });

      const cached = await loadCache<Contractor[]>(ck);
      if (cached && cached.length) {
        setContractors(cached);
        setContractorName(cached[0].contractor_name);
        setContractorId(cached[0].contractor_id);
      } else {
        showDialog("Failed to fetch assigned contractors");
      }
    }
  };

  const fetchLabors = async () => {
    if (!projectID || !propertyID) return;
    const ck = cacheKeyLabours(projectID, propertyID);

    if (isConnected === false) {
      const cached = await loadCache<Labour[]>(ck);
      if (cached && cached.length) {
        setLabors(cached);
        setLabourName(cached[0].labor_name);
        setLabourId(cached[0].labor_id);
      }
      return;
    }

    const url = `${API_BASE}/manpower/assigned-labors?project_id=${encodeURIComponent(
      projectID
    )}&property_id=${encodeURIComponent(propertyID)}`;
    const startedAt = Date.now();

    trackUI?.({
      screen: "LabourDetailsFormScreen",
      element: "fetch_labors",
      action: "start",
      extra: { projectID, propertyID },
    });

    try {
      const res = await authenticatedFetch(url);
      const durationMs = Date.now() - startedAt;

      trackNetwork?.({
        url,
        method: "GET",
        status: res.status,
        durationMs,
        ok: res.ok,
        extra: { screen: "LabourDetailsFormScreen" },
      });

      if (!res.ok) throw new Error("Failed to fetch labors");

      const raw = await res.json();
      const arr: any[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.labors)
          ? raw.labors
          : Array.isArray(raw?.labours)
            ? raw.labours
            : [];

      const normalized: Labour[] = arr
        .map((it: any) => ({
          labor_id: String(it.labor_id ?? it.labour_id ?? it.id ?? ""),
          labor_name: String(it.labor_name ?? it.labour_name ?? it.name ?? "").trim(),
        }))
        .filter((it: Labour) => it.labor_id && it.labor_name);

      const byKey = new Map<string, Labour>();
      for (const l of normalized) byKey.set(`${l.labor_id}::${l.labor_name}`, l);
      const uniqueLabors = Array.from(byKey.values());

      setLabors(uniqueLabors);
      if (uniqueLabors.length > 0) {
        setLabourName(uniqueLabors[0].labor_name);
        setLabourId(uniqueLabors[0].labor_id);
      }

      await saveCache(ck, uniqueLabors);

      trackUI?.({
        screen: "LabourDetailsFormScreen",
        element: "fetch_labors",
        action: "success",
        extra: { count: uniqueLabors.length, durationMs },
      });
    } catch (e: any) {
      trackUI?.({
        screen: "LabourDetailsFormScreen",
        element: "fetch_labors",
        action: "error",
        extra: { message: e?.message ?? "unknown_error" },
      });

      const cached = await loadCache<Labour[]>(ck);
      if (cached && cached.length) {
        setLabors(cached);
        setLabourName(cached[0].labor_name);
        setLabourId(cached[0].labor_id);
      } else {
        showDialog("Failed to fetch assigned labors");
      }
    }
  };

  const fetchWorkTypes = async () => {
    const ck = cacheKeyWorkTypes;

    if (isConnected === false) {
      const cached = await loadCache<WorkType[]>(ck);
      if (cached && cached.length) {
        setWorkTypes(cached);
        setWorkerType(cached[0]?.work_type_name || "");
      }
      return;
    }

    const url = `${API_BASE}/work-types`;
    const startedAt = Date.now();

    trackUI?.({
      screen: "LabourDetailsFormScreen",
      element: "fetch_work_types",
      action: "start",
      extra: {},
    });

    try {
      const res = await authenticatedFetch(url);
      const durationMs = Date.now() - startedAt;

      trackNetwork?.({
        url,
        method: "GET",
        status: res.status,
        durationMs,
        ok: res.ok,
        extra: { screen: "LabourDetailsFormScreen" },
      });

      if (!res.ok) throw new Error("Failed to fetch work types");
      const data = await res.json();
      const arr: WorkType[] = (data.work_types || []) as WorkType[];

      setWorkTypes(arr);
      if (arr.length > 0) setWorkerType(arr[0].work_type_name);

      await saveCache(ck, arr);

      trackUI?.({
        screen: "LabourDetailsFormScreen",
        element: "fetch_work_types",
        action: "success",
        extra: { count: arr.length, durationMs },
      });
    } catch (e: any) {
      trackUI?.({
        screen: "LabourDetailsFormScreen",
        element: "fetch_work_types",
        action: "error",
        extra: { message: e?.message ?? "unknown_error" },
      });

      const cached = await loadCache<WorkType[]>(ck);
      if (cached && cached.length) {
        setWorkTypes(cached);
        setWorkerType(cached[0]?.work_type_name || "");
      } else {
        showDialog("Failed to fetch work types");
      }
    }
  };

  // fetch only "In Progress" phases from schedule API
  const fetchPhases = async () => {
    if (!propertyID) return;
    const ck = cacheKeyPhases(propertyID);

    if (isConnected === false) {
      const cached = await loadCache<Phase[]>(ck);
      if (cached && cached.length) setPhases(cached);
      return;
    }

    const url = `${API_BASE}/properties/${encodeURIComponent(propertyID)}/schedule`;
    const startedAt = Date.now();

    trackUI?.({
      screen: "LabourDetailsFormScreen",
      element: "fetch_phases",
      action: "start",
      extra: { propertyID },
    });

    try {
      const res = await authenticatedFetch(url);
      const durationMs = Date.now() - startedAt;

      trackNetwork?.({
        url,
        method: "GET",
        status: res.status,
        durationMs,
        ok: res.ok,
        extra: { screen: "LabourDetailsFormScreen", propertyID },
      });

      if (!res.ok) throw new Error("Failed to fetch phases");
      const raw = await res.json();

      const arr: any[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.schedule)
          ? raw.schedule
          : Array.isArray(raw?.phases)
            ? raw.phases
            : [];

      const normalized: Phase[] = arr
        .map((it: any) => ({
          phase_id: String(it.scheduleid ?? it.phase_id ?? it.id ?? ""),
          phase_name: String(
            it.phasename ?? it.phase_name ?? it.phase ?? it.name ?? ""
          ).trim(),
          status: String(it.status ?? it.phase_status ?? it.phaseStatus ?? "").toLowerCase(),
        }))
        .filter((p) => p.phase_id && p.phase_name);

      const inProgress = normalized.filter((p) =>
        ["in progress", "in_progress", "inprogress"].includes(p.status || "")
      );

      setPhases(inProgress);
      await saveCache(ck, inProgress);

      trackUI?.({
        screen: "LabourDetailsFormScreen",
        element: "fetch_phases",
        action: "success",
        extra: { count: inProgress.length, durationMs },
      });
    } catch (e: any) {
      trackUI?.({
        screen: "LabourDetailsFormScreen",
        element: "fetch_phases",
        action: "error",
        extra: { message: e?.message ?? "unknown_error" },
      });

      const cached = await loadCache<Phase[]>(ck);
      if (cached && cached.length) setPhases(cached);
      else showDialog("Failed to fetch phases");
    }
  };

  /* --------------------------- Validation helper ---------------------------- */

  const collectMissingFields = (): string[] => {
    const missing: string[] = [];

    if (!projectID) missing.push("Project");
    if (!propertyID) missing.push("Property");
    if (!selectedDate) missing.push("Date");

    if (contractorOrLabour === "Contractor") {
      if (!contractorId || !contractorName) missing.push("Contractor Name");
      if (contractorType === "Contractor") {
        // single-field validation only when NOT using table
        if (!needsUnitTable) {
          if (!unitType) missing.push("Unit Type");
          if (!isNonNegativeNumber(sqUnit)) missing.push("Quantity");
        }
      }
    } else if (contractorOrLabour === "Labour") {
      if (!labourId || !labourName) missing.push("Labour Name");
    }

    if (workDurationType === "hourly") {
      if (!isNonNegativeNumber(numHours)) missing.push("Number of Hours");
    } else if (workDurationType === "daily") {
      if (!dayType) missing.push("Day Type");
    }

    // ✅ global skilled/unskilled required only if NOT table mode
    if (!needsUnitTable) {
      if (skilledCount === "" && unskilledCount === "") missing.push("Skilled/Unskilled Counts");
    }

    // Phase mandatory
    if (!phaseId) missing.push("Phase");
    if (!remarks.trim()) missing.push("Remarks / Notes");

    return missing;
  };

  /* ------------------------------ Submit Handler ----------------------------- */

  const handleSubmit = async () => {
    const missing = collectMissingFields();

    // extra validation for multi-unit table
    if (needsUnitTable) {
      if (!unitEntries || unitEntries.length === 0) {
        missing.push("Unit of Measurements");
      } else {
        unitEntries.forEach((r, idx) => {
          const qOk = isNonNegativeNumber(r.quantity);
          const skOk = isNonNegativeNumber(r.skilled_count);
          const unOk = isNonNegativeNumber(r.unskilled_count);

          if (!r.unit_type) missing.push(`Unit Type (Row ${idx + 1})`);
          if (!qOk) missing.push(`Quantity (Row ${idx + 1})`);
          if (!skOk) missing.push(`Skilled Count (Row ${idx + 1})`);
          if (!unOk) missing.push(`Unskilled Count (Row ${idx + 1})`);

          const rowTotal =
            (parseInt(r.skilled_count || "0", 10) || 0) +
            (parseInt(r.unskilled_count || "0", 10) || 0);

          if (rowTotal <= 0) missing.push(`Workers (Row ${idx + 1})`);
        });
      }
    } else {
      // keep your old single-field validation for non-table cases
      if (contractorOrLabour === "Contractor") {
        if (contractorType === "Contractor") {
          if (!unitType) missing.push("Unit Type");
          if (!isNonNegativeNumber(sqUnit)) missing.push("Quantity");
        }
      }
    }

    if (missing.length > 0) {
      setIsSuccess(false);
      trackUI?.({
        screen: "LabourDetailsFormScreen",
        element: "submit",
        action: "blocked_validation",
        extra: { missing },
      });
      showDialog(`Please fill: ${missing.join(", ")}`);
      return;
    }

    if (!engineerCode) {
      setIsSuccess(false);
      trackUI?.({
        screen: "LabourDetailsFormScreen",
        element: "submit",
        action: "blocked_missing_engineer",
        extra: {
          hasRouteUserDetails: !!routeUserDetails,
          hasFallbackUserDetails: !!fallbackUserDetails,
          selectedEmployeeId,
        },
      });
      showDialog("Unable to identify engineer for this entry. Please reopen the form from the property screen and try again.");
      return;
    }

    // ---------- common fields ----------
    const trimmedRemarks = remarks.trim();
    const baseParams: any = {
      project_id: projectID,
      property_id: propertyID,
      engineer_id: engineerCode,
      engineer_name: engineerName || null,

      contractor_id: contractorOrLabour === "Contractor" ? contractorId : null,
      contractor_name: contractorOrLabour === "Contractor" ? contractorName : null,

      labour_id: contractorOrLabour === "Labour" ? labourId : null,
      labour_name: contractorOrLabour === "Labour" ? labourName : null,

      date: selectedDate ? toLocalYMD(selectedDate) : null,

      hours_worked: Number(numHours || 0),

      contractor_type: contractorOrLabour === "Contractor" ? contractorType : "",
      remarks: trimmedRemarks,
      work_duration_type: contractorType === "NMR" ? null : workDurationType,
      day_type: contractorType === "NMR" ? null : dayType,

      // defaults (will be overridden row-wise in table mode)
      num_workers:
        (parseInt(skilledCount || "0", 10) || 0) + (parseInt(unskilledCount || "0", 10) || 0),

      entry_type: entryType,

      skilled_count: Number(skilledCount || 0),
      unskilled_count: Number(unskilledCount || 0),

      phase_id: phaseId,
      phase_name: phaseName,
    };

    const buildPayloadForUnit = (
      u: UnitType,
      qtyStr: string,
      skilledStr?: string,
      unskilledStr?: string
    ) => {
      const qty = Number(qtyStr || 0);

      // legacy mapping you already use
      const work_completed_sqft = u === "cubic" ? 0 : qty;
      const work_completed_cubic_meter = u === "cubic" ? qty : 0;

      // row-level workers (table mode)
      const skilled = Number(skilledStr || 0);
      const unskilled = Number(unskilledStr || 0);
      const rowWorkers = skilled + unskilled;

      return {
        ...baseParams,

        // ✅ override when table mode
        skilled_count: needsUnitTable ? skilled : baseParams.skilled_count,
        unskilled_count: needsUnitTable ? unskilled : baseParams.unskilled_count,
        num_workers: needsUnitTable ? rowWorkers : baseParams.num_workers,

        unit_type: u,
        work_completed_sqft,
        work_completed_cubic_meter,
      };
    };

    trackUI?.({
      screen: "LabourDetailsFormScreen",
      element: "submit",
      action: "attempt",
      extra: {
        isConnected,
        contractorOrLabour,
        contractorType,
        entryType,
        date: baseParams.date,
        phaseId,
        unitRows: needsUnitTable ? unitEntries.length : 1,
      },
    });

    const endpoint = `${API_BASE}/daily-work`;

    // ---------- CASE A: Contractor + ContractorType=Contractor -> MULTI ROW ----------
    if (needsUnitTable) {
      const rows = unitEntries;

      // offline -> enqueue N items, one per row
      if (isConnected === false) {
        for (let i = 0; i < rows.length; i++) {
          const payload = buildPayloadForUnit(
            rows[i].unit_type,
            rows[i].quantity,
            rows[i].skilled_count,
            rows[i].unskilled_count
          );

          await enqueueOutbox({
            url: endpoint,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-client-sync-mode": "offline_replay",
              "x-client-request-source": DAILY_WORK_REQUEST_SOURCE,
            },
            body: payload,
          });
        }

        const q = await readOutbox();
        setPendingCount(q.length);
        setIsSuccess(true);

        trackUI?.({
          screen: "LabourDetailsFormScreen",
          element: "outbox",
          action: "enqueue_offline_multi_units",
          extra: { rows: rows.length, pending: q.length },
        });

        showDialog(
          `No internet. Saved ${rows.length} unit row${rows.length === 1 ? "" : "s"} offline — we’ll send when you’re back online.`
        );
        resetFields();
        return;
      }

      // online -> POST N times
      const startedAt = Date.now();
      const results: { row: number; ok: boolean; status?: number; error?: string }[] = [];

      for (let i = 0; i < rows.length; i++) {
        const payload = buildPayloadForUnit(
          rows[i].unit_type,
          rows[i].quantity,
          rows[i].skilled_count,
          rows[i].unskilled_count
        );

        try {
          const res = await authenticatedFetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-client-sync-mode": "online_live",
              "x-client-request-source": DAILY_WORK_REQUEST_SOURCE,
            },
            body: JSON.stringify(payload),
          });

          results.push({ row: i + 1, ok: res.ok, status: res.status });

          trackNetwork?.({
            url: endpoint,
            method: "POST",
            status: res.status,
            durationMs: Date.now() - startedAt,
            ok: res.ok,
            extra: { screen: "LabourDetailsFormScreen", unit_row: i + 1 },
          });

          if (!res.ok) {
            await enqueueOutbox({
              url: endpoint,
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-client-sync-mode": "offline_replay",
                "x-client-request-source": DAILY_WORK_REQUEST_SOURCE,
              },
              body: payload,
            });
          }
        } catch (e: any) {
          results.push({ row: i + 1, ok: false, error: e?.message ?? "network_error" });

          await enqueueOutbox({
            url: endpoint,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-client-sync-mode": "offline_replay",
              "x-client-request-source": DAILY_WORK_REQUEST_SOURCE,
            },
            body: payload,
          });

          trackUI?.({
            screen: "LabourDetailsFormScreen",
            element: "submit",
            action: "network_error_row_enqueued",
            extra: { row: i + 1, message: e?.message ?? "network_error" },
          });
        }
      }

      const failed = results.filter((r) => !r.ok);

      if (failed.length === 0) {
        setIsSuccess(true);
        trackUI?.({
          screen: "LabourDetailsFormScreen",
          element: "submit",
          action: "success_multi_units",
          extra: { rows: rows.length },
        });

        showDialog(`Saved ${rows.length} unit row${rows.length === 1 ? "" : "s"} successfully!`);
        resetFields();
        processOutbox(setPendingCount, { reason: "multi_units_post_success_flush" });
        return;
      }

      // partial failures -> keep retry queued
      const q = await readOutbox();
      setPendingCount(q.length);
      setIsSuccess(true);

      const failedRowsText = failed.map((f) => `#${f.row}`).join(", ");

      trackUI?.({
        screen: "LabourDetailsFormScreen",
        element: "submit",
        action: "partial_success_multi_units",
        extra: { total: rows.length, failed: failed.length, failedRows: failedRowsText, pending: q.length },
      });

      showDialog(
        `Saved ${rows.length - failed.length}/${rows.length} rows. Failed rows (${failedRowsText}) saved offline — will retry automatically.`
      );
      resetFields();
      return;
    }

    // ---------- CASE B: everything else -> SINGLE POST ----------
    const singlePayload = buildPayloadForUnit(unitType, sqUnit);

    const req = {
      url: endpoint,
      method: "POST" as const,
      headers: {
        "Content-Type": "application/json",
        "x-client-sync-mode": "online_live",
        "x-client-request-source": DAILY_WORK_REQUEST_SOURCE,
      },
      body: singlePayload,
    };

    if (isConnected === false) {
      const id = await enqueueOutbox(req);
      const q = await readOutbox();
      setPendingCount(q.length);
      setIsSuccess(true);

      trackUI?.({
        screen: "LabourDetailsFormScreen",
        element: "outbox",
        action: "enqueue_offline",
        extra: { outbox_id: id, pending: q.length },
      });

      showDialog("No internet. Saved offline — we’ll send it automatically when you’re back online.");
      resetFields();
      return;
    }

    const startedAt = Date.now();
    try {
      const response = await authenticatedFetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: JSON.stringify(req.body),
      });

      const durationMs = Date.now() - startedAt;

      trackNetwork?.({
        url: req.url,
        method: "POST",
        status: response.status,
        durationMs,
        ok: response.ok,
        extra: { screen: "LabourDetailsFormScreen" },
      });

      if (response.ok) {
        setIsSuccess(true);
        showDialog(`${contractorOrLabour} details saved!`);

        trackUI?.({
          screen: "LabourDetailsFormScreen",
          element: "submit",
          action: "success",
          extra: { durationMs },
        });

        resetFields();
        processOutbox(setPendingCount, { reason: "post_success_flush" });
      } else {
        const id = await enqueueOutbox(req);
        const q = await readOutbox();
        setPendingCount(q.length);
        setIsSuccess(true);

        trackUI?.({
          screen: "LabourDetailsFormScreen",
          element: "submit",
          action: "server_failed_enqueued",
          extra: { status: response.status, outbox_id: id, pending: q.length },
        });

        showDialog("Server failed. Saved offline — will retry automatically.");
        resetFields();
      }
    } catch (e: any) {
      const id = await enqueueOutbox(req);
      const q = await readOutbox();
      setPendingCount(q.length);
      setIsSuccess(true);

      trackUI?.({
        screen: "LabourDetailsFormScreen",
        element: "submit",
        action: "network_error_enqueued",
        extra: { message: e?.message ?? "network_error", outbox_id: id, pending: q.length },
      });

      showDialog("Network error. Saved offline — will retry automatically.");
      resetFields();
    }
  };

  /* --------------------------------- UI bits -------------------------------- */

  const resetFields = () => {
    setContractorOrLabour("Contractor");
    setContractorName(contractors[0]?.contractor_name || "");
    setContractorId(contractors[0]?.contractor_id || "");
    setLabourName(labors[0]?.labor_name || "");
    setLabourId(labors[0]?.labor_id || "");
    setContractorType("Contractor");

    setUnitType("sqft");

    // reset table to one clean row
    setUnitEntries([makeUnitEntry("sqft")]);

    setWorkerType(workTypes[0]?.work_type_name || "");
    setWorkDurationType("hourly");
    setDayType("");
    setNumHours("0");

    // legacy fields
    setSkilledCount("");
    setUnskilledCount("");
    setSqUnit("0");

    const today = new Date();
    const cleanToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    setSelectedDate(cleanToday);

    setRemarks("");
    setPhaseId("");
    setPhaseName("");

    trackUI?.({
      screen: "LabourDetailsFormScreen",
      element: "form",
      action: "reset",
      extra: {},
    });
  };

  const calculateCurrentWeekDates = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const base = new Date(startOfWeek);
    const dates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d;
    });

    setCurrentWeekDates(dates);
    setSelectedDate(today);
  };

  const formatDate = (date: Date | null) => {
    if (!date) return "Select a Date";
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  };

  const showOfflineBanner = useMemo(
    () =>
      isConnected === false &&
      (contractors.length > 0 || labors.length > 0 || workTypes.length > 0),
    [isConnected, contractors.length, labors.length, workTypes.length]
  );

  /* --------------------------------- Render -------------------------------- */

  return (
    <View style={styles.root} testID="app-labour-details-form-screen-root">
      {/* Header */}
      <View style={styles.headerContainer}>
        <TouchableOpacity
          onPress={() => {
            trackUI?.({ screen: "LabourDetailsFormScreen", element: "back", action: "click", extra: {} });
            router.back();
          }} testID="app-labour-details-form-screen-button-2"
        >
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>

        <TText style={styles.headerTitle}>Labour / Contractor</TText>

        <TouchableOpacity
          onPress={() => {
            trackUI?.({ screen: "LabourDetailsFormScreen", element: "home", action: "click", extra: {} });
            router.push("/HomeScreen");
          }} testID="app-labour-details-form-screen-button-3"
        >
          <Ionicons name="home" size={24} color={C.text} />
        </TouchableOpacity>
      </View>

      {/* Pending outbox banner */}
      {pendingCount > 0 ? (
        <View style={styles.bannerInfo}>
          <TText style={styles.bannerInfoTitle}>
            {pendingCount} item{observedPlural(pendingCount)} waiting to send
          </TText>
          <TText style={styles.bannerInfoSub}>
            {isConnected ? "Sending in the background…" : "Will auto-send when you’re back online."}
          </TText>
        </View>
      ) : null}

      {/* Offline cached banner */}
      {showOfflineBanner ? (
        <View style={styles.bannerWarn}>
          <TText style={styles.bannerWarnTitle}>Offline — showing cached lists</TText>
        </View>
      ) : null}

      <ScrollView style={styles.page} contentContainerStyle={styles.pageContent} testID="app-labour-details-form-screen-scroll-view-1">
        <View style={styles.card}>
          {/* Contractor/Labour dropdown */}
          {contractorOrLabour === "Contractor" ? (
            <Field label="Contractor" styles={styles}>
              <MS
                data={
                  contractors.length > 0
                    ? contractors.map(({ contractor_id, contractor_name }) => ({
                      key: contractor_id,
                      label: contractor_name,
                    }))
                    : [{ key: "no_data", label: "No contractors found" }]
                }
                initValue={contractorName || "Select Contractor"}
                initValueTextStyle={styles.msSelectText}
                onChange={(option: any) => {
                  if (option.key !== "no_data") {
                    trackUI?.({
                      screen: "LabourDetailsFormScreen",
                      element: "contractor_select",
                      action: "change",
                      extra: { contractor_id: option.key, contractor_name: option.label },
                    });
                    setContractorName(option.label);
                    setContractorId(option.key as string);
                  }
                }}
                disabled={contractors.length === 0}
                style={styles.msOuter}
                selectStyle={styles.msSelect}
                selectTextStyle={styles.msSelectText}
                cancelText="Cancel"
                {...modalSelectorThemeProps}
              />
            </Field>
          ) : (
            <Field label="Labour" styles={styles}>
              <MS
                data={
                  labors.length > 0
                    ? labors.map(({ labor_id, labor_name }) => ({
                      key: labor_id,
                      label: labor_name,
                    }))
                    : [{ key: "no_data", label: "No labors found" }]
                }
                initValue={labourName || "Select Labour"}
                initValueTextStyle={styles.msSelectText}
                onChange={(option: any) => {
                  if (option.key !== "no_data") {
                    trackUI?.({
                      screen: "LabourDetailsFormScreen",
                      element: "labour_select",
                      action: "change",
                      extra: { labour_id: option.key, labour_name: option.label },
                    });
                    setLabourName(option.label);
                    setLabourId(option.key as string);
                  }
                }}
                disabled={labors.length === 0}
                style={styles.msOuter}
                selectStyle={styles.msSelect}
                selectTextStyle={styles.msSelectText}
                cancelText="Cancel"
                {...modalSelectorThemeProps}
              />
            </Field>
          )}

          {/* Phase */}
          <View style={{ flex: 1 }}>
            <Field label="Project Phase" styles={styles}>
              <MS
                data={
                  phases.length > 0
                    ? phases.map(({ phase_id, phase_name }) => ({
                      key: phase_id,
                      label: phase_name,
                    }))
                    : [{ key: "no_data", label: "No in-progress phases" }]
                }
                initValue={phaseName || "Select Phase"}
                initValueTextStyle={styles.msSelectText}
                onChange={(option: any) => {
                  if (option.key !== "no_data") {
                    trackUI?.({
                      screen: "LabourDetailsFormScreen",
                      element: "phase_select",
                      action: "change",
                      extra: { phase_id: option.key, phase_name: option.label },
                    });
                    setPhaseId(option.key as string);
                    setPhaseName(option.label);
                  }
                }}
                disabled={phases.length === 0}
                style={styles.msOuter}
                selectStyle={styles.msSelect}
                selectTextStyle={styles.msSelectText}
                cancelText="Cancel"
                {...modalSelectorThemeProps}
              />
            </Field>
          </View>

          {/* Billing Duration + Contract Category */}
          <TwoCol
            styles={styles}
            left={
              <View style={{ flex: 1 }}>
                <Field label="Billing Duration" styles={styles}>
                  <MS
                    data={
                      [
                        { key: "hourly", label: "Hourly" },
                        { key: "daily", label: "Daily" },
                      ] as any
                    }
                    initValue={workDurationType === "hourly" ? "Hourly" : "Daily"}
                    initValueTextStyle={styles.msSelectText}
                    onChange={(option: any) => {
                      trackUI?.({
                        screen: "LabourDetailsFormScreen",
                        element: "workDurationType",
                        action: "change",
                        extra: { to: option.key },
                      });

                      const next = option.key as WorkDuration;
                      setWorkDurationType(next);

                      if (next === "hourly") {
                        setDayType("");
                      } else {
                        setNumHours("0");
                        setDayType("full");
                      }
                    }}
                    style={styles.msOuter}
                    selectStyle={styles.msSelect}
                    selectTextStyle={styles.msSelectText}
                    cancelText="Cancel"
                    {...modalSelectorThemeProps}
                  />
                </Field>
              </View>
            }
            right={
              <View style={{ flex: 1 }}>
                <Field label="Contract Category" styles={styles}>
                  <MS
                    data={
                      [
                        { key: "Contractor", label: "Contractor" },
                        { key: "NMR", label: "NMR" },
                      ] as any
                    }
                    initValue={contractorType}
                    initValueTextStyle={styles.msSelectText}
                    onChange={(option: any) => {
                      trackUI?.({
                        screen: "LabourDetailsFormScreen",
                        element: "contractorType",
                        action: "change",
                        extra: { to: option.key },
                      });
                      setContractorType(option.key as ContractorType);
                    }}
                    style={styles.msOuter}
                    selectStyle={styles.msSelect}
                    selectTextStyle={styles.msSelectText}
                    cancelText="Cancel"
                    {...modalSelectorThemeProps}
                  />
                </Field>
              </View>
            }
          />

          {/* Start Date + Work Type */}
          <TwoCol
            styles={styles}
            left={
              <View style={{ flex: 1 }}>
                <Field label="Start Date" styles={styles}>
                  <MS
                    data={currentWeekDates.map((date) => ({
                      key: String(date.getTime()),
                      label: formatDate(date),
                    }))}
                    initValue={selectedDate ? formatDate(selectedDate) : "Select a Date"}
                    initValueTextStyle={styles.msSelectText}
                    onChange={(option: any) => {
                      trackUI?.({
                        screen: "LabourDetailsFormScreen",
                        element: "date_select",
                        action: "change",
                        extra: { to: option.label },
                      });
                      setSelectedDate(new Date(Number(option.key)));
                    }}
                    style={styles.msOuter}
                    selectStyle={styles.msSelect}
                    selectTextStyle={styles.msSelectText}
                    cancelText="Cancel"
                    {...modalSelectorThemeProps}
                  />
                </Field>
              </View>
            }
            right={
              <View style={{ flex: 1 }}>
                <Field label="Work Type" styles={styles}>
                  <MS
                    data={
                      [
                        { key: "Regular", label: "Regular" },
                        { key: "Avenue Add On", label: "Avenue Add On" },
                        { key: "Customer Add On", label: "Customer Add On" },
                      ] as any
                    }
                    initValue={entryType}
                    initValueTextStyle={styles.msSelectText}
                    onChange={(option: any) => {
                      trackUI?.({
                        screen: "LabourDetailsFormScreen",
                        element: "entryType",
                        action: "change",
                        extra: { to: option.key },
                      });
                      setEntryType(option.key as EntryType);
                    }}
                    style={styles.msOuter}
                    selectStyle={styles.msSelect}
                    selectTextStyle={styles.msSelectText}
                    cancelText="Cancel"
                    {...modalSelectorThemeProps}
                  />
                </Field>
              </View>
            }
          />

          {/* ✅ Skilled/Unskilled global inputs only when NOT in table mode */}
          {!needsUnitTable ? (
            <>
              <TwoCol
                styles={styles}
                left={
                  <View style={{ flex: 1 }}>
                    <Field label="No. Skilled Workers" styles={styles}>
                      <TextInput
                        style={styles.textInput}
                        value={skilledCount}
                        onChangeText={(v) => {
                          setSkilledCount(v);
                          const now = Date.now();
                          if (
                            now - lastQtyLogRef.current.at > 900 &&
                            lastQtyLogRef.current.len !== v.length
                          ) {
                            lastQtyLogRef.current = { at: now, len: v.length };
                            trackUI?.({
                              screen: "LabourDetailsFormScreen",
                              element: "skilledCount",
                              action: "change",
                              extra: { len: v.length },
                            });
                          }
                        }}
                        keyboardType={Platform.select({
                          ios: "decimal-pad",
                          android: "numeric",
                          default: "decimal-pad",
                        }) as KeyboardTypeOptions}
                        inputMode={Platform.OS === "web" ? "decimal" : undefined}
                        placeholder="0"
                        placeholderTextColor={C.subtleText} testID="app-labour-details-form-screen-input-1"
                      />
                    </Field>
                  </View>
                }
                right={
                  <View style={{ flex: 1 }}>
                    <Field label="No.Unskilled Workers" styles={styles}>
                      <TextInput
                        style={styles.textInput}
                        value={unskilledCount}
                        onChangeText={(v) => {
                          setUnskilledCount(v);
                          const now = Date.now();
                          if (
                            now - lastQtyLogRef.current.at > 900 &&
                            lastQtyLogRef.current.len !== v.length
                          ) {
                            lastQtyLogRef.current = { at: now, len: v.length };
                            trackUI?.({
                              screen: "LabourDetailsFormScreen",
                              element: "unskilledCount",
                              action: "change",
                              extra: { len: v.length },
                            });
                          }
                        }}
                        keyboardType={Platform.select({
                          ios: "decimal-pad",
                          android: "numeric",
                          default: "decimal-pad",
                        }) as KeyboardTypeOptions}
                        inputMode={Platform.OS === "web" ? "decimal" : undefined}
                        placeholder="0"
                        placeholderTextColor={C.subtleText} testID="app-labour-details-form-screen-input-2"
                      />
                    </Field>
                  </View>
                }
              />

              <TwoCol
                styles={styles}
                left={
                  <Field label="No. of Workers" styles={styles}>
                    <View style={styles.readOnlyBox}>
                      <TText style={styles.readOnlyText}>{totalWorkers}</TText>
                    </View>
                  </Field>
                }
                right={
                  <View style={{ flex: 1 }}>
                    {workDurationType === "hourly" ? (
                      <Field label="Total Work Hours" styles={styles}>
                      <TextInput
                        style={styles.textInput}
                        value={numHours}
                        onChangeText={(v) => setNumHours(v)}
                        keyboardType={Platform.select({
                          ios: "decimal-pad",
                          android: "numeric",
                          default: "decimal-pad",
                        }) as KeyboardTypeOptions}
                        inputMode={Platform.OS === "web" ? "decimal" : undefined}
                        placeholder="0"
                        placeholderTextColor={C.subtleText}
                        testID="app-labour-details-form-screen-input-3"
                      />
                      </Field>
                    ) : (
                      <Field label="Total Work Hours" styles={styles}>
                        <MS
                          data={[
                            { key: "half", label: "Half Day" },
                            { key: "full", label: "Full Day" },
                          ] as any}
                          initValue={
                            dayType === "half"
                              ? "Half Day"
                              : dayType === "full"
                                ? "Full Day"
                                : "Select"
                          }
                          initValueTextStyle={styles.msSelectText}
                          onChange={(option: any) => {
                            setDayType(option.key as DayType);
                            if (option.key === "half") setNumHours("4");
                            if (option.key === "full") setNumHours("8");
                          }}
                          style={styles.msOuter}
                          selectStyle={styles.msSelect}
                          selectTextStyle={styles.msSelectText}
                          cancelText="Cancel"
                          {...modalSelectorThemeProps}
                        />
                      </Field>
                    )}
                  </View>
                }
              />
            </>
          ) : (
            // ✅ In table mode: show only Total Workers (read-only) + hours/day
            <TwoCol
              styles={styles}
              left={
                <Field label="Total Workers" styles={styles}>
                  <View style={styles.readOnlyBox}>
                    <TText style={styles.readOnlyText}>{totalWorkers}</TText>
                  </View>
                </Field>
              }
              right={
                <View style={{ flex: 1 }}>
                  {workDurationType === "hourly" ? (
                    <Field label="Total Work Hours" styles={styles}>
                    <TextInput
                      style={styles.textInput}
                      value={numHours}
                      onChangeText={(v) => setNumHours(v)}
                      keyboardType={Platform.select({
                        ios: "decimal-pad",
                        android: "numeric",
                        default: "decimal-pad",
                      }) as KeyboardTypeOptions}
                      inputMode={Platform.OS === "web" ? "decimal" : undefined}
                      placeholder="0"
                      placeholderTextColor={C.subtleText}
                      testID="app-labour-details-form-screen-input-4"
                    />
                    </Field>
                  ) : (
                    <Field label="Total Work Hours" styles={styles}>
                      <MS
                        data={[
                          { key: "half", label: "Half Day" },
                          { key: "full", label: "Full Day" },
                        ] as any}
                        initValue={
                          dayType === "half"
                            ? "Half Day"
                            : dayType === "full"
                              ? "Full Day"
                              : "Select"
                        }
                        initValueTextStyle={styles.msSelectText}
                        onChange={(option: any) => {
                          setDayType(option.key as DayType);
                          if (option.key === "half") setNumHours("4");
                          if (option.key === "full") setNumHours("8");
                        }}
                        style={styles.msOuter}
                        selectStyle={styles.msSelect}
                        selectTextStyle={styles.msSelectText}
                        cancelText="Cancel"
                        {...modalSelectorThemeProps}
                      />
                    </Field>
                  )}
                </View>
              }
            />
          )}

          {/* ✅ Unit table with Qty + Skilled + Unskilled per row */}
          {needsUnitTable ? (
            <View style={styles.unitsWrap}>
              <View style={styles.unitsHeaderRow}>
                <TText style={styles.unitsTitle}>Unit of Measurements</TText>

                <TouchableOpacity
                  style={styles.addUnitBtn}
                  onPress={() => {
                    setUnitEntries((prev) => [
                      ...prev,
                      makeUnitEntry(prev[prev.length - 1]?.unit_type || "sqft"),
                    ]);
                    trackUI?.({
                      screen: "LabourDetailsFormScreen",
                      element: "unit_add",
                      action: "click",
                      extra: {},
                    });
                  }}
                  activeOpacity={0.85} testID="app-labour-details-form-screen-button-4"
                >
                  <Ionicons name="add" size={18} color={C.white} />
                  <TText style={styles.addUnitBtnText}>Add</TText>
                </TouchableOpacity>
              </View>

              <View style={styles.unitsTableHead}>
                <View style={[styles.unitsCell, { width: COL_UNIT }]}>
                  <TText style={styles.unitsColHead}>Unit Type</TText>
                </View>

                <View style={[styles.unitsCell, { width: COL_QTY }]}>
                  <TText style={styles.unitsColHeadCenter}>Qty</TText>
                </View>

                <View style={[styles.unitsCell, { width: COL_SK }]}>
                  <TText style={styles.unitsColHeadCenter}>Skilled</TText>
                </View>

                <View style={[styles.unitsCell, { width: COL_UN }]}>
                  <TText style={styles.unitsColHeadCenter}>Unskilled</TText>
                </View>

                <View style={[styles.unitsCell, { width: COL_ACTION }]} />
              </View>

              {unitEntries.map((entry, idx) => (
                <View key={entry.id} style={styles.unitsRow}>
                  {/* Unit Type */}
                  <View style={[styles.unitsCell, { width: COL_UNIT }]}>
                    <MS
                      data={UNIT_TYPE_OPTIONS as any}
                      initValue={unitLabel(entry.unit_type)}
                      initValueTextStyle={styles.msSelectText}
                      onChange={(option: any) => {
                        setUnitEntries((prev) =>
                          prev.map((x) =>
                            x.id === entry.id ? { ...x, unit_type: option.key as UnitType } : x
                          )
                        );
                        trackUI?.({
                          screen: "LabourDetailsFormScreen",
                          element: "unit_type_row",
                          action: "change",
                          extra: { row: idx + 1, to: option.key },
                        });
                      }}
                      style={styles.msOuter}
                      selectStyle={styles.msSelectCompactMerged}
                      selectTextStyle={styles.msSelectText}
                      optionTextStyle={styles.msOptionText}
                      cancelText="Cancel"
                    />
                  </View>

                  {/* Qty */}
                  <View style={[styles.unitsCell, { width: COL_QTY }]}>
                    <TextInput
                      style={[styles.textInput, styles.textInputCompact, styles.centerInput]}
                      value={entry.quantity}
                      onChangeText={(v) =>
                        setUnitEntries((prev) =>
                          prev.map((x) => (x.id === entry.id ? { ...x, quantity: v } : x))
                        )
                      }
                      keyboardType={Platform.select({
                        ios: "decimal-pad",
                        android: "numeric",
                        default: "decimal-pad",
                      }) as KeyboardTypeOptions}
                      inputMode={Platform.OS === "web" ? "decimal" : undefined}
                      placeholder="0"
                      placeholderTextColor={C.subtleText} testID={`app-labour-details-form-screen-input-5-${entry.id}`}
                    />
                  </View>

                  {/* Skilled */}
                  <View style={[styles.unitsCell, { width: COL_SK }]}>
                    <TextInput
                      style={[styles.textInput, styles.textInputCompact, styles.centerInput]}
                      value={entry.skilled_count}
                      onChangeText={(v) =>
                        setUnitEntries((prev) =>
                          prev.map((x) => (x.id === entry.id ? { ...x, skilled_count: v } : x))
                        )
                      }
                      keyboardType={Platform.select({
                        ios: "number-pad",
                        android: "numeric",
                        default: "number-pad",
                      }) as KeyboardTypeOptions}
                      placeholder="0"
                      placeholderTextColor={C.subtleText} testID={`app-labour-details-form-screen-input-6-${entry.id}`}
                    />
                  </View>

                  {/* Unskilled */}
                  <View style={[styles.unitsCell, { width: COL_UN }]}>
                    <TextInput
                      style={[styles.textInput, styles.textInputCompact, styles.centerInput]}
                      value={entry.unskilled_count}
                      onChangeText={(v) =>
                        setUnitEntries((prev) =>
                          prev.map((x) => (x.id === entry.id ? { ...x, unskilled_count: v } : x))
                        )
                      }
                      keyboardType={Platform.select({
                        ios: "number-pad",
                        android: "numeric",
                        default: "number-pad",
                      }) as KeyboardTypeOptions}
                      placeholder="0"
                      placeholderTextColor={C.subtleText} testID={`app-labour-details-form-screen-input-7-${entry.id}`}
                    />
                  </View>

                  {/* Delete */}
                  <View style={[styles.unitsCell, { width: COL_ACTION }]}>
                    <TouchableOpacity
                      style={[
                        styles.removeUnitBtn,
                        unitEntries.length === 1 ? styles.removeUnitBtnDisabled : null,
                      ]}
                      disabled={unitEntries.length === 1}
                      onPress={() => {
                        setUnitEntries((prev) => prev.filter((x) => x.id !== entry.id));
                        trackUI?.({
                          screen: "LabourDetailsFormScreen",
                          element: "unit_remove",
                          action: "click",
                          extra: { row: idx + 1 },
                        });
                      }}
                      activeOpacity={0.85} testID={`app-labour-details-form-screen-button-5-${entry.id}`}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={20}
                        color={unitEntries.length === 1 ? C.subtleText : C.danger}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {/* Remarks */}
          <Field label="Remarks / Notes" styles={styles}>
            <TextInput
              style={[styles.textInput, styles.notesInput]}
              value={remarks}
              onChangeText={(t) => {
                setRemarks(t);
                const now = Date.now();
                if (now - lastRemarksLogRef.current.at > 1200 && lastRemarksLogRef.current.len !== t.length) {
                  lastRemarksLogRef.current = { at: now, len: t.length };
                  trackUI?.({
                    screen: "LabourDetailsFormScreen",
                    element: "remarks",
                    action: "change",
                    extra: { len: t.length },
                  });
                }
              }}
              placeholder="Add notes…"
              placeholderTextColor={C.subtleText} testID="app-labour-details-form-screen-input-8"
            />
          </Field>

          {/* Submit */}
          <TouchableOpacity
            style={styles.submitButton}
            onPress={() => {
              trackUI?.({
                screen: "LabourDetailsFormScreen",
                element: "submit",
                action: "click",
                extra: {},
              });
              handleSubmit();
            }} testID="app-labour-details-form-screen-button-6"
          >
            <TText style={styles.submitButtonText}>Submit</TText>
          </TouchableOpacity>
        </View>

        <DialogBox
          visible={dialogVisible}
          onClose={() => setDialogVisible(false)}
          message={dialogMessage}
          isSuccess={isSuccess}
          onSuccessClose={resetFields}
          styles={styles}
        />
      </ScrollView>
    </View>
  );
};

function observedPlural(n: number) {
  return n === 1 ? "" : "s";
}

const createStyles = (C: ReturnType<typeof useTheme>["theme"]["colors"]) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  page: { flex: 1, backgroundColor: C.bg },
  pageContent: { padding: 14, paddingBottom: 28 },
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  fieldWrap: {
    backgroundColor: C.card,
    minHeight: 35,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    position: "relative",
  },
  fieldLabel: {
    fontSize: 11,
    color: C.mutedText,
    marginBottom: 6,
    fontWeight: "600",
  },

  twoColRow: { flexDirection: "row", alignItems: "flex-start" },
  twoColGap: { width: 12 },

  textInput: {
    backgroundColor: C.inputBg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    minHeight: 35,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    position: "relative",
    color: C.text,
  },

  notesInput: { minHeight: 44 },

  msOuter: { borderRadius: 12 },
  msSelect: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "center",
    color: C.text,
    minHeight: 35,
  },
  msSelectText: { fontSize: 11, color: C.text, fontWeight: "800" },
  msOptionText: { fontSize: 11, color: C.text },

  readOnlyBox: {
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  readOnlyText: { fontSize: 11, color: C.text, fontWeight: "700" },

  submitButton: {
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 10,
  },
  submitButtonText: { color: C.white, fontWeight: "800", fontSize: 16 },

  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: C.overlayStrong,
  },
  dialogBox: {
    width: "82%",
    padding: 18,
    backgroundColor: C.surface,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
  },
  dialogMessage: { fontSize: 16, marginBottom: 16, textAlign: "center", color: C.text },
  dialogButton: {
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: C.primary,
  },
  dialogButtonText: { color: C.white, fontWeight: "700" },

  headerTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "bold", color: C.text },
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: C.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },

  bannerInfo: {
    paddingVertical: 8,
    backgroundColor: C.primarySoft,
    borderBottomColor: C.border,
    borderBottomWidth: 1,
    paddingHorizontal: 12,
  },
  bannerInfoTitle: { textAlign: "center", color: C.text, fontWeight: "800" },
  bannerInfoSub: { textAlign: "center", color: C.mutedText, marginTop: 2, fontSize: 12 },

  unitsWrap: { marginTop: 6, marginBottom: 14 },

  unitsHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },

  unitsTitle: { fontSize: 11, fontWeight: "700", color: C.text },

  addUnitBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: C.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
  },

  addUnitBtnText: { color: C.white, fontWeight: "700", fontSize: 10 },
  unitsTableHead: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 3,
    paddingHorizontal: 2,
  },

  unitsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 3,
    paddingHorizontal: 2,
  },

  unitsCell: {
    marginRight: 5,
    justifyContent: "center",
  },

  unitsColHead: {
    fontSize: 10,
    fontWeight: "700",
    color: C.mutedText,
  },

  unitsColHeadCenter: {
    fontSize: 10,
    fontWeight: "700",
    color: C.mutedText,
    textAlign: "center",
  },

  msSelectCompact: {
    paddingVertical: 8,
    minHeight: 44,
  },

  msSelectCompactMerged: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: "center",
    color: C.text,
    minHeight: 44,
  },

  textInputCompact: {
    minHeight: 44,
    paddingVertical: 8,
  },

  centerInput: {
    textAlign: "center",
  },

  removeUnitBtn: {
    width: 46,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: C.inputBg,
    borderWidth: 1,
    borderColor: C.border,
  },

  removeUnitBtnDisabled: { opacity: 0.6 },

  bannerWarn: {
    paddingVertical: 8,
    backgroundColor: C.pill,
    borderBottomColor: C.border,
    borderBottomWidth: 1,
    paddingHorizontal: 12,
  },
  bannerWarnTitle: { textAlign: "center", color: C.text, fontWeight: "800" },
});

export default LabourDetailsFormScreen;
