import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { 
  View, TouchableOpacity, StyleSheet, FlatList, TextInput, Dimensions, ActivityIndicator, Platform, UIManager, LayoutAnimation, Animated, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import ModalSelector from "@/components/AppModalSelect";

import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
import { authenticatedFetch } from "../utils/auth";
// ✅ Telemetry
import {
  trackScreen,
  trackUI,
  trackNetwork,
  updateDynamicContext,
  clearDynamicContext,
  startScreenTimer,
} from "../utils/telemetry";
import { useFontScale } from "@/context/FontScaleContext";
import TText from "@/components/TText";

interface Labor {
  id: string | number;
  name: string;
  number: string;
  status: string;
  work_type: string;
  payment_type: string;
  contractor_id?: number | null;
  type: "LABOR";
}

interface Contractor {
  id: number | string;
  name: string;
  number: string;
  work_type: string;
  status: string;
  verified: string;
  type: "CONTRACTOR";
  labors: Labor[];
}

const ICON_GREY = "#3A3A3C";

const ManPowerList: React.FC = () => {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [data, setData] = useState<Contractor[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [selectedStatus, setSelectedStatus] = useState("all");
  const modalSelectorRef = useRef<any>(null);
  const [numColumns, setNumColumns] = useState<number>(1);

  const [expandedItems, setExpandedItems] = useState<{ [key: string]: boolean }>(
    {}
  );
  const rotationAnimRef = useRef<{ [key: string]: Animated.Value }>({});

  // -----------------------------
  // ✅ Telemetry: screen context + enter/exit timer
  // -----------------------------
  useEffect(() => {
    updateDynamicContext({
      screen: "ManPowerList",
      employee_code: params?.employee_code ? String(params.employee_code) : "",
    });

    trackScreen("ManPowerList", {
      platform: Platform.OS,
      has_employee_code: !!params?.employee_code,
    });

    return () => {
      clearDynamicContext();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const stop = startScreenTimer("ManPowerList", {
      has_employee_code: !!params?.employee_code,
    });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------
  // ✅ Fetch (with network telemetry)
  // -----------------------------
  const fetchContractorLabors = useCallback(async () => {
    const t0 = Date.now();
    trackUI({
      screen: "ManPowerList",
      element: "fetch_contractors_start",
      action: "submit",
      extra: {},
    });

    try {
      setIsLoading(true);

      const response = await authenticatedFetch(`${APP_API_BASE_URL}/labors-contractors`);
      const json = await response.json();

      trackNetwork({
        url: "/labors-contractors",
        method: "GET",
        status: response.status,
        ok: response.ok,
        durationMs: Date.now() - t0,
        extra: { kind: "initial_fetch" },
      });

      const list = Array.isArray(json) ? json : [];
      setData(list);

      trackUI({
        screen: "ManPowerList",
        element: "fetch_contractors_success",
        action: "submit",
        extra: { rows: list.length },
      });
    } catch (e: any) {
      trackNetwork({
        url: "/labors-contractors",
        method: "GET",
        status: 0,
        ok: false,
        durationMs: Date.now() - t0,
        extra: { kind: "initial_fetch", error: String(e?.message || e) },
      });

      trackUI({
        screen: "ManPowerList",
        element: "fetch_contractors_error",
        action: "submit",
        extra: { message: String(e?.message || e) },
      });

      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    const t0 = Date.now();
    trackUI({
      screen: "ManPowerList",
      element: "pull_to_refresh",
      action: "submit",
      extra: {},
    });

    try {
      setIsRefreshing(true);
      await fetchContractorLabors();
      trackUI({
        screen: "ManPowerList",
        element: "pull_to_refresh_done",
        action: "submit",
        extra: { duration_ms: Date.now() - t0 },
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchContractorLabors]);

  useFocusEffect(
    useCallback(() => {
      fetchContractorLabors();
    }, [fetchContractorLabors])
  );

  // -----------------------------
  // ✅ Columns responsive
  // -----------------------------
  useEffect(() => {
    const handleResize = () => {
      const screenWidth = Dimensions.get("window").width;
      const next = screenWidth < 620 ? 1 : screenWidth < 980 ? 2 : 3;
      setNumColumns(next);
    };
    handleResize();
    const subscription = Dimensions.addEventListener("change", handleResize);
    return () => subscription?.remove();
  }, []);

  // -----------------------------
  // ✅ Android layout animation
  // -----------------------------
  useEffect(() => {
    if (Platform.OS === "android") {
      UIManager.setLayoutAnimationEnabledExperimental &&
        UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  // -----------------------------
  // ✅ Helpers: status colors
  // -----------------------------
  const statusBg = useCallback((status: string) => {
    switch ((status || "").toLowerCase()) {
      case "active":
        return "#EAF6EE";
      case "inactive":
        return "#FCEBEC";
      default:
        return "#F1F2F4";
    }
  }, []);

  const statusText = useCallback((status: string) => {
    switch ((status || "").toLowerCase()) {
      case "active":
        return "#136A3A";
      case "inactive":
        return "#8E1B1B";
      default:
        return "#2E2E2E";
    }
  }, []);

  // -----------------------------
  // ✅ Search / filter
  // -----------------------------
  const filteredData = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return data;

    return data.filter((contractor) => {
      const contractorMatch =
        (contractor.name || "").toLowerCase().includes(q) ||
        (contractor.number || "").toLowerCase().includes(q) ||
        (contractor.status || "").toLowerCase().includes(q) ||
        (contractor.work_type || "").toLowerCase().includes(q);

      const laborMatch = contractor.labors?.some((labor) =>
        (labor.name || "").toLowerCase().includes(q)
      );

      return contractorMatch || laborMatch;
    });
  }, [searchQuery, data]);

  const finalFilteredData = useMemo(() => {
    if (selectedStatus === "all") return filteredData;
    const wanted = selectedStatus.toLowerCase();
    return filteredData.filter(
      (item) => (item.status || "").toLowerCase() === wanted
    );
  }, [filteredData, selectedStatus]);

  const filterOptions = [
    { key: "all", label: "All" },
    { key: "Active", label: "Active" },
    { key: "Inactive", label: "Inactive" },
  ];

  // ✅ Telemetry: debounce “search submit” (don’t spam)
  const searchDebounceRef = useRef<any>(null);
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    searchDebounceRef.current = setTimeout(() => {
      const q = (searchQuery || "").trim();
      if (!q) return;

      trackUI({
        screen: "ManPowerList",
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

  // Expand logic: auto-expand parent when searching for labor names
  useEffect(() => {
    if (!searchQuery.trim()) return;
    const q = searchQuery.toLowerCase();
    const toExpand: { [key: string]: boolean } = {};
    data.forEach((contractor) => {
      if (contractor.type === "CONTRACTOR") {
        const isLaborMatched = contractor.labors?.some((l) =>
          (l.name || "").toLowerCase().includes(q)
        );
        if (isLaborMatched) toExpand[String(contractor.id)] = true;
      }
    });
    setExpandedItems((prev) => ({ ...prev, ...toExpand }));
  }, [searchQuery, data]);

  // Reset expanded on data reload
  useEffect(() => {
    setExpandedItems({});
    rotationAnimRef.current = {};
  }, [data]);

  const toggleExpand = (id: string | number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const key = String(id);
    const isExpanding = !expandedItems[key];

    // ✅ Telemetry
    trackUI({
      screen: "ManPowerList",
      element: "expand_toggle",
      action: "toggle",
      extra: { contractor_id: key, expanding: isExpanding },
    });

    if (!rotationAnimRef.current[key]) {
      rotationAnimRef.current[key] = new Animated.Value(isExpanding ? 0 : 1);
    }

    Animated.spring(rotationAnimRef.current[key], {
      toValue: isExpanding ? 1 : 0,
      useNativeDriver: true,
      friction: 6,
      tension: 90,
    }).start();

    setExpandedItems((prev) => ({ ...prev, [key]: isExpanding }));
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);

    // light “typing” telemetry (optional, low cost)
    trackUI({
      screen: "ManPowerList",
      element: "search_input",
      action: "change",
      extra: { len: query.length },
    });
  };

  const keyExtractor = useCallback((item: Contractor | Labor) => String(item.id), []);

  const renderEmpty = useCallback(() => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="search-outline" size={28} color={ICON_GREY} />
        <TText style={styles.emptyTitle}>No results</TText>
        <TText style={styles.emptyText}>Try a different keyword or clear the filters.</TText>
      </View>
    );
  }, [isLoading]);

  const renderItem = useCallback(
    ({ item }: { item: Contractor | Labor }) => {
      const goToDetails = (it: Contractor | Labor) => {
        trackUI({
          screen: "ManPowerList",
          element: "navigate_ManPowerListDetails",
          action: "click",
          extra: { id: String(it.id), type: it.type, status: it.status },
        });

        router.push({
          pathname: "/ManPowerListDetails",
          params: {
            id: String(it.id),
            name: it.name,
            number: it.number,
            status: it.status,
            work_type: it.work_type,
            type: it.type,
            ...(it.type === "LABOR" ? { payment_type: (it as Labor).payment_type } : {}),
          },
        });
      };

      if (item.type === "LABOR" && !(item as Labor).contractor_id) {
        return (
          <TouchableOpacity style={styles.card} onPress={() => goToDetails(item)}>
            <View style={styles.cardHeader}>
              <View style={styles.titleWrap}>
                <Ionicons name="person-outline" size={18} color={ICON_GREY} style={styles.titleIcon} />
                <TText style={styles.cardTitle} numberOfLines={1}>{item.name}</TText>
              </View>
              <View
                style={[
                  styles.statusPill,
                  { backgroundColor: statusBg(item.status), borderColor: statusText(item.status) },
                ]}
              >
                <TText style={[styles.statusPillText, { color: statusText(item.status) }]}>
                  {(item.status || "").toUpperCase()}
                </TText>
              </View>
            </View>
            <View style={styles.metaRow}>
              <Ionicons name="hammer-outline" size={16} color={ICON_GREY} />
              <TText style={styles.metaText} numberOfLines={1}>{(item.work_type || "").trim() || "—"}</TText>
            </View>
            <View style={styles.metaRow}>
              <Ionicons name="id-card-outline" size={16} color={ICON_GREY} />
              <TText style={styles.metaText}>LABOR | {String(item.id)}</TText>
            </View>
          </TouchableOpacity>
        );
      }

      if (item.type === "CONTRACTOR") {
        const contractor = item as Contractor;
        const isExpanded = !!expandedItems[String(contractor.id)];
        const hasChildren = (contractor.labors || []).length > 0;

        const rotate =
          rotationAnimRef.current[String(contractor.id)]
            ? rotationAnimRef.current[String(contractor.id)].interpolate({
                inputRange: [0, 1],
                outputRange: ["0deg", "180deg"],
              })
            : "0deg";

        return (
          <View>
            <TouchableOpacity style={styles.card} onPress={() => goToDetails(contractor)}>
              <View style={styles.cardHeader}>
                <View style={styles.titleWrap}>
                  <Ionicons name="briefcase-outline" size={18} color={ICON_GREY} style={styles.titleIcon} />
                  <View style={{ flex: 1 }}>
                    <TText style={styles.cardTitle} numberOfLines={1}>{contractor.name}</TText>
                    <TText style={styles.cardSub} numberOfLines={1}>CONTRACTOR | {String(contractor.id)}</TText>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => toggleExpand(contractor.id)}
                  style={[
                    styles.statusPill,
                    {
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: statusBg(contractor.status),
                      borderColor: statusText(contractor.status),
                    },
                  ]}
                >
                  <TText style={[styles.statusPillText, { color: statusText(contractor.status) }]}>
                    {(contractor.status || "").toUpperCase()}
                  </TText>
                  {hasChildren && (
                    <Animated.View style={{ transform: [{ rotate }], marginLeft: 4 }}>
                      <Ionicons name="chevron-down-outline" size={16} color={statusText(contractor.status)} />
                    </Animated.View>
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.metaRow}>
                <Ionicons name="hammer-outline" size={16} color={ICON_GREY} />
                <TText style={styles.metaText} numberOfLines={1}>
                  {(contractor.work_type || "").trim() || "—"}
                </TText>
              </View>
            </TouchableOpacity>

            {isExpanded &&
              contractor.labors.map((labor) => (
                <TouchableOpacity
                  key={String(labor.id)}
                  style={[styles.card, styles.childCard]}
                  onPress={() => goToDetails(labor)}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.titleWrap}>
                      <Ionicons name="person-outline" size={18} color={ICON_GREY} style={styles.titleIcon} />
                      <TText style={styles.cardTitle} numberOfLines={1}>{labor.name}</TText>
                    </View>
                    <View
                      style={[
                        styles.statusPill,
                        { backgroundColor: statusBg(labor.status), borderColor: statusText(labor.status) },
                      ]}
                    >
                      <TText style={[styles.statusPillText, { color: statusText(labor.status) }]}>
                        {(labor.status || "").toUpperCase()}
                      </TText>
                    </View>
                  </View>
                  <View style={styles.metaRow}>
                    <Ionicons name="hammer-outline" size={16} color={ICON_GREY} />
                    <TText style={styles.metaText} numberOfLines={1}>{(labor.work_type || "").trim() || "—"}</TText>
                  </View>
                  <View style={styles.metaRow}>
                    <Ionicons name="id-card-outline" size={16} color={ICON_GREY} />
                    <TText style={styles.metaText}>LABOR | {String(labor.id)}</TText>
                  </View>
                </TouchableOpacity>
              ))}
          </View>
        );
      }

      return null;
    },
    [expandedItems, router, statusBg, statusText]
  );

  return (
    <View style={styles.container} testID="man-power-list-root">
      {/* Header */}
      <View style={styles.headerContainer}>
        <TouchableOpacity
          onPress={() => {
            trackUI({ screen: "ManPowerList", element: "header_back", action: "click", extra: {} });
            router.back();
          }}
          style={styles.headerBtn}
        >
          <Ionicons name="arrow-back" size={22} color={ICON_GREY} />
        </TouchableOpacity>

        <TText style={styles.headerTitle}>Man Power List</TText>

        <TouchableOpacity
          onPress={() => {
            trackUI({ screen: "ManPowerList", element: "header_home", action: "click", extra: {} });
            router.push("/HomeScreen");
          }}
          style={styles.headerBtn}
        >
          <Ionicons name="home-outline" size={22} color={ICON_GREY} />
        </TouchableOpacity>
      </View>

      {/* Search + Actions */}
      <View style={styles.controlsBar}>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={ICON_GREY} style={{ marginRight: 6 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by contractor/labor/work type"
            value={searchQuery}
            onChangeText={handleSearch}
            autoCapitalize="none"
            placeholderTextColor="#7A7A7A"
          />
          {!!searchQuery && (
            <TouchableOpacity
              onPress={() => {
                trackUI({ screen: "ManPowerList", element: "search_clear", action: "click", extra: {} });
                setSearchQuery("");
              }}
            >
              <Ionicons name="close-circle" size={18} color={ICON_GREY} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.chipButton}
          onPress={() => {
            trackUI({ screen: "ManPowerList", element: "filter_open", action: "open", extra: {} });
            modalSelectorRef.current?.open();
          }}
        >
          <Ionicons name="options" size={22} color="#5a5a5c" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.chipButton, styles.addBtn]}
          onPress={() => {
            trackUI({ screen: "ManPowerList", element: "add_manpower", action: "click", extra: {} });
            router.push({
              pathname: "/ManPower",
              params: {
                employee_code: params?.employee_code,
                first_name: params?.first_name,
                last_name: params?.last_name,
                job_title: params?.job_title,
                phone_number: params?.phone_number,
                email: params?.email,
              },
            });
          }}
        >
          <Ionicons name="add-outline" size={22} color="#5a5a5c" />
        </TouchableOpacity>
      </View>

      {/* Hidden ModalSelector trigger */}
      <ModalSelector
        ref={modalSelectorRef}
        data={filterOptions}
        initValue="Select Status"
        onChange={(option: any) => {
          const next = String(option.key);
          setSelectedStatus(next);

          trackUI({
            screen: "ManPowerList",
            element: "filter_status",
            action: "click",
            extra: { status: next },
          });
        }}
        cancelText="Cancel"
        style={{ position: "absolute", top: -9999, left: -9999 }}
        selectStyle={{ borderWidth: 0 }}
        optionTextStyle={{ fontSize: 14, color: "#222" }}
        cancelStyle={{ backgroundColor: "#EFEFEF" }}
        cancelTextStyle={{ color: "#333" }}
      />

      {/* List */}
      {isLoading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={ICON_GREY} />
          <TText style={{ marginTop: 8, color: "#555" }}>Loading manpower…</TText>
        </View>
      ) : (
        <FlatList
          data={finalFilteredData}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContainer}
          numColumns={numColumns}
          key={numColumns}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
          ListEmptyComponent={renderEmpty}
          onScrollBeginDrag={() => {
            trackUI({ screen: "ManPowerList", element: "list_scroll", action: "open", extra: {} });
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F7F8" },

  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#ECECEC",
    justifyContent: "space-between",
  },
  headerBtn: { padding: 6, borderRadius: 8 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#1F1F1F" },

  controlsBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#EFEFEF",
  },
  searchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F1F3",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#E3E3E6",
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#191919",
    paddingVertical: 0,
  },

  chipButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D8D8DB",
    borderRadius: 10,
  },
  addBtn: { backgroundColor: "#FAFAFB" },

  listContainer: { paddingHorizontal: 8, paddingBottom: 16 },

  card: {
    flex: 1,
    margin: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E6E6E8",
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  childCard: {
    marginLeft: 24,
    backgroundColor: "#FAFAFB",
    borderColor: "#EAEAEA",
  },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  titleWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  titleIcon: { marginRight: 6 },
  cardTitle: { fontWeight: "700", fontSize: 14, color: "#1D1D1F" },
  cardSub: { fontSize: 12, color: "#6A6A6D", marginTop: 2 },

  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  metaText: { fontSize: 13, color: "#2C2C2E", flexShrink: 1 },

  statusPill: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusPillText: { fontSize: 11, fontWeight: "700" },

  loader: { flex: 1, justifyContent: "center", alignItems: "center" },

  emptyWrap: { alignItems: "center", paddingVertical: 40, gap: 6 },
  emptyTitle: { fontWeight: "700", color: "#2C2C2E", marginTop: 6 },
  emptyText: { color: "#6B6B6E", fontSize: 12 },
});

export default ManPowerList;
