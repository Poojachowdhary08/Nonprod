import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Alert,
  Image,
  Linking,
  KeyboardAvoidingView,
  Platform,
  LayoutAnimation,
  UIManager,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ModalSelector from "@/components/AppModalSelect";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as mime from "react-native-mime-types";
import { ReactNativeZoomableView } from "@openspacelabs/react-native-zoomable-view";
import { useRouter, useLocalSearchParams } from "expo-router";

import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
import { authenticatedFetch } from "../utils/auth";
import { getDecimalInputProps } from "../utils/keyboardProps";

// ✅ Telemetry
import {
  trackScreen,
  trackUI,
  trackNetwork,
  updateDynamicContext,
  clearDynamicContext,
} from "@/utils/telemetry";

import TText from "@/components/TText";
import { useSpeechToText } from "@/utils/useSpeechToText";

// ✅ Bottom footer nav
import AppFooterNav, { FooterNavItem } from "./AppFooterNav";
import { useTheme } from "@/src/theme/ThemeProvider";

interface FileAttachment {
  uri: string;
  name: string;
  type: string;
  file?: any;
}

const COLORS = {
  bg: "#F5F7FB",
  card: "#FFFFFF",
  text: "#222",
  subText: "#5A5F6A",
  primary: "#2563EB",
  primaryAlt: "#1D4ED8",
  border: "#E5E7EB",
  muted: "#9CA3AF",
  success: "#16A34A",
  danger: "#EF4444",
  warning: "#F59E0B",
  chip: "#EEF2FF",
  accent: "#2C7BE5",
  accentSoft: "#E8F1FF",
  disabledText: "#9AA0A6",
};

const SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.08,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 3,
};

const footerItems: FooterNavItem[] = [
  { id: 0, title: "Back", iconName: "arrow-back-outline" },
  { id: 2, title: "Schedules", iconName: "calendar-outline" },
  { id: 3, title: "Inventory", iconName: "list-outline" },
  { id: 4, title: "Labour", iconName: "people-outline" },
  { id: 5, title: "Documents", iconName: "document-text-outline" },
  { id: 7, title: "Review", iconName: "construct-outline" },
];

const NAME_COLORS = [
  "#D32F2F",
  "#1976D2",
  "#388E3C",
  "#F57C00",
  "#7B1FA2",
  "#0097A7",
  "#FBC02D",
  "#5D4037",
  "#0288D1",
  "#C2185B",
];

const Badge = ({
  label,
  tone,
}: {
  label: string;
  tone?: "info" | "success" | "danger" | "warning";
}) => {
  const toneMap = {
    info: { bg: COLORS.chip, color: COLORS.primary },
    success: { bg: "#ECFDF5", color: COLORS.success },
    danger: { bg: "#FEF2F2", color: COLORS.danger },
    warning: { bg: "#FFFBEB", color: COLORS.warning },
  } as const;
  const t = toneMap[tone || "info"];
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: t.bg }}>
      <TText style={{ fontSize: 10, fontWeight: "700", color: t.color }}>{label}</TText>
    </View>
  );
};

const getParamString = (v: any, fallback = ""): string => {
  if (v == null) return fallback;
  if (Array.isArray(v)) return String(v[0] ?? fallback);
  return String(v);
};

const fmtDateDMY = (isoOrStr: string) => {
  if (!isoOrStr) return "";
  if (isoOrStr.length >= 10) {
    const yyyy = isoOrStr.slice(0, 4);
    const mm = isoOrStr.slice(5, 7);
    const dd = isoOrStr.slice(8, 10);
    if (yyyy && mm && dd) return `${dd}/${mm}/${yyyy}`;
  }
  return isoOrStr;
};

const EditDeleteInventory = () => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  const router = useRouter();
  const params = useLocalSearchParams();

  const empCode = getParamString(params.employee_code);
  const requestId = getParamString(params.request_id);
  const deli_date = getParamString(params.deli_date);
  const created_at = getParamString(params.created_at);
  const propertyId = getParamString(params.property_name);
  const itemType = getParamString(params.item_type);
  const initialItemName = getParamString(params.item_name);
  const initialStatus = getParamString(params.status);
  const initialWarehouse = getParamString(params.warehouse);
  const initialRequestedQuantity = getParamString(params.requested_quantity);

  const totalRequested = getParamString(params.total_requested);
  const totalIssued = getParamString(params.total_issued);
  const totalReturned = getParamString(params.total_returned);
  const totalUsed = getParamString(params.total_used);
  const projectId = getParamString(params.projectId || params.project_id);
  const propertyName = getParamString(params.propertyName || params.property_name);
  const projectLocation = getParamString(params.projectLocation || params.project_location);
  const userDetails = getParamString(params.userDetails || params.user_details);

  const safeNum = (v: any, fallback = "") => {
    if (v === null || v === undefined || v === "") return fallback;
    return String(v);
  };

  useEffect(() => {
    if (Platform.OS === "android") {
      UIManager.setLayoutAnimationEnabledExperimental?.(true);
    }
  }, []);

  useEffect(() => {
    updateDynamicContext({
      screen: "EditDeleteInventory",
      employeeCode: empCode ? String(empCode) : "",
    });

    trackScreen("EditDeleteInventory", {
      request_id: requestId,
      has_employee_code: !!empCode,
      platform: Platform.OS,
    });

    return () => clearDynamicContext();
  }, [empCode, requestId]);

  // ── State ─────────────────────────────────────────
  const [itemName, setItemName] = useState<string>(initialItemName || "");
  const [status, setStatus] = useState<string>(initialStatus || "requested");
  const [warehouse, setWarehouse] = useState<string>(
    initialWarehouse || "Unknown Warehouse"
  );
  const [requestedQuantity, setRequestedQuantity] = useState<string>(
    initialRequestedQuantity || "0"
  );

  const [isEditing, setIsEditing] = useState(false);
  const [isDialogVisible, setIsDialogVisible] = useState(false);
  const [isDeleteDialogVisible, setIsDeleteDialogVisible] = useState(false);
  const [dialogMessage, setDialogMessage] = useState("");
  const [remarks, setRemarks] = useState<any[]>([]);
  const [newRemark, setNewRemark] = useState("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [newUpdateFiles, setNewUpdateFiles] = useState<FileAttachment[]>([]);

  const [detailsOpen, setDetailsOpen] = useState(true);

  // Voice
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const { isListening, startListening: startSpeechToText, stopListening: stopSpeechToText } =
    useSpeechToText({
      lang: "en-IN",
      continuous: false,
      interimResults: true,
      stopOnFinal: true,
      onFinalTranscript: (text) => {
        setNewRemark((prev) => (prev ? `${prev} ${text}` : text));
      },
      onError: (message) => {
        setVoiceError(message);
        Alert.alert("Voice input", message);
      },
    });

  const scrollRef = useRef<ScrollView>(null);
  const quantityInputRef = useRef<TextInput>(null);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  const normalizedStatus = (status ?? "").trim().toLowerCase();
  const canEdit =
    normalizedStatus === "requested" || normalizedStatus === "updated";
  const canWithdraw = normalizedStatus === "requested";
  const isLocked = normalizedStatus === "rejected";
  const lockReasonRejected =
    "REJECTED requests cannot be edited. Please raise a new request.";
  const editRuleReason = 'Edit is allowed only when status is "requested".';

  const [selectedSection, setSelectedSection] = useState<number>(2);
  const online = isConnected !== false;
  const isDisabledOffline = (id: number) => !online && (id === 5 || id === 7);

  const onFooterSelect = (item: FooterNavItem) => {
    if (item.id === 0) {
      router.back();
      return;
    }

    if (isDisabledOffline(item.id)) {
      Alert.alert("Offline", "This section is unavailable offline.");
      return;
    }

    setSelectedSection(item.id);

    router.push({
      pathname: "/PropertiesListScreen",
      params: {
        propertyId,
        selectedSection: String(item.id),
        projectId,
        propertyName,
        projectLocation,
        userDetails: JSON.stringify(userDetails),
      },
    } as any);
  };

  useEffect(() => {
    if (!canEdit && isEditing) setIsEditing(false);
  }, [canEdit, isEditing]);

  useEffect(() => {
    if (isEditing) {
      requestAnimationFrame(() => {
        setTimeout(() => quantityInputRef.current?.focus(), 100);
      });
    }
  }, [isEditing]);

  const getColorForName = (name: string): string => {
    const hash = [...name].reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return NAME_COLORS[hash % NAME_COLORS.length];
  };

  const statusTone =
    normalizedStatus === "issued"
      ? "success"
      : normalizedStatus === "rejected"
      ? "danger"
      : normalizedStatus === "updated"
      ? "warning"
      : "info";

  const totalLabelAndValue = useMemo(() => {
    if (normalizedStatus === "issued") {
      return {
        label: "Total Issued",
        value: safeNum(totalIssued, "0"),
      };
    }

    if (normalizedStatus === "requested") {
      return {
        label: "Total Requested",
        value: safeNum(totalRequested, "0"),
      };
    }

    return {
      label: "Total Requested",
      value: safeNum(totalRequested, "0"),
    };
  }, [normalizedStatus, totalIssued, totalRequested]);

  const DetailRow = ({
    icon,
    k,
    v,
    mono,
    testID,
  }: {
    icon?: any;
    k: string;
    v: string;
    mono?: boolean;
    testID: string;
  }) => (
    <View style={styles.kvRow} testID={testID}>
      <View style={styles.kvLeft}>
        {icon ? (
          <Ionicons name={icon} size={16} color={COLORS.muted} style={{ marginRight: 8 }} />
        ) : null}
        <TText style={styles.kvKey}>{k}</TText>
      </View>
      <TText style={[styles.kvValue, mono ? styles.kvMono : null]} numberOfLines={1}>
        {v || "-"}
      </TText>
    </View>
  );

  const toggleDetails = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = !detailsOpen;
    setDetailsOpen(next);
    trackUI({
      screen: "EditDeleteInventory",
      element: "details_toggle",
      action: "toggle",
      extra: { request_id: requestId, next },
    });
  };

  const options = useMemo(
    () => [
      { key: "camera", label: "Take Photo" },
      { key: "gallery", label: "Choose from Gallery" },
      { key: "documents", label: "Pick a Document" },
    ],
    []
  );

  const pickImageFromCamera = async () => {
    trackUI({
      screen: "EditDeleteInventory",
      element: "attach_camera",
      action: "click",
      extra: { request_id: requestId },
    });

    if (Platform.OS === "web") {
      Alert.alert("Web", "Camera capture on web varies by browser. Use Gallery or Documents.");
      return;
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission", "Camera permission is required.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });

    if (!result.canceled && result.assets.length > 0) {
      const files: FileAttachment[] = result.assets.map((asset) => ({
        uri: asset.uri,
        name: (asset as any).fileName || `camera_${Date.now()}.jpg`,
        type: "image/jpeg",
      }));
      setNewUpdateFiles((prev) => [...prev, ...files]);
    }
  };

  const pickImageFromGallery = async () => {
    trackUI({
      screen: "EditDeleteInventory",
      element: "attach_gallery",
      action: "click",
      extra: { request_id: requestId },
    });

    if (Platform.OS === "web") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.multiple = true;
      input.onchange = () => {
        const files: FileAttachment[] = Array.from(input.files || []).map(
          (file) => ({
            uri: URL.createObjectURL(file),
            name: file.name || `gallery_${Date.now()}.jpg`,
            type: file.type || "image/jpeg",
            file,
          })
        );
        setNewUpdateFiles((prev) => [...prev, ...files]);
      };
      input.click();
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission", "Gallery permission is required.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: 0,
    });

    if (!result.canceled && result.assets.length > 0) {
      const files: FileAttachment[] = result.assets.map((asset) => ({
        uri: asset.uri,
        name: (asset as any).fileName || `gallery_${Date.now()}.jpg`,
        type: "image/jpeg",
      }));
      setNewUpdateFiles((prev) => [...prev, ...files]);
    }
  };

  const pickDocuments = async () => {
    trackUI({
      screen: "EditDeleteInventory",
      element: "attach_documents",
      action: "click",
      extra: { request_id: requestId },
    });

    if (Platform.OS === "web") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "*/*";
      input.multiple = true;
      input.onchange = () => {
        const files: FileAttachment[] = Array.from(input.files || []).map(
          (file) => ({
            uri: URL.createObjectURL(file),
            name: file.name || `file_${Date.now()}`,
            type:
              file.type ||
              (mime.lookup(file.name) as string) ||
              "application/octet-stream",
            file,
          })
        );
        setNewUpdateFiles((prev) => [...prev, ...files]);
      };
      input.click();
      return;
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      multiple: true,
    });
    if (!result.canceled && (result as any).assets?.length > 0) {
      const files: FileAttachment[] = (result as any).assets.map((file: any) => ({
        uri: file.uri,
        name: file.name || `file_${Date.now()}`,
        type:
          file.mimeType ||
          (mime.lookup(file.name) as string) ||
          "application/octet-stream",
      }));
      setNewUpdateFiles((prev) => [...prev, ...files]);
    }
  };

  const startListening = async () => {
    setVoiceError(null);

    trackUI({
      screen: "EditDeleteInventory",
      element: "voice_start",
      action: "click",
      extra: { platform: Platform.OS, request_id: requestId },
    });

    await startSpeechToText();
  };

  const stopListening = async () => {
    trackUI({
      screen: "EditDeleteInventory",
      element: "voice_stop",
      action: "click",
      extra: { platform: Platform.OS, request_id: requestId },
    });

    await stopSpeechToText();
  };

  const toggleListening = () => {
    if (isListening) stopListening();
    else startListening();
  };

  const parseCustomDate = (input: string): Date => {
    try {
      const [datePart, timePart] = input.split(", ");
      const [day, month, year] = datePart.split("-");
      const [time, period] = (timePart || "").split(" ");
      let [hours, minutes, seconds] = (time as any).split(":").map(Number);
      if (period === "PM" && hours < 12) hours += 12;
      if (period === "AM" && hours === 12) hours = 0;
      return new Date(
        `${year}-${month}-${day}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(
          2,
          "0"
        )}:${String(seconds || 0).padStart(2, "0")}`
      );
    } catch {
      return new Date();
    }
  };

  const fetchRemarks = async () => {
    const t0 = Date.now();
    try {
      const res = await authenticatedFetch(`${APP_API_BASE_URL}/inventory-requests/${requestId}/remarks`);
      const data = await res.json();

      trackNetwork({
        url: `/inventory-requests/${String(requestId)}/remarks`,
        method: "GET",
        status: res.status,
        ok: res.ok,
        durationMs: Date.now() - t0,
        extra: {},
      });

      if (Array.isArray(data)) setRemarks(data);
      else setRemarks([]);
    } catch (error) {
      trackUI({
        screen: "EditDeleteInventory",
        element: "remarks_fetch_error",
        action: "submit",
        extra: {
          request_id: requestId,
          message: String((error as any)?.message || error),
        },
      });
      setRemarks([]);
    }
  };

  useEffect(() => {
    fetchRemarks();
  }, [requestId]);

  const handlePostRemark = async () => {
    if (!newRemark.trim() && newUpdateFiles.length === 0) {
      Alert.alert("Error", "Cannot post empty remark.");
      return;
    }

    if (isListening) await stopListening();

    trackUI({
      screen: "EditDeleteInventory",
      element: "remark_send",
      action: "click",
      extra: {
        request_id: requestId,
        has_text: !!newRemark.trim(),
        files: newUpdateFiles.length,
      },
    });

    const t0 = Date.now();
    const formData = new FormData();
    formData.append("employee_code", String(empCode || ""));
    formData.append("remark", newRemark.trim());

    for (const file of newUpdateFiles) {
      const fileName = file.name || `file_${Date.now()}`;
      const fileType =
        (file.type as string) ||
        (mime.lookup(fileName) as string) ||
        "application/octet-stream";

      if (Platform.OS === "web") {
        try {
          const resp = await fetch(file.uri);
          const blob = await resp.blob();
          formData.append("files", new File([blob], fileName, { type: fileType }));
        } catch {}
      } else {
        const fileUri = file.uri.startsWith("file://") ? file.uri : `file://${file.uri}`;
        formData.append("files", { uri: fileUri, name: fileName, type: fileType } as any);
      }
    }

    try {
      const response = await authenticatedFetch(
        `${APP_API_BASE_URL}/inventory-requests/${requestId}/add-remark`,
        { method: "POST", body: formData }
      );

      trackNetwork({
        url: `/inventory-requests/${String(requestId)}/add-remark`,
        method: "POST",
        status: response.status,
        ok: response.ok,
        durationMs: Date.now() - t0,
        extra: { files: newUpdateFiles.length, has_text: !!newRemark.trim() },
      });

      const result = await response.json().catch(() => ({}));

      if (response.ok && result?.success) {
        await fetchRemarks();
        setNewRemark("");
        setNewUpdateFiles([]);
      } else {
        Alert.alert("Error", result?.message || "Failed to post remark.");
      }
    } catch {
      Alert.alert("Error", "Failed to post remark. Try again later.");
    }
  };

  const handleSave = async () => {
    const t0 = Date.now();

    if (!canEdit) {
      Alert.alert("Not allowed", editRuleReason);
      return;
    }

    trackUI({
      screen: "EditDeleteInventory",
      element: "save",
      action: "click",
      extra: { request_id: requestId },
    });

    try {
      const updateData = {
        status,
        item_name: itemName,
        requested_quantity: parseFloat(requestedQuantity || "0"),
        warehouse,
      };

      const response = await authenticatedFetch(`${APP_API_BASE_URL}/update-request/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });

      trackNetwork({
        url: `/update-request/${String(requestId)}`,
        method: "PATCH",
        status: response.status,
        ok: response.ok,
        durationMs: Date.now() - t0,
        extra: { has_qty: !!requestedQuantity },
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setDialogMessage(result?.detail || "Unexpected server error.");
        setIsDialogVisible(true);
        return;
      }

      setDialogMessage("Inventory request updated successfully!");
      setIsDialogVisible(true);
      setIsEditing(false);
    } catch {
      setDialogMessage("Failed to update item. Please try again.");
      setIsDialogVisible(true);
    }
  };

  const handleDelete = async () => {
    if (!canWithdraw) {
      Alert.alert("Not allowed", 'Only "requested" items can be withdrawn.');
      return;
    }

    const t0 = Date.now();

    trackUI({
      screen: "EditDeleteInventory",
      element: "withdraw",
      action: "click",
      extra: { request_id: requestId },
    });

    try {
      const response = await authenticatedFetch(`${APP_API_BASE_URL}/delete-request/${requestId}`, {
        method: "DELETE",
      });

      trackNetwork({
        url: `/delete-request/${String(requestId)}`,
        method: "DELETE",
        status: response.status,
        ok: response.ok,
        durationMs: Date.now() - t0,
        extra: {},
      });

      const result = await response.json().catch(() => ({}));

      if (result?.success) {
        setDialogMessage("Inventory request deleted successfully!");
        setIsDeleteDialogVisible(true);
      } else {
        Alert.alert("Error", result?.message || "Failed to delete item.");
      }
    } catch {
      Alert.alert("Error", "Failed to delete item.");
    }
  };

  const closeDialog = () => {
    setIsDialogVisible(false);
    setIsDeleteDialogVisible(false);
    if (dialogMessage.includes("successfully")) {
      if (router.canGoBack()) router.back();
      else router.push("/RequestedInventory");
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
      testID="edit-delete-inventory-root"
    >
      <View style={[styles.container, { backgroundColor: C.bg }]}>
        {/* Header */}
        <View
          style={[styles.headerContainer, SHADOW, { backgroundColor: C.surface }]}
          testID="edit-delete-inventory-header"
        >
          <TouchableOpacity
            testID="edit-delete-inventory-back-btn"
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.push("/RequestedInventory");
            }}
          >
            <Ionicons name="arrow-back" size={24} color={C.mutedText} />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <TText style={styles.headerTitle} testID="edit-delete-inventory-title">
              Edit / Delete Inventory
            </TText>
          </View>

          <TouchableOpacity
            testID="edit-delete-inventory-home-btn"
            onPress={() => router.push("/HomeScreen")}
          >
            <Ionicons name="home" size={24} color={C.mutedText} />
          </TouchableOpacity>
        </View>

        {isLocked && (
          <View
            style={{ backgroundColor: C.dangerSoft, paddingVertical: 8, paddingHorizontal: 14 }}
            testID="edit-delete-inventory-locked-banner"
          >
            <TText style={{ color: C.danger, fontSize: 10, fontWeight: "600" }}>
              {lockReasonRejected}
            </TText>
          </View>
        )}

        {/* Edit toggle */}
        <View style={styles.toolbarRow}>
          <TouchableOpacity
            testID="edit-delete-inventory-edit-toggle-btn"
            onPress={() => {
              if (!canEdit) {
                Alert.alert("Not allowed", editRuleReason);
                return;
              }
              setIsEditing((p) => !p);
            }}
            style={[
              styles.iconAction,
              !canEdit ? { backgroundColor: C.surfaceAlt } : { backgroundColor: C.primarySoft },
            ]}
            activeOpacity={0.7}
            disabled={!canEdit}
          >
            <Ionicons name="create" size={22} color={!canEdit ? C.subtleText : C.primaryStrong} />
            <TText style={[styles.iconLabel, { color: !canEdit ? C.subtleText : C.primaryStrong }]}>
              {isEditing ? "Editing…" : "Edit"}
            </TText>
          </TouchableOpacity>

          <View style={styles.toolbarSpacer} />
        </View>

        <ScrollView
          ref={scrollRef}
          testID="edit-delete-inventory-scroll"
          contentContainerStyle={[styles.scrollPad, { paddingBottom: 120 }]}
          keyboardShouldPersistTaps="always"
          nestedScrollEnabled
        >
          <View
            style={[styles.card, SHADOW, { backgroundColor: C.surface, borderColor: C.border }]}
            testID="edit-delete-inventory-main-card"
          >
            {/* Item Name */}
            <View style={styles.formGroup}>
              <TText style={styles.label}>Item Name</TText>
              <TextInput
                testID="edit-delete-inventory-item-name-input"
                style={[styles.input, styles.disabled]}
                value={itemName}
                editable={false}
              />
            </View>

            {/* Requested Quantity */}
            <View style={styles.formGroup}>
              <TText style={styles.label}>Requested Quantity</TText>
              <TextInput
                ref={quantityInputRef}
                testID="edit-delete-inventory-requested-qty-input"
                style={[styles.input, isEditing ? styles.inputEditable : styles.disabled]}
                value={requestedQuantity}
                onChangeText={(t) => {
                  if (!isEditing) return;
                  setRequestedQuantity(t);
                }}
                editable={isEditing}
                {...getDecimalInputProps()}
              />
            </View>

            {/* Details */}
            <View style={styles.detailsBox} testID="edit-delete-inventory-details-box">
              <TouchableOpacity
                testID="edit-delete-inventory-details-toggle-btn"
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  toggleDetails();
                }}
                activeOpacity={0.8}
                style={styles.detailsHeader}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <TText style={styles.detailsTitle}>{itemName} Details</TText>
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={styles.detailsBadges}>
                    {!!normalizedStatus && (
                      <Badge label={normalizedStatus.toUpperCase()} tone={statusTone as any} />
                    )}
                  </View>
                  <Ionicons
                    name={detailsOpen ? "chevron-up" : "chevron-down"}
                    size={20}
                    color={COLORS.subText}
                  />
                </View>
              </TouchableOpacity>

              {detailsOpen && (
                <View style={styles.detailsList} testID="edit-delete-inventory-details-list">
                  <DetailRow
                    testID="edit-delete-inventory-detail-request-id"
                    k="Request ID"
                    v={requestId}
                    mono
                  />
                  <DetailRow
                    testID="edit-delete-inventory-detail-warehouse"
                    k="Warehouse"
                    v={warehouse}
                  />
                  <DetailRow
                    testID="edit-delete-inventory-detail-delivery-by"
                    k="Delivery By"
                    v={fmtDateDMY(deli_date)}
                  />
                  <DetailRow
                    testID="edit-delete-inventory-detail-created-at"
                    k="Created At"
                    v={fmtDateDMY(created_at)}
                  />
                  <DetailRow
                    testID="edit-delete-inventory-detail-item-type"
                    k="Item Type"
                    v={itemType}
                  />
                  <DetailRow
                    testID="edit-delete-inventory-detail-total-main"
                    k={totalLabelAndValue.label}
                    v={totalLabelAndValue.value}
                  />
                  <DetailRow
                    testID="edit-delete-inventory-detail-total-returned"
                    k="Total Returned"
                    v={safeNum(totalReturned, "0")}
                  />
                  <DetailRow
                    testID="edit-delete-inventory-detail-total-used"
                    k="Total Used"
                    v={safeNum(totalUsed, "0")}
                  />
                </View>
              )}
            </View>

            {/* Save/Withdraw */}
            {isEditing && (
              <View
                style={styles.inlineActionsWrap}
                testID="edit-delete-inventory-inline-actions"
              >
                <TouchableOpacity
                  testID="edit-delete-inventory-save-btn"
                  style={[styles.actionBtn, { backgroundColor: COLORS.primary }]}
                  onPress={handleSave}
                  activeOpacity={0.9}
                >
                  <Ionicons name="save-outline" size={18} color="#fff" />
                  <TText style={styles.actionBtnText}>Save</TText>
                </TouchableOpacity>

                {canWithdraw && (
                  <TouchableOpacity
                    testID="edit-delete-inventory-withdraw-btn"
                    style={[styles.actionBtn, { backgroundColor: COLORS.danger }]}
                    onPress={handleDelete}
                    activeOpacity={0.9}
                  >
                    <Ionicons name="trash-outline" size={18} color="#fff" />
                    <TText style={styles.actionBtnText}>Withdraw</TText>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* Remarks */}
          {!isEditing && (
            <View
              style={[styles.card, SHADOW, { backgroundColor: C.surface, borderColor: C.border }]}
              testID="edit-delete-inventory-remarks-card"
            >
              <View style={styles.cardHeaderRow}>
                <TText style={styles.cardTitle}>Remarks</TText>
              </View>

              <ScrollView
                testID="edit-delete-inventory-remarks-list"
                style={{ maxHeight: 280 }}
                keyboardShouldPersistTaps="always"
                contentContainerStyle={{ paddingBottom: 8 }}
                nestedScrollEnabled
              >
                {remarks.map((r, index) => {
                  const isMine = r.employee_code === empCode;
                  let dateObj = new Date(r.created_at);
                  if (isNaN(dateObj.getTime())) dateObj = parseCustomDate(r.created_at);

                  const time = dateObj.toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  });

                  return (
                    <View
                      key={index}
                      testID={`edit-delete-inventory-remark-${index}`}
                      style={{ alignItems: isMine ? "flex-end" : "flex-start", marginBottom: 12 }}
                    >
                      <View
                        style={[
                          styles.remarkBubble,
                          {
                            backgroundColor: isMine ? C.primarySoft : C.surfaceAlt,
                            borderTopLeftRadius: isMine ? 16 : 0,
                            borderTopRightRadius: isMine ? 0 : 16,
                          },
                        ]}
                      >
                        <TText
                          testID={`edit-delete-inventory-remark-author-${index}`}
                          style={{
                            color: getColorForName(r.employee_name || "Unknown"),
                            fontSize: 11,
                            fontWeight: "600",
                            marginBottom: 2,
                          }}
                        >
                          {r.employee_name}
                        </TText>

                        {!!r.remark && (
                          <TText
                            testID={`edit-delete-inventory-remark-text-${index}`}
                            style={{ color: C.text, fontSize: 11, lineHeight: 20 }}
                          >
                            {r.remark}
                          </TText>
                        )}

                        {Array.isArray(r.files) && r.files.length > 0 && (
                          <View style={styles.filesWrap}>
                            {r.files.map((file: any, fileIndex: number) => {
                              const fileUrl = file.file_url;
                              const isImage = file.file_type?.startsWith("image/");
                              if (!fileUrl) return null;

                              if (isImage) {
                                return (
                                  <TouchableOpacity
                                    key={fileIndex}
                                    onPress={() => setPreviewImage(fileUrl)}
                                    style={styles.fileThumb}
                                  >
                                    <Image
                                      source={{ uri: fileUrl }}
                                      style={{ width: "100%", height: "100%" }}
                                      resizeMode="cover"
                                    />
                                  </TouchableOpacity>
                                );
                              }

                              return (
                                <TouchableOpacity
                                  key={fileIndex}
                                  onPress={() => Linking.openURL(fileUrl)}
                                  style={{ marginTop: 4, marginBottom: 2 }}
                                >
                                  <TText
                                    numberOfLines={2}
                                    selectable
                                    style={styles.fileLink}
                                  >
                                    {file.file_name || fileUrl}
                                  </TText>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        )}
                      </View>

                      <TText
                        testID={`edit-delete-inventory-remark-time-${index}`}
                        style={styles.timestamp}
                      >
                        {time}
                      </TText>
                    </View>
                  );
                })}
              </ScrollView>

              {/* Compose row */}
              <View
                style={styles.composeRow}
                testID="edit-delete-inventory-compose-row"
              >
                <TextInput
                  testID="edit-delete-inventory-compose-input"
                  style={styles.composeInput}
                  placeholder="Type your remark..."
                  placeholderTextColor={C.subtleText}
                  value={newRemark}
                  onChangeText={setNewRemark}
                  multiline
                />

                <ModalSelector
                  data={options}
                  initValue=""
                  onChange={async (option: any) => {
                    if (option.key === "camera") await pickImageFromCamera();
                    else if (option.key === "gallery") await pickImageFromGallery();
                    else if (option.key === "documents") await pickDocuments();
                  }}
                  style={{ marginHorizontal: 4 }}
                  selectStyle={{ borderWidth: 0 }}
                  optionContainerStyle={{ backgroundColor: C.surface, borderBottomColor: C.border }}
                  optionTextStyle={{ fontSize: 10, color: C.text, textTransform: "uppercase" }}
                  cancelStyle={{ backgroundColor: C.surface }}
                  cancelTextStyle={{ color: C.text }}
                  overlayStyle={{ backgroundColor: C.overlay }}
                  cancelText="Cancel"
                >
                  <TouchableOpacity
                    testID="edit-delete-inventory-attach-btn"
                    style={styles.attachBtn}
                  >
                    <Ionicons name="attach" size={22} color={C.primaryStrong} />
                  </TouchableOpacity>
                </ModalSelector>

                <TouchableOpacity
                  testID="edit-delete-inventory-mic-btn"
                  style={styles.micBtn}
                  onPress={toggleListening}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={isListening ? "mic" : "mic-outline"}
                    size={22}
                    color={isListening ? C.danger : C.primaryStrong}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  testID="edit-delete-inventory-send-btn"
                  onPress={handlePostRemark}
                  style={styles.sendBtn}
                >
                  <Ionicons name="send" size={22} color={C.white} />
                </TouchableOpacity>
              </View>

              {isListening && (
                <View
                  style={styles.recordingPill}
                  testID="edit-delete-inventory-recording-pill"
                >
                  <View style={styles.recordingDot} />
                  <TText style={styles.recordingText}>Listening…</TText>
                  <TouchableOpacity
                    onPress={stopListening}
                    style={styles.recordingStopBtn}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="stop-circle" size={18} color={C.danger} />
                  </TouchableOpacity>
                </View>
              )}

              {!!voiceError && (
                <TText
                  style={styles.voiceError}
                  testID="edit-delete-inventory-voice-error"
                >
                  {voiceError}
                </TText>
              )}

              {/* Pending attachments preview */}
              {newUpdateFiles.length > 0 && (
                <ScrollView
                  horizontal
                  style={{ marginTop: 10 }}
                  contentContainerStyle={{ paddingHorizontal: 4 }}
                  showsHorizontalScrollIndicator={false}
                >
                  {newUpdateFiles.map((file, index) => (
                    <View
                      key={index}
                      testID={`edit-delete-inventory-pending-file-${index}`}
                      style={{ marginRight: 10, position: "relative" }}
                    >
                      {file.type?.startsWith("image/") ? (
                        <TouchableOpacity onPress={() => setPreviewImage(file.uri)}>
                          <Image source={{ uri: file.uri }} style={styles.previewThumb} />
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.previewBox}>
                          <TText style={styles.previewName} numberOfLines={2}>
                            {(file.name || "").slice(0, 18)}
                          </TText>
                        </View>
                      )}
                      <TouchableOpacity
                        testID={`edit-delete-inventory-remove-file-${index}`}
                        onPress={() => setNewUpdateFiles((prev) => prev.filter((_, i) => i !== index))}
                        style={styles.thumbClose}
                      >
                        <Ionicons name="close" size={16} color={C.white} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          )}
        </ScrollView>

        {/* Image Preview */}
        {previewImage && (
          <Modal
            visible
            transparent
            animationType="fade"
            onRequestClose={() => setPreviewImage(null)}
          >
            <View
              style={styles.previewModalBg}
              testID="edit-delete-inventory-image-preview-modal"
            >
              <TouchableOpacity
                testID="edit-delete-inventory-image-preview-close-btn"
                style={styles.previewClose}
                onPress={() => setPreviewImage(null)}
              >
                <Ionicons name="close-circle" size={36} color={C.white} />
              </TouchableOpacity>
              <ReactNativeZoomableView
                maxZoom={3}
                minZoom={1}
                zoomStep={0.5}
                initialZoom={1}
                bindToBorders
                style={styles.zoomContainer}
              >
                <View style={{ width: "100%", height: "100%" }}>
                  <Image source={{ uri: previewImage }} style={styles.zoomImage} />
                </View>
              </ReactNativeZoomableView>
            </View>
          </Modal>
        )}

        {/* Dialog */}
        <Modal visible={isDialogVisible || isDeleteDialogVisible} transparent animationType="fade">
          <View
            style={[styles.dialogContainer, { backgroundColor: C.overlayStrong }]}
            testID="edit-delete-inventory-dialog-modal"
          >
            <View style={[styles.dialogBox, SHADOW, { backgroundColor: C.surface }]}>
              <Ionicons name="checkmark-circle" size={36} color={C.success} style={{ marginBottom: 6 }} />
              <TText style={styles.dialogTitle}>Success</TText>
              <TText style={styles.dialogMessage}>{dialogMessage}</TText>
              <TouchableOpacity
                testID="edit-delete-inventory-dialog-ok-btn"
                style={styles.dialogButton}
                onPress={closeDialog}
              >
                <TText style={styles.dialogButtonText}>OK</TText>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Footer */}
        <View style={styles.appFooterWrap} testID="edit-delete-inventory-footer-wrap">
          <AppFooterNav
            items={footerItems}
            selectedSection={selectedSection}
            online={online}
            isDisabledOffline={isDisabledOffline}
            onSelect={onFooterSelect}
            colors={{
              border: C.border,
              accent: C.primaryStrong,
              accentSoft: C.primarySoft,
              muted: C.mutedText,
              disabledText: C.subtleText,
            }}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const createStyles = (C: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: C.surface,
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 13, fontWeight: "700", color: C.text },

  toolbarRow: {
    flexDirection: "row",
    marginLeft: 150,
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  iconAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: C.primarySoft,
  },
  iconLabel: { fontSize: 11, fontWeight: "600" },
  toolbarSpacer: { flex: 1 },
  scrollPad: { padding: 16 },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  cardTitle: { fontSize: 11, fontWeight: "700", color: C.text },

  formGroup: { marginBottom: 12 },
  label: { fontSize: 10, color: C.mutedText, marginBottom: 6, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    backgroundColor: C.surface,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 11,
    color: C.text,
  },
  disabled: { backgroundColor: C.surfaceAlt, color: C.mutedText },
  inputEditable: { backgroundColor: C.surface },

  detailsBox: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    backgroundColor: C.surfaceAlt,
    padding: 12,
  },
  detailsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  detailsTitle: { fontSize: 11, fontWeight: "700", color: C.text },
  detailsBadges: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },

  detailsList: {
    marginTop: 2,
  },
  kvRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  kvLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 10,
    minWidth: 0,
  },
  kvKey: {
    fontSize: 11,
    color: C.mutedText,
    fontWeight: "700",
    flexShrink: 1,
  },
  kvValue: {
    fontSize: 11,
    color: C.text,
    fontWeight: "700",
    textAlign: "right",
    maxWidth: "52%",
  },
  kvMono: { letterSpacing: 0.2 },

  inlineActionsWrap: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  actionBtnText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },

  remarkBubble: { borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, maxWidth: "82%" },
  timestamp: { fontSize: 10, color: C.mutedText, marginTop: 4 },

  filesWrap: { marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  fileThumb: {
    width: 84,
    height: 84,
    borderRadius: 8,
    backgroundColor: C.surfaceAlt,
    overflow: "hidden",
  },
  fileLink: {
    fontSize: 11,
    color: C.primaryStrong,
    textDecorationLine: "underline",
    width: 260,
  },

  composeRow: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  composeInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 14,
    backgroundColor: C.surface,
  },
  attachBtn: { padding: 6 },
  micBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  sendBtn: {
    backgroundColor: C.primaryStrong,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    marginLeft: 4,
  },

  recordingPill: {
    marginTop: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.dangerSoft,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 8,
  },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.danger },
  recordingText: { fontSize: 11, fontWeight: "700", color: C.danger },
  recordingStopBtn: { marginLeft: 2 },

  voiceError: { marginTop: 8, color: C.danger, fontWeight: "800" },

  previewThumb: { width: 64, height: 64, borderRadius: 8 },
  previewBox: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: C.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  previewName: { fontSize: 10, textAlign: "center" },
  thumbClose: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: C.danger,
    borderRadius: 10,
    padding: 2,
    zIndex: 2,
  },

  previewModalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  previewClose: {
    position: "absolute",
    top: 40,
    right: 20,
    zIndex: 2,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 20,
    padding: 6,
  },
  zoomContainer: {
    width: "92%",
    height: "80%",
    justifyContent: "center",
    alignItems: "center",
  },
  zoomImage: { width: "100%", height: "100%", resizeMode: "contain", borderRadius: 12 },

  dialogContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  dialogBox: {
    width: "80%",
    padding: 20,
    backgroundColor: C.surface,
    borderRadius: 12,
    alignItems: "center",
  },
  dialogTitle: { fontSize: 11, fontWeight: "bold", marginBottom: 6, color: C.text },
  dialogMessage: { fontSize: 11, marginBottom: 18, textAlign: "center", color: C.mutedText },
  dialogButton: {
    backgroundColor: C.primaryStrong,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
  },
  dialogButtonText: { color: "#FFF", fontSize: 11, fontWeight: "700" },

  appFooterWrap: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.surface,
  },
});

export default EditDeleteInventory;
