import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  Pressable,
  TextInput,
  Image,
  Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import TText from "@/components/TText";
import SalesFooterNav from "./SalesFooterNav";
import {
  demoteSalesStage,
  getSalesLeadDetail,
  isSalesClientStage,
  moveSalesLeadStage,
  normalizeSalesStageKey,
  promoteSalesStage,
  restoreSalesLead,
  salesStageLabel,
  type SalesLeadDetail,
  type SalesLead,
} from "@/utils/salesLeads";

type StageActionMode = "promote" | "demote" | "lost" | "restore";

const AVENUE_LOGO_URL =
  "https://avenuerealty.in/wp-content/uploads/2022/12/cropped-Avenue-reality-logo.png";

const STAGE_PROGRESS: Record<string, number> = {
  fresh: 0.2,
  requirements: 0.38,
  shortlist: 0.56,
  site_visit: 0.72,
  negotiate: 0.82,
  legal: 0.9,
  handover: 1,
  deal_close: 1,
  lost: 0.18,
};

const stageTone = (stageKey: string) => {
  const key = normalizeSalesStageKey(stageKey);
  if (key === "lost") return { bg: "#F3F4F6", fg: "#52525B", bar: "#A1A1AA" };
  return { bg: "#F5F5F5", fg: "#3F3F46", bar: "#737373" };
};

const formatDealValue = (lead?: SalesLead | null) => {
  const amount = Number(lead?.value_amount || 0);
  if (!lead || !Number.isFinite(amount) || amount <= 0) return "\u20B90";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: lead.currency || "INR",
    maximumFractionDigits: 0,
  }).format(amount);
};

const subtitleForLead = (lead?: SalesLead | null) => {
  if (!lead) return "Lead";
  const details = lead.details_json || {};
  const company =
    details.company_name ||
    details.company ||
    details.organization ||
    lead.source_code ||
    "Avenue Lead";
  const title =
    details.designation ||
    details.job_title ||
    details.role ||
    lead.location_text ||
    "Opportunity";
  return `${company} \u00B7 ${title}`;
};

const safeText = (...values: any[]) => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
};

const formatActivityTime = (value?: string | null) => {
  if (!value) return "Recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  const today = new Date();
  const diffDays = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) {
    return `Today, ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  }
  if (diffDays === 1) {
    return `Yesterday, ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  }
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

const extractPhone = (detail?: SalesLeadDetail | null) => {
  const first = detail?.contacts?.[0] || {};
  return safeText(
    first.phone,
    first.phone_number,
    first.mobile,
    detail?.lead.details_json?.phone,
    detail?.lead.details_json?.phone_number
  );
};

const extractEmail = (detail?: SalesLeadDetail | null) => {
  const first = detail?.contacts?.[0] || {};
  return safeText(
    first.email,
    first.email_id,
    detail?.lead.details_json?.email,
    detail?.lead.details_json?.email_id
  );
};

const extractSource = (lead?: SalesLead | null) =>
  safeText(lead?.source_code, lead?.details_json?.source, "Direct");

const extractAssignedTo = (lead?: SalesLead | null) =>
  safeText(lead?.details_json?.owner_name, lead?.details_json?.assigned_to, "Sales Team");

const extractLastContact = (detail?: SalesLeadDetail | null) => {
  const firstActivity = detail?.activities?.[0];
  return safeText(
    firstActivity?.created_at ? formatActivityTime(firstActivity.created_at) : "",
    detail?.lead.updated_at ? formatActivityTime(detail.lead.updated_at) : "",
    "Recently"
  );
};

const activityIcon = (item: Record<string, any>) => {
  const hint = safeText(item.activity_type, item.type, item.channel, item.event_type, item.title).toLowerCase();
  if (hint.includes("call")) return "call-outline";
  if (hint.includes("mail") || hint.includes("email")) return "mail-outline";
  return "document-text-outline";
};

const flattenActivities = (detail: SalesLeadDetail | null) => {
  if (!detail) return [];
  const activityItems = (detail.activities || []).map((item) => ({
    id: safeText(item.id, item.activity_id, item.log_id, `activity-${Math.random()}`),
    title: safeText(item.title, item.subject, item.activity_text, item.description, item.notes, "Activity"),
    time: safeText(item.created_at, item.logged_at, item.activity_at),
    icon: activityIcon(item),
  }));
  const noteItems = (detail.notes || []).map((item) => ({
    id: safeText(item.id, item.note_id, `note-${Math.random()}`),
    title: safeText(item.note_text, item.title, item.description, "Note added"),
    time: safeText(item.created_at, item.logged_at),
    icon: "document-text-outline",
  }));
  return [...activityItems, ...noteItems]
    .sort((a, b) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime())
    .slice(0, 8);
};

type LeadDateField = "followUpDate" | "scheduledVisitDate" | "expectedCloseDate";

const formatDateDDMMYYYY = (value?: Date | null) => {
  if (!value || Number.isNaN(value.getTime())) return "";
  const dd = String(value.getDate()).padStart(2, "0");
  const mm = String(value.getMonth() + 1).padStart(2, "0");
  const yyyy = value.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const toLocalDateValue = (value?: Date | null) => {
  if (!value || Number.isNaN(value.getTime())) return "";
  const yyyy = value.getFullYear();
  const mm = String(value.getMonth() + 1).padStart(2, "0");
  const dd = String(value.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const fromLocalDateValue = (value: string) => {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const parseDDMMYYYY = (value?: string | null) => {
  const text = String(value || "").trim();
  if (!text) return null;
  const [dd, mm, yyyy] = text.split("/").map((part) => Number(part));
  if (!dd || !mm || !yyyy) return null;
  const parsed = new Date(yyyy, mm - 1, dd);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const LeadDetails: React.FC = () => {
  const styles = useMemo(() => createStyles(), []);
  const router = useRouter();
  const params = useLocalSearchParams();

  const [lead, setLead] = useState<SalesLead | null>(null);
  const [leadDetail, setLeadDetail] = useState<SalesLeadDetail | null>(null);
  const [actionMode, setActionMode] = useState<StageActionMode | null>(null);
  const [comment, setComment] = useState("");
  const [scheduledVisitDate, setScheduledVisitDate] = useState("");
  const [visitOutcome, setVisitOutcome] = useState("");
  const [amount, setAmount] = useState("");
  const [requirementsSummary, setRequirementsSummary] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [quotedValue, setQuotedValue] = useState("");
  const [restoreStageKey, setRestoreStageKey] = useState("deal_close");
  const [activeDateField, setActiveDateField] = useState<LeadDateField | null>(null);

  const navParams = useMemo(
    () => ({
      first_name: String(params.first_name || ""),
      last_name: String(params.last_name || ""),
      email: String(params.email || ""),
      job_title: String(params.job_title || ""),
      employee_code: String(params.employee_code || ""),
      phone_number: String(params.phone_number || ""),
    }),
    [params]
  );

  const leadId = String(params.leadId || "");

  const refresh = useCallback(async () => {
    try {
      if (!navParams.employee_code) {
        setLead(null);
        setLeadDetail(null);
        return;
      }
      const detail = await getSalesLeadDetail({
        leadId,
        employeeCode: navParams.employee_code,
        role: navParams.job_title,
      });
      setLead(detail.lead);
      setLeadDetail(detail);
    } catch (error) {
      console.warn("[LeadDetails] Failed to load lead", error);
      setLead(null);
      setLeadDetail(null);
    }
  }, [leadId, navParams.employee_code, navParams.job_title]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const computeNextStage = useCallback(
    (mode: StageActionMode) => {
      if (!lead) return "";
      if (mode === "lost") return "lost";
      if (mode === "restore") return restoreStageKey || "deal_close";
      return mode === "promote"
        ? promoteSalesStage(String(lead.stage_key))
        : demoteSalesStage(String(lead.stage_key));
    },
    [lead, restoreStageKey]
  );

  const resetActionForm = useCallback(() => {
    setActionMode(null);
    setActiveDateField(null);
    setComment("");
    setScheduledVisitDate("");
    setVisitOutcome("");
    setAmount("");
    setRequirementsSummary("");
    setFollowUpDate("");
    setSiteAddress("");
    setNotes("");
    setExpectedCloseDate("");
    setQuotedValue("");
  }, []);

  const isFreshToRequirements = (fromStage: string, toStage: string) => fromStage === "fresh" && toStage === "requirements";
  const isRequirementsToShortlist = (fromStage: string, toStage: string) => fromStage === "requirements" && toStage === "shortlist";
  const isToSiteVisit = (_fromStage: string, toStage: string) => toStage === "site_visit";
  const isVisitToNegotiate = (fromStage: string, toStage: string) => fromStage === "site_visit" && toStage === "negotiate";
  const isNegotiateToLegal = (fromStage: string, toStage: string) => fromStage === "negotiate" && toStage === "legal";

  const currentStage = normalizeSalesStageKey(String(lead?.stage_key || ""));
  const pendingStage = normalizeSalesStageKey(String((actionMode ? computeNextStage(actionMode) : "") || ""));
  const usesSpecialMoveFields =
    isFreshToRequirements(currentStage, pendingStage) ||
    isRequirementsToShortlist(currentStage, pendingStage) ||
    isToSiteVisit(currentStage, pendingStage) ||
    isVisitToNegotiate(currentStage, pendingStage) ||
    isNegotiateToLegal(currentStage, pendingStage);

  const submitStageAction = async () => {
    if (!lead || !actionMode) return;
    const fromStage = normalizeSalesStageKey(String(lead.stage_key || ""));
    const nextStage = String(computeNextStage(actionMode) || "").trim();
    if (!nextStage) return;

    if (actionMode !== "restore" && !comment.trim()) {
      Alert.alert("Missing comment", "Please add a comment for this stage update.");
      return;
    }
    if (isFreshToRequirements(fromStage, nextStage) && !requirementsSummary.trim()) {
      Alert.alert("Missing requirements", "Requirements summary is required for this move.");
      return;
    }
    if (isToSiteVisit(fromStage, nextStage) && !scheduledVisitDate.trim()) {
      Alert.alert("Missing visit date", "Scheduled visit date is required for site visits.");
      return;
    }
    if (isVisitToNegotiate(fromStage, nextStage) && !visitOutcome.trim()) {
      Alert.alert("Missing visit outcome", "Visit outcome is required for this stage change.");
      return;
    }
    if (isNegotiateToLegal(fromStage, nextStage) && !amount.trim()) {
      Alert.alert("Missing amount", "Amount is required for this stage change.");
      return;
    }

    try {
      if (actionMode === "restore") {
        await restoreSalesLead({
          leadId: lead.id,
          employeeCode: navParams.employee_code,
          role: navParams.job_title,
          targetStageKey: nextStage,
        });
      } else {
        await moveSalesLeadStage({
          leadId: lead.id,
          employeeCode: navParams.employee_code,
          role: navParams.job_title,
          toStageKey: nextStage,
          detailsJson: {
            comment: comment.trim(),
            ...(isFreshToRequirements(fromStage, nextStage)
              ? {
                  requirementsSummary: requirementsSummary.trim(),
                  nextFollowUpDate: followUpDate.trim() || null,
                }
              : {}),
            ...(isRequirementsToShortlist(fromStage, nextStage) ? { shortlistNotes: notes.trim() } : {}),
            ...(isToSiteVisit(fromStage, nextStage)
              ? {
                  scheduledVisitDate: scheduledVisitDate.trim(),
                  siteAddress: siteAddress.trim(),
                  notes: notes.trim(),
                }
              : {}),
            ...(isVisitToNegotiate(fromStage, nextStage)
              ? {
                  visitOutcome: visitOutcome.trim(),
                  expectedCloseDate: expectedCloseDate.trim() || null,
                  quotedValue: quotedValue.trim(),
                }
              : {}),
            ...(isNegotiateToLegal(fromStage, nextStage)
              ? { amount: amount.trim(), notes: notes.trim() }
              : {}),
            ...(usesSpecialMoveFields ? {} : { notes: notes.trim() }),
          },
        });
      }
      await refresh();
      resetActionForm();
    } catch (error: any) {
      Alert.alert(
        actionMode === "restore" ? "Restore Failed" : "Stage Update Failed",
        error?.message || "Unable to update lead stage."
      );
      return;
    }

    if (isSalesClientStage(nextStage)) {
      Alert.alert("Lead Promoted", "This lead is now a client.");
    }
  };

  const tone = stageTone(currentStage);
  const score = Math.max(0, Math.min(100, Number(lead?.score || 0)));
  const activities = flattenActivities(leadDetail);

  const dateFieldValue = useMemo(() => {
    switch (activeDateField) {
      case "followUpDate":
        return parseDDMMYYYY(followUpDate) || new Date();
      case "scheduledVisitDate":
        return parseDDMMYYYY(scheduledVisitDate) || new Date();
      case "expectedCloseDate":
        return parseDDMMYYYY(expectedCloseDate) || new Date();
      default:
        return new Date();
    }
  }, [activeDateField, expectedCloseDate, followUpDate, scheduledVisitDate]);

  const setDateFieldValue = useCallback((field: LeadDateField, date: Date) => {
    const formatted = formatDateDDMMYYYY(date);
    if (field === "followUpDate") setFollowUpDate(formatted);
    if (field === "scheduledVisitDate") setScheduledVisitDate(formatted);
    if (field === "expectedCloseDate") setExpectedCloseDate(formatted);
  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.background}>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerCard}>
          <View style={styles.headerTopRow}>
            <View style={styles.headerLeft}>
              <Image source={{ uri: AVENUE_LOGO_URL }} style={styles.headerLogo} resizeMode="contain" />
            </View>
            <TText style={styles.headerTitle}>Lead Details</TText>
            <View style={styles.headerActions}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => router.push({ pathname: "/HomeScreen", params: navParams } as any)}
              >
                <Ionicons name="home" size={22} color="#111827" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.headerDivider} />

        {!lead ? (
          <View style={styles.emptyCard}>
            <TText style={styles.emptyTitle}>Lead not found</TText>
          </View>
        ) : (
          <>
            <View style={styles.heroCard}>
              <TText style={styles.heroName}>{lead.name}</TText>
              <TText style={styles.heroSubtitle}>{subtitleForLead(lead)}</TText>
              <TText style={styles.heroAmount}>{formatDealValue(lead)}</TText>

              <View style={styles.heroMetaRow}>
                <View style={[styles.heroStagePill, { backgroundColor: tone.bg }]}>
                  <TText style={[styles.heroStageText, { color: tone.fg }]}>{salesStageLabel(currentStage)}</TText>
                </View>
                <TText style={styles.heroScoreText}>{"\u00B7"} Score {score || 0}%</TText>
              </View>
            </View>

            <View style={styles.actionHeroRow}>
              {normalizeSalesStageKey(String(lead.stage_key)) === "lost" ? (
                <ActionCard
                  title="Restore"
                  subtitle="Reopen lead"
                  icon="refresh"
                  tone="blue"
                  onPress={() => setActionMode("restore")}
                />
              ) : (
                <>
                  <ActionCard
                    title="Promote"
                    subtitle={`\u2192 ${salesStageLabel(promoteSalesStage(String(lead.stage_key)))}`}
                    icon="arrow-up"
                    tone="green"
                    onPress={() => setActionMode("promote")}
                  />
                  <ActionCard
                    title="Demote"
                    subtitle={`\u2192 ${salesStageLabel(demoteSalesStage(String(lead.stage_key)))}`}
                    icon="arrow-down"
                    tone="amber"
                    onPress={() => setActionMode("demote")}
                  />
                  <ActionCard
                    title="Lost"
                    subtitle="Close deal"
                    icon="close"
                    tone="rose"
                    onPress={() => setActionMode("lost")}
                  />
                </>
              )}
            </View>

            <SectionTitle title="Contact Info" />
            <View style={styles.infoCard}>
              <InfoRow label="Phone" value={extractPhone(leadDetail) || "Not added"} emphasize={!!extractPhone(leadDetail)} />
              <InfoRow label="Email" value={extractEmail(leadDetail) || "Not added"} emphasize={!!extractEmail(leadDetail)} />
              <InfoRow label="Source" value={extractSource(lead)} />
              <InfoRow label="Assigned to" value={extractAssignedTo(lead)} />
              <InfoRow label="Last contact" value={extractLastContact(leadDetail)} isLast />
            </View>

            <SectionTitle title="Activity" />
            <View style={styles.activityCard}>
              {activities.length === 0 ? (
                <TText style={styles.emptyActivityText}>No recent activity logged yet.</TText>
              ) : (
                activities.map((item, index) => (
                  <View key={item.id || `${item.title}-${index}`} style={[styles.activityRow, index === activities.length - 1 ? styles.activityRowLast : null]}>
                    <View style={styles.activityIconWrap}>
                      <Ionicons name={item.icon as any} size={17} color="#3F3F46" />
                    </View>
                    <View style={styles.activityTextWrap}>
                      <TText style={styles.activityTitle}>{item.title}</TText>
                      <TText style={styles.activityTime}>{formatActivityTime(item.time)}</TText>
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>

      <SalesFooterNav
        activeTab={isSalesClientStage(String(lead?.stage_key || "")) ? "clients" : "leads"}
        params={navParams}
        showBackButton
      />

      <Modal transparent visible={!!actionMode} animationType="fade" onRequestClose={resetActionForm}>
        <Pressable style={styles.modalOverlay} onPress={resetActionForm}>
          <Pressable style={styles.modalCard} onPress={(e: any) => e?.stopPropagation?.()}>
            <TText style={styles.modalTitle}>
              {actionMode === "restore" ? "Restore Lead" : "Update Lead Stage"}
            </TText>
            <TText style={styles.modalSubtext}>
              {actionMode === "restore"
                ? "Restore this lead to an active stage."
                : `Move ${salesStageLabel(currentStage)} to ${salesStageLabel(pendingStage)}.`}
            </TText>

            {actionMode === "restore" ? (
              <InputField label="Target Stage Key">
                <TextInput
                  value={restoreStageKey}
                  onChangeText={setRestoreStageKey}
                  placeholder="deal_close"
                  placeholderTextColor="#9CA3AF"
                  style={styles.modalInput}
                />
              </InputField>
            ) : (
              <>
                <InputField label="Comment">
                  <TextInput
                    value={comment}
                    onChangeText={setComment}
                    placeholder="Why are you updating this lead?"
                    placeholderTextColor="#9CA3AF"
                    multiline
                    textAlignVertical="top"
                    style={[styles.modalInput, styles.modalTextarea]}
                  />
                </InputField>

                {isFreshToRequirements(currentStage, pendingStage) ? (
                  <>
                    <InputField label="Requirements Summary">
                      <TextInput
                        value={requirementsSummary}
                        onChangeText={setRequirementsSummary}
                        placeholder="Budget, timeline, finance readiness..."
                        placeholderTextColor="#9CA3AF"
                        multiline
                        textAlignVertical="top"
                        style={[styles.modalInput, styles.modalTextarea]}
                      />
                    </InputField>
                    <DateField
                      label="Next Follow-up Date"
                      value={followUpDate}
                      onPress={() => setActiveDateField("followUpDate")}
                      onWebChange={(nextValue) => {
                        const parsed = fromLocalDateValue(nextValue);
                        setFollowUpDate(parsed ? formatDateDDMMYYYY(parsed) : "");
                      }}
                    />
                  </>
                ) : null}

                {isRequirementsToShortlist(currentStage, pendingStage) ? (
                  <InputField label="Shortlist Notes">
                    <TextInput
                      value={notes}
                      onChangeText={setNotes}
                      placeholder="Which projects or properties are shortlisted?"
                      placeholderTextColor="#9CA3AF"
                      multiline
                      textAlignVertical="top"
                      style={[styles.modalInput, styles.modalTextarea]}
                    />
                  </InputField>
                ) : null}

                {isToSiteVisit(currentStage, pendingStage) ? (
                  <>
                    <DateField
                      label="Scheduled Visit Date"
                      value={scheduledVisitDate}
                      onPress={() => setActiveDateField("scheduledVisitDate")}
                      onWebChange={(nextValue) => {
                        const parsed = fromLocalDateValue(nextValue);
                        setScheduledVisitDate(parsed ? formatDateDDMMYYYY(parsed) : "");
                      }}
                    />
                    <InputField label="Site Address">
                      <TextInput
                        value={siteAddress}
                        onChangeText={setSiteAddress}
                        placeholder="Enter site address"
                        placeholderTextColor="#9CA3AF"
                        style={styles.modalInput}
                      />
                    </InputField>
                    <InputField label="Notes">
                      <TextInput
                        value={notes}
                        onChangeText={setNotes}
                        placeholder="Add site visit notes"
                        placeholderTextColor="#9CA3AF"
                        multiline
                        textAlignVertical="top"
                        style={[styles.modalInput, styles.modalTextarea]}
                      />
                    </InputField>
                  </>
                ) : null}

                {isVisitToNegotiate(currentStage, pendingStage) ? (
                  <>
                    <InputField label="Visit Outcome">
                      <TextInput
                        value={visitOutcome}
                        onChangeText={setVisitOutcome}
                        placeholder="What happened on site?"
                        placeholderTextColor="#9CA3AF"
                        multiline
                        textAlignVertical="top"
                        style={[styles.modalInput, styles.modalTextarea]}
                      />
                    </InputField>
                    <DateField
                      label="Expected Close Date"
                      value={expectedCloseDate}
                      onPress={() => setActiveDateField("expectedCloseDate")}
                      onWebChange={(nextValue) => {
                        const parsed = fromLocalDateValue(nextValue);
                        setExpectedCloseDate(parsed ? formatDateDDMMYYYY(parsed) : "");
                      }}
                    />
                    <InputField label="Quoted Value">
                      <TextInput
                        value={quotedValue}
                        onChangeText={setQuotedValue}
                        placeholder="Quoted amount"
                        placeholderTextColor="#9CA3AF"
                        style={styles.modalInput}
                      />
                    </InputField>
                  </>
                ) : null}

                {isNegotiateToLegal(currentStage, pendingStage) ? (
                  <>
                    <InputField label="Amount">
                      <TextInput
                        value={amount}
                        onChangeText={setAmount}
                        placeholder="Enter amount"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="numeric"
                        style={styles.modalInput}
                      />
                    </InputField>
                    <InputField label="Notes">
                      <TextInput
                        value={notes}
                        onChangeText={setNotes}
                        placeholder="Add notes"
                        placeholderTextColor="#9CA3AF"
                        multiline
                        textAlignVertical="top"
                        style={[styles.modalInput, styles.modalTextarea]}
                      />
                    </InputField>
                  </>
                ) : null}

                {!usesSpecialMoveFields ? (
                  <InputField label="Notes">
                    <TextInput
                      value={notes}
                      onChangeText={setNotes}
                      placeholder="Add context for this move..."
                      placeholderTextColor="#9CA3AF"
                      multiline
                      textAlignVertical="top"
                      style={[styles.modalInput, styles.modalTextarea]}
                    />
                  </InputField>
                ) : null}
              </>
            )}

            {activeDateField && Platform.OS === "ios" ? (
              <View style={styles.datePickerCard}>
                <DateTimePicker
                  value={dateFieldValue}
                  mode="date"
                  display="inline"
                  onChange={(_event, selectedDate) => {
                    if (selectedDate && activeDateField) {
                      setDateFieldValue(activeDateField, selectedDate);
                    }
                  }}
                />
                <TouchableOpacity onPress={() => setActiveDateField(null)} style={styles.datePickerDoneBtn}>
                  <TText style={styles.datePickerDoneText}>Done</TText>
                </TouchableOpacity>
              </View>
            ) : null}

            {activeDateField && Platform.OS === "android" ? (
              <DateTimePicker
                value={dateFieldValue}
                mode="date"
                display="default"
                onChange={(event, selectedDate) => {
                  setActiveDateField(null);
                  if (event.type === "set" && selectedDate && activeDateField) {
                    setDateFieldValue(activeDateField, selectedDate);
                  }
                }}
              />
            ) : null}

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGhost]} onPress={resetActionForm}>
                <TText style={styles.modalBtnGhostText}>Cancel</TText>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={submitStageAction}>
                <TText style={styles.modalBtnPrimaryText}>
                  {actionMode === "restore" ? "Restore" : "Submit"}
                </TText>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const SectionTitle = ({ title }: { title: string }) => <TText style={stylesShared.sectionTitle}>{title}</TText>;

const infoIconForLabel = (label: string): keyof typeof Ionicons.glyphMap => {
  switch (label.toLowerCase()) {
    case "phone":
      return "call-outline";
    case "email":
      return "mail-outline";
    case "source":
      return "megaphone-outline";
    case "assigned to":
      return "person-outline";
    case "last contact":
      return "time-outline";
    default:
      return "ellipse-outline";
  }
};

const InfoRow = ({ label, value, emphasize, isLast = false }: { label: string; value: string; emphasize?: boolean; isLast?: boolean }) => (
  <View style={[stylesShared.infoRow, isLast ? stylesShared.infoRowLast : null]}>
    <View style={stylesShared.infoLeft}>
      <Ionicons name={infoIconForLabel(label)} size={18} color="#6B7280" />
      <TText style={stylesShared.infoLabel}>{label}</TText>
    </View>
    <TText style={[stylesShared.infoValue, emphasize ? stylesShared.infoValueEmphasis : null]} numberOfLines={1}>
      {value}
    </TText>
  </View>
);

const ActionCard = ({
  title,
  subtitle,
  icon,
  tone,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: "green" | "amber" | "rose" | "blue";
  onPress: () => void;
}) => {
  const toneMap = {
    green: { bg: "#F0FDF4", bd: "#BBF7D0", fg: "#15803D", iconBg: "#DCFCE7" },
    amber: { bg: "#FFF7ED", bd: "#FED7AA", fg: "#C2410C", iconBg: "#FFEDD5" },
    rose: { bg: "#FEF2F2", bd: "#FECACA", fg: "#BE123C", iconBg: "#FFE4E6" },
    blue: { bg: "#EFF6FF", bd: "#BFDBFE", fg: "#1D4ED8", iconBg: "#DBEAFE" },
  }[tone];

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[stylesShared.actionCard, { backgroundColor: toneMap.bg, borderColor: toneMap.bd }]}
    >
      <View style={[stylesShared.actionIconWrap, { backgroundColor: toneMap.iconBg }]}>
        <Ionicons name={icon} size={16} color={toneMap.fg} />
      </View>
      <TText style={[stylesShared.actionCardTitle, { color: toneMap.fg }]}>{title}</TText>
      <TText style={[stylesShared.actionCardSubtitle, { color: toneMap.fg }]}>{subtitle}</TText>
    </TouchableOpacity>
  );
};

const InputField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <View style={stylesShared.modalField}>
    <TText style={stylesShared.modalLabel}>{label}</TText>
    {children}
  </View>
);

const DateField = ({
  label,
  value,
  onPress,
  onWebChange,
}: {
  label: string;
  value: string;
  onPress: () => void;
  onWebChange: (value: string) => void;
}) => (
  <InputField label={label}>
    {Platform.OS === "web" ? (
      <View style={stylesShared.dateFieldWrap}>
        <input
          type="date"
          style={stylesShared.webDateInput as any}
          value={value ? toLocalDateValue(parseDDMMYYYY(value)) : ""}
          onChange={(e) => onWebChange((e.target as HTMLInputElement).value)}
        />
      </View>
    ) : (
      <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={stylesShared.dateFieldButton}>
        <TText style={[stylesShared.dateFieldText, !value ? stylesShared.dateFieldPlaceholder : null]}>
          {value || "dd/mm/yyyy"}
        </TText>
        <Ionicons name="calendar-outline" size={16} color="#6B7280" />
      </TouchableOpacity>
    )}
  </InputField>
);

const stylesShared = StyleSheet.create({
  sectionTitle: {
    marginTop: 16,
    marginHorizontal: 16,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: "800",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  infoRow: {
    minHeight: 50,
    paddingHorizontal: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    gap: 10,
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  infoLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  infoLabel: {
    fontSize: 12,
    color: "#1F2937",
    fontWeight: "600",
  },
  infoValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 12,
    color: "#111827",
    fontWeight: "700",
    marginLeft: 12,
  },
  infoValueEmphasis: {
    color: "#2464B2",
  },
  actionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  actionCard: {
    flex: 1,
    minHeight: 82,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  actionCardTitle: {
    marginTop: 5,
    fontSize: 11,
    fontWeight: "800",
  },
  actionCardSubtitle: {
    marginTop: 3,
    fontSize: 7,
    fontWeight: "500",
    textAlign: "center",
  },
  dateFieldWrap: {
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  webDateInput: {
    width: "100%",
    height: 22,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: "#171717",
    fontSize: 14,
  },
  dateFieldButton: {
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateFieldText: {
    fontSize: 14,
    color: "#171717",
    fontWeight: "500",
  },
  dateFieldPlaceholder: {
    color: "#9CA3AF",
  },
  modalField: {
    marginTop: 14,
  },
  modalLabel: {
    marginBottom: 8,
    fontSize: 13,
    fontWeight: "700",
    color: "#737373",
  },
});

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
      paddingBottom: 104,
    },
    headerCard: {
      backgroundColor: "#FFFFFF",
      paddingTop: 16,
      paddingHorizontal: 18,
      paddingBottom: 12,
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
      fontSize: 18,
      lineHeight: 28,
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
    emptyCard: {
      marginHorizontal: 16,
      marginTop: 16,
      borderRadius: 18,
      backgroundColor: "#FFFFFF",
      padding: 18,
      alignItems: "center",
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: "900",
      color: "#171717",
    },
    heroCard: {
      marginTop: 10,
      marginHorizontal: 16,
      backgroundColor: "#FFFFFF",
      borderRadius: 20,
      borderWidth: 1,
      borderColor: "#E2E8F0",
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 12,
      shadowColor: "#CBD5E1",
      shadowOpacity: 0.14,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    heroName: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: "900",
      color: "#171717",
    },
    heroSubtitle: {
      marginTop: 4,
      fontSize: 12,
      lineHeight: 16,
      color: "#5F5F66",
      fontWeight: "500",
    },
    heroAmount: {
      marginTop: 10,
      fontSize: 20,
      lineHeight: 24,
      fontWeight: "900",
      color: "#171717",
      letterSpacing: 0.2,
    },
    heroMetaRow: {
      marginTop: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
    },
    heroStagePill: {
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    heroStageText: {
      fontSize: 10,
      fontWeight: "800",
    },
    heroScoreText: {
      fontSize: 10,
      color: "#A3A3A3",
      fontWeight: "600",
    },
    actionHeroRow: {
      marginTop: 10,
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 16,
    },
    infoCard: {
      marginHorizontal: 10,
      borderRadius: 10,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "#E2E8F0",
      overflow: "hidden",
      shadowColor: "#CBD5E1",
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 2,
    },
    activityCard: {
      marginHorizontal: 16,
      marginBottom: 16,
      borderRadius: 16,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "#E2E8F0",
      overflow: "hidden",
      shadowColor: "#CBD5E1",
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 2,
    },
    activityRow: {
      minHeight: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      flexDirection: "row",
      gap: 8,
      borderBottomWidth: 1,
      borderBottomColor: "#E5E7EB",
    },
    activityRowLast: {
      borderBottomWidth: 0,
    },
    activityIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 8,
      backgroundColor: "#F8FAFC",
      borderWidth: 1,
      borderColor: "#E2E8F0",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 0,
    },
    activityTextWrap: {
      flex: 1,
    },
    activityTitle: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: "500",
      color: "#171717",
    },
    activityTime: {
      marginTop: 2,
      fontSize: 9,
      color: "#A3A3A3",
      fontWeight: "500",
    },
    emptyActivityText: {
      paddingHorizontal: 16,
      paddingVertical: 16,
      fontSize: 11,
      color: "#737373",
      textAlign: "center",
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(15,23,42,0.28)",
      justifyContent: "flex-end",
      padding: 18,
    },
    modalCard: {
      borderRadius: 28,
      backgroundColor: "#FFFFFF",
      paddingHorizontal: 22,
      paddingTop: 24,
      paddingBottom: 20,
      maxHeight: "88%",
    },
    modalTitle: {
      fontSize: 22,
      fontWeight: "900",
      color: "#171717",
    },
    modalSubtext: {
      marginTop: 8,
      fontSize: 15,
      lineHeight: 22,
      color: "#737373",
    },
    modalInput: {
      minHeight: 50,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: "#E5E7EB",
      backgroundColor: "#F8FAFC",
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: "#171717",
    },
    modalTextarea: {
      minHeight: 100,
    },
    datePickerCard: {
      marginTop: 14,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: "#E5E7EB",
      backgroundColor: "#F8FAFC",
      padding: 10,
    },
    datePickerDoneBtn: {
      marginTop: 8,
      alignSelf: "flex-end",
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: "#2464B2",
    },
    datePickerDoneText: {
      fontSize: 13,
      fontWeight: "700",
      color: "#FFFFFF",
    },
    modalActions: {
      marginTop: 18,
      flexDirection: "row",
      gap: 12,
    },
    modalBtn: {
      flex: 1,
      minHeight: 52,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    modalBtnGhost: {
      backgroundColor: "#F8FAFC",
      borderWidth: 1,
      borderColor: "#E5E7EB",
    },
    modalBtnPrimary: {
      backgroundColor: "#2464B2",
    },
    modalBtnGhostText: {
      fontSize: 16,
      fontWeight: "800",
      color: "#171717",
    },
    modalBtnPrimaryText: {
      fontSize: 16,
      fontWeight: "800",
      color: "#FFFFFF",
    },
  });

export default LeadDetails;
