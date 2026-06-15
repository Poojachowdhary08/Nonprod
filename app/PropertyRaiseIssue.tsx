import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
// PropertyRaiseIssue.tsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { View, TouchableOpacity, StyleSheet, ScrollView, TextInput, Modal, Alert, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import ModalSelector from "@/components/AppModalSelect";
import axios from "axios";
import * as DocumentPicker from "expo-document-picker";
import * as mime from "react-native-mime-types";
import DateTimePicker from "@react-native-community/datetimepicker";

// ✅ NEW: offline & storage
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFontScale } from "@/context/FontScaleContext";
import TText from "@/components/TText";
import { useTheme } from "@/src/theme/ThemeProvider";
import { authenticatedFetch } from "../utils/auth";

// ------------ Types ------------
interface ProjectOption {
  key: string;
  label: string;
}
type OptionKV = { key: string; label: string };

// ------------ Constants ------------
const API_BASE = `${APP_API_BASE_URL}`;
const OUTBOX_KEY = "outbox:tickets:v1";
const CACHE_EMPLOYEES = "cache:employees:v1";
const CACHE_ISSUE_TYPES = "cache:issueTypes:v1";
const cachePhasesKey = (pid: string) => `cache:phases:${pid}:v1`;
const cacheAssignedKey = (pid: string) => `cache:assigned:${pid}:v1`;
const todayAtMidnight = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
};
const toLocalDateValue = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
const fromLocalDateValue = (value: string) => {
  const [yyyy, mm, dd] = value.split("-").map(Number);
  return new Date(yyyy, (mm || 1) - 1, dd || 1);
};

// ------------ Helpers (Outbox & Files) ------------
async function serializeFiles(files: any[]) {
  // Converts `selectedFiles` to storable format
  const out = await Promise.all(
    files.map(async (f: any) => {
      const name = f.name || "file";
      const type =
        f.type || f.mimeType || (mime as any).lookup?.(name) || "application/octet-stream";

      if (Platform.OS === "web") {
        // store as dataURL for offline
        const dataUrl: string = await new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onerror = reject;
          fr.onload = () => resolve(String(fr.result));
          fr.readAsDataURL(f as File);
        });
        return { name, type, dataUrl };
      } else {
        // RN: keep URI
        return { name, type, uri: f.uri };
      }
    })
  );
  return out;
}

async function enqueueOutbox(job: any) {
  const raw = await AsyncStorage.getItem(OUTBOX_KEY);
  const arr = raw ? JSON.parse(raw) : [];
  arr.push({ id: Date.now(), ...job });
  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(arr));
}

async function flushOutbox() {
  const raw = await AsyncStorage.getItem(OUTBOX_KEY);
  const arr: any[] = raw ? JSON.parse(raw) : [];
  if (!arr.length) return;

  const remaining: any[] = [];
  for (const job of arr) {
    try {
      const formData = new FormData();

      // fields (plain)
      Object.entries(job.fields).forEach(([k, v]: any) => {
        if (Array.isArray(v)) v.forEach((val) => formData.append(k, String(val ?? "")));
        else if (v !== undefined && v !== null) formData.append(k, String(v));
      });

      // files
      for (const file of job.files || []) {
        if (Platform.OS === "web" && file.dataUrl) {
          const res = await fetch(file.dataUrl);
          const blob = await res.blob();
          // @ts-ignore: File exists on web
          formData.append("files", new File([blob], file.name, { type: file.type }));
        } else if (file.uri) {
          // RN form file
          // @ts-ignore
          formData.append("files", { uri: file.uri, name: file.name, type: file.type });
        }
      }

      const r = await authenticatedFetch(`${API_BASE}/tickets/create`, {
        method: "POST",
        body: formData,
        headers: { Accept: "application/json" },
      });
      if (!r.ok) throw new Error(await r.text());
    } catch (e) {
      remaining.push(job);
    }
  }
  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(remaining));
}

// ------------ Component ------------
const PropertyRaiseIssue = () => {
  const router = useRouter();
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  const modalSelectorSheetProps = useMemo(
    () => ({
      optionContainerStyle: { backgroundColor: C.surface, borderBottomColor: C.border },
      cancelStyle: { backgroundColor: C.surface },
      cancelTextStyle: { color: C.text },
      overlayStyle: { backgroundColor: C.overlay },
    }),
    [C]
  );
  const params = useLocalSearchParams();

  const incomingPropertyId = params.property_id as string;
  const incomingProjectId = params.project_id as string;

  const firstName = Array.isArray(params.first_name) ? params.first_name[0] : params.first_name ?? "";
  const lastName = Array.isArray(params.last_name) ? params.last_name[0] : params.last_name ?? "";
  const reporterFullName = `${firstName} ${lastName}`.trim() || "Unknown Engineer";
  const reporterEmail = Array.isArray(params.email)
    ? params.email[0]
    : (params.email as string) ?? "engineer@datso.io";
  const employeeCode = Array.isArray(params.employee_code)
    ? params.employee_code[0]
    : (params.employee_code as string) ?? "UNKNOWN_CODE";

  // (not shown in UI yet, keep for parity)
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [propertyOptions, setPropertyOptions] = useState<ProjectOption[]>([]);

  const [project, setProject] = useState("Select Project");
  const [property, setProperty] = useState("Select Property");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);

  const [issueType, setIssueType] = useState("");
  const [severity, setSeverity] = useState("");
  const [priority, setPriority] = useState("");
  const [description, setDescription] = useState("");

  const [selectedFiles, setSelectedFiles] = useState<(DocumentPicker.DocumentPickerAsset | File)[]>([]);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogMessage, setDialogMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  const [approxDate, setApproxDate] = useState<Date | null>(todayAtMidnight);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [allEmployees, setAllEmployees] = useState<OptionKV[]>([]);
  const [assignedEmployees, setAssignedEmployees] = useState<OptionKV[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [phaseOptions, setPhaseOptions] = useState<OptionKV[]>([]);
  const [scheduleId, setScheduleId] = useState<number | null>(null);
  const [selectedPhaseLabel, setSelectedPhaseLabel] = useState("");

  const [issueTypeOptions, setIssueTypeOptions] = useState<OptionKV[]>([]);
  const [availableAssignedEmployees, setAvailableAssignedEmployees] = useState<OptionKV[]>([]);

  const openWebDatePicker = useCallback((event: any) => {
    const input = event?.currentTarget as HTMLInputElement | undefined;
    if (Platform.OS !== "web" || !input) return;
    try {
      input.showPicker?.();
    } catch {
      input.focus?.();
    }
  }, []);

  // ✅ NEW: connectivity
  const [online, setOnline] = useState<boolean>(true);
  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => {
      const isUp = !!(s.isConnected && s.isInternetReachable !== false);
      setOnline(isUp);
    });
    (async () => {
      const s = await NetInfo.fetch();
      setOnline(!!(s.isConnected && s.isInternetReachable !== false));
    })();
    return () => unsub && unsub();
  }, []);

  // Auto-flush outbox when network returns
  useEffect(() => {
    if (online) flushOutbox();
  }, [online]);

  // Initialize incoming ids as read-only
  useEffect(() => {
    if (incomingPropertyId) {
      setPropertyId(incomingPropertyId);
      setProperty(incomingPropertyId);
    }
    if (incomingProjectId) {
      setProjectId(incomingProjectId);
      setProject(incomingProjectId);
    }
  }, [incomingPropertyId, incomingProjectId]);

  // -------- Fetchers (offline-aware + cache) --------
  const fetchIssueTypes = async () => {
    try {
      if (!online) {
        const cached = await AsyncStorage.getItem(CACHE_ISSUE_TYPES);
        if (cached) setIssueTypeOptions(JSON.parse(cached));
        return;
      }
      const response = await axios.get(`${API_BASE}/issue-types`);
      const data = Array.isArray(response.data) ? response.data : response.data?.data || [];
      const formatted = data.map((item: any) => ({ key: item.key, label: item.label }));
      setIssueTypeOptions(formatted);
      await AsyncStorage.setItem(CACHE_ISSUE_TYPES, JSON.stringify(formatted));
    } catch (error) {
      console.error("❌ Failed to fetch issue types:", error);
      const cached = await AsyncStorage.getItem(CACHE_ISSUE_TYPES);
      if (cached) setIssueTypeOptions(JSON.parse(cached));
    }
  };

  const fetchEmployees = async () => {
    try {
      if (!online) {
        const cached = await AsyncStorage.getItem(CACHE_EMPLOYEES);
        if (cached) setAllEmployees(JSON.parse(cached));
        return;
      }
      const response = await axios.get(`${API_BASE}/employees`);
      const employees = Array.isArray(response.data) ? response.data : response.data.employees;
      if (Array.isArray(employees)) {
        const formatted = employees.map((emp: any) => ({
          key: emp.employee_code,
          label: `${emp.first_name} ${emp.last_name} (${emp.employee_code})`,
        }));
        setAllEmployees(formatted);
        await AsyncStorage.setItem(CACHE_EMPLOYEES, JSON.stringify(formatted));
      }
    } catch (error) {
      console.error("❌ Failed to fetch employees:", error);
      const cached = await AsyncStorage.getItem(CACHE_EMPLOYEES);
      if (cached) setAllEmployees(JSON.parse(cached));
    }
  };

  const fetchAssignedEmployees = async (pid: string) => {
    try {
      if (!online) {
        const cached = await AsyncStorage.getItem(cacheAssignedKey(pid));
        if (cached) setAvailableAssignedEmployees(JSON.parse(cached));
        return;
      }
      const response = await axios.get(`${API_BASE}/assigned-employees/${pid}`);
      const data = Array.isArray(response.data.employees) ? response.data.employees : [];
      const formatted = data.map((emp: any) => ({
        key: emp.employee_code,
        label: `${emp.full_name} (${emp.employee_code})`,
      }));
      setAvailableAssignedEmployees(formatted);
      await AsyncStorage.setItem(cacheAssignedKey(pid), JSON.stringify(formatted));
    } catch (error) {
      console.error("❌ Error fetching assigned engineers:", error);
      const cached = await AsyncStorage.getItem(cacheAssignedKey(pid));
      if (cached) setAvailableAssignedEmployees(JSON.parse(cached));
    }
  };

  const fetchSchedulePhases = async (pid: string) => {
    try {
      if (!online) {
        const cached = await AsyncStorage.getItem(cachePhasesKey(pid));
        if (cached) setPhaseOptions(JSON.parse(cached));
        return;
      }
      const response = await axios.get(`${API_BASE}/properties/${pid}/schedule`);
      const data = response.data.schedule;
      if (Array.isArray(data)) {
        const formatted = data
          .filter((item: any) => item.phasename)
          .map((item: any) => ({ key: item.scheduleid, label: item.phasename }));
        setPhaseOptions(formatted);
        await AsyncStorage.setItem(cachePhasesKey(pid), JSON.stringify(formatted));
      }
    } catch (error) {
      console.error("❌ Error fetching schedule phases:", error);
      const cached = await AsyncStorage.getItem(cachePhasesKey(pid));
      if (cached) setPhaseOptions(JSON.parse(cached));
    }
  };

  // trigger fetchers
  useEffect(() => {
    fetchEmployees();
  }, [online]);
  useEffect(() => {
    fetchIssueTypes();
  }, [online]);
  useEffect(() => {
    if (propertyId) {
      fetchSchedulePhases(propertyId);
      fetchAssignedEmployees(propertyId);
    }
  }, [propertyId, online]);

  // -------- File pick --------
  const handleFilePick = async () => {
    try {
      if (Platform.OS === "web") {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        input.accept = "*/*";
        input.onchange = () => {
          if (input.files) {
            const fileArray = Array.from(input.files);
            setSelectedFiles((prev) => [...prev, ...fileArray]);
          }
        };
        input.click();
      } else {
        const result = await DocumentPicker.getDocumentAsync({ type: "*/*", multiple: true });
        if (!result.canceled && result.assets.length > 0) {
          setSelectedFiles((prev) => [...prev, ...result.assets]);
        }
      }
    } catch {
      Alert.alert("File selection failed");
    }
  };

  // ✅ UI-only: remove file row
  const removeFileAtIndex = (idx: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  // -------- UI helpers --------
  const showDialog = (msg: string) => {
    setDialogMessage(msg);
    setDialogVisible(true);
  };

  const formatDateDDMMYYYY = (date: Date): string => {
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  };

  // -------- Submit (offline aware) --------
  const handleSubmit = async () => {
    if (!projectId) return showDialog("Missing project ID.");
    if (!propertyId) return showDialog("Missing property ID.");
    if (!issueType) return showDialog("Please select issue type.");
    if (!severity) return showDialog("Please select severity.");
    if (!priority) return showDialog("Please select priority.");
    if (!description.trim()) return showDialog("Please enter description.");
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      // Form primitive fields
      const fields: Record<string, any> = {
        project_id: projectId,
        property_id: propertyId,
        issue_type: issueType,
        severity,
        priority,
        ticket_title: description,
        description,
        reported_by_email: reporterEmail ?? "engineer@datso.io", // ✅ correct field
        reported_by_employee_code: employeeCode,
        approximate_date: approxDate ? toLocalDateValue(approxDate) : "",
      };
      if (scheduleId) fields["schedule_id"] = String(scheduleId);

      const assignees = assignedEmployees.map((e) => e.key);

      if (!online) {
        // 👉 OFFLINE: queue for later
        const files = await serializeFiles(selectedFiles as any[]);
        await enqueueOutbox({
          fields: { ...fields, assigned_to_employee_code: assignees },
          files,
        });
        setIsSuccess(true);
        showDialog("You’re offline. Issue has been queued and will be submitted automatically when back online.");
        resetForm();
        return;
      }

      // 👉 ONLINE: send now
      const formData = new FormData();
      Object.entries(fields).forEach(([k, v]) => formData.append(k, String(v ?? "")));
      assignees.forEach((code) => formData.append("assigned_to_employee_code", code));

      (selectedFiles as any[]).forEach((file: any) => {
        const type =
          file.type || file.mimeType || (mime as any).lookup?.(file.name) || "application/octet-stream";
        if (Platform.OS === "web") {
          // @ts-ignore
          formData.append("files", file);
        } else {
          // @ts-ignore
          formData.append("files", { uri: file.uri, name: file.name, type });
        }
      });

      const response = await authenticatedFetch(`${API_BASE}/tickets/create`, {
        method: "POST",
        body: formData,
        headers: { Accept: "application/json" },
      });

      if (response.ok) {
        setIsSuccess(true);
        showDialog("Issue raised successfully!");
        resetForm();
      } else {
        const errorText = await response.text();
        console.error("❌ Backend error response:", errorText);
        setIsSuccess(false);
        showDialog("Failed to raise issue.");
      }
    } catch (error) {
      console.error("❌ Submission crash:", error);
      setIsSuccess(false);
      showDialog("An error occurred while raising the issue.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setProject(incomingProjectId || "Select Project");
    setProjectId(incomingProjectId ?? null);
    setProperty(incomingPropertyId || "Select Property");
    setPropertyId(incomingPropertyId ?? null);
    setIssueType("");
    setSeverity("");
    setPriority("");
    setDescription("");
    setSelectedFiles([]);
    setAssignedEmployees([]);
    setApproxDate(todayAtMidnight());
    setSelectedPhaseLabel("");
    setScheduleId(null);
  };

  // ------------ UI ------------
  return (
    <View testID="property-raise-issue-root" style={{ flex: 1 }}>
      {/* Header */}
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerIconBtn}>
          <Ionicons name="arrow-back" size={20} color={C.text} />
        </TouchableOpacity>

        <TText style={styles.headerTitle}>Property Raise Issue</TText>

        <TouchableOpacity onPress={() => router.push("/HomeScreen")} style={styles.headerIconBtn}>
          <Ionicons name="home" size={20} color={C.text} />
        </TouchableOpacity>
      </View>

      {/* Form */}
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
        {/* Project (read-only) */}
        <View style={styles.block}>
          <TText style={styles.label}>Project ID</TText>
          <View style={styles.field}>
            <TextInput style={styles.valueInput} value={(Array.isArray(project) ? project[0] : project) ?? ""} editable={false} />
          </View>
        </View>

        {/* Property (read-only) */}
        <View style={styles.block}>
          <TText style={styles.label}>Property ID</TText>
          <View style={styles.field}>
            <TextInput style={styles.valueInput} value={(Array.isArray(property) ? property[0] : property) ?? ""} editable={false} />
          </View>
        </View>

        {/* Row: Phase + Issue Category */}
        <View style={styles.row}>
          <View style={styles.col}>
            <TText style={styles.label}>Select Phase</TText>
            <View style={styles.field}>
              <ModalSelector
                data={phaseOptions}
                initValue={selectedPhaseLabel || "Select Phase"}
                onChange={(option: any) => {
                  setScheduleId(Number(option.key));
                  setSelectedPhaseLabel(option.label);
                }}
                style={styles.modalSelectorWrap}
                selectStyle={styles.modalSelectStyle}
                initValueTextStyle={styles.valueText}
                optionTextStyle={styles.optionText}
                {...modalSelectorSheetProps}
                cancelText="Cancel"
              />
            </View>
          </View>

          <View style={styles.col}>
            <TText style={styles.label}>Issue Category</TText>
            <View style={styles.field}>
              <ModalSelector
                key={issueTypeOptions.length}
                data={issueTypeOptions}
                initValue={issueType || "Select"}
                onChange={(option: any) => setIssueType(option.label)}
                cancelText="Cancel"
                style={styles.modalSelectorWrap}
                selectStyle={styles.modalSelectStyle}
                initValueTextStyle={styles.valueText}
                optionTextStyle={styles.optionText}
                {...modalSelectorSheetProps}
              />
            </View>
          </View>
        </View>

        {/* Row: Severity + Priority */}
        <View style={styles.row}>
          <View style={styles.col}>
            <TText style={styles.label}>Severity</TText>
            <View style={styles.field}>
              <ModalSelector
                data={[
                  { key: "Minor", label: "Minor" },
                  { key: "Major", label: "Major" },
                  { key: "Critical", label: "Critical" },
                ]}
                initValue={severity || "Select"}
                onChange={(option: any) => setSeverity(option.key)}
                style={styles.modalSelectorWrap}
                selectStyle={styles.modalSelectStyle}
                initValueTextStyle={styles.valueText}
                optionTextStyle={styles.optionText}
                {...modalSelectorSheetProps}
                cancelText="Cancel"
              />
            </View>
          </View>

          <View style={styles.col}>
            <TText style={styles.label}>Priority</TText>
            <View style={styles.field}>
              <ModalSelector
                data={[
                  { key: "Low", label: "Low" },
                  { key: "Medium", label: "Medium" },
                  { key: "High", label: "High" },
                ]}
                initValue={priority || "Select"}
                onChange={(option: any) => setPriority(option.key)}
                style={styles.modalSelectorWrap}
                selectStyle={styles.modalSelectStyle}
                initValueTextStyle={styles.valueText}
                optionTextStyle={styles.optionText}
                {...modalSelectorSheetProps}
                cancelText="Cancel"
              />
            </View>
          </View>
        </View>

        {/* Date */}
        <View style={styles.block}>
          <TText style={styles.label}>Date</TText>

          {Platform.OS === "web" ? (
            <View style={[styles.field, styles.fieldRow]}>
              <input
                type="date"
                style={{
                  ...(styles.webDateInput as any),
                  WebkitAppearance: "auto",
                  appearance: "auto",
                  cursor: "pointer",
                }}
                min={toLocalDateValue(todayAtMidnight())}
                value={approxDate ? toLocalDateValue(approxDate) : ""}
                onMouseDown={openWebDatePicker}
                onTouchStart={openWebDatePicker}
                onChange={(e) => {
                  const nextValue = (e.target as HTMLInputElement).value;
                  if (!nextValue) {
                    setApproxDate(todayAtMidnight());
                    return;
                  }
                  setApproxDate(fromLocalDateValue(nextValue));
                }}
              />
              <Ionicons name="calendar-outline" size={18} color={C.mutedText} pointerEvents="none" />
            </View>
          ) : (
            <>
              <TouchableOpacity onPress={() => setShowDatePicker(true)} style={[styles.field, styles.fieldRow]}>
                <TText style={[styles.valueText, !approxDate && { color: C.subtleText }]}>
                  {approxDate ? formatDateDDMMYYYY(approxDate) : "Select date"}
                </TText>
                <Ionicons name="calendar-outline" size={18} color={C.mutedText} />
              </TouchableOpacity>

              {showDatePicker && Platform.OS === "ios" && (
                <Modal transparent animationType="slide">
                  <View style={styles.modalContainer}>
                    <View style={styles.modalContent}>
                      <DateTimePicker
                        value={approxDate || todayAtMidnight()}
                        mode="date"
                        display="inline"
                        minimumDate={todayAtMidnight()}
                        onChange={(event, selectedDate) => {
                          if (selectedDate) setApproxDate(selectedDate);
                        }}
                      />
                      <TouchableOpacity onPress={() => setShowDatePicker(false)} style={styles.doneBtn}>
                        <TText style={styles.doneBtnText}>Done</TText>
                      </TouchableOpacity>
                    </View>
                  </View>
                </Modal>
              )}

              {showDatePicker && Platform.OS === "android" && (
                <DateTimePicker
                  value={approxDate || todayAtMidnight()}
                  mode="date"
                  display="default"
                  minimumDate={todayAtMidnight()}
                  onChange={(event, selectedDate) => {
                    setShowDatePicker(false);
                    if (event.type === "set" && selectedDate) setApproxDate(selectedDate);
                  }}
                />
              )}
            </>
          )}
        </View>

        {/* Assign Engineers */}
        <View style={styles.block}>
          <TText style={styles.label}>Assign Engineers</TText>

          <View style={[styles.field, styles.chipField]}>
            <View style={styles.chipRow}>
              {assignedEmployees.length > 0 ? (
                assignedEmployees.map((emp, idx) => (
                  <View key={`${emp.key}-${idx}`} style={styles.chip}>
                    <TText style={styles.chipText}>{emp.label.split("(")[0].trim()}</TText>
                    <TouchableOpacity onPress={() => setAssignedEmployees((prev) => prev.filter((_, i) => i !== idx))}>
                      <Ionicons name="close" size={14} color={C.primaryStrong} />
                    </TouchableOpacity>
                  </View>
                ))
              ) : (
                <TText style={styles.placeholderInline}>Add Engineers</TText>
              )}
            </View>

            <View style={styles.addEngineerRight}>
              <ModalSelector
                data={availableAssignedEmployees}
                initValue="Add Engineers"
                onChange={(option: any) => {
                  if (!assignedEmployees.find((emp) => emp.key === option.key)) {
                    setAssignedEmployees([...assignedEmployees, option]);
                  } else {
                    Alert.alert("Already added");
                  }
                }}
                style={styles.modalSelectorWrap}
                selectStyle={styles.modalSelectStyleRight}
                initValueTextStyle={styles.addEngineerText}
                optionTextStyle={styles.optionText}
                {...modalSelectorSheetProps}
                cancelText="Cancel"
              />
            </View>
          </View>
        </View>

        {/* Attachments */}
        <View style={styles.block}>
          <TText style={styles.label}>Attachments</TText>

          <TouchableOpacity style={styles.attachPickBtn} onPress={handleFilePick}>
            <Ionicons name="attach" size={16} color={C.primaryStrong} />
            <TText style={styles.attachPickText}>Select Files</TText>
          </TouchableOpacity>

          {selectedFiles.length > 0 ? (
            <View style={styles.attachmentList}>
              {selectedFiles.map((file: any, idx) => (
                <View key={`${file.name}-${idx}`} style={styles.attachmentRow}>
                  <View style={styles.attachmentLeft}>
                    <Ionicons name="document-text-outline" size={18} color={C.success} />
                    <TText style={styles.attachmentName} numberOfLines={1}>
                      {file.name}
                    </TText>
                  </View>

                  <TouchableOpacity onPress={() => removeFileAtIndex(idx)} style={styles.trashBtn}>
                    <Ionicons name="trash-outline" size={18} color={C.danger} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {/* Description */}
        <View style={styles.block}>
          <TText style={styles.label}>Description</TText>
          <View style={[styles.field, { minHeight: 48 }]}>
            <TextInput
              style={styles.valueInput}
              value={description}
              onChangeText={setDescription}
              placeholder="Enter description"
              placeholderTextColor={C.subtleText}
            />
          </View>
        </View>

        {/* Reported By */}
        <View style={styles.block}>
          <TText style={styles.label}>Reported By</TText>
          <View style={styles.field}>
            <TextInput style={styles.valueInput} value={reporterFullName} editable={false} />
          </View>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          <TText style={styles.submitButtonText}>
            {isSubmitting ? "Submitting..." : online ? "Raise Issue" : "Raise Issue (Queued)"}
          </TText>
        </TouchableOpacity>

        {/* Dialog */}
        <Modal transparent visible={dialogVisible} animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.dialogBox}>
              <TText style={styles.dialogMessage}>{dialogMessage}</TText>
              <TouchableOpacity
                style={styles.dialogButton}
                onPress={() => {
                  setDialogVisible(false);
                  if (isSuccess) router.push("/HomeScreen");
                }}
              >
                <TText style={styles.dialogButtonText}>OK</TText>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </View>
  );
};

// ------------ Styles (UI to match screenshot) ------------
const createStyles = (C: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 16 },

  // Header
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: C.headerBg,
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },

  headerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: C.text,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
   
  },

  block: { marginTop: 14 },

  label: {
    fontSize: 11,
    color: C.mutedText,
    marginBottom: 8,
    fontWeight: "600",
  },

  field: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },

  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  row: { marginTop: 14, flexDirection: "row", gap: 12 },
  col: { flex: 1 },

  valueInput: {
    padding: 0,
    fontSize: 14,
    color: C.text,
  },

  modalSelectorWrap: { width: "100%" },
  modalSelectStyle: { borderWidth: 0, padding: 0, backgroundColor: "transparent" },
  modalSelectStyleRight: { borderWidth: 0, padding: 0, backgroundColor: "transparent" },
  valueText: { fontSize: 11, color: C.text, fontWeight: "600" },
  optionText: { fontSize: 11, color: C.text },

  // Date web input
  webDateInput: {
    width: "100%",
    outline: "none",
    borderColor: C.surface,
    fontSize: 11,
    color: C.text,
    backgroundColor: "transparent",
  },

  // Engineer chips
  chipField: {
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chipRow: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    paddingRight: 10,
  },
  placeholderInline: { color: C.subtleText, fontSize: 14, fontWeight: "600" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.primarySoft,
    borderColor: C.border,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  chipText: { fontSize: 11, color: C.primaryStrong, fontWeight: "700" },
  addEngineerRight: { marginLeft: 8 },
  addEngineerText: { fontSize: 11, color: C.mutedText, fontWeight: "700" },

  // Attachments
  attachPickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.primarySoft,
  },
  attachPickText: { color: C.primaryStrong, fontWeight: "800", fontSize: 13 },

  attachmentList: { marginTop: 10 },
  attachmentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  attachmentLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  attachmentName: { flex: 1, fontSize: 14, color: C.text, fontWeight: "700" },
  trashBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.dangerSoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
  },

  // Submit
  submitButton: {
    marginTop: 18,
    marginBottom: 26,
    backgroundColor: C.primaryStrong,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitButtonText: { color: C.white, fontWeight: "900", fontSize: 15 },

  // Dialog
  modalOverlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.overlayStrong || C.overlay },
  dialogBox: { width: "82%", padding: 18, backgroundColor: C.surface, borderRadius: 14, alignItems: "center" },
  dialogMessage: { fontSize: 16, marginBottom: 16, textAlign: "center", color: C.text, fontWeight: "700" },
  dialogButton: { marginTop: 4, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 10, backgroundColor: C.primaryStrong },
  dialogButtonText: { color: C.white, fontWeight: "800" },

  // iOS date modal
  modalContainer: { flex: 1, justifyContent: "flex-end", backgroundColor: C.overlayStrong || C.overlay },
  modalContent: { backgroundColor: C.surface, padding: 16, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  doneBtn: {
    marginTop: 10,
    alignSelf: "flex-end",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: C.primaryStrong,
    borderRadius: 8,
  },
  doneBtnText: { color: C.white, fontWeight: "800" },
});

export default PropertyRaiseIssue;
