import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
// HomeScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
  Platform,
  BackHandler,
  ScrollView,
  ActivityIndicator,
  Image,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import NetInfo from "@react-native-community/netinfo";
import { MaterialIcons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import DateTimePicker from "@react-native-community/datetimepicker";

import { useTheme } from "@/src/theme/ThemeProvider";
import { updateGlobalContext, trackScreen, trackUI, trackNetwork } from "../utils/telemetry";
import { authenticatedFetch, clearStoredAuth } from "../utils/auth";
import PullToRefreshScrollView from "@/components/PullToRefreshScrollView";

import { PropertiesEmbedded } from "./PropertiesScreen";
import { TaskListEmbedded } from "./TaskList";
import AvenueAskScreen from "./AvenueAskScreen";

import { useFontScale } from "@/context/FontScaleContext";
import TText from "@/components/TText";
import { getInstalledAppVersion } from "@/hooks/useAppVersionControl";

import StockManager from "./StockManager";
import StockInventoryScreen from "./StockInventoryScreen";
import { isSalesClientStage, listSalesLeads, normalizeSalesStageKey } from "@/utils/salesLeads";

const API_BASE_URL = `${APP_API_BASE_URL}`;
const STOCK_LIST_PATH = "/all-requests";

const AVENUE_LOGO_URL =
  "https://avenuerealty.in/wp-content/uploads/2022/12/cropped-Avenue-reality-logo.png";

type HomePanel =
  | "properties"
  | "tasks"
  | "salesDashboard"
  | "avenueAsk"
  | "stockRequests"
  | "stockRequested"
  | "stockInventory";

type EmployeeShape = {
  first_name?: string;
  last_name?: string;
  job_title?: string;
  email?: string;
  phone_number?: string;
  employee_code?: string;
  roles?: string[];
};

type HomeSummary = Record<string, any>;

type MetricDef = {
  key: string;
  title: string;
  value: number;
  icon: any;
  iconBg: string;
  onPress?: () => void;
  loading?: boolean;
  testID: string;
};

function safeNum(n: any, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function pickPendingCount(summary: any): number {
  return (
    safeNum(summary?.pendingTasks) ||
    safeNum(summary?.pending_tasks) ||
    safeNum(summary?.pendingCount) ||
    safeNum(summary?.pending_count) ||
    safeNum(summary?.totalPendingTasks) ||
    safeNum(summary?.total_pending_tasks) ||
    safeNum(summary?.pending_task_count) ||
    safeNum(summary?.pending_task_for_today) ||
    0
  );
}

async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return !!(state.isConnected && state.isInternetReachable !== false);
}

function listenNetwork(onChange: (online: boolean) => void) {
  const sub = NetInfo.addEventListener((state) => {
    const online = !!(state.isConnected && state.isInternetReachable !== false);
    onChange(online);
  });
  return () => sub && sub();
}

function normalizeLegacyRole(raw: string): string | null {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return null;
  if (value.includes("sales team") || value === "sales_team" || value === "sales") return "SALES_TEAM";
  if (value.includes("stock manager") || value === "stock_manager") return "STOCK_MANAGEMENT_TEAM";
  if (value.includes("procurement") || value === "procurement_team") return "PROCUREMENT_TEAM";
  if (value.includes("site engineer") || value === "site_engineer") return "SITE_ENGINEER";
  if (value.includes("support staff") || value === "support_staff") return "SUPPORT_STAFF";
  if (
    value === "admin" ||
    value === "administrator" ||
    value === "admin_user" ||
    value === "admin user"
  ) {
    return "ADMIN";
  }
  if (
    value.includes("avenue backend engineer") ||
    value.includes("backend engineer") ||
    value === "avenue_backend_engineer" ||
    value === "backend_team"
  ) {
    return "BACKEND_TEAM";
  }
  if (value === "finance" || value === "finance_team" || value === "accounts") return "FINANCE_TEAM";
  return null;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  SUPER_ADMIN: "Super Admin",
  STOCK_MANAGEMENT_TEAM: "Stock Management Team",
  BACKEND_TEAM: "Backend Team",
  FINANCE_TEAM: "Finance Team",
  SALES_TEAM: "Sales Team",
  PROCUREMENT_TEAM: "Procurement Team",
  SITE_ENGINEER: "Site Engineer",
  SUPPORT_STAFF: "Support Staff",
};

function resolveRoleKeys(employee: EmployeeShape | null): string[] {
  const seen = new Set<string>();
  const roles: string[] = [];
  const fromPayload = Array.isArray(employee?.roles) ? employee.roles : [];
  fromPayload.forEach((role) => {
    const normalized = String(role || "").trim().toUpperCase();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    roles.push(normalized);
  });
  if (!roles.length) {
    const fallback = normalizeLegacyRole(String(employee?.job_title || ""));
    if (fallback && !seen.has(fallback)) {
      seen.add(fallback);
      roles.push(fallback);
    }
  }
  return roles;
}

function getPrimaryRoleLabel(roleKeys: string[]): string | null {
  const primaryRole = roleKeys.find(Boolean);
  if (!primaryRole) return null;
  return ROLE_LABELS[primaryRole] || primaryRole.replace(/_/g, " ");
}

function panelTestID(panel: HomePanel) {
  return `panel-${panel}`;
}

function getInitials(name: string) {
  const cleaned = name.trim();
  if (!cleaned) return "AV";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function formatTimeLabel(totalMinutes: number) {
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${String(hours12).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function minutesToDate(totalMinutes: number) {
  const date = new Date();
  date.setHours(Math.floor(totalMinutes / 60) % 24, totalMinutes % 60, 0, 0);
  return date;
}

function dateToMinutes(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function TextSizeSlider({
  value,
  onChange,
  minimumValue = 0.85,
  maximumValue = 1.4,
  step = 0.05,
  tickCount = 7,
}: {
  value: number;
  onChange: (v: number) => void;
  minimumValue?: number;
  maximumValue?: number;
  step?: number;
  tickCount?: number;
}) {
  const { theme } = useTheme();
  const C = theme.colors;
  const ticks = useMemo(() => new Array(tickCount).fill(0).map((_, i) => i), [tickCount]);

  return (
    <View testID="text-size-row" style={styles.textSizeRow}>
      <TText testID="text-size-small-label" style={[styles.textSizeA, { color: C.mutedText }]}>A</TText>

      <View testID="text-size-slider-shell" style={styles.sliderShell}>
        <View style={[styles.sliderLine, { backgroundColor: C.sliderLine }]} />
        <View style={styles.tickRow} pointerEvents="none">
          {ticks.map((i) => (
            <View key={i} style={[styles.tick, { backgroundColor: C.tick }]} />
          ))}
        </View>

        <Slider
          testID="text-size-slider"
          style={styles.nativeSlider}
          minimumValue={minimumValue}
          maximumValue={maximumValue}
          step={step}
          value={value}
          onValueChange={onChange}
          minimumTrackTintColor="transparent"
          maximumTrackTintColor="transparent"
          thumbTintColor={C.primary}
        />
      </View>

      <TText testID="text-size-large-label" style={[styles.textSizeABig, { color: C.text }]}>A</TText>
    </View>
  );
}

function ProfileRow({
  icon,
  label,
  value,
  testID,
}: {
  icon: any;
  label: string;
  value: string;
  testID: string;
}) {
  const { theme } = useTheme();
  const C = theme.colors;
  return (
    <View testID={testID} style={styles.profileRow}>
      <View style={[styles.profileIconBox, { backgroundColor: C.primarySoft }]}>
        <MaterialIcons name={icon} size={18} color={C.primaryStrong} />
      </View>
      <View style={styles.profileTextWrap}>
        <TText style={[styles.profileLabel, { color: C.mutedText }]}>{label}</TText>
        <TText style={[styles.profileText, { color: C.text }]}>{value}</TText>
      </View>
    </View>
  );
}

function BottomNavBtn({
  icon,
  label,
  onPress,
  active,
  testID,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  active?: boolean;
  testID: string;
}) {
  const { theme } = useTheme();
  const C = theme.colors;
  const color = active ? C.navIconActive : C.navIconInactive;
  return (
    <TouchableOpacity testID={testID} onPress={onPress} activeOpacity={0.75} style={styles.navBtn}>
      <MaterialIcons name={icon} size={22} color={color} />
      <TText style={[styles.navLabel, { color }]}>{label}</TText>
    </TouchableOpacity>
  );
}

const HomeScreen: React.FC<any> = () => {
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => true;
      BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => BackHandler.removeEventListener("hardwareBackPress", onBackPress);
    }, [])
  );

  useEffect(() => {
    trackScreen("HomeScreen", { is_web: Platform.OS === "web" });
  }, []);

  const routerNav = useRouter();
  useLocalSearchParams();
  const insets = useSafeAreaInsets();

  const [employeeData, setEmployeeData] = useState<EmployeeShape | null>(null);
  const [loginType, setLoginType] = useState<string | null>(null);

  const currentAppVersion = getInstalledAppVersion();

  const { fontScale, setFontScale } = useFontScale();
  const { theme, pref, setPref, schedule, setSchedule } = useTheme();
  const C = theme.colors;
  const [timePickerTarget, setTimePickerTarget] = useState<"dark" | "light" | null>(null);

  const [online, setOnline] = useState(true);
  useEffect(() => {
    const unsub = listenNetwork(setOnline);
    (async () => setOnline(await isOnline()))();
    return () => unsub && unsub();
  }, []);

  const [activePanel, setActivePanel] = useState<HomePanel>("properties");

  const propsRefreshKeyRef = useRef(0);
  const tasksRefreshKeyRef = useRef(0);
  const [propsRefreshKey, setPropsRefreshKey] = useState(0);
  const [tasksRefreshKey, setTasksRefreshKey] = useState(0);

  const [profileVisible, setProfileVisible] = useState(false);
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);

  const [requestedTotalCount, setRequestedTotalCount] = useState(0);
  const [requestedCountLoading, setRequestedCountLoading] = useState(false);

  const requestedCountCacheKey = useMemo(() => {
    const code = employeeData?.employee_code || "unknown";
    return `stock_requests_total:${code}`;
  }, [employeeData?.employee_code]);

  const loadRequestedCountFromCache = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(requestedCountCacheKey);
      if (!raw) return null;
      return JSON.parse(raw) as { total: number; lastSyncedAt: number };
    } catch {
      return null;
    }
  }, [requestedCountCacheKey]);

  const saveRequestedCountToCache = useCallback(
    async (total: number) => {
      try {
        await AsyncStorage.setItem(
          requestedCountCacheKey,
          JSON.stringify({ total: safeNum(total, 0), lastSyncedAt: Date.now() })
        );
      } catch {}
    },
    [requestedCountCacheKey]
  );

  const fetchRequestedTotalCount = useCallback(async () => {
    const emp = employeeData?.employee_code || "";
    if (!emp) return;

    if (!online) {
      const cached = await loadRequestedCountFromCache();
      if (cached?.total != null) setRequestedTotalCount(safeNum(cached.total, 0));
      return;
    }

    setRequestedCountLoading(true);
    const t0 = Date.now();

    try {
      const qs = new URLSearchParams({
        limit: "1",
        offset: "0",
        parent_only: "true",
        status: "REQUESTED",
      });

      const urlPath = `${STOCK_LIST_PATH}?${qs.toString()}`;
      const res = await authenticatedFetch(urlPath);

      trackNetwork({
        url: urlPath,
        method: "GET",
        status: res.status,
        ok: res.ok,
        durationMs: Date.now() - t0,
        extra: { employee_code: emp },
      });

      if (!res.ok) {
        const cached = await loadRequestedCountFromCache();
        if (cached?.total != null) setRequestedTotalCount(safeNum(cached.total, 0));
        return;
      }

      const json: any = await res.json();
      const total = safeNum(json?.total, 0);

      setRequestedTotalCount(total);
      await saveRequestedCountToCache(total);
    } catch {
      const cached = await loadRequestedCountFromCache();
      if (cached?.total != null) setRequestedTotalCount(safeNum(cached.total, 0));
    } finally {
      setRequestedCountLoading(false);
    }
  }, [employeeData?.employee_code, online, loadRequestedCountFromCache, saveRequestedCountToCache]);

  useEffect(() => {
    (async () => {
      const type = await AsyncStorage.getItem("login_type");
      setLoginType(type);
    })();
  }, []);

  useEffect(() => {
    const fetchEmployeeDetails = async () => {
      try {
        if (loginType === null) return;

        if (loginType === "email") {
          const admin: EmployeeShape = {
            first_name: "Admin",
            last_name: "Datso",
            email: "datso.admin@gmail.com",
            phone_number: "9876543210",
            job_title: "Admin",
            employee_code: "EMP_CON_999",
            roles: ["ADMIN"],
          };
          setEmployeeData(admin);
          await AsyncStorage.setItem("cached_employee", JSON.stringify(admin));
          return;
        }

        if (!online) {
          const cached = await AsyncStorage.getItem("cached_employee");
          if (cached) setEmployeeData(JSON.parse(cached));
          return;
        }

        const phoneNumber = await AsyncStorage.getItem("phone_number");
        if (!phoneNumber) return;

        const t0 = Date.now();
        const response = await authenticatedFetch(`/employees/${phoneNumber}`);

        trackNetwork({
          url: "/employees/:phone_number",
          method: "GET",
          status: response.status,
          ok: response.ok,
          durationMs: Date.now() - t0,
          extra: { online: true },
        });

        if (!response.ok) throw new Error("Failed to fetch employee details.");

        const data = await response.json();
        setEmployeeData(data);
        await AsyncStorage.setItem("cached_employee", JSON.stringify(data));
      } catch {
        const cached = await AsyncStorage.getItem("cached_employee");
        if (cached) setEmployeeData(JSON.parse(cached));
      }
    };

    fetchEmployeeDetails();
  }, [loginType, online]);

  useEffect(() => {
    if (!employeeData) return;
    const stableId = employeeData.employee_code || employeeData.phone_number || "unknown";
    updateGlobalContext({ userId: stableId, employeeCode: employeeData.employee_code || null });
  }, [employeeData?.employee_code, employeeData?.phone_number]);

  const roleKeys = useMemo(() => resolveRoleKeys(employeeData), [employeeData]);
  const hasRole = useCallback((role: string) => roleKeys.includes(role), [roleKeys]);
  const isAdmin = hasRole("ADMIN") || hasRole("SUPER_ADMIN");
  const isSalesTeam = hasRole("SALES_TEAM");
  const isStockManager = hasRole("STOCK_MANAGEMENT_TEAM");
  const isProcurementTeam = hasRole("PROCUREMENT_TEAM");
  const hasStockAccess = isStockManager || isProcurementTeam || isAdmin;
  const usesStockOnlyHome = isStockManager || isProcurementTeam;
  const hasBackendDashboardAccess = hasRole("BACKEND_TEAM") || isAdmin;
  const isFieldEngineer = hasRole("SITE_ENGINEER") || hasRole("SUPPORT_STAFF");

  useEffect(() => {
    if (!employeeData) return;
    if (isSalesTeam) {
      routerNav.replace({
        pathname: "/SalesDashboard",
        params: {
          first_name: employeeData.first_name || "",
          last_name: employeeData.last_name || "",
          email: employeeData.email || "",
          job_title: employeeData.job_title || "",
          employee_code: employeeData.employee_code || "",
          phone_number: employeeData.phone_number || "",
          roles: JSON.stringify(roleKeys),
        },
      } as any);
      return;
    }
    if (usesStockOnlyHome) setActivePanel("stockInventory");
  }, [employeeData, isSalesTeam, roleKeys, routerNav, usesStockOnlyHome]);

  const doLogout = useCallback(async () => {
    try {
      setLogoutBusy(true);
      setLogoutConfirmVisible(false);
      setProfileVisible(false);

      await clearStoredAuth();
      updateGlobalContext({ userId: null, employeeCode: null });

      routerNav.replace("/LoginPage");
    } catch {
      Alert.alert("Error", "Logout request failed.");
    } finally {
      setLogoutBusy(false);
    }
  }, [routerNav]);

  const requestLogout = useCallback(() => {
    setProfileVisible(false);
    setLogoutConfirmVisible(true);
  }, []);

  const [homeSummary, setHomeSummary] = useState<HomeSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const profileRoleLabel = useMemo(() => {
    const fromSummary = String(homeSummary?.primaryRoleLabel || "").trim();
    if (fromSummary) return fromSummary;
    const fromRoles = getPrimaryRoleLabel(roleKeys);
    if (fromRoles) return fromRoles;
    return employeeData?.job_title || "—";
  }, [employeeData?.job_title, homeSummary?.primaryRoleLabel, roleKeys]);

  const summaryCacheKey = useMemo(() => {
    const code = employeeData?.employee_code || "unknown";
    return `home_summary:${code}`;
  }, [employeeData?.employee_code]);

  const loadSummaryFromCache = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(summaryCacheKey);
      if (!raw) return null;
      return JSON.parse(raw) as { data: HomeSummary; lastSyncedAt: number };
    } catch {
      return null;
    }
  }, [summaryCacheKey]);

  const saveSummaryToCache = useCallback(
    async (data: HomeSummary) => {
      try {
        await AsyncStorage.setItem(
          summaryCacheKey,
          JSON.stringify({ data, lastSyncedAt: Date.now() })
        );
      } catch {}
    },
    [summaryCacheKey]
  );

  const fetchHomeSummary = useCallback(async () => {
    const emp = employeeData?.employee_code;
    if (!emp) return;

    if (!online) {
      const cached = await loadSummaryFromCache();
      if (cached?.data) setHomeSummary(cached.data);
      return;
    }

    setSummaryLoading(true);
    const urlPath = `/employees/${emp}/home-summary`;
    const t0 = Date.now();

    try {
      const res = await authenticatedFetch(urlPath);

      trackNetwork({
        url: urlPath,
        method: "GET",
        status: res.status,
        ok: res.ok,
        durationMs: Date.now() - t0,
        extra: { employee_code: emp },
      });

      if (!res.ok) {
        const cached = await loadSummaryFromCache();
        if (cached?.data) setHomeSummary(cached.data);
        setSummaryLoading(false);
        return;
      }

      const data = (await res.json()) as HomeSummary;
      setHomeSummary(data);
      await saveSummaryToCache(data);
      setSummaryLoading(false);
    } catch {
      const cached = await loadSummaryFromCache();
      if (cached?.data) setHomeSummary(cached.data);
      setSummaryLoading(false);
    }
  }, [employeeData?.employee_code, online, loadSummaryFromCache, saveSummaryToCache]);

  useEffect(() => {
    fetchHomeSummary();
  }, [fetchHomeSummary]);

  useFocusEffect(
    useCallback(() => {
      fetchHomeSummary();
      fetchRequestedTotalCount();
      if (isSalesTeam) {
        listSalesLeads({
          employeeCode: String(employeeData?.employee_code || ""),
          role: String(employeeData?.job_title || ""),
          isOpen: true,
          limit: 50,
          offset: 0,
        }).then((leads) => {
          setSalesLeadCount(
            leads.filter((lead) => {
              const stage = normalizeSalesStageKey(String(lead.stage_key));
              return stage !== "lost" && !isSalesClientStage(stage);
            }).length
          );
          setSalesVisitCount(leads.filter((lead) => normalizeSalesStageKey(String(lead.stage_key)) === "site_visit").length);
          setSalesBookingCount(leads.filter((lead) => isSalesClientStage(String(lead.stage_key))).length);
          setSalesFollowUpCount(
            leads.filter((lead) => {
              const stage = normalizeSalesStageKey(String(lead.stage_key));
              return stage === "requirements" || stage === "shortlist" || stage === "negotiate" || stage === "legal";
            }).length
          );
        }).catch(() => {
          setSalesLeadCount(0);
          setSalesVisitCount(0);
          setSalesBookingCount(0);
          setSalesFollowUpCount(0);
        });
      }
    }, [fetchHomeSummary, fetchRequestedTotalCount, isSalesTeam, employeeData?.employee_code])
  );

  useEffect(() => {
    if (!employeeData?.employee_code) return;
    fetchRequestedTotalCount();
  }, [employeeData?.employee_code, online, fetchRequestedTotalCount]);

  const pendingTasksCount = useMemo(() => pickPendingCount(homeSummary), [homeSummary]);
  const [totalProperties, setTotalProperties] = useState(0);
  const [salesLeadCount, setSalesLeadCount] = useState(0);
  const [salesVisitCount, setSalesVisitCount] = useState(0);
  const [salesBookingCount, setSalesBookingCount] = useState(0);
  const [salesFollowUpCount, setSalesFollowUpCount] = useState(0);

  const commonParams = useMemo(
    () => ({
      first_name: employeeData?.first_name,
      last_name: employeeData?.last_name,
      email: employeeData?.email,
      job_title: employeeData?.job_title,
      employee_code: employeeData?.employee_code,
      phone_number: employeeData?.phone_number,
      roles: roleKeys,
    }),
    [employeeData, roleKeys]
  );

  const fullName = useMemo(() => {
    const fn = employeeData?.first_name || "";
    const ln = employeeData?.last_name || "";
    return `${fn} ${ln}`.trim() || "—";
  }, [employeeData?.first_name, employeeData?.last_name]);

  const activatePropertiesPanel = useCallback(() => {
    trackUI({ screen: "HomeScreen", element: "metric_total_properties", action: "click", extra: {} });
    setActivePanel("properties");
    propsRefreshKeyRef.current += 1;
    setPropsRefreshKey(propsRefreshKeyRef.current);
  }, []);

  const activateTasksPanel = useCallback(() => {
    trackUI({ screen: "HomeScreen", element: "metric_tasks", action: "click", extra: {} });
    setActivePanel("tasks");
    tasksRefreshKeyRef.current += 1;
    setTasksRefreshKey(tasksRefreshKeyRef.current);
  }, []);

  const refreshActivePanel = useCallback(() => {
    propsRefreshKeyRef.current += 1;
    tasksRefreshKeyRef.current += 1;
    setPropsRefreshKey(propsRefreshKeyRef.current);
    setTasksRefreshKey(tasksRefreshKeyRef.current);
  }, []);

  const handlePullToRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([
        fetchHomeSummary(),
        fetchRequestedTotalCount(),
      ]);
      refreshActivePanel();
    } finally {
      setRefreshing(false);
    }
  }, [fetchHomeSummary, fetchRequestedTotalCount, refreshActivePanel, refreshing]);

  const activateStockInventoryPanel = useCallback(() => {
    setActivePanel("stockInventory");
  }, []);

  const activateStockRequestsPanel = useCallback(() => {
    setActivePanel("stockRequests");
  }, []);

  const activateStockRequestedPanel = useCallback(() => {
    setActivePanel("stockRequested");
  }, []);

  const activateAvenueAskPanel = useCallback(() => {
    setActivePanel("avenueAsk");
  }, []);

  const salesRouteParams = useMemo(
    () => ({
      first_name: employeeData?.first_name || "",
      last_name: employeeData?.last_name || "",
      email: employeeData?.email || "",
      job_title: employeeData?.job_title || "",
      employee_code: employeeData?.employee_code || "",
      phone_number: employeeData?.phone_number || "",
      roles: JSON.stringify(roleKeys),
    }),
    [employeeData, roleKeys]
  );

  const metricCards: MetricDef[] = useMemo(() => {
    const salesLeadsCard: MetricDef = {
      key: "sales_leads",
      title: "New Leads",
      value: salesLeadCount,
      icon: "support-agent",
      iconBg: "#E9E6FF",
      onPress: () => routerNav.push({ pathname: "/SalesLeads", params: salesRouteParams } as any),
      testID: "metric-sales-leads",
    };

    const salesVisitsCard: MetricDef = {
      key: "sales_visits",
      title: "Site Visits",
      value: salesVisitCount,
      icon: "event-available",
      iconBg: "#E9E6FF",
      onPress: () => routerNav.push({ pathname: "/SalesLeads", params: salesRouteParams } as any),
      testID: "metric-sales-visits",
    };

    const salesBookingsCard: MetricDef = {
      key: "sales_bookings",
      title: "Bookings",
      value: salesBookingCount,
      icon: "check-circle",
      iconBg: "#E9E6FF",
      onPress: () => routerNav.push({ pathname: "/SalesClients", params: salesRouteParams } as any),
      testID: "metric-sales-bookings",
    };

    const salesFollowUpsCard: MetricDef = {
      key: "sales_followups",
      title: "Follow Ups",
      value: salesFollowUpCount,
      icon: "call",
      iconBg: "#E9E6FF",
      onPress: () => routerNav.push({ pathname: "/SalesLeads", params: salesRouteParams } as any),
      testID: "metric-sales-followups",
    };

    const requestsCard: MetricDef = {
      key: "requests",
      title: "Requests",
      value: safeNum(requestedTotalCount, 0),
      icon: "assignment",
      iconBg: "#E9E6FF",
      onPress: activateStockRequestsPanel,
      loading: requestedCountLoading,
      testID: "metric-requests",
    };

    const propertiesCard: MetricDef = {
      key: "total_properties",
      title: "Total Properties",
      value: totalProperties,
      icon: "home-work",
      iconBg: "#E9E6FF",
      onPress: activatePropertiesPanel,
      testID: "metric-total-properties",
    };

    const pendingTasksCard: MetricDef = {
      key: "pending_tasks",
      title: "Pending Tasks",
      value: pendingTasksCount,
      icon: "assignment-turned-in",
      iconBg: "#E9E6FF",
      onPress: activateTasksPanel,
      loading: summaryLoading,
      testID: "metric-pending-tasks",
    };

    const requestedCard: MetricDef = {
      key: "requested",
      title: "Requested",
      value: safeNum(requestedTotalCount, 0),
      icon: "assignment",
      iconBg: "#E9E6FF",
      onPress: activateStockRequestedPanel,
      loading: requestedCountLoading,
      testID: "metric-requested",
    };

    if (isSalesTeam) return [salesLeadsCard, salesVisitsCard, salesBookingsCard, salesFollowUpsCard];
    if (hasBackendDashboardAccess) return [propertiesCard, pendingTasksCard, requestedCard];
    if (usesStockOnlyHome) return [requestsCard];
    if (isFieldEngineer) return [propertiesCard, pendingTasksCard];
    return [propertiesCard, pendingTasksCard];
  }, [
    hasBackendDashboardAccess,
    isFieldEngineer,
    isSalesTeam,
    salesLeadCount,
    salesVisitCount,
    salesBookingCount,
    salesFollowUpCount,
    totalProperties,
    pendingTasksCount,
    summaryLoading,
    requestedTotalCount,
    requestedCountLoading,
    routerNav,
    salesRouteParams,
    activateStockRequestsPanel,
    activatePropertiesPanel,
    activateTasksPanel,
    activateStockRequestedPanel,
    usesStockOnlyHome,
  ]);

  const metricGridStyle = useMemo(() => {
    const n = metricCards.length;
    if (n === 3) return [styles.gridRowWrap, { justifyContent: "space-between" }];
    return styles.gridRow;
  }, [metricCards.length]);

  const metricCardStyle = useMemo(() => {
    const n = metricCards.length;
    if (n === 3) return [styles.metricCard, styles.metricCardThird];
    return styles.metricCard;
  }, [metricCards.length]);

  const renderMetricCards = () => (
    <View testID="metric-grid" style={metricGridStyle as any}>
      {metricCards.map((m) => (
        <TouchableOpacity
          key={m.key}
          testID={m.testID}
          activeOpacity={0.85}
          onPress={m.onPress}
          style={[metricCardStyle as any, { backgroundColor: C.surface }]}
        >
          <View style={{ flex: 1 }}>
            <TText style={[styles.metricTitle, { color: C.mutedText }]}>{m.title}</TText>
            <TText style={[styles.metricValue, { color: C.text }]}>{m.loading ? "…" : m.value}</TText>
            <View style={{ height: 22 }} />
          </View>

          <View style={[styles.circleIcon, { backgroundColor: C.primarySoft || m.iconBg }]}>
            <MaterialIcons name={m.icon} size={18} color={C.mutedText} />
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );

  const activeThemeLabel = useMemo(() => {
    if (pref === "custom") return `Custom: dark ${formatTimeLabel(schedule.darkStartMinutes)} to ${formatTimeLabel(schedule.lightStartMinutes)}`;
    if (pref === "system") return `Using ${theme.mode}`;
    return `${pref} mode`;
  }, [pref, schedule.darkStartMinutes, schedule.lightStartMinutes, theme.mode]);

  const renderHeaderBar = () => (
    <View testID="home-header" style={[styles.header, { backgroundColor: C.headerBg, borderBottomColor: C.border }]}>
      <TouchableOpacity
        testID="header-profile-button"
        style={styles.headerLeft}
        activeOpacity={0.8}
        onPress={() => setProfileVisible(true)}
      >
        <Image testID="header-logo" source={{ uri: AVENUE_LOGO_URL }} style={styles.headerLogo} resizeMode="contain" />
      </TouchableOpacity>

      <View testID="header-title-container" style={styles.headerCenter}>
        <TText testID="header-title" style={[styles.headerTitle, { color: C.text }]}>Dashboard</TText>
      </View>

      <View testID="header-network-status" style={styles.headerRight}>
        <MaterialIcons
          testID={online ? "network-online-icon" : "network-offline-icon"}
          name={online ? "wifi" : "wifi-off"}
          size={20}
          color={online ? C.success : C.danger}
          style={{ marginRight: 10 }}
        />
      </View>
    </View>
  );

  const isFullScreen =
    usesStockOnlyHome ||
    activePanel === "stockRequests" ||
    activePanel === "stockRequested" ||
    activePanel === "stockInventory";

  const renderSalesDashboard = () => (
    <View testID={panelTestID("salesDashboard")} style={{ marginTop: 8 }}>
      <View style={[styles.salesHeroCard, { backgroundColor: C.surface }]}>
        <View style={styles.salesHeroTextWrap}>
          <TText style={[styles.salesHeroEyebrow, { color: C.primaryStrong }]}>Sales Dashboard</TText>
          <TText style={[styles.salesHeroTitle, { color: C.text }]}>Welcome, {employeeData?.first_name || "Team"}</TText>
          <TText style={[styles.salesHeroSubtitle, { color: C.mutedText }]}>
            Track leads, follow-ups, visits, and bookings from one place.
          </TText>
        </View>
        <View style={[styles.salesHeroBadge, { backgroundColor: C.primarySoft }]}>
          <MaterialIcons name="trending-up" size={24} color={C.primaryStrong} />
        </View>
      </View>

      <View style={styles.salesQuickGrid}>
        <View style={[styles.salesQuickCard, { backgroundColor: C.surface }]}>
          <View style={[styles.salesQuickIcon, { backgroundColor: C.primarySoft }]}>
            <MaterialIcons name="groups" size={20} color={C.primaryStrong} />
          </View>
          <TText style={[styles.salesQuickTitle, { color: C.text }]}>Lead Pipeline</TText>
          <TText style={[styles.salesQuickText, { color: C.mutedText }]}>View fresh prospects and move them through your funnel.</TText>
        </View>

        <View style={[styles.salesQuickCard, { backgroundColor: C.surface }]}>
          <View style={[styles.salesQuickIcon, { backgroundColor: C.primarySoft }]}>
            <MaterialIcons name="today" size={20} color={C.primaryStrong} />
          </View>
          <TText style={[styles.salesQuickTitle, { color: C.text }]}>Today&apos;s Follow Ups</TText>
          <TText style={[styles.salesQuickText, { color: C.mutedText }]}>Stay on top of pending customer calls and callbacks.</TText>
        </View>

        <View style={[styles.salesQuickCard, { backgroundColor: C.surface }]}>
          <View style={[styles.salesQuickIcon, { backgroundColor: C.primarySoft }]}>
            <MaterialIcons name="place" size={20} color={C.primaryStrong} />
          </View>
          <TText style={[styles.salesQuickTitle, { color: C.text }]}>Site Visits</TText>
          <TText style={[styles.salesQuickText, { color: C.mutedText }]}>Monitor planned visits and customer walk-through activity.</TText>
        </View>

        <View style={[styles.salesQuickCard, { backgroundColor: C.surface }]}>
          <View style={[styles.salesQuickIcon, { backgroundColor: C.primarySoft }]}>
            <MaterialIcons name="check-circle" size={20} color={C.primaryStrong} />
          </View>
          <TText style={[styles.salesQuickTitle, { color: C.text }]}>Closures</TText>
          <TText style={[styles.salesQuickText, { color: C.mutedText }]}>Keep an eye on conversions and booking momentum.</TText>
        </View>
      </View>
    </View>
  );


  if (!employeeData) {
    return (
      <View
        testID="home-screen-loading"
        style={[styles.container, { backgroundColor: C.bg, justifyContent: "center", alignItems: "center" }]}
      >
        <ActivityIndicator testID="home-screen-loading-spinner" size="large" color={C.primary} />
        <TText style={{ marginTop: 10, color: C.mutedText, fontWeight: "700" }}>Loading dashboard</TText>
      </View>
    );
  }

  const profileInitials = getInitials(fullName);
  const homeBottomNavInset = Math.max(insets.bottom, 8);
  const homeBottomNavHeight = 60 + homeBottomNavInset;

  return (
    <View testID="home-screen-root" style={[styles.container, { backgroundColor: C.bg }]}>
        {activePanel !== "avenueAsk" && renderHeaderBar()}

        {activePanel === "avenueAsk" ? (
        <View testID={panelTestID("avenueAsk")} style={{ flex: 1 }}>
          <AvenueAskScreen
            employeeName={employeeData?.first_name || "—"}
            online={online}
            onBack={() => setActivePanel(usesStockOnlyHome ? "stockInventory" : isSalesTeam ? "salesDashboard" : "properties")}
          />
        </View>
      ) : isFullScreen ? (
        <View testID="home-fullscreen-layout" style={{ flex: 1, paddingHorizontal: 14, paddingTop: 12, backgroundColor: C.bg }}>
          {renderMetricCards()}

          <View testID={panelTestID(activePanel)} style={{ flex: 1, marginTop: 10 }}>
            {activePanel === "stockInventory" ? (
              <StockInventoryScreen embedded />
            ) : (
              <StockManager
              embedded
              employee_code={employeeData?.employee_code || ""}
            />
            )}
          </View>
        </View>
      ) : (
        <PullToRefreshScrollView
          testID="home-scroll-view"
          style={[styles.page, { backgroundColor: C.bg }]}
          contentContainerStyle={styles.pageContent}
          refreshing={refreshing}
          onRefresh={handlePullToRefresh}
          pullLabel="Pull to refresh dashboard"
          releaseLabel="Release to refresh dashboard"
        >
          {renderMetricCards()}

          <View testID={panelTestID(activePanel)} style={{ marginTop: 8 }}>
            {isSalesTeam ? (
              renderSalesDashboard()
            ) : activePanel === "properties" ? (
              <PropertiesEmbedded
                employee={commonParams}
                online={online}
                refreshKey={propsRefreshKey}
                onCountChange={(n: any) => setTotalProperties(safeNum(n, 0))}
              />
            ) : (
              <TaskListEmbedded
                employee={commonParams}
                online={online}
                refreshKey={tasksRefreshKey}
                active={activePanel === "tasks"}
                onTasksChanged={async () => {
                  tasksRefreshKeyRef.current += 1;
                  setTasksRefreshKey(tasksRefreshKeyRef.current);
                  await fetchHomeSummary();
                }}
              />
            )}
          </View>

          <View testID="home-bottom-spacer" style={{ height: homeBottomNavHeight + 12 }} />
        </PullToRefreshScrollView>
      )}

      <View
        testID="bottom-nav"
        style={[
          styles.bottomNav,
          {
            backgroundColor: C.navBg,
            borderTopColor: C.border,
            minHeight: homeBottomNavHeight,
            paddingBottom: homeBottomNavInset,
          },
        ]}
      >
        {usesStockOnlyHome ? (
          <>
            <BottomNavBtn
              testID="nav-stock"
              icon="inventory"
              label="Stock"
              onPress={activateStockInventoryPanel}
              active={activePanel === "stockInventory"}
            />
            <BottomNavBtn
              testID="nav-requests"
              icon="assignment"
              label="Requests"
              onPress={activateStockRequestsPanel}
              active={activePanel === "stockRequests" || activePanel === "stockRequested"}
            />
            {/*
            <BottomNavBtn
              testID="nav-mic"
              icon="keyboard-voice"
              label="Mic"
              onPress={activateAvenueAskPanel}
              active={activePanel === "avenueAsk"}
            />
            */}
          </>
        ) : isSalesTeam ? (
          <>
            <BottomNavBtn
              testID="nav-sales-dashboard"
              icon="insights"
              label="Dashboard"
              onPress={() => setActivePanel("salesDashboard")}
              active={activePanel === "salesDashboard"}
            />
            <BottomNavBtn
              testID="nav-sales-leads"
              icon="groups"
              label="Leads"
              onPress={() => routerNav.push({ pathname: "/SalesLeads", params: salesRouteParams } as any)}
              active={false}
            />
            <BottomNavBtn
              testID="nav-sales-clients"
              icon="person"
              label="Clients"
              onPress={() => routerNav.push({ pathname: "/SalesClients", params: salesRouteParams } as any)}
              active={false}
            />
          </>
        ) : hasBackendDashboardAccess ? (
          <>
            <BottomNavBtn
              testID="nav-properties"
              icon="home-work"
              label="Properties"
              onPress={activatePropertiesPanel}
              active={activePanel === "properties"}
            />
            <BottomNavBtn
              testID="nav-tasks"
              icon="assignment-turned-in"
              label="Tasks"
              onPress={activateTasksPanel}
              active={activePanel === "tasks"}
            />
            <BottomNavBtn
              testID="nav-stock"
              icon="inventory"
              label="Stock"
              onPress={activateStockInventoryPanel}
              active={activePanel === "stockInventory"}
            />
            <BottomNavBtn
              testID="nav-requested"
              icon="assignment"
              label="Requested"
              onPress={activateStockRequestedPanel}
              active={activePanel === "stockRequested"}
            />
            {/*
            <BottomNavBtn
              testID="nav-mic"
              icon="keyboard-voice"
              label="Mic"
              onPress={activateAvenueAskPanel}
              active={activePanel === "avenueAsk"}
            />
            */}
          </>
        ) : isFieldEngineer ? (
          <>
            <BottomNavBtn
              testID="nav-properties"
              icon="home-work"
              label="Properties"
              onPress={activatePropertiesPanel}
              active={activePanel === "properties"}
            />
            <BottomNavBtn
              testID="nav-tasks"
              icon="assignment-turned-in"
              label="Tasks"
              onPress={activateTasksPanel}
              active={activePanel === "tasks"}
            />
            {/*
            <BottomNavBtn
              testID="nav-mic"
              icon="keyboard-voice"
              label="Mic"
              onPress={activateAvenueAskPanel}
              active={activePanel === "avenueAsk"}
            />
            */}
          </>
        ) : (
          <>
            <BottomNavBtn
              testID="nav-properties"
              icon="home-work"
              label="Properties"
              onPress={activatePropertiesPanel}
              active={activePanel === "properties"}
            />
            <BottomNavBtn
              testID="nav-tasks"
              icon="assignment-turned-in"
              label="Tasks"
              onPress={activateTasksPanel}
              active={activePanel === "tasks"}
            />
            {/*
            <BottomNavBtn
              testID="nav-mic"
              icon="keyboard-voice"
              label="Mic"
              onPress={activateAvenueAskPanel}
              active={activePanel === "avenueAsk"}
            />
            */}
          </>
        )}
      </View>


      <Modal transparent visible={profileVisible} animationType="slide" onRequestClose={() => setProfileVisible(false)}>
        <Pressable
          testID="profile-modal-overlay"
          style={[styles.profileOverlay, { backgroundColor: C.overlay }]}
          onPress={() => setProfileVisible(false)}
        >
          <Pressable
            testID="profile-modal-card"
            style={[styles.profileCard, { backgroundColor: C.surface, borderColor: C.border }]}
            onPress={(e: any) => e?.stopPropagation?.()}
          >
            <View style={styles.profileSheetHandle} />

            <View style={[styles.profileHero, { backgroundColor: C.primarySoft }]}>
              <View style={[styles.profileAvatar, { backgroundColor: C.primaryStrong }]}>
                <TText style={[styles.profileAvatarText, { color: C.white }]}>{profileInitials}</TText>
              </View>

              <View style={styles.profileHeroContent}>
                <TText testID="profile-name-row" style={[styles.profileName, { color: C.text }]}>
                  {fullName}
                </TText>
                <TText testID="profile-role-row" style={[styles.profileRole, { color: C.mutedText }]}>
                  {profileRoleLabel}
                </TText>
                <View style={[styles.profileCodeChip, { backgroundColor: C.surface, borderColor: C.border }]}>
                  <MaterialIcons name="badge" size={14} color={C.primaryStrong} />
                  <TText testID="profile-employee-code-row" style={[styles.profileCodeChipText, { color: C.primaryStrong }]}>
                    {employeeData?.employee_code || "—"}
                  </TText>
                </View>
              </View>
            </View>

            <View testID="profile-divider" style={[styles.profileDivider, { backgroundColor: C.border }]} />

            <View style={[styles.profileSectionCard, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
              <TText style={[styles.profileSectionTitle, { color: C.text }]}>Contact Details</TText>
              <ProfileRow testID="profile-email-row" icon="email" label="Email" value={employeeData?.email || "—"} />
              <ProfileRow testID="profile-phone-row" icon="call" label="Phone" value={employeeData?.phone_number || "—"} />
            </View>

            <View style={[styles.profileSectionCard, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
              <View style={styles.profileSectionHeader}>
                <TText testID="profile-text-size-title" style={[styles.profileSectionTitle, { color: C.text }]}>Text Size</TText>
                <TText
                  testID="text-size-percentage"
                  style={[styles.sliderValueChip, { color: C.primaryStrong, backgroundColor: C.primarySoft }]}
                >
                  {Math.round(fontScale * 100)}%
                </TText>
              </View>
              <TextSizeSlider value={fontScale} onChange={setFontScale} />
              <TText style={[styles.sliderHint, { color: C.mutedText }]}>
                Adjust the app text to what feels most comfortable.
              </TText>
            </View>

            <View style={[styles.profileSectionCard, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
              <View style={styles.profileSectionHeader}>
                <TText style={[styles.profileSectionTitle, { color: C.text }]}>Appearance</TText>
                <TText style={[styles.sliderHint, { marginTop: 0, color: C.mutedText }]}>
                  {activeThemeLabel}
                </TText>
              </View>

              <View style={styles.themeModeRow}>
                {(["light", "dark", "custom"] as const).map((option) => {
                  const active = pref === option;
                  return (
                    <TouchableOpacity
                      key={option}
                      testID={`theme-option-${option}`}
                      activeOpacity={0.85}
                      onPress={() => void setPref(option)}
                      style={[
                        styles.themeModeBtn,
                        {
                          backgroundColor: active ? C.primarySoft : C.surface,
                          borderColor: active ? C.primaryStrong : C.border,
                        },
                      ]}
                    >
                      <TText style={{ color: active ? C.primaryStrong : C.text, fontWeight: "800", fontSize: 12 }}>
                        {option[0].toUpperCase() + option.slice(1)}
                      </TText>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {pref === "custom" ? (
                <View style={styles.themeScheduleWrap}>
                  <TouchableOpacity
                    testID="theme-custom-dark-start"
                    activeOpacity={0.85}
                    onPress={() => setTimePickerTarget("dark")}
                    style={[styles.themeScheduleBtn, { backgroundColor: C.surface, borderColor: C.border }]}
                  >
                    <TText style={[styles.themeScheduleLabel, { color: C.mutedText }]}>Dark Starts</TText>
                    <TText style={[styles.themeScheduleValue, { color: C.text }]}>
                      {formatTimeLabel(schedule.darkStartMinutes)}
                    </TText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    testID="theme-custom-light-start"
                    activeOpacity={0.85}
                    onPress={() => setTimePickerTarget("light")}
                    style={[styles.themeScheduleBtn, { backgroundColor: C.surface, borderColor: C.border }]}
                  >
                    <TText style={[styles.themeScheduleLabel, { color: C.mutedText }]}>Light Starts</TText>
                    <TText style={[styles.themeScheduleValue, { color: C.text }]}>
                      {formatTimeLabel(schedule.lightStartMinutes)}
                    </TText>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            <View style={styles.profileFooter}>
              <View
                testID="profile-version-row"
                style={[styles.profileVersionRow, { backgroundColor: C.successSoft }]}
              >
                <MaterialIcons name="verified" size={18} color={C.success} />
                <TText style={[styles.profileVersionText, { color: C.success }]}>Version {currentAppVersion}</TText>
              </View>

              <TouchableOpacity
                testID="logout-button"
                style={[styles.logoutBtn, { backgroundColor: C.primaryStrong }]}
                activeOpacity={0.85}
                onPress={requestLogout}
              >
                <MaterialIcons name="logout" size={18} color={C.white} />
                <TText style={[styles.logoutBtnText, { color: C.white }]}>Logout</TText>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {timePickerTarget && (
        Platform.OS === "web" ? (
          <Modal transparent visible animationType="fade" onRequestClose={() => setTimePickerTarget(null)}>
            <Pressable
              style={[styles.confirmOverlay, { backgroundColor: C.overlay }]}
              onPress={() => setTimePickerTarget(null)}
            >
              <Pressable
                style={[styles.confirmCard, { backgroundColor: C.surface }]}
                onPress={(e: any) => e?.stopPropagation?.()}
              >
                <TText style={[styles.confirmTitle, { color: C.text }]}>
                  {timePickerTarget === "dark" ? "Set dark start time" : "Set light start time"}
                </TText>
                <View style={[styles.timeInputShell, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
                  <input
                    type="time"
                    value={`${String(Math.floor((timePickerTarget === "dark" ? schedule.darkStartMinutes : schedule.lightStartMinutes) / 60)).padStart(2, "0")}:${String((timePickerTarget === "dark" ? schedule.darkStartMinutes : schedule.lightStartMinutes) % 60).padStart(2, "0")}`}
                    onChange={(e: any) => {
                      const value = String((e.target as HTMLInputElement).value || "");
                      const [hours, minutes] = value.split(":").map((part) => Number(part));
                      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return;
                      const nextMinutes = hours * 60 + minutes;
                      void setSchedule({
                        darkStartMinutes: timePickerTarget === "dark" ? nextMinutes : schedule.darkStartMinutes,
                        lightStartMinutes: timePickerTarget === "light" ? nextMinutes : schedule.lightStartMinutes,
                      });
                    }}
                    style={{ ...(styles.webTimeInput as any), color: C.text }}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.confirmBtn, styles.confirmBtnGhost, { backgroundColor: C.surface, borderColor: C.borderStrong, alignSelf: "flex-end", marginTop: 12 }]}
                  onPress={() => setTimePickerTarget(null)}
                >
                  <TText style={[styles.confirmBtnGhostText, { color: C.text }]}>Done</TText>
                </TouchableOpacity>
              </Pressable>
            </Pressable>
          </Modal>
        ) : (
          <DateTimePicker
            value={minutesToDate(timePickerTarget === "dark" ? schedule.darkStartMinutes : schedule.lightStartMinutes)}
            mode="time"
            display="default"
            onChange={(_event, selectedDate) => {
              if (Platform.OS !== "ios") setTimePickerTarget(null);
              if (!selectedDate) return;
              const nextMinutes = dateToMinutes(selectedDate);
              void setSchedule({
                darkStartMinutes: timePickerTarget === "dark" ? nextMinutes : schedule.darkStartMinutes,
                lightStartMinutes: timePickerTarget === "light" ? nextMinutes : schedule.lightStartMinutes,
              });
            }}
          />
        )
      )}

      <Modal
        transparent
        visible={logoutConfirmVisible}
        animationType="fade"
        onRequestClose={() => setLogoutConfirmVisible(false)}
      >
        <Pressable
          testID="logout-confirm-overlay"
          style={[styles.confirmOverlay, { backgroundColor: C.overlay }]}
          onPress={() => (logoutBusy ? null : setLogoutConfirmVisible(false))}
        >
          <Pressable
            testID="logout-confirm-card"
            style={[styles.confirmCard, { backgroundColor: C.surface }]}
            onPress={(e: any) => e?.stopPropagation?.()}
          >
            <View testID="logout-confirm-header" style={styles.confirmHeader}>
              <View style={[styles.confirmIconCircle, { backgroundColor: C.primarySoft }]}>
                <MaterialIcons name="logout" size={18} color={C.primaryStrong} />
              </View>
              <TText style={[styles.confirmTitle, { color: C.text }]}>Logout</TText>
            </View>

            <TText testID="logout-confirm-message" style={[styles.confirmMsg, { color: C.mutedText }]}>
              Are you sure you want to logout?
            </TText>

            <View testID="logout-confirm-actions" style={styles.confirmActions}>
              <TouchableOpacity
                testID="logout-cancel-button"
                style={[styles.confirmBtn, styles.confirmBtnGhost, { backgroundColor: C.surface, borderColor: C.borderStrong }]}
                activeOpacity={0.85}
                disabled={logoutBusy}
                onPress={() => setLogoutConfirmVisible(false)}
              >
                <TText style={[styles.confirmBtnGhostText, { color: C.text }]}>Cancel</TText>
              </TouchableOpacity>

              <TouchableOpacity
                testID="logout-confirm-button"
                style={[styles.confirmBtn, styles.confirmBtnDanger]}
                activeOpacity={0.85}
                disabled={logoutBusy}
                onPress={doLogout}
              >
                {logoutBusy ? (
                  <ActivityIndicator testID="logout-confirm-loading" size="small" color={C.white} />
                ) : (
                  <>
                    <MaterialIcons name="logout" size={18} color={C.white} />
                    <TText style={[styles.confirmBtnDangerText, { color: C.white }]}>Logout</TText>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F6F7FB" },

  header: {
    height: 56,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  headerLeft: {
    width: 74,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  headerLogo: { width: 68, height: 40 },
  headerCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRight: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", minWidth: 90 },
  headerTitle: { fontSize: 15, fontWeight: "800", color: "#111827" },

  page: { flex: 1, backgroundColor: "#F6F7FB" },
  pageContent: { padding: 14 },

  gridRow: { flexDirection: "row", gap: 12, marginBottom: 6 },
  gridRowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 6,
    justifyContent: "space-between",
  },

  metricCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  metricCardThird: { flexBasis: "31%", flexGrow: 1 },

  metricTitle: { color: "#6b7280", fontSize: 10, fontWeight: "500" },
  metricValue: { color: "#111827", fontSize: 20, fontWeight: "700", marginTop: 6 },

  salesHeroCard: {
    borderRadius: 18,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  salesHeroTextWrap: { flex: 1, paddingRight: 12 },
  salesHeroEyebrow: { fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.5 },
  salesHeroTitle: { fontSize: 22, fontWeight: "900", marginTop: 6 },
  salesHeroSubtitle: { fontSize: 13, fontWeight: "600", lineHeight: 20, marginTop: 8 },
  salesHeroBadge: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  salesQuickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 12,
    justifyContent: "space-between",
  },
  salesQuickCard: {
    width: "48%",
    borderRadius: 16,
    padding: 14,
    minHeight: 148,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  salesQuickIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  salesQuickTitle: { fontSize: 14, fontWeight: "800" },
  salesQuickText: { fontSize: 12, fontWeight: "600", lineHeight: 18, marginTop: 8 },
  salesSectionHeader: {
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  salesSectionTitle: { fontSize: 18, fontWeight: "900" },
  salesSectionSubtitle: { fontSize: 12, fontWeight: "600", marginTop: 6, lineHeight: 18 },
  salesAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginLeft: 12,
  },
  salesAddBtnText: { fontSize: 12, fontWeight: "800" },
  salesEmptyCard: {
    marginTop: 12,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  salesEmptyTitle: { fontSize: 16, fontWeight: "900" },
  salesEmptyText: { fontSize: 12, fontWeight: "600", marginTop: 8, textAlign: "center", lineHeight: 18 },
  salesListCard: {
    marginTop: 12,
    borderRadius: 16,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  salesListTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  salesListName: { fontSize: 15, fontWeight: "900" },
  salesListMeta: { fontSize: 12, fontWeight: "600", marginTop: 4 },
  salesStageChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  salesStageChipText: { fontSize: 11, fontWeight: "800" },
  salesLeadInfoRow: { flexDirection: "row", gap: 12, marginTop: 14 },
  salesLeadInfoItem: { flex: 1 },
  salesLeadInfoLabel: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  salesLeadInfoValue: { fontSize: 13, fontWeight: "700", marginTop: 4 },
  salesClientNote: { fontSize: 12, fontWeight: "600", lineHeight: 18, marginTop: 12 },
  salesModalTitle: { fontSize: 18, fontWeight: "900", marginBottom: 12 },
  salesFormGroup: { marginBottom: 14 },
  salesInputLabel: { fontSize: 11, fontWeight: "800", marginBottom: 8, textTransform: "uppercase" },
  salesInput: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  salesTextarea: { minHeight: 96 },
  salesDetailHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: 14 },
  salesDetailCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  salesDetailActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  salesActionBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  salesActionBtnText: { fontSize: 12, fontWeight: "800" },

  circleIcon: { height: 32, width: 32, borderRadius: 999, alignItems: "center", justifyContent: "center" },

  bottomNav: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingTop: 6,
  },
  navBtn: { alignItems: "center", justifyContent: "center", width: 66 },
  navLabel: { fontSize: 11, fontWeight: "800", marginTop: 2 },

  profileOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.22)",
    justifyContent: "flex-end",
    alignItems: "stretch",
  },

  profileCard: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    shadowColor: "#0f172a",
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.10)",
  },
  profileSheetHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(100, 116, 139, 0.35)",
    marginBottom: 12,
  },
  profileHero: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eef4ff",
    borderRadius: 20,
    padding: 14,
  },
  profileAvatar: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#1d4ed8",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    shadowColor: "#1d4ed8",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  profileAvatarText: { color: "#fff", fontSize: 18, fontWeight: "900" },
  profileHeroContent: { flex: 1 },
  profileName: { fontSize: 16, fontWeight: "900", color: "#0f172a" },
  profileRole: { fontSize: 12, fontWeight: "700", color: "#475569", marginTop: 3 },
  profileCodeChip: {
    alignSelf: "flex-start",
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(29, 78, 216, 0.12)",
  },
  profileCodeChipText: { fontSize: 11, fontWeight: "800", color: "#1e3a8a" },
  profileDivider: { height: 1, backgroundColor: "rgba(148, 163, 184, 0.22)", marginVertical: 14 },
  profileSectionCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.16)",
    marginBottom: 12,
  },
  profileSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  profileSectionTitle: { fontSize: 11, fontWeight: "900", color: "#0f172a", letterSpacing: 0.2 },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  profileIconBox: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(37, 99, 235, 0.10)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  profileTextWrap: { flex: 1 },
  profileLabel: { fontSize: 10, fontWeight: "800", color: "#64748b", marginBottom: 2, textTransform: "uppercase" },
  profileText: { flexShrink: 1, fontSize: 13, fontWeight: "700", color: "#111827" },

  profileVersionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#f0fdf4",
  },
  profileVersionText: { fontSize: 11, fontWeight: "800", color: "#166534" },

  textSizeRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  textSizeA: { fontSize: 12, fontWeight: "900", color: "#64748b" },
  textSizeABig: { fontSize: 16, fontWeight: "900", color: "#0f172a" },
  sliderShell: { flex: 1, height: 30, justifyContent: "center" },
  sliderLine: {
    position: "absolute",
    left: 2,
    right: 2,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(37, 99, 235, 0.12)",
  },
  tickRow: {
    position: "absolute",
    left: 2,
    right: 2,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tick: { width: 2, height: 10, borderRadius: 2, backgroundColor: "rgba(29, 78, 216, 0.22)" },
  nativeSlider: { width: "100%", height: 30 },

  sliderValueChip: {
    fontSize: 11,
    fontWeight: "900",
    color: "#1d4ed8",
    backgroundColor: "rgba(37, 99, 235, 0.12)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  sliderHint: { marginTop: 8, fontSize: 11, color: "#64748b", fontWeight: "600" },
  themeModeRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  themeScheduleWrap: { flexDirection: "row", gap: 10, marginTop: 10 },
  themeModeBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  themeScheduleBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "center",
  },
  themeScheduleLabel: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", marginBottom: 4 },
  themeScheduleValue: { fontSize: 13, fontWeight: "800" },
  timeInputShell: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 12,
    marginTop: 12,
  },
  webTimeInput: {
    width: "100%",
    borderWidth: 0,
    backgroundColor: "transparent",
    fontSize: 16,
    padding: 0,
  },

  profileFooter: { marginTop: 2, gap: 10 },
  logoutBtn: {
    height: 42,
    borderRadius: 14,
    backgroundColor: "#1d4ed8",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  logoutBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },

  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  confirmCard: { width: 340, maxWidth: "92%", backgroundColor: "#fff", borderRadius: 16, padding: 14 },
  confirmHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  confirmIconCircle: {
    height: 32,
    width: 32,
    borderRadius: 999,
    backgroundColor: "rgba(37, 99, 235, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmTitle: { fontSize: 14, fontWeight: "900", color: "#111827" },
  confirmMsg: { fontSize: 12, fontWeight: "600", color: "#374151", marginTop: 2, marginBottom: 14 },
  confirmActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  confirmBtn: {
    height: 36,
    borderRadius: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  confirmBtnGhost: { backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(0,0,0,0.12)" },
  confirmBtnGhostText: { fontSize: 12, fontWeight: "800", color: "#111827" },
  confirmBtnDanger: { backgroundColor: "#ef4444" },
  confirmBtnDangerText: { fontSize: 12, fontWeight: "800", color: "#fff" },
});

export default HomeScreen;
