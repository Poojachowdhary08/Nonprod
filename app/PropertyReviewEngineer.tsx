import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
// PropertyReviewEngineer.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  TextInput,
  RefreshControl,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ModalSelector from "@/components/AppModalSelect";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFontScale } from "@/context/FontScaleContext";
import TText from "@/components/TText";
import { useTheme } from "@/src/theme/ThemeProvider";
import { authenticatedFetch } from "../utils/auth";

interface PropertyReviewEngineerProps {
  propertyId: string;
  projectId: string;
  userDetails: { email: string; first_name: string; last_name: string; employee_code: string };
}

type StatusFilter = "all" | "open" | "request to close" | "closed";

type Ticket = {
  issue_id?: string;
  property_id?: string;
  issue_type?: string;
  description?: string;
  status?: string;
  assigned_to_email?: string | null;
  reported_by_email?: string | null;
};

const API_BASE_URL = `${APP_API_BASE_URL}`;
const cacheKeyFor = (propertyId: string) => `tickets:property:${propertyId}`;

async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return !!(state.isConnected && state.isInternetReachable !== false);
}

const PropertyReviewEngineer: React.FC<PropertyReviewEngineerProps> = ({
  propertyId,
  projectId,
  userDetails,
}) => {
  const router = useRouter();
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [online, setOnline] = useState<boolean>(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  // connectivity listener
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const on = !!(state.isConnected && state.isInternetReachable !== false);
      setOnline(on);
    });
    (async () => setOnline(await isOnline()))();
    return () => unsub && unsub();
  }, []);

  const loadFromCache = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(cacheKeyFor(propertyId));
      if (!raw) return { tickets: [] as Ticket[], ts: null as string | null };
      const parsed = JSON.parse(raw) as { tickets: Ticket[]; ts?: string };
      return { tickets: parsed.tickets || [], ts: parsed.ts || null };
    } catch {
      return { tickets: [] as Ticket[], ts: null };
    }
  }, [propertyId]);

  const saveToCache = useCallback(
    async (data: Ticket[]) => {
      const ts = new Date().toISOString();
      setLastSyncedAt(ts);
      try {
        await AsyncStorage.setItem(cacheKeyFor(propertyId), JSON.stringify({ tickets: data, ts }));
      } catch {
        // ignore cache write errors
      }
    },
    [propertyId]
  );

  const fetchTickets = useCallback(async () => {
    try {
      if (!propertyId) return;

      // If offline: pull from cache and bail.
      if (!online) {
        const { tickets: cached, ts } = await loadFromCache();
        setTickets(Array.isArray(cached) ? cached : []);
        setLastSyncedAt(ts);
        return;
      }

      // Online: fetch and cache.
      const resp = await authenticatedFetch(`${API_BASE_URL}/tickets/property/${propertyId}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const list: Ticket[] = Array.isArray(data.tickets) ? data.tickets : [];
      setTickets(list);
      await saveToCache(list);
    } catch (error) {
      // On error, try cache as fallback
      const { tickets: cached, ts } = await loadFromCache();
      if (cached.length > 0) {
        setTickets(cached);
        setLastSyncedAt(ts);
        if (online) {
          Alert.alert("Network issue", "Showing cached tickets due to a fetch error.");
        }
      } else {
        console.error("❌ Error fetching ticket details:", error);
        Alert.alert("Error", "Failed to fetch ticket details.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [propertyId, online, loadFromCache, saveToCache]);

  useEffect(() => {
    setLoading(true);
    fetchTickets();
  }, [fetchTickets]);

  const onRefresh = useCallback(() => {
    if (!online) {
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    fetchTickets();
  }, [fetchTickets, online]);

  // Softer pastel pills like the screenshot (no borders, gentle backgrounds)
  const getStatusStyle = (status: string) => {
    switch ((status || "").toLowerCase()) {
      case "open":
        return { bg: "#E7F0FF", text: "#2F6BFF" }; // blue-ish
      case "request to close":
        return { bg: "#FFEFD6", text: "#F59E0B" }; // amber-ish
      case "closed":
        return { bg: "#FFE3E6", text: "#F43F5E" }; // pink/red-ish
      default:
        return { bg: "#EEEFF2", text: "#8A93A3" }; // neutral
    }
  };

  const filteredTickets = useMemo(() => {
    const base = (tickets || []).filter((t) => t && t.issue_type);
    const bySearch = searchText
      ? base.filter((t) =>
          `${t.issue_type} ${t.description ?? ""} ${t.issue_id ?? ""}`
            .toLowerCase()
            .includes(searchText.toLowerCase())
        )
      : base;

    if (statusFilter === "all") return bySearch;

    return bySearch.filter((t) => (t.status || "").toLowerCase() === statusFilter);
  }, [tickets, searchText, statusFilter]);

  const counts = useMemo(() => {
    const total = tickets.length;
    const open = tickets.filter((t) => (t.status || "").toLowerCase() === "open").length;
    const rtc = tickets.filter((t) => (t.status || "").toLowerCase() === "request to close").length;
    const closed = tickets.filter((t) => (t.status || "").toLowerCase() === "closed").length;
    return { total, open, rtc, closed };
  }, [tickets]);

  const modalOptions = useMemo(
    () => [
      { key: "all", label: `All (${counts.total})` },
      { key: "open", label: `Open (${counts.open})` },
      { key: "request to close", label: `Request to Close (${counts.rtc})` },
      { key: "closed", label: `Closed (${counts.closed})` },
    ],
    [counts]
  );

  // ✅ OFFLINE GUARD: do not navigate to TicketDetails when offline
  const handleCardClick = (ticket: Ticket) => {
    if (!online) {
      Alert.alert("Offline", "You’re offline. Connect to the internet to view ticket details.");
      return;
    }
    router.push({
      pathname: "/TicketDetails",
      params: {
        issue_id: ticket.issue_id,
        property_id: ticket.property_id,
        issue_type: ticket.issue_type,
        description: ticket.description,
        status: ticket.status,
        assigned_to_email: ticket.assigned_to_email ?? "Not Assigned",
        reported_by_email: ticket.reported_by_email ?? "",
        first_name: userDetails.first_name,
        last_name: userDetails.last_name,
        email: userDetails.email,
        employee_code: userDetails.employee_code,
      },
    });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={C.primaryStrong} />
        <TText style={styles.loadingText}>Loading ticket details...</TText>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="property-review-engineer-root">
      {/* Offline banner (kept for functionality, styled subtle) */}
      {!online && (
        <View style={styles.offlineBanner}>
          <TText style={styles.offlineText}>Testing with offline</TText>
        </View>
      )}

      {/* Top Row (matches screenshot): Search pill | Filter square | Add square */}
      <View style={styles.topRow}>
        {/* Search pill */}
        <View style={styles.searchPill}>
          <Ionicons name="search" size={18} color={C.subtleText} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search Inventories"
            value={searchText}
            onChangeText={setSearchText}
            placeholderTextColor={C.subtleText}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText("")} style={styles.clearBtn}>
              <Ionicons name="close" size={16} color={C.mutedText} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter square */}
        <View style={styles.squareWrap}>
          <ModalSelector
            data={modalOptions}
            keyExtractor={(item: any) => String(item.key)}
            labelExtractor={(item: any) => String(item.label)}
            onChange={(option: any) => setStatusFilter(option.key as StatusFilter)}
            animationType="fade"
            backdropPressToClose
            optionContainerStyle={{ backgroundColor: C.surface, borderBottomColor: C.border }}
            optionTextStyle={{ color: C.text }}
            cancelStyle={{ backgroundColor: C.surface }}
            cancelTextStyle={{ color: C.text }}
            overlayStyle={{ backgroundColor: C.overlay }}
            cancelText="Cancel"
          >
            <View style={styles.squareBtn}>
              <Ionicons name="filter" size={20} color={C.text} />
            </View>
          </ModalSelector>
        </View>

        {/* Add square */}
        <View style={styles.squareWrap}>
          <TouchableOpacity
            style={[styles.squareBtnPrimary, !online && { opacity: 0.85 }]}
            onPress={() =>
              router.push({
                pathname: "/PropertyRaiseIssue",
                params: {
                  property_id: propertyId,
                  project_id: projectId,
                  email: userDetails.email,
                  first_name: userDetails.first_name,
                  last_name: userDetails.last_name,
                  employee_code: userDetails.employee_code,
                },
              })
            }
            accessibilityLabel="Raise new ticket"
          >
            <Ionicons name="add" size={22} color={C.white} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Tickets List */}
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            enabled={online}
            tintColor={Platform.OS === "ios" ? C.primaryStrong : undefined}
            colors={Platform.OS === "android" ? [C.primaryStrong] : undefined}
          />
        }
      >
        {filteredTickets.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="chatbox-ellipses-outline" size={36} color={C.subtleText} />
            <TText style={styles.emptyTitle}>No tickets match your filters</TText>
            <TText style={styles.emptyHint}>
              {online
                ? "Try clearing search or changing the status filter."
                : "You’re offline and have no cached tickets yet."}
            </TText>
          </View>
        ) : (
          filteredTickets.map((ticket, index) => {
            const s = getStatusStyle(ticket.status || "");
            return (
              <TouchableOpacity
                key={index}
                style={[styles.card, !online && { opacity: 0.65 }]}
                onPress={() => handleCardClick(ticket)}
                disabled={!online}
                activeOpacity={online ? 0.9 : 1}
              >
                <View style={styles.cardRow}>
                  <View style={styles.cardLeft}>
                    <TText style={styles.cardTitle} numberOfLines={1}>
                      {ticket.issue_type || "Unknown"}
                    </TText>
                    <TText style={styles.cardSubtitle} numberOfLines={1}>
                      {ticket.description || "Testing with offline"}
                    </TText>
                  </View>

                  <View style={[styles.statusPill, { backgroundColor: s.bg }]}>
                    <TText style={[styles.statusText, { color: s.text }]}>
                      {String(ticket.status || "Unknown").toUpperCase()}
                    </TText>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
};

const createStyles = (C: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, padding: 16 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 8, color: C.mutedText },

  // subtle offline banner (your screenshot shows "Testing with offline" text in cards,
  // but this only appears when actually offline)
  offlineBanner: {
    backgroundColor: C.surfaceAlt,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 12,
    ...(Platform.OS === "android"
      ? { elevation: 2 }
      : { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }),
  },
  offlineText: { color: C.mutedText, fontWeight: "600" },

  // top row
  topRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },

  // search pill (like screenshot)
  searchPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 48,
    ...(Platform.OS === "android"
      ? { elevation: 2 }
      : { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }),
  },
  searchInput: {
    flex: 1,
    height: 36,
    color: C.text,
    fontSize: 13,
    fontWeight: "600",
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  clearBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: C.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },

  // square icon buttons (filter + add)
  squareWrap: { width: 35, height: 35 },
  squareBtn: {
    width: 35,
    height: 35,
    borderRadius: 6,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "android"
      ? { elevation: 2 }
      : { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }),
  },
  squareBtnPrimary: {
    width: 35,
    height: 35,
    borderRadius: 6,
    backgroundColor: C.primaryStrong,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "android"
      ? { elevation: 3 }
      : { shadowColor: "#000", shadowOpacity: 0.10, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }),
  },

  // cards (screenshot style)
  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    marginBottom: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...(Platform.OS === "android"
      ? { elevation: 2 }
      : { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }),
  },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  cardLeft: { flex: 1, minWidth: 0 },
  cardTitle: { fontWeight: "700", fontSize: 11, color: C.text },
  cardSubtitle: { marginTop: 4, fontSize: 10, color: C.subtleText },

  // pill like screenshot (no border)
  statusPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statusText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },

  emptyWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 50, gap: 10 },
  emptyTitle: { color: C.text, fontWeight: "700", fontSize: 14 },
  emptyHint: { color: C.mutedText, fontSize: 12, textAlign: "center", paddingHorizontal: 20 },
});

export default PropertyReviewEngineer;
