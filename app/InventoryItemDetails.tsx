import React, { useState, useEffect } from "react";
import { 
  View, FlatList, ActivityIndicator, StyleSheet, TouchableOpacity, TextInput, Modal, Alert, Platform, KeyboardTypeOptions } from "react-native";
import axios from "axios";
import ModalSelector from "@/components/AppModalSelect";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFontScale } from "@/context/FontScaleContext";
import TText from "@/components/TText";

import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
import { getDecimalInputProps } from "../utils/keyboardProps";
import { resolveEmployeeIdentity } from "../utils/employeeIdentity";
interface InventoryItem {
  item_name: string;
  location: string;
  warehouse: string;
  quantity: number;
  raised_quantity: number;
  available_quantity: number;
  created_date: string;
  updated_date: string;
  invoice_id?: string;
}

interface ProjectOption {
  key: string;
  label: string;
}

const INVENTORY_REQUEST_SOURCE = "InventoryItemDetails";

const InventoryItemDetails = () => {
  const router = useRouter();
  const params = useLocalSearchParams();

  const { parsed_item_name, parsed_warehouse, parsed_location } = params as {
    parsed_item_name: string;
    parsed_warehouse: string;
    parsed_location: string;
  };



  // :white_tick: Ensure employee_details is always a string before parsing
  const employeeDetails = params.employee_details
    ? JSON.parse(
        Array.isArray(params.employee_details)
          ? params.employee_details[0]
          : params.employee_details
      )
    : {};

  const {
    first_name,
    last_name,
    email,
    job_title,
    employee_code,
    phone_number,
  } = employeeDetails;

  const API_URL = `${APP_API_BASE_URL}/inventory/?parsed_item_name=${encodeURIComponent(
    parsed_item_name
  )}&parsed_location=${encodeURIComponent(
    parsed_location
  )}&parsed_warehouse=${encodeURIComponent(parsed_warehouse)}`;

  const [inventoryData, setInventoryData] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalType, setModalType] = useState(null); // "request" or "block"
  const [quantity, setQuantity] = useState("");
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const [projectOptions, setProjectOptions] = useState([]);
  const [propertyOptions, setPropertyOptions] = useState<ProjectOption[]>([]);
  const [project, setProject] = useState("Select Project");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [property, setProperty] = useState("Select Property");
  const [isDialogVisible, setIsDialogVisible] = useState(false);
  const [dialogMessage, setDialogMessage] = useState("");
  const [startDate, setStartDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [remark, setRemark] = useState("");
  const [type, setType] = useState("general");


  useEffect(() => {
    const fetchInventoryDetails = async () => {
      try {
        const response = await axios.get(API_URL);
        if (response.data) {
          setInventoryData([response.data]);
        }
      } catch (error) {
      } finally {
        setLoading(false);
      }
    };
    fetchInventoryDetails();
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await axios.get(`${APP_API_BASE_URL}/projects_m`);
      if (Array.isArray(response.data.projects)) {
        setProjectOptions(
          response.data.projects.map(
            (proj: { project_id: number; project_name: string }) => ({
              key: proj.project_id.toString(),
              label: proj.project_name,
            })
          )
        );
      }
    } catch (error) {
    }
  };

  const fetchProperties = async (selectedProjectId: string) => {
    try {
      const response = await axios.get(
        `${APP_API_BASE_URL}/projects_m/${selectedProjectId}/properties`
      );
      if (Array.isArray(response.data.properties)) {
        setPropertyOptions(
          response.data.properties.map((prop: any, index: any) => ({
            key: `${index + 1}`,
            label: prop.name,
          }))
        );
      } else {
        setPropertyOptions([]);
      }
    } catch (error) {
    }
  };

  const handleProjectSelect = (option: ProjectOption) => {
    setProject(option.label);
    setProjectId(option.key);
    setProperty("Select Property");
    setPropertyOptions([]);
    fetchProperties(option.key);
  };

  // Close Dialog and Navigate Back
  const closeDialog = () => {
    setIsDialogVisible(false);
    {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.push("/HomeScreen"); // Fallback to a safe screen like Home
      }
    }
  };

  const handleRequestInventory = async () => {
    const quantityNumber = Number(quantity); // Convert string to number
  
    if (!quantity || isNaN(quantityNumber) || quantityNumber <= 0) {
      setDialogMessage("Invalid Quantity. Please enter a valid number.");
      setIsDialogVisible(true);
      return;
    }
    if (!projectId || property === "Select Property") {
      setDialogMessage("Missing Fields. Please select a project and property.");
      setIsDialogVisible(true);
      return;
    }
    if (!selectedItem) {
      setDialogMessage("No item selected.");
      setIsDialogVisible(true);
      return;
    }
    if (!startDate) {
      setDialogMessage("Missing Date. Please select a start date.");
      setIsDialogVisible(true);
      return;
    }

    const identity = await resolveEmployeeIdentity(params as Record<string, unknown>);
    const effectiveEmployeeCode = identity.employee_code || String(employeeDetails.employee_code || "").trim();
    if (!effectiveEmployeeCode) {
      setDialogMessage("Unable to identify employee code for this request. Please log in again and retry.");
      setIsDialogVisible(true);
      return;
    }
  
    const requestData = {
      item_name: selectedItem.item_name,
      requested_quantity: parseInt(quantity),
      invoice_id: selectedItem.invoice_id || null,
      warehouse: selectedItem.warehouse || "1",
      project_id: projectId || null,
      project_name: project || null,
      property_id: propertyOptions.find((option) => option.label === property)?.key || null,
      property_name: property || null,
      employee_code: effectiveEmployeeCode,
      deli_date: startDate.toISOString().split("T")[0],
      initial_remark: remark || "",
      item_type: type,
    };
  
    try {
      const response = await axios.post(
        `${APP_API_BASE_URL}/request-inventory`,
        requestData,
        {
          headers: {
            "Content-Type": "application/json",
            "x-client-sync-mode": "online_live",
            "x-client-request-source": INVENTORY_REQUEST_SOURCE,
          },
        }
      );
  
      if (response.data.success) {
        let baseMessage = `✅ Requested ${quantity} units of "${selectedItem.item_name}" successfully for ${project} - ${property} on ${startDate.toISOString().split("T")[0]}.`;
  
        if (response.data.note) {
          baseMessage += `\n\n⚠️ ${response.data.note}`;
        }
  
        setDialogMessage(baseMessage);
      } else {
        setDialogMessage("❌ Failed to request inventory. Please try again.");
      }
    } catch (error: any) {
      let backendError = "❌ An error occurred while processing the request.";
  
      const detail = error?.response?.data?.detail;
  
      if (typeof detail === "string") {
        backendError = detail;
      } else if (Array.isArray(detail)) {
        backendError = detail.map((d) => `• ${d.msg}`).join("\n");
      } else if (typeof detail === "object" && detail?.msg) {
        backendError = detail.msg;
      }
  
      setDialogMessage(backendError);
    }
  
    setModalVisible(false);
    setIsDialogVisible(true);
  };
  
  

  // Updated function to pass date to modal
  const handleOpenModal = (item: any, type: any) => {
    setSelectedItem(item);
    setQuantity("");
    setRemark(""); // ✅ Clear old remark
    setProject("Select Project");
    setProperty("Select Property");
    setModalType(type);
    setModalVisible(true);
    setStartDate(new Date());
  };
  

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4A90E2" />
        <TText style={styles.loadingText}>Loading item details...</TText>
      </View>
    );
  }

  const renderItem = ({ item }: { item: InventoryItem }) => (
    <>
      <View style={styles.card}>
        <TText style={styles.title}>{item.item_name}</TText>

        <View style={[styles.infoRow, styles.alternateBackground]}>
          <TText style={styles.infoLabel}>Location:</TText>
          <TText style={styles.infoValue}>{item.location}</TText>
        </View>

        <View style={styles.infoRow}>
          <TText style={styles.infoLabel}>Warehouse:</TText>
          <TText style={styles.infoValue}>{item.warehouse}</TText>
        </View>

        <View style={[styles.infoRow, styles.alternateBackground]}>
          <TText style={styles.infoLabel}>Quantity:</TText>
          <TText style={styles.infoValue}>{item.quantity}</TText>
        </View>

        <View style={styles.infoRow}>
          <TText style={styles.infoLabel}>Available:</TText>
          <TText style={styles.infoValue}>{item.available_quantity}</TText>
        </View>

        <View style={[styles.infoRow, styles.alternateBackground]}>
          <TText style={styles.infoLabel}>Raised:</TText>
          <TText style={styles.infoValue}>{item.raised_quantity}</TText>
        </View>

        <View style={styles.infoRow}>
          <TText style={styles.infoLabel}>Created at:</TText>
          <TText style={styles.infoValue}>
            {item.created_date.split("T")[0]} {/* Extracts only YYYY-MM-DD */}
          </TText>
        </View>

        <View style={[styles.infoRow, styles.alternateBackground]}>
          <TText style={styles.infoLabel}>Updated at:</TText>
          <TText style={styles.infoValue}>
            {item.updated_date.split("T")[0]} {/* Extracts only YYYY-MM-DD */}
          </TText>
        </View>
      </View>
      <View style={styles.buttonContainer}>
        {item.available_quantity < 0 ? (
          <TouchableOpacity
            style={styles.raiseButton}
            onPress={() => handleOpenModal(item, "raise")}
          >
            <TText style={styles.buttonText}>Raise Inventory</TText>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.requestButton}
            onPress={() => handleOpenModal(item, "request")}
          >
            <TText style={styles.buttonText}>Request Inventory</TText>
          </TouchableOpacity>
        )}
      </View>
    </>
  );

  return (
    <View style={styles.container} testID="inventory-item-details-root">
      <View style={styles.headerContainer}>
        <View style={styles.headerTitleContainer}>
          <TouchableOpacity
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.push("/HomeScreen"); // Fallback to a safe screen like Home
              }
            }}
          >
            <Ionicons name="arrow-back" size={24} color="#5a5a5c" />
          </TouchableOpacity>

          <TText style={styles.headerTitle}>Inventory Details</TText>
        </View>
        <TouchableOpacity onPress={() => router.push("/HomeScreen")}>
          <Ionicons name="home" size={24} color="#5a5a5c" />
        </TouchableOpacity>
      </View>
      <FlatList
        data={inventoryData}
        renderItem={renderItem}
        keyExtractor={(item, index) => index.toString()}
      />

      {/* Inventory Modal */}
      <Modal transparent={true} animationType="slide" visible={modalVisible}>
        <View style={styles.modalBackground}>
          <View style={styles.modalContainer}>
            <TText style={styles.modalTitle}>
              {modalType === "request"
                ? "Request Inventory"
                : "Block Inventory"}
            </TText>

            {/* ✅ Item Name (Read-Only) */}
            <View style={styles.formGroup}>
              <View style={styles.inputContainer}>
                <TText
                  style={[
                    styles.floatingLabel,
                    selectedItem?.item_name
                      ? styles.floatingActive
                      : styles.floatingInactive,
                  ]}
                >
                  Item Name
                </TText>
                <TextInput
                  style={[styles.input, styles.disabledInput]}
                  value={selectedItem?.item_name ?? ""}
                  editable={false}
                />
              </View>
            </View>

            {/* ✅ Quantity */}
            <View style={styles.formGroup}>
              <View style={styles.inputContainer}>
                <TText
                  style={[
                    styles.floatingLabel,
                    quantity ? styles.floatingActive : styles.floatingInactive,
                  ]}
                >
                  Quantity
                </TText>
                <TextInput
                  style={styles.input}
                  {...getDecimalInputProps()}
                  placeholder=""
                  value={quantity}
                  onChangeText={setQuantity}
                />
              </View>
            </View>

            {/* ✅ Type Selector */}
<View style={styles.formGroup}>
<View style={styles.inputContainer}>
  <TText
    style={[
      styles.floatingLabel,
      type ? styles.floatingActive : styles.floatingInactive,
    ]}
  >
    Type
  </TText>
  <ModalSelector
    data={[
      { key: "general", label: "GENERAL" },
      { key: "avenue_add_on", label: "AVENUE ADD ON" },
      { key: "customr_add_on", label: "CUSTOMER ADD ON" },

    ]}
    initValue={type}
    onChange={(option: any) => setType(option.key)}
    style={styles.pickerContainer}
    selectStyle={styles.picker}
    initValueTextStyle={styles.pickerText}
    optionTextStyle={styles.pickerText}
  />
</View>
</View>

            {/* ✅ Start Date */}
            <View style={styles.formGroup}>
              <View style={styles.inputContainer}>
                <TText
                  style={[
                    styles.floatingLabel,
                    startDate ? styles.floatingActive : styles.floatingInactive,
                  ]}
                >
                  Expected Date of Delivery
                </TText>
                {Platform.OS === "web" ? (
                  <input
                  type="date"
                  style={styles.input}
                  value={startDate.toISOString().split("T")[0]}
                  min={new Date().toISOString().split("T")[0]}  // ✅ Restrict to today and future dates
                  onChange={(e) => setStartDate(new Date(e.target.value))}
                  />
                ) : (
                  <>
                    <TouchableOpacity
                      onPress={() => setShowStartPicker(true)}
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
            if (date) setStartDate(date);
          }}
          minimumDate={new Date()} // ✅ Restrict past dates
        />
      )}
                  </>
                )}
              </View>
            </View>

            {/* ✅ Project Selector */}
            <View style={styles.formGroup}>
              <View style={styles.inputContainer}>
                <TText
                  style={[
                    styles.floatingLabel,
                    project ? styles.floatingActive : styles.floatingInactive,
                  ]}
                >
                  Project
                </TText>
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

            {/* ✅ Property Selector */}
            <View style={styles.formGroup}>
              <View style={styles.inputContainer}>
                <TText
                  style={[
                    styles.floatingLabel,
                    property ? styles.floatingActive : styles.floatingInactive,
                  ]}
                >
                  Properties
                </TText>
                <ModalSelector
                  data={propertyOptions}
                  initValue={property}
                  onChange={(option: any) => setProperty(option.label)}
                  style={styles.pickerContainer}

                  selectStyle={styles.picker}
                  initValueTextStyle={styles.pickerText}
                  optionTextStyle={styles.pickerText}
                />
              </View>
            </View>


{/* ✅ Remark Input */}
<View style={styles.formGroup}>
<View style={styles.inputContainer}>
  <TText
    style={[
      styles.floatingLabel,
      remark ? styles.floatingActive : styles.floatingInactive,
    ]}
  >
    Initial Remark (optional)
  </TText>
  <TextInput
    style={styles.input}
    value={remark}
    onChangeText={setRemark}
  />
</View>
</View>



            {/* ✅ Modal Buttons */}
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setModalVisible(false)}
              >
                <TText style={styles.buttonText}>Cancel</TText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={
                  modalType === "request"
                    ? handleRequestInventory
                    : handleRequestInventory
                }
              >
                <TText style={styles.buttonText}>
                  {modalType === "request" ? "Proceed" : "Block"}
                </TText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  alternateBackground: {
    backgroundColor: "#F8F8F8",
  },
  infoLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#444",
    flex: 1,
    marginLeft: 2,
  },
  infoValue: {
    color: "#666",
    flex: 1,
    textAlign: "right",
  },
  itemContainer: {
    margin: 8,
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
  },
  disabledInput: { backgroundColor: "#e3e1e1", color: "#383736" },

  buttonContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
    marginHorizontal: 12,
    padding: 10,
  },
  requestButton: {
    backgroundColor: "#4A90E2", // Blue for Request
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 6,
    width: "60%", // ✅ Set fixed width
    alignSelf: "center", // ✅ Center the button
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10, // ✅ Add spacing between buttons
  },
  raiseButton: {
    backgroundColor: "#FF6347", // Red for Raise Inventory
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 6,
    width: "60%", // ✅ Set fixed width
    alignSelf: "center", // ✅ Center the button
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10, // ✅ Add spacing between buttons
  },
  buttonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "bold",
  },

  modalBackground: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContainer: { padding: 20, margin:20,
    backgroundColor: "#FFF", borderRadius: 10 },
  modalTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 10 },
  formGroup: {
    marginBottom: 16,
    position: "relative",
  },
  inputContainer: {
    position: "relative",
    borderWidth: 1,
    borderColor: "#4A90E2", // Default border color
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#FFF",
    height: 50,
  },
  inputFocused: {
    borderWidth: 0,
    borderColor: "#4A90E2", // Keep border color blue when active (No yellow!)
  },
  input: {
    fontSize: 12,
    color: "#333",
    height: 35,
    paddingTop: 10,
  },
  floatingLabel: {
    position: "absolute",
    left: 10,
    top: 14,
    fontSize: 14,
    color: "#4A90E2",
    backgroundColor: "white",
    paddingHorizontal: 3,
  },
  floatingActive: {
    top: -8,
    fontSize: 12,
    color: "#4A90E2",
    fontWeight: "bold",
  },
  floatingInactive: {
    top: 14,
    fontSize: 14,
    color: "#4A90E2",
  },
  modalButtonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cancelButton: { backgroundColor: "gray", padding: 10, borderRadius: 5 },
  confirmButton: { backgroundColor: "#4A90E2", padding: 10, borderRadius: 5 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, fontSize: 16, color: "#4A90E2" },
  errorText: {
    fontSize: 18,
    color: "red",
    fontWeight: "bold",
    textAlign: "center",
  },
  itemLabel: { fontSize: 19, fontWeight: 500, color: "#333" },
  itemValue: { fontSize: 16, color: "#555", marginBottom: 8, marginTop: 10 },
  label: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#4A90E2",
    marginBottom: 5,
  },
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
  grid: { padding: 16 },
  pickerContainer: { borderColor: "#D3D3D3", borderRadius: 8, height: 34 },
  picker: { borderWidth: 0 },
  pickerText: {
    fontSize: 14,
    color: "#333",
    textTransform: "uppercase",
  },    dialogContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  dialogBox: {
    width: "85%",
    padding: 20,
    backgroundColor: "#FFF",
    borderRadius: 12,
    alignItems: "center",
    elevation: 5, // Shadow effect for better UI
  },
  dialogTitle: { fontSize: 20, fontWeight: "bold", color: "#333" },
  dialogMessage: {
    fontSize: 16,
    marginBottom: 10,
    textAlign: "center",
    color: "#666",
  },
  dialogButton: { backgroundColor: "#4A90E2", padding: 12, borderRadius: 5 },
  dialogButtonText: { color: "#FFF", fontSize: 16, fontWeight: "bold" },
  dialogInfo: {
    fontSize: 14,
    textAlign: "center",
    color: "#444",
    marginBottom: 20,
    fontWeight: "500",
  },
});

export default InventoryItemDetails;
