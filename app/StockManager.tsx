import React, { useState, useCallback, useRef, useMemo, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  SafeAreaView,
  Modal,
  ScrollView,
  Platform,
  StatusBar,
  Pressable,
  SectionList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";

import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { authenticatedFetch } from "../utils/auth";

type InventoryRequest = {
  request_id: string | number;
  item_name?: string;
  project_name?: string;
  property_name?: string;
  canonical_project_name?: string;
  canonical_property_name?: string;
  engineer_name?: string;
  status?: string;
  master_status?: string;
  updated_at?: string;
  created_at?: string;
  deli_date?: string;
  property_id?: string;
  project_id?: string;
};

type PropertyOption = {
  key: string;
  label: string;
  property_name?: string;
  project_name?: string;
  project_id?: string;
};

type DateSection = {
  title: string;
  sortKey: string;
  data: InventoryRequest[];
};

const BASE_URL = `${APP_API_BASE_URL}`;
const API_ALL = `${BASE_URL}/all-requests`;
const API_PROPERTIES = `${BASE_URL}/properties-and-projects`;

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 500;

const BRAND_BLUE = "#2F80ED";
const BG = "#F6F7FB";
const TEXT = "#0F172A";
const MUTED = "#64748B";
const BORDER = "#E5E7EB";

type StockManagerProps = {
  embedded?: boolean;
  employee_code?: string;
  onBack?: () => void;
  status?: string;
};

const norm = (v: any) =>
  String(v ?? "")
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeStatusKey = (s?: string) => {
  const v = norm(s);
  if (!v) return "";
  return v.replace(/\s+/g, "_");
};

const STATUS_OPTIONS = [
  { key: "requested", label: "Requested" },
  { key: "raised", label: "Raised" },
  { key: "issued", label: "Issued" },
  { key: "rejected", label: "Rejected" },
  { key: "partially_issued", label: "Partial" },
  { key: "closed", label: "Closed" },
];

const StockManager: React.FC<StockManagerProps> = ({
  embedded = false,
  employee_code,
  onBack,
  status,
}) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  const router = useRouter();
  const params = useLocalSearchParams();

  const employeeCode =
    employee_code ?? ((params?.employee_code as string | undefined) ?? "");

  const [data, setData] = useState<InventoryRequest[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isQueryLoading, setIsQueryLoading] = useState(false);
  const [isPaging, setIsPaging] = useState(false);

  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const isFetchingRef = useRef(false);
  const onEndReachedLockRef = useRef(false);

  const inFlightAbortRef = useRef<AbortController | null>(null);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [propertyOptions, setPropertyOptions] = useState<PropertyOption[]>([
    { key: "all", label: "All Properties" },
  ]);

  const propertyOptionsRef = useRef<PropertyOption[]>(propertyOptions);
  useEffect(() => {
    propertyOptionsRef.current = propertyOptions;
  }, [propertyOptions]);

  const loadProperties = useCallback(async () => {
    try {
      const res = await authenticatedFetch(API_PROPERTIES);
      const json = await res.json();
      const raw = Array.isArray(json?.properties) ? json.properties : [];

      const opts: PropertyOption[] = raw
        .map((p: any) => {
          const propertyId = String(
            p.property_id ?? p.property_key ?? p.key ?? ""
          ).trim();
          const propertyName = String(p.property_name ?? "").trim();
          const projectName = String(p.project_name ?? "").trim();
          const projectId = String(p.project_id ?? p.project_key ?? "").trim();
          if (!propertyId) return null;

          const label = projectName
            ? `${propertyName || propertyId} • ${projectName}`
            : propertyName || propertyId;

          return {
            key: propertyId,
            label,
            property_name: propertyName,
            project_name: projectName,
            project_id: projectId || undefined,
          };
        })
        .filter(Boolean) as PropertyOption[];

      opts.sort((a, b) => a.label.localeCompare(b.label));

      setPropertyOptions((prev) => {
        const next = [{ key: "all", label: "All Properties" }, ...opts];
        if (prev.length !== next.length) return next;
        for (let i = 0; i < prev.length; i++) {
          if (prev[i]?.key !== next[i]?.key) return next;
        }
        return prev;
      });
    } catch (e) {
      console.error("Failed to load properties:", e);
    }
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [selectedProperty, setSelectedProperty] = useState<string>("");

  const [filterOpen, setFilterOpen] = useState(false);
  const [draftSearch, setDraftSearch] = useState("");
  const [draftSelectedStatus, setDraftSelectedStatus] = useState<string>("");
  const [draftSelectedProperty, setDraftSelectedProperty] = useState<string>("");
  const [draftPropertySearch, setDraftPropertySearch] = useState("");

  const [draftPropertyPickerOpen, setDraftPropertyPickerOpen] = useState(true);

  const isAnyFilterApplied = useMemo(() => {
    return searchQuery.trim().length > 0 || !!selectedStatus || !!selectedProperty;
  }, [searchQuery, selectedStatus, selectedProperty]);

  const latestSearchRef = useRef("");
  const latestSelectedStatusRef = useRef<string>("");
  const latestSelectedPropertyRef = useRef<string>("");

  const parentStatusRef = useRef("");
  useEffect(() => {
    parentStatusRef.current = normalizeStatusKey(status);
  }, [status]);

  const normalizeRowStatusKey = (row: InventoryRequest) => {
    const raw = norm(row.master_status || row.status || "");

    if (!raw) return "";
    if (raw.includes("partially")) return "partially_issued";
    if (raw.includes("partial")) return "partially_issued";
    if (raw.includes("requested")) return "requested";
    if (raw.includes("raised")) return "raised";
    if (raw.includes("rejected")) return "rejected";
    if (raw.includes("closed")) return "closed";
    if (raw.includes("issued")) return "issued";

    return normalizeStatusKey(raw);
  };

  const rowMatchesSelectedProperties = (row: InventoryRequest, selected: string[]) => {
    if (!selected.length) return true;

    const rowPid = String((row as any).property_id ?? "").trim();
    if (rowPid && selected.includes(rowPid)) return true;

    const rowPropName = norm(row.canonical_property_name || row.property_name || "");
    if (!rowPropName) return false;

    const opts = propertyOptionsRef.current;
    for (const pid of selected) {
      const opt = opts.find((p) => p.key === pid);
      const optName = norm(opt?.property_name || opt?.label || "");
      if (optName && rowPropName.includes(optName)) return true;
    }
    return false;
  };

  const applyClientSideFilters = (rows: InventoryRequest[]) => {
    const st = latestSelectedStatusRef.current;
    const prop = latestSelectedPropertyRef.current;

    let out = rows;

    if (st) out = out.filter((r) => normalizeRowStatusKey(r) === st);
    if (prop) out = out.filter((r) => rowMatchesSelectedProperties(r, [prop]));

    return out;
  };

  const toISTDate = (utcDateStr: string) => {
    const utcDate = new Date(utcDateStr);
    const istOffsetMinutes = 330;
    return new Date(utcDate.getTime() + istOffsetMinutes * 60000);
  };

  const formatISTDateTime = (utcDateStr: string): string => {
    const istDate = toISTDate(utcDateStr);
    return istDate.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const formatISTDateOnlyTitle = (utcDateStr: string): string => {
    const istDate = toISTDate(utcDateStr);
    return istDate.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const istSortKey = (utcDateStr?: string) => {
    if (!utcDateStr) return "0000-00-00";
    const d = toISTDate(utcDateStr);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };

  const buildUrl = useCallback(() => {
    const url = new URL(API_ALL);

    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offsetRef.current));
    url.searchParams.set("parent_only", "true");

    const search = latestSearchRef.current.trim();
    if (search) url.searchParams.set("search", search);

    const selectedStatus = latestSelectedStatusRef.current;
    const parentStatus = parentStatusRef.current;
    const finalStatus = selectedStatus || parentStatus;

    const prop = latestSelectedPropertyRef.current;

    if (finalStatus) url.searchParams.set("status", finalStatus.toUpperCase());
    if (prop) url.searchParams.set("property", prop);

    return url.toString();
  }, []);

  const fetchPage = useCallback(
    async (opts: { reset: boolean }) => {
      if (!opts.reset && isFetchingRef.current) return;
      if (!opts.reset && !hasMoreRef.current) return;

      if (inFlightAbortRef.current) inFlightAbortRef.current.abort();
      const ctrl = new AbortController();
      inFlightAbortRef.current = ctrl;

      isFetchingRef.current = true;

      if (opts.reset) {
        setData([]);
        offsetRef.current = 0;
        hasMoreRef.current = true;
        onEndReachedLockRef.current = false;
      }

      try {
        const res = await authenticatedFetch(buildUrl(), { signal: ctrl.signal });
        const json = await res.json();
        if (ctrl.signal.aborted) return;

        const rawRows: InventoryRequest[] =
          json?.requests || (Array.isArray(json) ? json : []);

        const rows = applyClientSideFilters(rawRows);

        setData((prev) => {
          const prevIds = new Set(prev.map((x) => String(x.request_id)));

          if (opts.reset) {
            const uniqueReset: InventoryRequest[] = [];
            const seen = new Set<string>();
            for (const r of rows) {
              const id = String(r.request_id);
              if (!id || seen.has(id)) continue;
              seen.add(id);
              uniqueReset.push(r);
            }

            offsetRef.current = uniqueReset.length;

            const apiHasMore =
              typeof json?.has_more === "boolean"
                ? json.has_more
                : rawRows.length >= PAGE_SIZE;

            hasMoreRef.current = apiHasMore && rawRows.length > 0;
            return uniqueReset;
          }

          const uniqueIncoming = rows.filter((r) => !prevIds.has(String(r.request_id)));
          const next = [...prev, ...uniqueIncoming];

          offsetRef.current = next.length;

          const apiHasMore =
            typeof json?.has_more === "boolean"
              ? json.has_more
              : rawRows.length >= PAGE_SIZE;

          hasMoreRef.current = apiHasMore && rawRows.length > 0;
          return next;
        });
      } catch (err: any) {
        if (err?.name !== "AbortError") console.error("Fetch error:", err);
      } finally {
        isFetchingRef.current = false;
        setIsInitialLoading(false);
        setIsQueryLoading(false);
        setIsPaging(false);
      }
    },
    [buildUrl]
  );

  useFocusEffect(
    useCallback(() => {
      loadProperties();
      fetchPage({ reset: true });

      return () => {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        inFlightAbortRef.current?.abort();
      };
    }, [fetchPage, loadProperties])
  );

  const openFilter = () => {
    setDraftSearch(searchQuery);
    setDraftSelectedStatus(selectedStatus);
    setDraftSelectedProperty(selectedProperty);
    setDraftPropertySearch("");
    setDraftPropertyPickerOpen(true);
    setFilterOpen(true);
  };

  const selectDraftStatus = (key: string) => {
    setDraftSelectedStatus((prev) => (prev === key ? "" : key));
  };

  const selectDraftProperty = (propertyId: string) => {
    if (propertyId === "all") {
      setDraftSelectedProperty("");
      return;
    }
    setDraftSelectedProperty((prev) => (prev === propertyId ? "" : propertyId));
  };

  const clearDraft = () => {
    setDraftSearch("");
    setDraftSelectedStatus("");
    setDraftSelectedProperty("");
    setDraftPropertySearch("");
    setDraftPropertyPickerOpen(true);
  };

  const applyFilters = () => {
    setSearchQuery(draftSearch);
    setSelectedStatus(draftSelectedStatus);
    setSelectedProperty(draftSelectedProperty);

    latestSearchRef.current = draftSearch;
    latestSelectedStatusRef.current = draftSelectedStatus;
    latestSelectedPropertyRef.current = draftSelectedProperty;

    setFilterOpen(false);
    setIsQueryLoading(true);
    fetchPage({ reset: true });
  };

  const clearAllAppliedFilters = () => {
    setSearchQuery("");
    setSelectedStatus("");
    setSelectedProperty("");

    latestSearchRef.current = "";
    latestSelectedStatusRef.current = "";
    latestSelectedPropertyRef.current = "";

    setIsQueryLoading(true);
    fetchPage({ reset: true });
  };

  const filteredPropertyOptions = useMemo(() => {
    const q = norm(draftPropertySearch);
    if (!q) return propertyOptions;
    return propertyOptions.filter((p) => p.key === "all" || norm(p.label).includes(q));
  }, [propertyOptions, draftPropertySearch]);

  const getStatusColors = (statusStr?: string) => {
    const s = norm(statusStr);
    if (s.includes("requested")) return { bg: "#EAF6EE", fg: "#136A3A" };
    if (s.includes("raised")) return { bg: "#E8F0FE", fg: "#1E3A8A" };
    if (s.includes("partially")) return { bg: "#FFF7ED", fg: "#9A3412" };
    if (s.includes("issued")) return { bg: "#FFF2E6", fg: "#B05A18" };
    if (s.includes("rejected")) return { bg: "#FCEBEC", fg: "#8E1B1B" };
    if (s.includes("closed")) return { bg: "#EEF2FF", fg: "#3730A3" };
    return { bg: "#F1F2F4", fg: "#2E2E2E" };
  };

  const selectedPropertySummary = useMemo(() => {
    if (!draftSelectedProperty) return "All Properties";
    const opt = propertyOptions.find((p) => p.key === draftSelectedProperty);
    return opt?.label || "1 Property";
  }, [draftSelectedProperty, propertyOptions]);

  const sections: DateSection[] = useMemo(() => {
    if (!data.length) return [];

    const map = new Map<string, DateSection>();

    for (const row of data) {
      const key = istSortKey(row.created_at);
      const title = row.created_at ? formatISTDateOnlyTitle(row.created_at) : "Unknown Date";

      if (!map.has(key)) {
        map.set(key, { sortKey: key, title, data: [] });
      }
      map.get(key)!.data.push(row);
    }

    for (const sec of map.values()) {
      sec.data.sort((a, b) => {
        const ta = a.created_at ? toISTDate(a.created_at).getTime() : 0;
        const tb = b.created_at ? toISTDate(b.created_at).getTime() : 0;
        return tb - ta;
      });
    }

    return Array.from(map.values()).sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1));
  }, [data]);

  const Header = (
    <View style={styles.headerWrap}>
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#94A3B8" />
          <TextInput
            style={styles.input}
            placeholder="Search request / project / property..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
              latestSearchRef.current = text;

              if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
              searchTimerRef.current = setTimeout(() => {
                setIsQueryLoading(true);
                fetchPage({ reset: true });
              }, SEARCH_DEBOUNCE_MS);
            }}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {searchQuery.length > 0 ? (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery("");
                latestSearchRef.current = "";
                setIsQueryLoading(true);
                fetchPage({ reset: true });
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity
          style={styles.filterBtnNextToSearch}
          onPress={openFilter}
          activeOpacity={0.85}
        >
          <Ionicons name="options-outline" size={18} color={BRAND_BLUE} />
        </TouchableOpacity>

        {isAnyFilterApplied ? (
          <TouchableOpacity
            style={styles.resetPill}
            onPress={clearAllAppliedFilters}
            activeOpacity={0.85}
          >
            <Ionicons name="close" size={14} color={TEXT} />
            <Text style={styles.resetPillText}>Reset</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {(isQueryLoading || isInitialLoading) && (
        <View style={{ paddingBottom: 10 }}>
          <ActivityIndicator color={C.primary} />
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} testID="stock-manager-root">
      <View style={styles.container}>
        <SectionList
          sections={sections}
          keyExtractor={(item, index) => `${String(item.request_id)}-${index}`}
          contentContainerStyle={styles.list}
          ListHeaderComponent={Header}
          stickySectionHeadersEnabled
          onEndReachedThreshold={0.25}
          onMomentumScrollBegin={() => (onEndReachedLockRef.current = false)}
          onEndReached={() => {
            if (!hasMoreRef.current) return;
            if (isFetchingRef.current) return;
            if (isPaging) return;
            if (onEndReachedLockRef.current) return;

            onEndReachedLockRef.current = true;
            setIsPaging(true);
            fetchPage({ reset: false });
          }}
          renderSectionHeader={({ section }) => {
            const s = section as unknown as DateSection;
            return (
              <View style={styles.sectionHeaderWrap}>
                <View style={styles.sectionHeaderChip}>
                  <Ionicons name="calendar-outline" size={14} color={C.primary} />
                  <Text style={styles.sectionHeaderText}>{s.title}</Text>
                </View>
              </View>
            );
          }}
          renderItem={({ item }) => {
            const colors = getStatusColors(item.master_status || item.status);
            const meta = [item.canonical_project_name, item.canonical_property_name]
              .filter(Boolean)
              .join(" • ");

            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.9}
                onPress={() => {
                  router.push({
                    pathname: "/StockRequestDetails",
                    params: {
                      request_id: String(item.request_id),
                      project_name: item.project_name ?? "",
                      property_name: item.property_name ?? "",
                      canonical_project_name: item.canonical_project_name ?? "",
                      canonical_property_name: item.canonical_property_name ?? "",
                      engineer_name: item.engineer_name ?? "",
                      deli_date: item.deli_date ?? "",
                      employee_code: employeeCode,
                    },
                  });
                }}
              >
                <View style={styles.cardTopRow}>
                  <View style={styles.itemIcon}>
                    <Ionicons name="cube-outline" size={18} color={C.primary} />
                  </View>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.item_name || "—"}
                    </Text>

                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {meta || "—"}
                    </Text>
                  </View>

                  <View style={[styles.pill, { backgroundColor: colors.bg, borderColor: colors.fg }]}>
                    <Text style={[styles.pillText, { color: colors.fg }]}>
                      {(item.master_status || item.status || "").toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardBottomRow}>
                  <View style={styles.metaPill}>
                    <Ionicons name="time-outline" size={14} color={C.mutedText} />
                    <Text style={styles.metaPillText}>
                      {item.created_at ? formatISTDateTime(item.created_at) : "—"}
                    </Text>
                  </View>

                  {item.engineer_name ? (
                    <View style={styles.metaPill}>
                      <Ionicons name="person-outline" size={14} color={C.mutedText} />
                      <Text style={styles.metaPillText} numberOfLines={1}>
                        {item.engineer_name}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            !isInitialLoading && !isQueryLoading ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="search-outline" size={26} color={C.subtleText} />
                <Text style={styles.emptyText}>No results found</Text>
                <Text style={styles.emptySubText}>Try changing filters or search keywords.</Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            isPaging ? <ActivityIndicator color={C.primary} style={{ padding: 18 }} /> : <View style={{ height: 12 }} />
          }
        />

        <Modal
          visible={filterOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setFilterOpen(false)}
        >
          <Pressable style={styles.sheetBackdrop} onPress={() => setFilterOpen(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.sheetHandle} />

              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Filter Requests</Text>
                <TouchableOpacity style={styles.sheetClose} onPress={() => setFilterOpen(false)} activeOpacity={0.85}>
                  <Ionicons name="close" size={20} color={C.text} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 18 }}>
                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>Status</Text>
                    <Text style={styles.sectionHint}>Single select</Text>
                  </View>

                  <View style={styles.chipsWrap}>
                    {STATUS_OPTIONS.map((s) => {
                      const active = draftSelectedStatus === s.key;
                      return (
                        <TouchableOpacity
                          key={s.key}
                          onPress={() => selectDraftStatus(s.key)}
                          activeOpacity={0.85}
                          style={[styles.chip, active ? styles.chipActive : null]}
                        >
                          <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                            {s.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {draftSelectedStatus ? (
                    <Text style={styles.tapToClearHint}>Tap selected status again to clear.</Text>
                  ) : null}
                </View>

                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>Property</Text>
                    <Text style={styles.sectionHint}>Single select</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.propertySummaryBtn}
                    onPress={() => setDraftPropertyPickerOpen((p) => !p)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.propertySummaryLeft}>
                      <View style={styles.iconBadge}>
                        <Ionicons name="business" size={16} color={C.primary} />
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={styles.propertySummaryLabel}>Selected</Text>
                        <Text style={styles.propertySummaryValue} numberOfLines={1}>
                          {selectedPropertySummary}
                        </Text>
                      </View>
                    </View>

                    <Ionicons
                      name={draftPropertyPickerOpen ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={C.mutedText}
                    />
                  </TouchableOpacity>

                  {draftPropertyPickerOpen ? (
                    <View style={styles.propertyPickerBox}>
                      <View style={styles.propertySearchRow}>
                        <Ionicons name="search" size={16} color={C.subtleText} />
                        <TextInput
                          style={styles.propertySearchInput}
                          placeholder="Search property / project..."
                          placeholderTextColor={C.subtleText}
                          value={draftPropertySearch}
                          onChangeText={setDraftPropertySearch}
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                        {draftPropertySearch.length > 0 ? (
                          <TouchableOpacity onPress={() => setDraftPropertySearch("")} activeOpacity={0.85}>
                            <Ionicons name="close" size={16} color={C.subtleText} />
                          </TouchableOpacity>
                        ) : null}
                      </View>

                      <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
                        <TouchableOpacity
                          style={[
                            styles.propRow,
                            !draftSelectedProperty ? styles.propRowActive : null,
                          ]}
                          onPress={() => selectDraftProperty("all")}
                          activeOpacity={0.85}
                        >
                          <Ionicons
                            name={!draftSelectedProperty ? "checkmark-circle" : "ellipse-outline"}
                            size={18}
                            style={{ marginRight: 10 }}
                            color={!draftSelectedProperty ? BRAND_BLUE : MUTED}
                          />
                          <Text
                            style={[
                              styles.propRowText,
                              !draftSelectedProperty ? styles.propRowTextActive : null,
                            ]}
                          >
                            All Properties
                          </Text>
                        </TouchableOpacity>

                        {filteredPropertyOptions
                          .filter((p) => p.key !== "all")
                          .map((p) => {
                            const active = draftSelectedProperty === p.key;
                            return (
                              <TouchableOpacity
                                key={p.key}
                                style={[styles.propRow, active ? styles.propRowActive : null]}
                                onPress={() => selectDraftProperty(p.key)}
                                activeOpacity={0.85}
                              >
                                <Ionicons
                                  name={active ? "checkmark-circle" : "ellipse-outline"}
                                  size={18}
                                  style={{ marginRight: 10 }}
                                  color={active ? C.primary : C.mutedText}
                                />
                                <Text style={[styles.propRowText, active ? styles.propRowTextActive : null]}>
                                  {p.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                      </ScrollView>

                      {draftSelectedProperty ? (
                        <Text style={styles.tapToClearHint}>Tap selected property again to clear.</Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </ScrollView>

              <View style={styles.sheetFooter}>
                <TouchableOpacity style={styles.ghostBtn} onPress={clearDraft} activeOpacity={0.85}>
                  <Text style={styles.ghostBtnText}>Clear</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.primaryBtn} onPress={applyFilters} activeOpacity={0.85}>
                  <Text style={styles.primaryBtnText}>Apply Filters</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </SafeAreaView>
  );
};

const createStyles = (C: ReturnType<typeof useTheme>["theme"]["colors"]) => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.bg,
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) : 0,
  },
  container: { flex: 1, backgroundColor: C.bg },

  headerWrap: {
    backgroundColor: C.bg,
    paddingBottom: 8,
  },

  searchRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    alignItems: "center",
  },

  filterBtnNextToSearch: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },

  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 46,
    borderWidth: 1,
    borderColor: C.border,
  },
  input: {
    flex: 1,
    marginLeft: 10,
    fontSize: 11,
    fontWeight: "700",
    color: C.text,
  },

  resetPill: {
    height: 46,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  resetPillText: { fontSize: 10, fontWeight: "600", color: C.text },

  list: { paddingHorizontal: 12, paddingBottom: 20 },

  sectionHeaderWrap: {
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: C.bg,
  },
  sectionHeaderChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  sectionHeaderText: {
    fontSize: 10,
    fontWeight: "700",
    color: C.text,
  },

  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },

  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  itemIcon: {
    height: 40,
    width: 40,
    borderRadius: 14,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },

  cardTitle: { fontSize: 11, fontWeight: "700", color: C.text },
  cardMeta: { marginTop: 4, fontSize: 10, fontWeight: "600", color: C.mutedText },

  pill: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  pillText: { fontSize: 10, fontWeight: "700" },

  cardBottomRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
  },
  metaPillText: { fontSize: 11, fontWeight: "600", color: C.mutedText },

  emptyWrap: {
    marginTop: 60,
    alignItems: "center",
    gap: 8,
  },
  emptyText: { textAlign: "center", color: C.subtleText, fontWeight: "700", fontSize: 12 },
  emptySubText: { textAlign: "center", color: C.subtleText, fontWeight: "600", fontSize: 10 },

  sheetBackdrop: { flex: 1, backgroundColor: C.overlay, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: C.borderStrong,
    marginBottom: 10,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: { fontSize: 12, fontWeight: "700", color: C.text },
  sheetClose: {
    height: 40,
    width: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.border,
  },

  sectionCard: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    padding: 12,
  },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 12, fontWeight: "700", color: C.text },
  sectionHint: { fontSize: 10, fontWeight: "600", color: C.subtleText },

  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.borderStrong,
    backgroundColor: C.surface,
    maxWidth: "100%",
  },
  chipActive: { backgroundColor: C.primarySoft, borderColor: C.primary },
  chipText: { fontSize: 12, fontWeight: "700", color: C.text },
  chipTextActive: { color: C.primary },

  tapToClearHint: {
    marginTop: 10,
    color: C.mutedText,
    fontWeight: "600",
    fontSize: 11,
  },

  propertySummaryBtn: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceAlt,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  propertySummaryLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  iconBadge: {
    height: 34,
    width: 34,
    borderRadius: 12,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  propertySummaryLabel: { fontSize: 11, fontWeight: "700", color: C.mutedText },
  propertySummaryValue: { fontSize: 12, fontWeight: "700", color: C.text, marginTop: 2 },

  propertyPickerBox: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    padding: 12,
  },
  propertySearchRow: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  propertySearchInput: { flex: 1, marginLeft: 10, fontSize: 12, fontWeight: "700", color: C.text },

  propRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    marginTop: 10,
  },
  propRowActive: { borderColor: C.primary, backgroundColor: C.primarySoft },
  propRowText: { flex: 1, fontSize: 12, fontWeight: "700", color: C.text },
  propRowTextActive: { color: C.primary },

  sheetFooter: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  ghostBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: C.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
  },
  ghostBtnText: { fontWeight: "700", color: C.text, fontSize: 12 },

  primaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: C.primaryStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { fontWeight: "700", color: C.white, fontSize: 12 },
});

export default StockManager;
