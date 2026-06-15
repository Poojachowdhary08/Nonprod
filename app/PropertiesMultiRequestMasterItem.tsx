import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Platform,
  ScrollView,
  ActivityIndicator,
  AppState,
  AppStateStatus,
} from "react-native";
import ModalSelector from "@/components/AppModalSelect";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import axios from "axios";
import NetInfo, { NetInfoSubscription, NetInfoState } from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import AppFooterNav, { FooterNavItem } from "./AppFooterNav";
import TText from "@/components/TText";
import { useTheme } from "@/src/theme/ThemeProvider";

import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
import { getDecimalInputProps } from "../utils/keyboardProps";
import { resolveEmployeeIdentity } from "../utils/employeeIdentity";
import { authenticatedFetch } from "../utils/auth";

interface InventoryItem {
  item_id?: string;
  item_name: string;
  item_type: string;
  id: number;
  quantity: number;
  minimum_quantity: number;
  requested_quantity?: string;
}
interface Option {
  key: string;
  label: string;
}

type ItemType = "general" | "avenue_add_on" | "customer_add_on";
type TypeOption = { key: ItemType; label: string };

const TYPE_OPTIONS: { key: ItemType; label: string }[] = [
  { key: "general", label: "General" },
  { key: "avenue_add_on", label: "Avenue Add On" },
  { key: "customer_add_on", label: "Customer Add On" },
];

const API_URL = `${APP_API_BASE_URL}/request-inventory`;
const MASTER_ITEMS_URL = `${APP_API_BASE_URL}/get-all-masteritems-new-non-paginated`;
const SCHEDULE_URL = (propId: string) => `${APP_API_BASE_URL}/properties/${propId}/schedule?_${Date.now()}`;
const DELAY_MS = 3000;
const INVENTORY_REQUEST_SOURCE = "PropertiesMultiRequestMasterItem";

// -------------------- Offline Keys --------------------
const KS = {
  masterItems: "cache:masteritems:v1",
  phasesForPropPrefix: "cache:phases:prop:",
  outbox: "outbox:inventoryRequests:v1",
};

type OutboxRequest = {
  id: string;
  when: string;
  payload: any;
};

const pickParam = (v: any) => (Array.isArray(v) ? v[0] : v);

const isInProgressStrict = (row: any): boolean => {
  const raw =
    row?.status ??
    row?.phase_status ??
    row?.phaseStatus ??
    row?.status_name ??
    row?.statusName ??
    "";
  const norm = String(raw).trim().toLowerCase().replace(/\s+/g, "_");
  return norm === "in_progress" || norm === "in-progress";
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const formatHashDate = (d: Date) => `#${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
const todayAtMidnight = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
};
const toLocalDateValue = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
const fromLocalDateValue = (value: string) => {
  const [yyyy, mm, dd] = value.split("-").map(Number);
  return new Date(yyyy, (mm || 1) - 1, dd || 1);
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
  border: "#E5E7EB",
  card: "#FFFFFF",
  accent: "#2C7BE5",
  accentSoft: "#E8F1FF",
  muted: "#9CA3AF",
  disabledText: "#9AA0A6",
};

const PropertiesMultiRequestMasterItem = () => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  const router = useRouter();
  const params = useLocalSearchParams();

  const selectedItems: InventoryItem[] = params.items
    ? JSON.parse(Array.isArray(params.items) ? params.items[0] : (params.items as string))
    : [];

  const [selectedItemsList, setSelectedItemsList] = useState<InventoryItem[]>([]);

  const projectId = useMemo(() => {
    const v = pickParam(params.project_id) ?? pickParam(params.projectId) ?? "";
    return String(v || "").trim();
  }, [params.project_id, params.projectId]);

  const propertyId = useMemo(() => {
    const v = pickParam(params.property_id) ?? pickParam(params.propertyId) ?? "";
    return String(v || "").trim();
  }, [params.property_id, params.propertyId]);

  const propertyName = useMemo(() => {
    const v = pickParam(params.propertyName) ?? pickParam(params.property_name) ?? "";
    return String(v || "").trim();
  }, [params.propertyName, params.property_name]);

  const projectName = useMemo(() => {
    const v =
      pickParam(params.projectName) ??
      pickParam(params.project_name) ??
      pickParam(params.projectLocation) ??
      pickParam(params.project_location) ??
      "";
    return String(v || "").trim();
  }, [params.projectName, params.project_name, params.projectLocation, params.project_location]);

  const projectLocation = useMemo(() => {
    const v = pickParam(params.projectLocation) ?? pickParam(params.project_location) ?? "";
    return String(v || "").trim();
  }, [params.projectLocation, params.project_location]);

  const userDetails = useMemo(() => {
    const raw = pickParam(params.userDetails) ?? pickParam(params.user_details) ?? "";
    if (!raw) return null;
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return raw;
    }
  }, [params.userDetails, params.user_details]);
  const identityParams = useMemo(
    () => ({
      employee_code: params.employee_code,
      employee_details: params.employee_details,
      userDetails: params.userDetails,
      user_details: params.user_details,
      phone_number: params.phone_number,
    }),
    [
      params.employee_code,
      params.employee_details,
      params.userDetails,
      params.user_details,
      params.phone_number,
    ]
  );

  const [phaseOptions, setPhaseOptions] = useState<Option[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [selectedPhaseLabel, setSelectedPhaseLabel] = useState<string>("Select Phase");

  const [type, setType] = useState<ItemType>("general");
  const [startDate, setStartDate] = useState(todayAtMidnight());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [remarks, setRemarks] = useState("");

  const [filterOptions, setFilterOptions] = useState<Option[]>([]);
  const [isItemSearchModalVisible, setItemSearchModalVisible] = useState(false);
  const [itemSearchText, setItemSearchText] = useState("");

  const [progressVisible, setProgressVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [successCount, setSuccessCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);

  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const isOnlineRef = useRef(true);
  const didInitialOnlineLoadRef = useRef(false);
  const masterItemsFetchInFlightRef = useRef(false);
  const phasesFetchInFlightRef = useRef<Record<string, boolean>>({});
  const lastMasterItemsFetchAtRef = useRef(0);
  const lastPhasesFetchAtRef = useRef<Record<string, number>>({});

  const online = isConnected !== false;
  const isDisabledOffline = (id: number) => !online && (id === 5 || id === 7);
  const [selectedSection, setSelectedSection] = useState<number>(3);

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

    router.push({
      pathname: "/PropertiesListScreen",
      params: {
        propertyId: propertyId || String(params.propertyId || ""),
        selectedSection: String(item.id),
        projectId: projectId || String(params.projectId || ""),
        propertyName: propertyName || "",
        projectLocation: projectLocation || "",
        userDetails: userDetails ? JSON.stringify(userDetails) : "",
      },
    } as any);
  };

  const setJSON = async (k: string, v: any) => {
    try {
      await AsyncStorage.setItem(k, JSON.stringify(v));
    } catch {}
  };
  const getJSON = async <T,>(k: string, fallback: T): Promise<T> => {
    try {
      const raw = await AsyncStorage.getItem(k);
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  };

  const enqueueOutbox = async (payload: any) => {
    const box = await getJSON<OutboxRequest[]>(KS.outbox, []);
    const entry: OutboxRequest = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      when: new Date().toISOString(),
      payload,
    };
    const next = [entry, ...box].slice(0, 300);
    await setJSON(KS.outbox, next);
    return entry.id;
  };

  const ensureInventoryRequestIdentity = useCallback(
    async (payload: Record<string, any>) => {
      const employeeCode = String(payload.employee_code || "").trim();
      if (employeeCode) return payload;

      const identity = await resolveEmployeeIdentity(identityParams as Record<string, unknown>);
      const effectiveEmployeeCode = identity.employee_code || "";
      if (!effectiveEmployeeCode) return payload;

      return {
        ...payload,
        employee_code: effectiveEmployeeCode,
      };
    },
    [identityParams]
  );

  const flushOutbox = useCallback(async (_force = false) => {
    const box = await getJSON<OutboxRequest[]>(KS.outbox, []);
    if (!box.length) return;

    const stillPending: OutboxRequest[] = [];
    let success = 0;

    for (const req of box) {
      try {
        const payload = await ensureInventoryRequestIdentity(req.payload || {});
        if (!String(payload.employee_code || "").trim()) throw new Error("missing employee_code");
        const resp = await axios.post(API_URL, payload, {
          timeout: 30000,
          headers: {
            "Content-Type": "application/json",
            "x-client-sync-mode": "offline_replay",
            "x-client-request-source": INVENTORY_REQUEST_SOURCE,
          },
        });
        if (resp?.data?.success === false) throw new Error("backend failure");
        success++;
      } catch {
        stillPending.push(req);
      }
    }

    await setJSON(KS.outbox, stillPending);

    if (success > 0) {
      Alert.alert("Synced", `Sent ${success} pending request(s).`);
    }
  }, [ensureInventoryRequestIdentity]);

  const hydrateMasterItems = useCallback(async () => {
    const cache = await getJSON<{ id: string; item_name: string }[]>(KS.masterItems, []);
    if (cache.length) {
      const options: Option[] = cache.map((it: any) => ({ key: String(it.id), label: it.item_name }));
      setFilterOptions(options);
    }
  }, []);

  const hydratePhases = useCallback(async (propId: string) => {
    const cacheKey = `${KS.phasesForPropPrefix}${propId}`;
    const cache = await getJSON<Option[]>(cacheKey, []);
    if (cache.length) setPhaseOptions(cache);
  }, []);

  const fetchMasterItems = useCallback(async (silent = false) => {
    const now = Date.now();
    if (masterItemsFetchInFlightRef.current) return;
    if (silent && lastMasterItemsFetchAtRef.current && now - lastMasterItemsFetchAtRef.current < 5 * 60 * 1000) return;

    try {
      masterItemsFetchInFlightRef.current = true;
      lastMasterItemsFetchAtRef.current = now;
      const response = await authenticatedFetch(MASTER_ITEMS_URL);
      const json = await response.json();
      if (Array.isArray(json.items)) {
        const slim = json.items.map((it: any) => ({ id: it.id, item_name: it.item_name }));
        await setJSON(KS.masterItems, slim);
        const options: Option[] = slim.map((s: any) => ({ key: String(s.id), label: s.item_name }));
        setFilterOptions(options);
      } else if (!silent) {
        Alert.alert("Items", "No items found from server.");
      }
    } catch {
      if (!silent) Alert.alert("Network", "Unable to refresh items. Showing cached.");
    } finally {
      masterItemsFetchInFlightRef.current = false;
    }
  }, []);

  const fetchSchedulePhases = useCallback(async (propId: string, silent = false) => {
    const cacheKey = `${KS.phasesForPropPrefix}${propId}`;
    const now = Date.now();
    if (phasesFetchInFlightRef.current[propId]) return;
    if (silent && lastPhasesFetchAtRef.current[propId] && now - lastPhasesFetchAtRef.current[propId] < 2 * 60 * 1000) return;

    try {
      phasesFetchInFlightRef.current[propId] = true;
      lastPhasesFetchAtRef.current[propId] = now;
      const response = await axios.get(SCHEDULE_URL(propId), { timeout: 30000 });
      const data = response.data?.schedule ?? response.data;
      const arr: any[] = Array.isArray(data) ? data : [];

      const formatted = arr
        .filter((it) => it?.phasename && isInProgressStrict(it))
        .map((it) => ({
          key: String(it.scheduleid ?? it.schedule_id ?? it.id),
          label: String(it.phasename),
        }));

      setPhaseOptions(formatted);
      await setJSON(cacheKey, formatted);

      if (formatted.length === 0 && !silent) {
        setSelectedScheduleId(null);
        setSelectedPhaseLabel("No in-progress phases");
        Alert.alert("No in-progress phases", "This property has no phases currently in progress.");
      } else {
        setSelectedScheduleId((prev) => (formatted.some((p) => p.key === prev) ? prev : null));
        setSelectedPhaseLabel((prev) => (formatted.some((p) => p.label === prev) ? prev : "Select Phase"));
      }
    } catch {
      if (!silent) Alert.alert("Network", "Could not load phases. Showing cached if available.");
      const cache = await getJSON<Option[]>(cacheKey, []);
      setPhaseOptions(cache);
    } finally {
      phasesFetchInFlightRef.current[propId] = false;
    }
  }, []);

  useEffect(() => {
    setSelectedItemsList(selectedItems.map((item) => ({ ...item, requested_quantity: "" })));
  }, []);

  useEffect(() => {
    let unsub: NetInfoSubscription | undefined;
    let appStateSub: { remove: () => void } | undefined;

    (async () => {
      const st = await NetInfo.fetch();
      const onlineNow = Boolean(st.isConnected && st.isInternetReachable !== false);
      setIsOnline(onlineNow);
      setIsConnected(onlineNow);
      isOnlineRef.current = onlineNow;

      if (onlineNow) await flushOutbox(true);

      unsub = NetInfo.addEventListener(async (s: NetInfoState) => {
        const online = Boolean(s.isConnected && s.isInternetReachable !== false);
        const wasOnline = isOnlineRef.current;
        setIsOnline(online);
        setIsConnected(online);
        isOnlineRef.current = online;

        if (online && !wasOnline) {
          await flushOutbox(true);
          if (propertyId) fetchSchedulePhases(propertyId, true);
          fetchMasterItems(true);
        }
      });

      await hydrateMasterItems();
      if (propertyId) await hydratePhases(propertyId);

      if (onlineNow && !didInitialOnlineLoadRef.current) {
        didInitialOnlineLoadRef.current = true;
        fetchMasterItems();
        if (propertyId) fetchSchedulePhases(propertyId);
      }

      appStateSub = AppState.addEventListener("change", async (state: AppStateStatus) => {
        if (state === "active") {
          const check = await NetInfo.fetch();
          const nowOnline = Boolean(check.isConnected && check.isInternetReachable !== false);
          if (nowOnline) {
            await flushOutbox(true);
          }
        }
      });
    })();

    return () => {
      unsub?.();
      appStateSub?.remove?.();
    };
  }, [propertyId, flushOutbox, fetchSchedulePhases, fetchMasterItems, hydrateMasterItems, hydratePhases]);

  const resetForm = () => {
    setSelectedItemsList(selectedItems.map((item) => ({ ...item, requested_quantity: "" })));
    setSelectedScheduleId(null);
    setSelectedPhaseLabel("Select Phase");
    setStartDate(new Date());
    setRemarks("");
    setType("general");
  };

  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

  const canSubmit =
    !!projectId &&
    !!propertyId &&
    !!selectedScheduleId &&
    !!remarks.trim() &&
    selectedItemsList.length > 0 &&
    selectedItemsList.every((it) => it.item_name && Number(it.requested_quantity || 0) > 0) &&
    !isSubmitting;

  const handleSubmitRequest = async () => {
    if (!projectId || !propertyId) {
      Alert.alert("Missing Fields", "Please ensure Project and Property are selected.");
      return;
    }
    if (!selectedScheduleId) {
      Alert.alert("Missing Phase", "Please select an in-progress Phase.");
      return;
    }
    if (!remarks.trim()) {
      Alert.alert("Missing Description", "Please enter a description.");
      return;
    }

    const validItems = selectedItemsList
      .map((it) => ({ ...it, qty: Number(it.requested_quantity || 0) }))
      .filter((it) => it.item_name && it.qty > 0);

    if (validItems.length === 0) {
      Alert.alert("No Items", "Please add at least one item with quantity > 0.");
      return;
    }

    const identity = await resolveEmployeeIdentity(params as Record<string, unknown>);
    const employee_code = identity.employee_code || "";
    if (!employee_code) {
      Alert.alert("Missing Employee", "Employee code could not be resolved for this request.");
      return;
    }

    const deli_date = toLocalDateValue(startDate);

    if (!isOnline) {
      let enq = 0;
      for (const item of validItems) {
        const payload = {
          item_name: item.item_name,
          requested_quantity: item.qty,
          project_id: projectId,
          project_name: projectName || projectLocation || null,
          property_id: propertyId,
          property_name: propertyName || propertyId,
          deli_date,
          employee_code,
          initial_remark: remarks.trim(),
          item_type: (type || "general").toUpperCase(),
          schedule_id: selectedScheduleId,
        };
        await enqueueOutbox(payload);
        enq++;
      }
      Alert.alert("Saved offline", `Queued ${enq} request(s). I’ll auto-send them when you’re back online.`);
      resetForm();
      return;
    }

    setProgressVisible(true);
    setIsSubmitting(true);
    setSubmitDone(false);
    setCurrentIndex(0);
    setTotalCount(validItems.length);
    setSuccessCount(0);
    setErrorCount(0);

    try {
      for (let i = 0; i < validItems.length; i++) {
        const item = validItems[i];

        const payload = {
          item_name: item.item_name,
          requested_quantity: item.qty,
          project_id: projectId,
          project_name: projectName || projectLocation || null,
          property_id: propertyId,
          property_name: propertyName || propertyId,
          deli_date,
          employee_code,
          initial_remark: remarks.trim(),
          item_type: (type || "general").toUpperCase(),
          schedule_id: selectedScheduleId,
        };

        setCurrentIndex(i + 1);

        try {
          const resp = await axios.post(API_URL, payload, {
            timeout: 30000,
            headers: {
              "Content-Type": "application/json",
              "x-client-sync-mode": "online_live",
              "x-client-request-source": INVENTORY_REQUEST_SOURCE,
            },
          });

          if (resp.data?.success !== false) setSuccessCount((s) => s + 1);
          else setErrorCount((e) => e + 1);
        } catch {
          await enqueueOutbox(payload);
          setErrorCount((e) => e + 1);
        }

        if (i < validItems.length - 1) await sleep(DELAY_MS);
      }

      setSubmitDone(true);
      resetForm();
    } catch {
      Alert.alert("Error", "Failed to submit the queue. Requests (if any) were queued for later.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const FieldLabel = ({ children }: { children: any }) => (
    <TText style={styles.fieldLabel}>{children}</TText>
  );

  const ReadOnlyBox = ({ value }: { value?: string | null }) => (
    <View style={styles.inputBox}>
      <TText style={styles.inputValue} numberOfLines={1}>
        {value || "—"}
      </TText>
    </View>
  );

  const SelectorBox = ({
    value,
    placeholder,
    data,
    onChange,
    disabled,
    testID,
  }: {
    value: string;
    placeholder: string;
    data: any[];
    onChange: (opt: any) => void;
    disabled?: boolean;
    testID: string;
  }) => (
    <View style={[styles.inputBox, disabled && { opacity: 0.6 }]} testID={testID}>
      <ModalSelector
        data={data}
        initValue={value || placeholder}
        onChange={onChange}
        disabled={disabled}
        selectStyle={styles.selectorSelect}
        initValueTextStyle={styles.selectorText}
        optionTextStyle={styles.selectorText}
        optionContainerStyle={{ backgroundColor: C.surface, borderBottomColor: C.border }}
        cancelStyle={{ backgroundColor: C.surface }}
        cancelTextStyle={{ color: C.text }}
        overlayStyle={{ backgroundColor: C.overlay }}
        cancelText="Cancel"
      />
    </View>
  );

  return (
    <View
      style={[styles.screen, { backgroundColor: C.bg }]}
      testID="properties-multi-request-master-item-root"
    >
      {/* Header */}
      <View
        style={[styles.header, { backgroundColor: C.surface, borderBottomColor: C.border }]}
        testID="properties-multi-request-master-item-header"
      >
        <TouchableOpacity
          testID="properties-multi-request-master-item-back-btn"
          onPress={() => (router.canGoBack() ? router.back() : router.push("/HomeScreen"))}
          style={styles.headerBtn}
          disabled={isSubmitting}
        >
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <TText
            style={styles.headerTitle}
            testID="properties-multi-request-master-item-title"
          >
            Multiple Request
          </TText>
          <TText
            style={styles.headerSubTitle}
            testID="properties-multi-request-master-item-subtitle"
          >
            {!isOnline ? "Offline mode" : " "}
          </TText>
        </View>

        <TouchableOpacity
          testID="properties-multi-request-master-item-home-btn"
          onPress={() => router.push("/HomeScreen")}
          style={styles.headerBtn}
          disabled={isSubmitting}
        >
          <Ionicons name="home" size={22} color={C.text} />
        </TouchableOpacity>
      </View>

      {!isOnline && (
        <View
          style={styles.offlinePill}
          testID="properties-multi-request-master-item-offline-pill"
        >
          <Ionicons name="cloud-offline-outline" size={14} color={C.text} />
          <TText style={styles.offlinePillText}>Offline</TText>
        </View>
      )}

      <ScrollView
        testID="properties-multi-request-master-item-scroll"
        style={[styles.container, { backgroundColor: C.bg }]}
        contentContainerStyle={{ paddingBottom: 26 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.block} testID="properties-multi-request-master-item-project-block">
          <FieldLabel>Project ID</FieldLabel>
          <ReadOnlyBox value={projectId} />
        </View>

        <View style={styles.block} testID="properties-multi-request-master-item-property-block">
          <FieldLabel>Property ID</FieldLabel>
          <ReadOnlyBox value={propertyId} />
        </View>

        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <FieldLabel>Select Phase</FieldLabel>
            <SelectorBox
              testID="properties-multi-request-master-item-phase-selector"
              value={selectedPhaseLabel}
              placeholder="Select Phase"
              data={phaseOptions.length > 0 ? phaseOptions : [{ key: "none", label: "No in-progress phases" }]}
              disabled={phaseOptions.length === 0 || isSubmitting}
              onChange={(option: Option) => {
                if (option.key === "none") {
                  setSelectedScheduleId(null);
                  setSelectedPhaseLabel("No in-progress phases");
                  return;
                }
                setSelectedScheduleId(option.key);
                setSelectedPhaseLabel(option.label);
              }}
            />
          </View>

          <View style={{ flex: 1 }}>
            <FieldLabel>Type</FieldLabel>
            <SelectorBox
              testID="properties-multi-request-master-item-type-selector"
              value={TYPE_OPTIONS.find((t) => t.key === type)?.label || "General"}
              placeholder="Type"
              data={TYPE_OPTIONS as any}
              disabled={isSubmitting}
              onChange={(option: TypeOption) => setType(option.key)}
            />
          </View>
        </View>

        {propertyId && phaseOptions.length === 0 && (
          <TText
            style={styles.phaseWarn}
            testID="properties-multi-request-master-item-phase-warning"
          >
            You must have an in-progress phase to request items.
          </TText>
        )}

        <View style={styles.block}>
          <FieldLabel>Approximate Date</FieldLabel>

          {Platform.OS === "web" ? (
            <View
              style={styles.inputBox}
              testID="properties-multi-request-master-item-date-input-web"
            >
              {/* @ts-ignore web only */}
              <input
                type="date"
                style={{
                  ...(styles.webDate as any),
                  WebkitAppearance: "auto",
                  appearance: "auto",
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                }}
                value={toLocalDateValue(startDate)}
                min={toLocalDateValue(todayAtMidnight())}
                onChange={(e: any) => {
                  const nextValue = (e.target as HTMLInputElement).value;
                  if (!nextValue) return;
                  setStartDate(fromLocalDateValue(nextValue));
                }}
                disabled={isSubmitting}
              />
              <Ionicons
                name="calendar-outline"
                size={18}
                color={C.mutedText}
                style={styles.dateIcon}
                pointerEvents="none"
              />
            </View>
          ) : (
            <>
              <TouchableOpacity
                testID="properties-multi-request-master-item-date-btn"
                onPress={() => setShowStartPicker(true)}
                style={styles.inputBox}
                disabled={isSubmitting}
                activeOpacity={0.85}
              >
                <TText style={styles.inputValue}>{formatHashDate(startDate)}</TText>
                <Ionicons name="calendar-outline" size={18} color={C.mutedText} style={styles.dateIcon} />
              </TouchableOpacity>

              {showStartPicker && (
                <DateTimePicker
                  value={startDate}
                  mode="date"
                  display="default"
                  onChange={(_event, date) => {
                    setShowStartPicker(false);
                    if (date) setStartDate(date);
                  }}
                  minimumDate={todayAtMidnight()}
                />
              )}
            </>
          )}
        </View>

        <View
          style={styles.card}
          testID="properties-multi-request-master-item-items-card"
        >
          <View style={styles.cardHeader}>
            <TText
              style={styles.cardTitle}
              testID="properties-multi-request-master-item-items-card-title"
            >
              Add Item
            </TText>

            <TouchableOpacity
              testID="properties-multi-request-master-item-add-item-btn"
              onPress={() => setItemSearchModalVisible(true)}
              style={styles.plusBtn}
              disabled={isSubmitting}
              activeOpacity={0.9}
            >
              <Ionicons name="add" size={22} color={C.white} />
            </TouchableOpacity>
          </View>

          <View
            style={styles.tableHeader}
            testID="properties-multi-request-master-item-table-header"
          >
            <TText style={[styles.tableHeaderText, { flex: 1 }]}>Item Name</TText>
            <TText style={[styles.tableHeaderText, { width: 90, textAlign: "center" }]}>Qty</TText>
            <View style={{ width: 34 }} />
          </View>

          {selectedItemsList.map((item, index) => (
            <View
              key={`${item.id}-${item.item_name}-${index}`}
              style={styles.tableRow}
              testID={`properties-multi-request-master-item-row-${index}`}
            >
              <TText
                style={styles.rowItemName}
                numberOfLines={1}
                ellipsizeMode="tail"
                testID={`properties-multi-request-master-item-row-name-${index}`}
              >
                {item.item_name}
              </TText>

              <TextInput
                testID={`properties-multi-request-master-item-row-qty-${index}`}
                style={styles.rowQty}
                placeholder="Qty"
                {...getDecimalInputProps()}
                value={item.requested_quantity}
                onChangeText={(text) => {
                  const updated = [...selectedItemsList];
                  const formatted = text.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
                  updated[index].requested_quantity = formatted;
                  setSelectedItemsList(updated);
                }}
                editable={!isSubmitting}
              />

              <TouchableOpacity
                testID={`properties-multi-request-master-item-row-remove-${index}`}
                onPress={() => setSelectedItemsList((prev) => prev.filter((_, i) => i !== index))}
                style={styles.rowRemove}
                disabled={isSubmitting}
              >
                <Ionicons name="close" size={16} color={C.danger} />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Item Search Modal */}
        <Modal
          visible={isItemSearchModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setItemSearchModalVisible(false)}
        >
          <View
            style={styles.dialogContainer}
            testID="properties-multi-request-master-item-search-modal"
          >
            <View style={[styles.dialogBox, { height: "70%" }]}>
              <TText
                style={styles.dialogTitle}
                testID="properties-multi-request-master-item-search-modal-title"
              >
                Search Item
              </TText>

              <TextInput
                testID="properties-multi-request-master-item-search-modal-input"
                placeholder="Search items..."
                value={itemSearchText}
                onChangeText={setItemSearchText}
                style={styles.searchInput}
                editable={!isSubmitting}
              />

              <ScrollView
                style={{ width: "100%" }}
                testID="properties-multi-request-master-item-search-results"
              >
                {filterOptions
                  .filter((opt) => opt.label.toLowerCase().includes(itemSearchText.toLowerCase()))
                  .map((option, idx) => {
                    const alreadyAdded = selectedItemsList.some((it) => it.item_name === option.label);
                    return (
                      <TouchableOpacity
                        key={option.key}
                        testID={`properties-multi-request-master-item-search-result-${idx}`}
                        onPress={() => {
                          if (!alreadyAdded) {
                            setSelectedItemsList((prev) => [
                              ...prev,
                              {
                                item_name: option.label,
                                item_type: "general",
                                id: Date.now(),
                                quantity: 0,
                                minimum_quantity: 0,
                                requested_quantity: "",
                              },
                            ]);
                          }
                          setItemSearchModalVisible(false);
                          setItemSearchText("");
                        }}
                        style={styles.searchRow}
                        disabled={isSubmitting}
                      >
                        <TText style={[styles.searchRowText, alreadyAdded && { color: C.subtleText }]}>
                          {alreadyAdded ? "✅ " : ""}
                          {option.label}
                        </TText>
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>

              <TouchableOpacity
                testID="properties-multi-request-master-item-search-modal-close-btn"
                style={[styles.modalActionBtn, { backgroundColor: C.mutedText }]}
                onPress={() => {
                  setItemSearchModalVisible(false);
                  setItemSearchText("");
                }}
                disabled={isSubmitting}
              >
                <TText style={styles.modalActionText}>Close</TText>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <View
          style={styles.block}
          testID="properties-multi-request-master-item-description-block"
        >
          <FieldLabel>Description</FieldLabel>
          <View style={styles.inputBox}>
            <TextInput
              testID="properties-multi-request-master-item-description-input"
              style={styles.descInput}
              multiline
              value={remarks}
              onChangeText={setRemarks}
              editable={!isSubmitting}
              placeholder="Enter description..."
              placeholderTextColor={C.subtleText}
            />
          </View>
        </View>

        <TouchableOpacity
          testID="properties-multi-request-master-item-submit-btn"
          style={[styles.submitButton, !canSubmit && { opacity: 0.6 }]}
          onPress={handleSubmitRequest}
          disabled={!canSubmit}
          activeOpacity={0.9}
        >
          <TText style={styles.submitButtonText}>
            {isSubmitting ? "Submitting…" : "Submit"}
          </TText>
        </TouchableOpacity>
      </ScrollView>

      {/* Progress Modal */}
      <Modal visible={progressVisible} transparent animationType="fade">
        <View
          style={styles.progressBackdrop}
          testID="properties-multi-request-master-item-progress-modal"
        >
          <View style={styles.progressCard}>
            <TText
              style={styles.progressTitle}
              testID="properties-multi-request-master-item-progress-title"
            >
              {submitDone ? "Submission Complete" : "Submitting Requests"}
            </TText>

            {!submitDone ? (
              <>
                <ActivityIndicator size="large" color={C.primaryStrong} style={{ marginTop: 12 }} />
                <TText
                  style={styles.progressSubtitle}
                  testID="properties-multi-request-master-item-progress-count"
                >
                  {currentIndex}/{totalCount} processed
                </TText>
                <TText style={styles.progressHint}>Please wait…</TText>
              </>
            ) : (
              <>
                <TText
                  style={[styles.progressSubtitle, { marginTop: 12 }]}
                  testID="properties-multi-request-master-item-progress-summary"
                >
                  Submitted {successCount} of {totalCount} item(s)
                  {errorCount ? ` — ${errorCount} failed (queued for later)` : ""}.
                </TText>
                <TouchableOpacity
                  testID="properties-multi-request-master-item-progress-ok-btn"
                  style={[styles.dialogBtn, { backgroundColor: C.primaryStrong, alignSelf: "flex-end", marginTop: 16 }]}
                  onPress={() => {
                    setProgressVisible(false);
                    setSubmitDone(false);
                  }}
                >
                  <TText style={styles.dialogBtnText}>OK</TText>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Footer */}
      <View
        style={styles.appFooterWrap}
        testID="properties-multi-request-master-item-footer-wrap"
      >
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
    </View>
  );
};

const createStyles = (C: any) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },

    header: {
      height: 58,
      backgroundColor: C.surface,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
      paddingHorizontal: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headerBtn: {
      width: 42,
      height: 42,
      alignItems: "center",
      justifyContent: "center",
    },
    headerCenter: { alignItems: "center" },
    headerTitle: { fontSize: 13, fontWeight: "700", color: C.text },
    headerSubTitle: { fontSize: 10, fontWeight: "700", color: C.mutedText, marginTop: 2 },

    container: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 14 },

    offlinePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.dangerSoft,
      alignSelf: "center",
      marginTop: 8,
      marginBottom: 6,
    },
    offlinePillText: { fontSize: 11, color: C.text, fontWeight: "700" },

    block: { marginTop: 10 },

    fieldLabel: { fontSize: 11, color: C.mutedText, fontWeight: "600", marginBottom: 8 },

    inputBox: {
      backgroundColor: C.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 14,
      paddingVertical: 14,
      justifyContent: "center",
    },
    inputValue: { fontSize: 11, color: C.text },

    row2: { flexDirection: "row", gap: 12, marginTop: 10 },

    selectorSelect: { borderWidth: 0, padding: 0, backgroundColor: "transparent" },
    selectorText: { fontSize: 11, color: C.text, fontWeight: "600" },
    selectorChevron: { position: "absolute", right: 12, top: "50%", marginTop: -9 },

    phaseWarn: { color: C.danger, fontSize: 11, marginTop: 8 },
    dateIcon: { position: "absolute", right: 12, top: "50%", marginTop: -9 },

    webDate: {
      width: "100%",
      minHeight: 22,
      borderWidth: 0,
      padding: 0,
      paddingRight: 28,
      fontSize: 11,
      color: C.text,
      backgroundColor: "transparent",
    } as any,

    card: {
      marginTop: 14,
      backgroundColor: C.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.border,
      padding: 12,
      shadowColor: "#000",
      shadowOpacity: 0.04,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 1,
    },
    cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
    cardTitle: { fontSize: 11, fontWeight: "800", color: C.text },
    plusBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.primaryStrong, alignItems: "center", justifyContent: "center" },

    tableHeader: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: C.surfaceAlt,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 6,
    },
    tableHeaderText: { color: C.mutedText, fontWeight: "700", fontSize: 11 },

    tableRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 6,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    rowItemName: { flex: 1, color: C.text, fontSize: 11, fontWeight: "600", paddingRight: 8 },

    rowQty: {
      width: 90,
      height: 36,
      borderRadius: 8,
      backgroundColor: C.primarySoft,
      borderWidth: 1,
      borderColor: C.border,
      textAlign: "center",
      fontSize: 14,
      fontWeight: "700",
      color: C.text,
    },

    rowRemove: {
      width: 30,
      height: 30,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: C.border,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 10,
      backgroundColor: C.surface,
    },

    descInput: { minHeight: 44, fontSize: 11, fontWeight: "600", color: C.text, padding: 0 },

    submitButton: {
      backgroundColor: C.primaryStrong,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: "center",
      marginTop: 18,
      marginBottom: 22,
    },
    submitButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 11 },

    dialogContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.overlayStrong },
    dialogBox: { width: "88%", padding: 18, backgroundColor: C.surface, borderRadius: 12, alignItems: "center", elevation: 5 },
    dialogTitle: { fontSize: 11, fontWeight: "800", color: C.text, marginBottom: 10 },
    searchInput: {
      width: "100%",
      marginBottom: 10,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: C.surface,
      fontSize: 11,
      color: C.text,
    },
    searchRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.border, paddingHorizontal: 6 },
    searchRowText: { fontSize: 11, color: C.text },
    modalActionBtn: { marginTop: 12, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, alignSelf: "center" },
    modalActionText: { color: "#FFFFFF", fontWeight: "700" },

    progressBackdrop: { flex: 1, backgroundColor: C.overlayStrong, justifyContent: "center", alignItems: "center" },
    progressCard: { width: "88%", maxWidth: 520, backgroundColor: C.surface, borderRadius: 14, padding: 16 },
    progressTitle: { fontSize: 11, fontWeight: "800", color: C.text },
    progressSubtitle: { marginTop: 10, color: C.mutedText, fontSize: 11 },
    progressHint: { marginTop: 6, color: C.mutedText },
    dialogBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
    dialogBtnText: { color: "#FFF", fontWeight: "700" },

    appFooterWrap: {
      borderTopWidth: 1,
      borderTopColor: C.border,
      backgroundColor: C.surface,
    },
  });

export default PropertiesMultiRequestMasterItem;
