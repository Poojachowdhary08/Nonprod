import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal, Pressable, Image, Platform } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import Slider from "@react-native-community/slider";
import DateTimePicker from "@react-native-community/datetimepicker";

import TText from "@/components/TText";
import { ThemeProvider, useTheme } from "@/src/theme/ThemeProvider";
import { useFontScale } from "@/context/FontScaleContext";
import { getInstalledAppVersion } from "@/hooks/useAppVersionControl";
import SalesFooterNav from "./SalesFooterNav";
import { isSalesClientStage, listSalesLeads, normalizeSalesStageKey, salesStageLabel, type SalesLead } from "@/utils/salesLeads";

const AVENUE_LOGO_URL =
  "https://avenuerealty.in/wp-content/uploads/2022/12/cropped-Avenue-reality-logo.png";

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

function getInitials(name: string) {
  const cleaned = name.trim();
  if (!cleaned) return "AV";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
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
  const styles = useMemo(() => createStyles(C), [C]);
  const ticks = useMemo(() => new Array(tickCount).fill(0).map((_, i) => i), [tickCount]);

  return (
    <View style={styles.textSizeRow}>
      <TText style={[styles.textSizeA, { color: C.mutedText }]}>A</TText>
      <View style={styles.sliderShell}>
        <View style={[styles.sliderLine, { backgroundColor: C.sliderLine }]} />
        <View style={styles.tickRow} pointerEvents="none">
          {ticks.map((i) => (
            <View key={i} style={[styles.tick, { backgroundColor: C.tick }]} />
          ))}
        </View>
        <Slider
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
      <TText style={[styles.textSizeABig, { color: C.text }]}>A</TText>
    </View>
  );
}

function ProfileRow({ icon, label, value }: { icon: any; label: string; value: string }) {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);

  return (
    <View style={styles.profileRow}>
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

const SalesDashboard: React.FC = () => {
  const { theme, pref, setPref, schedule, setSchedule } = useTheme();
  const { fontScale, setFontScale } = useFontScale();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  const router = useRouter();
  const params = useLocalSearchParams();
  const currentAppVersion = getInstalledAppVersion();

  const [loading, setLoading] = useState(true);
  const [employeeCode, setEmployeeCode] = useState("");
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [profileVisible, setProfileVisible] = useState(false);
  const [cachedEmployee, setCachedEmployee] = useState<any>(null);
  const [timePickerTarget, setTimePickerTarget] = useState<"dark" | "light" | null>(null);

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

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem("cached_employee")
      .then((raw) => {
        if (!mounted || !raw) return;
        try {
          setCachedEmployee(JSON.parse(raw));
        } catch {}
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const profileName = String(
    `${navParams.first_name} ${navParams.last_name}`.trim() ||
      `${cachedEmployee?.first_name || ""} ${cachedEmployee?.last_name || ""}`.trim() ||
      "Avenue User"
  );
  const profileEmail = String(navParams.email || cachedEmployee?.email || "—");
  const profileRole = String(navParams.job_title || cachedEmployee?.job_title || "—");
  const profileEmployeeCode = String(navParams.employee_code || cachedEmployee?.employee_code || "—");
  const profilePhone = String(navParams.phone_number || cachedEmployee?.phone_number || "—");
  const profileInitials = getInitials(profileName);

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
        limit: 50,
        offset: 0,
      });
      setLeads(next);
    } catch {
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

  const openLeads = useMemo(
    () => leads.filter((lead) => normalizeSalesStageKey(String(lead.stage_key)) !== "lost" && !isSalesClientStage(String(lead.stage_key))),
    [leads]
  );
  const recentLeads = useMemo(() => openLeads.slice(0, 4), [openLeads]);

  const freshCount = leads.filter((lead) => normalizeSalesStageKey(String(lead.stage_key)) === "fresh").length;
  const visitCount = leads.filter((lead) => normalizeSalesStageKey(String(lead.stage_key)) === "site_visit").length;
  const bookingCount = leads.filter((lead) => isSalesClientStage(String(lead.stage_key))).length;
  const followUpCount = leads.filter((lead) => {
    const stage = normalizeSalesStageKey(String(lead.stage_key));
    return stage === "requirements" || stage === "shortlist" || stage === "negotiate" || stage === "legal";
  }).length;
  const totalLeadValue = openLeads.reduce((sum, lead) => sum + Number(lead.value_amount || 0), 0);
  const hottestLead = openLeads[0];

  const formattedLeadValue = useMemo(() => {
    if (!Number.isFinite(totalLeadValue) || totalLeadValue <= 0) return "\u20B90";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(totalLeadValue);
  }, [totalLeadValue]);

  const cards = [
    {
      key: "fresh",
      title: "Fresh Leads",
      value: freshCount,
      icon: "support-agent",
      hint: "New enquiries waiting to be qualified",
      onPress: () => router.push({ pathname: "/SalesLeads", params: navParams } as any),
    },
    {
      key: "followups",
      title: "Follow Ups",
      value: followUpCount,
      icon: "call",
      hint: "Active conversations and next steps",
      onPress: () => router.push({ pathname: "/SalesLeads", params: navParams } as any),
    },
    {
      key: "visits",
      title: "Site Visits",
      value: visitCount,
      icon: "event-available",
      hint: "Scheduled or in-progress visits",
      onPress: () => router.push({ pathname: "/SalesLeads", params: navParams } as any),
    },
    {
      key: "bookings",
      title: "Clients",
      value: bookingCount,
      icon: "verified",
      hint: "Converted deals in close or handover",
      onPress: () => router.push({ pathname: "/SalesClients", params: navParams } as any),
    },
  ];

  const activeThemeLabel = useMemo(() => {
    if (pref === "light") return "Light theme";
    if (pref === "dark") return "Dark theme";
    if (pref === "custom") return `Custom: dark ${formatTimeLabel(schedule.darkStartMinutes)} to ${formatTimeLabel(schedule.lightStartMinutes)}`;
    return theme.mode === "dark" ? "Dark theme" : "Light theme";
  }, [pref, schedule.darkStartMinutes, schedule.lightStartMinutes, theme.mode]);

  return (
    <View style={[styles.root, { backgroundColor: C.bg }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image source={{ uri: AVENUE_LOGO_URL }} style={styles.headerLogo} resizeMode="contain" />
        </View>
        <View style={styles.headerCenter}>
          <TText style={[styles.headerTitle, { color: C.text }]}>Sales Dashboard</TText>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => setProfileVisible(true)} style={[styles.headerAvatarBtn, { backgroundColor: C.primarySoft }]}>
            <TText style={[styles.headerAvatarText, { color: C.primaryStrong }]}>{profileInitials}</TText>
          </TouchableOpacity>
        </View>
      </View>
      <View style={[styles.headerDivider, { backgroundColor: C.border }]} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={C.primaryStrong} />
          </View>
        ) : (
          <>
            <View style={[styles.focusCard, { backgroundColor: C.surface }]}>
              <View style={styles.focusHeader}>
                <View>
                  <TText style={[styles.focusTitle, { color: C.text }]}>Today&apos;s Focus</TText>       
                </View>
              </View>

              <View style={styles.focusMetricsRow}>
                <View style={[styles.focusMetricCard, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
                  <TText style={[styles.focusMetricLabel, { color: C.mutedText }]}>Fresh Leads</TText>
                  <TText style={[styles.focusMetricValue, { color: C.text }]}>{freshCount}</TText>
                </View>
                <View style={[styles.focusMetricCard, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
                  <TText style={[styles.focusMetricLabel, { color: C.mutedText }]}>Follow Ups</TText>
                  <TText style={[styles.focusMetricValue, { color: C.text }]}>{followUpCount}</TText>
                </View>
                <View style={[styles.focusMetricCard, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
                  <TText style={[styles.focusMetricLabel, { color: C.mutedText }]}>Site Visits</TText>
                  <TText style={[styles.focusMetricValue, { color: C.text }]}>{visitCount}</TText>
                </View>
              </View>

              <View style={[styles.focusHighlight, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
                <View style={[styles.focusHighlightIcon, { backgroundColor: C.primarySoft }]}>
                  <MaterialIcons name="local-fire-department" size={18} color={C.primaryStrong} />
                </View>
                <View style={styles.focusHighlightBody}>
                  <TText style={[styles.focusHighlightTitle, { color: C.text }]} numberOfLines={1}>
                    {hottestLead?.name || "No active lead yet"}
                  </TText>
                  <TText style={[styles.focusHighlightText, { color: C.mutedText }]} numberOfLines={2}>
                    {hottestLead
                      ? `${salesStageLabel(String(hottestLead.stage_key))} • ${hottestLead.location_text || "Pipeline"}`
                      : "Create a lead to start building your pipeline."}
                  </TText>
                </View>
              </View>
            </View>


            <View style={[styles.panelCard, { backgroundColor: C.surface }]}>
              <View style={styles.panelHeader}>
                <View>
                  <TText style={[styles.panelTitle, { color: C.text }]}>Recent Pipeline</TText>
                  <TText style={[styles.panelSubtext, { color: C.mutedText }]}>Latest active leads ready for quick action.</TText>
                </View>
                <TouchableOpacity onPress={() => router.push({ pathname: "/SalesLeads", params: navParams } as any)}>
                  <TText style={[styles.panelLink, { color: C.primaryStrong }]}>See all</TText>
                </TouchableOpacity>
              </View>

              {recentLeads.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
                  <MaterialIcons name="inbox" size={26} color={C.mutedText} />
                  <TText style={[styles.emptyTitle, { color: C.text }]}>No active leads yet</TText>
                  <TText style={[styles.emptyText, { color: C.mutedText }]}>
                    New leads you create will start showing here for quick access.
                  </TText>
                </View>
              ) : (
                recentLeads.map((lead) => (
                  <TouchableOpacity
                    key={lead.id}
                    activeOpacity={0.86}
                    onPress={() => router.push({ pathname: "/LeadDetails", params: { ...navParams, leadId: lead.id } } as any)}
                    style={[styles.recentLeadCard, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}
                  >
                    <View style={styles.recentLeadTopRow}>
                      <View style={styles.leadRowContent}>
                        <TText style={[styles.leadName, { color: C.text }]} numberOfLines={1}>
                          {lead.name || "Untitled lead"}
                        </TText>
                        <TText style={[styles.leadMeta, { color: C.mutedText }]} numberOfLines={1}>
                          {lead.location_text || "No location"} {lead.lead_code ? `• ${lead.lead_code}` : ""}
                        </TText>
                      </View>
                      <View style={[styles.stageChip, { backgroundColor: C.primarySoft }]}>
                        <TText style={[styles.stageChipText, { color: C.primaryStrong }]}>{salesStageLabel(String(lead.stage_key))}</TText>
                      </View>
                    </View>
                    <TText style={[styles.recentLeadValue, { color: C.text }]}>
                      {Number(lead.value_amount || 0) > 0
                        ? new Intl.NumberFormat("en-IN", {
                            style: "currency",
                            currency: lead.currency || "INR",
                            maximumFractionDigits: 0,
                          }).format(Number(lead.value_amount || 0))
                        : "\u20B90"}
                    </TText>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>

      <SalesFooterNav activeTab="dashboard" params={navParams} />

      <Modal transparent visible={profileVisible} animationType="slide" onRequestClose={() => setProfileVisible(false)}>
        <Pressable style={[styles.profileOverlay, { backgroundColor: C.overlay }]} onPress={() => setProfileVisible(false)}>
          <Pressable style={[styles.profileCard, { backgroundColor: C.surface }]} onPress={(e: any) => e?.stopPropagation?.()}>
            <View style={styles.profileSheetHandle} />

            <View style={[styles.profileHero, { backgroundColor: C.primarySoft }]}>
              <View style={[styles.profileAvatar, { backgroundColor: C.primaryStrong }]}>
                <TText style={[styles.profileAvatarText, { color: C.white }]}>{profileInitials}</TText>
              </View>

              <View style={styles.profileHeroContent}>
                <TText style={[styles.profileName, { color: C.text }]}>{profileName}</TText>
                <TText style={[styles.profileRole, { color: C.mutedText }]}>{profileRole}</TText>
                <View style={[styles.profileCodeChip, { backgroundColor: C.surface, borderColor: C.border }]}>
                  <MaterialIcons name="badge" size={14} color={C.primaryStrong} />
                  <TText style={[styles.profileCodeChipText, { color: C.primaryStrong }]}>{profileEmployeeCode}</TText>
                </View>
              </View>
            </View>

            <View style={[styles.profileDivider, { backgroundColor: C.border }]} />

            <View style={[styles.profileSectionCard, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
              <TText style={[styles.profileSectionTitle, { color: C.text }]}>Contact Details</TText>
              <ProfileRow icon="email" label="Email" value={profileEmail} />
              <ProfileRow icon="call" label="Phone" value={profilePhone} />
            </View>

            <View style={[styles.profileSectionCard, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
              <View style={styles.profileSectionHeader}>
                <TText style={[styles.profileSectionTitle, { color: C.text }]}>Text Size</TText>
                <TText style={[styles.sliderValueChip, { color: C.primaryStrong, backgroundColor: C.primarySoft }]}>
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
                <TText style={[styles.sliderHint, { marginTop: 0, color: C.mutedText }]}>{activeThemeLabel}</TText>
              </View>

              <View style={styles.themeModeRow}>
                {(["light", "dark", "custom"] as const).map((option) => {
                  const active = pref === option;
                  return (
                    <TouchableOpacity
                      key={option}
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
                    activeOpacity={0.85}
                    onPress={() => setTimePickerTarget("dark")}
                    style={[styles.themeScheduleBtn, { backgroundColor: C.surface, borderColor: C.border }]}
                  >
                    <TText style={[styles.themeScheduleLabel, { color: C.mutedText }]}>Dark Starts</TText>
                    <TText style={[styles.themeScheduleValue, { color: C.text }]}>{formatTimeLabel(schedule.darkStartMinutes)}</TText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setTimePickerTarget("light")}
                    style={[styles.themeScheduleBtn, { backgroundColor: C.surface, borderColor: C.border }]}
                  >
                    <TText style={[styles.themeScheduleLabel, { color: C.mutedText }]}>Light Starts</TText>
                    <TText style={[styles.themeScheduleValue, { color: C.text }]}>{formatTimeLabel(schedule.lightStartMinutes)}</TText>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            <View style={styles.profileFooter}>
              <View style={[styles.profileVersionRow, { backgroundColor: C.successSoft }]}>
                <MaterialIcons name="verified" size={18} color={C.success} />
                <TText style={[styles.profileVersionText, { color: C.success }]}>Version {currentAppVersion}</TText>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {timePickerTarget && (
        Platform.OS === "web" ? (
          <Modal transparent visible animationType="fade" onRequestClose={() => setTimePickerTarget(null)}>
            <Pressable style={[styles.confirmOverlay, { backgroundColor: C.overlay }]} onPress={() => setTimePickerTarget(null)}>
              <Pressable style={[styles.confirmCard, { backgroundColor: C.surface }]} onPress={(e: any) => e?.stopPropagation?.()}>
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
      paddingTop: 14,
      paddingBottom: 12,
      backgroundColor: C.surface,
    },
    headerDivider: {
      height: 1,
      marginHorizontal: 14,
    },
    headerLeft: {
      width: 84,
      alignItems: "flex-start",
      justifyContent: "center",
    },
    headerCenter: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 8,
    },
    headerRight: {
      width: 84,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 8,
    },
    headerTitle: { fontSize: 18, fontWeight: "800" },
    headerLogo: { width: 72, height: 40 },
    headerAvatarBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    headerAvatarText: { fontSize: 12, fontWeight: "900" },
    content: { padding: 14, paddingBottom: 28, gap: 14 },
    hero: {
      borderRadius: 24,
      borderWidth: 1,
      borderColor: C.border,
      padding: 18,
      flexDirection: "row",
      alignItems: "stretch",
      justifyContent: "space-between",
      boxShadow: "0px 8px 24px rgba(15,23,42,0.06)",
      elevation: 3,
    },
    heroTextWrap: { flex: 1, paddingRight: 14 },
    heroEyebrow: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8 },
    heroTitle: { fontSize: 24, fontWeight: "900", marginTop: 6, lineHeight: 30 },
    heroText: { fontSize: 13, fontWeight: "500", lineHeight: 20, marginTop: 8 },
    heroActionRow: { flexDirection: "row", gap: 10, marginTop: 16, flexWrap: "wrap" },
    heroPrimaryBtn: {
      minHeight: 42,
      borderRadius: 14,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    heroPrimaryBtnText: { fontSize: 12, fontWeight: "800" },
    heroSecondaryBtn: {
      minHeight: 42,
      borderRadius: 14,
      paddingHorizontal: 14,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    heroSecondaryBtnText: { fontSize: 12, fontWeight: "800" },
    heroStatRail: { width: 124, alignItems: "stretch", justifyContent: "space-between", gap: 10 },
    heroMiniCard: {
      width: "100%",
      borderRadius: 18,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    heroMiniLabel: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
    heroMiniValue: { fontSize: 24, fontWeight: "900", marginTop: 6 },
    heroMiniValueSm: { fontSize: 16, fontWeight: "900", marginTop: 6, lineHeight: 20 },
    center: { paddingVertical: 40, alignItems: "center", justifyContent: "center" },
    focusCard: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      padding: 16,
      boxShadow: "0px 6px 18px rgba(15,23,42,0.04)",
      elevation: 2,
    },
    focusHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    focusTitle: { fontSize: 18, fontWeight: "900" },
    focusSubtitle: { fontSize: 12, fontWeight: "500", lineHeight: 18, marginTop: 4 },
    focusBadge: {
      width: 26,
      height: 26,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    focusMetricsRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: 4,
    },
    focusMetricCard: {
      flex: 1,
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    focusMetricLabel: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
    focusMetricValue: { fontSize: 22, fontWeight: "900", marginTop: 6 },
    focusHighlight: {
      marginTop: 12,
      borderRadius: 16,
      borderWidth: 1,
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    focusHighlightIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    focusHighlightBody: { flex: 1 },
    focusHighlightTitle: { fontSize: 14, fontWeight: "800" },
    focusHighlightText: { fontSize: 12, fontWeight: "500", lineHeight: 17, marginTop: 3 },
    metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" },
    metricCard: {
      width: "48%",
      borderRadius: 20,
      borderWidth: 1,
      borderColor: C.border,
      padding: 14,
      minHeight: 142,
      boxShadow: "0px 6px 18px rgba(15,23,42,0.04)",
      elevation: 2,
    },
    metricIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 14 },
    metricTitle: { fontSize: 12, fontWeight: "800" },
    metricValue: { fontSize: 28, fontWeight: "900", marginTop: 8 },
    metricHint: { fontSize: 11, fontWeight: "500", marginTop: 8, lineHeight: 16 },
    panelCard: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      padding: 16,
      boxShadow: "0px 6px 18px rgba(15,23,42,0.04)",
      elevation: 2,
    },
    panelHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    panelTitle: { fontSize: 17, fontWeight: "900" },
    panelSubtext: { fontSize: 12, fontWeight: "600", marginTop: 4, lineHeight: 18 },
    panelLink: { fontSize: 12, fontWeight: "800" },
    quickActionGrid: { gap: 10, marginTop: 14 },
    quickActionCard: {
      borderRadius: 16,
      borderWidth: 1,
      padding: 14,
    },
    quickActionTitle: { fontSize: 14, fontWeight: "800", marginTop: 10 },
    quickActionText: { fontSize: 12, fontWeight: "600", lineHeight: 18, marginTop: 6 },
    emptyCard: {
      borderRadius: 16,
      borderWidth: 1,
      padding: 18,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 14,
    },
    emptyTitle: { fontSize: 15, fontWeight: "900", marginTop: 10 },
    emptyText: { fontSize: 12, fontWeight: "600", textAlign: "center", marginTop: 6, lineHeight: 18 },
    recentLeadCard: {
      marginTop: 12,
      borderRadius: 18,
      borderWidth: 1,
      padding: 14,
    },
    recentLeadTopRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 10,
    },
    leadRowContent: { flex: 1, paddingRight: 8 },
    leadName: { fontSize: 14, fontWeight: "800" },
    leadMeta: { fontSize: 12, fontWeight: "600", marginTop: 4 },
    recentLeadValue: { fontSize: 15, fontWeight: "900", marginTop: 12 },
    stageChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
    stageChipText: { fontSize: 10, fontWeight: "800" },
    profileOverlay: {
      flex: 1,
      justifyContent: "flex-end",
      alignItems: "stretch",
    },
    profileCard: {
      width: "100%",
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 24,
      boxShadow: "0px -8px 24px rgba(15,23,42,0.16)",
      elevation: 16,
      maxHeight: "92%",
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
      borderRadius: 20,
      padding: 14,
    },
    profileAvatar: {
      width: 54,
      height: 54,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    profileAvatarText: { fontSize: 18, fontWeight: "900" },
    profileHeroContent: { flex: 1 },
    profileName: { fontSize: 16, fontWeight: "900" },
    profileRole: { fontSize: 12, fontWeight: "700", marginTop: 3 },
    profileCodeChip: {
      alignSelf: "flex-start",
      marginTop: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderWidth: 1,
    },
    profileCodeChipText: { fontSize: 11, fontWeight: "800" },
    profileDivider: { height: 1, marginVertical: 14 },
    profileSectionCard: {
      borderRadius: 18,
      padding: 12,
      borderWidth: 1,
      marginBottom: 12,
    },
    profileSectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 6,
      gap: 10,
    },
    profileSectionTitle: { fontSize: 11, fontWeight: "900", letterSpacing: 0.2 },
    profileRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
    },
    profileIconBox: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
    },
    profileTextWrap: { flex: 1 },
    profileLabel: { fontSize: 10, fontWeight: "800", marginBottom: 2, textTransform: "uppercase" },
    profileText: { flexShrink: 1, fontSize: 13, fontWeight: "700" },
    profileFooter: { marginTop: 2, gap: 10 },
    profileVersionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 14,
    },
    profileVersionText: { fontSize: 11, fontWeight: "800" },
    textSizeRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    textSizeA: { fontSize: 12, fontWeight: "900" },
    textSizeABig: { fontSize: 16, fontWeight: "900" },
    sliderShell: { flex: 1, height: 30, justifyContent: "center" },
    sliderLine: {
      position: "absolute",
      left: 2,
      right: 2,
      height: 4,
      borderRadius: 999,
    },
    tickRow: {
      position: "absolute",
      left: 2,
      right: 2,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    tick: { width: 2, height: 10, borderRadius: 2 },
    nativeSlider: { width: "100%", height: 30 },
    sliderValueChip: {
      fontSize: 11,
      fontWeight: "900",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      overflow: "hidden",
    },
    sliderHint: { marginTop: 8, fontSize: 11, fontWeight: "600" },
    themeModeRow: { flexDirection: "row", gap: 10, marginTop: 10 },
    themeModeBtn: {
      flex: 1,
      minHeight: 40,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 10,
    },
    themeScheduleWrap: { flexDirection: "row", gap: 10, marginTop: 10 },
    themeScheduleBtn: {
      flex: 1,
      minHeight: 46,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
      justifyContent: "center",
    },
    themeScheduleLabel: { fontSize: 10, fontWeight: "800", marginBottom: 4, textTransform: "uppercase" },
    themeScheduleValue: { fontSize: 13, fontWeight: "800" },
    confirmOverlay: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
    },
    confirmCard: { width: 340, maxWidth: "92%", borderRadius: 16, padding: 14 },
    confirmTitle: { fontSize: 14, fontWeight: "900" },
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
    confirmBtn: {
      height: 36,
      borderRadius: 12,
      paddingHorizontal: 14,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
    },
    confirmBtnGhost: { borderWidth: 1 },
    confirmBtnGhostText: { fontSize: 12, fontWeight: "800" },
  });

export default SalesDashboard;
