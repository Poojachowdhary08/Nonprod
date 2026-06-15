import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
// app/MasterItemDetails.tsx
import React, { useState, useEffect, useRef } from "react";
import { View, StyleSheet, TouchableOpacity, TextInput, Modal, Platform, KeyboardAvoidingView, ScrollView } from "react-native";
import axios from "axios";
import ModalSelector from "@/components/AppModalSelect";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";

// ✅ Telemetry (adjust path)
import {
  trackScreen,
  startScreenTimer,
  trackUI,
  trackNetwork,
  updateDynamicContext,
  clearDynamicContext,
  flushTelemetry,
} from "../utils/telemetry";
import { getDecimalInputProps } from "../utils/keyboardProps";
import { resolveEmployeeIdentity } from "../utils/employeeIdentity";
import { useFontScale } from "@/context/FontScaleContext";
import TText from "@/components/TText";

interface InventoryItem {
  item_id?: string;
  item_name: string;
  item_type: string;
  id: number;
  quantity: number;
  minimum_quantity: number;
}

interface ProjectOption {
  key: string;
  label: string;
}

type RequestType = "general" | "avenue_add_on" | "customer_add_on";
const isRequestType = (v: any): v is RequestType =>
  v === "general" || v === "avenue_add_on" || v === "customer_add_on";

// ✅ ModalSelector "data" shape (what the library actually uses)
type SelectorOption = { key: string; label: string };

const TYPE_OPTIONS: SelectorOption[] = [
  { key: "general", label: "GENERAL" },
  { key: "avenue_add_on", label: "AVENUE ADD ON" },
  { key: "customer_add_on", label: "CUSTOMER ADD ON" },
];
const INVENTORY_REQUEST_SOURCE = "MasterItemDetails";

const MasterItemDetails: React.FC = () => {
  const router = useRouter();
  const params = useLocalSearchParams();

  // ---- Safe param reads (expo-router can give string | string[]) ----
  const p = <T,>(key: keyof typeof params): T | undefined => {
    const v: any = (params as any)?.[key];
    return (Array.isArray(v) ? v[0] : v) as T | undefined;
  };

  const item_name = p<string>("item_name") ?? "";
  const item_type = p<string>("item_type") ?? "";
  const item_id = p<string>("item_id") ?? null;

  const qtyRaw = p<string>("quantity") ?? "0";
  const qtyNum = Number(qtyRaw ?? 0);

  // ✅ employee_details decoding (because you encodedURIComponent earlier)
  const employeeDetails = (() => {
    const raw = p<string>("employee_details");
    if (!raw) return {};
    try {
      return JSON.parse(decodeURIComponent(String(raw)));
    } catch {
      try {
        return JSON.parse(String(raw));
      } catch {
        return {};
      }
    }
  })();

  const employeeCode = (employeeDetails as any)?.employee_code ?? null;

  // ----------------- State -----------------
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<"request" | "raise">("request");
  const [quantity, setQuantity] = useState("");
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [propertyOptions, setPropertyOptions] = useState<ProjectOption[]>([]);

  const [project, setProject] = useState("Select Project");
  const [projectId, setProjectId] = useState<string | null>(null);

  const [property, setProperty] = useState("Select Property");

  const [isDialogVisible, setIsDialogVisible] = useState(false);
  const [dialogMessage, setDialogMessage] = useState("");

  const [startDate, setStartDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);

  const [remarks, setRemarks] = useState("");
  const [type, setType] = useState<RequestType>("general");

  // ✅ throttle typing telemetry
  const lastRemarksLogRef = useRef<{ at: number; len: number }>({ at: 0, len: 0 });
  const lastQtyLogRef = useRef<{ at: number; len: number }>({ at: 0, len: 0 });

  // ----------------- Screen telemetry -----------------
  useEffect(() => {
    updateDynamicContext({
      screen: "MasterItemDetails",
      employeeCode: employeeCode ?? null,
      itemId: item_id ?? null,
    });

    trackScreen("MasterItemDetails", {
      employeeCode: employeeCode ?? null,
      itemId: item_id ?? null,
      item_name: item_name ?? null,
      item_type: item_type ?? null,
    });

    const stop = startScreenTimer("MasterItemDetails", {
      employeeCode: employeeCode ?? null,
      itemId: item_id ?? null,
    });

    return () => {
      stop?.();
      clearDynamicContext();
      flushTelemetry({ reason: "screen_unmount" }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----------------- Data fetch -----------------
  useEffect(() => {
    fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchProjects = async () => {
    const url = `${APP_API_BASE_URL}/projects_m`;
    const startedAt = Date.now();

    trackUI({
      screen: "MasterItemDetails",
      element: "projects_fetch",
      action: "start",
      extra: { itemId: item_id ?? null },
    });

    try {
      const response = await axios.get(url);
      const durationMs = Date.now() - startedAt;

      trackNetwork({
        url,
        method: "GET",
        status: response?.status,
        durationMs,
        ok: true,
        extra: { screen: "MasterItemDetails" },
      });

      const projects = Array.isArray(response?.data?.projects) ? response.data.projects : [];
      const opts: ProjectOption[] = projects.map(
        (proj: { project_id: number; project_name: string }) => ({
          key: String(proj.project_id),
          label: proj.project_name,
        })
      );

      setProjectOptions(opts);

      trackUI({
        screen: "MasterItemDetails",
        element: "projects_fetch",
        action: "success",
        extra: { count: opts.length, duration_ms: durationMs },
      });
    } catch (e: any) {
      trackUI({
        screen: "MasterItemDetails",
        element: "projects_fetch",
        action: "error",
        extra: { message: e?.message ?? "unknown_error" },
      });
      setProjectOptions([]);
    }
  };

  const fetchProperties = async (selectedProjectId: string) => {
    const url = `${APP_API_BASE_URL}/projects_m/${selectedProjectId}/properties`;
    const startedAt = Date.now();

    trackUI({
      screen: "MasterItemDetails",
      element: "properties_fetch",
      action: "start",
      extra: { project_id: selectedProjectId },
    });

    try {
      const response = await axios.get(url);
      const durationMs = Date.now() - startedAt;

      trackNetwork({
        url,
        method: "GET",
        status: response?.status,
        durationMs,
        ok: true,
        extra: { screen: "MasterItemDetails", project_id: selectedProjectId },
      });

      const props = Array.isArray(response?.data?.properties) ? response.data.properties : [];
      const opts: ProjectOption[] = props.map((prop: any, index: number) => ({
        key: String(index + 1),
        label: String(prop?.name ?? "").trim(),
      }));

      setPropertyOptions(opts);

      trackUI({
        screen: "MasterItemDetails",
        element: "properties_fetch",
        action: "success",
        extra: { project_id: selectedProjectId, count: opts.length, duration_ms: durationMs },
      });
    } catch (e: any) {
      trackUI({
        screen: "MasterItemDetails",
        element: "properties_fetch",
        action: "error",
        extra: { project_id: selectedProjectId, message: e?.message ?? "unknown_error" },
      });
      setPropertyOptions([]);
    }
  };

  // ----------------- UI handlers -----------------
  const handleProjectSelect = (option: ProjectOption) => {
    trackUI({
      screen: "MasterItemDetails",
      element: "project_select",
      action: "change",
      extra: { project_id: option.key, project_name: option.label },
    });

    setProject(option.label);
    setProjectId(option.key);

    setProperty("Select Property");
    setPropertyOptions([]);
    fetchProperties(option.key);
  };

  const closeDialog = () => {
    trackUI({
      screen: "MasterItemDetails",
      element: "status_dialog",
      action: "close",
      extra: {},
    });

    setIsDialogVisible(false);
    router.back();
  };

  const handleOpenModal = (item: InventoryItem, mType: "request" | "raise") => {
    trackUI({
      screen: "MasterItemDetails",
      element: "request_modal",
      action: "open",
      extra: {
        modal_type: mType,
        itemId: item?.item_id ?? null,
        item_name: item?.item_name ?? null,
        item_type: item?.item_type ?? null,
        current_qty: item?.quantity ?? null,
        min_qty: item?.minimum_quantity ?? null,
      },
    });

    setSelectedItem(item);
    setQuantity("");

    setProject("Select Project");
    setProjectId(null);
    setProperty("Select Property");
    setPropertyOptions([]);

    setModalType(mType);
    setModalVisible(true);
    setStartDate(new Date());
    setRemarks("");
    setType("general");
  };

  // ----------------- Actions -----------------
  const handleRequestInventory = async () => {
    const quantityNumber = Number(quantity);

    if (!quantity || isNaN(quantityNumber) || quantityNumber <= 0) {
      trackUI({
        screen: "MasterItemDetails",
        element: "request_inventory",
        action: "validate_fail",
        extra: { reason: "invalid_quantity", quantity },
      });
      setDialogMessage("Invalid Quantity. Please enter a valid number.");
      setIsDialogVisible(true);
      return;
    }

    if (!projectId || !property || property === "Select Property") {
      trackUI({
        screen: "MasterItemDetails",
        element: "request_inventory",
        action: "validate_fail",
        extra: { reason: "missing_project_or_property", projectId, property },
      });
      setDialogMessage("Missing Fields. Please select a project and property.");
      setIsDialogVisible(true);
      return;
    }

    if (!selectedItem) {
      trackUI({
        screen: "MasterItemDetails",
        element: "request_inventory",
        action: "validate_fail",
        extra: { reason: "no_item_selected" },
      });
      setDialogMessage("No item selected.");
      setIsDialogVisible(true);
      return;
    }

    const identity = await resolveEmployeeIdentity(params as Record<string, unknown>);
    const effectiveEmployeeCode = identity.employee_code || String(employeeCode || "").trim();
    if (!effectiveEmployeeCode) {
      trackUI({
        screen: "MasterItemDetails",
        element: "request_inventory",
        action: "validate_fail",
        extra: { reason: "missing_employee_code" },
      });
      setDialogMessage("Unable to identify employee code for this request. Please log in again and retry.");
      setIsDialogVisible(true);
      return;
    }

    const requestData = {
      item_name: selectedItem.item_name,
      requested_quantity: parseFloat(quantity),
      project_id: projectId || null,
      project_name: project || null,
      property_id: propertyOptions.find((option) => option.label === property)?.key || null,
      property_name: property || null,
      employee_code: effectiveEmployeeCode,
      deli_date: startDate.toISOString().split("T")[0],
      initial_remark: remarks || null,
      item_type: type,
    };

    const url = `${APP_API_BASE_URL}/request-inventory`;
    const startedAt = Date.now();

    trackUI({
      screen: "MasterItemDetails",
      element: "request_inventory",
      action: "submit",
      extra: {
        modal_type: modalType ?? null,
        item_name: requestData.item_name,
        qty: requestData.requested_quantity,
        project_name: requestData.project_name,
        property_name: requestData.property_name,
        deli_date: requestData.deli_date,
        item_type: requestData.item_type,
      },
    });

    try {
      const response = await axios.post(url, requestData, {
        headers: {
          "Content-Type": "application/json",
          "x-client-sync-mode": "online_live",
          "x-client-request-source": INVENTORY_REQUEST_SOURCE,
        },
      });
      const durationMs = Date.now() - startedAt;

      trackNetwork({
        url,
        method: "POST",
        status: response?.status,
        durationMs,
        ok: true,
        extra: { screen: "MasterItemDetails", item_name: requestData.item_name },
      });

      if (response?.data?.success) {
        trackUI({
          screen: "MasterItemDetails",
          element: "request_inventory",
          action: "success",
          extra: { duration_ms: durationMs },
        });

        setDialogMessage(
          `✅ Requested ${quantity} units of "${selectedItem.item_name}" for ${project} - ${property} on ${requestData.deli_date}.`
        );
      } else {
        trackUI({
          screen: "MasterItemDetails",
          element: "request_inventory",
          action: "fail",
          extra: { reason: "success_false", duration_ms: durationMs },
        });

        setDialogMessage("❌ Failed to request inventory. Please try again.");
      }
    } catch (error: any) {
      const durationMs = Date.now() - startedAt;
      const status = error?.response?.status;
      const detail = error?.response?.data?.detail;

      trackNetwork({
        url,
        method: "POST",
        status,
        durationMs,
        ok: false,
        extra: {
          screen: "MasterItemDetails",
          message: error?.message ?? "unknown_error",
          backend_detail: typeof detail === "string" ? detail : null,
        },
      });

      trackUI({
        screen: "MasterItemDetails",
        element: "request_inventory",
        action: "error",
        extra: { duration_ms: durationMs, status: status ?? null },
      });

      setDialogMessage("❌ An error occurred while processing the request.");
    }

    setModalVisible(false);
    setIsDialogVisible(true);
  };

  // ---- Build a selected item from params (so modal always has correct values) ----
  const selectedFromParams: InventoryItem = {
    item_id: item_id ?? undefined,
    item_name,
    item_type,
    id: Number(p<string>("id") ?? 0),
    quantity: qtyNum,
    minimum_quantity: Number(p<string>("minimum_quantity") ?? 0),
  };

  return (
    <View style={styles.container} testID="master-item-details-root">
      {/* Header */}
      <View style={styles.headerContainer}>
        <View style={styles.headerTitleContainer}>
          <TouchableOpacity
            onPress={() => {
              trackUI({ screen: "MasterItemDetails", element: "header_back", action: "click", extra: {} });
              if (router.canGoBack()) router.back();
              else router.push("/HomeScreen");
            }}
          >
            <Ionicons name="arrow-back" size={24} color="#5a5a5c" />
          </TouchableOpacity>

          <TText style={styles.headerTitle}>Master Item Details</TText>
        </View>

        <TouchableOpacity
          onPress={() => {
            trackUI({ screen: "MasterItemDetails", element: "header_home", action: "click", extra: {} });
            router.push("/HomeScreen");
          }}
        >
          <Ionicons name="home" size={24} color="#5a5a5c" />
        </TouchableOpacity>
      </View>

      {/* Card */}
      <View style={styles.card}>
        <TText style={styles.title}>{item_name}</TText>

        <View style={[styles.infoRow, styles.alternateBackground]}>
          <TText style={styles.infoLabel}>Item Type:</TText>
          <TText style={styles.infoValue}>{item_type}</TText>
        </View>

        <View style={styles.infoRow}>
          <TText style={styles.infoLabel}>Quantity:</TText>
          <TText style={styles.infoValue}>{String(qtyRaw ?? 0)}</TText>
        </View>
      </View>

      {/* Request button */}
      <TouchableOpacity
        style={qtyNum <= 0 ? styles.raiseButton : styles.requestButton}
        onPress={() => {
          trackUI({
            screen: "MasterItemDetails",
            element: "request_button",
            action: "click",
            extra: { qty: qtyNum, modal_type: qtyNum <= 0 ? "raise" : "request" },
          });
          handleOpenModal(selectedFromParams, qtyNum <= 0 ? "raise" : "request");
        }}
      >
        <TText style={styles.buttonText}>Request Inventory</TText>
      </TouchableOpacity>

      {/* Modal */}
      <Modal transparent animationType="slide" visible={modalVisible}>
        <View style={styles.modalBackground}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
            <View style={styles.modalContainer}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <TText style={styles.modalTitle}>
                  {modalType === "request" ? "Request Inventory" : "Raise Inventory"}
                </TText>

                {/* Item name */}
                <View style={styles.formGroup}>
                  <View style={styles.inputContainer}>
                    <TText style={[styles.floatingLabel, selectedItem?.item_name ? styles.floatingActive : styles.floatingInactive]}>
                      Item Name
                    </TText>
                    <TextInput style={[styles.input, styles.disabledInput]} value={selectedItem?.item_name ?? ""} editable={false} />
                  </View>
                </View>

                {/* Quantity */}
                <View style={styles.formGroup}>
                  <View style={styles.inputContainer}>
                    <TText style={[styles.floatingLabel, quantity ? styles.floatingActive : styles.floatingInactive]}>Quantity</TText>
                    <TextInput
                      style={styles.input}
                      {...getDecimalInputProps()}
                      placeholder=""
                      value={quantity}
                      onChangeText={(text) => {
                        const formatted = text.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
                        setQuantity(formatted);

                        const now = Date.now();
                        if (now - lastQtyLogRef.current.at > 1200 && lastQtyLogRef.current.len !== formatted.length) {
                          lastQtyLogRef.current = { at: now, len: formatted.length };
                          trackUI({ screen: "MasterItemDetails", element: "quantity_input", action: "change", extra: { len: formatted.length } });
                        }
                      }}
                      onBlur={() => trackUI({ screen: "MasterItemDetails", element: "quantity_input", action: "blur", extra: { value: quantity } })}
                    />
                  </View>
                </View>

                {/* Type (✅ typings fixed) */}
                <View style={styles.formGroup}>
                  <View style={styles.inputContainer}>
                    <TText style={[styles.floatingLabel, type ? styles.floatingActive : styles.floatingInactive]}>Type</TText>

                    {/* NOTE: we intentionally avoid generics here because library typings are wrong */}
                    <ModalSelector
                      data={TYPE_OPTIONS}
                      initValue={type}
                      onChange={(option: any) => {
                        const next = option?.key;

                        trackUI({
                          screen: "MasterItemDetails",
                          element: "type_select",
                          action: "change",
                          extra: { from: type, to: String(next) },
                        });

                        if (isRequestType(next)) setType(next);
                        else setType("general");
                      }}
                      style={styles.pickerContainer}
                      selectStyle={styles.picker}
                      initValueTextStyle={styles.pickerText}
                      optionTextStyle={styles.pickerText}
                    />
                  </View>
                </View>

                {/* Expected Date */}
                <View style={styles.formGroup}>
                  <View style={styles.inputContainer}>
                    <TText style={[styles.floatingLabel, startDate ? styles.floatingActive : styles.floatingInactive]}>
                      Expected Date of Delivery
                    </TText>

                    {Platform.OS === "web" ? (
                      <input
                        type="date"
                        style={styles.input as any}
                        value={startDate.toISOString().split("T")[0]}
                        min={new Date().toISOString().split("T")[0]}
                        onChange={(e) => {
                          const next = new Date((e.target as any).value);
                          trackUI({ screen: "MasterItemDetails", element: "delivery_date", action: "change", extra: { value: next.toISOString().split("T")[0] } });
                          setStartDate(next);
                        }}
                      />
                    ) : (
                      <>
                        <TouchableOpacity
                          onPress={() => {
                            trackUI({ screen: "MasterItemDetails", element: "delivery_date", action: "open", extra: {} });
                            setShowStartPicker(true);
                          }}
                          style={styles.input}
                        >
                          <TText>{startDate.toDateString()}</TText>
                        </TouchableOpacity>

                        {showStartPicker && (
                          <DateTimePicker
                            value={startDate}
                            mode="date"
                            display="default"
                            onChange={(event, date) => {
                              setShowStartPicker(false);
                              if (date) {
                                trackUI({ screen: "MasterItemDetails", element: "delivery_date", action: "change", extra: { value: date.toISOString().split("T")[0] } });
                                setStartDate(date);
                              } else {
                                trackUI({ screen: "MasterItemDetails", element: "delivery_date", action: "cancel", extra: {} });
                              }
                            }}
                            minimumDate={new Date()}
                          />
                        )}
                      </>
                    )}
                  </View>
                </View>

                {/* Project */}
                <View style={styles.formGroup}>
                  <View style={styles.inputContainer}>
                    <TText style={[styles.floatingLabel, project ? styles.floatingActive : styles.floatingInactive]}>Project</TText>
                    <ModalSelector
                      data={projectOptions}
                      initValue={project}
                      onChange={handleProjectSelect}
                      style={styles.pickerContainer}
                      selectStyle={styles.picker}
                      initValueTextStyle={styles.pickerText}
                      optionTextStyle={styles.pickerText}
                    />
                  </View>
                </View>

                {/* Property */}
                <View style={styles.formGroup}>
                  <View style={styles.inputContainer}>
                    <TText style={[styles.floatingLabel, property ? styles.floatingActive : styles.floatingInactive]}>Properties</TText>
                    <ModalSelector
                      data={propertyOptions}
                      initValue={property}
                      onChange={(option: any) => {
                        trackUI({ screen: "MasterItemDetails", element: "property_select", action: "change", extra: { to: String(option.label) } });
                        setProperty(String(option.label));
                      }}
                      style={styles.pickerContainer}
                      selectStyle={styles.picker}
                      initValueTextStyle={styles.pickerText}
                      optionTextStyle={styles.pickerText}
                    />
                  </View>
                </View>

                {/* Remarks */}
                <View style={[styles.formGroup, { height: 86 }]}>
                  <View style={[styles.inputContainer, { height: 86 }]}>
                    <TText style={[styles.floatingLabel, remarks ? styles.floatingActive : styles.floatingInactive]}>Remarks</TText>
                    <TextInput
                      style={[styles.input, { height: 70 }]}
                      multiline
                      numberOfLines={3}
                      value={remarks}
                      onChangeText={(t) => {
                        setRemarks(t);
                        const now = Date.now();
                        if (now - lastRemarksLogRef.current.at > 1500 && lastRemarksLogRef.current.len !== t.length) {
                          lastRemarksLogRef.current = { at: now, len: t.length };
                          trackUI({ screen: "MasterItemDetails", element: "remarks_input", action: "change", extra: { len: t.length } });
                        }
                      }}
                      onBlur={() => trackUI({ screen: "MasterItemDetails", element: "remarks_input", action: "blur", extra: { len: remarks.length } })}
                    />
                  </View>
                </View>

                {/* Buttons */}
                <View style={styles.modalButtonContainer}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => {
                      trackUI({ screen: "MasterItemDetails", element: "request_modal", action: "close", extra: { reason: "cancel" } });
                      setModalVisible(false);
                    }}
                  >
                    <TText style={styles.buttonText}>Cancel</TText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.confirmButton}
                    onPress={() => {
                      trackUI({ screen: "MasterItemDetails", element: "request_modal", action: "confirm_click", extra: { modal_type: modalType ?? null } });
                      handleRequestInventory();
                    }}
                  >
                    <TText style={styles.buttonText}>{modalType === "request" ? "Proceed" : "Raise"}</TText>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Status Dialog */}
      <Modal visible={isDialogVisible} transparent animationType="fade">
        <View style={styles.dialogContainer}>
          <View style={styles.dialogBox}>
            <TText style={styles.dialogTitle}>Inventory Request Status</TText>
            <TText style={styles.dialogMessage}>{dialogMessage}</TText>
            <TouchableOpacity style={styles.dialogButton} onPress={closeDialog}>
              <TText style={styles.dialogButtonText}>OK</TText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9F9F9" },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 18,
    marginVertical: 10,
    marginHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 5,
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#222",
    marginBottom: 14,
    textAlign: "center",
    textTransform: "capitalize",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  alternateBackground: { backgroundColor: "#F8F8F8" },
  infoLabel: { fontSize: 15, fontWeight: "700", color: "#444", flex: 1, marginLeft: 2 },
  infoValue: { color: "#666", flex: 1, textAlign: "right", textTransform: "capitalize" },
  disabledInput: { backgroundColor: "#e3e1e1", color: "#383736" },

  requestButton: {
    backgroundColor: "#4A90E2",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 6,
    width: "60%",
    alignSelf: "center",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  raiseButton: {
    backgroundColor: "#FF6347",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 6,
    width: "60%",
    alignSelf: "center",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  buttonText: { color: "#FFF", fontSize: 16, fontWeight: "bold" },

  modalBackground: { flex: 1, justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContainer: { padding: 20, margin: 20, backgroundColor: "#FFF", borderRadius: 10, maxHeight: "85%" },
  modalTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 10 },
  formGroup: { marginBottom: 16, position: "relative" },
  inputContainer: {
    position: "relative",
    borderWidth: 1,
    borderColor: "#4A90E2",
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#FFF",
    height: 50,
  },
  input: { fontSize: 12, color: "#333", height: 35, paddingTop: 10 },
  floatingLabel: {
    position: "absolute",
    left: 10,
    top: 14,
    fontSize: 14,
    color: "#4A90E2",
    backgroundColor: "white",
    paddingHorizontal: 3,
  },
  floatingActive: { top: -8, fontSize: 12, color: "#4A90E2", fontWeight: "bold" },
  floatingInactive: { top: 14, fontSize: 14, color: "#4A90E2" },
  modalButtonContainer: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  cancelButton: { backgroundColor: "gray", padding: 10, borderRadius: 5 },
  confirmButton: { backgroundColor: "#4A90E2", padding: 10, borderRadius: 5 },

  headerContainer: {
    flexDirection: "row",
    padding: 16,
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#EAEAEA",
  },
  headerTitleContainer: { flexDirection: "row", alignItems: "center" },
  headerTitle: { fontSize: 20, fontWeight: "bold", marginLeft: 10 },

  pickerContainer: { borderColor: "#D3D3D3", borderRadius: 8, height: 34 },
  picker: { borderWidth: 0 },
  pickerText: { fontSize: 14, color: "#333", textTransform: "uppercase" },

  dialogContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0, 0, 0, 0.5)" },
  dialogBox: { width: "85%", padding: 20, backgroundColor: "#FFF", borderRadius: 12, alignItems: "center", elevation: 5 },
  dialogTitle: { fontSize: 20, fontWeight: "bold", color: "#333" },
  dialogMessage: { fontSize: 16, marginBottom: 10, textAlign: "center", color: "#666" },
  dialogButton: { backgroundColor: "#4A90E2", padding: 12, borderRadius: 5 },
  dialogButtonText: { color: "#FFF", fontSize: 16, fontWeight: "bold" },
});

export default MasterItemDetails;
