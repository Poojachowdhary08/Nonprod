import debounce from "lodash.debounce";
import Toast from "react-native-toast-message";
import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import useSocketEvents from "@/hooks/useSocketEvents";
import { View, StyleSheet, TouchableOpacity, Image, TextInput, KeyboardAvoidingView, Platform, ScrollView, Linking, NativeSyntheticEvent, NativeScrollEvent, Alert, Modal, SafeAreaView, TouchableWithoutFeedback, Keyboard } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import ModalSelector from "@/components/AppModalSelect";
import { Ionicons } from "@expo/vector-icons";
import * as mime from "react-native-mime-types";
import axios from "axios";
import { router, useLocalSearchParams } from "expo-router";
import SocketManager from "@/utils/socketManager";
import TText from "@/components/TText";

import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
import { authenticatedFetch } from "../utils/auth";
interface FileAttachment {
  uri: string;
  name?: string;
  type?: string;
  file?: File; // web-only
}

interface ChatMessage {
  is_temp: boolean;
  reply_to_engineer_name: any;
  message_id: number;
  property_id: string;
  reply_to_message_id?: number;
  reply_to_text?: string;
  employee_name: string;
  engineer_name: string;
  employee_code: string;
  message_text: string;
  created_at: string;
  files: any[];
  reactions?: { [emoji: string]: string[] };
  is_starred?: boolean;
  is_pinned?: boolean;
}

interface Props {
  propertyId: string;
  userDetails: {
    employee_code: string;
    first_name: string;
    last_name?: string;
  };
}

const API_BASE = `${APP_API_BASE_URL}`;

const PropertyChatMessages = () => {
  const params = useLocalSearchParams();
  const propertyId = params.propertyId as string;

  let userDetails: Props["userDetails"] = {
    employee_code: "",
    first_name: "Unknown",
  };

  try {
    if (params.userDetails) {
      userDetails = JSON.parse(params.userDetails as string);
    }
  } catch (err) {
    console.error("❌ Failed to parse userDetails from router params", err);
  }

  // ------------------------------ state ------------------------------
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showReactionsFor, setShowReactionsFor] = useState<number | null>(null);
  const [showEmojiPickerFor, setShowEmojiPickerFor] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState<string>("");
  const [newUpdateFiles, setNewUpdateFiles] = useState<FileAttachment[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const seenIds = useRef<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<number[]>([]);
  const searchInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollHeightBeforeFetch = useRef<number>(0);
  const scrollLockedRef = useRef(false);
  const lastFetchedBeforeId = useRef<number | null>(null);
  const socketManagerRef = useRef<ReturnType<typeof SocketManager.getInstance> | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [filter, setFilter] = useState<"all" | "starred" | "pinned">("all");
  const [selectedActionMessageId, setSelectedActionMessageId] = useState<number | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [inputHeight, setInputHeight] = useState(40);

  const [selectedSendTarget, setSelectedSendTarget] = useState<"customer" | "employee">("employee");
  const [showRecipientSelector, setShowRecipientSelector] = useState(false);

  const currentUserCode = userDetails.employee_code;
  const currentUserName = userDetails.last_name
    ? `${userDetails.first_name} ${userDetails.last_name}`
    : userDetails.first_name;

  // ------------------------------ socket events ------------------------------
  useSocketEvents({
    propertyId,
    employeeCode: currentUserCode,
    engineerName: currentUserName,
    onNewMessage: (data) => {
      setMessages((prev) => {
        const tempIndex = prev.findIndex(
          (m) => m.is_temp && m.message_text === data.message_text && m.employee_code === data.employee_code
        );
        if (tempIndex !== -1) {
          const updated = [...prev];
          updated[tempIndex] = { ...data, is_temp: false };
          return updated.sort((a, b) => a.message_id - b.message_id);
        }

        const exists = prev.some((m) => m.message_id === data.message_id);
        return exists ? prev : [...prev, data].sort((a, b) => a.message_id - b.message_id);
      });
    },
    onReactionUpdate: (data) => {
      setMessages((prev) =>
        prev.map((m) => (m.message_id === data.message_id ? { ...m, reactions: data.reactions || {} } : m))
      );
    },
    onStarUpdate: (data) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.message_id === data.message_id
            ? { ...m, is_starred: data.is_starred, starred_by: data.starred_by || [] }
            : m
        )
      );
    },
  });

  // ------------------------------ constants ------------------------------
  const options = [
    { key: "camera", label: "Take Photo" },
    { key: "gallery", label: "Choose from Gallery" },
    { key: "documents", label: "Pick a Document" },
  ];

  type FetchMessageOptions = {
    beforeId?: number;
    initialLoad?: boolean;
  };

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

  const getColorForName = (name: string): string => {
    const hash = [...name].reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return NAME_COLORS[hash % NAME_COLORS.length];
  };

  // ------------------------------ fetch messages ------------------------------
  const fetchMessages = async (options: FetchMessageOptions = {}) => {
    const { beforeId, initialLoad = false } = options;

    if (loading || (!hasMore && !initialLoad)) return;
    setLoading(true);

    try {
      let endpoint = `/property-chat/${propertyId}`;
      if (filter === "starred") endpoint = `/property-chat/${propertyId}/starred`;
      else if (filter === "pinned") endpoint = `/property-chat/${propertyId}/pinned`;

      const res = await axios.get(`${API_BASE}${endpoint}`, {
        params: {
          limit: 50,
          ...(beforeId && { before_message_id: beforeId }),
        },
      });

      const rawMessages: ChatMessage[] = res.data || [];
      const newMessages = rawMessages.filter((msg) => !seenIds.current.has(msg.message_id));
      newMessages.forEach((msg) => seenIds.current.add(msg.message_id));

      const messageMap: { [id: number]: string } = {};
      const allMessagesForMap = initialLoad ? newMessages : [...newMessages, ...messages];
      allMessagesForMap.forEach((msg) => (messageMap[msg.message_id] = msg.message_text));

      const enrichedMessages = newMessages.map((msg) => ({
        ...msg,
        reply_to_text: msg.reply_to_message_id ? messageMap[msg.reply_to_message_id] || "Referenced message" : undefined,
      }));

      if (initialLoad) {
        setMessages([...enrichedMessages.reverse()]);
        scrollToBottom(true);
      } else {
        setMessages((prev) => [...enrichedMessages.reverse(), ...prev]);
      }

      if (newMessages.length < 20) setHasMore(false);
    } catch (e) {
      console.error("❌ Failed to fetch messages", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    seenIds.current.clear();
    setMessages([]);
    setHasMore(true);

    const endpoint =
      filter === "starred"
        ? `/property-chat/${propertyId}/starred`
        : filter === "pinned"
        ? `/property-chat/${propertyId}/pinned`
        : `/property-chat/${propertyId}`;

    axios
      .get(`${API_BASE}${endpoint}`, { params: filter === "all" ? { limit: 50 } : {} })
      .then((res) => {
        const fetched = res.data || [];
        if (filter === "all") fetched.forEach((m: any) => seenIds.current.add(m.message_id));

        const uniqueMessages = fetched.reduce((acc: ChatMessage[], msg: ChatMessage) => {
          if (!acc.some((m) => m.message_id === msg.message_id)) acc.push(msg);
          return acc;
        }, []);

        setMessages([]);
        setTimeout(() => {
          setMessages(uniqueMessages.reverse());
          setTimeout(() => scrollToBottom(true), 100);
        }, 0);

        scrollToBottom(true);
      });
  }, [propertyId, filter]);

  const scrollToBottom = (instant = false) => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: !instant });
    }, 80);
  };

  const scrollLock = useRef(false);
  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const yOffset = e.nativeEvent.contentOffset.y;

    if (
      yOffset < 120 &&
      !loading &&
      hasMore &&
      !scrollLock.current &&
      messages.length > 0 &&
      messages[0].message_id !== lastFetchedBeforeId.current
    ) {
      scrollLock.current = true;
      scrollHeightBeforeFetch.current = e.nativeEvent.contentSize.height;
      scrollLockedRef.current = true;
      lastFetchedBeforeId.current = messages[0].message_id;

      fetchMessages({ beforeId: messages[0].message_id }).finally(() => {
        scrollLock.current = false;
      });
    }
  };

  // ------------------------------ search ------------------------------
  const debounceSearch = useRef(
    debounce(async (query: string) => {
      if (!query.trim()) {
        if (filter === "all") {
          seenIds.current.clear();
          setHasMore(true);
          fetchMessages({ initialLoad: true });
        }
        return;
      }

      try {
        const res = await axios.get(`${API_BASE}/property-chat/search`, {
          params: { property_id: propertyId, query },
        });

        const results = res.data;
        setMessages(
          results.map((msg: any) => ({
            ...msg,
            engineer_name: msg.employee_name,
            files: msg.files || [],
            reactions: msg.reactions || {},
            is_starred: msg.is_starred || false,
            is_pinned: msg.is_pinned || false,
          }))
        );

        setHasMore(false);
      } catch (err) {
        console.error("❌ Search error", err);
        Toast.show({ type: "error", text1: "Search Error", text2: "Something went wrong" });
      }
    }, 500)
  ).current;

  useEffect(() => {
    setSearchQuery("");
    debounceSearch.cancel();
  }, [filter]);

  const sendTyping = useRef(
    debounce(() => {
      socketManagerRef.current?.send({
        type: "typing",
        property_id: propertyId,
        engineer_name: currentUserName,
        employee_code: currentUserCode,
      });
    }, 1000)
  ).current;

  // ------------------------------ star / reactions ------------------------------
  const toggleStar = async (messageId: number) => {
    const formData = new FormData();
    formData.append("employee_code", currentUserCode);
    try {
      const res = await authenticatedFetch(`${API_BASE}/property-chat/${messageId}/star`, { method: "POST", body: formData });
      const result = await res.json();
      if (!res.ok) throw new Error(result?.error || "Failed to star message");

      Toast.show({ type: "success", text1: "Flag Updated", text2: result.message || "Flag toggled" });

      setShowReactionsFor(null);
      setShowEmojiPickerFor(null);

      setMessages((prev) =>
        filter === "starred"
          ? prev.filter((m) => m.message_id !== messageId)
          : filter === "pinned"
          ? prev
          : prev.map((m) => (m.message_id === messageId ? { ...m, is_starred: !m.is_starred } : m))
      );

      socketManagerRef.current?.send({
        type: "star_update",
        message_id: messageId,
        employee_code: currentUserCode,
      });
    } catch (err: any) {
      Toast.show({ type: "error", text1: "Error", text2: err.message || "Something went wrong" });
    }
  };

  const handleEmojiReaction = async (messageId: number, emoji: string) => {
    try {
      const formData = new FormData();
      formData.append("emoji", emoji);
      formData.append("employee_code", currentUserCode);

      const res = await authenticatedFetch(`${API_BASE}/property-chat/${messageId}/react`, { method: "POST", body: formData });
      const result = await res.json();
      if (!res.ok) throw new Error("Failed to react");

      setMessages((prev) => prev.map((m) => (m.message_id === messageId ? { ...m, reactions: result.reactions } : m)));
    } catch {
      Toast.show({ type: "error", text1: "Error", text2: "Could not update reaction" });
    } finally {
      setShowReactionsFor(null);
    }
  };

  // ------------------------------ filters ------------------------------
  const filterTabs = useMemo(
    () => [
      { key: "all", label: "All" },
      { key: "starred", label: "🚩" },
    ],
    []
  );

  // ------------------------------ file naming ------------------------------
  const formatFileName = (propertyId: string, originalName: string): string => {
    const now = new Date();
    const pad = (num: number): string => String(num).padStart(2, "0");

    const day = pad(now.getDate());
    const month = pad(now.getMonth() + 1);
    const year = now.getFullYear();

    let hours = now.getHours();
    const minutes = pad(now.getMinutes());
    const seconds = pad(now.getSeconds());
    const ampm = hours >= 12 ? "pm" : "am";

    hours = hours % 12;
    hours = hours === 0 ? 12 : hours;

    const formattedTime = `${pad(hours)}-${minutes}-${seconds}_${ampm}`;
    const formattedDate = `${day}-${month}-${year}`;

    const extMatch = originalName.match(/\.[0-9a-z]+$/i);
    const ext = extMatch ? extMatch[0] : "";

    return `${propertyId}_${formattedDate}_${formattedTime}${ext}`;
  };

  // ------------------------------ pickers ------------------------------
  const pickImageFromCamera = async (setNewUpdateFiles: (updater: (prev: any[]) => any[]) => void) => {
    if (Platform.OS === "web") {
      try {
        ["webcam-preview", "capture-btn", "cancel-btn", "button-container"].forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.remove();
        });

        const video = document.createElement("video");
        video.id = "webcam-preview";
        video.style.position = "fixed";
        video.style.top = "0";
        video.style.left = "0";
        video.style.width = "100vw";
        video.style.height = "100vh";
        video.style.zIndex = "9998";
        video.style.objectFit = "cover";
        video.autoplay = true;
        video.playsInline = true;
        document.body.appendChild(video);

        const buttonContainer = document.createElement("div");
        buttonContainer.id = "button-container";
        buttonContainer.style.position = "fixed";
        buttonContainer.style.bottom = "40px";
        buttonContainer.style.left = "50%";
        buttonContainer.style.transform = "translateX(-50%)";
        buttonContainer.style.display = "flex";
        buttonContainer.style.gap = "20px";
        buttonContainer.style.zIndex = "9999";
        document.body.appendChild(buttonContainer);

        const cancelBtn = document.createElement("button");
        cancelBtn.id = "cancel-btn";
        cancelBtn.innerText = "❌ Cancel";
        Object.assign(cancelBtn.style, {
          padding: "12px 24px",
          fontSize: "16px",
          backgroundColor: "gray",
          color: "white",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
        });

        const captureBtn = document.createElement("button");
        captureBtn.id = "capture-btn";
        captureBtn.innerText = "📸 Capture";
        Object.assign(captureBtn.style, {
          padding: "12px 24px",
          fontSize: "16px",
          backgroundColor: "#1976D2",
          color: "white",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
        });

        buttonContainer.appendChild(cancelBtn);
        buttonContainer.appendChild(captureBtn);

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        video.srcObject = stream;

        const cleanup = () => {
          stream.getTracks().forEach((track) => track.stop());
          [video, buttonContainer].forEach((el) => el.remove());
        };

        captureBtn.onclick = () => {
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

          canvas.toBlob((blob) => {
            if (!blob) return;
            const renamed = formatFileName(propertyId, `camera_${Date.now()}.jpg`);
            const file = new File([blob], renamed, { type: "image/jpeg" });

            const webFile = {
              uri: URL.createObjectURL(blob),
              name: file.name,
              type: file.type,
              file,
            };

            setNewUpdateFiles((prev) => [...prev, webFile]);
            cleanup();
          }, "image/jpeg");
        };

        cancelBtn.onclick = () => cleanup();
      } catch {
        alert("Camera access failed. Please allow permission.");
      }
      return;
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });

    if (!result.canceled && result.assets.length > 0) {
      const files = result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.fileName || `camera_${Date.now()}.jpg`,
        type: "image/jpeg",
      }));
      setNewUpdateFiles((prev) => [...prev, ...files]);
    }
  };

  const pickImageFromGallery = async () => {
    if (Platform.OS === "web") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.multiple = true;

      input.onchange = () => {
        const files = Array.from(input.files || []).map((file) => {
          const renamed = formatFileName(propertyId, file.name);

          return {
            uri: URL.createObjectURL(file),
            name: renamed,
            type: file.type || "image/jpeg",
            file,
          };
        });

        setNewUpdateFiles((prev) => [...prev, ...files]);
      };

      input.click();
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.7,
      selectionLimit: 10,
    });

    if (!result.canceled && result.assets.length > 0) {
      const files = result.assets.map((asset) => ({
        uri: asset.uri,
        name: formatFileName(propertyId, asset.fileName || `gallery_${Date.now()}.jpg`),
        type: "image/jpeg",
      }));

      setNewUpdateFiles((prev) => [...prev, ...files]);
    }
  };

  const pickDocuments = async () => {
    if (Platform.OS === "web") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "*/*";
      input.multiple = true;

      input.onchange = () => {
        const files = Array.from(input.files || []).map((file) => ({
          uri: URL.createObjectURL(file),
          name: formatFileName(propertyId, file.name),
          type: file.type || (mime.lookup(file.name) as string) || "application/octet-stream",
          file,
        }));

        setNewUpdateFiles((prev) => [...prev, ...files]);
      };

      input.click();
      return;
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      multiple: true,
    });

    if (!result.canceled && result.assets.length > 0) {
      const files = result.assets.map((asset) => ({
        uri: asset.uri,
        name: formatFileName(propertyId, asset.name || `document_${Date.now()}`),
        type: asset.mimeType || (mime.lookup(asset.name || "") as string) || "application/octet-stream",
      }));

      setNewUpdateFiles((prev) => [...prev, ...files]);
    }
  };

  // ------------------------------ Temporal trigger ------------------------------
  type TriggerArgs = {
    employee_code: string;
    property: string;
    message_id: string;
    message: string;
    device_id?: string;
    from_customer?: boolean;
  };

  const triggerNotification = async (payload: TriggerArgs) => {
    try {
      const res = await authenticatedFetch(`${API_BASE}/trigger-notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          from_customer: payload.from_customer ?? false,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        console.warn("❌ trigger-notification failed:", res.status, err);
      } else {
        console.log("📣 Temporal notification triggered");
      }
    } catch (e) {
      console.warn("❌ trigger-notification error:", e);
    }
  };

  // ------------------------------ send message ------------------------------
  const handleSend = async (sendTarget: "customer" | "employee") => {
    if (!propertyId || !currentUserName || !currentUserCode) {
      Alert.alert("Error", "Missing required fields.");
      return;
    }

    const messageBody = newMessage.trim();
    if (!messageBody && newUpdateFiles.length === 0) {
      Alert.alert("Error", "Cannot send an empty message.");
      return;
    }

    const formData = new FormData();
    formData.append("property_id", propertyId);
    formData.append("engineer_name", currentUserName);
    formData.append("employee_code", currentUserCode);
    formData.append("message_text", messageBody);

    const visibleToClients = sendTarget === "customer";
    formData.append("visible_to_clients", String(visibleToClients));

    if (replyToMessage) {
      formData.append("reply_to_message_id", String(replyToMessage.message_id));
    }

    for (const f of newUpdateFiles) {
      const name = f.name || `file_${Date.now()}`;
      const type = (f.type as string) || (mime.lookup(name) as string) || "application/octet-stream";

      if (Platform.OS === "web") {
        // @ts-ignore
        if (f.file instanceof File) {
          // @ts-ignore
          const fileObj = new File([f.file], name, { type: f.file.type || type });
          formData.append("files", fileObj);
        } else {
          try {
            const resp = await fetch(f.uri);
            const blob = await resp.blob();
            formData.append("files", new File([blob], name, { type }));
          } catch (err) {
            console.error("Web blob/object-URL fetch failed:", err);
          }
        }
      } else {
        formData.append("files", { uri: f.uri, name, type } as any);
      }
    }

    // optimistic timestamp
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    const formattedDate = `${day}-${month}-${year}, ${hours}:${minutes}:${seconds} ${ampm}`;

    const tempId = Date.now();
    const optimisticMsg: ChatMessage = {
      message_id: tempId,
      is_temp: true,
      property_id: propertyId,
      engineer_name: currentUserName,
      employee_name: currentUserName,
      employee_code: currentUserCode,
      message_text: messageBody,
      created_at: formattedDate,
      reply_to_message_id: replyToMessage?.message_id,
      reply_to_text: replyToMessage?.message_text,
      reply_to_engineer_name: replyToMessage?.engineer_name,
      files: newUpdateFiles.map((f) => ({
        file_url: f.uri,
        file_name: f.name,
        file_type: f.type,
      })),
      reactions: {},
      is_starred: false,
      is_pinned: false,
    };

    setMessages((prev) => [...prev, optimisticMsg]);

    setNewMessage("");
    setNewUpdateFiles([]);
    setReplyToMessage(null);
    setSelectedSendTarget("employee");
    setTimeout(() => scrollToBottom(true), 100);

    try {
      setLoading(true);

      let data: any = null;
      if (Platform.OS === "android") {
        const response = await authenticatedFetch(`${API_BASE}/property-chat/send`, {
          method: "POST",
          headers: { Accept: "application/json" },
          body: formData,
        });
        const txt = await response.text();
        try {
          data = JSON.parse(txt);
        } catch {
          data = { raw: txt };
        }
        if (!response.ok) throw new Error(`Fetch failed: ${response.status} - ${txt}`);
      } else {
        const response = await axios.post(`${API_BASE}/property-chat/send`, formData, {
          headers: { Accept: "application/json" },
        });
        data = response.data;
      }

      const serverMsgId = (data && (data.message_id ?? data?.message?.message_id ?? data?.result?.message_id)) ?? tempId;

      if (visibleToClients) {
        await triggerNotification({
          employee_code: currentUserCode,
          property: propertyId,
          message_id: String(serverMsgId),
          message: messageBody,
          device_id: "UNKNOWN_DEVICE",
          from_customer: false,
        });
      }
    } catch (error: any) {
      console.error("Error sending message:", error?.response?.data || error?.message || error);
      Alert.alert("Error", "Failed to send the message.");
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------ date parse ------------------------------
  const parseCustomDate = (input: string): Date => {
    try {
      const [datePart, timePart] = input.split(", ");
      const [day, month, year] = datePart.split("-");
      const [time, period] = timePart.split(" ");
      let [hours, minutes, seconds] = time.split(":").map(Number);

      if (period === "PM" && hours < 12) hours += 12;
      if (period === "AM" && hours === 12) hours = 0;

      return new Date(
        `${year}-${month}-${day}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(
          2,
          "0"
        )}:${String(seconds).padStart(2, "0")}`
      );
    } catch {
      return new Date();
    }
  };

  // ------------------------------ top UI helpers ------------------------------
  const propertyLabel = useMemo(() => {
    // If you pass propertyName in params, show it nicely.
    const pName = (params.propertyName as string) || "";
    if (pName) return pName;
    return propertyId || "Property";
  }, [params.propertyName, propertyId]);

  const statusLabel = useMemo(() => {
    // if you have status param, show it; else keep "IN PROGRESS"
    const s = (params.status as string) || "";
    return s ? s.toUpperCase() : "IN PROGRESS";
  }, [params.status]);

  const statusPillColors = useMemo(() => {
    // simple mapping if needed
    const s = statusLabel.toLowerCase();
    if (s.includes("progress")) return { bg: "#E8F1FF", text: "#2563EB", border: "#CFE2FF" };
    if (s.includes("complete")) return { bg: "#DCFCE7", text: "#166534", border: "#BBF7D0" };
    if (s.includes("hold")) return { bg: "#FEF3C7", text: "#92400E", border: "#FDE68A" };
    return { bg: "#F1F5F9", text: "#0F172A", border: "#E2E8F0" };
  }, [statusLabel]);

  // ------------------------------ footer navigation ------------------------------
  const encodedUserDetails = useMemo(() => encodeURIComponent(JSON.stringify(userDetails)), [userDetails]);

  const handleGoSchedules = () => {
    router.push({
      pathname: "/ViewSchedulesWrapper", // ✅ change if your route differs
      params: {
        propertyId,
        userDetails: encodedUserDetails,
      },
    } as any);
  };

  const handleGoInventory = () => {
    router.push({
      pathname: "/PropertyInventoryWrapper", // ✅ change if your route differs
      params: {
        propertyId,
        userDetails: encodedUserDetails,
      },
    } as any);
  };

  const handleGoHome = () => router.push("/HomeScreen");
  const handleGoBack = () => router.back();

  // ------------------------------ render ------------------------------
  return (
    <SafeAreaView style={styles.safe} testID="property-chats-messages-root">
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {/* ---------------- Header ---------------- */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleGoBack} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={22} color="#0F172A" />
          </TouchableOpacity>

          <View style={styles.headerMid}>
            <TText style={styles.headerTitle} numberOfLines={1}>
              Property Chats
            </TText>
            <TText style={styles.headerSub} numberOfLines={1}>
              {propertyLabel}
            </TText>
          </View>

          <TouchableOpacity onPress={handleGoHome} style={styles.iconBtn}>
            <Ionicons name="home" size={22} color="#0F172A" />
          </TouchableOpacity>
        </View>

        {/* ---------------- Property Card (like screenshot) ---------------- */}
        <View style={styles.propertyCard}>
          <View style={styles.propertyCardLeft}>
            <View style={styles.propertyThumb}>
              <TText style={styles.propertyThumbText}>
                {(propertyLabel || "P").trim().slice(0, 1).toUpperCase()}
              </TText>
            </View>

            <View style={{ flex: 1 }}>
              <TText style={styles.propertyCode} numberOfLines={1}>
                {propertyLabel}
              </TText>
              <TText style={styles.propertyMeta} numberOfLines={1}>
                {onlineUsers.length > 0 ? `${onlineUsers.length} online` : "—"}
              </TText>
            </View>
          </View>

          <View style={[styles.statusPill, { backgroundColor: statusPillColors.bg, borderColor: statusPillColors.border }]}>
            <TText style={[styles.statusText, { color: statusPillColors.text }]}>{statusLabel}</TText>
          </View>

          <TouchableOpacity style={styles.dropBtn} onPress={() => {}}>
            <Ionicons name="chevron-down" size={18} color="#64748B" />
          </TouchableOpacity>
        </View>

        {/* ---------------- Search + Filter row ---------------- */}
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color="#94A3B8" />
            <TextInput
              placeholder="Search chats"
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text);
                debounceSearch(text);
              }}
              style={styles.searchInput}
              placeholderTextColor="#94A3B8"
              ref={searchInputRef}
            />
            {!!searchQuery && (
              <TouchableOpacity
                onPress={() => {
                  setSearchQuery("");
                  debounceSearch("");
                }}
                style={styles.clearPill}
              >
                <Ionicons name="close" size={16} color="#64748B" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.filterPills}>
            {filterTabs.map((tab) => {
              const active = filter === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setFilter(tab.key as any)}
                  activeOpacity={0.85}
                  style={[styles.filterPill, active && styles.filterPillActive]}
                >
                  <TText style={[styles.filterPillText, active && styles.filterPillTextActive]}>{tab.label}</TText>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ---------------- Chat area ---------------- */}
        <View style={styles.chatShell}>
          <TouchableWithoutFeedback
            onPress={() => {
              setSelectedActionMessageId(null);
              setShowReactionsFor(null);
              setShowEmojiPickerFor(null);
              setShowEmojiPicker(false);
              Keyboard.dismiss();
            }}
          >
            <ScrollView
              key={`scroll-${filter}`}
              ref={scrollViewRef}
              style={styles.chatScroll}
              contentContainerStyle={styles.chatContent}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              onContentSizeChange={(w, h) => {
                if (scrollLockedRef.current && scrollHeightBeforeFetch.current) {
                  scrollViewRef.current?.scrollTo({
                    y: h - scrollHeightBeforeFetch.current,
                    animated: false,
                  });
                  scrollLockedRef.current = false;
                }
              }}
            >
              {messages.map((msg, index) => {
                const isMine = msg.employee_code === currentUserCode;

                const dateObj = parseCustomDate(msg.created_at);
                const time = dateObj.toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                });

                const nameColor = getColorForName(msg.engineer_name ?? "Unknown");
                const bubbleBg = isMine ? "#E8F1FF" : "#FFFFFF";
                const bubbleBorder = isMine ? "#CFE2FF" : "#E2E8F0";

                return (
                  <View key={msg.message_id} style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowOther]}>
                    {/* avatar (only for others) */}
                    {!isMine && (
                      <View style={[styles.avatar, { backgroundColor: nameColor }]}>
                        <TText style={styles.avatarText}>
                          {(msg.engineer_name || "U").trim().slice(0, 1).toUpperCase()}
                        </TText>
                      </View>
                    )}

                    <View style={{ maxWidth: "84%" }}>
                      {/* name + time */}
                      <View style={[styles.nameTimeRow, isMine && { justifyContent: "flex-end" }]}>
                        {!isMine ? (
                          <TText style={[styles.nameText, { color: nameColor }]} numberOfLines={1}>
                            {msg.engineer_name?.trim() || "Unknown"}
                          </TText>
                        ) : (
                          <TText style={styles.nameTextMine} numberOfLines={1}>
                            You
                          </TText>
                        )}
                        <TText style={styles.timeText}>{time}</TText>
                      </View>

                      {/* bubble */}
                      <TouchableOpacity
                        onPress={() => setReplyToMessage(msg)}
                        onLongPress={() => {
                          setShowReactionsFor(msg.message_id);
                          setSelectedActionMessageId(msg.message_id);
                        }}
                        delayLongPress={250}
                        activeOpacity={0.85}
                        style={[
                          styles.bubble,
                          {
                            backgroundColor: bubbleBg,
                            borderColor: bubbleBorder,
                            alignSelf: isMine ? "flex-end" : "flex-start",
                            borderTopRightRadius: isMine ? 8 : 18,
                            borderTopLeftRadius: isMine ? 18 : 8,
                          },
                        ]}
                      >
                        {/* reply preview */}
                        {msg.reply_to_message_id && msg.reply_to_text && (
                          <View style={styles.replyPreview}>
                            <TText numberOfLines={1} style={styles.replyPreviewText}>
                              {msg.reply_to_engineer_name ? `${msg.reply_to_engineer_name}: ` : ""}
                              {msg.reply_to_text}
                            </TText>
                          </View>
                        )}

                        {/* message text */}
                        {(!!msg.message_text || msg.is_starred) && (
                          <View style={styles.textRow}>
                            {!!msg.message_text && <TText style={styles.msgText}>{msg.message_text}</TText>}
                            {msg.is_starred && <TText style={styles.flagIcon}>🚩</TText>}
                          </View>
                        )}

                        {/* files */}
                        {msg.files?.length > 0 && (
                          <View style={{ marginTop: 10 }}>
                            {msg.files.map((file, idx) => {
                              const isImage = file.file_type?.startsWith("image");
                              return (
                                <TouchableOpacity
                                  key={`${msg.message_id}-${idx}`}
                                  onPress={() => {
                                    if (isImage) setPreviewImage(file.file_url);
                                    else Linking.openURL(file.file_url);
                                  }}
                                  style={{ marginTop: 6 }}
                                  activeOpacity={0.85}
                                >
                                  {isImage ? (
                                    <Image source={{ uri: file.file_url }} style={styles.attachmentImg} resizeMode="cover" />
                                  ) : (
                                    <View style={styles.docRow}>
                                      <Ionicons name="document-text-outline" size={18} color="#2563EB" />
                                      <TText style={styles.docText} numberOfLines={1}>
                                        {file.file_name}
                                      </TText>
                                    </View>
                                  )}
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        )}

                        {/* reactions row */}
                        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                          <View style={styles.reactionsRow}>
                            {Object.entries(msg.reactions).map(([emoji, users]) => (
                              <View key={emoji} style={styles.reactionBubble}>
                                <TText style={styles.reactionText}>
                                  {emoji} {(users as string[]).length}
                                </TText>
                              </View>
                            ))}
                          </View>
                        )}
                      </TouchableOpacity>

                      {/* reaction picker + actions */}
                      {showReactionsFor === msg.message_id && (
                        <View style={[styles.actionTray, isMine && { alignSelf: "flex-end" }]}>
                          <View style={styles.reactionPicker}>
                            {["👍", "👎", "✅", "❌", "😮", "🙏"].map((emoji) => (
                              <TouchableOpacity key={emoji} onPress={() => handleEmojiReaction(msg.message_id, emoji)}>
                                <TText style={{ fontSize: 20, marginRight: 8 }}>{emoji}</TText>
                              </TouchableOpacity>
                            ))}
                          </View>

                          <View style={styles.pinStarRow}>
                            <TouchableOpacity onPress={() => toggleStar(msg.message_id)} style={styles.actionBubble}>
                              <TText style={styles.actionText}>{msg.is_starred ? "Unflag" : "🚩 Flag"}</TText>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}

              {/* selected new attachments preview */}
              {newUpdateFiles.length > 0 && (
                <View style={styles.pendingFilesWrap}>
                  {newUpdateFiles.map((file, index) => {
                    const isImage = file.type?.includes("image");
                    return (
                      <View key={index} style={styles.pendingFileCard}>
                        {isImage ? (
                          <Image source={{ uri: file.uri }} style={styles.pendingThumb} resizeMode="cover" />
                        ) : (
                          <View style={styles.pendingDocIcon}>
                            <Ionicons name="document" size={28} color="#334155" />
                          </View>
                        )}

                        <TText numberOfLines={1} style={styles.pendingName}>
                          {file.name}
                        </TText>

                        <TouchableOpacity
                          onPress={() => setNewUpdateFiles((prev) => prev.filter((_, i) => i !== index))}
                          style={styles.removeFileBtn}
                        >
                          <Ionicons name="close" size={14} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* bottom spacer so last msg not hidden */}
              <View style={{ height: 18 }} />
            </ScrollView>
          </TouchableWithoutFeedback>
        </View>

        {/* reply bar */}
        {replyToMessage && (
          <View style={styles.replyBar}>
            <View style={{ flex: 1 }}>
              <TText style={styles.replyBarTitle}>
                Replying to {replyToMessage.engineer_name || "Unknown"}
              </TText>
              <TText numberOfLines={1} style={styles.replyBarText}>
                {replyToMessage.message_text}
              </TText>
            </View>

            <TouchableOpacity onPress={() => setReplyToMessage(null)} style={styles.replyClose}>
              <Ionicons name="close" size={18} color="#0F172A" />
            </TouchableOpacity>
          </View>
        )}

        {/* recipient selector (only when text exists) */}
        {newMessage.trim().length > 0 && (
          <>
            <TouchableOpacity onPress={() => setShowRecipientSelector(true)} style={styles.recipientCard} activeOpacity={0.9}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons
                  name={selectedSendTarget === "customer" ? "person-outline" : "construct-outline"}
                  size={18}
                  color="#0F172A"
                  style={{ marginRight: 8 }}
                />
                <TText style={styles.recipientText}>
                  {selectedSendTarget === "customer" ? "Customer" : "Engineer"}
                </TText>
              </View>
              <TText style={styles.recipientHint}>Tap to change</TText>
            </TouchableOpacity>

            <Modal
              visible={showRecipientSelector}
              transparent
              animationType="fade"
              onRequestClose={() => setShowRecipientSelector(false)}
            >
              <TouchableOpacity
                style={styles.overlay}
                activeOpacity={1}
                onPressOut={() => setShowRecipientSelector(false)}
              >
                <View style={styles.modalCard}>
                  <View style={styles.modalHeader}>
                    <TText style={styles.modalTitle}>Select Recipient</TText>
                    <TouchableOpacity onPress={() => setShowRecipientSelector(false)}>
                      <Ionicons name="close" size={22} color="#0F172A" />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={styles.modalRow}
                    onPress={() => {
                      setSelectedSendTarget("employee");
                      setShowRecipientSelector(false);
                    }}
                  >
                    <Ionicons name="construct-outline" size={22} color="#2563EB" style={{ marginRight: 12 }} />
                    <View>
                      <TText style={styles.modalRowTitle}>Engineer</TText>
                      <TText style={styles.modalRowSub}>Engineer Conversation</TText>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.modalRow}
                    onPress={() => {
                      setSelectedSendTarget("customer");
                      setShowRecipientSelector(false);
                    }}
                  >
                    <Ionicons name="person-outline" size={22} color="#2563EB" style={{ marginRight: 12 }} />
                    <View>
                      <TText style={styles.modalRowTitle}>Customer</TText>
                      <TText style={styles.modalRowSub}>Send Notification To Customer</TText>
                    </View>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </Modal>
          </>
        )}

        {/* input + attach + send */}
        <View style={styles.inputBar}>
          <TextInput
            style={[
              styles.input,
              {
                height: Math.min(Math.max(inputHeight, 44), 140),
                textAlignVertical: "top",
              },
            ]}
            multiline
            placeholder="Write here..."
            placeholderTextColor="#94A3B8"
            value={newMessage}
            onChangeText={(text) => {
              setNewMessage(text);
              sendTyping();
            }}
            onContentSizeChange={(e) => {
              const height = e.nativeEvent.contentSize.height;
              setInputHeight(height);
            }}
          />

          <ModalSelector
            data={options}
            initValue=""
            onChange={async (option: any) => {
              if (option.key === "camera") await pickImageFromCamera(setNewUpdateFiles);
              else if (option.key === "gallery") await pickImageFromGallery();
              else if (option.key === "documents") await pickDocuments();
            }}
            style={{ marginHorizontal: 4 }}
            selectStyle={{ borderWidth: 0 }}
            optionTextStyle={{ fontSize: 14, color: "#0F172A", textTransform: "uppercase" }}
            cancelText="Cancel"
          >
            <TouchableOpacity style={styles.attachBtn}>
              <Ionicons name="attach" size={22} color="#2563EB" />
            </TouchableOpacity>
          </ModalSelector>

          <TouchableOpacity
            onPress={() => {
              if (!selectedSendTarget) {
                Alert.alert("Missing Option", "Please select Customer or Engineer.");
                return;
              }
              handleSend(selectedSendTarget);
            }}
            style={styles.sendBtn}
            disabled={loading || !selectedSendTarget}
            activeOpacity={0.85}
          >
            <Ionicons name="send" size={20} color="#2563EB" />
          </TouchableOpacity>
        </View>

        {/* ---------------- Footer nav (Back / Schedules / Inventory / Home) ---------------- */}
        <View style={styles.footerNav}>
          <TouchableOpacity onPress={handleGoBack} style={styles.footerItem} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={20} color="#0F172A" />
            <TText style={styles.footerText}>Back</TText>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleGoSchedules} style={styles.footerItem} activeOpacity={0.85}>
            <Ionicons name="calendar-outline" size={20} color="#0F172A" />
            <TText style={styles.footerText}>Schedules</TText>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleGoInventory} style={styles.footerItem} activeOpacity={0.85}>
            <Ionicons name="list-outline" size={20} color="#0F172A" />
            <TText style={styles.footerText}>Inventory</TText>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleGoHome} style={styles.footerItem} activeOpacity={0.85}>
            <Ionicons name="home-outline" size={20} color="#0F172A" />
            <TText style={styles.footerText}>Home</TText>
          </TouchableOpacity>
        </View>

        {/* image preview modal */}
        {previewImage && (
          <Modal visible transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
            <View style={styles.previewOverlay}>
              <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewImage(null)}>
                <Ionicons name="close" size={30} color="#fff" />
              </TouchableOpacity>

              <Image source={{ uri: previewImage }} style={styles.previewImg} />
            </View>
          </Modal>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F6F8FC" },
  root: { flex: 1, backgroundColor: "#F6F8FC" },

  // header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#EAEAEA",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  headerMid: { flex: 1, alignItems: "center", paddingHorizontal: 10 },
  headerTitle: { fontSize: 16, fontWeight: "900", color: "#0F172A" },
  headerSub: { marginTop: 2, fontSize: 12, fontWeight: "700", color: "#64748B" },

  // property card
  propertyCard: {
    marginTop: 10,
    marginHorizontal: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  propertyCardLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  propertyThumb: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  propertyThumbText: { fontWeight: "900", color: "#0F172A" },
  propertyCode: { fontSize: 14, fontWeight: "900", color: "#0F172A" },
  propertyMeta: { marginTop: 2, fontSize: 11, fontWeight: "700", color: "#64748B" },

  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusText: { fontSize: 12, fontWeight: "900" },
  dropBtn: { padding: 6, borderRadius: 10 },

  // search
  searchRow: {
    marginTop: 10,
    marginHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  searchInput: { flex: 1, fontSize: 13.5, fontWeight: "800", color: "#0F172A" },
  clearPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  filterPills: { flexDirection: "row", alignItems: "center", gap: 8 },
  filterPill: {
    height: 40,
    minWidth: 44,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  filterPillActive: { backgroundColor: "#E8F1FF", borderColor: "#CFE2FF" },
  filterPillText: { fontWeight: "900", color: "#64748B" },
  filterPillTextActive: { color: "#2563EB" },

  // chat shell
  chatShell: {
    flex: 1,
    marginTop: 10,
    marginHorizontal: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  chatScroll: { flex: 1 },
  chatContent: {
    paddingTop: 14,
    paddingBottom: 14,
  },

  // message row
  msgRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 12,
    marginBottom: 14,
    gap: 8,
  },
  msgRowMine: { justifyContent: "flex-end" },
  msgRowOther: { justifyContent: "flex-start" },

  avatar: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontWeight: "900" },

  nameTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  nameText: { fontSize: 13, fontWeight: "900" },
  nameTextMine: { fontSize: 13, fontWeight: "900", color: "#0F172A" },
  timeText: { fontSize: 11, fontWeight: "700", color: "#94A3B8" },

  bubble: {
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  textRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  msgText: { fontSize: 14, fontWeight: "700", color: "#0F172A", lineHeight: 19 },
  flagIcon: { marginLeft: 6, fontSize: 12 },

  replyPreview: {
    backgroundColor: "#F1F5F9",
    borderLeftWidth: 3,
    borderLeftColor: "#2563EB",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 10,
  },
  replyPreviewText: { fontSize: 12, fontWeight: "700", color: "#334155" },

  attachmentImg: { width: 190, height: 120, borderRadius: 14, backgroundColor: "#F1F5F9" },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  docText: { flex: 1, fontSize: 13, fontWeight: "800", color: "#2563EB" },

  reactionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  reactionBubble: {
    backgroundColor: "#E8F1FF",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#CFE2FF",
  },
  reactionText: { fontSize: 12, fontWeight: "900", color: "#0F172A" },

  actionTray: { marginTop: 8, marginLeft: 6 },
  reactionPicker: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#F1F5F9",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  pinStarRow: { marginTop: 8, flexDirection: "row", gap: 10 },
  actionBubble: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  actionText: { fontSize: 12.5, color: "#0F172A", fontWeight: "900" },

  // pending files
  pendingFilesWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  pendingFileCard: {
    width: 96,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 8,
    position: "relative",
  },
  pendingThumb: { width: "100%", height: 64, borderRadius: 10, backgroundColor: "#F1F5F9" },
  pendingDocIcon: {
    width: "100%",
    height: 64,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  pendingName: { marginTop: 6, fontSize: 11, fontWeight: "800", color: "#334155" },
  removeFileBtn: {
    position: "absolute",
    top: -8,
    right: -8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },

  // reply bar
  replyBar: {
    marginHorizontal: 12,
    marginTop: 10,
    backgroundColor: "#F1F5F9",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  replyBarTitle: { fontSize: 12, fontWeight: "900", color: "#0F172A" },
  replyBarText: { fontSize: 12, fontWeight: "700", color: "#64748B" },
  replyClose: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  // recipient card
  recipientCard: {
    marginTop: 10,
    marginHorizontal: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  recipientText: { fontSize: 14, fontWeight: "900", color: "#0F172A" },
  recipientHint: { fontSize: 12, fontWeight: "800", color: "#64748B" },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 120,
  },
  modalCard: {
    width: "92%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  modalTitle: { fontSize: 16, fontWeight: "900", color: "#0F172A" },
  modalRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 14,
    paddingHorizontal: 10,
  },
  modalRowTitle: { fontSize: 14, fontWeight: "900", color: "#0F172A" },
  modalRowSub: { fontSize: 12, fontWeight: "700", color: "#64748B", marginTop: 2 },

  // input bar
  inputBar: {
    marginTop: 10,
    marginHorizontal: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
  },
  input: {
    flex: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  attachBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F1FF",
    borderWidth: 1,
    borderColor: "#CFE2FF",
  },

  // footer nav
  footerNav: {
    marginTop: 10,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#EAEAEA",
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 8,
    justifyContent: "space-around",
  },
  footerItem: { alignItems: "center", justifyContent: "center", gap: 4, flex: 1 },
  footerText: { fontSize: 11, fontWeight: "900", color: "#0F172A" },

  // preview
  previewOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  previewClose: { position: "absolute", top: 40, right: 20, zIndex: 999 },
  previewImg: { width: "92%", height: "78%", resizeMode: "contain", borderRadius: 12 },
});

export default PropertyChatMessages;
