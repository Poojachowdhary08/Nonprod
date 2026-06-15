import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
// app/ProjectsScreen.tsx
import { useSmartSearch } from "../hooks/useSmartSearch";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, TouchableOpacity, StyleSheet, FlatList, Dimensions, ActivityIndicator, TextInput, RefreshControl, Alert, Platform, Pressable, Animated, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Icon from "react-native-vector-icons/FontAwesome";
import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { Href } from "expo-router";

import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  trackScreen,
  trackUI,
  trackNetwork,
  updateDynamicContext,
  clearDynamicContext,
  startScreenTimer,
} from "../utils/telemetry";
import { authenticatedFetch } from "../utils/auth";
import { useFontScale } from "@/context/FontScaleContext";
import TText from "@/components/TText";

// -------------------- CONFIG --------------------
const API_BASE = `${APP_API_BASE_URL}`; // ✅ PROD
const PROJECTS_CACHE_PREFIX = "projects:"; // projects:<employeeCode>
const PROJECTS_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 3; // 3 days
const PROPERTIES_CACHE_PREFIX = "properties:"; // properties:<projectId>:<employeeCode>
const PROPERTIES_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 3; // 3 days

const PLACEHOLDER_BOX = "#E8EEF9";

// -------------------- TYPES --------------------
type Project = {
  project_id: string;
  project_name?: string;
  project_manager?: string;
  project_location_city?: string;
  project_status?: string;
  project_location?: string;
};

type CacheShape = {
  data: Project[];
  lastSyncedAt: number;
};

type Property = {
  property_id: string;
  name?: string;
  property_type?: string;
  status?: string;
};

type PropertiesCacheShape = {
  data: Property[];
  lastSyncedAt: number;
};

type EmployeeShape = {
  first_name?: string;
  last_name?: string;
  job_title?: string;
  email?: string;
  phone_number?: string;
  employee_code?: string;
};

// -------------------- FILTERS --------------------
type StatusFilter =
  | "ALL"
  | "PLANNING"
  | "ONGOING"
  | "IN_PROGRESS"
  | "PENDING"
  | "COMPLETED";

const normalizeStatus = (s?: string) => (s || "").trim().toLowerCase();

const toFilterKey = (raw?: string): StatusFilter => {
  const s = normalizeStatus(raw);
  if (s === "planning") return "PLANNING";
  if (s === "ongoing") return "ONGOING";
  if (s === "in progress" || s === "in_progress" || s === "inprogress") return "IN_PROGRESS";
  if (s === "pending") return "PENDING";
  if (s === "completed") return "COMPLETED";
  return "ALL";
};

const statusColors = (status?: string) => {
  switch (normalizeStatus(status)) {
    case "planning":
      return { bg: "#E7E7FF", text: "#4F46E5", border: "#D0CEFF" };
    case "pending":
      return { bg: "#FFF7DD", text: "#B45309", border: "#FDE68A" };
    case "ongoing":
      return { bg: "#E0F7FA", text: "#006064", border: "#B2EBF2" };
    case "in progress":
      return { bg: "#FFF0D9", text: "#B45309", border: "#FCD34D" };
    case "completed":
      return { bg: "#DFF5E3", text: "#166534", border: "#BBF7D0" };
    default:
      return { bg: "#EEF2F7", text: "#374151", border: "#E5E7EB" };
  }
};

const ProjectsScreen = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
  const employeeCode = (params?.employee_code as string) || "";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isOffline, setIsOffline] = useState(false);
  const [isUsingCache, setIsUsingCache] = useState(false);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerX = useRef(new Animated.Value(-320)).current;
  const [employeeData, setEmployeeData] = useState<EmployeeShape | null>(null);

  // Filter modal
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const didInitialSync = useRef(false);
  const lastNetRef = useRef<{ offline?: boolean; type?: string | null }>({ offline: undefined, type: null });

  // ---------- Cache Keys ----------
  const projectsCacheKey = `${PROJECTS_CACHE_PREFIX}${employeeCode}`;

  const loadEmployeeFromCache = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem("cached_employee");
      if (!raw) return;
      setEmployeeData(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadEmployeeFromCache();
  }, [loadEmployeeFromCache]);

  // ---------- Drawer handlers ----------
  const openDrawer = useCallback(() => {
    setDrawerOpen(true);
    trackUI({ screen: "ProjectsScreen", element: "drawer", action: "open", extra: {} });

    Animated.timing(drawerX, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [drawerX]);

  const closeDrawer = useCallback(() => {
    Animated.timing(drawerX, {
      toValue: -320,
      duration: 200,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setDrawerOpen(false);
    });
  }, [drawerX]);

  // ---------- Cache ----------
  const loadProjectsFromCache = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(projectsCacheKey);
      if (!raw) return null;

      const parsed: CacheShape = JSON.parse(raw);
      const age = Date.now() - (parsed?.lastSyncedAt || 0);
      const isStale = age > PROJECTS_CACHE_TTL_MS;

      trackUI({
        screen: "ProjectsScreen",
        element: "cache_read",
        action: "hit",
        extra: { projectsCacheKey, count: parsed?.data?.length || 0, isStale },
      });

      return parsed;
    } catch {
      return null;
    }
  }, [projectsCacheKey]);

  const saveProjectsToCache = useCallback(
    async (data: Project[]) => {
      try {
        const payload: CacheShape = { data, lastSyncedAt: Date.now() };
        await AsyncStorage.setItem(projectsCacheKey, JSON.stringify(payload));
        trackUI({
          screen: "ProjectsScreen",
          element: "cache_write",
          action: "success",
          extra: { projectsCacheKey, count: data?.length || 0 },
        });
      } catch {
        // ignore
      }
    },
    [projectsCacheKey]
  );

  // ✅ IMPORTANT: Prefetch properties API (DO NOT REMOVE)
  const prefetchPropertiesForProject = useCallback(
    async (projectId: string) => {
      if (!projectId || !employeeCode) return;

      const cacheKey = `${PROPERTIES_CACHE_PREFIX}${projectId}:${employeeCode}`;
      const urlPath = `/employee-properties/${projectId}/${employeeCode}`;
      const url = `${API_BASE}${urlPath}`;
      const t0 = Date.now();

      try {
        trackUI({
          screen: "ProjectsScreen",
          element: "prefetch_employee_properties",
          action: "submit",
          extra: { urlPath, projectId, employeeCode },
        });

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        const res = await authenticatedFetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (!res.ok) {
          trackNetwork({
            url: urlPath,
            method: "GET",
            status: res.status,
            ok: false,
            durationMs: Date.now() - t0,
            extra: { projectId, employeeCode },
          });
          return;
        }

        const json = await res.json();
        const list: Property[] = Array.isArray(json?.properties)
          ? json.properties
          : Array.isArray(json)
          ? json
          : [];

        trackNetwork({
          url: urlPath,
          method: "GET",
          status: res.status,
          ok: true,
          durationMs: Date.now() - t0,
          extra: { projectId, employeeCode, count: list.length },
        });

        const payload: PropertiesCacheShape = { data: list, lastSyncedAt: Date.now() };
        await AsyncStorage.setItem(cacheKey, JSON.stringify(payload));

        trackUI({
          screen: "ProjectsScreen",
          element: "prefetch_employee_properties",
          action: "cache_write",
          extra: { cacheKey, count: list.length },
        });
      } catch (e: any) {
        trackUI({
          screen: "ProjectsScreen",
          element: "prefetch_employee_properties",
          action: "error",
          extra: { projectId, employeeCode, message: String(e?.message || e) },
        });
      }
    },
    [employeeCode]
  );

  // ---------- Network ----------
  const fetchProjectsOnline = useCallback(async (): Promise<Project[] | null> => {
    if (!employeeCode) return [];

    const urlPath = `/employee-project/${employeeCode}`;
    const url = `${API_BASE}${urlPath}`;
    const t0 = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const res = await authenticatedFetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (res.status === 404) {
        trackNetwork({
          url: urlPath,
          method: "GET",
          status: 404,
          ok: true,
          durationMs: Date.now() - t0,
          extra: { employeeCode, count: 0 },
        });
        return [];
      }

      if (!res.ok) {
        trackNetwork({
          url: urlPath,
          method: "GET",
          status: res.status,
          ok: false,
          durationMs: Date.now() - t0,
          extra: { employeeCode },
        });
        return null;
      }

      const json = await res.json();
      const list: Project[] = Array.isArray(json?.projects) ? json.projects : Array.isArray(json) ? json : [];

      trackNetwork({
        url: urlPath,
        method: "GET",
        status: res.status,
        ok: true,
        durationMs: Date.now() - t0,
        extra: { employeeCode, count: list.length },
      });

      return list;
    } catch (e: any) {
      trackNetwork({
        url: urlPath,
        method: "GET",
        status: 0,
        ok: false,
        durationMs: Date.now() - t0,
        extra: { employeeCode, message: String(e?.message || e) },
      });
      return null;
    }
  }, [employeeCode]);

  const syncNow = useCallback(
    async (opts?: { showErrors?: boolean; reason?: string }) => {
      const reason = opts?.reason || "unknown";

      trackUI({
        screen: "ProjectsScreen",
        element: "syncNow",
        action: "submit",
        extra: { reason, employeeCode, isOffline },
      });

      if (!employeeCode) {
        setProjects([]);
        setLoading(false);
        setIsUsingCache(false);
        return;
      }

      if (!isOffline) setLoading(true);

      // Offline => cache only
      if (isOffline) {
        const cached = await loadProjectsFromCache();
        if (cached?.data) {
          setProjects(cached.data);
          setIsUsingCache(true);
        } else {
          setProjects([]);
          setIsUsingCache(false);
        }
        setLoading(false);
        return;
      }

      // Online => network first
      const online = await fetchProjectsOnline();
      if (online !== null) {
        setProjects(online);
        setIsUsingCache(false);
        await saveProjectsToCache(online);
        setLoading(false);
        return;
      }

      // Network failed => cache fallback
      const cached = await loadProjectsFromCache();
      if (cached?.data) {
        setProjects(cached.data);
        setIsUsingCache(true);
      } else {
        setProjects([]);
        setIsUsingCache(false);
        if (opts?.showErrors) {
          Alert.alert("Unable to load projects", "No internet and no cached data available.");
        }
      }
      setLoading(false);
    },
    [employeeCode, isOffline, fetchProjectsOnline, loadProjectsFromCache, saveProjectsToCache]
  );

  // ---------- Effects ----------
  useEffect(() => {
    updateDynamicContext({
      screen: "ProjectsScreen",
      employeeCode: employeeCode || null,
      env: "prod",
    });

    trackScreen("ProjectsScreen", {
      platform: Platform.OS,
      employeeCode: employeeCode || null,
    });

    const stop = startScreenTimer("ProjectsScreen", { employeeCode: employeeCode || null });
    return () => {
      stop?.();
      clearDynamicContext();
    };
  }, [employeeCode]);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state: NetInfoState) => {
      const offline = !(state.isConnected && state.isInternetReachable !== false);
      setIsOffline(offline);

      const type = (state as any)?.type || null;
      const prevOffline = lastNetRef.current.offline;
      const prevType = lastNetRef.current.type;

      if (prevOffline !== offline || prevType !== type) {
        lastNetRef.current = { offline, type };
        trackUI({
          screen: "ProjectsScreen",
          element: "netinfo",
          action: "change",
          extra: {
            offline,
            type,
            isConnected: state.isConnected,
            isInternetReachable: state.isInternetReachable,
          },
        });
      }

      if (prevOffline === true && offline === false) {
        syncNow({ reason: "back_online" });
      }
    });

    return () => unsub();
  }, [syncNow]);

  useEffect(() => {
    if (didInitialSync.current) return;
    didInitialSync.current = true;
    (async () => {
      await syncNow({ reason: "initial_mount" });
    })();
  }, [syncNow]);

  // ---------- Search ----------
  const smartFilteredProjects = useSmartSearch({
    data: projects,
    query: searchQuery,
    keys: ["project_name", "project_manager", "project_location_city", "project_id"],
  });

  // ---------- Filter apply ----------
  const filteredProjects = useMemo(() => {
    if (statusFilter === "ALL") return smartFilteredProjects;
    return smartFilteredProjects.filter((p) => toFilterKey(p.project_status) === statusFilter);
  }, [smartFilteredProjects, statusFilter]);

  const countsByFilter = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      ALL: projects.length,
      PLANNING: 0,
      ONGOING: 0,
      IN_PROGRESS: 0,
      PENDING: 0,
      COMPLETED: 0,
    };

    projects.forEach((p) => {
      const k = toFilterKey(p.project_status);
      if (k !== "ALL") counts[k] = (counts[k] || 0) + 1;
    });
    return counts;
  }, [projects]);

  const filterOptions: { key: StatusFilter; label: string }[] = [
    { key: "ALL", label: `All (${countsByFilter.ALL})` },
    { key: "PENDING", label: `Pending (${countsByFilter.PENDING})` },
    { key: "IN_PROGRESS", label: `In Progress (${countsByFilter.IN_PROGRESS})` },
    { key: "ONGOING", label: `Ongoing (${countsByFilter.ONGOING})` },
    { key: "COMPLETED", label: `Completed (${countsByFilter.COMPLETED})` },
    { key: "PLANNING", label: `Planning (${countsByFilter.PLANNING})` },
  ];

  const onRefresh = useCallback(async () => {
    if (isOffline) return;
    setRefreshing(true);
    await syncNow({ showErrors: true, reason: "pull_to_refresh" });
    setRefreshing(false);
  }, [syncNow, isOffline]);

  // helper: close drawer before navigating (NO params)
  const go = useCallback(
    (href: Href) => {
      closeDrawer();
      router.push(href);
    },
    [closeDrawer, router]
  );

  const drawerItems = useMemo(() => {
    return [
      { key: "home", label: "Home", icon: "home", onPress: () => go("/HomeScreen") },
      { key: "projects", label: "Projects", icon: "th-large", onPress: () => go("/ProjectsScreen") },
      { key: "tasks", label: "My Tasks", icon: "check-circle", onPress: () => go("/TaskList") },
      {
        key: "inventory",
        label: "Inventory",
        icon: "archive",
        onPress: () =>
          go({
            pathname: "/RequestedInventory",
            params: {
              employee_code: employeeData?.employee_code || employeeCode || "",
              phone_number:
                employeeData?.phone_number ||
                (typeof params.phone_number === "string" ? params.phone_number : ""),
            },
          }),
      },
      { key: "stock", label: "Stock Manager", icon: "user-plus", onPress: () => go("/StockManager") },
      { key: "manpower", label: "Man Power", icon: "users", onPress: () => go("/ManPowerList") },
      { key: "review", label: "Review Engineer", icon: "money", onPress: () => go("/ReviewEngineer") },
      { key: "client", label: "Property Chats", icon: "building", onPress: () => go("/PropertiesChatList") },
    ];
  }, [go, employeeData?.employee_code, employeeData?.phone_number, employeeCode, params.phone_number]);

  const renderProjectCard = ({ item }: { item: Project }) => {
    const c = statusColors(item.project_status);
    return (
      <TouchableOpacity
        style={styles.projectCard}
        activeOpacity={0.9}
        onPress={() => {
          trackUI({
            screen: "ProjectsScreen",
            element: "project_card",
            action: "click",
            extra: { project_id: item.project_id, status: item.project_status || null },
          });

          // ✅ DO NOT REMOVE - prefetch properties for next screen
          prefetchPropertiesForProject(item.project_id);

          router.push({
            pathname: "/PropertiesScreen",
            params: {
              projectId: item.project_id,
              projectLocation: item.project_location_city || item.project_location,
              ...(params as any),
            },
          } as any);
        }}
      >
        {/* Left thumbnail box */}
        <View style={styles.thumbBox} />

        {/* Middle content */}
        <View style={{ flex: 1 }}>
          <TText style={styles.projectIdText} numberOfLines={1}>
            {item.project_id}
          </TText>
          <TText style={styles.projectNameText} numberOfLines={1}>
            {item.project_name || "—"}
          </TText>

          <View style={styles.metaLine}>
            <Ionicons name="person-outline" size={14} color="#9CA3AF" />
            <TText style={styles.metaText} numberOfLines={1}>
              {item.project_manager || "N/A"}
            </TText>

            <View style={styles.metaDivider} />

            <Ionicons name="location-outline" size={14} color="#9CA3AF" />
            <TText style={styles.metaText} numberOfLines={1}>
              {item.project_location_city || item.project_location || "N/A"}
            </TText>
          </View>
        </View>

        {/* Right status chip */}
        <View style={[styles.statusChip, { backgroundColor: c.bg, borderColor: c.border }]}>
          <TText style={[styles.statusChipText, { color: c.text }]}>
            {String(item.project_status || "PLANNING").toUpperCase()}
          </TText>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6C63FF" />
        <TText style={styles.loadingText}>Loading projects…</TText>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="projects-screen-root">
      {/* Header (menu + title + home) */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            trackUI({ screen: "ProjectsScreen", element: "header_menu", action: "click", extra: {} });
            openDrawer();
          }}
          style={styles.headerIconBtn}
        >
          <Ionicons name="menu" size={24} color="#111827" />
        </TouchableOpacity>

        <TText style={styles.headerTitle}>Projects</TText>

        {/* ✅ Home icon (replaces notification) */}
        <TouchableOpacity
          onPress={() => {
            trackUI({ screen: "ProjectsScreen", element: "header_home", action: "click", extra: {} });
            router.push("/HomeScreen" as any);
          }}
          style={styles.headerIconBtn}
        >
          <Ionicons name="home-outline" size={22} color="#111827" />
        </TouchableOpacity>
      </View>

      {/* Search row + filter icon button */}
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#9CA3AF" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search"
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
          {!!searchQuery && (
            <TouchableOpacity onPress={() => setSearchQuery("")} style={{ padding: 2 }}>
              <Ionicons name="close-circle" size={18} color="#CBD5E1" />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.filterIconBtn}
          onPress={() => {
            trackUI({ screen: "ProjectsScreen", element: "filter_open", action: "click", extra: { current: statusFilter } });
            setFilterOpen(true);
          }}
        >
          <Ionicons name="filter-outline" size={20} color="#111827" />
        </TouchableOpacity>
      </View>

      {/* List */}
      <FlatList
        data={filteredProjects}
        renderItem={renderProjectCard}
        keyExtractor={(item: any) => item.project_id}
        contentContainerStyle={styles.listContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} enabled={!isOffline} />}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <TText style={styles.emptyTitle}>No projects found</TText>
            <TText style={styles.emptyText}>Try searching something else.</TText>
          </View>
        }
      />

      {/* -------- Filter Modal (small like screenshot) -------- */}
      <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setFilterOpen(false)} />

        <View style={styles.modalCenter}>
          <View style={styles.sheetWrap}>
            {filterOptions.map((opt) => {
              const active = opt.key === statusFilter;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={styles.sheetRow}
                  activeOpacity={0.85}
                  onPress={() => {
                    setStatusFilter(opt.key);
                    setFilterOpen(false);
                    trackUI({ screen: "ProjectsScreen", element: "filter_select", action: "click", extra: { selected: opt.key } });
                  }}
                >
                  <TText style={[styles.sheetText, active ? styles.sheetTextActive : null]}>{opt.label}</TText>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={styles.cancelBtn} onPress={() => setFilterOpen(false)} activeOpacity={0.9}>
            <TText style={styles.cancelText}>Cancel</TText>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Drawer overlay */}
      {drawerOpen && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={styles.drawerBackdrop} onPress={closeDrawer} />
          <Animated.View style={[styles.drawer, { transform: [{ translateX: drawerX }] }]}>
            <View style={styles.drawerProfile}>
              <View style={styles.avatar}>
                <TText style={{ fontWeight: "900", color: "#111827", fontSize: 14 }}>
                  {(employeeData?.first_name?.[0] ?? "U").toUpperCase()}
                </TText>
              </View>

              <View style={{ flex: 1 }}>
                <TText style={styles.profileName} numberOfLines={1}>
                  {employeeData?.first_name ?? "User"} {employeeData?.last_name ?? ""}
                </TText>
                <TText style={styles.profileRole} numberOfLines={1}>
                  {employeeData?.job_title ?? "—"}
                </TText>
              </View>

              <TouchableOpacity onPress={closeDrawer} style={{ padding: 6 }}>
                <MaterialIcons name="close" size={20} color="#111827" />
              </TouchableOpacity>
            </View>

            <View style={{ paddingTop: 8 }}>
              {drawerItems.map((it) => (
                <TouchableOpacity key={it.key} style={styles.drawerItem} onPress={it.onPress} activeOpacity={0.85}>
                  <Icon name={it.icon as any} size={16} color="#9aa0a6" style={{ width: 26 }} />
                  <TText style={styles.drawerItemText}>{it.label}</TText>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.drawerDivider} />
          </Animated.View>
        </View>
      )}
    </View>
  );
};

export default ProjectsScreen;

// -------------------- STYLES --------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F6F8" },

  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#111827" },
  headerIconBtn: { padding: 6, borderRadius: 999 },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#EEF0F3",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#111827", paddingVertical: 0 },

  filterIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EEF0F3",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },

  listContainer: { paddingHorizontal: 14, paddingBottom: 18 },

  projectCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#EEF0F3",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },

  thumbBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: PLACEHOLDER_BOX,
  },

  projectIdText: {
    fontSize: 12,
    color: "#9CA3AF",
    fontWeight: "700",
    marginBottom: 2,
  },
  projectNameText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 6,
  },

  metaLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: 13, fontWeight: "600", color: "#6B7280", maxWidth: 140 },
  metaDivider: { width: 1, height: 14, backgroundColor: "#E5E7EB", marginHorizontal: 6 },

  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusChipText: { fontSize: 12, fontWeight: "900" },

  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 8 },
  loadingText: { marginTop: 8, fontSize: 14, color: "#6C63FF", fontWeight: "700" },

  emptyWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 40, gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: "#111827" },
  emptyText: { fontSize: 13, color: "#6B7280" },

  // -------- Modal selector (smaller) --------
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.25)" },
  modalCenter: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },

  sheetWrap: {
    width: "72%", // smaller
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  sheetRow: {
    paddingVertical: 10, // smaller
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  sheetText: { fontSize: 13, fontWeight: "400", color: "#111827" },
  sheetTextActive: { fontWeight: "900" },

  cancelBtn: {
    marginTop: 10,
    width: "72%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  cancelText: { fontSize: 13, fontWeight: "500", color: "#111827" },

  // -------- Drawer --------
  drawerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.25)" },
  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 300,
    backgroundColor: "#FFFFFF",
    paddingTop: 16,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 6, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 12,
  },
  drawerProfile: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEF0F3",
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: { fontSize: 14, fontWeight: "600", color: "#111827" },
  profileRole: { marginTop: 2, fontSize: 11, fontWeight: "700", color: "#6B7280" },

  drawerItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  drawerItemText: { fontSize: 13, color: "#111827" },

  drawerDivider: { height: 1, backgroundColor: "#EEF0F3", marginVertical: 10, marginHorizontal: 14 },
});
