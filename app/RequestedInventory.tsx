import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  TextInput,
  Dimensions,
  ActivityIndicator,
  Platform,
  UIManager,
  LayoutAnimation,
  RefreshControl,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import ModalSelector from "@/components/AppModalSelect";
import { useSmartSearch } from "../hooks/useSmartSearch";
import { bus } from "../src/lib/bus";
import { useFocusEffect } from "@react-navigation/native";

import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
// ✅ Telemetry
import {
  trackScreen,
  trackUI,
  trackNetwork,
  updateDynamicContext,
  clearDynamicContext,
  startScreenTimer,
  makeDeltaGuard,
} from "../utils/telemetry";
import { useFontScale } from "@/context/FontScaleContext";
import TText from "@/components/TText";
import { useTheme } from "@/src/theme/ThemeProvider";
import { authenticatedFetch } from "../utils/auth";

type CacheKey = string;

interface InventoryRequest {
  has_children: boolean;
  request_id: string;
  status: string;
  project_name?: string;
  property_name?: string;
  canonical_project_name?: string;
  canonical_property_name?: string;
  engineer_name?: string;
  requested_by_name?: string;
  created_by_name?: string;
  item_name?: string;
  item_type?: string;
  warehouse?: string;
  requested_quantity?: number;
  p_req_id?: string;
  deli_date?: string;
  created_at?: string;
  engineer_id?: string;
  updated_at?: string;

  // ✅ totals from parent API payload
  total_requested?: number;
  total_issued?: number;
  total_returned?: number;
  total_used?: number;
}

const dataCache = new Map<
  CacheKey,
  { list: InventoryRequest[]; hasMore: boolean; nextOffset: number; ts: number }
>();

const PAGE_SIZE = 20;
const BASE_URL = `${APP_API_BASE_URL}`;

const RequestedInventory: React.FC = () => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  const router = useRouter();
  const params = useLocalSearchParams();

  const [numColumns, setNumColumns] = useState<number>(1);

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState("all");

  const [data, setData] = useState<InventoryRequest[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isPaging, setIsPaging] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [nextOffset, setNextOffset] = useState<number>(0);

  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [childData, setChildData] = useState<Record<string, InventoryRequest[]>>({});
  const [loadingChildren, setLoadingChildren] = useState<Record<string, boolean>>({});

  // ✅ animations should be ref (never mutate state objects)
  const rotationAnimRef = useRef<Record<string, Animated.Value>>({});

  const modalSelectorRef = useRef<any>(null);

  const employeeCodeParam = Array.isArray(params.employee_code)
    ? params.employee_code[0]
    : (params.employee_code as string | undefined);

  const cacheKey: CacheKey = useMemo(() => {
    return `requests:${employeeCodeParam ?? "ALL"}:parent_only:true`;
  }, [employeeCodeParam]);

  // avoid stale closure issues for cacheKey inside event handlers
  const cacheKeyRef = useRef(cacheKey);
  useEffect(() => {
    cacheKeyRef.current = cacheKey;
  }, [cacheKey]);

  const lastSyncRef = useRef<string | null>(null);
  const deltaBusy = useRef(false);

  // ✅ Delta guard to avoid UI spam on identical payloads
  const deltaGuardRef = useRef(makeDeltaGuard("RequestedInventory:delta"));

  // ✅ Telemetry: screen view + dynamic context (once)
  useEffect(() => {
    updateDynamicContext({
      screen: "RequestedInventory",
      employeeCode: employeeCodeParam ? String(employeeCodeParam) : "",
    });

    trackScreen("RequestedInventory", {
      has_employee_code: !!employeeCodeParam,
      platform: Platform.OS,
    });

    return () => {
      clearDynamicContext();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Telemetry: track time spent on screen (enter/exit)
  useEffect(() => {
    const stop = startScreenTimer("RequestedInventory", {
      has_employee_code: !!employeeCodeParam,
    });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Telemetry: debounce search typing
  const searchDebounceRef = useRef<any>(null);
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    searchDebounceRef.current = setTimeout(() => {
      const q = (searchQuery || "").trim();
      if (!q) return;

      trackUI({
        screen: "RequestedInventory",
        element: "search_input",
        action: "submit",
        extra: {
          query_len: q.length,
          status_filter: selectedStatus,
        },
      });
    }, 650);

    return () => clearTimeout(searchDebounceRef.current);
  }, [searchQuery, selectedStatus]);

  /** Build the list API */
  const buildListUrl = useCallback(
    (offset: number, limit: number) => {
      const base = employeeCodeParam
        ? `${BASE_URL}/all-requests/${encodeURIComponent(employeeCodeParam)}`
        : `${BASE_URL}/all-requests`;
      return `${base}?parent_only=true&include_remarks=false&limit=${limit}&offset=${offset}`;
    },
    [employeeCodeParam]
  );

  const engineerFrom = useCallback(
    (r: InventoryRequest) =>
      r.engineer_name ||
      r.requested_by_name ||
      r.created_by_name ||
      (params.employee_name as string) ||
      "—",
    [params.employee_name]
  );

  const getStatusColors = (status: string) => {
    const s = (status || "").toLowerCase();
    if (s === "requested")
      return { bg: C.successSoft, text: C.success, border: C.border };
    if (s === "raised")
      return { bg: C.primarySoft, text: C.primaryStrong, border: C.border };
    if (s === "issued")
      return { bg: C.pill, text: C.primaryStrong, border: C.border };
    if (s === "closed")
      return { bg: C.surfaceAlt, text: C.text, border: C.border };
    if (s === "rejected")
      return { bg: C.dangerSoft, text: C.danger, border: C.border };
    if (s === "partially_issued")
      return { bg: C.surfaceAlt, text: C.primaryStrong, border: C.border };
    return { bg: C.surfaceAlt, text: C.text, border: C.border };
  };

  /** Keep lastSync up-to-date */
  useEffect(() => {
    if (!data.length) return;
    const newest = data.reduce((m, r) => {
      const t = new Date((r.updated_at ?? r.created_at) || "").getTime();
      return Number.isFinite(t) ? Math.max(m, t) : m;
    }, 0);
    if (newest) lastSyncRef.current = new Date(newest).toISOString();
  }, [data]);

  /** Bus updates */
  useEffect(() => {
    const patchOne = (evt: { request_id: string; patch: Partial<InventoryRequest> }) => {
      setData((prev) => {
        const next = prev.map((r) =>
          r.request_id === evt.request_id ? { ...r, ...evt.patch } : r
        );

        const ck = cacheKeyRef.current;
        const cached = dataCache.get(ck);
        if (cached) {
          const clist = cached.list.map((r) =>
            r.request_id === evt.request_id ? { ...r, ...evt.patch } : r
          );
          dataCache.set(ck, { ...cached, list: clist, ts: Date.now() });
        }

        return next;
      });

      setChildData((prev) => {
        const out = { ...prev };
        for (const pid of Object.keys(out)) {
          out[pid] = out[pid].map((r) =>
            r.request_id === evt.request_id ? { ...r, ...evt.patch } : r
          );
        }
        return out;
      });

      trackUI({
        screen: "RequestedInventory",
        element: "bus_inventory_updated",
        action: "submit",
        extra: { request_id: evt.request_id },
      });
    };

    const removeOne = (evt: { request_id: string }) => {
      setData((prev) => {
        const next = prev.filter((r) => r.request_id !== evt.request_id);

        const ck = cacheKeyRef.current;
        const cached = dataCache.get(ck);
        if (cached) dataCache.set(ck, { ...cached, list: next, ts: Date.now() });

        return next;
      });

      setChildData((prev) => {
        const out = { ...prev };
        for (const pid of Object.keys(out)) {
          out[pid] = out[pid].filter((r) => r.request_id !== evt.request_id);
        }
        return out;
      });

      trackUI({
        screen: "RequestedInventory",
        element: "bus_inventory_deleted",
        action: "submit",
        extra: { request_id: evt.request_id },
      });
    };

    bus.on("inventory:updated", patchOne);
    bus.on("inventory:deleted", removeOne);
    return () => {
      bus.off("inventory:updated", patchOne);
      bus.off("inventory:deleted", removeOne);
    };
  }, []);

  /** Child fetch */
  const fetchChildRequests = useCallback(async (requestId: string, page = 1, limit = 10) => {
    const t0 = Date.now();

    trackUI({
      screen: "RequestedInventory",
      element: "child_fetch_start",
      action: "submit",
      extra: { parent_request_id: requestId, page, limit },
    });

    setLoadingChildren((p) => ({ ...p, [requestId]: true }));
    try {
      const res = await authenticatedFetch(
        `/request/${encodeURIComponent(requestId)}?page=${page}&limit=${limit}`
      );
      const json = await res.json();

      trackNetwork({
        url: `/request/${String(requestId)}`,
        method: "GET",
        status: res.status,
        ok: res.ok,
        durationMs: Date.now() - t0,
        extra: { page, limit },
      });

      const list = json.requests || json.childRequests || [];
      const safeList: InventoryRequest[] = Array.isArray(list) ? list : [];

      setChildData((prev) => ({
        ...prev,
        [requestId]: [...(prev[requestId] || []), ...safeList],
      }));

      trackUI({
        screen: "RequestedInventory",
        element: "child_fetch_success",
        action: "submit",
        extra: { parent_request_id: requestId, rows: safeList.length },
      });
    } catch (e: any) {
      trackUI({
        screen: "RequestedInventory",
        element: "child_fetch_error",
        action: "submit",
        extra: { parent_request_id: requestId, message: String(e?.message || e) },
      });

      console.error("❌ Error fetching child requests:", e);
    } finally {
      setLoadingChildren((p) => ({ ...p, [requestId]: false }));
    }
  }, []);

  /** Expand toggle */
  const handleToggleExpand = useCallback(
    (requestId: string, hasChildrenFlag: boolean) => {
      if (!hasChildrenFlag) {
        trackUI({
          screen: "RequestedInventory",
          element: "expand_toggle_blocked",
          action: "submit",
          extra: { request_id: requestId, reason: "has_children=false" },
        });
        return;
      }

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

      setExpandedItems((prev) => {
        const isExpanding = !prev[requestId];

        trackUI({
          screen: "RequestedInventory",
          element: "expand_toggle",
          action: "toggle",
          extra: { request_id: requestId, expanding: isExpanding },
        });

        if (!rotationAnimRef.current[requestId]) {
          rotationAnimRef.current[requestId] = new Animated.Value(isExpanding ? 0 : 1);
        }
        Animated.spring(rotationAnimRef.current[requestId], {
          toValue: isExpanding ? 1 : 0,
          useNativeDriver: true,
          friction: 5,
          tension: 80,
        }).start();

        return { ...prev, [requestId]: isExpanding };
      });

      if (!childData[requestId]) fetchChildRequests(requestId);
    },
    [childData, fetchChildRequests]
  );

  /** First page (cache-first) */
  const loadFirstPage = useCallback(async () => {
    const cached = dataCache.get(cacheKey);
    if (cached) {
      setData(cached.list);
      setHasMore(cached.hasMore);
      setNextOffset(cached.nextOffset);
      setIsLoading(false);

      trackUI({
        screen: "RequestedInventory",
        element: "cache_hit",
        action: "submit",
        extra: { rows: cached.list.length, has_more: cached.hasMore },
      });

      return;
    }

    const t0 = Date.now();
    setIsLoading(true);

    try {
      const url = buildListUrl(0, PAGE_SIZE);
      const res = await authenticatedFetch(url);

      trackNetwork({
        url: employeeCodeParam ? `/all-requests/${String(employeeCodeParam)}` : "/all-requests",
        method: "GET",
        status: res.status,
        ok: res.ok,
        durationMs: Date.now() - t0,
        extra: { kind: "first_page", offset: 0, limit: PAGE_SIZE },
      });

      const json = await res.json();
      let list: InventoryRequest[] = Array.isArray(json.requests) ? json.requests : [];

      if (employeeCodeParam)
        list = list.filter((r) => !r.p_req_id && r.engineer_id === employeeCodeParam);
      else list = list.filter((r) => !r.p_req_id);

      const more = list.length === PAGE_SIZE;
      setData(list);
      setHasMore(more);
      setNextOffset(list.length);

      dataCache.set(cacheKey, { list, hasMore: more, nextOffset: list.length, ts: Date.now() });

      trackUI({
        screen: "RequestedInventory",
        element: "first_page_loaded",
        action: "submit",
        extra: { rows: list.length, has_more: more },
      });
    } catch (e: any) {
      trackUI({
        screen: "RequestedInventory",
        element: "first_page_error",
        action: "submit",
        extra: { message: String(e?.message || e) },
      });

      console.error("❌ Error fetching requests:", e);
      setData([]);
      setHasMore(false);
      setNextOffset(0);
    } finally {
      setIsLoading(false);
    }
  }, [cacheKey, buildListUrl, employeeCodeParam]);

  /** Next page */
  const loadNextPage = useCallback(async () => {
    if (isPaging || !hasMore) return;

    trackUI({
      screen: "RequestedInventory",
      element: "paginate",
      action: "submit",
      extra: { next_offset: nextOffset, page_size: PAGE_SIZE },
    });

    const t0 = Date.now();
    setIsPaging(true);

    try {
      const url = buildListUrl(nextOffset, PAGE_SIZE);
      const res = await authenticatedFetch(url);

      trackNetwork({
        url: employeeCodeParam ? `/all-requests/${String(employeeCodeParam)}` : "/all-requests",
        method: "GET",
        status: res.status,
        ok: res.ok,
        durationMs: Date.now() - t0,
        extra: { kind: "next_page", offset: nextOffset, limit: PAGE_SIZE },
      });

      const json = await res.json();
      let page: InventoryRequest[] = Array.isArray(json.requests) ? json.requests : [];

      if (employeeCodeParam)
        page = page.filter((r) => !r.p_req_id && r.engineer_id === employeeCodeParam);
      else page = page.filter((r) => !r.p_req_id);

      const newList = [...data, ...page];
      const more = page.length === PAGE_SIZE;

      setData(newList);
      setHasMore(more);
      setNextOffset(nextOffset + page.length);

      dataCache.set(cacheKey, {
        list: newList,
        hasMore: more,
        nextOffset: nextOffset + page.length,
        ts: Date.now(),
      });
    } catch (e: any) {
      trackUI({
        screen: "RequestedInventory",
        element: "paginate_error",
        action: "submit",
        extra: { message: String(e?.message || e) },
      });

      console.error("❌ Error paging requests:", e);
    } finally {
      setIsPaging(false);
    }
  }, [isPaging, hasMore, buildListUrl, nextOffset, data, cacheKey, employeeCodeParam]);

  /** Refresh */
  const onRefresh = useCallback(async () => {
    trackUI({
      screen: "RequestedInventory",
      element: "pull_to_refresh",
      action: "submit",
      extra: {},
    });

    const t0 = Date.now();
    setRefreshing(true);

    try {
      const url = buildListUrl(0, PAGE_SIZE);
      const res = await authenticatedFetch(url);

      trackNetwork({
        url: employeeCodeParam ? `/all-requests/${String(employeeCodeParam)}` : "/all-requests",
        method: "GET",
        status: res.status,
        ok: res.ok,
        durationMs: Date.now() - t0,
        extra: { kind: "refresh", offset: 0, limit: PAGE_SIZE },
      });

      const json = await res.json();
      let list: InventoryRequest[] = Array.isArray(json.requests) ? json.requests : [];

      if (employeeCodeParam)
        list = list.filter((r) => !r.p_req_id && r.engineer_id === employeeCodeParam);
      else list = list.filter((r) => !r.p_req_id);

      const more = list.length === PAGE_SIZE;

      setData(list);
      setHasMore(more);
      setNextOffset(list.length);

      setExpandedItems({});
      setChildData({});

      dataCache.set(cacheKey, { list, hasMore: more, nextOffset: list.length, ts: Date.now() });

      trackUI({
        screen: "RequestedInventory",
        element: "refresh_done",
        action: "submit",
        extra: { rows: list.length, has_more: more },
      });
    } catch (e: any) {
      trackUI({
        screen: "RequestedInventory",
        element: "refresh_error",
        action: "submit",
        extra: { message: String(e?.message || e) },
      });

      console.error("❌ Error refreshing requests:", e);
    } finally {
      setRefreshing(false);
    }
  }, [buildListUrl, employeeCodeParam, cacheKey]);

  /** Mount only */
  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  /** Layout */
  useEffect(() => {
    const onResize = () => {
      const w = Dimensions.get("window").width;
      setNumColumns(w < 600 ? 1 : w < 900 ? 2 : 3);
    };
    onResize();
    const sub = Dimensions.addEventListener("change", onResize);
    return () => (sub as any)?.remove?.();
  }, []);

  useEffect(() => {
    if (Platform.OS === "android") {
      UIManager.setLayoutAnimationEnabledExperimental?.(true);
    }
  }, []);

  /** Delta sync */
  const fetchDelta = useCallback(async () => {
    if (!employeeCodeParam || !lastSyncRef.current) return;
    if (deltaBusy.current) return;

    deltaBusy.current = true;
    const t0 = Date.now();
    const since = lastSyncRef.current;

    try {
      const url =
        `${BASE_URL}/all-requests/${encodeURIComponent(employeeCodeParam)}/delta` +
        `?since=${encodeURIComponent(since)}&include_remarks=false`;

      const res = await authenticatedFetch(url);
      const json = await res.json();

      trackNetwork({
        url: `/all-requests/${String(employeeCodeParam)}/delta`,
        method: "GET",
        status: res.status,
        ok: res.ok,
        durationMs: Date.now() - t0,
        extra: { since },
      });

      const changes: InventoryRequest[] = Array.isArray(json.requests)
        ? json.requests
        : [];

      if (!changes.length) return;
      if (!deltaGuardRef.current.shouldApply(changes)) return;

      trackUI({
        screen: "RequestedInventory",
        element: "delta_changes_received",
        action: "submit",
        extra: { changes_count: changes.length },
      });

      setData((prev) => {
        const map = new Map(prev.map((r) => [r.request_id, r]));
        for (const row of changes) {
          map.set(row.request_id, { ...(map.get(row.request_id) || {}), ...row });
        }
        const next = Array.from(map.values()).sort((a, b) => {
          const ta = new Date((a.created_at ?? "") as string).getTime();
          const tb = new Date((b.created_at ?? "") as string).getTime();
          return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
        });

        const ck = cacheKeyRef.current;
        const cached = dataCache.get(ck);
        if (cached) dataCache.set(ck, { ...cached, list: next, ts: Date.now() });

        return next;
      });

      const newest = changes.reduce((m, r) => {
        const t = new Date((r.updated_at ?? r.created_at) || "").getTime();
        return Number.isFinite(t) ? Math.max(m, t) : m;
      }, new Date(since).getTime());

      lastSyncRef.current = new Date(newest).toISOString();

      setChildData((prev) => {
        const out = { ...prev };
        const changeMap = new Map(changes.map((c) => [c.request_id, c]));
        for (const pid of Object.keys(out)) {
          out[pid] = out[pid].map((c) =>
            changeMap.has(c.request_id)
              ? { ...c, ...changeMap.get(c.request_id)! }
              : c
          );
        }
        return out;
      });

      trackUI({
        screen: "RequestedInventory",
        element: "delta_applied",
        action: "submit",
        extra: { lastSync: lastSyncRef.current, changes_count: changes.length },
      });
    } catch (e: any) {
      trackUI({
        screen: "RequestedInventory",
        element: "delta_error",
        action: "submit",
        extra: { message: String(e?.message || e) },
      });

      console.error("delta fetch failed:", e);
    } finally {
      deltaBusy.current = false;
    }
  }, [employeeCodeParam]);

  useFocusEffect(
    useCallback(() => {
      fetchDelta();
      const id = setInterval(fetchDelta, 10_000);
      return () => clearInterval(id);
    }, [fetchDelta])
  );

  /** Search & filter local */
  const searched = useSmartSearch<InventoryRequest>({
    data,
    query: searchQuery,
    keys: [
      "request_id",
      "item_name",
      "item_type",
      "warehouse",
      "project_name",
      "property_name",
      "engineer_name",
      "requested_by_name",
      "created_by_name",
      "status",
      "canonical_project_name",
      "canonical_property_name",
      "total_requested",
      "total_issued",
      "total_returned",
      "total_used",
    ] as any,
  });

  const finalFilteredData = useMemo(() => {
    const s = selectedStatus.toLowerCase();
    const base =
      s === "all"
        ? searched
        : searched.filter((i) => (i.status || "").toLowerCase() === s);
    return base.filter((i) => !i.p_req_id);
  }, [searched, selectedStatus]);

  const filterOptions = [
    { key: "all", label: "ALL" },
    { key: "requested", label: "REQUESTED" },
    { key: "raised", label: "RAISED" },
    { key: "issued", label: "ISSUED" },
    { key: "closed", label: "CLOSED" },
    { key: "partially_issued", label: "PARTIALLY ISSUED" },
    { key: "rejected", label: "REJECTED" },
  ];

  const handleItemPress = useCallback(
    (item: InventoryRequest) => {
      trackUI({
        screen: "RequestedInventory",
        element: "navigate_EditDeleteInventory",
        action: "click",
        extra: {
          request_id: item.request_id,
          status: item.status,
          has_children: !!item.has_children,
        },
      });

      router.push({
        pathname: "/EditDeleteInventory",
        params: {
          ...params,
          request_id: item.request_id,
          item_name: item.item_name,
          status: item.status,
          project_name: item.project_name,
          property_name: item.property_name,
          canonical_project_name: item.canonical_project_name,
          canonical_property_name: item.canonical_property_name,
          engineer_name: engineerFrom(item),
          item_type: item.item_type,
          warehouse: item.warehouse,
          requested_quantity: String(item.requested_quantity ?? ""),
          created_at: item.created_at ?? "",
          deli_date: item.deli_date ?? "",
          total_requested: String(item.total_requested ?? ""),
          total_issued: String(item.total_issued ?? ""),
          total_returned: String(item.total_returned ?? ""),
          total_used: String(item.total_used ?? ""),
        },
      });
    },
    [router, params, engineerFrom]
  );

  const renderListItem = useCallback(
    ({ item }: { item: InventoryRequest }) => {
      const anim = rotationAnimRef.current[item.request_id];
      const rotate =
        anim?.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] }) ??
        "0deg";

      const colors = getStatusColors(item.status);

      return (
        <View testID={`requested-inventory-row-wrap-${item.request_id}`}>
          <TouchableOpacity
            testID={`requested-inventory-card-${item.request_id}`}
            style={styles.card}
            onPress={() => handleItemPress(item)}
          >
            <View style={styles.topRow}>
              <View style={styles.idRow}>
                <Ionicons name="cube-outline" size={18} color={C.mutedText} />
                <TText
                  testID={`requested-inventory-card-title-${item.request_id}`}
                  style={styles.reqId}
                  numberOfLines={1}
                >
                  {item.item_name || item.request_id}
                </TText>
              </View>

              <TouchableOpacity
                testID={`requested-inventory-card-status-pill-${item.request_id}`}
                style={[
                  styles.statusPill,
                  { backgroundColor: colors.bg, borderColor: colors.border },
                ]}
                onPress={() => handleToggleExpand(item.request_id, !!item.has_children)}
                activeOpacity={0.7}
              >
                <TText style={[styles.statusText, { color: colors.text }]}>
                  {(item.status ?? "").toUpperCase()}
                </TText>
                {!!item.has_children && (
                  <Animated.View style={{ transform: [{ rotate }] }}>
                    <Ionicons name="chevron-down" size={16} color={colors.text} />
                  </Animated.View>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.infoRow}>
              <Ionicons name="business-outline" size={16} color={C.mutedText} style={styles.icon} />
              <TText
                testID={`requested-inventory-card-project-${item.request_id}`}
                style={styles.infoText}
              >
                {item.canonical_project_name || "—"}
              </TText>
            </View>

            <View style={styles.infoRow}>
              <Ionicons name="home-outline" size={16} color={C.mutedText} style={styles.icon} />
              <TText
                testID={`requested-inventory-card-property-${item.request_id}`}
                style={styles.infoText}
              >
                {item.canonical_property_name || "—"}
              </TText>
            </View>
          </TouchableOpacity>

          {expandedItems[item.request_id] && loadingChildren[item.request_id] && (
            <View
              style={styles.childLoader}
              testID={`requested-inventory-child-loader-${item.request_id}`}
            >
              <ActivityIndicator size="small" color={C.primaryStrong} />
              <TText style={styles.loadingText}>Loading child requests…</TText>
            </View>
          )}

          {expandedItems[item.request_id] &&
            (childData[item.request_id] ?? []).map((child) => {
              const c = getStatusColors(child.status);
              return (
                <TouchableOpacity
                  key={child.request_id}
                  testID={`requested-inventory-child-card-${child.request_id}`}
                  style={styles.childCard}
                  onPress={() => handleItemPress(child)}
                >
                  <View style={styles.childHeader}>
                    <TText
                      testID={`requested-inventory-child-title-${child.request_id}`}
                      style={styles.childId}
                      numberOfLines={1}
                    >
                      {child.request_id}
                    </TText>
                    <View
                      testID={`requested-inventory-child-status-${child.request_id}`}
                      style={[styles.childStatus, { backgroundColor: c.bg, borderColor: c.border }]}
                    >
                      <TText style={[styles.childStatusText, { color: c.text }]}>
                        {(child.status || "").toUpperCase()}
                      </TText>
                    </View>
                  </View>
                  <TText style={styles.childLine}>{child.canonical_project_name || "—"}</TText>
                  <TText style={styles.childLine}>{child.canonical_property_name || "—"}</TText>
                </TouchableOpacity>
              );
            })}

          {expandedItems[item.request_id] &&
            !loadingChildren[item.request_id] &&
            (childData[item.request_id]?.length ?? 0) === 0 && (
              <TText
                testID={`requested-inventory-no-child-${item.request_id}`}
                style={styles.noChildText}
              >
                {item.has_children ? "No child requests returned" : "No child requests"}
              </TText>
            )}
        </View>
      );
    },
    [expandedItems, loadingChildren, childData, handleItemPress, handleToggleExpand, C.mutedText, C.primaryStrong]
  );

  if (isLoading) {
    return (
      <View style={styles.centered} testID="requested-inventory-loading-state">
        <ActivityIndicator size="large" color={C.primaryStrong} />
        <TText style={styles.loadingText}>Loading inventory requests…</TText>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: C.bg }]} testID="requested-inventory-root">
      <View
        style={[styles.header, { backgroundColor: C.surface, borderBottomColor: C.border }]}
        testID="requested-inventory-header"
      >
        <TouchableOpacity
          testID="requested-inventory-back-btn"
          onPress={() => {
            trackUI({
              screen: "RequestedInventory",
              element: "header_back",
              action: "click",
              extra: {},
            });
            router.back();
          }}
        >
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>

        <TText style={styles.headerTitle} testID="requested-inventory-title">
          Requested Inventory
        </TText>

        <TouchableOpacity
          testID="requested-inventory-home-btn"
          onPress={() => {
            trackUI({
              screen: "RequestedInventory",
              element: "header_home",
              action: "click",
              extra: {},
            });
            router.push("/HomeScreen");
          }}
        >
          <Ionicons name="home-outline" size={22} color={C.text} />
        </TouchableOpacity>
      </View>

      <View
        style={[styles.searchBar, { backgroundColor: C.surface, borderBottomColor: C.border }]}
        testID="requested-inventory-search-bar"
      >
        <Ionicons name="search" size={18} color={C.mutedText} style={{ marginRight: 6 }} />
        <TextInput
          testID="requested-inventory-search-input"
          style={[styles.searchInput, { backgroundColor: C.surfaceAlt, color: C.text }]}
          placeholder="Search by item name / project / property / engineer / status"
          placeholderTextColor={C.subtleText}
          value={searchQuery}
          onChangeText={(t) => {
            setSearchQuery(t);
            trackUI({
              screen: "RequestedInventory",
              element: "search_input",
              action: "change",
              extra: { len: t.length },
            });
          }}
          autoCapitalize="none"
        />

        <TouchableOpacity
          testID="requested-inventory-filter-btn"
          style={styles.iconButton}
          onPress={() => {
            trackUI({
              screen: "RequestedInventory",
              element: "filter_open",
              action: "open",
              extra: {},
            });
            modalSelectorRef.current?.open();
          }}
        >
          <Ionicons name="options" size={22} color={C.text} />
        </TouchableOpacity>

        <TouchableOpacity
          testID="requested-inventory-add-btn"
          style={styles.iconButton}
          onPress={() => {
            trackUI({
              screen: "RequestedInventory",
              element: "add_request",
              action: "click",
              extra: {},
            });
            router.push({ pathname: "/MasterItems", params: { ...params } });
          }}
        >
          <Ionicons name="add-outline" size={22} color={C.text} />
        </TouchableOpacity>

        <ModalSelector
          ref={modalSelectorRef}
          data={filterOptions}
          initValue="Filter by Status"
          onChange={(opt: any) => {
            const next = String((opt as any).key);
            setSelectedStatus(next);

            trackUI({
              screen: "RequestedInventory",
              element: "filter_status",
              action: "click",
              extra: { status: next },
            });
          }}
          style={{ height: 0, width: 0 }}
          selectStyle={{ height: 0 }}
          visible={false}
          optionTextStyle={{ fontSize: 14 }}
          cancelText="Cancel"
        />
      </View>

      <FlatList
        testID="requested-inventory-flatlist"
        data={finalFilteredData}
        renderItem={renderListItem}
        keyExtractor={(item: any) => item.request_id}
        contentContainerStyle={styles.listPad}
        numColumns={numColumns}
        key={numColumns}
        onEndReachedThreshold={0.35}
        onEndReached={loadNextPage}
        ListFooterComponent={
          isPaging ? (
            <View style={{ paddingVertical: 16 }} testID="requested-inventory-pagination-loader">
              <ActivityIndicator />
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.primaryStrong}
          />
        }
        windowSize={7}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        removeClippedSubviews
      />
    </View>
  );
};

const createStyles = (C: any) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: C.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: C.text },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: C.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: C.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: C.border,
    color: C.text,
  },
  listPad: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 24 },

  card: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    marginVertical: 8,
    marginHorizontal: 4,
    elevation: 1,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  idRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  reqId: { fontWeight: "800", fontSize: 14, color: C.text, letterSpacing: 0.2 },

  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },

  infoRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  icon: { marginRight: 8 },
  infoText: { fontSize: 14, color: C.text },

  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginLeft: 8, color: C.primaryStrong },

  childLoader: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 16,
    marginTop: 8,
    padding: 8,
  },
  childCard: {
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.border,
    marginHorizontal: 12,
    marginTop: 6,
    padding: 12,
    borderRadius: 10,
  },
  childHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  childId: { fontWeight: "700", color: C.text },
  childStatus: {
    paddingHorizontal: 8,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  childStatusText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  childLine: { fontSize: 13, color: C.text },

  noChildText: { fontSize: 13, color: C.mutedText, marginLeft: 16, marginTop: 6, marginBottom: 8 },

  iconButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceAlt,
  },
});

export default RequestedInventory;
