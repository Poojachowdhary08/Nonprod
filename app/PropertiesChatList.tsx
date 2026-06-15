import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { 
  View, TouchableOpacity, StyleSheet, FlatList, TextInput, Dimensions, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter, useNavigation, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ModalSelector from "@/components/AppModalSelect";
import { useFontScale } from "@/context/FontScaleContext";
import TText from "@/components/TText";

import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
import { authenticatedFetch } from "../utils/auth";
const ICON_GREY = "#3A3A3C";

type ProjectOption = { key: string | number; label: string };

const PropertiesChatList: React.FC = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams();

  const userDetails = {
    employee_code: (params?.employee_code as string) || "",
    first_name: (params?.first_name as string) || "",
    last_name: (params?.last_name as string) || "",
    email: (params?.email as string) || "",
  };

  const modalSelectorRef = useRef<any>(null);

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const [properties, setProperties] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [numColumns, setNumColumns] = useState(1);
  const [projectFilter, setProjectFilter] = useState<string>(""); // stores label
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([{ key: "-1", label: "All Projects" }]);

  useEffect(() => {
    fetchProperties();

    const handleResize = () => {
      const w = Dimensions.get("window").width;
      setNumColumns(w < 620 ? 1 : w < 980 ? 2 : 3);
    };
    handleResize();
    const sub = Dimensions.addEventListener("change", handleResize);
    return () => sub?.remove();
  }, []);

  const fetchProperties = async () => {
    if (!userDetails.employee_code) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const response = await authenticatedFetch(`${APP_API_BASE_URL}/employee-properties/${userDetails.employee_code}`);
      const json = await response.json();

      const props = Array.isArray(json?.properties) ? json.properties : [];
      setProperties(props);

      const uniqueProjects = Array.from(new Set(props.map((p: any) => p.project_name).filter(Boolean)));
      const formattedProjects: ProjectOption[] = uniqueProjects.map((name, idx) => ({
        key: idx.toString(),
        label: String(name),
      }));
      setProjectOptions([{ key: "-1", label: "All Projects" }, ...formattedProjects]);
    } catch (error) {
      setProperties([]);
    } finally {
      setIsLoading(false);
    }
  };

  const refresh = useCallback(async () => {
    try {
      setIsRefreshing(true);
      await fetchProperties();
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Filtering
  const filteredProperties = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const base = properties.filter((p) => {
      const pn = String(p?.property_name || "").toLowerCase();
      const prn = String(p?.project_name || "").toLowerCase();
      const pid = String(p?.projectid || p?.project_id || "").toLowerCase();
      return pn.includes(q) || prn.includes(q) || pid.includes(q);
    });

    if (!projectFilter) return base;
    const wanted = projectFilter.toLowerCase();
    return base.filter((p) => String(p?.project_name || "").toLowerCase() === wanted);
  }, [properties, searchQuery, projectFilter]);

  const getStatusStyle = (status?: string) => {
    switch ((status || "").toLowerCase()) {
      case "ongoing":
        return { bg: "#EAF6EE", fg: "#136A3A", bd: "#136A3A" };
      case "planning":
        return { bg: "#E8DAEF", fg: "#6C3483", bd: "#6C3483" };
      default:
        return { bg: "#F1F2F4", fg: "#2E2E2E", bd: "#D0D3D4" };
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const { bg, fg, bd } = getStatusStyle(item?.status);

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.9}
        onPress={() => {
          try {
            const encodedUserDetails = encodeURIComponent(JSON.stringify(userDetails));
            router.push({
              pathname: "/PropertyChatsWrapper",
              params: {
                propertyId: item.property_id,
                projectId: item.project_id,
                userDetails: encodedUserDetails,
              },
            });
          } catch {}
        }}
      >
        <View style={styles.cardHeader}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.titleRow}>
              <Ionicons name="home-outline" size={18} color={ICON_GREY} style={{ marginRight: 6 }} />
              <TText style={styles.projectTitle} numberOfLines={1}>
                {item.property_name}
              </TText>
            </View>
            <View style={styles.metaRow}>
              <Ionicons name="business-outline" size={16} color={ICON_GREY} />
              <TText style={styles.metaText} numberOfLines={1}>
                {item.project_name}
              </TText>
            </View>
          </View>

          <View style={[styles.statusPill, { backgroundColor: bg, borderColor: bd }]}>
            <TText style={[styles.statusPillText, { color: fg }]}>{String(item?.status || "N/A").toUpperCase()}</TText>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Loading
  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={ICON_GREY} />
        <TText style={{ marginTop: 8, color: "#555" }}>Loading properties…</TText>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="properties-chat-list-root">
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
            <Ionicons name="arrow-back" size={22} color={ICON_GREY} />
          </TouchableOpacity>
          <TText style={styles.headerTitle}>Property List</TText>
        </View>
        <TouchableOpacity onPress={() => router.push("/HomeScreen")} style={styles.headerBtn}>
          <Ionicons name="home-outline" size={22} color={ICON_GREY} />
        </TouchableOpacity>
      </View>

      {/* Controls */}
      <View style={styles.controlsBar}>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={ICON_GREY} style={{ marginRight: 6 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by property / project / project id"
            placeholderTextColor="#7A7A7A"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
          {!!searchQuery && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color={ICON_GREY} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={styles.chipButton} onPress={() => modalSelectorRef.current?.open()}>
        <Ionicons name="options" size={22} color="#5a5a5c" />

        </TouchableOpacity>

        {/* Hidden modal selector */}
        <ModalSelector
          ref={modalSelectorRef}
          data={projectOptions}
          initValue="Filter by Project"
          onChange={(option: any) => setProjectFilter(String(option.label) === "All Projects" ? "" : String(option.label))}
          style={{ position: "absolute", top: -9999, left: -9999 }}
          selectStyle={{ borderWidth: 0 }}
          optionTextStyle={{ fontSize: 14, color: "#222" }}
          cancelStyle={{ backgroundColor: "#EFEFEF" }}
          cancelTextStyle={{ color: "#333" }}
          cancelText="Cancel"
        />
      </View>

      {/* List */}
      <FlatList
        data={filteredProperties}
        renderItem={renderItem}
        keyExtractor={(item: any) => String(item.property_id)}
        numColumns={numColumns}
        key={numColumns}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="search-outline" size={28} color={ICON_GREY} />
            <TText style={styles.emptyTitle}>No properties found</TText>
            <TText style={styles.emptyText}>Try different keywords or clear the filter.</TText>
          </View>
        }
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F7F8" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#ECECEC",
    justifyContent: "space-between",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
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
  chipText: { fontSize: 12, color: "#2A2A2E", fontWeight: "600", flexShrink: 1 },

  listContainer: { paddingHorizontal: 8, paddingBottom: 16 },

  card: {
    flex: 1,
    margin: 8,
    padding: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E6E6E8",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  titleRow: { flexDirection: "row", alignItems: "center", marginBottom: 6, minWidth: 0 },
  projectTitle: { fontWeight: "700", fontSize: 16, color: "#1D1D1F", textTransform: "capitalize", flexShrink: 1 },

  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: 13, color: "#2C2C2E", textTransform: "capitalize", flexShrink: 1 },

  statusPill: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  statusPillText: { fontSize: 11, fontWeight: "700" },

  loader: { flex: 1, justifyContent: "center", alignItems: "center" },

  emptyWrap: { alignItems: "center", paddingVertical: 40, gap: 6 },
  emptyTitle: { fontWeight: "700", color: "#2C2C2E", marginTop: 6 },
  emptyText: { color: "#6B6B6E", fontSize: 12 },
});

export default PropertiesChatList;
