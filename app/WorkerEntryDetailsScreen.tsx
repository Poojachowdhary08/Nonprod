import React, { useMemo, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import ModalSelector from "react-native-modal-selector";
import TText from "@/components/TText";
import { useTheme } from "@/src/theme/ThemeProvider";
import { authenticatedFetch } from "@/utils/auth";
import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";

type Entry = {
  id: number;
  date: string;
  created_at: string;
  project_id: string;
  property_id: string;
  work_duration_type: "daily" | "hourly" | null;
  day_type: "full" | "half" | "" | null;
  hours_worked: number;
  work_completed_sqft: number;
  work_completed_cubic_meter: number;
  unit_type?: string | null;
  remarks: string | null;
  entry_type: string | null;
  contractor_type: string | null;
  num_workers: number;
  skilled_count: number;
  unskilled_count: number;
  created_by_engineer_id: string | null;
  created_by_engineer_name?: string | null;
  phase_name?: string | null;
  has_payment?: boolean | null;
};

const toSingle = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value || "";

const safeJsonParse = <T,>(raw: string): T | null => {
  try {
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const toDDMMYYYY = (input: string) => {
  const d = new Date(input);
  if (isNaN(d.getTime())) return input || "-";
  const dd = `${d.getDate()}`.padStart(2, "0");
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const parseUTCDateInput = (input: string) => {
  const raw = String(input || "").trim();
  if (!raw) return null;

  const customFormatMatch = raw.match(
    /^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm]))?$/
  );
  if (customFormatMatch) {
    const [, dd, mm, yyyy, hh = "0", min = "0", ss = "0", meridiem] = customFormatMatch;
    let hours = Number(hh);
    if (meridiem) {
      const period = meridiem.toUpperCase();
      if (period === "PM" && hours < 12) hours += 12;
      if (period === "AM" && hours === 12) hours = 0;
    }
    return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), hours, Number(min), Number(ss)));
  }

  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
};

const formatUTCToISTDateTime = (input: string) => {
  const d = parseUTCDateInput(input);
  if (!d) return input || "-";

  const istDate = new Date(d.getTime() + (5 * 60 + 30) * 60 * 1000);
  const dd = `${istDate.getUTCDate()}`.padStart(2, "0");
  const mm = `${istDate.getUTCMonth() + 1}`.padStart(2, "0");
  const yyyy = istDate.getUTCFullYear();
  const hours24 = istDate.getUTCHours();
  const minutes = `${istDate.getUTCMinutes()}`.padStart(2, "0");
  const ampm = hours24 >= 12 ? "PM" : "AM";
  const hours12 = `${hours24 % 12 || 12}`.padStart(2, "0");

  return `${dd}-${mm}-${yyyy} ${hours12}:${minutes}${ampm}`;
};

const upper = (s?: string | null) => (s ? String(s).toUpperCase() : "");
const WARNING = "#F59E0B";
const WARNING_SOFT_LIGHT = "#FFFBEB";
const MS: any = ModalSelector;

type EntryForm = {
  date: string;
  work_duration_type: "daily" | "hourly";
  day_type: "full" | "half" | "";
  phase_name: string;
  entry_type: "Regular" | "Customer Add On" | "Avenue Add On";
  contractor_type: "Contractor" | "NMR";
  num_workers: string;
  skilled_count: string;
  unskilled_count: string;
  hours_worked: string;
  unit_type: "sqft" | "rft" | "cubic" | "auger_12" | "auger_15" | "auger_18" | "cbft";
  work_completed_value: string;
  remarks: string;
};

const normalizeEntryType = (t?: string | null) => {
  if (!t) return "";
  const raw = t.toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (raw === "regular") return "Regular";
  if (raw === "customer_add_on") return "Customer Add-On";
  if (raw === "avenue_add_on") return "Avenue Add-On";
  return t
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
};

const canonicalEntryType = (t?: string | null): EntryForm["entry_type"] => {
  const normalized = normalizeEntryType(t);
  if (normalized === "Customer Add-On" || normalized === "Customer Add On") return "Customer Add On";
  if (normalized === "Avenue Add-On" || normalized === "Avenue Add On") return "Avenue Add On";
  return "Regular";
};

const canonicalContractorType = (t?: string | null): EntryForm["contractor_type"] =>
  t === "NMR" ? "NMR" : "Contractor";

const UNIT_TYPE_OPTIONS: { key: EntryForm["unit_type"]; label: string }[] = [
  { key: "sqft", label: "SQFT" },
  { key: "rft", label: "RFT" },
  { key: "cubic", label: "Cubic" },
  { key: "auger_12", label: "12 Augur" },
  { key: "auger_15", label: "15 Augur" },
  { key: "auger_18", label: "18 Augur" },
  { key: "cbft", label: "CBFT" },
];

const canonicalUnitType = (t?: string | null): EntryForm["unit_type"] => {
  const raw = String(t || "").trim().toLowerCase();
  if (raw === "rft") return "rft";
  if (raw === "cubic") return "cubic";
  if (raw === "auger_12") return "auger_12";
  if (raw === "auger_15") return "auger_15";
  if (raw === "auger_18") return "auger_18";
  if (raw === "cbft") return "cbft";
  return "sqft";
};

const unitTypeLabel = (t?: string | null) =>
  UNIT_TYPE_OPTIONS.find((option) => option.key === canonicalUnitType(t))?.label ?? "SQFT";

const WorkerEntryDetailsScreen: React.FC = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);

  const initialEntry = useMemo(() => safeJsonParse<Entry>(toSingle(params.entry as any)), [params.entry]);
  const [entry, setEntry] = useState<Entry | null>(initialEntry);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<EntryForm>(() => entryToForm(initialEntry));
  const propertyId = toSingle(params.propertyId as any) || entry?.property_id || "";
  const projectId = toSingle(params.projectId as any) || entry?.project_id || "";
  const canEdit = entry?.has_payment === false;
  const computedWorkers = useMemo(() => {
    const skilled = parseInt(form.skilled_count || "0", 10) || 0;
    const unskilled = parseInt(form.unskilled_count || "0", 10) || 0;
    return String(skilled + unskilled);
  }, [form.skilled_count, form.unskilled_count]);

  const onEdit = () => {
    if (!entry || !canEdit) return;
    setForm(entryToForm(entry));
    setIsEditing(true);
  };

  const setField = (field: keyof EntryForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const saveEntry = async () => {
    if (!entry || !canEdit || isSaving) return;

    const payload = {
      date: form.date.trim(),
      work_duration_type: form.work_duration_type,
      day_type: form.work_duration_type === "daily" ? form.day_type : null,
      phase_name: form.phase_name.trim(),
      entry_type: form.entry_type,
      contractor_type: form.contractor_type,
      num_workers: Number(computedWorkers || 0),
      skilled_count: Number(form.skilled_count || 0),
      unskilled_count: Number(form.unskilled_count || 0),
      hours_worked: form.work_duration_type === "hourly" ? Number(form.hours_worked || 0) : null,
      unit_type: form.unit_type,
      work_completed_sqft: Number(form.work_completed_value || 0),
      work_completed_cubic_meter: 0,
      remarks: form.remarks.trim() || null,
    };

    if (!payload.date) {
      Alert.alert("Missing Date", "Please enter the date in YYYY-MM-DD format.");
      return;
    }
    if (payload.work_duration_type === "daily" && !payload.day_type) {
      Alert.alert("Missing Day Type", "Please choose Full or Half for daily work.");
      return;
    }

    try {
      setIsSaving(true);
      const res = await authenticatedFetch(`${APP_API_BASE_URL}/daily-work/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.detail || data?.message || `HTTP ${res.status}`);
      }

      const nextEntry: Entry = {
        ...entry,
        ...(data?.entry || payload),
        day_type: (data?.entry?.day_type ?? payload.day_type) as Entry["day_type"],
        hours_worked: data?.entry?.hours_worked ?? payload.hours_worked ?? 0,
        remarks: data?.entry?.remarks ?? payload.remarks,
        has_payment: data?.entry?.has_payment ?? false,
      };
      setEntry(nextEntry);
      setForm(entryToForm(nextEntry));
      setIsEditing(false);
      Alert.alert("Saved", data?.message || "Entry updated successfully.");
    } catch (e: any) {
      Alert.alert("Update Failed", e?.message || "Could not update this entry.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!entry) {
    return (
      <View style={styles.center}>
        <TText style={styles.muted}>Entry details are unavailable.</TText>
        <TouchableOpacity onPress={() => router.back()} style={styles.secondaryBtn}>
          <TText style={styles.secondaryBtnText}>Back</TText>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="worker-entry-details-screen-root">
      <View style={styles.headerContainer}>
        <View style={styles.headerSide}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerIconBtn}>
            <Ionicons name="arrow-back" size={22} color={C.text} />
          </TouchableOpacity>
        </View>

        <TText style={styles.headerTitle} numberOfLines={1}>
          Entry Details
        </TText>

        <View style={styles.headerSide}>
          <TouchableOpacity onPress={() => router.push("/HomeScreen")} style={styles.headerIconBtn}>
            <Ionicons name="home" size={22} color={C.text} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.page} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
        <View style={styles.summaryBand}>
          <View style={styles.summaryIcon}>
            <Ionicons name="layers-outline" size={18} color={C.primaryStrong} />
          </View>
          <View style={styles.summaryTextWrap}>
            <TText style={styles.phaseTitle} numberOfLines={2}>
              {entry.phase_name || "-"}
            </TText>
            <TText style={styles.summarySub} numberOfLines={1}>
              {toDDMMYYYY(entry.date)} • {upper(entry.work_duration_type || "-")}
            </TText>
          </View>
          <View style={[styles.statusPill, canEdit ? styles.statusOpen : styles.statusLocked]}>
            <TText style={[styles.statusText, canEdit ? styles.statusOpenText : styles.statusLockedText]}>
              {canEdit ? "Unpaid" : "Paid"}
            </TText>
          </View>
        </View>

        {canEdit && !isEditing && (
          <TouchableOpacity style={styles.editIconBtn} activeOpacity={0.9} onPress={onEdit}>
            <Ionicons name="create-outline" size={18} color={C.primaryStrong} />
          </TouchableOpacity>
        )}

        {!canEdit && (
          <TouchableOpacity
            style={styles.readOnlyNotice}
            activeOpacity={0.9}
            onPress={() => Alert.alert("Paid Entry", "This entry already has payment, so editing is disabled.")}
          >
            <Ionicons name="lock-closed-outline" size={15} color={C.mutedText} />
            <TText style={styles.readOnlyText}>Editing disabled after payment.</TText>
          </TouchableOpacity>
        )}

        {isEditing ? (
          <>
            <View style={styles.section}>
              <TwoCol
                left={<EditableItem label="Date" value={form.date} onChangeText={(v) => setField("date", v)} compact />}
                right={
                  <ChoiceItem
                    label="Duration"
                    value={form.work_duration_type}
                    options={[
                      { key: "daily", label: "Daily" },
                      { key: "hourly", label: "Hourly" },
                    ]}
                    onChange={(v) => {
                      setField("work_duration_type", v as EntryForm["work_duration_type"]);
                      if (v === "hourly") setField("day_type", "");
                    }}
                    compact
                  />
                }
              />
              {form.work_duration_type === "daily" && (
                <ChoiceItem
                  label="Day Type"
                  value={form.day_type}
                  options={[
                    { key: "full", label: "Full" },
                    { key: "half", label: "Half" },
                  ]}
                  onChange={(v) => setField("day_type", v as EntryForm["day_type"])}
                />
              )}
              <EditableItem label="Phase" value={form.phase_name} onChangeText={(v) => setField("phase_name", v)} />
              <TwoCol
                left={
                  <DropdownItem
                    label="Entry Type"
                    value={form.entry_type}
                    options={[
                      { key: "Regular", label: "Regular" },
                      { key: "Avenue Add On", label: "Avenue Add On" },
                      { key: "Customer Add On", label: "Customer Add On" },
                    ]}
                    onChange={(v) => setField("entry_type", v as EntryForm["entry_type"])}
                    compact
                  />
                }
                right={
                  <ChoiceItem
                    label="Contractor Type"
                    value={form.contractor_type}
                    options={[
                      { key: "Contractor", label: "Contractor" },
                      { key: "NMR", label: "NMR" },
                    ]}
                    onChange={(v) => setField("contractor_type", v as EntryForm["contractor_type"])}
                    compact
                  />
                }
              />
            </View>

            <View style={styles.section}>
              <TwoCol
                left={<DetailItem label="Workers" value={computedWorkers} compact />}
                right={<EditableItem label="Skilled" value={form.skilled_count} keyboardType="numeric" onChangeText={(v) => setField("skilled_count", v)} compact />}
              />
              <TwoCol
                left={<EditableItem label="Unskilled" value={form.unskilled_count} keyboardType="numeric" onChangeText={(v) => setField("unskilled_count", v)} compact />}
                right={
                  form.work_duration_type === "hourly" ? (
                    <EditableItem label="Hours" value={form.hours_worked} keyboardType="numeric" onChangeText={(v) => setField("hours_worked", v)} compact />
                  ) : (
                    <View />
                  )
                }
              />
              <TwoCol
                left={
                  <DropdownItem
                    label="Unit Type"
                    value={form.unit_type}
                    options={UNIT_TYPE_OPTIONS}
                    onChange={(v) => setField("unit_type", v as EntryForm["unit_type"])}
                    compact
                  />
                }
                right={
                  <EditableItem
                    label="Work Completed"
                    value={form.work_completed_value}
                    keyboardType="numeric"
                    onChangeText={(v) => setField("work_completed_value", v)}
                    compact
                  />
                }
              />
            </View>
          </>
        ) : (
          <>
            <View style={styles.section}>
              <TwoCol
                left={<DetailItem label="Date" value={toDDMMYYYY(entry.date)} compact />}
                right={<DetailItem label="Duration" value={upper(entry.work_duration_type || "-")} compact />}
              />
              <TwoCol
                left={<DetailItem label="Day Type" value={upper(entry.day_type || "-")} compact />}
                right={<DetailItem label="Has Payment" value={entry.has_payment ? "True" : "False"} compact />}
              />
              <DetailItem label="Phase" value={entry.phase_name || "-"} />
              <TwoCol
                left={<DetailItem label="Entry Type" value={normalizeEntryType(entry.entry_type) || "-"} compact />}
                right={<DetailItem label="Contractor Type" value={entry.contractor_type || "-"} compact />}
              />
            </View>

            <View style={styles.section}>
              <TwoCol
                left={<DetailItem label="Workers" value={String(entry.num_workers ?? 0)} compact />}
                right={<DetailItem label="Skilled" value={String(entry.skilled_count ?? 0)} compact />}
              />
              <TwoCol
                left={<DetailItem label="Unskilled" value={String(entry.unskilled_count ?? 0)} compact />}
                right={<DetailItem label="Hours" value={String(entry.hours_worked ?? 0)} compact />}
              />
              <TwoCol
                left={<DetailItem label="Unit Type" value={unitTypeLabel(entry.unit_type)} compact />}
                right={<DetailItem label="Work Completed" value={String(entry.work_completed_sqft ?? 0)} compact />}
              />
            </View>
          </>
        )}

        <View style={styles.section}>
          <DetailItem
            label="Created By"
            value={entry.created_by_engineer_name || entry.created_by_engineer_id || "-"}
          />
          <DetailItem label="Created At" value={entry.created_at ? formatUTCToISTDateTime(entry.created_at) : "-"} />
          {isEditing ? (
            <EditableItem
              label="Remarks"
              value={form.remarks}
              onChangeText={(v) => setField("remarks", v)}
              multiline
            />
          ) : (
            <DetailItem label="Remarks" value={entry.remarks || "-"} multiline />
          )}
        </View>

        {isEditing && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.cancelBtn]}
              activeOpacity={0.9}
              onPress={() => {
                setForm(entryToForm(entry));
                setIsEditing(false);
              }}
            >
              <TText style={styles.cancelBtnText}>Cancel</TText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.saveBtn]}
              activeOpacity={0.9}
              onPress={saveEntry}
              disabled={isSaving}
            >
              <TText style={styles.saveBtnText}>{isSaving ? "Saving..." : "Save"}</TText>
            </TouchableOpacity>
          </View>
        )}
        </View>
      </ScrollView>
    </View>
  );
};

const entryToForm = (entry: Entry | null): EntryForm => ({
  date: entry?.date || "",
  work_duration_type: entry?.work_duration_type === "daily" ? "daily" : "hourly",
  day_type: entry?.day_type === "full" || entry?.day_type === "half" ? entry.day_type : "",
  phase_name: entry?.phase_name || "",
  entry_type: canonicalEntryType(entry?.entry_type),
  contractor_type: canonicalContractorType(entry?.contractor_type),
  num_workers: String(entry?.num_workers ?? 0),
  skilled_count: String(entry?.skilled_count ?? 0),
  unskilled_count: String(entry?.unskilled_count ?? 0),
  hours_worked: String(entry?.hours_worked ?? 0),
  unit_type: canonicalUnitType(entry?.unit_type),
  work_completed_value: String(entry?.work_completed_sqft ?? 0),
  remarks: entry?.remarks || "",
});

const DetailItem: React.FC<{ label: string; value: string; multiline?: boolean; compact?: boolean }> = ({
  label,
  value,
  multiline = false,
  compact = false,
}) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);

  return (
    <View style={[styles.detailRow, compact && styles.detailRowCompact, multiline && styles.detailRowMultiline]}>
      <TText style={styles.detailLabel}>{label}</TText>
      <TText style={[styles.detailValue, compact && styles.detailValueCompact, multiline && styles.detailValueMultiline]}>{value}</TText>
    </View>
  );
};

const EditableItem: React.FC<{
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: React.ComponentProps<typeof TextInput>["keyboardType"];
  multiline?: boolean;
  compact?: boolean;
}> = ({ label, value, onChangeText, keyboardType = "default", multiline = false, compact = false }) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);

  return (
    <View style={[styles.detailRow, compact && styles.detailRowCompact, multiline && styles.detailRowMultiline]}>
      <TText style={styles.detailLabel}>{label}</TText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        placeholderTextColor={C.subtleText}
        style={[styles.input, compact && styles.inputCompact, multiline && styles.textarea]}
      />
    </View>
  );
};

const ChoiceItem: React.FC<{
  label: string;
  value: string;
  options: { key: string; label: string }[];
  onChange: (value: string) => void;
  compact?: boolean;
}> = ({ label, value, options, onChange, compact = false }) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);

  return (
    <View style={[styles.detailRow, compact && styles.detailRowCompact]}>
      <TText style={styles.detailLabel}>{label}</TText>
      <View style={styles.choiceRow}>
        {options.map((option) => {
          const active = option.key === value;
          return (
            <TouchableOpacity
              key={option.key}
              style={[styles.choiceBtn, compact && styles.choiceBtnCompact, active && styles.choiceBtnActive]}
              activeOpacity={0.9}
              onPress={() => onChange(option.key)}
            >
              <TText style={[styles.choiceText, active && styles.choiceTextActive]}>{option.label}</TText>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const DropdownItem: React.FC<{
  label: string;
  value: string;
  options: { key: string; label: string }[];
  onChange: (value: string) => void;
  compact?: boolean;
}> = ({ label, value, options, onChange, compact = false }) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);

  const selectedLabel = options.find((option) => option.key === value)?.label ?? "Select";

  return (
    <View style={[styles.detailRow, compact && styles.detailRowCompact]}>
      <TText style={styles.detailLabel}>{label}</TText>
      <View style={styles.dropdownWrap}>
        <MS
          data={options as any}
          keyExtractor={(item: { key: string }) => item.key}
          labelExtractor={(item: { label: string }) => item.label}
          initValue={selectedLabel}
          onChange={(option: any) => onChange(option.key)}
          cancelText="Cancel"
          style={styles.dropdownOuter}
          selectStyle={compact ? styles.dropdownSelectCompactMerged : styles.dropdownSelect}
          selectTextStyle={styles.dropdownSelectText}
          initValueTextStyle={styles.dropdownSelectText}
          optionTextStyle={styles.dropdownOptionText}
          cancelTextStyle={styles.dropdownOptionText}
          overlayStyle={styles.dropdownOverlay}
          optionContainerStyle={styles.dropdownMenu}
          cancelContainerStyle={styles.dropdownMenu}
        />
        <Ionicons name="chevron-down" size={16} color={C.primaryStrong} style={styles.dropdownChevron} />
      </View>
    </View>
  );
};

const TwoCol: React.FC<{ left: React.ReactNode; right: React.ReactNode }> = ({ left, right }) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);

  return (
    <View style={styles.twoColRow}>
      <View style={styles.twoColItem}>{left}</View>
      <View style={styles.twoColGap} />
      <View style={styles.twoColItem}>{right}</View>
    </View>
  );
};

const createStyles = (C: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: C.bg },
    muted: { color: C.mutedText, marginBottom: 12 },
    headerContainer: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 8,
      paddingVertical: 12,
      backgroundColor: C.headerBg,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    headerTitle: {
      flex: 1,
      textAlign: "center",
      fontSize: 18,
      fontWeight: "bold",
      color: C.text,
    },
    headerSide: { width: 48, alignItems: "center", justifyContent: "center" },
    headerIconBtn: {
      padding: 4,
    },
    page: { flex: 1 },
    pageContent: { padding: 14, paddingBottom: 28 },
    card: {
      backgroundColor: C.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.border,
      padding: 12,
      ...(Platform.OS === "android"
        ? { elevation: 1 }
        : { shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }),
    },
    summaryBand: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.inputBg,
      borderRadius: 12,
      padding: 12,
      gap: 10,
      marginBottom: 10,
    },
    summaryIcon: {
      width: 38,
      height: 38,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.primarySoft,
    },
    summaryTextWrap: { flex: 1, minWidth: 0 },
    phaseTitle: { fontSize: 14, fontWeight: "900", color: C.text },
    summarySub: { marginTop: 4, fontSize: 11, fontWeight: "700", color: C.mutedText },
    statusPill: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: 1,
    },
    statusOpen: { backgroundColor: WARNING_SOFT_LIGHT, borderColor: WARNING_SOFT_LIGHT },
    statusLocked: { backgroundColor: C.successSoft, borderColor: C.successSoft },
    statusText: { fontSize: 10, fontWeight: "900" },
    statusOpenText: { color: WARNING },
    statusLockedText: { color: C.success },
    editIconBtn: {
      marginTop: 2,
      marginBottom: 6,
      width: 40,
      height: 40,
      borderRadius: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "flex-end",
      backgroundColor: C.primarySoft,
      borderWidth: 1,
      borderColor: C.border,
    },
    readOnlyNotice: {
      marginTop: 2,
      marginBottom: 6,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 11,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: C.surfaceAlt,
      borderWidth: 1,
      borderColor: C.border,
    },
    readOnlyText: { color: C.mutedText, fontSize: 11, fontWeight: "700" },
    section: {
      marginTop: 6,
    },
    twoColRow: {
      flexDirection: "row",
      alignItems: "flex-start",
    },
    twoColItem: {
      flex: 1,
      minWidth: 0,
    },
    twoColGap: {
      width: 12,
    },
    detailRow: {
      backgroundColor: C.card,
      minHeight: 35,
      justifyContent: "center",
      paddingHorizontal: 0,
      paddingVertical: 6,
      position: "relative",
    },
    detailRowMultiline: { alignItems: "flex-start" },
    detailRowCompact: {
      paddingVertical: 5,
    },
    detailLabel: {
      fontSize: 11,
      fontWeight: "600",
      color: C.mutedText,
      marginBottom: 6,
    },
    detailValue: {
      width: "100%",
      backgroundColor: C.surfaceAlt,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 11,
      fontWeight: "700",
      color: C.text,
    },
    detailValueCompact: {
      minHeight: 35,
      paddingVertical: 9,
      paddingHorizontal: 10,
    },
    detailValueMultiline: { lineHeight: 20 },
    input: {
      width: "100%",
      minHeight: 35,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: C.inputBg,
      color: C.text,
      fontSize: 11,
    },
    inputCompact: {
      paddingHorizontal: 10,
    },
    textarea: {
      minHeight: 44,
      lineHeight: 20,
    },
    dropdownOuter: {
      borderRadius: 10,
    },
    dropdownWrap: {
      position: "relative",
      width: "100%",
    },
    dropdownSelect: {
      width: "100%",
      minHeight: 35,
      borderWidth: 1,
      borderColor: C.primaryStrong,
      borderRadius: 12,
      paddingLeft: 12,
      paddingRight: 34,
      paddingVertical: 10,
      backgroundColor: C.card,
      justifyContent: "center",
    },
    dropdownSelectCompact: {
      minHeight: 35,
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
    dropdownSelectCompactMerged: {
      width: "100%",
      minHeight: 35,
      borderWidth: 1,
      borderColor: C.primaryStrong,
      borderRadius: 12,
      paddingLeft: 10,
      paddingRight: 34,
      paddingVertical: 9,
      backgroundColor: C.card,
      justifyContent: "center",
    },
    dropdownSelectText: {
      fontSize: 11,
      color: C.primaryStrong,
      fontWeight: "800",
    },
    dropdownOptionText: {
      fontSize: 11,
      color: C.text,
    },
    dropdownChevron: {
      position: "absolute",
      right: 12,
      top: 10,
      pointerEvents: "none",
    },
    dropdownOverlay: {
      backgroundColor: C.overlayStrong,
    },
    dropdownMenu: {
      backgroundColor: C.card,
      borderColor: C.border,
      borderWidth: 1,
      borderRadius: 12,
    },
    choiceRow: {
      flexDirection: "row",
      gap: 10,
      flexWrap: "wrap",
    },
    choiceBtn: {
      minHeight: 35,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.inputBg,
      paddingHorizontal: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    choiceBtnCompact: {
      paddingHorizontal: 10,
    },
    choiceBtnActive: {
      borderColor: C.primaryStrong,
      backgroundColor: C.primarySoft,
    },
    choiceText: {
      color: C.mutedText,
      fontSize: 11,
      fontWeight: "700",
    },
    choiceTextActive: {
      color: C.primaryStrong,
    },
    actionRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 10,
    },
    actionBtn: {
      flex: 1,
      minHeight: 46,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    cancelBtn: {
      backgroundColor: C.surfaceAlt,
      borderWidth: 1,
      borderColor: C.border,
    },
    saveBtn: {
      backgroundColor: C.primary,
    },
    cancelBtnText: { color: C.text, fontWeight: "800", fontSize: 14 },
    saveBtnText: { color: C.white, fontWeight: "800", fontSize: 16 },
    secondaryBtn: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.surface,
    },
    secondaryBtnText: { color: C.text, fontWeight: "900" },
  });

export default WorkerEntryDetailsScreen;
