import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  View, StyleSheet, TouchableOpacity, TextInput, Modal, Alert, Platform, ScrollView, ActivityIndicator, NativeSyntheticEvent, NativeScrollEvent, KeyboardTypeOptions } from "react-native";
import ModalSelector from "@/components/AppModalSelect";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import axios from "axios";
import DateTimePicker from "@react-native-community/datetimepicker";

import { API_BASE_URL } from "../utils/apiBase";
import { getDecimalInputProps } from "../utils/keyboardProps";
import { resolveEmployeeIdentity } from "../utils/employeeIdentity";
/** ✅ Telemetry (same style as your other screen) */
import {
  trackScreen,
  startScreenTimer,
  trackUI,
  trackNetwork,
  updateDynamicContext,
  clearDynamicContext,
  flushTelemetry,
} from "../utils/telemetry";
import { useFontScale } from "@/context/FontScaleContext";
import TText from "@/components/TText";
import { useTheme } from "@/src/theme/ThemeProvider";

type ItemType = "general" | "avenue_add_on" | "customer_add_on";

/** ✅ UOM is STRING (important) */
type UomId = string;

interface InventoryItem {
  id: number; // local row id
  master_item_id?: number; // ✅ items_master.id from modal
  item_name: string;
  item_type: ItemType;

  requested_quantity?: string;

  // UOM (from API)
  selected_uom_id?: UomId; // ✅ string
  uom_options?: ProjectOption[];
  allow_fractional_issue?: boolean;
  base_precision?: number;
  engineer_default_uom_id?: UomId | null;
  invoice_default_uom_id?: UomId | null;
  basic_uom_id?: UomId | null;
}

interface ProjectOption {
  key: string;
  label: string;
}

/** ✅ Use TEST env by default (NOT localhost) */
const API_BASE = API_BASE_URL;

const TYPE_OPTIONS: { key: ItemType; label: string }[] = [
  { key: "general", label: "General" },
  { key: "avenue_add_on", label: "Avenue Add On" },
  { key: "customer_add_on", label: "Customer Add On" },
];
const INVENTORY_REQUEST_SOURCE = "MultipleRequestMasterItem";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

/** ✅ Qty sanitizer (same rules you had) */
const formatQtyByRules = (raw: string, allowFractional: boolean, precision: number) => {
  let s = String(raw ?? "");

  if (!allowFractional) {
    s = s.replace(/[^0-9]/g, "");
    return s;
  }

  s = s.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
  const [a, b] = s.split(".");
  if (typeof b === "string") return `${a}.${b.slice(0, Math.max(0, precision))}`;
  return s;
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const formatHashDate = (d: Date) => `#${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
const toDateInputValue = (d: Date) => d.toISOString().split("T")[0];

const MultipleRequestMasterItem = () => {
  const { theme } = useTheme();
  const C = theme.colors;
  const router = useRouter();
  const params = useLocalSearchParams();

  const selectedItems: InventoryItem[] = useMemo(() => {
    try {
      return params.items
        ? JSON.parse(Array.isArray(params.items) ? (params.items[0] as string) : (params.items as string))
        : [];
    } catch {
      return [];
    }
  }, [params.items]);

  const employeeCode: string | null = useMemo(() => {
    try {
      const raw = Array.isArray(params.employee_details)
        ? params.employee_details[0]
        : (params.employee_details as string) || "{}";
      const parsed = JSON.parse(raw);
      return parsed?.employee_code || (typeof params.employee_code === "string" ? params.employee_code : null);
    } catch {
      return typeof params.employee_code === "string" ? params.employee_code : null;
    }
  }, [params.employee_details, params.employee_code]);

  const [selectedItemsList, setSelectedItemsList] = useState<InventoryItem[]>([]);
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [propertyOptions, setPropertyOptions] = useState<ProjectOption[]>([]);

  const [project, setProject] = useState("Select Project");
  const [property, setProperty] = useState("Select Property");

  const [projectId, setProjectId] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);

  const [phaseOptions, setPhaseOptions] = useState<ProjectOption[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [selectedPhaseLabel, setSelectedPhaseLabel] = useState<string>("Select Phase");

  const [type, setType] = useState<ItemType>("general");

  const [startDate, setStartDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [remarksInputHeight, setRemarksInputHeight] = useState(40);

  const [filterOptions, setFilterOptions] = useState<ProjectOption[]>([]);
  const [isItemSearchModalVisible, setItemSearchModalVisible] = useState(false);
  const [itemSearchText, setItemSearchText] = useState("");

  const [itemLimit] = useState(50);
  const [itemOffset, setItemOffset] = useState(0);
  const [itemTotal, setItemTotal] = useState(0);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [isLoadingMoreItems, setIsLoadingMoreItems] = useState(false);
  const [itemSearchMode, setItemSearchMode] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  /** ✅ Cache UOM by master_item_id */
  const uomCacheRef = useRef<Record<number, any>>({});

  /* -------------------------------------------------------------------------- */
  /*                                TELEMETRY                                  */
  /* -------------------------------------------------------------------------- */
  useEffect(() => {
    try {
      updateDynamicContext?.({
        screen: "MultipleRequestMasterItem",
        employeeCode: employeeCode || null,
      });

      trackScreen?.("MultipleRequestMasterItem", {
        employeeCode: employeeCode || null,
      });

      const stop = startScreenTimer?.("MultipleRequestMasterItem", {
        employeeCode: employeeCode || null,
      });

      return () => {
        stop?.();
        clearDynamicContext?.();
        flushTelemetry?.({ reason: "screen_unmount" }).catch?.(() => {});
      };
    } catch {
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeCode]);

  const logNetwork = useCallback(
    async (req: { url: string; method: "GET" | "POST"; fn: () => Promise<any>; extra?: any }) => {
      const startedAt = Date.now();
      try {
        const res = await req.fn();
        const durationMs = Date.now() - startedAt;

        trackNetwork?.({
          url: req.url,
          method: req.method,
          status: res?.status,
          durationMs,
          ok: true,
          extra: { screen: "MultipleRequestMasterItem", ...(req.extra || {}) },
        });

        return res;
      } catch (e: any) {
        const durationMs = Date.now() - startedAt;
        trackNetwork?.({
          url: req.url,
          method: req.method,
          status: e?.response?.status,
          durationMs,
          ok: false,
          extra: { screen: "MultipleRequestMasterItem", message: e?.message, ...(req.extra || {}) },
        });
        throw e;
      }
    },
    []
  );

  /* -------------------------------------------------------------------------- */
  /*                                   API                                      */
  /* -------------------------------------------------------------------------- */

  const fetchAssignedProjects = async (empCode: string) => {
    const url = `${API_BASE}/employee-project/${encodeURIComponent(empCode)}`;
    trackUI?.({ screen: "MultipleRequestMasterItem", element: "fetch_projects", action: "start", extra: {} });

    try {
      const res = await logNetwork({
        url,
        method: "GET",
        fn: () => axios.get(url),
      });

      const data = res.data;
      const arr = Array.isArray(data?.projects) ? data.projects : Array.isArray(data) ? data : [];
      const normalized = arr
        .map((p: any) => {
          const key = (p.project_id ?? p.projectId ?? p.id)?.toString?.();
          const label = p.project_name ?? p.projectName ?? p.name;
          return key && label ? { key, label } : null;
        })
        .filter(Boolean) as ProjectOption[];

      setProjectOptions(normalized);

      trackUI?.({
        screen: "MultipleRequestMasterItem",
        element: "fetch_projects",
        action: "success",
        extra: { count: normalized.length },
      });

      if (normalized.length === 0) setProject("No assigned projects");
    } catch (e) {
      console.error("❌ fetchAssignedProjects failed", e);
      setProjectOptions([]);
      setProject("Failed to load assigned projects");
      trackUI?.({
        screen: "MultipleRequestMasterItem",
        element: "fetch_projects",
        action: "error",
        extra: { message: (e as any)?.message },
      });
    }
  };

  const fetchAssignedProperties = async (empCode: string, selectedProjectId: string) => {
    const url = `${API_BASE}/employee-properties/${encodeURIComponent(selectedProjectId)}/${encodeURIComponent(empCode)}`;
    trackUI?.({
      screen: "MultipleRequestMasterItem",
      element: "fetch_properties",
      action: "start",
      extra: { project_id: selectedProjectId },
    });

    try {
      const res = await logNetwork({
        url,
        method: "GET",
        fn: () => axios.get(url),
      });

      const data = res.data;
      const arr = Array.isArray(data?.properties) ? data.properties : Array.isArray(data) ? data : [];
      const normalized = arr
        .map((prop: any) => {
          const key = prop.propertyid ?? prop.property_id ?? prop.id ?? prop.key;
          const label = prop.name ?? prop.property_name ?? prop.label;
          return key && label ? { key: String(key), label: String(label) } : null;
        })
        .filter(Boolean) as ProjectOption[];

      setPropertyOptions(normalized);

      trackUI?.({
        screen: "MultipleRequestMasterItem",
        element: "fetch_properties",
        action: "success",
        extra: { count: normalized.length },
      });

      if (normalized.length === 0) setProperty("No assigned properties");
    } catch (e) {
      console.error("❌ fetchAssignedProperties failed", e);
      setPropertyOptions([]);
      setProperty("Failed to load assigned properties");

      trackUI?.({
        screen: "MultipleRequestMasterItem",
        element: "fetch_properties",
        action: "error",
        extra: { message: (e as any)?.message },
      });
    }
  };

  const fetchSchedulePhases = async (propId: string) => {
    const url = `${API_BASE}/properties/${encodeURIComponent(propId)}/schedule?_${Date.now()}`;
    trackUI?.({
      screen: "MultipleRequestMasterItem",
      element: "fetch_phases",
      action: "start",
      extra: { property_id: propId },
    });

    try {
      const res = await logNetwork({
        url,
        method: "GET",
        fn: () => axios.get(url),
      });

      const raw = res.data?.schedule ?? res.data;
      const rows: any[] = Array.isArray(raw) ? raw : [];

      const inProgress = rows
        .filter((r) => r?.phasename && isInProgressStrict(r))
        .map((r) => ({
          key: String(r.scheduleid ?? r.schedule_id ?? r.id),
          label: String(r.phasename),
        }));

      setPhaseOptions(inProgress);

      trackUI?.({
        screen: "MultipleRequestMasterItem",
        element: "fetch_phases",
        action: "success",
        extra: { count: inProgress.length },
      });

      if (inProgress.length === 0) {
        setSelectedScheduleId(null);
        setSelectedPhaseLabel("No in-progress phases");
        Alert.alert("No in-progress phases", "This property has no phases currently in progress.");
      } else {
        setSelectedScheduleId((prev) => (inProgress.some((p) => p.key === prev) ? prev : null));
        setSelectedPhaseLabel((prev) => (inProgress.some((p) => p.label === prev) ? prev : "Select Phase"));
      }
    } catch (error) {
      console.error("❌ Error fetching schedule phases:", error);
      setPhaseOptions([]);
      setSelectedScheduleId(null);
      setSelectedPhaseLabel("Select Phase");
      Alert.alert("Error fetching phases", "Could not load phases for this property.");

      trackUI?.({
        screen: "MultipleRequestMasterItem",
        element: "fetch_phases",
        action: "error",
        extra: { message: (error as any)?.message },
      });
    }
  };

  const fetchMasterItems = async (opts?: { reset?: boolean; search?: string | null; append?: boolean }) => {
    const { reset = false, search = null, append = false } = opts || {};
    const trimmedSearch = search?.trim() || "";
    const isSearch = !!trimmedSearch;

    if (reset) {
      setItemOffset(0);
      setItemTotal(0);
      if (!append) setFilterOptions([]);
    }

    if (isSearch) {
      setItemSearchMode(true);
      setIsLoadingItems(true);
      setIsLoadingMoreItems(false);
    } else {
      setItemSearchMode(false);
      if (append) setIsLoadingMoreItems(true);
      else {
        setIsLoadingItems(true);
        setIsLoadingMoreItems(false);
      }
    }

    const qs = new URLSearchParams();
    if (isSearch) qs.append("search", trimmedSearch);
    else {
      qs.append("limit", String(itemLimit));
      qs.append("offset", String(reset ? 0 : itemOffset));
    }

    const url = `${API_BASE}/get-all-masteritems-new${qs.toString() ? `?${qs.toString()}` : ""}`;

    trackUI?.({
      screen: "MultipleRequestMasterItem",
      element: "fetch_master_items",
      action: append ? "paginate" : reset ? "reset" : "load",
      extra: { isSearch, search: trimmedSearch || null, limit: itemLimit, offset: reset ? 0 : itemOffset },
    });

    try {
      const res = await logNetwork({
        url,
        method: "GET",
        fn: () => axios.get(url),
        extra: { isSearch },
      });

      const json = res.data;

      const newOptions: ProjectOption[] = Array.isArray(json.items)
        ? json.items.map((item: any) => ({
            key: item.id?.toString?.() ?? String(item.id),
            label: item.item_name,
          }))
        : [];

      if (isSearch) {
        setFilterOptions(newOptions);
        setItemTotal(typeof json.total === "number" ? json.total : newOptions.length);
        setItemOffset(0);
      } else {
        setFilterOptions((prev) => (append ? [...prev, ...newOptions] : newOptions));
        setItemTotal(typeof json.total === "number" ? json.total : newOptions.length);
        setItemOffset((prev) => (reset ? newOptions.length : prev + newOptions.length));
      }

      trackUI?.({
        screen: "MultipleRequestMasterItem",
        element: "fetch_master_items",
        action: "success",
        extra: { received: newOptions.length, total: json.total },
      });
    } catch (error) {
      console.error("❌ Failed to fetch master items", error);
      trackUI?.({
        screen: "MultipleRequestMasterItem",
        element: "fetch_master_items",
        action: "error",
        extra: { message: (error as any)?.message },
      });
    } finally {
      setIsLoadingItems(false);
      setIsLoadingMoreItems(false);
    }
  };

  /**
   * ✅ FIXED hydrateItemUom:
   * - Supports BOTH shapes:
   *   (A) { request_uoms: ["BASIC_UOM_NOS"], default_request_uom, uom_lookup: { BASIC_UOM_NOS: {uom_name...} } }
   *   (B) old numeric conversions (fallback)
   */
  const hydrateItemUom = useCallback(
    async (masterItemId: number, rowIndex: number) => {
      const url = `${API_BASE}/get-item-with-uom/${encodeURIComponent(String(masterItemId))}`;

      try {
        // cache hit
        if (uomCacheRef.current[masterItemId]) {
          const cached = uomCacheRef.current[masterItemId];
          setSelectedItemsList((prev) => {
            const copy = [...prev];
            if (!copy[rowIndex]) return prev;
            copy[rowIndex] = { ...copy[rowIndex], ...cached._uiPatch };
            return copy;
          });
          return;
        }

        trackUI?.({
          screen: "MultipleRequestMasterItem",
          element: "uom_hydrate",
          action: "start",
          extra: { masterItemId },
        });

        const res = await logNetwork({
          url,
          method: "GET",
          fn: () => axios.get(url, { timeout: 15000 }),
          extra: { masterItemId },
        });

        const data = res.data || {};
        const item = data?.item || {};
        const rows = Array.isArray(data?.conversion_rows) ? data.conversion_rows : [];

        // ✅ NEW SHAPE (string uoms)
        const requestUoms: string[] = Array.isArray(data?.request_uoms) ? data.request_uoms.map(String) : [];
        const defaultRequestUom: string | null =
          data?.default_request_uom != null ? String(data.default_request_uom) : null;

        // uom_lookup can be object or array (support both)
        const uomLookupObj = data?.uom_lookup && !Array.isArray(data.uom_lookup) ? data.uom_lookup : null;
        const uomLookupArr = Array.isArray(data?.uom_lookup) ? data.uom_lookup : null;

        const nameById = new Map<string, string>();

        if (uomLookupObj) {
          Object.keys(uomLookupObj).forEach((k) => {
            const v = uomLookupObj[k];
            const name = v?.uom_name ?? v?.name ?? v?.uom_code ?? v?.code;
            if (name) nameById.set(String(k), String(name));
          });
        } else if (uomLookupArr) {
          uomLookupArr.forEach((u: any) => {
            const id = u?.id ?? u?.uom_id ?? u?.key;
            const name = u?.uom_name ?? u?.name ?? u?.uom_code ?? u?.code;
            if (id && name) nameById.set(String(id), String(name));
          });
        }

        let uomOptions: ProjectOption[] = [];

        if (requestUoms.length > 0) {
          // ✅ primary (your new API)
          uomOptions = requestUoms.map((id) => ({
            key: String(id),
            label: nameById.get(String(id)) || String(id),
          }));
        } else {
          // 🧯 fallback (old conversion_rows numeric style)
          const uomIds = new Set<string>();

          const basicId = item?.basic_uom_id != null ? String(item.basic_uom_id) : null;
          const engDef = item?.engineer_default_uom_id != null ? String(item.engineer_default_uom_id) : null;
          const invDef = item?.invoice_default_uom_id != null ? String(item.invoice_default_uom_id) : null;

          if (basicId) uomIds.add(basicId);
          if (engDef) uomIds.add(engDef);
          if (invDef) uomIds.add(invDef);

          rows.forEach((r: any) => {
            if (!r?.active) return;
            const a = r?.request_uom != null ? String(r.request_uom) : null;
            const b = r?.converts_to != null ? String(r.converts_to) : null;
            if (a) uomIds.add(a);
            if (b) uomIds.add(b);
          });

          uomOptions = Array.from(uomIds).map((id) => ({
            key: id,
            label: nameById.get(id) || id,
          }));
        }

        const allowFractional = !!item?.allow_fractional_issue;
        const precision = Number.isFinite(Number(item?.base_precision)) ? Math.max(0, Number(item.base_precision)) : 0;

        // ✅ default: API default_request_uom > engineer_default > invoice_default > basic > first
        const basicId = item?.basic_uom_id != null ? String(item.basic_uom_id) : null;
        const engDef = item?.engineer_default_uom_id != null ? String(item.engineer_default_uom_id) : null;
        const invDef = item?.invoice_default_uom_id != null ? String(item.invoice_default_uom_id) : null;

        const defaultUom: string | undefined =
          defaultRequestUom ||
          engDef ||
          invDef ||
          basicId ||
          (uomOptions[0] ? String(uomOptions[0].key) : undefined);

        const patch = {
          basic_uom_id: basicId,
          engineer_default_uom_id: engDef ?? null,
          invoice_default_uom_id: invDef ?? null,
          allow_fractional_issue: allowFractional,
          base_precision: precision,
          uom_options: uomOptions,
          selected_uom_id: defaultUom,
        };

        uomCacheRef.current[masterItemId] = { _uiPatch: patch };

        setSelectedItemsList((prev) => {
          const copy = [...prev];
          if (!copy[rowIndex]) return prev;
          copy[rowIndex] = { ...copy[rowIndex], ...patch };
          return copy;
        });

        trackUI?.({
          screen: "MultipleRequestMasterItem",
          element: "uom_hydrate",
          action: "success",
          extra: { masterItemId, options: uomOptions.length, defaultUom: defaultUom ?? null },
        });
      } catch (e: any) {
        console.error("❌ get-item-with-uom failed", e);

        trackUI?.({
          screen: "MultipleRequestMasterItem",
          element: "uom_hydrate",
          action: "error",
          extra: { masterItemId, message: e?.message },
        });

        setSelectedItemsList((prev) => {
          const copy = [...prev];
          if (!copy[rowIndex]) return prev;
          copy[rowIndex] = {
            ...copy[rowIndex],
            uom_options: [],
            selected_uom_id: undefined,
            allow_fractional_issue: true,
            base_precision: 2,
          };
          return copy;
        });
      }
    },
    [logNetwork]
  );

  /* -------------------------------------------------------------------------- */
  /*                                  Effects                                   */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    const itemsWithQty = selectedItems.map((item) => {
      // ✅ ensure master_item_id is always set
      const masterId = Number((item as any).master_item_id ?? (item as any).id);

      return {
        ...item,
        master_item_id: Number.isFinite(masterId) ? masterId : undefined,
        requested_quantity: "",
        item_type: (item.item_type as ItemType) || type,
        uom_options: [],
        selected_uom_id: undefined,
      };
    });

    setSelectedItemsList(itemsWithQty);

    fetchMasterItems({ reset: true });

    if (employeeCode) fetchAssignedProjects(employeeCode);
    else {
      setProjectOptions([]);
      setProject("Employee not identified");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItems, employeeCode]);

  // ✅ Auto-hydrate UOM for items that already exist
  const didHydrateInitial = useRef(false);

  useEffect(() => {
    if (didHydrateInitial.current) return;
    if (!selectedItemsList.length) return;

    didHydrateInitial.current = true;

    selectedItemsList.forEach((item, index) => {
      if (item.master_item_id) {
        hydrateItemUom(item.master_item_id, index);
      }
    });
  }, [selectedItemsList, hydrateItemUom]);

  useEffect(() => {
    if (!isItemSearchModalVisible) return;
    const q = itemSearchText.trim();
    const handle = setTimeout(() => {
      if (!q) fetchMasterItems({ reset: true, search: null });
      else fetchMasterItems({ reset: true, search: q });
    }, 350);
    return () => clearTimeout(handle);
  }, [itemSearchText, isItemSearchModalVisible]);

  const filteredItemOptions = useMemo(() => {
    if (itemSearchMode) return filterOptions;
    if (!itemSearchText.trim()) return filterOptions;
    const lower = itemSearchText.toLowerCase();
    return filterOptions.filter((opt) => opt.label.toLowerCase().includes(lower));
  }, [filterOptions, itemSearchMode, itemSearchText]);

  const handleProjectSelect = (option: ProjectOption) => {
    trackUI?.({
      screen: "MultipleRequestMasterItem",
      element: "project_select",
      action: "change",
      extra: { project_id: option.key, project_name: option.label },
    });

    setProject(option.label);
    setProjectId(option.key);

    setProperty("Select Property");
    setPropertyId(null);
    setPropertyOptions([]);

    setPhaseOptions([]);
    setSelectedScheduleId(null);
    setSelectedPhaseLabel("Select Phase");

    if (employeeCode) fetchAssignedProperties(employeeCode, option.key);
    else setProperty("Employee not identified");
  };

  const resetForm = () => {
    setSelectedItemsList(
      selectedItems.map((item) => ({
        ...item,
        requested_quantity: "",
        item_type: type,
        master_item_id: undefined,
        selected_uom_id: undefined,
        uom_options: undefined,
      }))
    );
    setProject("Select Project");
    setProjectId(null);
    setProperty("Select Property");
    setPropertyId(null);
    setPhaseOptions([]);
    setSelectedScheduleId(null);
    setSelectedPhaseLabel("Select Phase");
    setRemarks("");
    setType("general");
    setPropertyOptions([]);

    trackUI?.({ screen: "MultipleRequestMasterItem", element: "form", action: "reset", extra: {} });
  };

  const postWithStagger = async (payload: any, index: number) => {
    if (index > 0) await sleep(2000);

    const url = `${API_BASE}/request-inventory`;

    try {
      const res = await logNetwork({
        url,
        method: "POST",
        fn: () =>
          axios.post(url, payload, {
            timeout: 20000,
            headers: {
              "x-client-sync-mode": "online_live",
              "x-client-request-source": INVENTORY_REQUEST_SOURCE,
            },
          }),
        extra: { item_name: payload?.item_name },
      });

      return { ok: true, msg: res?.data?.message || "Submitted" };
    } catch (err: any) {
      const status = err?.response?.status;

      if (status === 500) {
        await sleep(2000);
        try {
          const res2 = await logNetwork({
            url,
            method: "POST",
            fn: () =>
              axios.post(url, payload, {
                timeout: 20000,
                headers: {
                  "x-client-sync-mode": "online_live",
                  "x-client-request-source": INVENTORY_REQUEST_SOURCE,
                },
              }),
            extra: { item_name: payload?.item_name, retry: true },
          });

          return { ok: true, msg: res2?.data?.message || "Submitted (retry)" };
        } catch (err2: any) {
          return {
            ok: false,
            msg: err2?.response?.data?.message || `500 after retry: ${err2?.message || "Failed"}`,
          };
        }
      }

      return { ok: false, msg: err?.response?.data?.message || err?.message || "Failed" };
    }
  };

  const canSubmit =
    !!projectId &&
    !!propertyId &&
    !!selectedScheduleId &&
    selectedItemsList.length > 0 &&
    selectedItemsList.every((it) => it.item_name && Number(it.requested_quantity) > 0);

  const handleSubmitRequest = async () => {
    if (submitting) return;

    trackUI?.({
      screen: "MultipleRequestMasterItem",
      element: "submit",
      action: "attempt",
      extra: {
        canSubmit,
        count: selectedItemsList.length,
        projectId,
        propertyId,
        scheduleId: selectedScheduleId,
      },
    });

    setSubmitting(true);

    try {
      const identity = await resolveEmployeeIdentity(params as Record<string, unknown>);
      const effectiveEmployeeCode = identity.employee_code || String(employeeCode || "").trim();

      if (!effectiveEmployeeCode) {
        return Alert.alert("Missing Employee", "Employee code could not be resolved for this request.");
      }
      if (!projectId) return Alert.alert("Missing Project", "Please select a project.");
      if (!propertyId) return Alert.alert("Missing Property", "Please select a property.");
      if (!selectedScheduleId) return Alert.alert("Missing Phase", "Please select an in-progress phase.");

      const invalid = selectedItemsList.filter((it) => !it.item_name || !(Number(it.requested_quantity) > 0));
      if (selectedItemsList.length === 0 || invalid.length > 0) {
        return Alert.alert("Invalid Items", "Please add items and enter quantities > 0.");
      }

      const deli_date = startDate.toISOString().split("T")[0];
      const results: { name: string; ok: boolean; msg: string }[] = [];

      for (let idx = 0; idx < selectedItemsList.length; idx++) {
        const it = selectedItemsList[idx];

        const payload: any = {
          item_name: it.item_name,
          requested_quantity: Number(it.requested_quantity || 0),
          project_id: projectId,
          project_name: project,
          property_id: propertyId,
          property_name: property,
          deli_date,
          employee_code: effectiveEmployeeCode,
          initial_remark: remarks || "NA",
          item_type: String(it.item_type || type).toUpperCase(),
          schedule_id: selectedScheduleId,
        };

        /** ✅ PUSH UOM IN PAYLOAD */
        if (it.selected_uom_id) payload.requested_uom_id = String(it.selected_uom_id);

        const { ok, msg } = await postWithStagger(payload, idx);
        results.push({ name: it.item_name, ok, msg });
      }

      const successCount = results.filter((r) => r.ok).length;
      const failCount = results.length - successCount;

      const summary =
        `Project: ${project} (id: ${projectId})\n` +
        `Property: ${property} (id: ${propertyId})\n` +
        `Phase: ${selectedPhaseLabel} (schedule_id: ${selectedScheduleId})\n` +
        `Delivery: ${deli_date}\n\n` +
        results.map((r) => `${r.ok ? "✅" : "❌"} ${r.name} — ${r.msg}`).join("\n");

      trackUI?.({
        screen: "MultipleRequestMasterItem",
        element: "submit",
        action: failCount === 0 ? "success" : successCount === 0 ? "failed" : "partial",
        extra: { successCount, failCount, total: results.length },
      });

      if (failCount === 0) {
        Alert.alert("All Requests Sent", summary);
        resetForm();
      } else if (successCount === 0) {
        Alert.alert("All Requests Failed", summary);
      } else {
        Alert.alert("Partial Success", summary);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleItemScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (itemSearchMode || isLoadingMoreItems || isLoadingItems) return;

    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 40;

    const isNearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
    const hasMore = itemOffset < itemTotal;

    if (isNearBottom && hasMore) {
      trackUI?.({
        screen: "MultipleRequestMasterItem",
        element: "pagination",
        action: "attempt",
        extra: { itemOffset, itemTotal },
      });
      fetchMasterItems({ append: true });
    }
  };

  return (
    <View testID="multiple-request-master-item-root" style={{ flex: 1 }}>
      {/* Header (kept exactly) */}
      <View style={styles.headerContainer}>
        <View style={styles.headerTitleContainer}>
          <TouchableOpacity
            onPress={() => (router.canGoBack() ? router.back() : router.push("/HomeScreen"))}
            style={styles.headerIconBtn}
            disabled={submitting}
          >
            <Ionicons name="arrow-back" size={22} color="#111827" />
          </TouchableOpacity>
          <TText style={styles.headerTitle}>Request Item</TText>
        </View>
        <TouchableOpacity onPress={() => router.push("/HomeScreen")} style={styles.headerIconBtn} disabled={submitting}>
          <Ionicons name="home" size={22} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 26 }} keyboardShouldPersistTaps="handled">
        {/* Project */}
        <View style={styles.block}>
          <TText style={styles.label}>Project</TText>
          <View style={styles.inputBox}>
            <ModalSelector
              data={projectOptions}
              initValue={project}
              onChange={(option: ProjectOption) => handleProjectSelect(option)}
              style={{ width: "100%" }}
              selectStyle={styles.selectorSelect}
              initValueTextStyle={styles.selectorText}
              optionTextStyle={styles.optionText}
              optionContainerStyle={{ backgroundColor: C.surface, borderBottomColor: C.border }}
              cancelStyle={{ backgroundColor: C.surface }}
              cancelTextStyle={{ color: C.text }}
              overlayStyle={{ backgroundColor: C.overlay }}
              cancelText="Cancel"
              disabled={projectOptions.length === 0 || submitting}
            />
            <Ionicons name="chevron-down" size={18} color={C.mutedText} style={styles.chevron} />
          </View>
        </View>

        {/* Property */}
        <View style={styles.block}>
          <TText style={styles.label}>Property</TText>
          <View style={styles.inputBox}>
            <ModalSelector
              data={propertyOptions}
              initValue={property}
              onChange={(option: ProjectOption) => {
                trackUI?.({
                  screen: "MultipleRequestMasterItem",
                  element: "property_select",
                  action: "change",
                  extra: { property_id: option.key, property_name: option.label },
                });

                setProperty(option.label);
                setPropertyId(option.key);
                fetchSchedulePhases(option.key);
              }}
              style={{ width: "100%" }}
              selectStyle={styles.selectorSelect}
              initValueTextStyle={styles.selectorText}
              optionTextStyle={styles.optionText}
              optionContainerStyle={{ backgroundColor: C.surface, borderBottomColor: C.border }}
              cancelStyle={{ backgroundColor: C.surface }}
              cancelTextStyle={{ color: C.text }}
              overlayStyle={{ backgroundColor: C.overlay }}
              cancelText="Cancel"
              disabled={propertyOptions.length === 0 || submitting}
            />
            <Ionicons name="chevron-down" size={18} color={C.mutedText} style={styles.chevron} />
          </View>
        </View>

        {/* Phase + Type (row like screenshot) */}
        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <TText style={styles.label}>Select Phase</TText>
            <View style={styles.inputBox}>
              <ModalSelector
                data={phaseOptions.length > 0 ? phaseOptions : [{ key: "none", label: "No in-progress phases" }]}
                initValue={selectedPhaseLabel || "Select Phase"}
                onChange={(option: ProjectOption) => {
                  if (option.key === "none") {
                    setSelectedScheduleId(null);
                    setSelectedPhaseLabel("No in-progress phases");
                    return;
                  }

                  trackUI?.({
                    screen: "MultipleRequestMasterItem",
                    element: "phase_select",
                    action: "change",
                    extra: { schedule_id: option.key, phase_name: option.label },
                  });

                  setSelectedScheduleId(option.key);
                  setSelectedPhaseLabel(option.label);
                }}
                style={{ width: "100%" }}
                selectStyle={styles.selectorSelect}
                initValueTextStyle={styles.selectorText}
                optionTextStyle={styles.optionText}
                optionContainerStyle={{ backgroundColor: C.surface, borderBottomColor: C.border }}
                cancelStyle={{ backgroundColor: C.surface }}
                cancelTextStyle={{ color: C.text }}
                overlayStyle={{ backgroundColor: C.overlay }}
                cancelText="Cancel"
                disabled={phaseOptions.length === 0 || submitting}
              />
              <Ionicons name="chevron-down" size={18} color={C.mutedText} style={styles.chevron} />
            </View>
          </View>

          <View style={{ flex: 1 }}>
            <TText style={styles.label}>Type</TText>
            <View style={styles.inputBox}>
              <ModalSelector
                data={TYPE_OPTIONS as any}
                initValue={TYPE_OPTIONS.find((x) => x.key === type)?.label || "General"}
                onChange={(opt: { key: ItemType; label: string }) => {
                  trackUI?.({
                    screen: "MultipleRequestMasterItem",
                    element: "type_select",
                    action: "change",
                    extra: { type: opt.key },
                  });
                  setType(opt.key);
                }}
                style={{ width: "100%" }}
                selectStyle={styles.selectorSelect}
                initValueTextStyle={styles.selectorText}
                optionTextStyle={styles.optionText}
                optionContainerStyle={{ backgroundColor: C.surface, borderBottomColor: C.border }}
                cancelStyle={{ backgroundColor: C.surface }}
                cancelTextStyle={{ color: C.text }}
                overlayStyle={{ backgroundColor: C.overlay }}
                cancelText="Cancel"
                disabled={submitting}
              />
              <Ionicons name="chevron-down" size={18} color={C.mutedText} style={styles.chevron} />
            </View>
          </View>
        </View>

        {/* Approximate Date */}
        <View style={styles.block}>
          <TText style={styles.label}>Approximate Date</TText>
          <View style={styles.inputBox}>
            {Platform.OS === "web" ? (
              <input
                type="date"
                value={toDateInputValue(startDate)}
                min={toDateInputValue(new Date())}
                onChange={(e) => {
                  const nextValue = (e.target as HTMLInputElement).value;
                  if (!nextValue) return;
                  setStartDate(new Date(`${nextValue}T00:00:00`));
                }}
                style={styles.webDateInput as any}
                disabled={submitting}
              />
            ) : (
              <>
                <TouchableOpacity
                  style={styles.dateButton}
                  activeOpacity={0.85}
                  onPress={() => setShowStartPicker(true)}
                  disabled={submitting}
                >
                  <TText style={styles.readonlyText}>{formatHashDate(startDate)}</TText>
                  <Ionicons name="calendar-outline" size={18} color={C.mutedText} style={styles.calendar} />
                </TouchableOpacity>
                {showStartPicker && (
                  <DateTimePicker
                    value={startDate}
                    mode="date"
                    display="default"
                    minimumDate={new Date()}
                    onChange={(_event, selectedDate) => {
                      setShowStartPicker(false);
                      if (selectedDate) setStartDate(selectedDate);
                    }}
                  />
                )}
              </>
            )}
          </View>
        </View>

        {/* Add Item Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <TText style={styles.cardTitle}>Add Item</TText>

            <TouchableOpacity
              onPress={() => {
                trackUI?.({ screen: "MultipleRequestMasterItem", element: "open_item_modal", action: "click", extra: {} });
                setItemSearchModalVisible(true);
                if (!filterOptions.length) fetchMasterItems({ reset: true, search: itemSearchText || null });
              }}
              style={styles.plusBtn}
              disabled={submitting}
              activeOpacity={0.9}
            >
              <Ionicons name="add" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Table header */}
          <View style={styles.tableHeader}>
            <TText style={[styles.tableHeaderText, { flex: 1 }]}>Item Name</TText>
            <TText style={[styles.tableHeaderText, { width: 78, textAlign: "center" }]}>Qty</TText>
            <TText style={[styles.tableHeaderText, { width: 110, textAlign: "center" }]}>UOM</TText>
            <View style={{ width: 34 }} />
          </View>

          {/* Rows */}
          {selectedItemsList.map((item, index) => {
            const uoms = item.uom_options || [];
            const showUomLoading = !!item.master_item_id && item.uom_options && item.uom_options.length === 0;

            return (
              <View key={`${item.id}-${item.item_name}`} style={styles.tableRow}>
                <TText style={styles.rowItemName} numberOfLines={1} ellipsizeMode="tail">
                  {item.item_name}
                </TText>

                <TextInput
                  style={styles.rowQty}
                  placeholder="Qty"
                  {...getDecimalInputProps()}
                  value={item.requested_quantity}
                  onChangeText={(text) => {
                    const allowFrac = item.allow_fractional_issue ?? true;
                    const precision = item.base_precision ?? 2;
                    const formatted = formatQtyByRules(text, allowFrac, precision);

                    setSelectedItemsList((prev) => {
                      const copy = [...prev];
                      copy[index] = { ...copy[index], requested_quantity: formatted };
                      return copy;
                    });
                  }}
                  editable={!submitting}
                />

                <View style={styles.uomPill}>
                  {showUomLoading ? (
                    <View style={styles.uomLoading}>
                      <ActivityIndicator size="small" />
                    </View>
                  ) : (
                    <ModalSelector
                      data={uoms.length ? uoms : [{ key: "none", label: "No UOMs" }]}
                      initValue={
                        item.selected_uom_id
                          ? uoms.find((x) => String(x.key) === String(item.selected_uom_id))?.label ||
                            String(item.selected_uom_id)
                          : uoms[0]?.label || "Select UOM"
                      }
                      onChange={(opt: ProjectOption) => {
                        if (opt.key === "none") return;

                        trackUI?.({
                          screen: "MultipleRequestMasterItem",
                          element: "uom_select",
                          action: "change",
                          extra: { masterItemId: item.master_item_id || null, uomId: opt.key, label: opt.label },
                        });

                        setSelectedItemsList((prev) => {
                          const copy = [...prev];
                          copy[index] = { ...copy[index], selected_uom_id: String(opt.key) };
                          return copy;
                        });
                      }}
                      style={{ width: "100%" }}
                      selectStyle={styles.uomSelect}
                      initValueTextStyle={styles.uomText}
                      optionTextStyle={styles.optionText}
                      optionContainerStyle={{ backgroundColor: C.surface, borderBottomColor: C.border }}
                      cancelStyle={{ backgroundColor: C.surface }}
                      cancelTextStyle={{ color: C.text }}
                      overlayStyle={{ backgroundColor: C.overlay }}
                      cancelText="Cancel"
                      disabled={submitting || !uoms.length}
                    />
                  )}
                </View>

                <TouchableOpacity
                  onPress={() => {
                    trackUI?.({
                      screen: "MultipleRequestMasterItem",
                      element: "remove_item",
                      action: "click",
                      extra: { masterItemId: item.master_item_id || null, name: item.item_name },
                    });
                    setSelectedItemsList((prev) => prev.filter((_, i) => i !== index));
                  }}
                  style={styles.rowRemove}
                  disabled={submitting}
                >
                  <Ionicons name="close" size={16} color="#EF4444" />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {/* Search Modal (kept same functionality, UI slightly cleaner) */}
        <Modal
          visible={isItemSearchModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => {
            trackUI?.({ screen: "MultipleRequestMasterItem", element: "close_item_modal", action: "close", extra: {} });
            setItemSearchModalVisible(false);
            setItemSearchText("");
          }}
        >
          <View style={styles.dialogContainer}>
            <View style={[styles.dialogBox, { height: "70%" }]}>
              <TText style={styles.dialogTitle}>Search Item</TText>

              <View style={styles.searchBox}>
                <Ionicons name="search" size={16} color="#9CA3AF" />
                <TextInput
                  placeholder="Search items..."
                  value={itemSearchText}
                  onChangeText={(t) => {
                    setItemSearchText(t);
                    trackUI?.({
                      screen: "MultipleRequestMasterItem",
                      element: "item_search",
                      action: "change",
                      extra: { len: t.length },
                    });
                  }}
                  style={styles.searchInput}
                  editable={!submitting}
                />
              </View>

              {isLoadingItems && <ActivityIndicator size="small" style={{ marginBottom: 8 }} />}

              <ScrollView style={{ width: "100%" }} onScroll={handleItemScroll} scrollEventThrottle={16}>
                {filteredItemOptions.map((option) => {
                  const alreadyAdded = selectedItemsList.some((item) => item.master_item_id === Number(option.key));
                  return (
                    <TouchableOpacity
                      key={option.key}
                      onPress={() => {
                        const masterId = Number(option.key);

                        trackUI?.({
                          screen: "MultipleRequestMasterItem",
                          element: "select_item",
                          action: "click",
                          extra: { masterItemId: masterId, label: option.label, alreadyAdded },
                        });

                        if (!alreadyAdded) {
                          const rowIndex = selectedItemsList.length;

                          setSelectedItemsList((prev) => [
                            ...prev,
                            {
                              id: Date.now(),
                              master_item_id: masterId,
                              item_name: option.label,
                              item_type: type,
                              requested_quantity: "",
                              uom_options: [],
                              selected_uom_id: undefined,
                            },
                          ]);

                          setTimeout(() => {
                            hydrateItemUom(masterId, rowIndex);
                          }, 0);
                        }

                        setItemSearchModalVisible(false);
                        setItemSearchText("");
                      }}
                      style={styles.searchRow}
                      disabled={submitting}
                    >
                      <TText style={[styles.searchRowText, alreadyAdded && { color: "#9CA3AF" }]}>
                        {alreadyAdded ? "✅ " : ""}
                        {option.label}
                      </TText>
                    </TouchableOpacity>
                  );
                })}

                {isLoadingMoreItems && (
                  <View style={{ paddingVertical: 10, alignItems: "center" }}>
                    <ActivityIndicator size="small" />
                  </View>
                )}
              </ScrollView>

              <TouchableOpacity
                style={[styles.modalActionBtn, { backgroundColor: "#6B7280" }]}
                onPress={() => {
                  trackUI?.({ screen: "MultipleRequestMasterItem", element: "close_item_modal", action: "click", extra: {} });
                  setItemSearchModalVisible(false);
                  setItemSearchText("");
                }}
                disabled={submitting}
              >
                <TText style={styles.modalActionText}>Close</TText>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Description */}
        <View style={styles.block}>
          <TText style={styles.label}>Description</TText>
          <View style={[styles.inputBox, { minHeight: remarksInputHeight }]}>
            <TextInput
              style={[styles.descInput, { height: remarksInputHeight }]}
              multiline
              value={remarks}
              onChangeText={(t) => {
                setRemarks(t);
                trackUI?.({
                  screen: "MultipleRequestMasterItem",
                  element: "remarks",
                  action: "change",
                  extra: { len: t.length },
                });
              }}
              onContentSizeChange={(e) => {
                const h = e.nativeEvent.contentSize.height;
                setRemarksInputHeight(Math.max(44, h));
              }}
              editable={!submitting}
              placeholder="Enter description..."
              placeholderTextColor="#9CA3AF"
            />
          </View>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitButton, (submitting || !canSubmit) && { opacity: 0.6 }]}
          onPress={handleSubmitRequest}
          disabled={submitting || !canSubmit}
          activeOpacity={0.9}
        >
          {submitting ? (
            <>
              <ActivityIndicator size="small" color="#fff" />
              <TText style={[styles.submitButtonText, { marginLeft: 8 }]}>Submitting…</TText>
            </>
          ) : (
            <TText style={styles.submitButtonText}>Submit</TText>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF", paddingHorizontal: 14, paddingTop: 10 },

  // Header (unchanged)
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    justifyContent: "space-between",
  },
  headerTitleContainer: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerIconBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
  },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#111827" },

  // Blocks / labels
  block: { marginTop: 10 },
  label: { fontSize: 14, color: "#6B7280", marginBottom: 8 },

  // Input box like screenshot
  inputBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 14,
    paddingVertical: 14,
    justifyContent: "center",
    position: "relative",
  },

  readonlyText: { fontSize: 16, color: "#111827", fontWeight: "600" },
  dateButton: {
    minHeight: 22,
    justifyContent: "center",
  },
  webDateInput: {
    width: "100%",
    borderWidth: 0,
    backgroundColor: "transparent",
    color: "#111827",
    fontSize: 16,
    fontWeight: "600",
    padding: 0,
  },

  // ModalSelector base
  selectorSelect: { borderWidth: 0, padding: 0, backgroundColor: "transparent" },
  selectorText: { fontSize: 16, color: "#111827", fontWeight: "600" },
  optionText: { fontSize: 14, color: "#111827" },

  chevron: { position: "absolute", right: 12, top: "50%", marginTop: -9 },
  calendar: { position: "absolute", right: 12, top: "50%", marginTop: -9 },

  // 2-col row
  row2: { flexDirection: "row", gap: 12, marginTop: 10 },

  // Add Item card like screenshot
  card: {
    marginTop: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EEF2F7",
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  cardTitle: { fontSize: 18, fontWeight: "800", color: "#111827" },
  plusBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },

  // “table” header
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  tableHeaderText: { color: "#6B7280", fontWeight: "700", fontSize: 13 },

  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },

  rowItemName: { flex: 1, color: "#111827", fontSize: 14, fontWeight: "600", paddingRight: 8 },

  rowQty: {
    width: 78,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#EAF2FF",
    borderWidth: 1,
    borderColor: "#C7DBFF",
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginRight: 10,
  },

  // UOM pill (kept)
  uomPill: {
    width: 110,
    height: 36,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    overflow: "hidden",
    marginRight: 10,
  },
  uomSelect: { borderWidth: 0, padding: 0, height: 36, justifyContent: "center" },
  uomText: { fontSize: 12, color: "#111827", fontWeight: "800", textAlign: "center" },
  uomLoading: { height: 36, alignItems: "center", justifyContent: "center" },

  rowRemove: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },

  // Description
  descInput: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    padding: 0,
    textAlignVertical: "top",
  },

  // Submit button like screenshot
  submitButton: {
    backgroundColor: "#3B82F6",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 18,
    marginBottom: 22,
  },
  submitButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },

  // Search modal
  dialogContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.45)" },
  dialogBox: { width: "88%", padding: 18, backgroundColor: "#FFF", borderRadius: 12, alignItems: "center", elevation: 5 },
  dialogTitle: { fontSize: 18, fontWeight: "800", color: "#111827", marginBottom: 10 },

  searchBox: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#111827", padding: 0 },

  searchRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#E5E7EB", width: "100%" },
  searchRowText: { fontSize: 16, color: "#111827" },

  modalActionBtn: { marginTop: 12, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, alignSelf: "center" },
  modalActionText: { color: "#FFFFFF", fontWeight: "700" },
});

export default MultipleRequestMasterItem;
