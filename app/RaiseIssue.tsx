import React, { useState, useEffect } from "react";
import { 
  View, TouchableOpacity, StyleSheet, ScrollView, TextInput, Modal, Alert, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import ModalSelector from "@/components/AppModalSelect";
import axios from "axios";
import * as DocumentPicker from "expo-document-picker";
import * as mime from "react-native-mime-types";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFontScale } from "@/context/FontScaleContext";
import TText from "@/components/TText";

import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
interface ProjectOption {
  key: string;
  label: string;
}

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

const RaiseIssue = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
  console.log("params in raise isiue", params);

  const firstName = Array.isArray(params.first_name) ? params.first_name[0] : params.first_name ?? "";
  const lastName = Array.isArray(params.last_name) ? params.last_name[0] : params.last_name ?? "";
  const reporterFullName = `${firstName} ${lastName}`.trim() || "Unknown Engineer";
  const reporterEmail = Array.isArray(params.email) ? params.email[0] : params.email ?? "engineer@datso.io";
  const employeeCode = Array.isArray(params.employee_code)
    ? params.employee_code[0]
    : params.employee_code ?? "UNKNOWN_CODE";

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
  const [approxDate, setApproxDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogMessage, setDialogMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [allEmployees, setAllEmployees] = useState<{ label: string; key: string }[]>([]);
  const [assignedEmployees, setAssignedEmployees] = useState<{ label: string; key: string }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phaseOptions, setPhaseOptions] = useState<{ key: string; label: string }[]>([]);
  const [phaseName, setPhaseName] = useState("");

  const [scheduleId, setScheduleId] = useState<number | null>(null);
  const [selectedPhaseLabel, setSelectedPhaseLabel] = useState("");
  const [issueTypeOptions, setIssueTypeOptions] = useState([{ key: "Loading...", label: "Loading..." }]);
  const [availableAssignedEmployees, setAvailableAssignedEmployees] = useState<{ key: string; label: string }[]>([]);

  const fetchAssignedEmployees = async (propertyId: string) => {
    try {
      const response = await axios.get(`${APP_API_BASE_URL}/assigned-employees/${propertyId}`);
      const data = Array.isArray(response.data.employees) ? response.data.employees : [];
      const formatted = data.map((emp: any) => ({
        key: emp.employee_code,
        label: `${emp.full_name} (${emp.employee_code})`,
      }));
      setAvailableAssignedEmployees(formatted);
    } catch (error) {
      console.error(":x: Error fetching assigned engineers:", error);
      setAvailableAssignedEmployees([]);
    }
  };

  useEffect(() => {
    fetchProjects();
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      const response = await axios.get(`${APP_API_BASE_URL}/employees`);
      const employees = Array.isArray(response.data) ? response.data : response.data.employees;

      if (Array.isArray(employees)) {
        const formatted = employees.map((emp: any) => ({
          key: emp.employee_code,
          label: `${emp.first_name} ${emp.last_name} (${emp.employee_code})`,
        }));
        console.log("✅ Employees:", formatted);
        setAllEmployees(formatted);
      } else {
        console.warn("⚠️ Unexpected employee response:", response.data);
      }
    } catch (error) {
      console.error("❌ Failed to fetch employees:", error);
      Alert.alert("Failed to fetch employees");
    }
  };

  const fetchProjects = async () => {
    try {
      const response = await axios.get(`${APP_API_BASE_URL}/projects_m`);
      if (Array.isArray(response.data.projects)) {
        setProjectOptions(
          response.data.projects.map((proj: any) => ({
            key: proj.project_id.toString(),
            label: proj.project_name,
          }))
        );
      }
    } catch (error) {
      Alert.alert("Error fetching projects");
    }
  };

  const fetchProperties = async (selectedProjectId: string) => {
    try {
      const response = await axios.get(`${APP_API_BASE_URL}/projects_m/${selectedProjectId}/properties`);
      if (Array.isArray(response.data.properties)) {
        setPropertyOptions(
          response.data.properties.map((prop: any) => ({
            key: prop.propertyid,
            label: prop.name,
          }))
        );
      } else {
        setPropertyOptions([]);
      }
    } catch (error) {
      Alert.alert("Error fetching properties");
    }
  };

  const fetchSchedulePhases = async (propertyId: string) => {
    try {
      const response = await axios.get(`${APP_API_BASE_URL}/properties/${propertyId}/schedule`);
      const data = response.data.schedule;
      if (Array.isArray(data)) {
        const formattedPhases = data
          .filter((item) => item.phasename)
          .map((item) => ({
            key: item.scheduleid,
            label: item.phasename,
          }));
        console.log("🎯 Phase options:", formattedPhases);
        setPhaseOptions(formattedPhases);
      } else {
        console.warn("⚠️ Unexpected schedule response format:", response.data);
      }
    } catch (error) {
      console.error("❌ Error fetching schedule phases:", error);
      Alert.alert("Error fetching phase names");
    }
  };

  useEffect(() => {
    fetchIssueTypes();
  }, []);

  const fetchIssueTypes = async () => {
    try {
      const response = await axios.get(`${APP_API_BASE_URL}/issue-types`);
      const data = Array.isArray(response.data) ? response.data : response.data?.data || [];
      const formatted = data.map((item: any) => ({
        key: item.key,
        label: item.label,
      }));
      console.log(":jigsaw: Final Dropdown Options:", formatted);
      setIssueTypeOptions(formatted);
    } catch (error) {
      console.error(":x: Failed to fetch issue types:", error);
    }
  };

  const handleProjectSelect = (option: ProjectOption) => {
    setProject(option.label);
    setProjectId(option.key);
    setProperty("Select Property");
    setPropertyId(null);
    setPropertyOptions([]);
    fetchProperties(option.key);
  };

  const formatToLocalDateString = (date: Date): string => {
    const local = new Date(date);
    local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
    return local.toISOString().split("T")[0];
  };

  const formatDateDDMMYYYY = (date: Date): string => {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };

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
    } catch (err) {
      Alert.alert("File selection failed");
    }
  };

  const removeFileAtIndex = (idx: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!projectId) return showDialog("Please select a project.");
    if (!propertyId) return showDialog("Please select a property.");
    if (!issueType) return showDialog("Please select issue type.");
    if (!severity) return showDialog("Please select severity.");
    if (!priority) return showDialog("Please select priority.");
    if (!description.trim()) return showDialog("Please enter description.");
    if (assignedEmployees.length === 0) return showDialog("Please assign at least one engineer.");
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("project_id", projectId);
      formData.append("property_id", propertyId);
      formData.append("issue_type", issueType);
      formData.append("severity", severity);
      formData.append("priority", priority);
      formData.append("description", description);
      formData.append("ticket_title", description);
      formData.append("reported_by_email", reporterFullName);
      formData.append("reported_by_employee_code", employeeCode);
      formData.append("approximate_date", approxDate ? formatToLocalDateString(approxDate) : "");
      formData.append("schedule_id", String(scheduleId));

      assignedEmployees.forEach((emp) => formData.append("assigned_to_employee_code", emp.key));

      selectedFiles.forEach((file: any) => {
        const mimeType = file.type || file.mimeType || mime.lookup(file.name) || "application/octet-stream";
        if (Platform.OS === "web") {
          formData.append("files", file);
        } else {
          formData.append("files", { uri: file.uri, name: file.name, type: mimeType } as any);
        }
      });

      const response = await fetch(`${APP_API_BASE_URL}/tickets/create`, {
        method: "POST",
        body: formData,
        headers: { Accept: "application/json" },
      });

      if (response.ok) {
        setIsSuccess(true);
        showDialog("Issue raised successfully!");
        resetForm();
        setTimeout(() => router.push("/HomeScreen"), 2000);
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

  const showDialog = (msg: string) => {
    setDialogMessage(msg);
    setDialogVisible(true);
  };

  const resetForm = () => {
    setProject("Select Project");
    setProjectId(null);
    setProperty("Select Property");
    setPropertyId(null);
    setIssueType("");
    setSeverity("");
    setPriority("");
    setDescription("");
    setPropertyOptions([]);
    setSelectedFiles([]);
    setAssignedEmployees([]);
    setApproxDate(null);
    setScheduleId(null);
    setSelectedPhaseLabel("");
  };

  return (
    <View testID="raise-issue-root" style={{ flex: 1 }}>
      {/* Header */}
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerIconBtn}>
          <Ionicons name="arrow-back" size={20} color="#111827" />
        </TouchableOpacity>

        <TText style={styles.headerTitle}>Raise Issue</TText>

        <TouchableOpacity onPress={() => router.push("/HomeScreen")} style={styles.headerIconBtn}>
          <Ionicons name="home" size={20} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 30 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Project */}
        <View style={styles.block}>
          <TText style={styles.label}>Project ID</TText>
          <View style={styles.field}>
            <ModalSelector
              data={projectOptions}
              initValue={project}
              onChange={handleProjectSelect}
              style={styles.modalSelectorWrap}
              selectStyle={styles.modalSelectStyle}
              initValueTextStyle={styles.valueText}
              optionTextStyle={styles.optionText}
              cancelText="Cancel"
            />
          </View>
        </View>

        {/* Property */}
        <View style={styles.block}>
          <TText style={styles.label}>Property ID</TText>
          <View style={styles.field}>
            <ModalSelector
              data={propertyOptions}
              initValue={property}
              onChange={(option: any) => {
                setProperty(option.label);
                setPropertyId(option.key);
                fetchSchedulePhases(option.key);
                fetchAssignedEmployees(option.key);
              }}
              style={styles.modalSelectorWrap}
              selectStyle={styles.modalSelectStyle}
              initValueTextStyle={styles.valueText}
              optionTextStyle={styles.optionText}
              cancelText="Cancel"
            />
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
                style={styles.modalSelectorWrap}
                selectStyle={styles.modalSelectStyle}
                initValueTextStyle={styles.valueText}
                optionTextStyle={styles.optionText}
                cancelText="Cancel"
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
                style={styles.webDateInput as any}
                min={toLocalDateValue(todayAtMidnight())}
                value={approxDate ? toLocalDateValue(approxDate) : ""}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  if (!nextValue) {
                    setApproxDate(todayAtMidnight());
                    return;
                  }
                  setApproxDate(fromLocalDateValue(nextValue));
                }}
              />
              <Ionicons name="calendar-outline" size={18} color="#6B7280" />
            </View>
          ) : (
            <>
              <TouchableOpacity onPress={() => setShowDatePicker(true)} style={[styles.field, styles.fieldRow]}>
                <TText style={[styles.valueText, !approxDate && { color: "#9CA3AF" }]}>
                  {approxDate ? formatDateDDMMYYYY(approxDate) : "Select date"}
                </TText>
                <Ionicons name="calendar-outline" size={18} color="#6B7280" />
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
                assignedEmployees.map((emp, index) => (
                  <View key={`${emp.key}-${index}`} style={styles.chip}>
                    <TText style={styles.chipText}>
                      {emp.label.split("(")[0].trim()}
                    </TText>
                    <TouchableOpacity onPress={() => setAssignedEmployees((prev) => prev.filter((_, i) => i !== index))}>
                      <Ionicons name="close" size={14} color="#2563EB" />
                    </TouchableOpacity>
                  </View>
                ))
              ) : (
                <TText style={styles.placeholderInline}>Add Engineers</TText>
              )}
            </View>

            {/* invisible-ish selector trigger, styled to look like “Add Engineers” */}
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
                cancelText="Cancel"
              />
            </View>
          </View>
        </View>

        {/* Attachments */}
        <View style={styles.block}>
          <TText style={styles.label}>Attachments</TText>

          <TouchableOpacity style={styles.attachPickBtn} onPress={handleFilePick}>
            <Ionicons name="attach" size={16} color="#2563EB" />
            <TText style={styles.attachPickText}>Select Files</TText>
          </TouchableOpacity>

          {selectedFiles.length > 0 ? (
            <View style={styles.attachmentList}>
              {selectedFiles.map((file: any, idx) => (
                <View key={`${file.name}-${idx}`} style={styles.attachmentRow}>
                  <View style={styles.attachmentLeft}>
                    <Ionicons name="document-text-outline" size={18} color="#16A34A" />
                    <TText style={styles.attachmentName} numberOfLines={1}>
                      {file.name}
                    </TText>
                  </View>

                  <TouchableOpacity onPress={() => removeFileAtIndex(idx)} style={styles.trashBtn}>
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
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
              style={styles.textInput}
              value={description}
              onChangeText={setDescription}
              placeholder="Enter description"
              placeholderTextColor="#9CA3AF"
            />
          </View>
        </View>

        {/* Reported By */}
        <View style={styles.block}>
          <TText style={styles.label}>Reported By</TText>
          <View style={styles.field}>
            <TextInput style={styles.textInput} value={reporterFullName} editable={false} />
          </View>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          <TText style={styles.submitButtonText}>{isSubmitting ? "Submitting..." : "Raise Issue"}</TText>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF", paddingHorizontal: 16 },

  headerContainer: {
    height: 56,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#111827" },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
  },

  block: { marginTop: 14 },

  label: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 8,
    fontWeight: "600",
  },

  field: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
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

  row: {
    marginTop: 14,
    flexDirection: "row",
    gap: 12,
  },
  col: { flex: 1 },

  modalSelectorWrap: { width: "100%" },
  modalSelectStyle: {
    borderWidth: 0,
    padding: 0,
    backgroundColor: "transparent",
  },
  modalSelectStyleRight: {
    borderWidth: 0,
    padding: 0,
    backgroundColor: "transparent",
    alignSelf: "flex-end",
  },

  valueText: { fontSize: 14, color: "#111827"},
  optionText: { fontSize: 14, color: "#111827" },

  textInput: {
    padding: 0,
    fontSize: 14,
    color: "#111827",
  },

  // Date web input
  webDateInput: {
    width: "100%",
    outline: "none",
    borderColor:"#ffff",
    fontSize: 14,
    color: "#111827",
    backgroundColor: "transparent",
  },

  // Engineer chip input
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
  placeholderInline: { color: "#9CA3AF", fontSize: 14, fontWeight: "600" },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  chipText: { fontSize: 13, color: "#2563EB", fontWeight: "700" },

  addEngineerRight: { marginLeft: 8 },
  addEngineerText: { fontSize: 14, color: "#6B7280", fontWeight: "700" },

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
    borderColor: "#DBEAFE",
    backgroundColor: "#EFF6FF",
  },
  attachPickText: { color: "#2563EB", fontWeight: "800", fontSize: 13 },

  attachmentList: { marginTop: 10 },
  attachmentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  attachmentLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  attachmentName: { flex: 1, fontSize: 14, color: "#111827", fontWeight: "700" },
  trashBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FECACA",
  },

  submitButton: {
    marginTop: 18,
    marginBottom: 26,
    backgroundColor: "#3B82F6",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitButtonText: { color: "#FFFFFF", fontWeight: "900", fontSize: 15 },

  // Dialog
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  dialogBox: {
    width: "82%",
    padding: 18,
    backgroundColor: "#FFF",
    borderRadius: 14,
    alignItems: "center",
  },
  dialogMessage: {
    fontSize: 16,
    marginBottom: 16,
    textAlign: "center",
    color: "#111827",
    fontWeight: "700",
  },
  dialogButton: {
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: "#2563EB",
  },
  dialogButtonText: { color: "#FFF", fontWeight: "800" },

  // iOS date modal
  modalContainer: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  modalContent: { backgroundColor: "#FFF", padding: 16, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  doneBtn: {
    marginTop: 10,
    alignSelf: "flex-end",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#2563EB",
    borderRadius: 8,
  },
  doneBtnText: { color: "#FFF", fontWeight: "800" },
});

export default RaiseIssue;
