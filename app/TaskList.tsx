import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
// app/TaskList.tsx
import { useSmartSearch } from "../hooks/useSmartSearch";
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { View, TouchableOpacity, StyleSheet, FlatList, TextInput, Dimensions, ActivityIndicator, RefreshControl, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import ModalSelector from "@/components/AppModalSelect";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { authenticatedFetch } from "../utils/auth";

// ✅ Telemetry
import {
  trackScreen,
  trackUI,
  trackNetwork,
  updateDynamicContext,
  clearDynamicContext,
} from "../utils/telemetry";
import { useFontScale } from "@/context/FontScaleContext";
import TText from "@/components/TText";
import { useTheme } from "@/src/theme/ThemeProvider";

type AssignedProperty = {
  property_id: string;
  property_name: string;
  project_id: string;
  project_name: string;
  property_project_label: string;
  task_count: number;
};

type ApiTask = {
  project_id: string;
  project_name: string;
  property_id: string;
  property_name: string;
  schedule_id: number;
  schedule_phase_name: string;
  schedule_start: string | null;
  schedule_end: string | null;
  schedule_status: string;
  schedule_remarks: string | null;
  task_id: number;
  task_name: string;
  task_end_date: string | null;
  has_update_today?: boolean;
};

type EmbeddedEmployee = {
  first_name?: string;
  last_name?: string;
  employee_code?: string;
  email?: string;
  job_title?: string;
  phone_number?: string;
};

type TaskListProps = {
  embedded?: boolean;
  employee?: EmbeddedEmployee;
  active?: boolean;
  onlineOverride?: boolean;
  refreshKey?: number;

  // ✅ ADD THIS
  onTasksChanged?: () => void | Promise<void>;
};


const first = <T,>(v: T | T[] | undefined): T | undefined => (Array.isArray(v) ? v[0] : v);

const toYMD = (val?: string | null) => {
  if (!val) return new Date().toISOString().slice(0, 10);
  const d = new Date(val);
  return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
};

const toIntOrNull = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const normalizeStatus = (s?: string) => {
  const value = (s ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (value === "in_progress" || value === "in-progress") return "in_progress";
  if (value === "on_hold" || value === "on-hold") return "on_hold";
  if (value === "planning") return "planning";
  if (value === "pending") return "pending";
  if (value === "completed") return "completed";
  return value;
};

const statusColors = (status?: string) => {
  switch (normalizeStatus(status)) {
    case "pending":
      return { bg: "#FFF7DD", text: "#B45309", border: "#FDE68A" };
    case "on_hold":
      return { bg: "#EEF2F7", text: "#374151", border: "#E5E7EB" };
    case "in_progress":
      return { bg: "#FFF0D9", text: "#B45309", border: "#FCD34D" };
    case "completed":
      return { bg: "#DFF5E3", text: "#166534", border: "#BBF7D0" };
    case "planning":
      return { bg: "#E7E7FF", text: "#4F46E5", border: "#D0CEFF" };
    default:
      return { bg: "#EEF2F7", text: "#374151", border: "#E5E7EB" };
  }
};

const buildFormBody = (obj: Record<string, any>): string =>
  Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(typeof v === "string" ? v : String(v)))
    .join("&");

const dedupeAssignedProperties = (items: AssignedProperty[]): AssignedProperty[] => {
  const seen = new Set<string>();
  const deduped: AssignedProperty[] = [];

  for (const item of items) {
    const key = String(item.property_id ?? "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
};

const buildPropertyOptions = (items: AssignedProperty[]) => [
  { key: "All", label: "ALL" },
  ...dedupeAssignedProperties(items).map((p) => ({
    key: String(p.property_id),
    label: p.property_project_label || `${p.property_name} - ${p.project_name}`,
  })),
];

const dedupeSelectorOptions = (items: { key: string; label: string }[]) => {
  const seen = new Set<string>();
  const deduped: { key: string; label: string }[] = [];

  for (const item of items) {
    const key = String(item.key ?? "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push({ key, label: item.label });
  }

  return deduped.length ? deduped : [{ key: "All", label: "ALL" }];
};

const TaskList: React.FC<TaskListProps> = ({
  embedded = false,
  employee,
  active = true,
  onlineOverride,
  onTasksChanged, // ✅ ADD
  refreshKey,
}) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  const router = useRouter();
  const params = useLocalSearchParams();

  const firstName = embedded ? employee?.first_name : first(params?.first_name as any);
  const lastName = embedded ? employee?.last_name : first(params?.last_name as any);
  const employeeCode = embedded ? employee?.employee_code ?? "" : (first(params?.employee_code as any) ?? "");

  const [numColumns, setNumColumns] = useState<number>(1);

  const [searchInput, setSearchInput] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [assignedCount, setAssignedCount] = useState<number>(0);
  const [assignedProps, setAssignedProps] = useState<AssignedProperty[]>([]);
  const [tasks, setTasks] = useState<ApiTask[]>([]);

  // ✅ IMPORTANT: keep latest tasks in a ref to avoid hook loops
  const tasksRef = useRef<ApiTask[]>([]);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedProperty, setSelectedProperty] = useState("All");
  const [propertyOptions, setPropertyOptions] = useState<{ key: string; label: string }[]>([
    { key: "All", label: "ALL" },
  ]);

  const [online, setOnline] = useState<boolean>(true);

  useEffect(() => {
    if (embedded && typeof onlineOverride === "boolean") setOnline(onlineOverride);
  }, [embedded, onlineOverride]);

  useEffect(() => {
    if (embedded && typeof onlineOverride === "boolean") return;

    const unsub = NetInfo.addEventListener((state) => {
      const isOn = !!(state.isConnected && state.isInternetReachable !== false);
      setOnline(isOn);
    });

    NetInfo.fetch().then((state) => {
      const isOn = !!(state.isConnected && state.isInternetReachable !== false);
      setOnline(isOn);
    });

    return () => unsub && unsub();
  }, [embedded, onlineOverride]);

  const [page, setPage] = useState<number>(1);
  const pageSize = 200;
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);

  const modalRef = useRef<any>(null);
  const propertyModalRef = useRef<any>(null);

  const API_BASE_URL = employeeCode ? `${APP_API_BASE_URL}/employee-property-tasks/${employeeCode}` : "";

  const [activeUpdateKey, setActiveUpdateKey] = useState<string | null>(null);
  const [updateText, setUpdateText] = useState<string>("");
  const [sendingUpdateKey, setSendingUpdateKey] = useState<string | null>(null);

  // ✅ Anti-loop guards
  const inFlightRef = useRef<boolean>(false);
  const lastReqSigRef = useRef<string>("");
  const didInitialEmbeddedFetchRef = useRef<boolean>(false);

  useEffect(() => {
    updateDynamicContext({ screen: "TaskList", embedded });
    trackScreen("TaskList", {
      embedded,
      online_initial: online,
      has_employee_code: !!employeeCode,
      platform: Platform.OS,
    });

    return () => clearDynamicContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const smartData = useSmartSearch<ApiTask>({
    data: tasks,
    query: online ? searchQuery : searchInput,
    keys: ["schedule_phase_name", "task_name", "property_id", "property_name", "project_name"],
  });

  const cacheKeys = useMemo(() => {
    const tag = employeeCode || "anon";
    return {
      tasks: `cached_tasks_${tag}`,
      props: `cached_assigned_props_${tag}`,
      propOptions: `cached_property_options_${tag}`,
      assignedCount: `cached_assigned_count_${tag}`,
    };
  }, [employeeCode]);

  const loadFromCache = useCallback(async () => {
    try {
      const [t, p, po, c] = await Promise.all([
        AsyncStorage.getItem(cacheKeys.tasks),
        AsyncStorage.getItem(cacheKeys.props),
        AsyncStorage.getItem(cacheKeys.propOptions),
        AsyncStorage.getItem(cacheKeys.assignedCount),
      ]);

      const ctasks = t ? (JSON.parse(t) as ApiTask[]) : [];
      const rawProps = p ? (JSON.parse(p) as AssignedProperty[]) : [];
      const cprops = dedupeAssignedProperties(rawProps);
      const rawPropOpts = po ? (JSON.parse(po) as { key: string; label: string }[]) : buildPropertyOptions(cprops);
      const cpropOpts = dedupeSelectorOptions(rawPropOpts);
      const ccount = c ? Number(c) : cprops.length;

      setTasks(ctasks);
      setAssignedProps(cprops);
      setPropertyOptions(cpropOpts.length ? cpropOpts : [{ key: "All", label: "ALL" }]);
      setAssignedCount(ccount);

      setTotalCount(ctasks.length);
      setHasMore(false);
    } catch {
      setTasks([]);
      setAssignedProps([]);
      setPropertyOptions([{ key: "All", label: "ALL" }]);
      setAssignedCount(0);
      setTotalCount(0);
      setHasMore(false);
    }
  }, [cacheKeys]);

  const saveToCache = useCallback(
    async (t: ApiTask[], p: AssignedProperty[], po: { key: string; label: string }[], c: number) => {
      try {
        await Promise.all([
          AsyncStorage.setItem(cacheKeys.tasks, JSON.stringify(t)),
          AsyncStorage.setItem(cacheKeys.props, JSON.stringify(p)),
          AsyncStorage.setItem(cacheKeys.propOptions, JSON.stringify(po)),
          AsyncStorage.setItem(cacheKeys.assignedCount, String(c)),
        ]);
      } catch {}
    },
    [cacheKeys]
  );

  // ✅ FIXED: fetchData no longer depends on `tasks`
  const fetchData = useCallback(
    async (pageToLoad: number = 1, append: boolean = false, showFullLoader: boolean = false, force: boolean = false) => {
      if (embedded && !active) return;

      const sig = [
        employeeCode || "no-emp",
        online ? "on" : "off",
        `p=${pageToLoad}`,
        `a=${append ? 1 : 0}`,
        `q=${(searchQuery || "").trim()}`,
        `ps=${pageSize}`,
      ].join("|");

      if (!force) {
        if (inFlightRef.current) return;
        if (lastReqSigRef.current === sig) return;
      }

      lastReqSigRef.current = sig;
      inFlightRef.current = true;

      if (!employeeCode) {
        setAssignedCount(0);
        setAssignedProps([]);
        setTasks([]);
        setPropertyOptions([{ key: "All", label: "ALL" }]);
        setTotalCount(0);
        setHasMore(false);
        setIsLoading(false);
        setIsLoadingMore(false);
        setRefreshing(false);
        inFlightRef.current = false;
        return;
      }

      if (!online) {
        try {
          if (pageToLoad === 1 && !append) {
            if (showFullLoader) setIsLoading(true);
            await loadFromCache();
            setIsLoading(false);
          }
        } finally {
          inFlightRef.current = false;
        }
        return;
      }

      if (!API_BASE_URL) {
        try {
          await loadFromCache();
        } finally {
          inFlightRef.current = false;
        }
        return;
      }

      if (pageToLoad === 1 && !append && showFullLoader) setIsLoading(true);
      else if (pageToLoad > 1 || append) setIsLoadingMore(true);

      const t0 = Date.now();

      try {
        let url = `${API_BASE_URL}?page=${pageToLoad}&page_size=${pageSize}`;
        if (searchQuery.trim().length > 0) url += `&search=${encodeURIComponent(searchQuery.trim())}`;

        const resp = await authenticatedFetch(url);

        let json: any = null;
        try {
          json = await resp.json();
        } catch {}

        const assignedCountVal = Number(json?.assigned_properties_count ?? 0);
        const assignedList = dedupeAssignedProperties(
          Array.isArray(json?.assigned_properties) ? json.assigned_properties : []
        );
        const taskList: ApiTask[] = Array.isArray(json?.tasks) ? json.tasks : [];
        const total = Number(json?.count ?? taskList.length ?? 0);

        trackNetwork({
          url: "/employee-property-tasks/:employee_code",
          method: "GET",
          status: resp.status,
          ok: resp.ok,
          durationMs: Date.now() - t0,
          extra: {
            page: pageToLoad,
            page_size: pageSize,
            append,
            tasks_received: taskList.length,
            props_received: assignedList.length,
            assigned_count: assignedCountVal,
            total_count: total,
          },
        });

        if (!resp.ok) {
          await loadFromCache();
          return;
        }

        let newTasks: ApiTask[] = taskList;

        if (append) {
          const merged = [...tasksRef.current, ...taskList];
          const seen = new Set<string>();
          const deduped: ApiTask[] = [];

          for (const t of merged) {
            const k = `${t.schedule_id}-${t.task_id}-${t.property_id}`;
            if (!seen.has(k)) {
              seen.add(k);
              deduped.push(t);
            }
          }
          newTasks = deduped;
        }

        setTasks(newTasks);
        setAssignedProps(assignedList);
        setAssignedCount(assignedCountVal || assignedList.length);

        const options = buildPropertyOptions(assignedList);
        setPropertyOptions(options);

        setTotalCount(total);
        const more = pageToLoad * pageSize < total;
        setHasMore(more);
        setPage(pageToLoad);

        saveToCache(newTasks, assignedList, options, assignedCountVal || assignedList.length);
      } catch {
        await loadFromCache();
      } finally {
        if (showFullLoader) setIsLoading(false);
        setIsLoadingMore(false);
        setRefreshing(false);
        inFlightRef.current = false;
      }
    },
    [embedded, active, online, searchQuery, employeeCode, API_BASE_URL, loadFromCache, saveToCache]
  );

  const refreshAll = useCallback(() => {
    if (embedded && !active) return;

    trackUI({
      screen: "TaskList",
      element: "refresh_all",
      action: "submit",
      extra: { embedded, active, online },
    });

    if (!online) {
      setRefreshing(true);
      loadFromCache().finally(() => setRefreshing(false));
      return;
    }

    setPage(1);
    setTotalCount(null);
    setHasMore(true);
    fetchData(1, false, true, true);
  }, [embedded, active, online, fetchData, loadFromCache]);

  useFocusEffect(
    useCallback(() => {
      if (embedded) return;
      refreshAll();
    }, [embedded, refreshAll])
  );

  useEffect(() => {
    if (!embedded) return;
    if (!active) return;
    if (!didInitialEmbeddedFetchRef.current) {
      didInitialEmbeddedFetchRef.current = true;
      refreshAll();
    }
  }, [embedded, active, refreshAll]);

  useEffect(() => {
    if (!embedded) return;
    if (!active) return;
    if (!refreshKey) return;
    refreshAll();
  }, [embedded, active, refreshKey, refreshAll]);

  useEffect(() => {
    const handleResize = () => {
      const screenWidth = Dimensions.get("window").width;
      setNumColumns(screenWidth < 650 ? 1 : screenWidth < 980 ? 2 : 3);
    };
    handleResize();
    const sub = Dimensions.addEventListener("change", handleResize);
    return () => sub?.remove();
  }, []);

  useEffect(() => {
    if (!online) return;
    const handler = setTimeout(() => setSearchQuery(searchInput.trim()), 350);
    return () => clearTimeout(handler);
  }, [searchInput, online]);

  useEffect(() => {
    if (!online) return;
    if (embedded && !active) return;

    setPage(1);
    setHasMore(true);
    setTotalCount(null);
    fetchData(1, false, false, false);
  }, [searchQuery, online, embedded, active, fetchData]);

  useEffect(() => {
    console.log("TaskList MOUNTED", { embedded, employeeCode, refreshKey });
    return () => console.log("TaskList UNMOUNTED", { embedded, employeeCode });
  }, [embedded, employeeCode, refreshKey]);

  const norm = (s?: string) => normalizeStatus(s).replace(/_/g, " ");

  const filteredBase = online ? tasks : searchInput ? smartData : tasks;

  const ORDERED_STATUSES = ["in progress", "pending", "on hold", "completed"] as const;

  const statusRank: Record<string, number> = ORDERED_STATUSES.reduce((acc, status, index) => {
    acc[status] = index;
    return acc;
  }, {} as Record<string, number>);

  const finalFilteredData = filteredBase
    .filter((t) => {
      const matchesStatus = selectedStatus === "All" || norm(t.schedule_status) === norm(selectedStatus);
      const matchesProperty = selectedProperty === "All" || t.property_id === selectedProperty;
      return matchesStatus && matchesProperty;
    })
    .sort((a, b) => (statusRank[norm(a.schedule_status)] ?? 999) - (statusRank[norm(b.schedule_status)] ?? 999));

  const handleSearchChange = (q: string) => {
    setSearchInput(q);
    trackUI({ screen: "TaskList", element: "search_input", action: "change", extra: { embedded, online, len: q.length } });
  };

  const clearSearch = () => {
    setSearchInput("");
    setSearchQuery("");
    trackUI({ screen: "TaskList", element: "search_clear", action: "click", extra: { embedded, online } });
  };

  const handleStatusFilter = (s: string) => {
    setSelectedStatus(s);
    trackUI({ screen: "TaskList", element: "status_filter_select", action: "toggle", extra: { value: s } });
  };

  const filterOptions = [
    { key: "All", label: "ALL" },
    { key: "In Progress", label: "IN PROGRESS" },
    { key: "Pending", label: "PENDING" },
    { key: "On Hold", label: "ON HOLD" },
    { key: "Completed", label: "COMPLETED" },
  ];

  const handleLoadMore = () => {
    if (embedded && !active) return;
    if (!online) return;
    if (isLoading || isLoadingMore) return;
    if (!hasMore) return;

    const nextPage = page + 1;
    fetchData(nextPage, true, false, false);
  };

  const onRefresh = () => {
    setRefreshing(true);
    refreshAll();
  };

  const makeTaskKey = (t: ApiTask) => `${t.schedule_id}-${t.task_id}-${t.property_id}`;

  const handleToggleQuickUpdate = (task: ApiTask) => {
    const key = makeTaskKey(task);
    if (activeUpdateKey === key) {
      setActiveUpdateKey(null);
      setUpdateText("");
    } else {
      setActiveUpdateKey(key);
      setUpdateText("");
    }
  };

  const mkObsHeaders = (
    firstName: string | undefined,
    lastName: string | undefined,
    employeeCode: string
  ) => {
    const fullName = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  
    return {
      "x-request-id": `req_task_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      "x-engineer-name": fullName || firstName || employeeCode || "Unknown Engineer",
      "x-employee-code": employeeCode || "",
      "x-app-version": "rn-1.0.0",
    };
  };

  const handleSendQuickUpdate = async (task: ApiTask) => {
    const key = makeTaskKey(task);
    const note = updateText.trim();
    if (!note) return;

    const taskId = toIntOrNull(task.task_id);
    const scheduleId = toIntOrNull(task.schedule_id);
    const propertyId = task.property_id ?? "";
    
    if (taskId === null || scheduleId === null || !propertyId) return;

    try {
      setSendingUpdateKey(key);

      const fullName = `${firstName ?? ""} ${lastName ?? ""}`.trim();

const taskUpdatePayload = {
  task_id: taskId,
  property_id: propertyId,
  schedule_id: scheduleId,
  engineer_name: fullName || firstName || employeeCode || "",
  update_text: note,
  employee_code: employeeCode,
};
      const formBody = buildFormBody(taskUpdatePayload);

      const respTask = await authenticatedFetch(`${APP_API_BASE_URL}/task-updates`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", ...mkObsHeaders(firstName, lastName, employeeCode) },
                body: formBody,
      });

      if (!respTask.ok) return;

      const message_text = [
        `📌 Update for "${task.schedule_phase_name}"`,
        "",
        `🟡 Status: *${(task.schedule_status ?? "").toLowerCase()}*`,
        `📅 Start: *${toYMD(task.schedule_start)}*`,
        `📅 End: *${toYMD(task.schedule_end)}*`,
        `📝 Note: ${note}`,
      ].join("\n");

      const engineerName = fullName || firstName || employeeCode || "Engineer";

      const formData = new FormData();
      formData.append("type", "new_message");
      formData.append("property_id", propertyId);
      formData.append("employee_code", employeeCode);
      formData.append("engineer_name", engineerName);
      formData.append("message_text", message_text);
      formData.append("visible_to_clients", "false");
      formData.append("linked_ticket_id", "");

      const respChat = await authenticatedFetch(`${APP_API_BASE_URL}/property-chat/send`, {
        method: "POST",
        headers: { ...mkObsHeaders(firstName, lastName, employeeCode) },        body: formData,
      });

      if (!respChat.ok) return;

      setTasks((prev) =>
        prev.map((t) =>
          t.schedule_id === task.schedule_id && t.task_id === task.task_id && t.property_id === task.property_id
            ? { ...t, has_update_today: true }
            : t
        )
      );
      await onTasksChanged?.();

      setActiveUpdateKey(null);
      setUpdateText("");
    } finally {
      setSendingUpdateKey(null);
    }
  };

  const renderListItem = ({ item }: { item: ApiTask }) => {
    const statusTone = statusColors(item.schedule_status);
    const propLabel =
      assignedProps.find((p) => p.property_id === item.property_id)?.property_project_label ??
      `${item.property_name} - ${item.project_name}`;

    const isInProgress = norm(item.schedule_status) === "in progress";
    const hasUpdateToday = item.has_update_today ?? false;
    const statusDotColor = isInProgress ? (hasUpdateToday ? C.success : C.danger) : undefined;

    const key = makeTaskKey(item);
    const showQuickUpdate = isInProgress && !hasUpdateToday;

    return (
      <View style={styles.card}>
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={() => {
            router.push({
              pathname: "/TaskManagementForm",
              params: {
                schedule: JSON.stringify({
                  scheduleid: item.schedule_id,
                  phasename: item.schedule_phase_name ?? "",
                  status: item.schedule_status ?? "",
                  startdate: toYMD(item.schedule_start),
                  enddate: toYMD(item.schedule_end),
                  property_id: item.property_id,
                  task_id: item.task_id != null ? String(item.task_id) : "",
                  remarks: item.schedule_remarks ?? "",
                }),
                schedule_id: String(item.schedule_id),
                propertyId: item.property_id,
                first_name: firstName ?? "",
                last_name: lastName ?? "",
                employee_code: employeeCode,
              },
            } as any);
          }}
        >
          <View style={styles.topRow}>
            <View style={styles.idRow}>
              <TText style={styles.reqIdText} numberOfLines={3} ellipsizeMode="tail">
                {item.schedule_phase_name}
              </TText>
            </View>

            <View style={styles.statusWrapper}>
              {isInProgress && <View style={[styles.statusDot, { backgroundColor: statusDotColor ?? "transparent" }]} />}
              <View style={[styles.statusPill, { backgroundColor: statusTone.bg, borderColor: statusTone.border }]}>
                <TText style={[styles.statusPillText, { color: statusTone.text }]}>
                  {(item.schedule_status ?? "").toUpperCase()}
                </TText>
              </View>
              {showQuickUpdate && (
          <View style={styles.updateRow}>
            <TouchableOpacity style={styles.updateChip} onPress={() => handleToggleQuickUpdate(item)} activeOpacity={0.85}>
              <Ionicons name="chatbox-ellipses-outline" size={14} color="#991B1B" />
            </TouchableOpacity>
          </View>
        )}
            </View>
          </View>

          <View style={styles.metaRow}>
            <TText style={styles.metaText} numberOfLines={1}>
              {propLabel}
            </TText>
          </View>
        </TouchableOpacity>

      

          {showQuickUpdate && activeUpdateKey === key && (
          <View style={styles.updateComposer}>
            <TextInput
              style={styles.updateInput}
              placeholder="Write today’s update..."
              placeholderTextColor={C.subtleText}
              value={updateText}
              onChangeText={setUpdateText}
              multiline
            />
            <TouchableOpacity
              style={[
                styles.updateSendButton,
                (!updateText.trim() || sendingUpdateKey === key) && styles.updateSendButtonDisabled,
              ]}
              disabled={!updateText.trim() || sendingUpdateKey === key}
              onPress={() => handleSendQuickUpdate(item)}
            >
              {sendingUpdateKey === key ? <ActivityIndicator size="small" color={C.white} /> : <Ionicons name="send" size={16} color={C.white} />}
              <TText style={styles.updateSendText}>Send</TText>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (isLoading && !refreshing && !isLoadingMore && tasks.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={C.primary} />
        <TText style={styles.loadingText}>{online ? "Loading tasks..." : "Loading offline cache..."}</TText>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="task-list-root">
      {!online && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color="#7A5B00" />
          <TText style={styles.offlineText}>You’re offline</TText>
        </View>
      )}

      {!embedded && (
        <View style={styles.headerContainer}>
          <TouchableOpacity onPress={() => router.push("/HomeScreen")} style={styles.headerIconBtn}>
            <Ionicons name="arrow-back" size={22} color={C.text} />
          </TouchableOpacity>

          <View style={{ alignItems: "center" }}>
            <TText style={styles.headerTitle}>Task List</TText>
            <TText style={styles.headerSub}>
              {assignedCount || assignedProps.length || 0} properties • {finalFilteredData.length} tasks
            </TText>
          </View>

          <TouchableOpacity onPress={() => router.push("/HomeScreen")} style={styles.headerIconBtn}>
            <Ionicons name="home" size={22} color={C.text} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={C.subtleText} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search phase / task / property"
            value={searchInput}
            onChangeText={handleSearchChange}
            autoCapitalize="none"
            returnKeyType="search"
            placeholderTextColor={C.subtleText}
          />
          {searchInput.length > 0 && (
            <TouchableOpacity onPress={clearSearch} style={styles.clearBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={18} color={C.subtleText} />
            </TouchableOpacity>
          )}
        </View>

        <ModalSelector
          ref={propertyModalRef}
          data={propertyOptions}
          onChange={(option: any) => setSelectedProperty(String(option.key))}
          style={styles.pickerContainer}
          selectStyle={styles.picker}
          optionTextStyle={styles.pickerText}
          optionContainerStyle={{ backgroundColor: C.surface, borderBottomColor: C.border }}
          cancelStyle={{ backgroundColor: C.surface }}
          cancelTextStyle={{ color: C.text }}
          overlayStyle={{ backgroundColor: C.overlay }}
          cancelText="Cancel"
        >
          <TouchableOpacity style={styles.iconButton} onPress={() => propertyModalRef.current?.open()}>
            <Ionicons name="options" size={20} color={C.text} />
          </TouchableOpacity>
        </ModalSelector>

        <ModalSelector
          ref={modalRef}
          data={[
            { key: "All", label: "ALL" },
            { key: "In Progress", label: "IN PROGRESS" },
            { key: "Pending", label: "PENDING" },
            { key: "On Hold", label: "ON HOLD" },
            { key: "Completed", label: "COMPLETED" },
          ]}
          onChange={(option: any) => handleStatusFilter(String(option.key))}
          style={styles.pickerContainer}
          selectStyle={styles.picker}
          optionTextStyle={styles.pickerText}
          optionContainerStyle={{ backgroundColor: C.surface, borderBottomColor: C.border }}
          cancelStyle={{ backgroundColor: C.surface }}
          cancelTextStyle={{ color: C.text }}
          overlayStyle={{ backgroundColor: C.overlay }}
          cancelText="Cancel"
        >
          <TouchableOpacity style={styles.iconButton} onPress={() => modalRef.current?.open()}>
            <Ionicons name="filter" size={20} color={C.text} />
          </TouchableOpacity>
        </ModalSelector>
      </View>

      {embedded ? (
        <View style={styles.listContainer}>
          {finalFilteredData.length ? (
            finalFilteredData.map((item: any, index: number) => (
              <React.Fragment key={`${item.schedule_id}-${item.task_id}-${item.property_id}-${index}`}>
                {renderListItem({ item, index } as any)}
              </React.Fragment>
            ))
          ) : (
            <View style={{ padding: 24, alignItems: "center" }}>
              <TText style={{ color: C.mutedText, fontWeight: "700" }}>
                {online ? "No tasks match your filters." : "No cached tasks found."}
              </TText>
            </View>
          )}
        </View>
      ) : (
        <FlatList
          data={finalFilteredData}
          renderItem={renderListItem}
          keyExtractor={(item: any) => `${item.schedule_id}-${item.task_id}-${item.property_id}`}
          contentContainerStyle={styles.listContainer}
          numColumns={numColumns}
          key={numColumns}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} enabled={online} />}
          ListFooterComponent={
            isLoadingMore && hasMore ? (
              <View style={{ paddingVertical: 16, alignItems: "center" }}>
                <ActivityIndicator size="small" color={C.primary} />
                <TText style={{ marginTop: 6, color: C.mutedText, fontSize: 12, fontWeight: "700" }}>
                  Loading more tasks…
                </TText>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={{ padding: 24, alignItems: "center" }}>
              <TText style={{ color: C.mutedText, fontWeight: "700" }}>
                {online ? "No tasks match your filters." : "No cached tasks found."}
              </TText>
            </View>
          }
        />
      )}
    </View>
  );
};

export default TaskList;

export const TaskListEmbedded = (props: {
  employee: EmbeddedEmployee;
  active?: boolean;
  online: boolean;
  refreshKey: number;
  onTasksChanged?: () => void | Promise<void>;
}) => {
  return (
    <TaskList
      embedded
      employee={props.employee}
      active={props.active ?? true}
      onlineOverride={props.online}
      refreshKey={props.refreshKey}
      onTasksChanged={props.onTasksChanged} // ✅ ADD
    />
  );
};


const createStyles = (C: ReturnType<typeof useTheme>["theme"]["colors"]) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  offlineBanner: {
    backgroundColor: "#FFF4CC",
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  offlineText: { color: "#7A5B00", fontWeight: "800" },

  listContainer: { paddingHorizontal: 12, paddingBottom: 24 },

  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: C.headerBg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surfaceAlt,
  },
  headerTitle: { fontSize: 16, fontWeight: "900", color: C.text },
  headerSub: { marginTop: 2, fontSize: 12, fontWeight: "700", color: C.mutedText },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  searchBox: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 14,
    color: C.text,
    fontWeight: "700",
  },
  clearBtn: { paddingLeft: 8 },

  pickerContainer: { borderRadius: 14 },
  picker: { borderWidth: 0, padding: 0 },
  pickerText: { fontSize: 10, color: C.text, fontWeight: "500" },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
  },

  card: {
    flex: 1,
    marginVertical: 8,
    backgroundColor: C.surface,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },

  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 8,
    gap: 10,
  },
  idRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
    marginRight: 8,
    gap: 10,
  },
  iconBubble: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: C.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  reqIdText: {
    fontSize: 12,
    fontWeight: "700",
    color: C.text,
    flexShrink: 1,
    flexWrap: "wrap",
    maxWidth: "90%",
  },
  statusWrapper: { flexDirection: "row", alignItems: "center" },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1.2,
  },
  statusPillText: { fontSize: 9, fontWeight: "600", letterSpacing: 0.3 },

  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  metaIcon: { marginRight: 8 },
  metaText: { fontSize: 12, fontWeight: "700", color: C.mutedText },

  updateRow: { marginTop: 6, flexDirection: "row" },
  updateChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start",
    gap: 6,
  },
  updateChipText: { fontSize: 10, fontWeight: "700", color: C.danger },

  updateComposer: {
    marginTop: 10,
    marginBottom: 4,
    padding: 10,
    borderRadius: 14,
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  updateInput: {
    minHeight: 44,
    maxHeight: 140,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.borderStrong,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 10,
    fontWeight: "600",
    marginBottom: 10,
    textAlignVertical: "top",
    backgroundColor: C.surface,
    color: C.text,
  },
  updateSendButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: C.primaryStrong,
    gap: 8,
  },
  updateSendButtonDisabled: { backgroundColor: C.navIconInactive },
  updateSendText: { color: C.white, fontSize: 10, fontWeight: "700" },

  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, fontSize: 14, fontWeight: "800", color: C.primary },
});
