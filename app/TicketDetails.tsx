import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  View,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Image,
  Platform,
  Linking,
  KeyboardAvoidingView,
  Modal,
  AppState,
} from "react-native";
import AppFooterNav, { FooterNavItem } from "./AppFooterNav";

import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as mime from "react-native-mime-types";
import ModalSelector from "@/components/AppModalSelect";
import { ReactNativeZoomableView } from "@openspacelabs/react-native-zoomable-view";

import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
import { authenticatedFetch } from "../utils/auth";

// ✅ Telemetry
import {
  trackScreen,
  trackUI,
  trackNetwork,
  updateDynamicContext,
  clearDynamicContext,
} from "../utils/telemetry";
import TText from "@/components/TText";
import { useSpeechToText } from "@/utils/useSpeechToText";
import { useTheme } from "@/src/theme/ThemeProvider";

type Employee = {
  employee_code: string;
  employee_name: string;
};

interface FileAttachment {
  uri: string;
  name: string;
  type: string;
  file?: File | Blob | null; // web-helper only
}

type PendingItem = {
  tempId: number;
  issue_id: string;
  property_id: string;
  sender_email: string;
  employee_code: string;
  message: string;
  created_at: string;
  reply_to_message_id?: string | number;
  reply_to_text?: string;
  reply_to_engineer_name?: string;
  files: { uri: string; name: string; type: string }[];
};

const TicketDetails = () => {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  const scrollRef = useRef<ScrollView>(null);

  // Params
  const issueId = Array.isArray(params.issue_id) ? params.issue_id[0] : params.issue_id;
  const firstName = Array.isArray(params.first_name) ? params.first_name[0] : params.first_name;
  const lastName = Array.isArray(params.last_name) ? params.last_name[0] : params.last_name;
  const userName = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  const userEmail =
    params.email && Array.isArray(params.email)
      ? params.email[0]
      : params.email || "engineer@datso.io";
  const employee_code = Array.isArray(params.employee_code)
    ? params.employee_code[0]
    : params.employee_code;

  const [replyTo, setReplyTo] = useState<any>(null);
  const [ticketDetails, setTicketDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [requestedToClose, setRequestedToClose] = useState(false);
  const [newUpdateFiles, setNewUpdateFiles] = useState<FileAttachment[]>([]);
  const [hasClosed, setHasClosed] = useState(false);
  const [hasRequestedClose, setHasRequestedClose] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  // 🧠 OFFLINE
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const CACHE_DETAILS_KEY = `ticket:details:${issueId}`;
  const CACHE_CHATS_KEY = `ticket:chats:${issueId}`;
  const CACHE_PENDING_KEY = `ticket:pending:${issueId}`;

  // UI state — collapsed by default
  const [infoExpanded, setInfoExpanded] = useState(false);

  // avoid spamming the same prompt on rapid state flips
  const hasPromptedRef = useRef<boolean>(false);

  // ✅ Voice-to-text state
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const { isListening, startListening: startSpeechToText, stopListening: stopSpeechToText } =
    useSpeechToText({
      lang: "en-IN",
      continuous: false,
      interimResults: true,
      stopOnFinal: true,
      onFinalTranscript: (text) => {
        setNewMessage((prev) => (prev ? `${prev} ${text}` : text));
      },
      onError: (message) => {
        setVoiceError(message);
        Alert.alert("Voice input", message);
      },
    });

  const footerItems: FooterNavItem[] = [
    { id: 0, title: "Back", iconName: "arrow-back-outline" },
    { id: 2, title: "Schedules", iconName: "calendar-outline" },
    { id: 3, title: "Inventory", iconName: "list-outline" },
    { id: 4, title: "Labour", iconName: "people-outline" },
    { id: 5, title: "Documents", iconName: "document-text-outline" },
    { id: 7, title: "Review", iconName: "construct-outline" },
  ];

  const COLORS = {
    border: "#E6EAF2",
    accent: "#2C7BE5",
    accentSoft: "#E8F1FF",
    muted: "#6B7A90",
    disabledText: "#9AA0A6",
  };

  const propertyId = useMemo(() => {
    const p = ticketDetails?.property_id;
    return p ? String(p) : "";
  }, [ticketDetails?.property_id]);

  const projectId = useMemo(() => {
    const v = ticketDetails?.project_id;
    return v ? String(v) : "";
  }, [ticketDetails?.project_id]);

  const propertyName = useMemo(() => {
    const v = ticketDetails?.property_name;
    return v ? String(v) : "";
  }, [ticketDetails?.property_name]);

  const projectLocation = useMemo(() => {
    const v = ticketDetails?.project_location;
    return v ? String(v) : "";
  }, [ticketDetails?.project_location]);

  const userDetails = useMemo(() => {
    return {
      first_name: firstName || "",
      last_name: lastName || "",
      email: userEmail || "",
      employee_code: employee_code || "",
    };
  }, [firstName, lastName, userEmail, employee_code]);

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

  const options = useMemo(
    () => [
      { key: "camera", label: "Take Photo" },
      { key: "gallery", label: "Choose from Gallery" },
      { key: "documents", label: "Pick a Document" },
    ],
    []
  );

  // Storage helper
  const storage = {
    getItem: async (key: string) => {
      try {
        const v = await AsyncStorage.getItem(key);
        if (v != null) return v;
      } catch {}
      if (typeof window !== "undefined" && (window as any).localStorage) {
        return (window as any).localStorage.getItem(key);
      }
      return null;
    },
    setItem: async (key: string, value: string) => {
      try {
        await AsyncStorage.setItem(key, value);
      } catch {
        if (typeof window !== "undefined" && (window as any).localStorage) {
          (window as any).localStorage.setItem(key, value);
        }
      }
    },
    removeItem: async (key: string) => {
      try {
        await AsyncStorage.removeItem(key);
      } catch {
        if (typeof window !== "undefined" && (window as any).localStorage) {
          (window as any).localStorage.removeItem(key);
        }
      }
    },
  };

  // ✅ Telemetry
  useEffect(() => {
    updateDynamicContext({
      screen: "TicketDetails",
      issueId: issueId ? String(issueId) : "",
    });

    trackScreen("TicketDetails", {
      has_issue_id: !!issueId,
      is_online: isOnline,
      platform: Platform.OS,
    });

    return () => {
      clearDynamicContext();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startListening = async () => {
    setVoiceError(null);
    await startSpeechToText();
  };

  const stopListening = async () => {
    await stopSpeechToText();
  };

  const toggleListening = () => {
    if (isListening) stopListening();
    else startListening();
  };

  // Connectivity listener
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state: NetInfoState) => {
      const connected = state.isConnected === true;
      setIsOnline(connected);
      setIsConnected(state.isConnected);
      trackUI({
        screen: "TicketDetails",
        element: "connectivity",
        action: "change",
        extra: { online: connected },
      });
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    NetInfo.fetch().then((state) => {
      const connected = state.isConnected === true;
      setIsOnline(connected);
      setIsConnected(state.isConnected);
      trackUI({
        screen: "TicketDetails",
        element: "connectivity_initial",
        action: "submit",
        extra: { online: connected },
      });
    });
  }, []);

  // Foreground → prompt to flush pending
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (s) => {
      if (s === "active") {
        const pendingCount = await getPendingCount();
        if (pendingCount) {
          trackUI({
            screen: "TicketDetails",
            element: "app_foreground_pending_detected",
            action: "submit",
            extra: { pending_count: pendingCount },
          });
          maybePromptToFlush();
        }
      }
    });
    return () => sub.remove();
  }, []);

  const countFileKinds = (files: { type?: string; name?: string }[]) => {
    let images = 0,
      pdf = 0,
      other = 0;
    for (const f of files || []) {
      const t = (f?.type || "").toLowerCase();
      if (t.startsWith("image/")) images += 1;
      else if (t === "application/pdf") pdf += 1;
      else other += 1;
    }
    return { images, pdf, other, total: (files || []).length };
  };

  // Cache helpers
  const cacheDetails = async (details: any, assigns: Employee[], requestedFlag: boolean) => {
    await storage.setItem(
      CACHE_DETAILS_KEY,
      JSON.stringify({
        ticket: details,
        assignments: assigns,
        requested_to_close: requestedFlag,
        cached_at: Date.now(),
      })
    );
  };

  const cacheChats = async (chats: any[]) => {
    await storage.setItem(CACHE_CHATS_KEY, JSON.stringify({ chats, cached_at: Date.now() }));
  };

  const sanitizeFilesForQueue = (files: FileAttachment[]) =>
    (files || []).map((f) => ({ uri: f.uri, name: f.name, type: f.type }));

  const getPending = async (): Promise<PendingItem[]> => {
    const raw = await storage.getItem(CACHE_PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingItem[]) : [];
  };

  const getPendingCount = async (): Promise<number> => (await getPending()).length;

  const setPending = async (items: PendingItem[]) => {
    await storage.setItem(CACHE_PENDING_KEY, JSON.stringify(items));
  };

  const enqueuePending = async (item: PendingItem) => {
    const list = await getPending();
    list.push(item);
    await setPending(list);
    trackUI({
      screen: "TicketDetails",
      element: "offline_queue_enqueue",
      action: "submit",
      extra: {
        pending_count: list.length,
        attachments: countFileKinds(item.files),
        has_reply: !!item.reply_to_message_id,
      },
    });
  };

  useEffect(() => {
    const run = async () => {
      const count = await getPendingCount();
      if (isOnline && count > 0) {
        maybePromptToFlush();
      } else {
        hasPromptedRef.current = false;
      }
    };
    run();
  }, [isOnline]);

  const maybePromptToFlush = async () => {
    if (hasPromptedRef.current) return;
    const count = await getPendingCount();
    if (!count) return;

    hasPromptedRef.current = true;

    Alert.alert("Back Online", `You're back on the internet. Send ${count} queued message(s) now?`, [
      {
        text: "Later",
        style: "cancel",
        onPress: () => {
          setTimeout(() => (hasPromptedRef.current = false), 1500);
        },
      },
      {
        text: "Send now",
        onPress: async () => {
          const sent = await flushPending();
          if (isOnline) await fetchChatMessages();
          Alert.alert("Queue", `Sent ${sent} message(s).`);
          setTimeout(() => (hasPromptedRef.current = false), 1500);
        },
      },
    ]);
  };

  const flushPending = async (): Promise<number> => {
    if (!isOnline) return 0;
    let list = await getPending();
    if (!list.length) return 0;

    const succeededTempIds: number[] = [];

    for (const item of list) {
      const t0 = Date.now();
      try {
        const formData = new FormData();
        formData.append("issue_id", item.issue_id);
        formData.append("property_id", item.property_id ?? "");
        formData.append("sender_email", item.sender_email);
        formData.append("employee_code", item.employee_code ?? "Unknown User");
        formData.append("message", item.message || "");

        if (item.reply_to_message_id) {
          formData.append("reply_to_message_id", String(item.reply_to_message_id));
          if (item.reply_to_text) formData.append("reply_to_text", item.reply_to_text);
          if (item.reply_to_engineer_name) {
            formData.append("reply_to_engineer_name", item.reply_to_engineer_name);
          }
        }

        for (const file of item.files || []) {
          const fileName = file.name || `file_${Date.now()}`;
          const fileType = (file.type ||
            mime.lookup(fileName) ||
            "application/octet-stream") as string;

          if (Platform.OS === "web") {
            try {
              const resp = await fetch(file.uri);
              const blob = await resp.blob();
              formData.append("files", new File([blob], fileName, { type: fileType }));
            } catch {}
          } else {
            formData.append("files", {
              uri: Platform.OS === "android" ? file.uri : file.uri.replace("file://", ""),
              name: fileName,
              type: fileType,
            } as any);
          }
        }

        const response = await authenticatedFetch(`${APP_API_BASE_URL}/ticket-chat/send`, {
          method: "POST",
          body: formData,
        });

        let result: any = null;
        try {
          result = await response.json();
        } catch {}

        trackNetwork({
          url: "/ticket-chat/send",
          method: "POST",
          status: response.status,
          ok: response.ok,
          durationMs: Date.now() - t0,
          extra: { from_queue: true },
        });

        if (response.ok && result?.chat_id) {
          succeededTempIds.push(item.tempId);
        }
      } catch {
        // keep it in queue
      }
    }

    if (succeededTempIds.length) {
      list = list.filter((p) => !succeededTempIds.includes(p.tempId));
      await setPending(list);
    }

    return succeededTempIds.length;
  };

  const fetchDetails = async () => {
    const t0 = Date.now();
    try {
      if (!isOnline) throw new Error("offline");

      const url = `${APP_API_BASE_URL}/tickets/${issueId}`;
      const response = await authenticatedFetch(url);

      trackNetwork({
        url: `/tickets/${String(issueId)}`,
        method: "GET",
        status: response.status,
        ok: response.ok,
        durationMs: Date.now() - t0,
        extra: {},
      });

      if (!response.ok) throw new Error("network");
      const data = await response.json();
      const hydratedTicket = {
        ...(data.ticket || {}),
        files: Array.isArray(data.files) ? data.files : [],
      };

      setTicketDetails(hydratedTicket);
      setRequestedToClose(data.ticket.requested_to_close || false);
      setEmployees(data.assignments || []);
      await cacheDetails(
        hydratedTicket,
        data.assignments || [],
        data.ticket.requested_to_close || false
      );
    } catch (err) {
      const cached = await storage.getItem(CACHE_DETAILS_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        setTicketDetails(parsed.ticket);
        setRequestedToClose(parsed.requested_to_close || false);
        setEmployees(parsed.assignments || []);
      } else {
        console.error("❌ Error fetching ticket details and no cache found:", err);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchChatMessages = async () => {
    const t0 = Date.now();
    try {
      if (!isOnline) throw new Error("offline");

      const url = `${APP_API_BASE_URL}/ticket-chat/list/${issueId}`;
      const response = await authenticatedFetch(url);

      if (!response.ok) throw new Error("network");

      const data = await response.json();
      let chats = Array.isArray(data.chats) ? data.chats : [];

      const chatMap = Object.fromEntries(chats.map((m: any) => [m.chat_id, m]));
      chats = chats.map((msg: any) => {
        if (msg.reply_to_message_id && (!msg.reply_to_text || !msg.reply_to_engineer_name)) {
          const repliedMsg = chatMap[msg.reply_to_message_id];
          if (repliedMsg) {
            return {
              ...msg,
              reply_to_text: repliedMsg.message,
              reply_to_engineer_name: repliedMsg.sender_name,
            };
          }
        }
        return msg;
      });

      setChatMessages(chats);
      await cacheChats(chats);

      trackNetwork({
        url: `/ticket-chat/list/${String(issueId)}`,
        method: "GET",
        status: response.status,
        ok: true,
        durationMs: Date.now() - t0,
        extra: { chats_count: chats.length },
      });
    } catch (err) {
      const cached = await storage.getItem(CACHE_CHATS_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        const cachedChats = Array.isArray(parsed.chats) ? parsed.chats : [];
        setChatMessages(cachedChats);
      } else {
        console.error("❌ Failed to fetch chat messages and no cache found:", err);
      }
    }
  };

  useEffect(() => {
    if (issueId) {
      fetchDetails();
      fetchChatMessages();
    }
  }, [issueId, isOnline]);

  useEffect(() => {
    if (chatMessages.length > 0) {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: false });
      }, 300);
    }
  }, [chatMessages]);

  const getStatusPill = (statusRaw: string) => {
    const status = (statusRaw || "").toLowerCase().trim();
    if (status === "open") return { bg: "#D1F2EB", fg: "#218838", label: "OPEN" };
    if (status === "closed") return { bg: "#FADBD8", fg: "#C0392B", label: "CLOSED" };
    if (status === "reopen") return { bg: "#FFFACD", fg: "#7A6907", label: "REOPEN" };
    if (status.includes("request")) return { bg: "#FFE8CC", fg: "#FF8000", label: "REQUEST" };
    return {
      bg: "#E2E3E5",
      fg: "#6C757D",
      label: (statusRaw || "UNKNOWN").toUpperCase(),
    };
  };

  const formatFileName = (propertyId: string, originalName: string): string => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const dd = pad(now.getDate());
    const mm = pad(now.getMonth() + 1);
    const yyyy = now.getFullYear();
    let hh = now.getHours();
    const min = pad(now.getMinutes());
    const sec = pad(now.getSeconds());
    const ampm = hh >= 12 ? "pm" : "am";
    hh = hh % 12 || 12;
    const time = `${pad(hh)}-${min}-${sec}_${ampm}`;
    const date = `${dd}-${mm}-${yyyy}`;
    const ext = (originalName.match(/\.[0-9a-z]+$/i) || [""])[0];
    return `${propertyId}_${date}_${time}${ext}`;
  };

  const pickImageFromCamera = async () => {
    trackUI({
      screen: "TicketDetails",
      element: "attach_camera",
      action: "open",
      extra: { platform: Platform.OS },
    });

    if (Platform.OS === "web") {
      Alert.alert("Web", "Camera capture on web is already in your older code. Use gallery/documents here.");
      return;
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });

    if (!result.canceled && result.assets.length > 0) {
      const files: FileAttachment[] = result.assets.map((asset) => ({
        uri: asset.uri,
        name: formatFileName(ticketDetails?.property_id || "UNKNOWN", asset.fileName || "camera.jpg"),
        type: "image/jpeg",
      }));
      setNewUpdateFiles((prev) => [...prev, ...files]);
    }
  };

  const pickImageFromGallery = async () => {
    trackUI({
      screen: "TicketDetails",
      element: "attach_gallery",
      action: "open",
      extra: { platform: Platform.OS },
    });

    if (Platform.OS === "web") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.multiple = true;
      input.onchange = () => {
        const files: FileAttachment[] = Array.from(input.files || []).map((file) => ({
          uri: URL.createObjectURL(file),
          name: formatFileName(ticketDetails?.property_id || "UNKNOWN", file.name || "gallery.jpg"),
          type: file.type || "image/jpeg",
          file,
        }));
        setNewUpdateFiles((prev) => [...prev, ...files]);
      };
      input.click();
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: 0,
    });

    if (!result.canceled && result.assets.length > 0) {
      const files: FileAttachment[] = result.assets.map((asset) => ({
        uri: asset.uri,
        name: formatFileName(ticketDetails?.property_id || "UNKNOWN", asset.fileName || "gallery.jpg"),
        type: "image/jpeg",
      }));
      setNewUpdateFiles((prev) => [...prev, ...files]);
    }
  };

  const pickDocuments = async () => {
    trackUI({
      screen: "TicketDetails",
      element: "attach_documents",
      action: "open",
      extra: { platform: Platform.OS },
    });

    if (Platform.OS === "web") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "*/*";
      input.multiple = true;
      input.onchange = () => {
        const files: FileAttachment[] = Array.from(input.files || []).map((file) => ({
          uri: URL.createObjectURL(file),
          name: formatFileName(ticketDetails?.property_id || "UNKNOWN", file.name || "file.txt"),
          type:
            file.type ||
            (mime.lookup(file.name) as string) ||
            "application/octet-stream",
          file,
        }));
        setNewUpdateFiles((prev) => [...prev, ...files]);
      };
      input.click();
      return;
    }

    const result = await DocumentPicker.getDocumentAsync({ type: "*/*", multiple: true });
    if (!result.canceled && result.assets.length > 0) {
      const files: FileAttachment[] = result.assets.map((file) => ({
        uri: file.uri,
        name: formatFileName(ticketDetails?.property_id || "UNKNOWN", file.name || "file.txt"),
        type:
          file.mimeType ||
          (mime.lookup(file.name) as string) ||
          "application/octet-stream",
      }));
      setNewUpdateFiles((prev) => [...prev, ...files]);
    }
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
        `${year}-${month}-${day}T${String(hours).padStart(2, "0")}:${String(
          minutes
        ).padStart(2, "0")}:${String(seconds || 0).padStart(2, "0")}`
      );
    } catch {
      return new Date();
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() && newUpdateFiles.length === 0) {
      Alert.alert("Error", "Please enter a message or attach a file.");
      return;
    }

    if (isListening) await stopListening();

    const issue_id = String(issueId);
    const property_id = ticketDetails?.property_id ?? "";
    const sender_email = userEmail;
    const emp_code = employee_code ?? "Unknown User";
    const message = newMessage.trim();

    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();
    let hh = now.getHours();
    const MIN = String(now.getMinutes()).padStart(2, "0");
    const SS = String(now.getSeconds()).padStart(2, "0");
    const AMPM = hh >= 12 ? "PM" : "AM";
    hh = hh % 12 || 12;
    const formattedDate = `${dd}-${mm}-${yyyy}, ${hh}:${MIN}:${SS} ${AMPM}`;

    const tempId = Date.now();

    const queuedFiles = sanitizeFilesForQueue(newUpdateFiles);
    const queuedReply = replyTo;
    const sendingFiles = [...newUpdateFiles];

    if (!isOnline) {
      await enqueuePending({
        tempId,
        issue_id,
        property_id,
        sender_email,
        employee_code: emp_code,
        message,
        created_at: formattedDate,
        reply_to_message_id: queuedReply?.chat_id,
        reply_to_text: queuedReply?.message,
        reply_to_engineer_name: queuedReply?.sender_name,
        files: queuedFiles,
      });

      setNewMessage("");
      setNewUpdateFiles([]);
      setReplyTo(null);

      Alert.alert("Saved Offline", "Message queued. When you're back online, you'll be prompted to send it.");
      return;
    }

    // optimistic UI
    const tempChat = {
      chat_id: tempId,
      is_temp: true,
      sender_email,
      sender_name: userName || sender_email,
      message,
      created_at: formattedDate,
      reply_to_message_id: queuedReply?.chat_id,
      reply_to_text: queuedReply?.message,
      reply_to_engineer_name: queuedReply?.sender_name,
      files: sendingFiles.map((f) => ({
        file_url: f.uri,
        file_name: f.name,
        file_type: f.type,
      })),
    };

    setChatMessages((prev) => [...prev, tempChat]);

    const cachedChatsRaw = await storage.getItem(CACHE_CHATS_KEY);
    if (cachedChatsRaw) {
      const parsed = JSON.parse(cachedChatsRaw);
      parsed.chats = [...(Array.isArray(parsed.chats) ? parsed.chats : []), tempChat];
      await storage.setItem(CACHE_CHATS_KEY, JSON.stringify(parsed));
    } else {
      await cacheChats([tempChat]);
    }

    setNewMessage("");
    setNewUpdateFiles([]);
    setReplyTo(null);

    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);

    const t0 = Date.now();
    try {
      const formData = new FormData();
      formData.append("issue_id", issue_id);
      formData.append("property_id", property_id);
      formData.append("sender_email", sender_email);
      formData.append("employee_code", emp_code);
      formData.append("message", message);

      if (queuedReply) {
        formData.append("reply_to_message_id", String(queuedReply.chat_id));
        formData.append("reply_to_text", String(queuedReply.message || ""));
        formData.append("reply_to_engineer_name", String(queuedReply.sender_name || ""));
      }

      for (const file of sendingFiles) {
        const fileUri = Platform.OS === "android" ? file.uri : file.uri.replace("file://", "");
        const fileName = file.name || `file_${Date.now()}`;
        const fileType = (file.type ||
          (mime.lookup(fileName) as string) ||
          "application/octet-stream") as string;

        if (Platform.OS === "web") {
          try {
            let blob: Blob | null = (file as any).file ? ((file as any).file as Blob) : null;
            if (!blob) {
              const resp = await fetch(fileUri);
              blob = await resp.blob();
            }
            formData.append("files", new File([blob!], fileName, { type: fileType }));
          } catch {}
        } else {
          formData.append("files", {
            uri: fileUri,
            name: fileName,
            type: fileType,
          } as any);
        }
      }

      const response = await authenticatedFetch(`${APP_API_BASE_URL}/ticket-chat/send`, {
        method: "POST",
        body: formData,
      });

      let result: any = null;
      try {
        result = await response.json();
      } catch {}

      trackNetwork({
        url: "/ticket-chat/send",
        method: "POST",
        status: response.status,
        ok: response.ok,
        durationMs: Date.now() - t0,
        extra: {},
      });

      if (!response.ok || !result?.chat_id) throw new Error("Failed API");

      setChatMessages((prev) =>
        prev.map((m) =>
          m.chat_id === tempId ? { ...m, chat_id: result.chat_id, is_temp: false } : m
        )
      );

      const cached = await storage.getItem(CACHE_CHATS_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        parsed.chats = parsed.chats?.map((m: any) =>
          m.chat_id === tempId ? { ...m, chat_id: result.chat_id, is_temp: false } : m
        );
        await storage.setItem(CACHE_CHATS_KEY, JSON.stringify(parsed));
      }
    } catch (err) {
      await enqueuePending({
        tempId,
        issue_id,
        property_id,
        sender_email,
        employee_code: emp_code,
        message,
        created_at: formattedDate,
        reply_to_message_id: queuedReply?.chat_id,
        reply_to_text: queuedReply?.message,
        reply_to_engineer_name: queuedReply?.sender_name,
        files: queuedFiles,
      });
      Alert.alert(
        "Saved Offline",
        "Message queued due to a temporary error. You'll be prompted to send it shortly."
      );
    }
  };

  const closeTicket = async () => {
    const t0 = Date.now();
    trackUI({
      screen: "TicketDetails",
      element: "close_ticket",
      action: "click",
      extra: { is_online: isOnline },
    });

    try {
      if (!isOnline) throw new Error("You are offline. Try again when online.");
      const response = await authenticatedFetch(`${APP_API_BASE_URL}/tickets/${issueId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ employee_code } as any).toString(),
      });
      const result = await response.json();

      trackNetwork({
        url: `/tickets/${String(issueId)}/close`,
        method: "POST",
        status: response.status,
        ok: response.ok,
        durationMs: Date.now() - t0,
        extra: {},
      });

      if (!response.ok) throw new Error(result.message || "Close failed");

      Alert.alert("Ticket Closed", result.message);
      setHasClosed(true);
      setTicketDetails((prev: any) => ({ ...prev, status: "Closed" }));
      await cacheDetails({ ...ticketDetails, status: "Closed" }, employees, requestedToClose);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Something went wrong");
    }
  };

  const requestCloseTicket = async () => {
    const t0 = Date.now();
    trackUI({
      screen: "TicketDetails",
      element: "request_close",
      action: "click",
      extra: { is_online: isOnline },
    });

    try {
      if (!isOnline) throw new Error("You are offline. Try again when online.");
      const response = await authenticatedFetch(`${APP_API_BASE_URL}/tickets/${issueId}/request-close`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ employee_code } as any).toString(),
      });
      const result = await response.json();

      trackNetwork({
        url: `/tickets/${String(issueId)}/request-close`,
        method: "POST",
        status: response.status,
        ok: response.ok,
        durationMs: Date.now() - t0,
        extra: {},
      });

      if (!response.ok) throw new Error(result.message || "Request failed");

      Alert.alert("Request Submitted", result.message);
      setHasRequestedClose(true);
      setTicketDetails((prev: any) => ({ ...prev, status: "Request to Close" }));
      await cacheDetails({ ...ticketDetails, status: "Request to Close" }, employees, true);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Something went wrong");
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={C.primaryStrong} />
        <TText>Loading ticket details...</TText>
      </View>
    );
  }

  if (!ticketDetails) {
    return (
      <View style={styles.centered}>
        <TText>No details found for Issue {issueId}</TText>
      </View>
    );
  }

  const statusPill = getStatusPill(ticketDetails.status || "Open");

  const canClose =
    ticketDetails.status !== "Closed" &&
    !hasClosed &&
    (ticketDetails.reported_by_email === userEmail || ticketDetails.reported_by_email === userName);

  const canRequestClose =
    !hasRequestedClose &&
    employees.some((emp) => emp.employee_code === employee_code) &&
    ticketDetails.reported_by_email !== userEmail &&
    (ticketDetails.status || "").toLowerCase() !== "request to close";

  const renderChatFile = (file: any, keyPrefix: string, index: number) => {
    const isImage = file.file_type?.startsWith("image/");
    const isPDF = file.file_type === "application/pdf";

    if (isImage) {
      return (
        <TouchableOpacity
          key={`${keyPrefix}_img_${index}`}
          onPress={() => setPreviewImage(file.file_url)}
          activeOpacity={0.9}
          style={styles.chatFileImageWrap}
        >
          <Image source={{ uri: file.file_url }} style={styles.chatFileImage} resizeMode="cover" />
        </TouchableOpacity>
      );
    }

    if (isPDF) {
      return (
        <TouchableOpacity
          key={`${keyPrefix}_pdf_${index}`}
          onPress={() => router.push({ pathname: "/PDFViewer", params: { url: file.file_url } })}
          style={styles.chatFileDocRow}
        >
          <TText style={styles.chatFileDocIcon}>📄</TText>
          <TText style={styles.chatFileDocName} numberOfLines={2}>
            {file.file_name}
          </TText>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        key={`${keyPrefix}_file_${index}`}
        onPress={() => Linking.openURL(file.file_url)}
        style={styles.chatFileDocRow}
      >
        <TText style={styles.chatFileDocIcon}>⬇️</TText>
        <TText style={styles.chatFileDocName} numberOfLines={2}>
          {file.file_name}
        </TText>
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.keyboard}
      keyboardVerticalOffset={Platform.OS === "ios" ? 95 : 0} testID="ticket-details-root"
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.headerContainer}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={C.text} />
          </TouchableOpacity>

          <TText style={styles.headerTitle}>
            Ticket Details{isOnline ? "" : " • Offline"}
          </TText>

          <TouchableOpacity onPress={() => router.push("/HomeScreen")}>
            <Ionicons name="home" size={22} color={C.text} />
          </TouchableOpacity>
        </View>

        {/* Main content */}
        <View style={styles.content}>
          {/* Top fixed-ish section */}
          <View style={styles.topSection}>
            <View style={styles.ticketCard}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setInfoExpanded((v) => !v)}
                style={styles.ticketTopRow}
              >
                <TText style={styles.ticketTitle}>Ticket Information</TText>

                <View style={[styles.statusPill, { backgroundColor: statusPill.bg }]}>
                  <TText style={[styles.statusText, { color: statusPill.fg }]}>
                    {statusPill.label}
                  </TText>
                </View>

                <Ionicons
                  name={infoExpanded ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={C.mutedText}
                  style={{ marginLeft: 8 }}
                />
              </TouchableOpacity>

              <View style={styles.ticketIdsRow}>
                <TText style={styles.ticketSubId}>#{issueId}</TText>
                <View style={styles.dot} />
                <TText style={styles.ticketSubId}>#{ticketDetails.property_id || "UNKNOWN"}</TText>
              </View>

              <View style={styles.ticketMetaRow}>
                <View style={styles.metaItem}>
                  <Ionicons name="clipboard-outline" size={16} color={C.mutedText} />
                  <TText style={styles.metaText}>{ticketDetails.issue_type_name || "Type"}</TText>
                </View>

                <View style={styles.metaDivider} />

                <View style={styles.metaItem}>
                  <Ionicons name="alert-circle-outline" size={16} color={C.mutedText} />
                  <TText style={styles.metaText}>{ticketDetails.severity || "Severity"}</TText>
                </View>

                <View style={styles.metaDivider} />

                <View style={styles.metaItem}>
                  <Ionicons name="flag-outline" size={16} color={C.mutedText} />
                  <TText style={styles.metaText}>{ticketDetails.priority || "Priority"}</TText>
                </View>
              </View>

              {infoExpanded && (
                <View style={styles.ticketExpanded}>
                  <InfoLine label="Description" value={ticketDetails.description || "-"} />
                  <InfoLine label="Approx. Close Date" value={ticketDetails.approximate_date || "-"} />
                  <InfoLine
                    label="Assigned To"
                    value={
                      employees.length > 0
                        ? employees.map((e) => e.employee_name).join(", ")
                        : "Not Assigned"
                    }
                  />
                  <InfoLine label="Reported By" value={ticketDetails.reported_by_email || "-"} />
                </View>
              )}
            </View>

            {ticketDetails.status !== "Closed" && !hasClosed && (
              <TouchableOpacity
                style={[styles.bigCloseBtn, { opacity: isOnline ? 1 : 0.6 }]}
                onPress={canClose ? closeTicket : canRequestClose ? requestCloseTicket : closeTicket}
                disabled={!isOnline}
                activeOpacity={0.9}
              >
                <TText style={styles.bigCloseBtnText}>
                  {canClose ? "Close Ticket" : canRequestClose ? "Request to Close" : "Close Ticket"}
                </TText>
              </TouchableOpacity>
            )}
          </View>

          {/* Chat section takes remaining space */}
          <View style={styles.chatCard}>
            <TText style={styles.chatTitle}>Chat</TText>

            <ScrollView
              ref={scrollRef}
              style={styles.chatScroll}
              contentContainerStyle={styles.chatScrollContent}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {ticketDetails.files?.length > 0 && (
                <View style={styles.msgWrap}>
                  <View style={[styles.msgRow, styles.msgRowLeft]}>
                    <View style={[styles.msgBubble, styles.msgBubbleOther, { maxWidth: "78%" }]}>
                      <TText style={[styles.msgName, styles.msgNameOther]}>
                        📎 Ticket Attachments
                      </TText>
                      {ticketDetails.files.map((file: any, i: number) =>
                        renderChatFile(file, "ticket_file", i)
                      )}
                    </View>
                  </View>
                </View>
              )}

              {chatMessages.map((msg: any, idx: number) => {
                const isMine = msg.sender_email === userEmail;

                let dateObj = new Date(msg.created_at);
                if (isNaN(dateObj.getTime())) dateObj = parseCustomDate(msg.created_at);

                const timeLabel = dateObj.toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                });

                const displayName = isMine ? userName || "You" : msg.sender_name || "Unknown";
                const hasFiles = Array.isArray(msg.files) && msg.files.length > 0;

                return (
                  <TouchableOpacity
                    key={String(msg.chat_id ?? idx)}
                    activeOpacity={0.85}
                    onLongPress={() => setReplyTo(msg)}
                    style={styles.msgWrap}
                  >
                    <View style={[styles.msgRow, isMine ? styles.msgRowRight : styles.msgRowLeft]}>
                      <View
                        style={[
                          styles.msgBubble,
                          isMine ? styles.msgBubbleMine : styles.msgBubbleOther,
                        ]}
                      >
                        <TText style={[styles.msgName, isMine ? styles.msgNameMine : styles.msgNameOther]}>
                          {displayName}
                        </TText>

                        {!!msg.reply_to_message_id && (
                          <View
                            style={[
                              styles.replyPreview,
                              isMine ? styles.replyPreviewMine : styles.replyPreviewOther,
                            ]}
                          >
                            <TText
                              style={[
                                styles.replyName,
                                isMine ? styles.replyNameMine : styles.replyNameOther,
                              ]}
                            >
                              {msg.reply_to_engineer_name || "Unknown"}
                            </TText>
                            <TText
                              numberOfLines={2}
                              style={[
                                styles.replyText,
                                isMine ? styles.replyTextMine : styles.replyTextOther,
                              ]}
                            >
                              {msg.reply_to_text || ""}
                            </TText>
                          </View>
                        )}

                        {!!msg.message && (
                          <TText style={styles.msgBody}>{String(msg.message).trim()}</TText>
                        )}

                        {hasFiles &&
                          msg.files.map((file: any, i: number) =>
                            renderChatFile(file, `${msg.chat_id}`, i)
                          )}
                      </View>
                    </View>

                    <TText style={[styles.msgTime, isMine ? styles.msgTimeRight : styles.msgTimeLeft]}>
                      {timeLabel}
                    </TText>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {newUpdateFiles.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.attachStrip}
                contentContainerStyle={{ paddingRight: 6 }}
              >
                {newUpdateFiles.map((file, idx) => (
                  <View key={idx} style={styles.attachThumbWrap}>
                    {file.type.startsWith("image/") ? (
                      <Image source={{ uri: file.uri }} style={styles.attachThumbImg} />
                    ) : (
                      <View style={styles.attachThumbDoc}>
                        <TText style={styles.attachThumbDocText} numberOfLines={1}>
                          📄 {file.name}
                        </TText>
                      </View>
                    )}

                    <TouchableOpacity
                      onPress={() => setNewUpdateFiles((prev) => prev.filter((_, i) => i !== idx))}
                      style={styles.attachRemove}
                    >
                      <Ionicons name="close" size={14} color={C.white} />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}

            {replyTo && (
              <View style={styles.replyBar}>
                <View style={{ flex: 1 }}>
                  <TText style={styles.replyBarTitle}>
                    Replying to {replyTo.sender_name || "Unknown"}
                  </TText>
                  <TText numberOfLines={1} style={styles.replyBarSnippet}>
                    {replyTo.message}
                  </TText>
                </View>
                <TouchableOpacity onPress={() => setReplyTo(null)} style={styles.replyBarClose}>
                  <Ionicons name="close" size={18} color={C.primaryStrong} />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.composerRow}>
              <TextInput
                style={styles.composerInput}
                placeholder={isOnline ? "Type your update..." : "Offline, message will be queued"}
                placeholderTextColor={C.subtleText}
                value={newMessage}
                onChangeText={setNewMessage}
                multiline
                textAlignVertical="top"
              />

              <ModalSelector
                data={options}
                initValue=""
                onChange={async (option: any) => {
                  if (option.key === "camera") await pickImageFromCamera();
                  else if (option.key === "gallery") await pickImageFromGallery();
                  else if (option.key === "documents") await pickDocuments();
                }}
                style={{ marginHorizontal: 6 }}
                selectStyle={{ borderWidth: 0 }}
                optionContainerStyle={{ backgroundColor: C.surface, borderBottomColor: C.border }}
                optionTextStyle={{ fontSize: 10, color: C.text, textTransform: "uppercase" }}
                cancelStyle={{ backgroundColor: C.surface }}
                cancelTextStyle={{ color: C.text }}
                overlayStyle={{ backgroundColor: C.overlay }}
                cancelText="Cancel"
              >
                <TouchableOpacity style={styles.iconBtn}>
                  <Ionicons name="attach" size={22} color={C.mutedText} />
                </TouchableOpacity>
              </ModalSelector>

              <TouchableOpacity style={styles.micBtn} onPress={toggleListening} activeOpacity={0.8}>
                <Ionicons
                  name={isListening ? "mic" : "mic-outline"}
                  size={22}
                  color={isListening ? C.danger : C.primaryStrong}
                />
              </TouchableOpacity>

              {isListening && (
                <View style={styles.recordingPill}>
                  <View style={styles.recordingDot} />
                  <TText style={styles.recordingText}>Recording...</TText>
                  <TouchableOpacity
                    onPress={stopListening}
                    style={styles.recordingStopBtn}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="stop-circle" size={18} color={C.danger} />
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity style={styles.sendBtn} onPress={handleSendMessage} activeOpacity={0.85}>
                <Ionicons name="send" size={20} color={C.white} />
              </TouchableOpacity>
            </View>

            {!!voiceError && <TText style={styles.voiceError}>{voiceError}</TText>}
          </View>
        </View>
      </View>

      {previewImage && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
          <View style={styles.previewOverlay}>
            <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewImage(null)}>
              <Ionicons name="close-circle" size={38} color={C.white} />
            </TouchableOpacity>

            <ReactNativeZoomableView
              maxZoom={3}
              minZoom={1}
              zoomStep={0.5}
              initialZoom={1}
              bindToBorders
              style={styles.previewZoom}
            >
              <Image source={{ uri: previewImage }} style={styles.previewImg} />
            </ReactNativeZoomableView>
          </View>
        </Modal>
      )}

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
    </KeyboardAvoidingView>
  );
};

const InfoLine = ({ label, value }: { label: string; value: any }) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  return (
    <View style={styles.infoLine}>
      <TText style={styles.infoLineLabel}>{label}</TText>
      <TText style={styles.infoLineValue}>{String(value ?? "-")}</TText>
    </View>
  );
};

const createStyles = (C: any) => StyleSheet.create({
  keyboard: {
    flex: 1,
    backgroundColor: C.bg,
  },

  container: {
    flex: 1,
    backgroundColor: C.bg,
  },

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

  content: {
    flex: 1,
    padding: 14,
    paddingBottom: 0, // reserve space for footer nav
    minHeight: 0,
  },

  topSection: {
    marginBottom: 12,
  },

  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  ticketCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },

  ticketTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  ticketTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: C.text,
  },

  statusPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },

  statusText: {
    fontWeight: "700",
    letterSpacing: 0.8,
    fontSize: 10,
  },

  ticketIdsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },

  ticketSubId: {
    color: C.mutedText,
    fontWeight: "600",
    fontSize: 10,
  },

  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.borderStrong,
    marginHorizontal: 10,
  },

  ticketMetaRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
  },

  metaItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  metaText: {
    marginLeft: 6,
    color: C.text,
    fontWeight: "700",
    fontSize: 11,
  },

  metaDivider: {
    width: 1,
    height: 18,
    backgroundColor: C.border,
  },

  ticketExpanded: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },

  infoLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },

  infoLineLabel: {
    color: C.mutedText,
    fontWeight: "700",
    width: 140,
    fontSize: 11,
  },

  infoLineValue: {
    color: C.text,
    fontWeight: "600",
    flex: 1,
    textAlign: "right",
    fontSize: 11,
  },

  chatFileImageWrap: {
    marginTop: 8,
    borderRadius: 10,
    overflow: "hidden",
  },

  chatFileImage: {
    width: 200,
    height: 160,
    borderRadius: 10,
  },

  chatFileDocRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    backgroundColor: C.surfaceAlt,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },

  chatFileDocIcon: {
    fontSize: 20,
  },

  chatFileDocName: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: C.primaryStrong,
    textDecorationLine: "underline",
  },

  bigCloseBtn: {
    marginTop: 14,
    backgroundColor: C.danger,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    width: 130,
    alignSelf: "center",
  },

  bigCloseBtnText: {
    color: C.white,
    fontWeight: "700",
    fontSize: 10,
  },

  chatCard: {
    flex: 1,
    minHeight: 0,
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 1,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    marginBottom: 8,
  },

  chatTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: C.text,
    marginBottom: 10,
  },

  chatScroll: {
    flex: 1,
    minHeight: 0,
  },

  chatScrollContent: {
    paddingBottom: 12,
  },

  msgWrap: {
    marginBottom: 14,
  },

  msgRow: {
    flexDirection: "row",
    paddingHorizontal: 10,
  },

  msgRowLeft: {
    justifyContent: "flex-start",
  },

  msgRowRight: {
    justifyContent: "flex-end",
  },

  msgBubble: {
    maxWidth: "78%",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  msgBubbleMine: {
    backgroundColor: C.primarySoft,
    borderWidth: 1,
    borderColor: C.border,
  },

  msgBubbleOther: {
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.border,
  },

  msgName: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 4,
  },

  msgNameMine: {
    color: C.primaryStrong,
  },

  msgNameOther: {
    color: C.success,
  },

  msgBody: {
    fontSize: 11,
    fontWeight: "600",
    color: C.text,
    lineHeight: 18,
  },

  msgTime: {
    fontSize: 10,
    fontWeight: "600",
    color: C.subtleText,
    marginTop: 4,
    paddingHorizontal: 14,
  },

  msgTimeLeft: {
    textAlign: "left",
  },

  msgTimeRight: {
    textAlign: "right",
  },

  replyPreview: {
    padding: 8,
    borderRadius: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: C.primaryStrong,
  },

  replyPreviewMine: {
    backgroundColor: C.surface,
    borderLeftColor: C.primary,
  },

  replyPreviewOther: {
    backgroundColor: C.surface,
    borderLeftColor: C.primaryStrong,
  },

  replyName: {
    fontSize: 11,
    fontWeight: "800",
  },

  replyNameMine: {
    color: C.primaryStrong,
  },

  replyNameOther: {
    color: C.text,
  },

  replyText: {
    fontSize: 11,
  },

  replyTextMine: {
    color: C.text,
  },

  replyTextOther: {
    color: C.mutedText,
  },

  attachStrip: {
    marginTop: 10,
    maxHeight: 75,
  },

  attachThumbWrap: {
    position: "relative",
    marginRight: 10,
  },

  attachThumbImg: {
    width: 62,
    height: 62,
    borderRadius: 10,
  },

  attachThumbDoc: {
    width: 62,
    height: 62,
    borderRadius: 10,
    backgroundColor: C.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },

  attachThumbDocText: {
    fontSize: 11,
    color: C.text,
    fontWeight: "700",
  },

  attachRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: C.danger,
    borderRadius: 10,
    padding: 3,
  },

  replyBar: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    backgroundColor: C.primarySoft,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderLeftWidth: 4,
    borderLeftColor: C.primaryStrong,
  },

  replyBarTitle: {
    fontWeight: "900",
    color: C.text,
  },

  replyBarSnippet: {
    color: C.mutedText,
    marginTop: 2,
    fontWeight: "600",
  },

  replyBarClose: {
    paddingLeft: 10,
    paddingVertical: 6,
  },

  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginTop: 12,
    backgroundColor: C.surfaceAlt,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
    color: C.text,
    fontWeight: "600",
  },

  iconBtn: {
    padding: 8,
  },

  micBtn: {
    paddingRight: 8,
    paddingLeft: 2,
    paddingBottom: 6,
  },

  recordingPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.dangerSoft,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginRight: 8,
    gap: 8,
    marginBottom: 2,
  },

  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.danger,
  },

  recordingText: {
    fontSize: 11,
    fontWeight: "700",
    color: C.danger,
  },

  recordingStopBtn: {
    marginLeft: 2,
  },

  sendBtn: {
    marginLeft: 6,
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.primaryStrong,
    alignItems: "center",
    justifyContent: "center",
  },

  voiceError: {
    marginTop: 8,
    color: C.danger,
    fontWeight: "800",
  },

  previewOverlay: {
    flex: 1,
    backgroundColor: C.overlayStrong || C.overlay,
    justifyContent: "center",
    alignItems: "center",
  },

  previewClose: {
    position: "absolute",
    top: 46,
    right: 18,
    zIndex: 999,
    backgroundColor: C.overlay,
    borderRadius: 18,
    padding: 4,
  },

  previewZoom: {
    width: 320,
    height: 440,
    backgroundColor: "transparent",
  },

  previewImg: {
    width: "100%",
    height: "100%",
    resizeMode: "contain",
    borderRadius: 12,
  },
});

export default TicketDetails;
