// app/TaskManagementForm.tsx
import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import {
  View,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Linking,
  Image,
  Modal,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  BackHandler,
  Dimensions,
  Keyboard,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import axios from "axios";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import ModalSelector from "react-native-modal-selector";
import * as mime from "react-native-mime-types";
import { ReactNativeZoomableView } from "@openspacelabs/react-native-zoomable-view";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { API_BASE_URL } from "../utils/apiBase";
import { authenticatedFetch } from "../utils/auth";
import { initOutbox, enqueue, cacheFileIfNeeded, flush, OutboxItem } from "../utils/outbox";
import {
  trackScreen,
  trackUI,
  trackEvent,
  updateDynamicContext,
  clearDynamicContext,
  flushTelemetry,
} from "../utils/telemetry";
import {
  buildPropertyRouteContext,
  parseRouteUserDetails,
  toPropertyRouteParams,
} from "../utils/propertyRouteContext";
import { buildScheduleLockState, findBlockingAncestor, isOnHoldStatus } from "@/utils/scheduleLocks";
import TText from "@/components/TText";
import AppFooterNav, { FooterNavItem } from "./AppFooterNav";
import { useSpeechToText } from "@/utils/useSpeechToText";
import { useTheme } from "@/src/theme/ThemeProvider";

axios.defaults.baseURL = API_BASE_URL;

if (__DEV__) {
  console.log("[TMF] API_BASE_URL =", API_BASE_URL);
}

// --- CONFIG CONSTANTS ---
const SCHEDULE_API_TIMEOUT_MS = 30000;
const FILE_UPLOAD_API_TIMEOUT_MS = 60000;
const CHAT_API_TIMEOUT_MS = 30000;

// ----------------- Types -----------------
type TaskManagementFormRouteParams = {
  propertyId?: string;
  projectId?: string;
  propertyName?: string;
  projectLocation?: string;
  userDetails?: string;
  schedule_id?: string;
  schedule?: string;
  fromNotification?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  job_title?: string;
  employee_code?: string;
  phone_number?: string;
  isLocked?: string;
  lockingParentName?: string;
};

type Schedule = {
  scheduleid: number;
  phasename: string;
  status: string;
  remarks: string;
  startdate: string;
  enddate: string;
  property_id?: string;
  task_id?: string;
  depends_on_scheduleid?: number[] | null;
};

// ----------------- Helpers -----------------
const isWeb = Platform.OS === "web";

const IMAGE_OPT_MAX_WIDTH = 1600;
const IMAGE_OPT_COMPRESS = 0.7;

async function optimizeImageForUpload(input: { uri: string; name: string }) {
  try {
    const safeName = input.name?.trim() ? input.name : `image_${Date.now()}.jpg`;
    const outName = safeName.toLowerCase().endsWith(".jpg") || safeName.toLowerCase().endsWith(".jpeg")
      ? safeName
      : safeName.replace(/\.[a-z0-9]+$/i, "") + ".jpg";

    let ImageManipulator: any = null;
    try {
      ImageManipulator = require("expo-image-manipulator");
    } catch {
      ImageManipulator = null;
    }

    if (!ImageManipulator?.manipulateAsync || !ImageManipulator?.SaveFormat?.JPEG) {
      return { uri: input.uri, name: outName, type: "image/jpeg" as const };
    }

    const result = await ImageManipulator.manipulateAsync(
      input.uri,
      [{ resize: { width: IMAGE_OPT_MAX_WIDTH } }],
      { compress: IMAGE_OPT_COMPRESS, format: ImageManipulator.SaveFormat.JPEG }
    );

    return { uri: result.uri, name: outName, type: "image/jpeg" as const };
  } catch {
    return { uri: input.uri, name: input.name, type: "image/jpeg" as const };
  }
}

const isImageUrl = (url: string): boolean => {
  if (!url) return false;
  const clean = url.split("?")[0];
  return /\.(jpe?g|png|gif|webp|heic)$/i.test(clean);
};

const isImageAttachment = (file: any): boolean => {
  if (!file) return false;
  const url = String(file.file_url || file.uri || "");
  const name = String(file.file_name || file.name || "");
  const type = String(file.type || "").toLowerCase();
  const hasImageExt = (s: string) => /\.(jpe?g|png|gif|webp|heic)$/i.test(s.split("?")[0] || "");
  if (hasImageExt(url) || hasImageExt(name)) return true;
  if (type.startsWith("image/")) return true;
  if (url.startsWith("data:image") || url.startsWith("blob:") || url.startsWith("file:")) return true;
  return false;
};

const isImageFileLocal = (file: any) => {
  const nm = (file?.name || "").toLowerCase();
  const type = (file?.type || "").toLowerCase();
  return (
    type.startsWith("image") ||
    nm.endsWith(".jpg") ||
    nm.endsWith(".jpeg") ||
    nm.endsWith(".png") ||
    nm.endsWith(".gif") ||
    nm.endsWith(".webp")
  );
};

const formatFileName = (propertyId: string, originalName: string): string => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = pad(now.getDate());
  const month = pad(now.getMonth() + 1);
  const year = now.getFullYear();
  let hours = now.getHours();
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());
  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12;
  hours = hours === 0 ? 12 : hours;
  const formattedTime = `${pad(hours)}-${minutes}-${seconds}_${ampm}`;
  const formattedDate = `${day}-${month}-${year}`;
  const extMatch = originalName.match(/\.[0-9a-z]+$/i);
  const ext = extMatch ? extMatch[0] : "";
  return `${propertyId}_${formattedDate}_${formattedTime}${ext}`;
};

const NAME_COLORS = [
  "#D32F2F","#1976D2","#388E3C","#F57C00","#7B1FA2",
  "#0097A7","#FBC02D","#5D4037","#0288D1","#C2185B",
];

const getColorForName = (name: string): string => {
  const hash = [...(name || "")].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return NAME_COLORS[hash % NAME_COLORS.length];
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const toDateOnly = (value?: string | Date | null) => {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const [, year, month, day] = match;
      return new Date(Number(year), Number(month) - 1, Number(day), 12);
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12);
    }
  }
  return new Date();
};
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const today = () => toDateOnly(new Date());
const yester = () => {
  const d = today();
  d.setDate(d.getDate() - 1);
  return d;
};
const isSameDay = (a: Date, b: Date) => ymd(a) === ymd(b);
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type PreparedUploadFile = { name: string; type: string; uri: string; file?: any };
type UploadPayload = { updateText: string; chatMessageText: string; files: PreparedUploadFile[] };
type LocalBubbleState = "uploading" | "pending" | "failed";

type WebBtn = { text: string; role?: "cancel" | "destructive" };
const webPrompt = (title: string, message: string, buttons: WebBtn[]): Promise<number> => {
  return new Promise((resolve) => {
    if (!isWeb) { resolve(-1); return; }
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
      position: "fixed", inset: "0", background: "rgba(0,0,0,0.35)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: "99999",
    } as Partial<CSSStyleDeclaration>);
    const card = document.createElement("div");
    Object.assign(card.style, {
      minWidth: "310px", maxWidth: "92vw", background: "#fff", color: "#111",
      borderRadius: "12px", padding: "16px", boxShadow: "0 8px 30px rgba(0,0,0,.25)",
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    } as Partial<CSSStyleDeclaration>);
    const h = document.createElement("div");
    h.textContent = title;
    Object.assign(h.style, { fontSize: "16px", fontWeight: "700", marginBottom: "6px" } as Partial<CSSStyleDeclaration>);
    const p = document.createElement("div");
    p.textContent = message;
    Object.assign(p.style, { fontSize: "14px", lineHeight: "1.4", marginBottom: "12px" } as Partial<CSSStyleDeclaration>);
    const row = document.createElement("div");
    Object.assign(row.style, { display: "flex", gap: "8px", justifyContent: "flex-end" } as Partial<CSSStyleDeclaration>);
    const close = (idx: number) => { try { document.body.removeChild(overlay); } catch { } resolve(idx); };
    buttons.forEach((b, idx) => {
      const btn = document.createElement("button");
      btn.textContent = b.text;
      Object.assign(btn.style, {
        padding: "8px 12px", fontSize: "14px", borderRadius: "8px",
        border: "1px solid #d0d0d0",
        background: b.role === "destructive" ? "#ffefef" : "#f6f8ff", cursor: "pointer",
      } as Partial<CSSStyleDeclaration>);
      btn.onclick = () => close(idx);
      row.appendChild(btn);
    });
    card.appendChild(h); card.appendChild(p); card.appendChild(row);
    overlay.appendChild(card); document.body.appendChild(overlay);
  });
};

const showAlert = async (title: string, message: string) => {
  if (isWeb) await webPrompt(title, message, [{ text: "OK" }]);
  else Alert.alert(title, message, [{ text: "OK" }]);
};

const showConfirm = async (
  title: string,
  message: string,
  choices: { text: string; role?: "cancel" | "destructive" }[]
): Promise<number> => {
  if (isWeb) return webPrompt(title, message, choices);
  return new Promise((resolve) => {
    Alert.alert(
      title, message,
      choices.map((c, idx) => ({
        text: c.text,
        style: c.role === "destructive" ? "destructive" : c.role === "cancel" ? "cancel" : "default",
        onPress: () => resolve(idx),
      })),
      { cancelable: true }
    );
  });
};

type Netish = {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
  type?: string;
  details?: { cellularGeneration?: "2g" | "3g" | "4g" | "5g" | "unknown"; downlink?: number; downlinkMax?: number; strength?: number } | null;
};

type ConnQuality = "offline" | "online";
const getConnectionQuality = (st: Netish | null | undefined): ConnQuality => {
  if (!st || !st.isConnected || st.isInternetReachable === false) return "offline";
  return "online";
};

const classifyPing = (ms: number | null) => {
  if (ms === null) return { label: "checking…", tone: "neutral" as const };
  if (ms <= 250) return { label: "good", tone: "good" as const };
  if (ms <= 800) return { label: "ok", tone: "warn" as const };
  return { label: "slow", tone: "bad" as const };
};

const fetchWithTimeout = async (input: RequestInfo | URL, init: RequestInit & { timeoutMs?: number } = {}) => {
  const { timeoutMs = CHAT_API_TIMEOUT_MS, ...rest } = init;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const requestUrl =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return await authenticatedFetch(requestUrl, { ...rest, signal: ctrl.signal });
  }
  finally { clearTimeout(t); }
};

const isTransientNetError = (err: any) => {
  if (err instanceof TypeError) return true;
  const msg = (err?.message || "").toLowerCase();
  const code = (err?.code || "").toLowerCase();
  return (
    code === "ecconnaborted" || code === "network_error" ||
    msg.includes("timeout") || msg.includes("network") || msg.includes("abort") ||
    msg.includes("failed to fetch") || msg.includes("connection") ||
    msg.includes("socket") || msg.includes("fetch")
  );
};

// ----------------- Component -----------------
const TaskManagementForm: React.FC = () => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo<ReturnType<typeof createStyles>>(() => createStyles(C), [C]);
  const updateInputStyles = useMemo(() => createUpdateInputStyles(C), [C]);
  const taskCardStyles = useMemo(() => createTaskCardStyles(C), [C]);
  const sheetStyles = useMemo(() => createSheetStyles(C), [C]);
  const recipientStyles = useMemo(() => createRecipientStyles(C), [C]);
  const webDateInputStyle = useMemo<React.CSSProperties>(() => ({
    ...(StyleSheet.flatten(styles.input) as any),
    width: "100%",
    minHeight: 34,
    boxSizing: "border-box",
    backgroundColor: C.surfaceAlt,
    color: C.text,
    border: "none",
    outline: "none",
    colorScheme: theme.mode,
    fontWeight: 600,
  }), [C.surfaceAlt, C.text, styles.input, theme.mode]);
  const params = useLocalSearchParams<TaskManagementFormRouteParams>();
  const router = useRouter();

  useEffect(() => {
    if (params?.fromNotification === "1") {
      console.log("📥 [TMF] Opened from notification:", { propertyId: params.propertyId, schedule_id: params.schedule_id });
    } else {
      console.log("📥 [TMF] Opened normally");
    }
  }, [params]);

  const scheduleString = params.schedule;
  const routeContext = useMemo(() => buildPropertyRouteContext(params), [params]);
  const routeUserDetails = useMemo(
    () => parseRouteUserDetails(params.userDetails) || routeContext.userDetails,
    [params.userDetails, routeContext.userDetails]
  );
  const firstName = params.first_name || routeUserDetails?.first_name || "";
  const lastName = params.last_name || routeUserDetails?.last_name || "";
  const employeeCode = params.employee_code || routeUserDetails?.employee_code || "";
  const propertyId = routeContext.propertyId || "";
  const schedule: Schedule | null = useMemo(
    () => {
      if (!scheduleString) return null;
      try {
        return JSON.parse(scheduleString);
      } catch {
        try {
          return JSON.parse(decodeURIComponent(scheduleString));
        } catch {
          return null;
        }
      }
    },
    [scheduleString]
  );

  const [updates, setUpdates] = useState<any[]>([]);
  const [pendingLocal, setPendingLocal] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean>(true);
  const [connQuality, setConnQuality] = useState<ConnQuality>("online");
  const [slowUpload, setSlowUpload] = useState<boolean>(false);
  const slowUploadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pingMs, setPingMs] = useState<number | null>(null);
  const pingInFlightRef = useRef<boolean>(false);
  const [phasename, setPhaseName] = useState(schedule?.phasename || "");
  const [status, setStatus] = useState(schedule?.status || "");
  const [startDate, setStartDate] = useState(schedule?.startdate ? toDateOnly(schedule.startdate) : today());
  const [endDate, setEndDate] = useState(schedule?.enddate ? toDateOnly(schedule.enddate) : today());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [applyToAll, setApplyToAll] = useState(true);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [newUpdateText, setNewUpdateText] = useState("");
  const [newUpdateFiles, setNewUpdateFiles] = useState<any[]>([]);
  const [cachedEmployee, setCachedEmployee] = useState<any | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [inputHeight, setInputHeight] = useState(35);
  const [selectedSendTarget, setSelectedSendTarget] = useState<"customer" | "employee">("employee");
  const [showRecipientSelector, setShowRecipientSelector] = useState(false);
  const modalSelectorRef = useRef<any>(null);
  const quickMsgSelectorRef = useRef<any>(null);
  const holdTypeSelectorRef = useRef<any>(null);
  const webStartInputRef = useRef<HTMLInputElement | null>(null);
  const webEndInputRef = useRef<HTMLInputElement | null>(null);

  const footerItems: FooterNavItem[] = [
    { id: 0, title: "Back", iconName: "arrow-back-outline" },
    { id: 2, title: "Schedules", iconName: "calendar-outline" },
    { id: 3, title: "Inventory", iconName: "list-outline" },
    { id: 4, title: "Labour", iconName: "people-outline" },
    { id: 5, title: "Documents", iconName: "document-text-outline" },
    { id: 7, title: "Review", iconName: "construct-outline" },
  ];

  const COLORS = {
    border: "#E6EAF2", accent: "#2C7BE5", accentSoft: "#E8F1FF",
    muted: "#6B7A90", disabledText: "#9AA0A6",
  };

  const [selectedSection, setSelectedSection] = useState<number>(2);
  const projectId = routeContext.projectId || "";
  const propertyName = routeContext.propertyName || "";
  const projectLocation = routeContext.projectLocation || "";

  const pingApi = useCallback(async () => {
    if (connQuality !== "online") { setPingMs(null); return; }
    if (pingInFlightRef.current) return;
    pingInFlightRef.current = true;
    const t0 = Date.now();
    try {
      const url = `${API_BASE_URL}/health?ts=${Date.now()}`;
      const res = await fetchWithTimeout(url, { method: "GET", timeoutMs: 6000 });
      const dt = Date.now() - t0;
      setPingMs(res.ok ? dt : null);
    } catch {
      setPingMs(null);
    } finally {
      pingInFlightRef.current = false;
    }
  }, [connQuality]);

  useEffect(() => {
    if (!slowUpload || connQuality !== "online") return;
    pingApi();
    const id = setInterval(() => pingApi(), 5000);
    return () => clearInterval(id);
  }, [slowUpload, connQuality, pingApi]);

  const resolvedEmployeeCode = String(employeeCode || cachedEmployee?.employee_code || "").trim();
  const resolvedFirstName = String(firstName || cachedEmployee?.first_name || "").trim();
  const resolvedLastName = String(lastName || cachedEmployee?.last_name || "").trim();
  const resolvedEngineerName =
    [resolvedFirstName, resolvedLastName].filter(Boolean).join(" ").trim() ||
    resolvedEmployeeCode ||
    "Unknown Engineer";

  const userDetails = {
    ...((routeUserDetails || {}) as Record<string, any>),
    first_name: resolvedFirstName, last_name: resolvedLastName,
    email: params?.email || routeUserDetails?.email || cachedEmployee?.email || "",
    job_title: params?.job_title || routeUserDetails?.job_title || cachedEmployee?.job_title || "",
    employee_code: resolvedEmployeeCode,
    phone_number: params?.phone_number || routeUserDetails?.phone_number || cachedEmployee?.phone_number || "",
  };

  const isDisabledOffline = (id: number) => !online && (id === 5 || id === 7);
  const hasComposerPayload = newUpdateText.trim().length > 0 || newUpdateFiles.length > 0;

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem("cached_employee")
      .then((raw) => {
        if (!alive || !raw) return;
        try { setCachedEmployee(JSON.parse(raw)); } catch (e) { console.warn("[TMF] Failed to parse cached_employee", e); }
      })
      .catch((e) => console.warn("[TMF] Failed to read cached_employee", e));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const onFooterSelect = (item: FooterNavItem) => {
    if (item.id === 0) { router.back(); return; }
    if (isDisabledOffline(item.id)) { Alert.alert("Offline", "This section is unavailable offline."); return; }
    setSelectedSection(item.id);
    router.push({
      pathname: "/PropertiesListScreen",
      params: toPropertyRouteParams(
        {
          propertyId,
          projectId,
          propertyName,
          projectLocation,
          userDetails,
        },
        { selectedSection: String(item.id) }
      ),
    } as any);
  };

  const [pendingSendAfterGuard, setPendingSendAfterGuard] = useState<null | "employee" | "customer">(null);
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
  const [updateTaskOpen, setUpdateTaskOpen] = useState(false);
  const openUpdateTask = () => setUpdateTaskOpen(true);
  const closeUpdateTask = () => setUpdateTaskOpen(false);
  const displayStatus = status?.trim();

  const getStatusActions = (currentStatus: string) => {
    const s = String(currentStatus || "").trim().toLowerCase();
    if (s === "pending") return [{ key: "start", label: "Move to In Progress", value: "In Progress" }];
    if (s === "on hold") return [{ key: "resume", label: "Resume Task", value: "In Progress" }];
    if (s === "completed") return [{ key: "reopen", label: "Reopen Task (In Progress)", value: "In Progress" }];
    return [
      { key: "complete", label: "Mark as Completed", value: "Completed" },
      { key: "hold", label: "Put on Hold", value: "On Hold" },
    ];
  };

  const [scheduleLocal, setScheduleLocal] = useState<Schedule | null>(schedule);
  const [resolvedLockingParentName, setResolvedLockingParentName] = useState(
    params.lockingParentName ?? ""
  );
  const isParamLocked = params.isLocked === "true";
  const hasParentDependencies =
    Array.isArray(scheduleLocal?.depends_on_scheduleid) &&
    scheduleLocal.depends_on_scheduleid.length > 0;
  const isOwnHold = isOnHoldStatus(scheduleLocal?.status || status || "");
  const isTaskLocked = isParamLocked && hasParentDependencies;

  const resolveBlockingParentName = useCallback(async () => {
    if (!isParamLocked || !propertyId || !scheduleLocal?.scheduleid) {
      return "";
    }

    if (resolvedLockingParentName) {
      return resolvedLockingParentName;
    }

    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/properties/${propertyId}/schedule`);
      if (!response.ok) return "";

      const data = await response.json();
      const scheduleItems = Array.isArray(data?.schedule) ? data.schedule.filter(Boolean) : [];
      const normalizedItems = scheduleItems.map((item: any) => ({
        scheduleid: Number(item.scheduleid),
        phasename: String(item.phasename ?? "").trim(),
        status: String(item.status ?? ""),
        depends_on_scheduleid: Array.isArray(item.depends_on_scheduleid)
          ? item.depends_on_scheduleid
              .map((id: any) => Number(id))
              .filter((id: number) => !Number.isNaN(id))
          : [],
      }));

      const scheduleMap = new Map<number, (typeof normalizedItems)[number]>();
      normalizedItems.forEach((item:any) => scheduleMap.set(item.scheduleid, item));

      const currentSchedule =
        scheduleMap.get(Number(scheduleLocal.scheduleid)) ??
        {
          scheduleid: Number(scheduleLocal.scheduleid),
          phasename: String(scheduleLocal.phasename ?? "").trim(),
          status: String(scheduleLocal.status ?? ""),
          depends_on_scheduleid: Array.isArray(scheduleLocal.depends_on_scheduleid)
            ? scheduleLocal.depends_on_scheduleid
            : [],
        };

      const lockState = buildScheduleLockState(normalizedItems);
      const blockingParent = findBlockingAncestor(scheduleMap, lockState.onHoldIds, currentSchedule);
      const parentName = blockingParent?.phasename ?? "";

      if (parentName) {
        setResolvedLockingParentName(parentName);
      }

      return parentName;
    } catch (error) {
      console.warn("[TMF] Failed to resolve blocking parent name", error);
      return "";
    }
  }, [isParamLocked, propertyId, scheduleLocal, resolvedLockingParentName]);

  useEffect(() => {
    setResolvedLockingParentName(params.lockingParentName ?? "");
  }, [params.lockingParentName]);

  useEffect(() => {
    if (!resolvedLockingParentName) {
      resolveBlockingParentName();
    }
  }, [resolvedLockingParentName, resolveBlockingParentName]);

  const refreshScheduleDetails = useCallback(async (sid: number) => {
    try {
      const res = await axios.get(`/schedule_update/${sid}`, { timeout: SCHEDULE_API_TIMEOUT_MS });
      const latestSchedule = res.data?.schedule || res.data?.data?.schedule || res.data?.task_schedule || null;
      if (latestSchedule) {
        setScheduleLocal(latestSchedule);
        setPhaseName(latestSchedule.phasename || "");
        setStatus(latestSchedule.status || "");
        setStartDate(latestSchedule.startdate ? toDateOnly(latestSchedule.startdate) : today());
        setEndDate(latestSchedule.enddate ? toDateOnly(latestSchedule.enddate) : today());
        return;
      }
      console.warn("[TMF] refreshScheduleDetails: schedule not present in payload");
    } catch (e) { console.warn("[TMF] refreshScheduleDetails failed", e); }
  }, []);

  const prettyStatus = (s?: string) => (s ? String(s).toUpperCase() : "—");
  const fmtDMY = (iso?: string) => {
    if (!iso) return "—";
    return toDateOnly(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };

  const getStatusStyle = (s?: string) => {
    const v = String(s || "").trim().toLowerCase();
    if (v === "completed") return { bg: "#E8F5E9", fg: "#2E7D32", bd: "#C8E6C9" };
    if (v === "in progress") return { bg: "#FFF3E0", fg: "#C67C00", bd: "#FFE0B2" };
    if (v === "on hold") return { bg: "#FFEBEE", fg: "#C62828", bd: "#FFCDD2" };
    if (v === "pending") return { bg: "#E3F2FD", fg: "#1565C0", bd: "#BBDEFB" };
    return { bg: "#F3F4F6", fg: "#374151", bd: "#E5E7EB" };
  };

  const st = getStatusStyle(scheduleLocal?.status);
  const offlineRenderLoggedRef = useRef(false);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [resumeReason, setResumeReason] = useState("");
  const [resumeLoading, setResumeLoading] = useState(false);
  const [modalType, setModalType] = useState<null | "hold" | "resume">(null);
  const [holdReason, setHoldReason] = useState("");
  const [holdType, setHoldType] = useState<"" | "Customer" | "Avenue">("");
  const [holdLoading, setHoldLoading] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const appendTranscript = useCallback((t: string) => {
    const clean = String(t || "").trim();
    if (!clean) return;
    setNewUpdateText((prev) => {
      const p = (prev || "").trim();
      if (!p) return clean;
      return `${p}${p.endsWith(".") ? " " : " "}${clean}`;
    });
  }, []);

  const { isListening, startListening: startSpeechToText, stopListening: stopSpeechToText } = useSpeechToText({
    lang: "en-IN", continuous: false, interimResults: true,
    onFinalTranscript: (text) => { appendTranscript(text); trackEvent("tmf_voice_result", { platform: Platform.OS, length: text.length }); },
    onError: (message) => { setVoiceError(message); void showAlert("Voice input", message); },
  });

  const startListening = async () => {
    setVoiceError(null);
    const started = await startSpeechToText();
    if (started) trackEvent("tmf_voice_start", { platform: Platform.OS });
  };

  const stopListening = async () => {
    setVoiceError(null);
    trackEvent("tmf_voice_stop", { platform: Platform.OS });
    await stopSpeechToText();
  };

  const toggleListening = async () => {
    if (isListening) await stopListening();
    else await startListening();
  };

  const mkObsHeaders = useCallback(() => ({
    "x-request-id": `web_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    "x-engineer-name": resolvedEngineerName,
    "x-employee-code": resolvedEmployeeCode || "",
    "x-app-version": "rn-1.0.0",
  }), [resolvedEngineerName, resolvedEmployeeCode]);

  useEffect(() => {
    updateDynamicContext({
      screen: "TaskManagementForm", propertyId: propertyId || null,
      scheduleId: schedule?.scheduleid ?? null, employeeCode: resolvedEmployeeCode || null,
    });
    trackScreen("TaskManagementForm", { fromNotification: params?.fromNotification === "1", scheduleId: schedule?.scheduleid ?? null });
    return () => { clearDynamicContext(); };
  }, [propertyId, schedule?.scheduleid, resolvedEmployeeCode, params?.fromNotification]);

  useEffect(() => {
    if (__DEV__) { try { const mod = require("./DevOutboxPanel"); mod?.installFetchMock?.(); } catch { } }
  }, []);

  const closeAnyOverlay = useCallback(() => {
    if (previewImage) setPreviewImage(null);
    if (showRecipientSelector) setShowRecipientSelector(false);
    if (showStartPicker) setShowStartPicker(false);
    if (showEndPicker) setShowEndPicker(false);
    try { modalSelectorRef.current?.close?.(); } catch { }
    try { quickMsgSelectorRef.current?.close?.(); } catch { }
  }, [previewImage, showRecipientSelector, showStartPicker, showEndPicker]);

  const hasAnyOverlayOpen = useCallback(() =>
    !!(previewImage || showRecipientSelector || showStartPicker || showEndPicker),
    [previewImage, showRecipientSelector, showStartPicker, showEndPicker]
  );

  const handleHardwareBack = useCallback(() => {
    if (hasAnyOverlayOpen()) { closeAnyOverlay(); return true; }
    trackUI({ element: "hardware_back_press", action: "click", extra: { canGoBack: router.canGoBack() } });
    if (router.canGoBack()) router.back();
    else router.replace("/HomeScreen");
    return true;
  }, [router, hasAnyOverlayOpen, closeAnyOverlay]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", handleHardwareBack);
      return () => sub.remove();
    }, [handleHardwareBack])
  );

  const goBackSafe = useCallback(() => {
    if (hasAnyOverlayOpen()) { closeAnyOverlay(); return true; }
    trackUI({ element: "header_back_button", action: "click", extra: { canGoBack: router.canGoBack() } });
    if (router.canGoBack()) router.back();
    else router.replace("/HomeScreen");
    return true;
  }, [router, hasAnyOverlayOpen, closeAnyOverlay]);

  const emp_name = resolvedEngineerName;
  const CACHED_UPDATES_KEY = (sid: number) => `cached_updates_${sid}`;
  const PENDING_LOCAL_KEY = (sid: number) => `pending_local_updates_${sid}`;

  const hydratePendingLocal = useCallback(async (scheduleid: number) => {
    try {
      const raw = await AsyncStorage.getItem(PENDING_LOCAL_KEY(scheduleid));
      if (!raw) { setPendingLocal([]); return; }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setPendingLocal(parsed);
      else setPendingLocal([]);
    } catch (e) { console.warn("Failed to hydrate pending local updates", e); setPendingLocal([]); }
  }, []);

  const clearPendingLocal = useCallback(async (scheduleid: number) => {
    try { setPendingLocal([]); await AsyncStorage.removeItem(PENDING_LOCAL_KEY(scheduleid)); }
    catch (e) { console.warn("Failed to clear pending local cache", e); }
  }, []);

  const fetchTaskUpdates = useCallback(async (scheduleid: number, preferNetwork = false) => {
    try {
      if (!online && !preferNetwork) {
        const cached = await AsyncStorage.getItem(CACHED_UPDATES_KEY(scheduleid));
        setUpdates(cached ? JSON.parse(cached) : []);
        return;
      }
      const res = await axios.get(`/schedule_update/${scheduleid}`, { timeout: SCHEDULE_API_TIMEOUT_MS });
      const arr = res.data?.updates || [];
      setUpdates(arr);
      await AsyncStorage.setItem(CACHED_UPDATES_KEY(scheduleid), JSON.stringify(arr));
    } catch {
      const cached = await AsyncStorage.getItem(CACHED_UPDATES_KEY(scheduleid));
      setUpdates(cached ? JSON.parse(cached) : []);
    }
  }, [online]);

  const refreshTaskUpdatesUntilCount = useCallback(async (scheduleid: number, minExpectedCount: number, maxAttempts = 5) => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await axios.get(`/schedule_update/${scheduleid}`, { timeout: SCHEDULE_API_TIMEOUT_MS });
        const arr = res.data?.updates || [];
        setUpdates(arr);
        await AsyncStorage.setItem(CACHED_UPDATES_KEY(scheduleid), JSON.stringify(arr));
        if (arr.length >= minExpectedCount) return arr;
      } catch { }
      if (attempt < maxAttempts) await delay(600);
    }
    return null;
  }, []);

  const flushThenRefresh = useCallback(async () => {
    try {
      await flush(mkObsHeaders);
      if (schedule?.scheduleid) {
        await fetchTaskUpdates(schedule.scheduleid, true);
        await clearPendingLocal(schedule.scheduleid);
      } else { setPendingLocal([]); }
    } catch (e) {
      console.warn("flushThenRefresh error", e);
      if (schedule?.scheduleid) await hydratePendingLocal(schedule.scheduleid);
    }
  }, [mkObsHeaders, schedule?.scheduleid, fetchTaskUpdates, clearPendingLocal, hydratePendingLocal]);

  useEffect(() => {
    initOutbox();
    let unsub: any = null;
    let interval: any = null;
    const boot = async () => {
      try {
        let st = await NetInfo.fetch();
        if (isWeb && typeof navigator !== "undefined" && "onLine" in navigator) {
          if (!st.isConnected && (navigator as any).onLine) {
            st = { ...st, isConnected: true, isInternetReachable: true } as any;
          }
        }
        const quality = getConnectionQuality(st as any);
        setConnQuality(quality); setOnline(quality !== "offline");
        if (!schedule?.scheduleid) { setLoading(false); return; }
        setLoading(true);
        if (!schedule.task_id) {
          try {
            const r = await axios.get(`/get-task-id/${schedule.scheduleid}`, { timeout: SCHEDULE_API_TIMEOUT_MS });
            setTaskId(r.data?.task_id || null);
          } catch (e) { console.error("Error fetching task_id:", e); }
        } else { setTaskId(schedule.task_id); }
        await hydratePendingLocal(schedule.scheduleid);
        if (quality === "online") { await flushThenRefresh(); }
        else { await fetchTaskUpdates(schedule.scheduleid); }
        setLoading(false);
        unsub = NetInfo.addEventListener(async (st2) => {
          const q2 = getConnectionQuality(st2 as any);
          setConnQuality(q2); setOnline(q2 !== "offline");
          if (q2 === "online") await flushThenRefresh();
        });
        interval = setInterval(async () => {
          const st3 = await NetInfo.fetch();
          const q3 = getConnectionQuality(st3 as any);
          if (q3 === "offline") return;
          await flushThenRefresh();
        }, 25000);
      } catch (e) { console.warn("[TMF] boot error", e); setLoading(false); }
    };
    boot();
    return () => { if (unsub) unsub(); if (interval) clearInterval(interval); };
  }, [schedule?.scheduleid]);

  const isStartAfterEnd = (nextStart: Date, nextEnd: Date) => nextStart > nextEnd;
  const warnInvalidDateRange = (why: string) => showAlert("Invalid dates", why);
  const applyStartDateSelection = useCallback((rawDate: Date | string, opts?: { autoShiftEnd?: boolean }) => {
    const nextStart = toDateOnly(rawDate);
    const shouldAutoShiftEnd = opts?.autoShiftEnd ?? false;
    setStartDate(nextStart);
    setEndDate((prev) => {
      const currentEnd = toDateOnly(prev);
      if (shouldAutoShiftEnd) return addDays(nextStart, 2);
      if (isStartAfterEnd(nextStart, currentEnd)) return nextStart;
      return currentEnd;
    });
    return nextStart;
  }, []);
  const applyEndDateSelection = useCallback(async (rawDate: Date | string, opts?: { alignStartOnInvalid?: boolean }) => {
    const nextEnd = toDateOnly(rawDate);
    if (opts?.alignStartOnInvalid) {
      if (isStartAfterEnd(startDate, nextEnd)) setStartDate(nextEnd);
      setEndDate(nextEnd);
      return true;
    }
    if (isStartAfterEnd(startDate, nextEnd)) {
      await warnInvalidDateRange("Start Date must be less than or equal to End Date.");
      return false;
    }
    setEndDate(nextEnd);
    return true;
  }, [startDate]);

  const objectUrlsRef = useRef<string[]>([]);
  const webcamStreamRef = useRef<MediaStream | null>(null);

  const stopWebcam = () => {
    if (!isWeb) return;
    try {
      const v = document.getElementById("webcam-preview") as HTMLVideoElement | null;
      if (v) {
        try { const s = (v as any).srcObject as MediaStream | null; if (s) s.getTracks().forEach((t) => t.stop()); } catch { }
        try { v.pause(); } catch { }
        try { (v as any).srcObject = null; } catch { }
      }
      if (webcamStreamRef.current) {
        try { webcamStreamRef.current.getTracks().forEach((t) => t.stop()); } catch { }
        webcamStreamRef.current = null;
      }
    } catch { }
    ["webcam-preview", "button-container", "capture-btn", "cancel-btn"].forEach((id) => {
      const el = isWeb ? document.getElementById(id) : null;
      if (el) el.remove();
    });
  };

  useEffect(() => {
    return () => {
      stopWebcam();
      objectUrlsRef.current.forEach((u) => { try { URL.revokeObjectURL(u); } catch { } });
      objectUrlsRef.current = [];
    };
  }, []);

  const pickDocuments = async () => {
    if (isWeb) {
      const input = document.createElement("input");
      input.type = "file"; input.accept = "*/*"; input.multiple = true;
      input.onchange = () => {
        const files = Array.from(input.files || []).map((f) => {
          const url = URL.createObjectURL(f);
          objectUrlsRef.current.push(url);
          return { uri: url, name: formatFileName(propertyId, f.name), type: f.type || ((mime.lookup(f.name) as string) || "application/octet-stream"), file: f };
        });
        if (files.length > 0) trackEvent("tmf_files_picked", { source: "documents", count: files.length });
        setNewUpdateFiles((prev) => [...prev, ...files]);
      };
      input.click(); return;
    }
    const res = await DocumentPicker.getDocumentAsync({ type: "*/*", multiple: true });
    if (!res.canceled && res.assets.length > 0) {
      const files = res.assets.map((a) => ({
        uri: a.uri, name: formatFileName(propertyId, a.name || `document_${Date.now()}`),
        type: a.mimeType || ((mime.lookup(a.name || "") as string) || "application/octet-stream"),
      }));
      trackEvent("tmf_files_picked", { source: "documents", count: files.length });
      setNewUpdateFiles((p) => [...p, ...files]);
    }
  };

  const pickImageFromCamera = async () => {
    if (isWeb) {
      try {
        stopWebcam();
        const video = document.createElement("video");
        video.id = "webcam-preview";
        Object.assign(video.style, { position: "fixed", top: "0", left: "0", width: "100vw", height: "100vh", zIndex: "9998", objectFit: "cover" } as Partial<CSSStyleDeclaration>);
        video.autoplay = true; video.muted = true; video.playsInline = true;
        document.body.appendChild(video);
        const buttonContainer = document.createElement("div");
        buttonContainer.id = "button-container";
        Object.assign(buttonContainer.style, { position: "fixed", bottom: "40px", left: "50%", transform: "translateX(-50%)", display: "flex", gap: "20px", zIndex: "9999" } as Partial<CSSStyleDeclaration>);
        document.body.appendChild(buttonContainer);
        const cancelBtn = document.createElement("button");
        cancelBtn.id = "cancel-btn"; cancelBtn.innerText = "❌ Cancel";
        Object.assign(cancelBtn.style, { padding: "12px 24px", fontSize: "16px", backgroundColor: "gray", color: "white", border: "none", borderRadius: "8px", cursor: "pointer" } as Partial<CSSStyleDeclaration>);
        const captureBtn = document.createElement("button");
        captureBtn.id = "capture-btn"; captureBtn.innerText = "📸 Capture";
        Object.assign(captureBtn.style, { padding: "12px 24px", fontSize: "16px", backgroundColor: "#1976D2", color: "white", border: "none", borderRadius: "8px", cursor: "pointer" } as Partial<CSSStyleDeclaration>);
        buttonContainer.appendChild(cancelBtn); buttonContainer.appendChild(captureBtn);
        const stream = await (navigator.mediaDevices as any).getUserMedia({ video: { facingMode: "environment" }, audio: false });
        webcamStreamRef.current = stream; (video as any).srcObject = stream;
        try { await (video as any).play(); } catch { }
        const cleanup = () => { stopWebcam(); document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("keydown", onKeyDown); };
        const onVisibility = () => { if (document.visibilityState === "hidden") cleanup(); };
        const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") cleanup(); };
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("keydown", onKeyDown);
        captureBtn.onclick = () => {
          const canvas = document.createElement("canvas");
          canvas.width = (video as any).videoWidth || 1280; canvas.height = (video as any).videoHeight || 720;
          const ctx = canvas.getContext("2d"); ctx?.drawImage(video as any, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            if (!blob) return;
            const renamed = formatFileName(propertyId, `camera_${Date.now()}.jpg`);
            const file = new File([blob], renamed, { type: "image/jpeg" });
            const url = URL.createObjectURL(blob);
            objectUrlsRef.current.push(url);
            trackEvent("tmf_files_picked", { source: "camera", count: 1 });
            setNewUpdateFiles((prev) => [...prev, { uri: url, name: file.name, type: file.type, file }]);
            cleanup();
          }, "image/jpeg");
        };
        cancelBtn.onclick = () => cleanup();
      } catch { showAlert("Camera", "Camera access failed. Please allow permission."); }
      return;
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!res.canceled && res.assets.length > 0) {
      const files = await Promise.all(
        res.assets.map(async (a) => {
          const baseName = a.fileName || `camera_${Date.now()}.jpg`;
          const renamed = formatFileName(propertyId, baseName);
          return await optimizeImageForUpload({ uri: a.uri, name: renamed });
        })
      );
      trackEvent("tmf_files_picked", { source: "camera", count: files.length });
      setNewUpdateFiles((p) => [...p, ...files]);
    }
  };

  const pickImageFromGallery = async () => {
    if (isWeb) {
      const input = document.createElement("input");
      input.type = "file"; input.accept = "image/*"; input.multiple = true;
      input.onchange = () => {
        const files = Array.from(input.files || []).map((file) => {
          const renamed = formatFileName(propertyId, file.name);
          const url = URL.createObjectURL(file);
          objectUrlsRef.current.push(url);
          return { uri: url, name: renamed, type: file.type || "image/jpeg", file };
        });
        if (files.length > 0) trackEvent("tmf_files_picked", { source: "gallery", count: files.length });
        setNewUpdateFiles((prev) => [...prev, ...files]);
      };
      input.click(); return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, selectionLimit: 10, quality: 0.7,
    });
    if (!res.canceled && res.assets.length > 0) {
      const files = await Promise.all(
        res.assets.map(async (a) => {
          const baseName = a.fileName || `gallery_${Date.now()}.jpg`;
          const renamed = formatFileName(propertyId, baseName);
          return await optimizeImageForUpload({ uri: a.uri, name: renamed });
        })
      );
      trackEvent("tmf_files_picked", { source: "gallery", count: files.length });
      setNewUpdateFiles((p) => [...p, ...files]);
    }
  };

  const getScheduleDeltas = () => {
    if (!schedule) return { statusChanged: false, startChanged: false, endChanged: false };
    return {
      statusChanged: schedule.status !== status,
      startChanged: schedule.startdate !== ymd(startDate),
      endChanged: schedule.enddate !== ymd(endDate),
    };
  };

  const buildScheduleChanges = () => {
    if (!schedule) return {};
    const changes: any = {};
    if (schedule.status !== status) changes.status = { old: schedule.status, new: status };
    if (schedule.startdate !== ymd(startDate)) changes.start_date = { old: schedule.startdate, new: ymd(startDate) };
    if (schedule.enddate !== ymd(endDate)) changes.end_date = { old: schedule.enddate, new: ymd(endDate) };
    if (__DEV__ && Object.keys(changes).length > 0) console.log("[TMF] scheduleChanges", changes);
    return changes;
  };

  const buildUploadPayloads = (preparedFiles: PreparedUploadFile[], chatDetails: string): UploadPayload[] => {
    const trimmedUpdateText = newUpdateText.trim();
    const baseChatMessage = `📌 Update for "${phasename}"\n\n${chatDetails}`;
    if (preparedFiles.length === 0) return [{ updateText: trimmedUpdateText, chatMessageText: baseChatMessage, files: [] }];
    return preparedFiles.map((file, index) => {
      const isFirst = index === 0;
      const hasOnlyFiles = !trimmedUpdateText;
      const attachmentLabel = preparedFiles.length > 1 ? ` (${index + 1}/${preparedFiles.length})` : "";
      return {
        updateText: isFirst ? trimmedUpdateText : "",
        chatMessageText: isFirst && !hasOnlyFiles ? baseChatMessage : `📎 Attachment${attachmentLabel} for "${phasename}"`,
        files: [file],
      };
    });
  };

  const buildLocalBubbles = (uploadPayloads: UploadPayload[], state: LocalBubbleState, baseId = `${state}_${Date.now()}`) => {
    const nowTs = Date.now();
    return uploadPayloads.map((payload, index) => ({
      update_id: `${baseId}_${index}`, engineer_name: resolvedEngineerName,
      update_text: payload.updateText || payload.chatMessageText,
      created_at: new Date(nowTs + index).toISOString(),
      files: payload.files.map((f) => ({ file_name: f.name, file_url: f.uri, uri: f.uri, type: f.type || "application/octet-stream" })),
      send_state: state,
      upload_label: uploadPayloads.length > 1 ? `${index + 1}/${uploadPayloads.length}` : "1/1",
    }));
  };

  const updatePendingLocalBubbles = useCallback((ids: string[], updater: (bubble: any) => any, persist = false) => {
    setPendingLocal((prev) => {
      const next = prev.map((bubble) => (ids.includes(String(bubble.update_id)) ? updater(bubble) : bubble));
      if (persist && schedule?.scheduleid) {
        AsyncStorage.setItem(PENDING_LOCAL_KEY(schedule.scheduleid), JSON.stringify(next)).catch(() => { });
      }
      return next;
    });
  }, [schedule?.scheduleid]);

  const removePendingLocalBubbles = useCallback((ids: string[], persist = false) => {
    setPendingLocal((prev) => {
      const next = prev.filter((bubble) => !ids.includes(String(bubble.update_id)));
      if (persist && schedule?.scheduleid) {
        AsyncStorage.setItem(PENDING_LOCAL_KEY(schedule.scheduleid), JSON.stringify(next)).catch(() => { });
      }
      return next;
    });
  }, [schedule?.scheduleid]);

  const isTodayOrYesterday = (d: Date) => isSameDay(d, today()) || isSameDay(d, yester());

  const syncLocalSchedule = useCallback((patch: Partial<Schedule>) => {
    setScheduleLocal((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const askCompletedEndDate = async (forSend?: "employee" | "customer") => {
    const idx = await showConfirm("End Date required", "This task is marked Completed. Choose an End Date.", [{ text: "Today" }, { text: "Yesterday" }, { text: "Cancel", role: "cancel" }]);
    if (idx === 0) {
      await applyEndDateSelection(today(), { alignStartOnInvalid: true });
      if (forSend) setTimeout(() => handleCombinedUpdate(forSend), 0);
    } else if (idx === 1) {
      await applyEndDateSelection(yester(), { alignStartOnInvalid: true });
      if (forSend) setTimeout(() => handleCombinedUpdate(forSend), 0);
    }
  };

  const askInProgressStartDate = async (forSend?: "employee" | "customer") => {
    const idx = await showConfirm("Start Date required", "This task is In Progress. Choose a Start Date.", [{ text: "Today" }, { text: "Yesterday" }, { text: "Cancel", role: "cancel" }]);
    if (idx === 0) {
      applyStartDateSelection(today());
      if (forSend) setTimeout(() => handleCombinedUpdate(forSend), 0);
    } else if (idx === 1) {
      applyStartDateSelection(yester());
      if (forSend) setTimeout(() => handleCombinedUpdate(forSend), 0);
    }
  };

  const onStatusChange = (newStatus: string) => {
    const normalized = String(newStatus).trim().toLowerCase();
    if (normalized === "resume") { setResumeReason(""); setShowResumeDialog(true); return; }
    if (normalized === "on hold") { setHoldReason(""); setHoldType(""); setModalType("hold"); return; }
    setStatus(newStatus);
    syncLocalSchedule({ status: newStatus });
    if (newStatus === "Completed") { if (!isTodayOrYesterday(endDate)) askCompletedEndDate(); }
    else if (newStatus === "In Progress") { if (!isTodayOrYesterday(startDate)) askInProgressStartDate(); }
  };

  const validateDatesBeforeSend = async (sendTarget: "customer" | "employee") => {
    const { statusChanged, startChanged, endChanged } = getScheduleDeltas();
    if (!statusChanged && !startChanged && !endChanged) return true;
    if (startChanged || endChanged) {
      if (isStartAfterEnd(startDate, endDate)) {
        await warnInvalidDateRange("Start Date cannot be greater than End Date.");
        return false;
      }
    }
    if (statusChanged) {
      if (status === "Completed" && !isTodayOrYesterday(endDate)) { await askCompletedEndDate(sendTarget); return false; }
      if (status === "In Progress" && !isTodayOrYesterday(startDate)) { await askInProgressStartDate(sendTarget); return false; }
    }
    return true;
  };

  const getChatDetails = () => {
    const start = ymd(startDate); const end = ymd(endDate);
    const effectiveStatus = status || schedule?.status || "";
    const lines: string[] = [];
    lines.push(`🟡 Status: *${String(effectiveStatus).toLowerCase()}*`);
    lines.push(`📅 Start: *${start}*`); lines.push(`📅 End: *${end}*`);
    if (newUpdateText.trim()) lines.push(`📝 Note: ${newUpdateText.trim()}`);
    return lines.join("\n");
  };

  const isRetryableStatus = (s: number) => s === 408 || s === 429 || (s >= 500 && s <= 599);

  const holdScheduleNow = async () => {
    const sid = Number(schedule?.scheduleid);
    const pid = String(propertyId || "").trim();
    const reason = String(holdReason || "").trim();
    const type = String(holdType || "").trim();
    const holdBy = String(params?.email || resolvedEmployeeCode || "").trim();
    if (!sid || Number.isNaN(sid)) return showAlert("Missing", "Invalid scheduleid");
    if (!pid) return showAlert("Missing", "propertyId missing");
    if (!type) return showAlert("Missing", "Please select hold type");
    if (!reason) return showAlert("Missing", "Please enter hold reason");
    if (!holdBy) return showAlert("Missing", "hold_by_email missing");
    try {
      setHoldLoading(true);
      const url = `${API_BASE_URL}/hold-schedule`;
      const fd = new FormData();
      fd.append("scheduleid", String(sid)); fd.append("propertyid", pid);
      fd.append("hold_type", type); fd.append("hold_reason", reason); fd.append("hold_by_email", holdBy);
      const r = await authenticatedFetch(url, { method: "POST", headers: { ...mkObsHeaders(), Accept: "application/json" }, body: fd });
      const text = await r.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch { }
      if (!r.ok) throw new Error(`Hold failed (${r.status}). ${data?.detail || data?.message || text || ""}`);
      setStatus("On Hold"); syncLocalSchedule({ status: "On Hold" }); setModalType(null); setHoldReason(""); setHoldType("");
      await showAlert("On Hold", data?.message || `Schedule ${sid} put on hold.`);
      await fetchTaskUpdates(sid, true);
    } catch (e: any) { await showAlert("Hold Error", e?.message || "Hold failed."); }
    finally { setHoldLoading(false); }
  };

  const resumeScheduleNow = async () => {
    const sid = Number(schedule?.scheduleid);
    const pid = String(propertyId || "").trim();
    const reason = String(resumeReason || "").trim();
    const emp = String(resolvedEmployeeCode || "").trim();
    if (!sid || Number.isNaN(sid)) return showAlert("Missing", "Invalid scheduleid");
    if (!pid) return showAlert("Missing", "propertyId missing");
    if (!reason) return showAlert("Missing", "resume_reason missing");
    if (!emp) return showAlert("Missing", "employeeCode missing");
    try {
      setResumeLoading(true);
      const url = `${API_BASE_URL}/resume-schedule`;
      const fd = new FormData();
      fd.append("scheduleid", String(sid)); fd.append("propertyid", pid);
      fd.append("resume_reason", reason); fd.append("resumed_by_email", emp);
      const r = await authenticatedFetch(url, { method: "POST", headers: { ...mkObsHeaders(), Accept: "application/json" }, body: fd });
      const text = await r.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch { }
      if (!r.ok) throw new Error(`Resume failed (${r.status}). ${data?.detail || data?.message || text || ""}`);
      setShowResumeDialog(false); setResumeReason(""); setStatus("In Progress"); syncLocalSchedule({ status: "In Progress" });
      const t = today(); setStartDate(t);
      syncLocalSchedule({ startdate: ymd(t) });
      setEndDate((prev) => {
        const p = prev instanceof Date ? prev : new Date(prev);
        const nextEnd = p < addDays(t, 1) ? addDays(t, 1) : p;
        syncLocalSchedule({ enddate: ymd(nextEnd) });
        return nextEnd;
      });
      await showAlert("Resumed", data?.message || "Resumed successfully.");
      await fetchTaskUpdates(sid, true);
    } catch (e: any) { await showAlert("Resume Error", e?.message || "Resume failed."); }
    finally { setResumeLoading(false); }
  };

  const tryOnlineOrQueue = async ({
    needPut, needPostTaskUpdate, start, end, chatDetails, preparedFiles,
    sendTarget, scheduleChanges, textPreview, filesMeta, uploadPayloads, optimisticBubbleIds,
  }: {
    needPut: boolean; needPostTaskUpdate: boolean; start: string; end: string; chatDetails: string;
    preparedFiles: PreparedUploadFile[]; sendTarget: "customer" | "employee"; scheduleChanges: any;
    textPreview: string | null; filesMeta: { name: string; type: string }[];
    uploadPayloads: UploadPayload[]; optimisticBubbleIds: string[];
  }) => {
    try {
      if (needPut) {
        await axios.put(
          `/update-schedule/${schedule!.scheduleid}`,
          { phasename, startdate: start, enddate: end, status, applyToAll, task_id: taskId, employee_code: resolvedEmployeeCode },
          { headers: { ...mkObsHeaders(), "Content-Type": "application/json" }, timeout: SCHEDULE_API_TIMEOUT_MS }
        );
      }
      setScheduleLocal((prev) => prev ? { ...prev, phasename, status, startdate: start, enddate: end } : prev);
      if (needPostTaskUpdate) {
        for (const payload of uploadPayloads) {
          const taskFD = new FormData();
          taskFD.append("task_id", taskId || ""); taskFD.append("property_id", propertyId || "Unknown");
          taskFD.append("schedule_id", String(schedule!.scheduleid)); taskFD.append("engineer_name", resolvedEngineerName);
          taskFD.append("update_text", payload.updateText); taskFD.append("employee_code", resolvedEmployeeCode || "");
          for (const f of payload.files) {
            const fileData: any = isWeb ? (f.file instanceof File ? f.file : null) : { uri: f.uri, name: f.name, type: f.type };
            if (fileData) taskFD.append("update_files", fileData as any, f.name as any);
          }
          await axios.post(`/task-updates`, taskFD, { headers: { ...mkObsHeaders() }, timeout: FILE_UPLOAD_API_TIMEOUT_MS });
          const chatFD = new FormData();
          chatFD.append("property_id", propertyId || "Unknown"); chatFD.append("engineer_name", resolvedEngineerName);
          chatFD.append("employee_code", resolvedEmployeeCode || ""); chatFD.append("message_text", payload.chatMessageText);
          chatFD.append("visible_to_clients", sendTarget === "customer" ? "true" : "false");
          for (const f of payload.files) {
            const fileData: any = isWeb ? (f.file instanceof File ? f.file : null) : { uri: f.uri, name: f.name, type: f.type };
            if (fileData) chatFD.append("files", fileData as any, f.name as any);
          }
          const chatRes = await fetchWithTimeout(`${axios.defaults.baseURL}/property-chat/send`, {
            method: "POST", headers: { ...mkObsHeaders(), Accept: "application/json" }, body: chatFD, timeoutMs: CHAT_API_TIMEOUT_MS,
          });
          if (!chatRes.ok) {
            const { status: httpStatus } = chatRes;
            const text = await chatRes.text().catch(() => "");
            const err = new Error(`Chat API ${httpStatus}: ${text}`);
            (err as any)._httpStatus = httpStatus; throw err;
          }
        }
      }
      const expectedUpdateCount = updates.length + uploadPayloads.length;
      const refreshed = await refreshTaskUpdatesUntilCount(schedule!.scheduleid, expectedUpdateCount, uploadPayloads.length > 1 ? 6 : 3);
      if (!refreshed) await fetchTaskUpdates(schedule!.scheduleid, true);
      await refreshScheduleDetails(schedule!.scheduleid);
      if (optimisticBubbleIds.length > 0) removePendingLocalBubbles(optimisticBubbleIds, false);
      setLoading(false);
      setNewUpdateText(""); setNewUpdateFiles([]);
      return;
    } catch (e: any) {
      const httpStatus = e?._httpStatus ?? e?.response?.status;
      const shouldQueue = isTransientNetError(e) || (typeof httpStatus === "number" && isRetryableStatus(httpStatus));
      if (!shouldQueue) {
        if (optimisticBubbleIds.length > 0) {
          updatePendingLocalBubbles(optimisticBubbleIds, (bubble) => ({ ...bubble, send_state: "failed" as const }), false);
        }
        throw e;
      }
      try {
        for (let index = 0; index < uploadPayloads.length; index++) {
          const payload = uploadPayloads[index];
          const cachedFiles: any[] = [];
          for (const f of payload.files) {
            cachedFiles.push(await cacheFileIfNeeded({ uri: f.uri, name: f.name, type: f.type, file: f.file }, f.name));
          }
          const outboxItem: Omit<OutboxItem, "id" | "createdAt" | "tries" | "nextTryAt"> = {
            scheduleId: schedule!.scheduleid, taskId: taskId || null, propertyId, engineerName: resolvedEngineerName,
            employeeCode: resolvedEmployeeCode || "", phaseName: phasename, status, startISODate: start, endISODate: end,
            applyToAll, updateText: payload.updateText, sendTarget, files: cachedFiles, sentScheduleUpdate: index > 0,
          };
          await enqueue(outboxItem);
        }
        if (optimisticBubbleIds.length > 0) {
          updatePendingLocalBubbles(optimisticBubbleIds, (bubble) => ({ ...bubble, send_state: "pending" as const }), true);
        }
      } catch {
        if (optimisticBubbleIds.length > 0) {
          updatePendingLocalBubbles(optimisticBubbleIds, (bubble) => ({ ...bubble, send_state: "failed" as const }), true);
        }
        await showAlert("Queue Error", "Failed to queue update. Please try again.");
      }
    }
  };

  const handleCombinedUpdate = async (sendTarget: "customer" | "employee") => {
    if (!schedule) return;
    const scheduleChanges = buildScheduleChanges();
    const hasChanges = Object.keys(scheduleChanges).length > 0;
    const textPreview = newUpdateText.trim() ? newUpdateText.trim().slice(0, 80) : null;
    const filesMeta = newUpdateFiles.map((f) => ({ name: f.name, type: f.type || "application/octet-stream" }));
    if (!phasename || !status) { await showAlert("Error", "Please fill all fields before saving."); return; }
    const ok = await validateDatesBeforeSend(sendTarget);
    if (!ok) return;
    const start = ymd(startDate); const end = ymd(endDate);
    const net = await NetInfo.fetch();
    const quality = getConnectionQuality(net as any);
    const isOffline = quality === "offline";
    const chatDetails = getChatDetails();
    const preparedFiles: PreparedUploadFile[] = [];
    for (const f of newUpdateFiles) {
      preparedFiles.push({ uri: f.uri, name: f.name || `file_${Date.now()}.bin`, type: f.type || "application/octet-stream", file: f.file });
    }
    const { statusChanged, startChanged, endChanged } = getScheduleDeltas();
    const needPut = statusChanged || startChanged || endChanged;
    const needPostTaskUpdate = needPut || newUpdateText.trim().length > 0 || preparedFiles.length > 0;
    if (!needPostTaskUpdate) { await showAlert("Empty update", "Enter some text, attach a file, or change the task before sending."); return; }
    const uploadPayloads = buildUploadPayloads(preparedFiles, chatDetails);
    const optimisticBubbleIds: string[] = [];
    const draftTextSnapshot = newUpdateText;
    const draftFilesSnapshot = [...newUpdateFiles];
    if (!isOffline && needPostTaskUpdate) {
      const optimisticBubbles = buildLocalBubbles(uploadPayloads, "uploading");
      optimisticBubbleIds.push(...optimisticBubbles.map((bubble) => String(bubble.update_id)));
      setPendingLocal((prev) => [...optimisticBubbles, ...prev]);
      setNewUpdateText(""); setNewUpdateFiles([]);
    }
    const hasAnyFiles = preparedFiles.length > 0;
    if (!isOffline && hasAnyFiles) {
      setSlowUpload(false);
      if (slowUploadTimerRef.current) clearTimeout(slowUploadTimerRef.current);
      slowUploadTimerRef.current = setTimeout(() => setSlowUpload(true), 8000);
    }
    if (isOffline) {
      try {
        const offlineBubbles = buildLocalBubbles(uploadPayloads, "pending", `local_${Date.now()}`);
        for (let index = 0; index < uploadPayloads.length; index++) {
          const payload = uploadPayloads[index];
          const cachedFiles: any[] = [];
          for (const f of payload.files) {
            cachedFiles.push(await cacheFileIfNeeded({ uri: f.uri, name: f.name, type: f.type, file: f.file }, f.name));
          }
          const outboxItem: Omit<OutboxItem, "id" | "createdAt" | "tries" | "nextTryAt"> = {
            scheduleId: schedule.scheduleid, taskId: taskId || null, propertyId, engineerName: resolvedEngineerName,
            employeeCode: resolvedEmployeeCode || "", phaseName: phasename, status, startISODate: start, endISODate: end,
            applyToAll, updateText: payload.updateText, sendTarget, files: cachedFiles, sentScheduleUpdate: index > 0,
          };
          await enqueue(outboxItem);
        }
        setPendingLocal((prev) => {
          const next = [...prev, ...offlineBubbles];
          AsyncStorage.setItem(PENDING_LOCAL_KEY(schedule.scheduleid), JSON.stringify(next)).catch(() => { });
          return next;
        });
        await showAlert("Offline", "Queued. Will sync when the network improves.");
        setNewUpdateText(""); setNewUpdateFiles([]);
      } catch {
        const failedBubbles = buildLocalBubbles(uploadPayloads, "failed", `failed_${Date.now()}`);
        setPendingLocal((prev) => {
          const next = [...prev, ...failedBubbles];
          AsyncStorage.setItem(PENDING_LOCAL_KEY(schedule.scheduleid), JSON.stringify(next)).catch(() => { });
          return next;
        });
        await showAlert("Queue Error", "Failed to queue update.");
      }
      return;
    }
    if (needPut || needPostTaskUpdate) setLoading(true);
    const maxAttempts = 3;
    let lastError: any = null;
    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          await tryOnlineOrQueue({ needPut, needPostTaskUpdate, start, end, chatDetails, preparedFiles, sendTarget, scheduleChanges, textPreview, filesMeta, uploadPayloads, optimisticBubbleIds });
          lastError = null; break;
        } catch (e: any) {
          lastError = e;
          console.error(`❌ Task/Chat upload failed (attempt ${attempt}/${maxAttempts}):`, e);
          if (attempt < maxAttempts) await delay(1500);
        }
      }
      if (lastError) {
        if (optimisticBubbleIds.length > 0) {
          updatePendingLocalBubbles(optimisticBubbleIds, (bubble) => ({ ...bubble, send_state: "failed" as const }), false);
        }
        const httpStatus = lastError?._httpStatus ?? lastError?.response?.status ?? lastError?.status ?? null;
        const data = lastError?.response?.data;
        let serverMessage = "";
        if (data) {
          if (typeof data === "string") serverMessage = data;
          else if (typeof data === "object") serverMessage = data?.detail || data?.message || data?.error || JSON.stringify(data);
        }
        if (!serverMessage) serverMessage = lastError?.message || "Unknown error from server.";
        const trimmedMessage = serverMessage.length > 500 ? serverMessage.slice(0, 500) + "…" : serverMessage;
        const title = httpStatus ? `Upload Error (${httpStatus})` : "Upload Error";
        setNewUpdateText(draftTextSnapshot); setNewUpdateFiles(draftFilesSnapshot);
        await showAlert(title, `We tried to send this update 3 times, but the server kept failing.\n\n${trimmedMessage}`);
      }
    } finally {
      if (slowUploadTimerRef.current) clearTimeout(slowUploadTimerRef.current);
      slowUploadTimerRef.current = null;
      setSlowUpload(false);
      if (needPut || needPostTaskUpdate) setLoading(false);
      flushTelemetry().catch((err) => console.warn("[Telemetry] manual flush error", err));
    }
  };

  const removeFile = (idx: number) => {
    setNewUpdateFiles((prev) => {
      const f = prev[idx];
      if (isWeb && f?.uri) {
        try { URL.revokeObjectURL(f.uri); } catch { }
        const i = objectUrlsRef.current.indexOf(f.uri);
        if (i !== -1) objectUrlsRef.current.splice(i, 1);
      }
      return prev.filter((_, i) => i !== idx);
    });
  };

  const combinedUpdates = useMemo(() => {
    const all = [...updates, ...pendingLocal];
    return all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [updates, pendingLocal]);

  useEffect(() => {
    if (connQuality === "offline" && pendingLocal.length > 0 && !offlineRenderLoggedRef.current) {
      offlineRenderLoggedRef.current = true;
    }
    if (connQuality === "online" || pendingLocal.length === 0) offlineRenderLoggedRef.current = false;
  }, [connQuality, pendingLocal.length]);

  const convertUTCToIST = (utcDateStr: string): string => {
    const utcDate = new Date(utcDateStr);
    return utcDate.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  };

  const handleRetrySend = async (bubble: any) => {
    if (!schedule) return;
    setPendingLocal((prev) => {
      const next = prev.filter((b) => b.update_id !== bubble.update_id);
      AsyncStorage.setItem(PENDING_LOCAL_KEY(schedule.scheduleid), JSON.stringify(next)).catch(() => { });
      return next;
    });
    const restoredText = bubble.update_text || "";
    const restoredFiles = Array.isArray(bubble.files) ? bubble.files.map((f: any) => {
      const uri = f.uri || f.file_url;
      const name = f.file_name || f.name || `file_${Date.now().toString()}.bin`;
      const guessedType = f.type || (isImageUrl(uri || "") ? "image/jpeg" : "application/octet-stream");
      return { uri, name, type: guessedType };
    }) : [];
    setNewUpdateText(restoredText); setNewUpdateFiles(restoredFiles);
    setTimeout(() => handleCombinedUpdate(selectedSendTarget || "employee"), 0);
  };

  const MAX_THUMBS_PER_MESSAGE = 3;

  const renderUpdate = ({ item }: { item: any }) => {
    const mine = item.engineer_name === emp_name;
    let rawState: "uploading" | "pending" | "failed" | undefined = item.send_state;
    if (!rawState && typeof item.update_id === "string") {
      if (item.update_id.startsWith("uploading_")) rawState = "uploading";
      else if (item.update_id.startsWith("local_")) rawState = "pending";
      else if (item.update_id.startsWith("failed_")) rawState = "failed";
    }
    let visualState: "sent" | "uploading" | "pending_online" | "pending_offline" | "failed" = "sent";
    if (mine) {
      if (rawState === "uploading") visualState = "uploading";
      else if (rawState === "failed") visualState = "failed";
      else if (rawState === "pending") visualState = connQuality === "offline" ? "pending_offline" : "pending_online";
    }
    return (
      <View style={{ flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start", marginBottom: 12, paddingHorizontal: 10 }}>
        <View style={[styles.chatBubble, {
          backgroundColor: mine ? "#e0edff" : "#F1F1F1",
          borderTopRightRadius: mine ? 0 : 18, borderTopLeftRadius: mine ? 18 : 0,
        }]}>
          <TText style={{ color: getColorForName(item.engineer_name || "Unknown"), fontSize: 13, fontWeight: "700", marginBottom: 4 }}>
            {item.engineer_name}
          </TText>
          <TText style={{ color: "#000", fontSize: 14, lineHeight: 20 }}>{item.update_text}</TText>
          {Array.isArray(item.files) && item.files.length > 0 && (
            <View style={[styles.documentsContainer, { marginTop: 8 }]}>
              {(() => {
                const allFiles = item.files as any[];
                const images = allFiles.filter((f) => isImageAttachment(f));
                const docs = allFiles.filter((f) => !isImageAttachment(f));

                const visibleImages = images.slice(0, MAX_THUMBS_PER_MESSAGE);
                const hiddenImageCount = Math.max(0, images.length - visibleImages.length);

                return (
                  <>
                    {visibleImages.map((file: any, index: number) => {
                      const url = file.file_url || file.uri;
                      const name = file.file_name || file.name || "file";
                      return (
                        <TouchableOpacity
                          key={`img_${index}`}
                          onPress={() => url && setPreviewImage(url)}
                          activeOpacity={0.9}
                        >
                          <Image
                            source={{ uri: url }}
                            style={{ width: 120, height: 100, borderRadius: 8, marginTop: 6 }}
                            resizeMode="cover"
                            resizeMethod="resize"
                          />
                        </TouchableOpacity>
                      );
                    })}

                    {hiddenImageCount > 0 && (
                      <TouchableOpacity
                        style={styles.moreAttachmentsChip}
                        onPress={() => {
                          const firstHidden = images[visibleImages.length];
                          const url = firstHidden?.file_url || firstHidden?.uri;
                          if (url) setPreviewImage(url);
                        }}
                        activeOpacity={0.9}
                      >
                        <Ionicons name="images-outline" size={14} color={C.text} />
                        <TText style={styles.moreAttachmentsText}>{`+${hiddenImageCount} more image${hiddenImageCount === 1 ? "" : "s"}`}</TText>
                      </TouchableOpacity>
                    )}

                    {docs.map((file: any, index: number) => {
                      const url = file.file_url || file.uri;
                      const name = file.file_name || file.name || "file";
                      return (
                        <TouchableOpacity
                          key={`doc_${index}`}
                          onPress={() => {
                            if (!url) return;
                            if (isWeb) {
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = name;
                              a.click();
                            } else {
                              Linking.openURL(url);
                            }
                          }}
                          activeOpacity={0.9}
                        >
                          <TText style={styles.documentLink}>📄 {name}</TText>
                        </TouchableOpacity>
                      );
                    })}
                  </>
                );
              })()}
            </View>
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, paddingHorizontal: 6, alignSelf: mine ? "flex-end" : "flex-start" }}>
          <TText style={{ fontSize: 10, color: "#777" }}>{convertUTCToIST(item.created_at)}</TText>
          {!!item.upload_label && visualState === "uploading" && (
            <TText style={{ fontSize: 10, color: "#007BFF", marginLeft: 6 }}>{`Uploading ${item.upload_label}`}</TText>
          )}
          {mine && (
            <>
              {(visualState === "uploading" || visualState === "pending_online") && <ActivityIndicator size="small" color="#007BFF" style={{ marginLeft: 6 }} />}
              {visualState === "pending_offline" && <Ionicons name="time-outline" size={14} color="#C67C00" style={{ marginLeft: 6 }} />}
              {visualState === "sent" && <Ionicons name="checkmark-done-outline" size={14} color="#2E7D32" style={{ marginLeft: 6 }} />}
              {visualState === "failed" && (
                <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 6 }}>
                  <Ionicons name="alert-circle" size={14} color="#D32F2F" />
                  <TouchableOpacity onPress={() => handleRetrySend(item)} style={{ marginLeft: 4 }}>
                    <Ionicons name="refresh-circle" size={18} color="#D32F2F" />
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    );
  };

  if (!schedule) {
    return (
      <View style={styles.container}>
        <TText style={styles.errorText}>Error: No schedule provided.</TText>
        <TouchableOpacity style={styles.backButton} onPress={() => goBackSafe()}>
          <TText style={styles.backButtonText}>Back to Schedules</TText>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#007BFF" /></View>
    );
  }

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  // KEY LAYOUT STRATEGY:
  // SafeAreaView (flex:1) handles top/left/right/bottom safe areas
  //   ├── Header (fixed height)
  //   ├── Offline banner (conditional)
  //   ├── KeyboardAvoidingView (flex:1)
  //   │     ├── Task card
  //   │     ├── Chat FlatList (flex:1)
  //   │     └── Composer (normal flow, not absolute)
  //   └── AppFooterNav (normal flow, handles its own bottom inset)
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }} testID="task-management-form-root">

      {/* ── Header ── */}
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={goBackSafe}>
          <Ionicons name="arrow-back" size={24} color={C.mutedText} />
        </TouchableOpacity>
        <TText style={styles.headerTitle}>Schedule Updates</TText>
        <TouchableOpacity onPress={() => router.push("/HomeScreen")}>
          <Ionicons name="home" size={24} color={C.mutedText} />
        </TouchableOpacity>
      </View>

      {/* ── Offline Banner ── */}
      {connQuality === "offline" && (
        <View style={styles.offlineBanner}>
          <TText style={styles.offlineBannerText}>
            You're offline — updates will be queued{pendingLocal.length > 0 ? ` (${pendingLocal.length})` : ""}
          </TText>
        </View>
      )}

      {connQuality === "online" && slowUpload && (
        <View style={styles.slowBanner}>
          {(() => {
            const cls = classifyPing(pingMs);
            const pingLabel = pingMs === null ? "Checking…" : `${pingMs} ms`;
            const pillStyle =
              cls.tone === "good"
                ? styles.pingPillGood
                : cls.tone === "warn"
                ? styles.pingPillWarn
                : cls.tone === "bad"
                ? styles.pingPillBad
                : styles.pingPillNeutral;
            const pillTextStyle =
              cls.tone === "good"
                ? styles.pingPillTextGood
                : cls.tone === "warn"
                ? styles.pingPillTextWarn
                : cls.tone === "bad"
                ? styles.pingPillTextBad
                : styles.pingPillTextNeutral;

            return (
              <View style={styles.slowBannerRow}>
                <View style={styles.slowIconWrap}>
                  <Ionicons name="wifi-outline" size={16} color="#7A5B00" />
                </View>
                <View style={styles.slowTextCol}>
                  <TText style={styles.slowBannerTitle}>Slow network</TText>
                  <TText style={styles.slowBannerSub}>Uploading attachment. Keep the app open.</TText>
                </View>
                <View style={[styles.pingPill, pillStyle]}>
                  <TText style={[styles.pingPillText, pillTextStyle]}>{pingLabel}</TText>
                </View>
              </View>
            );
          })()}
        </View>
      )}

      {/* ── Body: KAV wraps chat + composer ── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        {/* Task info card */}
        <View style={taskCardStyles.card}>
          <View style={taskCardStyles.headerRow}>
            <View style={{ flex: 1, paddingRight: 44 }}>
              <TText style={taskCardStyles.title}>{scheduleLocal?.phasename || "-"}</TText>
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
                <TText style={taskCardStyles.subTitle}>• {propertyId || scheduleLocal?.property_id || "-"} • Residential</TText>
                <View style={[taskCardStyles.statusChip, { backgroundColor: st.bg, borderColor: st.bd }]}>
                  <TText style={[taskCardStyles.statusText, { color: st.fg }]}>{prettyStatus(scheduleLocal?.status)}</TText>
                </View>
              </View>
              <TText style={taskCardStyles.dateText}>{fmtDMY(scheduleLocal?.startdate)} - {fmtDMY(scheduleLocal?.enddate)}</TText>
            </View>
            <TouchableOpacity
              onPress={async () => {
                if (isTaskLocked) {
                  if (isParamLocked) {
                    const parentName =
                      resolvedLockingParentName || (await resolveBlockingParentName());
                    const parentLabel = parentName
                      ? `"${parentName}"`
                      : "a parent task";
                    showAlert("Task Locked", `This task is locked because ${parentLabel} is on hold. Resume it in TaskWorkflow to continue.`);
                  } else {
                    showAlert("Task On Hold", "Resume this task in TaskWorkflow to post updates.");
                  }
                  return;
                }
                if (isOwnHold) {
                  setResumeReason("");
                  setShowResumeDialog(true);
                  return;
                }
                openUpdateTask();
              }}
              style={[taskCardStyles.editBtn, isTaskLocked && { backgroundColor: "#F3F4F6", borderColor: "#E5E7EB" }]}
            >
              <Ionicons
                name={isTaskLocked ? "lock-closed-outline" : isOwnHold ? "play-outline" : "create-outline"}
                size={18}
                color={isTaskLocked ? C.subtleText : C.primaryStrong}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Chat list — flex:1 fills remaining space */}
        <View style={styles.chatListContainer}>
          <FlatList
            data={combinedUpdates}
            keyExtractor={(item, idx) => (item.update_id ? String(item.update_id) : `row_${idx}`)}
            renderItem={renderUpdate}
            inverted
            contentContainerStyle={styles.chatList}
            initialNumToRender={12}
            maxToRenderPerBatch={8}
            windowSize={7}
            updateCellsBatchingPeriod={50}
            removeClippedSubviews={Platform.OS === "android"}
          />
        </View>

        {/* Composer — normal flow, sits directly above footer */}
        <View style={styles.composerWrapper}>
          {/* Recipient selector */}
          <View style={recipientStyles.container}>
            <TouchableOpacity
              style={[recipientStyles.tab, selectedSendTarget === "employee" && recipientStyles.activeTab]}
              onPress={() => setSelectedSendTarget("employee")}
            >
              <Ionicons name="people" size={16} color={selectedSendTarget === "employee" ? "#fff" : "#6B7280"} />
              <TText style={[recipientStyles.tabText, selectedSendTarget === "employee" && recipientStyles.activeTabText]}>Engineer</TText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[recipientStyles.tab, selectedSendTarget === "customer" && recipientStyles.activeTab]}
              onPress={() => setSelectedSendTarget("customer")}
            >
              <Ionicons name="person" size={16} color={selectedSendTarget === "customer" ? "#fff" : "#6B7280"} />
              <TText style={[recipientStyles.tabText, selectedSendTarget === "customer" && recipientStyles.activeTabText]}>Customer</TText>
            </TouchableOpacity>
          </View>

          {/* File previews */}
          {newUpdateFiles.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }} contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 4 }}>
              {newUpdateFiles.map((file, index) => {
                const isImg = isImageFileLocal(file);
                const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                return (
                  <View key={index} style={updateInputStyles.previewCardWrapper}>
                    <View style={updateInputStyles.previewCard}>
                      {isImg ? (
                        <Image source={{ uri: file.uri }} style={updateInputStyles.previewImage} />
                      ) : (
                        <View style={updateInputStyles.previewPlaceholder}><Ionicons name="document" size={28} color={C.mutedText} /></View>
                      )}
                      <TText numberOfLines={1} ellipsizeMode="middle" style={updateInputStyles.previewFileName}>{file.name}</TText>
                    </View>
                    <TText style={updateInputStyles.previewTime}>{time}</TText>
                    <TouchableOpacity onPress={() => removeFile(index)} style={updateInputStyles.previewRemoveButton}>
                      <Ionicons name="close-circle" size={18} color={C.danger} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {/* Input row */}
          <View style={updateInputStyles.inputRow}>
            <TextInput
              style={[updateInputStyles.textInput, { height: Math.min(Math.max(inputHeight, 36), 100) }]}
              placeholder={selectedSendTarget === "customer" ? "Message to Customer..." : "Internal Engineer update..."}
              placeholderTextColor={C.subtleText}
              multiline
              value={newUpdateText}
              onChangeText={setNewUpdateText}
              onContentSizeChange={(e) => setInputHeight(e.nativeEvent.contentSize.height)}
            />
            <ModalSelector
              data={[{ key: "camera", label: "Camera" }, { key: "gallery", label: "Gallery" }, { key: "documents", label: "Documents" }]}
              onChange={async (option) => {
                if (option.key === "camera") await pickImageFromCamera();
                else if (option.key === "gallery") await pickImageFromGallery();
                else if (option.key === "documents") await pickDocuments();
              }}
              optionTextStyle={{ color: C.text, textAlign: "center" }}
              optionContainerStyle={{ backgroundColor: C.surface, borderBottomColor: C.border }}
              cancelStyle={{ backgroundColor: C.surface }}
              cancelTextStyle={{ color: C.text }}
              overlayStyle={{ backgroundColor: C.overlay }}
              cancelText="Cancel"
            >
              <View style={{ padding: 6 }}><Ionicons name="add-circle" size={26} color={C.primaryStrong} /></View>
            </ModalSelector>
            <TouchableOpacity style={{ padding: 6, opacity: loading ? 0.5 : 1 }} disabled={loading} onPress={toggleListening}>
              <Ionicons name={isListening ? "mic" : "mic-outline"} size={24} color={isListening ? C.danger : C.primaryStrong} />
            </TouchableOpacity>
            <TouchableOpacity
              style={{ padding: 8, opacity: (loading || !hasComposerPayload) ? 0.4 : 1 }}
              disabled={loading || !hasComposerPayload}
              onPress={() => handleCombinedUpdate(selectedSendTarget)}
            >
              {loading ? <ActivityIndicator size="small" color={C.primaryStrong} /> : <Ionicons name="send" size={24} color={C.primaryStrong} />}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* ── Footer — normal flow, handles its own bottom inset ── */}
      <AppFooterNav
        items={footerItems}
        selectedSection={selectedSection}
        online={online}
        isDisabledOffline={isDisabledOffline}
        onSelect={onFooterSelect}
        colors={{
          border: C.border,
          accent: C.primary,
          accentSoft: C.primarySoft,
          muted: C.mutedText,
          disabledText: C.navIconInactive,
        }}
        useBottomInset={true}
      />

      {/* ── Update Task Modal ── */}
      <Modal visible={updateTaskOpen} transparent animationType="slide" onRequestClose={closeUpdateTask}>
        <TouchableOpacity activeOpacity={1} style={sheetStyles.backdrop} onPress={closeUpdateTask} />
        <View style={sheetStyles.sheetWrap}>
          <View style={sheetStyles.sheet}>
            <View style={sheetStyles.handle} />
            <View style={sheetStyles.headerRow}>
              <TText style={sheetStyles.title}>Update Task</TText>
              <TouchableOpacity onPress={closeUpdateTask} style={sheetStyles.closeBtn}><Ionicons name="close" size={22} color={C.text} /></TouchableOpacity>
            </View>
            <ScrollView style={styles.formContainer} contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.formGroup}>
                <View style={styles.inputContainer}>
                  <TText style={[styles.floatingLabel, phasename ? styles.floatingActive : styles.floatingInactive]}>Schedule Name</TText>
                  <TextInput style={styles.input} value={phasename} onChangeText={setPhaseName} placeholder="Enter phase name" placeholderTextColor={C.subtleText} />
                </View>
              </View>
              <View style={styles.formGroup}>
                <View style={styles.inputContainer}>
                  <TText style={[styles.floatingLabel, displayStatus ? styles.floatingActive : styles.floatingInactive]}>Status</TText>
                  <TouchableOpacity style={styles.input} activeOpacity={0.8} onPress={() => modalSelectorRef.current?.open?.()}>
                    <TText numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: displayStatus ? C.text : C.subtleText }}>
                      {displayStatus || "Select Status"}
                    </TText>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={[styles.formGroup, styles.row]}>
                <View style={[styles.inputContainer, styles.col]}>
                  <TText style={[styles.floatingLabel, startDate ? styles.floatingActive : styles.floatingInactive]}>Start Date</TText>
                  {isWeb ? (
                    <input ref={webStartInputRef as any} type="date" style={webDateInputStyle as any} value={ymd(startDate)}
                      onChange={(e) => {
                        applyStartDateSelection((e.target as any).value, { autoShiftEnd: true });
                        if (pendingSendAfterGuard) { const tgt = pendingSendAfterGuard; setPendingSendAfterGuard(null); setTimeout(() => handleCombinedUpdate(tgt), 0); }
                      }} />
                  ) : (
                    <>
                      <TouchableOpacity onPress={() => setShowStartPicker(true)} style={styles.dateTouchable}>
                        <TText numberOfLines={1} style={styles.dateText}>{ymd(startDate)}</TText>
                        <Ionicons name="calendar-outline" size={16} color={C.mutedText} />
                      </TouchableOpacity>
                      {showStartPicker && (
                        <View style={Platform.OS === "ios" ? styles.datePickerPanel : undefined}>
                          <DateTimePicker
                            value={startDate}
                            mode="date"
                            display={Platform.OS === "ios" ? "spinner" : "default"}
                            minimumDate={new Date(2000, 0, 1)}
                            themeVariant={theme.mode}
                            textColor={C.text}
                            accentColor={C.primaryStrong}
                            positiveButton={{ label: "OK", textColor: C.primaryStrong }}
                            negativeButton={{ label: "Cancel", textColor: C.mutedText }}
                            onChange={(event, selected) => {
                              if (Platform.OS !== "ios") setShowStartPicker(false);
                              if (!selected || event.type === "dismissed") return;
                              applyStartDateSelection(selected, { autoShiftEnd: true });
                              if (Platform.OS === "ios") return;
                              if (pendingSendAfterGuard) { const tgt = pendingSendAfterGuard; setPendingSendAfterGuard(null); setTimeout(() => handleCombinedUpdate(tgt), 0); }
                            }}
                          />
                          {Platform.OS === "ios" && (
                            <TouchableOpacity
                              style={styles.datePickerDone}
                              onPress={() => {
                                setShowStartPicker(false);
                                if (pendingSendAfterGuard) { const tgt = pendingSendAfterGuard; setPendingSendAfterGuard(null); setTimeout(() => handleCombinedUpdate(tgt), 0); }
                              }}
                            >
                              <TText style={styles.datePickerDoneText}>Done</TText>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </>
                  )}
                </View>
                <View style={[styles.inputContainer, styles.col, { marginLeft: 12 }]}>
                  <TText style={[styles.floatingLabel, endDate ? styles.floatingActive : styles.floatingInactive]}>End Date</TText>
                  {isWeb ? (
                    <input ref={webEndInputRef as any} type="date" style={webDateInputStyle as any} value={ymd(endDate)}
                      onChange={async (e) => {
                        const applied = await applyEndDateSelection((e.target as any).value);
                        if (!applied) return;
                        if (pendingSendAfterGuard) { const tgt = pendingSendAfterGuard; setPendingSendAfterGuard(null); setTimeout(() => handleCombinedUpdate(tgt), 0); }
                      }} />
                  ) : (
                    <>
                      <TouchableOpacity onPress={() => setShowEndPicker(true)} style={styles.dateTouchable}>
                        <TText numberOfLines={1} style={styles.dateText}>{ymd(endDate)}</TText>
                        <Ionicons name="calendar-outline" size={16} color={C.mutedText} />
                      </TouchableOpacity>
                      {showEndPicker && (
                        <View style={Platform.OS === "ios" ? styles.datePickerPanel : undefined}>
                          <DateTimePicker
                            value={endDate}
                            mode="date"
                            display={Platform.OS === "ios" ? "spinner" : "default"}
                            themeVariant={theme.mode}
                            textColor={C.text}
                            accentColor={C.primaryStrong}
                            positiveButton={{ label: "OK", textColor: C.primaryStrong }}
                            negativeButton={{ label: "Cancel", textColor: C.mutedText }}
                            onChange={async (event, date) => {
                              if (Platform.OS !== "ios") setShowEndPicker(false);
                              if (!date || event.type === "dismissed") return;
                              const applied = await applyEndDateSelection(date);
                              if (!applied) return;
                              if (Platform.OS === "ios") return;
                              if (pendingSendAfterGuard) { const tgt = pendingSendAfterGuard; setPendingSendAfterGuard(null); setTimeout(() => handleCombinedUpdate(tgt), 0); }
                            }}
                          />
                          {Platform.OS === "ios" && (
                            <TouchableOpacity
                              style={styles.datePickerDone}
                              onPress={() => {
                                setShowEndPicker(false);
                                if (pendingSendAfterGuard) { const tgt = pendingSendAfterGuard; setPendingSendAfterGuard(null); setTimeout(() => handleCombinedUpdate(tgt), 0); }
                              }}
                            >
                              <TText style={styles.datePickerDoneText}>Done</TText>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </>
                  )}
                </View>
              </View>
              <View style={styles.formGroup}>
                <TouchableOpacity onPress={() => setApplyToAll(!applyToAll)} style={{ flexDirection: "row", alignItems: "center" }}>
                  <Ionicons name={applyToAll ? "checkbox" : "square-outline"} size={24} color={C.text} style={{ marginRight: 10 }} />
                  <TText style={{ fontSize: 16, color: C.text }}>Adjust All Subsequent Tasks</TText>
                </TouchableOpacity>
              </View>
            </ScrollView>
            <View style={sheetStyles.footer}>
              <TouchableOpacity
                style={[sheetStyles.saveBtn, (loading || !selectedSendTarget) && { opacity: 0.6 }]}
                disabled={loading || !selectedSendTarget}
                onPress={async () => {
                  if (!selectedSendTarget) { showAlert("Missing Option", "Please select Customer or Engineer."); return; }
                  await handleCombinedUpdate(selectedSendTarget);
                  closeUpdateTask();
                }}
              >
                <TText style={sheetStyles.saveText}>{loading ? "Saving..." : "Save"}</TText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Hold Modal ── */}
      <Modal visible={modalType === "hold"} transparent animationType="fade" onRequestClose={() => { if (!holdLoading) setModalType(null); }}>
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, { width: "88%", maxWidth: 520 }]}>
            <TText style={{ fontSize: 16, fontWeight: "800", color: C.text }}>Hold Task</TText>
            <TText style={{ marginTop: 8, fontSize: 13, color: C.mutedText }}>This will put schedule #{schedule?.scheduleid} on hold for {propertyId}.</TText>
            <TText style={{ marginTop: 14, fontSize: 12, fontWeight: "700", color: C.text }}>Hold type</TText>
            <ModalSelector ref={holdTypeSelectorRef}
              data={[{ key: "Customer", label: "Customer" }, { key: "Avenue", label: "Avenue" }]}
              initValue="Select Type" keyExtractor={(item) => item.key}
              onChange={(option) => setHoldType(option.key as "Customer" | "Avenue")}
              cancelText="Cancel" optionTextStyle={{ color: C.text, textAlign: "center" }}
              optionContainerStyle={{ backgroundColor: C.surface, borderBottomColor: C.border }}
              cancelStyle={{ backgroundColor: C.surface }}
              cancelTextStyle={{ color: C.text }}
              overlayStyle={{ backgroundColor: C.overlay }}
              customSelector={
                <TouchableOpacity onPress={() => holdTypeSelectorRef.current?.open?.()}
                  style={{ marginTop: 8, borderWidth: 1, borderColor: C.borderStrong, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: C.surfaceAlt }}
                  disabled={holdLoading}>
                  <TText style={{ fontSize: 14, color: holdType ? C.text : C.subtleText, textAlign: "center" }}>{holdType || "Select Type"}</TText>
                </TouchableOpacity>
              }
            />
            <TText style={{ marginTop: 12, fontSize: 12, fontWeight: "700", color: C.text }}>Hold reason</TText>
            <TextInput value={holdReason} onChangeText={setHoldReason} placeholder="Enter reason" placeholderTextColor={C.subtleText} editable={!holdLoading}
              style={{ marginTop: 8, borderWidth: 1, borderColor: C.borderStrong, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.surfaceAlt, color: C.text, minHeight: 80 }}
              multiline />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 14 }}>
              <TouchableOpacity disabled={holdLoading} onPress={() => { setModalType(null); setHoldReason(""); setHoldType(""); }}
                style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: C.borderStrong, marginRight: 10, opacity: holdLoading ? 0.6 : 1 }}>
                <TText style={{ fontWeight: "700", color: C.text }}>Cancel</TText>
              </TouchableOpacity>
              <TouchableOpacity disabled={holdLoading} onPress={holdScheduleNow}
                style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: "#D32F2F", opacity: holdLoading ? 0.75 : 1, flexDirection: "row", alignItems: "center" }}>
                {holdLoading ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} /> : null}
                <TText style={{ fontWeight: "800", color: "#fff" }}>Submit</TText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Resume Modal ── */}
      <Modal visible={showResumeDialog} transparent animationType="fade" onRequestClose={() => { if (!resumeLoading) setShowResumeDialog(false); }}>
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, { width: "88%", maxWidth: 520 }]}>
            <TText style={{ fontSize: 16, fontWeight: "800", color: C.text }}>Resume Schedule?</TText>
            <TText style={{ marginTop: 8, fontSize: 13, color: C.mutedText }}>This will resume schedule #{schedule?.scheduleid} for {propertyId}.</TText>
            <TText style={{ marginTop: 12, fontSize: 12, fontWeight: "700", color: C.text }}>Resume reason</TText>
            <TextInput value={resumeReason} onChangeText={setResumeReason}
              placeholder="e.g. Materials received, work restarting today" placeholderTextColor={C.subtleText} editable={!resumeLoading}
              style={{ marginTop: 8, borderWidth: 1, borderColor: C.borderStrong, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.surfaceAlt, color: C.text }}
              multiline />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 14 }}>
              <TouchableOpacity disabled={resumeLoading} onPress={() => setShowResumeDialog(false)}
                style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: C.borderStrong, marginRight: 10, opacity: resumeLoading ? 0.6 : 1 }}>
                <TText style={{ fontWeight: "700", color: C.text }}>Cancel</TText>
              </TouchableOpacity>
              <TouchableOpacity disabled={resumeLoading} onPress={resumeScheduleNow}
                style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: "#1976D2", opacity: resumeLoading ? 0.75 : 1, flexDirection: "row", alignItems: "center" }}>
                {resumeLoading ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} /> : null}
                <TText style={{ fontWeight: "800", color: "#fff" }}>Confirm</TText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Image Preview Modal ── */}
      {previewImage && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.95)" }}>
            <TouchableOpacity onPress={() => { setPreviewImage(null); stopWebcam(); }}
              style={{ position: "absolute", top: 40, right: 20, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 20, padding: 6, zIndex: 10 }}>
              <Ionicons name="close-circle" size={36} color={C.white} />
            </TouchableOpacity>
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
              <ReactNativeZoomableView maxZoom={3} minZoom={1} zoomStep={0.5} initialZoom={1} bindToBorders doubleTapZoomToCenter
                style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, alignSelf: "center", justifyContent: "center", alignItems: "center" }}>
                <Image source={{ uri: previewImage }} style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, resizeMode: "contain" }} />
              </ReactNativeZoomableView>
            </View>
          </View>
        </Modal>
      )}

      {/* Status action modal selector */}
      <ModalSelector
        ref={modalSelectorRef} selectStyle={styles.picker} initValueTextStyle={styles.pickerText}
        optionTextStyle={styles.pickerText} data={getStatusActions(status)} initValue="Choose Action"
        optionContainerStyle={{ backgroundColor: C.surface, borderBottomColor: C.border }}
        onChange={(option) => {
          if (option.key === "resume") { setResumeReason(""); setShowResumeDialog(true); return; }
          if (option.key === "hold") { setHoldReason(""); setHoldType(""); setModalType("hold"); return; }
          onStatusChange(option.value);
        }}
        cancelText="Cancel" cancelStyle={{ backgroundColor: C.surface }} cancelTextStyle={{ color: C.text }} overlayStyle={{ backgroundColor: C.overlay }} visible={false} touchableActiveOpacity={0}
        childrenContainerStyle={{ display: "none" }}
      />
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const createUpdateInputStyles = (C: ReturnType<typeof useTheme>["theme"]["colors"]) => StyleSheet.create({
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.borderStrong,
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginHorizontal: 8,
    marginBottom: 6,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  textInput: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 13,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceAlt,
    color: C.text,
  },
  previewCardWrapper: { width: 130, marginRight: 8, alignItems: "flex-end" },
  previewCard: { width: "100%", backgroundColor: C.primarySoft, borderRadius: 10, padding: 5 },
  previewImage: { width: "100%", height: 80, borderRadius: 8, marginBottom: 4, resizeMode: "cover" },
  previewPlaceholder: { width: "100%", height: 80, backgroundColor: C.surfaceAlt, borderRadius: 8, justifyContent: "center", alignItems: "center", marginBottom: 4 },
  previewFileName: { fontSize: 11, color: C.text, fontWeight: "500" },
  previewTime: { fontSize: 10, color: C.subtleText, marginTop: 2, marginRight: 2, alignSelf: "flex-end" },
  previewRemoveButton: { position: "absolute", top: -6, right: -6, backgroundColor: C.surface, borderRadius: 10 },
});

const createStyles = (C: ReturnType<typeof useTheme>["theme"]["colors"]) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, padding: 10 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.bg },
  row: { flexDirection: "row", alignItems: "flex-start" },
  col: { flex: 1 },
  offlineBanner: { backgroundColor: "#FFD7D7", paddingVertical: 6, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
  offlineBannerText: { color: "#C93030", fontWeight: "600", fontSize: 13 },
  slowBanner: {
    backgroundColor: "#FFF3C4",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(122, 91, 0, 0.18)",
  },
  slowBannerRow: { flexDirection: "row", alignItems: "center" },
  slowIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.65)",
    borderWidth: 1,
    borderColor: "rgba(122, 91, 0, 0.18)",
    marginRight: 10,
  },
  slowTextCol: { flex: 1, paddingRight: 10 },
  slowBannerTitle: { color: "#7A5B00", fontWeight: "900", fontSize: 13 },
  slowBannerSub: { color: "#7A5B00", fontWeight: "700", fontSize: 11, marginTop: 1, opacity: 0.92 },
  pingPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 78,
    alignItems: "center",
  },
  pingPillText: { fontSize: 11, fontWeight: "900" },
  pingPillNeutral: { backgroundColor: "rgba(255, 255, 255, 0.7)", borderColor: "rgba(122, 91, 0, 0.18)" },
  pingPillTextNeutral: { color: "#7A5B00" },
  pingPillGood: { backgroundColor: "rgba(34, 197, 94, 0.12)", borderColor: "rgba(34, 197, 94, 0.35)" },
  pingPillTextGood: { color: "#166534" },
  pingPillWarn: { backgroundColor: "rgba(245, 158, 11, 0.14)", borderColor: "rgba(245, 158, 11, 0.4)" },
  pingPillTextWarn: { color: "#92400E" },
  pingPillBad: { backgroundColor: "rgba(239, 68, 68, 0.12)", borderColor: "rgba(239, 68, 68, 0.4)" },
  pingPillTextBad: { color: "#991B1B" },
  moreAttachmentsChip: {
    marginTop: 8,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceAlt,
  },
  moreAttachmentsText: { fontSize: 12, fontWeight: "900", color: C.text },
  headerContainer: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: C.headerBg,
    borderBottomWidth: 1, borderBottomColor: C.border,
    justifyContent: "space-between",
  },
  headerTitle: { fontSize: 18, fontWeight: "bold", color: C.text },
  modalContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.overlay },
  modalContent: { backgroundColor: C.surface, padding: 20, borderRadius: 10, width: "80%" },
  formContainer: { flexGrow: 0, paddingHorizontal: 12, paddingTop: 8 },
  formGroup: { marginBottom: 16, position: "relative" },
  inputContainer: { position: "relative", borderWidth: 1, borderColor: C.borderStrong, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: C.surfaceAlt },
  input: { fontSize: 14, color: C.text, paddingHorizontal: 4, paddingTop: 6, paddingBottom: 6, textAlignVertical: "top" },
  dateTouchable: {
    minHeight: 34,
    paddingHorizontal: 4,
    paddingTop: 6,
    paddingBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  dateText: { flex: 1, fontSize: 14, fontWeight: "600", color: C.text },
  datePickerPanel: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    overflow: "hidden",
  },
  datePickerDone: {
    alignSelf: "flex-end",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  datePickerDoneText: { color: C.primaryStrong, fontSize: 14, fontWeight: "800" },
  floatingLabel: { position: "absolute", left: 12, top: 14, fontSize: 13, color: C.text, backgroundColor: C.surface, paddingHorizontal: 6, borderRadius: 6 },
  floatingActive: { top: -9, fontSize: 12, color: C.mutedText, fontWeight: "700" },
  floatingInactive: { top: 14, fontSize: 13, color: C.mutedText },
  picker: { borderWidth: 0, padding: 10 },
  pickerText: { fontSize: 14, color: C.text, textTransform: "uppercase" },
  backButton: { marginTop: 10, backgroundColor: C.primaryStrong, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6, alignSelf: "center" },
  backButtonText: { color: C.white, fontWeight: "600", fontSize: 14, textAlign: "center" },
  errorText: { color: C.danger, fontSize: 16, textAlign: "center", marginBottom: 20 },
  // Chat list: flex:1 so it fills all space between card and composer
  chatListContainer: {
    flex: 1,
    marginHorizontal: 8,
    marginTop: 6,
    marginBottom: 0,
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    elevation: 2,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  chatList: { paddingVertical: 8 },
  chatBubble: {
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 14,
    maxWidth: "80%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  documentsContainer: { marginTop: 8 },
  documentLink: { fontSize: 14, color: "#4A90E2", textDecorationLine: "underline", marginBottom: 4 },
  // Composer: normal flow, white background, border on top
  composerWrapper: {
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 6,
    paddingBottom: Platform.OS === "ios" ? 4 : 6,
  },
});

const createTaskCardStyles = (C: ReturnType<typeof useTheme>["theme"]["colors"]) => StyleSheet.create({
  card: {
    backgroundColor: C.surface, borderRadius: 14, padding: 12,
    marginHorizontal: 8, marginTop: 8,
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  headerRow: { position: "relative", flexDirection: "row", alignItems: "flex-start" },
  title: { fontSize: 15, fontWeight: "800", color: C.text },
  subTitle: { fontSize: 12, color: C.mutedText },
  dateText: { marginTop: 4, fontSize: 12, color: C.mutedText },
  editBtn: {
    position: "absolute", top: 0, right: 0,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: C.border,
  },
  statusChip: { marginLeft: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  statusText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
});

const createSheetStyles = (C: ReturnType<typeof useTheme>["theme"]["colors"]) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: C.overlay },
  sheetWrap: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 14 },
  sheet: {
    backgroundColor: C.surface, borderRadius: 22, paddingTop: 10, overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12, maxHeight: "86%",
  },
  handle: { width: 44, height: 5, borderRadius: 999, backgroundColor: C.borderStrong, alignSelf: "center" },
  headerRow: { paddingHorizontal: 18, paddingBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 15, fontWeight: "700", color: C.text },
  closeBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: C.surfaceAlt },
  footer: { padding: 14, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface },
  saveBtn: { height: 52, borderRadius: 14, backgroundColor: C.primaryStrong, alignItems: "center", justifyContent: "center" },
  saveText: { color: C.white, fontSize: 16, fontWeight: "800" },
});

const createRecipientStyles = (C: ReturnType<typeof useTheme>["theme"]["colors"]) => StyleSheet.create({
  container: { flexDirection: "row", backgroundColor: C.surfaceAlt, borderRadius: 20, padding: 3, width: 210, alignSelf: "center", marginBottom: 4, marginTop: 4 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 5, borderRadius: 18, gap: 4 },
  activeTab: { backgroundColor: C.primaryStrong, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 11, fontWeight: "700", color: C.mutedText },
  activeTabText: { color: C.white },
});

export default TaskManagementForm;