import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
// app/PropertiesScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, TextInput, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Modal, Pressable, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { MaterialIcons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFontScale } from "@/context/FontScaleContext";
import TText from "@/components/TText";
import { useTheme } from "@/src/theme/ThemeProvider";
import { authenticatedFetch } from "../utils/auth";

type EmbeddedEmployee = {
  first_name?: string;
  last_name?: string;
  employee_code?: string;
  email?: string;
  job_title?: string;
  phone_number?: string;
};

type PropertyRow = {
  property_id?: string;
  property_name?: string;
  project_id?: string;
  type?: string;
  subtype?: string;
  status?: string;

  project_name?: string;
  project_type?: string;
  project_location_city?: string;
  project_location_state?: string;
  project_location_gps?: string;
  project_status?: string;

  is_deleted?: boolean | number | "true" | "false";
};

type Props = {
  embedded?: boolean;
  employee?: EmbeddedEmployee;
  active?: boolean;
  onlineOverride?: boolean;
  refreshKey?: number;
  onCountChange?: (n: number) => void;
};

const API_BASE_URL = `${APP_API_BASE_URL}`;

const normalizeStatus = (s?: string) => {
  const value = (s || "").trim().toLowerCase();

  if (!value) return "";

  if (
    value === "inprogress" ||
    value === "in_progress" ||
    value === "in progress" ||
    value === "ongoing"
  ) {
    return "in_progress";
  }

  if (
    value === "onhold" ||
    value === "on_hold" ||
    value === "on hold"
  ) {
    return "on_hold";
  }

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
const normalizePropsResponse = (json: any): any[] => {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.properties)) return json.properties;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.result)) return json.result;
  if (json && typeof json === "object" && (json.property_id || json.propertyid)) return [json];
  return [];
};

const sanitizeProps = (rows: any[]): PropertyRow[] => {
  const arr: any[] = Array.isArray(rows) ? rows : [];
  return arr
    .filter((r) => {
      const del = r?.is_deleted;
      const isDel =
        del === true ||
        del === 1 ||
        (typeof del === "string" && del.toLowerCase() === "true");
      return !isDel;
    })
    .map((r) => ({
      ...r,
      property_id: String(r.property_id ?? r.propertyid ?? ""),
      property_name: r.property_name || r.name || "",
    }));
};

const PropertiesScreen: React.FC<Props> = ({
  embedded = false,
  employee,
  active = true,
  onlineOverride,
  refreshKey,
  onCountChange,
}) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const pstyles = useMemo(() => createStyles(C), [C]);
  const router = useRouter();
  const params = useLocalSearchParams();
  const onCountChangeRef = useRef(onCountChange);

  useEffect(() => {
    onCountChangeRef.current = onCountChange;
  }, [onCountChange]);

  const resolvedEmployee: EmbeddedEmployee | undefined = useMemo(() => {
    if (employee) return employee;
    return {
      employee_code: params?.employee_code ? String(params.employee_code) : "",
      first_name: params?.first_name ? String(params.first_name) : "",
      last_name: params?.last_name ? String(params.last_name) : "",
      job_title: params?.job_title ? String(params.job_title) : "",
      email: params?.email ? String(params.email) : "",
      phone_number: params?.phone_number ? String(params.phone_number) : "",
    };
  }, [employee, params]);

  const employeeCode = resolvedEmployee?.employee_code ?? "";

  const [online, setOnline] = useState(true);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PropertyRow[]>([]);
  const [q, setQ] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "PLANNING" | "PENDING" | "ON_HOLD" | "IN_PROGRESS" | "COMPLETED"
  >("ALL");

  const cacheKey = useMemo(() => `employee_props:${employeeCode || "unknown"}`, [employeeCode]);

  // Online control
  useEffect(() => {
    if (embedded && typeof onlineOverride === "boolean") {
      setOnline(onlineOverride);
      return;
    }

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

  const loadCache = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(cacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { data: PropertyRow[]; lastSyncedAt: number };
      if (Array.isArray(parsed?.data)) {
        setRows(parsed.data);
        onCountChangeRef.current?.(parsed.data.length);
      }
    } catch {
      // ignore
    }
  }, [cacheKey]);

  const saveCache = useCallback(
    async (data: PropertyRow[]) => {
      try {
        await AsyncStorage.setItem(cacheKey, JSON.stringify({ data, lastSyncedAt: Date.now() }));
      } catch {
        // ignore
      }
    },
    [cacheKey]
  );

  const fetchProps = useCallback(async () => {
    if (embedded && !active) return;

    if (!employeeCode) {
      setRows([]);
      onCountChangeRef.current?.(0);
      return;
    }

    if (!online) {
      await loadCache();
      return;
    }

    setLoading(true);
    try {
      const res = await authenticatedFetch(`/employee-properties/${employeeCode}`);
      if (!res.ok) {
        await loadCache();
        return;
      }

      const json = await res.json();
      const list = sanitizeProps(normalizePropsResponse(json));

      setRows(list);
      onCountChangeRef.current?.(list.length);
      await saveCache(list);
    } catch {
      await loadCache();
    } finally {
      setLoading(false);
    }
  }, [embedded, active, employeeCode, online, loadCache, saveCache]);

  useEffect(() => {
    fetchProps();
  }, [fetchProps]);

  useEffect(() => {
    if (!embedded) return;
    if (!active) return;
    if (!refreshKey) return;
    fetchProps();
  }, [embedded, active, refreshKey, fetchProps]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();

    const base = rows.filter((p) => {
      if (!needle) return true;
      const hay = [
        p.property_name,
        p.property_id,
        p.type,
        p.subtype,
        p.status,
        p.project_name,
        p.project_location_city,
        p.project_location_state,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });

    if (statusFilter === "ALL") return base;
    return base.filter((p) => normalizeStatus(p.status) === normalizeStatus(statusFilter));
  }, [rows, q, statusFilter]);

  const filterOptions = [
    { key: "ALL", label: "All" },
    { key: "PLANNING", label: "Planning" },
    { key: "PENDING", label: "Pending" },
    { key: "ON_HOLD", label: "On Hold" },
    { key: "IN_PROGRESS", label: "In Progress" },
    { key: "COMPLETED", label: "Completed" },
  ] as const;

  // ✅ THIS IS THE IMPORTANT FIX: send params in the format PropertiesListScreen expects
  const goToPropertyListScreen = (item: PropertyRow) => {
    const userDetailsPayload = encodeURIComponent(
      JSON.stringify({
        employee_code: employeeCode,
        first_name: resolvedEmployee?.first_name ?? "",
        last_name: resolvedEmployee?.last_name ?? "",
        job_title: resolvedEmployee?.job_title ?? "",
        email: resolvedEmployee?.email ?? "",
        phone_number: resolvedEmployee?.phone_number ?? "",
      })
    );

    const projectLocationText =
      [item.project_location_city, item.project_location_state].filter(Boolean).join(", ") || "";

    router.push({
      pathname: "/PropertiesListScreen",
      params: {
        // ✅ match PropertiesListScreen
        propertyId: item.property_id ?? "",
        propertyName: item.property_name ?? "",
        projectId: item.project_id ?? "",
        projectLocation: projectLocationText,
        userDetails: userDetailsPayload,

        // optional extras (won't break)
        projectName: item.project_name ?? "",
      },
    } as any);
  };

  const renderItem = ({ item }: { item: PropertyRow }) => {
    const c = statusColors(item.status);
    const subtitle = [item.project_name, item.subtype, item.type].filter(Boolean).join("  •  ");

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        style={pstyles.card}
        onPress={() => goToPropertyListScreen(item)}
      >
        <View style={pstyles.cardTopRow}>
          <TText style={pstyles.title} numberOfLines={1}>
            {item.property_name || item.property_id || "—"}
          </TText>

          <View style={[pstyles.statusChip, { backgroundColor: c.bg, borderColor: c.border }]}>
            <TText style={[pstyles.statusText, { color: c.text }]} numberOfLines={1}>
              {String(item.status || "PLANNING").toUpperCase()}
            </TText>
          </View>
        </View>

        {!!subtitle && (
          <TText style={pstyles.subtitle} numberOfLines={1}>
            {subtitle}
          </TText>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={pstyles.wrap} testID="properties-screen-root">
      <View style={pstyles.panelHeader}>
        <View>
          <TText style={pstyles.panelTitle}>Properties</TText>
          <TText style={pstyles.panelSub}>
            {online ? "Online" : "Offline"} • {rows.length} assigned
          </TText>
        </View>

        <TouchableOpacity onPress={() => setFilterOpen(true)} style={pstyles.iconBtn}>
          <MaterialIcons name="filter-list" size={20} color={C.text} />
        </TouchableOpacity>
      </View>

      <View style={pstyles.searchBar}>
        <MaterialIcons name="search" size={18} color={C.subtleText} style={{ marginRight: 8 }} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search properties"
          placeholderTextColor={C.subtleText}
          style={pstyles.searchInput}
          autoCapitalize="none"
        />
        {!!q && (
          <TouchableOpacity onPress={() => setQ("")} style={{ padding: 2 }}>
            <MaterialIcons name="close" size={18} color={C.subtleText} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={pstyles.loadingBox}>
          <ActivityIndicator size="small" color={C.primary} />
          <TText style={[pstyles.loadingText, { marginTop: 8 }]}>
            {online ? "Loading properties…" : "Loading offline cache…"}
          </TText>
        </View>
      ) : embedded ? (
        <View style={{ paddingBottom: 8 }}>
          {filtered.length ? (
            filtered.map((item, index) => (
              <React.Fragment key={`${item.property_id || index}`}>
                {renderItem({ item, index } as any)}
              </React.Fragment>
            ))
          ) : (
            <View style={pstyles.emptyWrap}>
              <TText style={pstyles.emptyTitle}>No properties found</TText>
              <TText style={pstyles.emptyText}>Try a different search.</TText>
            </View>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(it, idx) => `${it.property_id || idx}`}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 8 }}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={fetchProps as any} enabled={online} />
          }
          ListEmptyComponent={
            <View style={pstyles.emptyWrap}>
              <TText style={pstyles.emptyTitle}>No properties found</TText>
              <TText style={pstyles.emptyText}>Try a different search.</TText>
            </View>
          }
        />
      )}

      {/* Filter modal */}
      <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        <Pressable style={pstyles.modalBackdrop} onPress={() => setFilterOpen(false)} />
        <View style={pstyles.modalCenter}>
          <View style={pstyles.sheetWrap}>
            {filterOptions.map((opt) => {
              const activeOpt = opt.key === statusFilter;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={pstyles.sheetRow}
                  activeOpacity={0.85}
                  onPress={() => {
                    setStatusFilter(opt.key);
                    setFilterOpen(false);
                  }}
                >
                  <TText style={[pstyles.sheetText, activeOpt ? pstyles.sheetTextActive : null]}>
                    {opt.label}
                  </TText>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={pstyles.cancelBtn} onPress={() => setFilterOpen(false)} activeOpacity={0.9}>
            <TText style={pstyles.cancelText}>Cancel</TText>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
};

export default PropertiesScreen;

/** ✅ Embedded export (HomeScreen uses this) */
export const PropertiesEmbedded = (props: {
  employee: EmbeddedEmployee;
  active?: boolean;
  online: boolean;
  refreshKey: number;
  onCountChange?: (n: number) => void;
}) => {
  return (
    <PropertiesScreen
      embedded
      employee={props.employee}
      active={props.active ?? true}
      onlineOverride={props.online}
      refreshKey={props.refreshKey}
      onCountChange={props.onCountChange}
    />
  );
};

const createStyles = (C: ReturnType<typeof useTheme>["theme"]["colors"]) => StyleSheet.create({
  wrap: {
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },

  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  panelTitle: { fontSize: 15, fontWeight: "900", color: C.text },
  panelSub: { marginTop: 2, fontSize: 12, fontWeight: "700", color: C.mutedText },

  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: C.text, paddingVertical: 0 },

  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: C.border,
  },

  cardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  title: { flex: 1, fontSize: 12, fontWeight: "700", color: C.text },
  subtitle: { marginTop: 6, fontSize: 11, fontWeight: "600", color: C.mutedText },

  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1.2,
  },
  statusText: { fontSize: 9, fontWeight: "600", letterSpacing: 0.3 },

  loadingBox: { paddingVertical: 18, alignItems: "center", justifyContent: "center" },
  loadingText: { fontSize: 13, fontWeight: "800", color: C.mutedText },

  emptyWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 20, gap: 6 },
  emptyTitle: { fontSize: 14, fontWeight: "900", color: C.text },
  emptyText: { fontSize: 12, fontWeight: "700", color: C.mutedText },

  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: C.overlay },
  modalCenter: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },

  sheetWrap: {
    width: "72%",
    maxWidth: 380,
    backgroundColor: C.surface,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: C.border,
  },
  sheetRow: {
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  sheetText: { fontSize: 10, color: C.text, fontWeight: "500" },
  sheetTextActive: { fontWeight: "900" },

  cancelBtn: {
    marginTop: 10,
    width: "72%",
    maxWidth: 380,
    backgroundColor: C.surface,
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
  },
  cancelText: { fontSize: 10, color: C.text, fontWeight: "500" },
});
