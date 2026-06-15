import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";

import TText from "@/components/TText";
import SalesFooterNav from "./SalesFooterNav";
import {
  isSalesClientStage,
  normalizeSalesStageKey,
  salesStageLabel,
  type SalesLeadStage,
  type SalesLead,
  listSalesLeads,
} from "@/utils/salesLeads";

type LeadsFilterKey = "all" | SalesLeadStage;

type LeadSection = {
  key: string;
  label: string;
  items: SalesLead[];
};

const AVENUE_LOGO_URL =
  "https://avenuerealty.in/wp-content/uploads/2022/12/cropped-Avenue-reality-logo.png";

const STAGE_PROGRESS: Record<string, number> = {
  fresh: 0.22,
  requirements: 0.38,
  shortlist: 0.56,
  site_visit: 0.72,
  negotiate: 0.82,
  legal: 0.9,
  handover: 1,
  deal_close: 1,
  lost: 0.18,
};

const SALES_LEAD_TABS: LeadsFilterKey[] = [
  "all",
  "fresh",
  "requirements",
  "shortlist",
  "site_visit",
  "negotiate",
  "legal",
  "handover",
];

const stageFilterLabel = (key: LeadsFilterKey) =>
  key === "all" ? "All" : salesStageLabel(key);

const stagePillTone = (stageKey: string) => {
  const key = normalizeSalesStageKey(stageKey);

  switch (key) {
    case "fresh":
      return { bg: "#E7F0FF", fg: "#2464B2", bar: "#2C7BE5" };
    case "requirements":
      return { bg: "#ECE8FF", fg: "#5B56D6", bar: "#4B7FD1" };
    case "shortlist":
      return { bg: "#FFF0D9", fg: "#A66500", bar: "#F2A51A" };
    case "site_visit":
      return { bg: "#DDF5EC", fg: "#0A7A62", bar: "#2BA97E" };
    case "negotiate":
      return { bg: "#EAF5D8", fg: "#4A7A14", bar: "#77B539" };
    case "legal":
    case "handover":
    case "deal_close":
      return { bg: "#DDF5EC", fg: "#0A7A62", bar: "#2BA97E" };
    case "lost":
      return { bg: "#FBE3E3", fg: "#B23C3C", bar: "#D97373" };
    default:
      return { bg: "#ECEFF4", fg: "#5A6472", bar: "#CBD5E1" };
  }
};

const formatDealValue = (lead: SalesLead) => {
  const amount = Number(lead.value_amount || 0);

  if (!Number.isFinite(amount) || amount <= 0) return "₹0";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: lead.currency || "INR",
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatRelativeStamp = (value?: string | null) => {
  if (!value) return "Recently";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";

  const diffDays = Math.floor(
    (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "Last week";

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
};

const getLeadSubtitle = (lead: SalesLead) => {
  const details = lead.details_json || {};

  const company =
    details.company_name ||
    details.company ||
    details.organization ||
    details.organisation ||
    lead.source_code ||
    "Avenue Lead";

  const title =
    details.designation ||
    details.job_title ||
    details.role ||
    details.position ||
    lead.location_text ||
    "Opportunity";

  return `${company} · ${title}`;
};

const getLeadPhone = (lead: SalesLead) => {
  const details = lead.details_json || {};
  return String(details.phone || details.phone_number || details.mobile || "").trim();
};

const getLeadEmail = (lead: SalesLead) => {
  const details = lead.details_json || {};
  return String(details.email || details.email_id || "").trim();
};

const getOwnerLabel = (lead: SalesLead) => {
  const details = lead.details_json || {};
  return String(details.owner_name || details.assigned_to || "Sales").trim();
};

const isHotLead = (lead: SalesLead) => {
  const stage = normalizeSalesStageKey(String(lead.stage_key));
  return Number(lead.score || 0) >= 80 || stage === "negotiate" || stage === "legal";
};

const SalesLeads: React.FC = () => {
  const styles = useMemo(() => createStyles(), []);
  const router = useRouter();
  const params = useLocalSearchParams();

  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [employeeCode, setEmployeeCode] = useState("");
  const [activeFilter, setActiveFilter] = useState<LeadsFilterKey>("all");
  const [searchText, setSearchText] = useState("");

  const navParams = useMemo(
    () => ({
      first_name: String(params.first_name || ""),
      last_name: String(params.last_name || ""),
      email: String(params.email || ""),
      job_title: String(params.job_title || ""),
      employee_code: String(params.employee_code || employeeCode || ""),
      phone_number: String(params.phone_number || ""),
    }),
    [employeeCode, params]
  );

  const refresh = useCallback(async () => {
    setLoading(true);

    try {
      let code = String(params.employee_code || "").trim();

      if (!code) {
        const raw = await AsyncStorage.getItem("cached_employee");

        if (raw) {
          const parsed = JSON.parse(raw);
          code = String(parsed?.employee_code || "").trim();
        }
      }

      setEmployeeCode(code);

      if (!code) {
        setLeads([]);
        return;
      }

      const next = await listSalesLeads({
        employeeCode: code,
        role: String(params.job_title || ""),
        isOpen: true,
        limit: 80,
        offset: 0,
      });

      setLeads(next.filter((lead) => !isSalesClientStage(String(lead.stage_key))));
    } catch (error) {
      console.warn("[SalesLeads] Failed to load leads", error);
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [params.employee_code, params.job_title]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const filters = useMemo(
    () =>
      SALES_LEAD_TABS.map((key) => ({
        key,
        label: stageFilterLabel(key),
        count:
          key === "all"
            ? leads.length
            : leads.filter(
                (lead) => normalizeSalesStageKey(String(lead.stage_key)) === key
              ).length,
      })),
    [leads]
  );

  const filteredLeads = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return leads.filter((lead) => {
      const stageKey = normalizeSalesStageKey(String(lead.stage_key));
      const filterMatch = activeFilter === "all" ? true : stageKey === activeFilter;

      if (!filterMatch) return false;
      if (!query) return true;

      return [
        lead.name,
        lead.lead_code,
        lead.location_text,
        lead.source_code,
        getLeadSubtitle(lead),
        getOwnerLabel(lead),
        getLeadPhone(lead),
        getLeadEmail(lead),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [activeFilter, leads, searchText]);

  const sections = useMemo<LeadSection[]>(() => {
    const hot = filteredLeads.filter((lead) => isHotLead(lead));
    const inProgress = filteredLeads.filter((lead) => !isHotLead(lead));

    return [
      { key: "hot", label: "Hot Leads", items: hot },
      { key: "progress", label: "In Progress", items: inProgress },
    ].filter((section) => section.items.length > 0);
  }, [filteredLeads]);

  const openLead = (lead: SalesLead) => {
    router.push({
      pathname: "/LeadDetails",
      params: {
        ...navParams,
        leadId: lead.id,
      },
    } as any);
  };

  return (
    <View style={styles.root}>
      <View style={styles.background} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerCard}>
          <View style={styles.headerTopRow}>
            <View style={styles.headerLeft}>
              <Image
                source={{ uri: AVENUE_LOGO_URL }}
                style={styles.headerLogo}
                resizeMode="contain"
              />
            </View>

            <TText style={styles.headerTitle}>Leads</TText>

            <View style={styles.headerActions}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() =>
                  router.push({ pathname: "/HomeScreen", params: navParams } as any)
                }
              >
                <Ionicons name="home" size={22} color="#111827" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.headerDivider} />

        <View style={styles.searchSection}>
          <View style={styles.searchRow}>
            <View style={styles.searchWrap}>
              <Ionicons name="search-outline" size={15} color="#A3A3A3" />
              <TextInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Search leads..."
                placeholderTextColor="#A3A3A3"
                style={styles.searchInput}
              />
            </View>

            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() =>
                router.push({ pathname: "/AddLead", params: navParams } as any)
              }
              style={styles.addLeadBtn}
            >
              <Ionicons name="add" size={18} color="#171717" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterStrip}
        >
          {filters.map((filter) => {
            const active = filter.key === activeFilter;

            return (
              <TouchableOpacity
                key={filter.key}
                activeOpacity={0.9}
                onPress={() => setActiveFilter(filter.key)}
                style={[styles.filterPill, active ? styles.filterPillActive : null]}
              >
                <TText
                  style={[
                    styles.filterPillText,
                    active ? styles.filterPillTextActive : null,
                  ]}
                >
                  {filter.label}
                </TText>

                <View
                  style={[
                    styles.filterCountBadge,
                    active ? styles.filterCountBadgeActive : null,
                  ]}
                >
                  <TText
                    style={[
                      styles.filterCountText,
                      active ? styles.filterCountTextActive : null,
                    ]}
                  >
                    {filter.count}
                  </TText>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
        ) : sections.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="search-outline" size={38} color="#94A3B8" />
            <TText style={styles.emptyTitle}>No leads found</TText>
            <TText style={styles.emptyText}>
              Try a different search or create a new lead.
            </TText>
          </View>
        ) : (
          sections.map((section) => (
            <View key={section.key} style={styles.sectionWrap}>
          

              {section.items.map((lead) => {
                const stageKey = normalizeSalesStageKey(String(lead.stage_key));
                const tone = stagePillTone(stageKey);
                const phone = getLeadPhone(lead);
                const email = getLeadEmail(lead);
                const owner = getOwnerLabel(lead);
                const updated = formatRelativeStamp(lead.updated_at || lead.created_at);
                const progress = STAGE_PROGRESS[stageKey] || 0.25;

                return (
             <TouchableOpacity
  key={lead.id}
  activeOpacity={0.9}
  onPress={() => openLead(lead)}
  style={styles.leadCard}
>
  <View style={styles.leadTopRow}>


    <View style={styles.leadTextWrap}>
      <TText style={styles.leadName} numberOfLines={1}>
        {lead.name || "Unnamed Lead"}
      </TText>

      <TText style={styles.leadSubtitle} numberOfLines={1}>
        {getLeadSubtitle(lead)}
      </TText>
    </View>

    <View style={[styles.stagePill, { backgroundColor: tone.bg }]}>
      <TText style={[styles.stagePillText, { color: tone.fg }]}>
        {salesStageLabel(stageKey)}
      </TText>
    </View>
  </View>

  <View style={styles.simpleDetails}>
    <View style={styles.simpleDetailRow}>
      <Ionicons name="cash-outline" size={15} color="#16A34A" />
      <TText style={styles.simpleDetailText}>{formatDealValue(lead)}</TText>
    </View>

    <View style={styles.simpleDetailRow}>
      <Ionicons name="person-circle-outline" size={15} color="#6366F1" />
      <TText style={styles.simpleDetailText}>{getOwnerLabel(lead)}</TText>
    </View>


  </View>
</TouchableOpacity>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>

      <SalesFooterNav activeTab="leads" params={navParams} showBackButton />
    </View>
  );
};

const createStyles = () =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: "#F8FAFC",
    },
    background: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "#F8FAFC",
    },
    scrollContent: {
      paddingBottom: 108,
    },

    headerCard: {
      backgroundColor: "#FFFFFF",
      paddingTop: 18,
      paddingHorizontal: 18,
      paddingBottom: 14,
    },
    headerDivider: {
      height: 1,
      backgroundColor: "rgba(226,232,240,0.95)",
      marginHorizontal: 18,
    },
    headerTopRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    headerLeft: {
      width: 68,
      justifyContent: "center",
      alignItems: "flex-start",
    },
    headerTitle: {
      flex: 1,
      fontSize: 20,
      lineHeight: 32,
      fontWeight: "700",
      color: "#171717",
      textAlign: "center",
    },
    headerLogo: {
      width: 54,
      height: 36,
    },
    headerActions: {
      flexDirection: "row",
      width: 68,
      justifyContent: "flex-end",
    },

    searchSection: {
      paddingHorizontal: 18,
      paddingTop: 14,
    },
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    searchWrap: {
      flex: 1,
      backgroundColor: "#FFFFFF",
      borderRadius: 18,
      paddingHorizontal: 16,
      minHeight: 38,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderColor: "#E4E4E7",
      shadowColor: "#CBD5E1",
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: "#171717",
      paddingVertical: 10,
    },
    addLeadBtn: {
      width: 40,
      height: 40,
      borderRadius: 14,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "#E4E4E7",
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#CBD5E1",
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },

    filterStrip: {
      paddingHorizontal: 18,
      paddingTop: 8,
      paddingBottom: 5,
      gap: 7,
    },
    filterPill: {
      minWidth: 58,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "#D4D4D8",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 7,
    },
    filterPillActive: {
      backgroundColor: "#6b6b6d",
      borderColor: "#aaabad",
    },
    filterPillText: {
      fontSize: 13,
      fontWeight: "700",
      color: "#5C5C63",
    },
    filterPillTextActive: {
      color: "#FFFFFF",
    },
    filterCountBadge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: "#F1F5F9",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 6,
    },
    filterCountBadgeActive: {
      backgroundColor: "rgba(255,255,255,0.18)",
    },
    filterCountText: {
      fontSize: 11,
      fontWeight: "800",
      color: "#475569",
    },
    filterCountTextActive: {
      color: "#FFFFFF",
    },

    loaderWrap: {
      paddingTop: 56,
      alignItems: "center",
    },
    emptyCard: {
      marginHorizontal: 22,
      marginTop: 18,
      borderRadius: 28,
      backgroundColor: "#FFFFFF",
      padding: 28,
      alignItems: "center",
      borderWidth: 1,
      borderColor: "#E5E7EB",
    },
    emptyTitle: {
      marginTop: 10,
      fontSize: 22,
      fontWeight: "900",
      color: "#111827",
    },
    emptyText: {
      marginTop: 10,
      fontSize: 15,
      lineHeight: 22,
      color: "#737373",
      textAlign: "center",
    },

    sectionWrap: {
      paddingHorizontal: 18,
      paddingTop: 12,
    },
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: "800",
      color: "#64748B",
      textTransform: "uppercase",
      letterSpacing: 1.3,
    },
    sectionCountBubble: {
      minWidth: 36,
      height: 26,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "#E5E7EB",
    },
    sectionCountText: {
      fontSize: 14,
      fontWeight: "700",
      color: "#475569",
    },

leadCard: {
  borderRadius: 18,
  backgroundColor: "#FFFFFF",
  padding: 14,
  marginBottom: 12,
  borderWidth: 1,
  borderColor: "#E5E7EB",
},

leadTopRow: {
  flexDirection: "row",
  alignItems: "center",
  gap: 10,
},

leadAvatar: {
  width: 36,
  height: 36,
  borderRadius: 18,
  backgroundColor: "#EFF6FF",
  alignItems: "center",
  justifyContent: "center",
},

leadTextWrap: {
  flex: 1,
  minWidth: 0,
},

leadName: {
  fontSize: 15,
  fontWeight: "800",
  color: "#111827",
},

leadSubtitle: {
  marginTop: 3,
  fontSize: 12,
  fontWeight: "500",
  color: "#64748B",
},

stagePill: {
  borderRadius: 999,
  paddingHorizontal: 10,
  paddingVertical: 5,
},

stagePillText: {
  fontSize: 10,
  fontWeight: "800",
},

simpleDetails: {
  marginTop: 12,
  flexDirection: "row",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 10,
},

simpleDetailRow: {
  flexDirection: "row",
  alignItems: "center",
  gap: 5,
},

simpleDetailText: {
  fontSize: 12,
  fontWeight: "600",
  color: "#475569",
},

    detailsGrid: {
      marginTop: 14,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    detailItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: "#F8FAFC",
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 7,
      maxWidth: "100%",
    },
    detailText: {
      fontSize: 12,
      fontWeight: "700",
      color: "#334155",
      maxWidth: 210,
    },

    progressWrap: {
      marginTop: 14,
    },
    progressTopRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 6,
    },
    progressLabel: {
      fontSize: 11,
      fontWeight: "800",
      color: "#94A3B8",
      textTransform: "uppercase",
      letterSpacing: 0.7,
    },
    progressValue: {
      fontSize: 11,
      fontWeight: "900",
      color: "#64748B",
    },
    progressTrack: {
      height: 6,
      borderRadius: 999,
      backgroundColor: "#E5E7EB",
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      borderRadius: 999,
    },

    cardFooter: {
      marginTop: 13,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    hotPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      borderRadius: 999,
      backgroundColor: "#FFF7ED",
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    hotPillText: {
      fontSize: 11,
      fontWeight: "900",
      color: "#EA580C",
    },
    normalPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      borderRadius: 999,
      backgroundColor: "#F1F5F9",
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    normalPillText: {
      fontSize: 11,
      fontWeight: "800",
      color: "#475569",
    },
    openDetailsWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
    },
    openDetailsText: {
      fontSize: 12,
      fontWeight: "800",
      color: "#94A3B8",
    },
  });

export default SalesLeads;