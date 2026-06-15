import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";

import TText from "@/components/TText";
import { ThemeProvider, useTheme } from "@/src/theme/ThemeProvider";
import SalesFooterNav from "./SalesFooterNav";
import { isSalesClientStage, type SalesLead, listSalesLeads } from "@/utils/salesLeads";

const SalesClients: React.FC = () => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  const router = useRouter();
  const params = useLocalSearchParams();

  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<SalesLead[]>([]);
  const [employeeCode, setEmployeeCode] = useState("");

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
        setClients([]);
        return;
      }
      const next = await listSalesLeads({
        employeeCode: code,
        role: String(params.job_title || ""),
        isOpen: true,
        limit: 50,
        offset: 0,
      });
      setClients(next.filter((lead) => isSalesClientStage(String(lead.stage_key))));
    } catch (error) {
      console.warn("[SalesClients] Failed to load clients", error);
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, [params.employee_code]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  return (
    <View style={[styles.root, { backgroundColor: C.bg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <TText style={[styles.headerTitle, { color: C.text }]}>Clients</TText>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={C.primaryStrong} />
          </View>
        ) : clients.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: C.surface }]}>
            <TText style={[styles.emptyTitle, { color: C.text }]}>No clients yet</TText>
            <TText style={[styles.emptyText, { color: C.mutedText }]}>
              Promote leads from the pipeline and they will show up here.
            </TText>
          </View>
        ) : (
          clients.map((lead) => (
            <TouchableOpacity
              key={lead.id}
              activeOpacity={0.88}
              style={[styles.card, { backgroundColor: C.surface }]}
              onPress={() =>
                router.push({
                  pathname: "/LeadDetails",
                  params: { ...navParams, leadId: lead.id },
                } as any)
              }
            >
              <TText style={[styles.cardTitle, { color: C.text }]}>{lead.name}</TText>
              <TText style={[styles.cardMeta, { color: C.mutedText }]}>
                {lead.lead_code || "No code"} {lead.location_text ? `• ${lead.location_text}` : ""}
              </TText>
              <TText style={[styles.cardNote, { color: C.mutedText }]}>
                {lead.next_action_notes || "Client is ready for onboarding and coordination."}
              </TText>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <SalesFooterNav activeTab="clients" params={navParams} showBackButton />
    </View>
  );
};

const createStyles = (C: any) =>
  StyleSheet.create({
    root: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: C.surface,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    headerBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
    headerTitle: { fontSize: 18, fontWeight: "900" },
    content: { padding: 14, paddingBottom: 24 },
    center: { paddingVertical: 40, alignItems: "center", justifyContent: "center" },
    emptyCard: { borderRadius: 16, padding: 22, alignItems: "center" },
    emptyTitle: { fontSize: 16, fontWeight: "900" },
    emptyText: { fontSize: 12, fontWeight: "600", marginTop: 8, textAlign: "center", lineHeight: 18 },
    card: { marginTop: 14, borderRadius: 16, padding: 16 },
    cardTitle: { fontSize: 15, fontWeight: "900" },
    cardMeta: { fontSize: 12, fontWeight: "600", marginTop: 6 },
    cardNote: { fontSize: 12, fontWeight: "600", marginTop: 12, lineHeight: 18 },
  });

export default SalesClients;
