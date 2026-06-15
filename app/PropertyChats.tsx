import { DebouncedFunc } from 'lodash';
import debounce from 'lodash.debounce';
import Toast from 'react-native-toast-message';
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Image, TextInput, KeyboardAvoidingView, Platform, ScrollView, Linking, NativeSyntheticEvent, NativeScrollEvent, Alert, Modal,
  Pressable, Dimensions} from "react-native";
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import axios from 'axios';
import { TouchableWithoutFeedback, Keyboard } from "react-native";
import SocketManager from '@/utils/socketManager';
import useSocketEvents from '@/hooks/useSocketEvents';
import { router, useLocalSearchParams } from 'expo-router';
import { ReactNativeZoomableView } from '@openspacelabs/react-native-zoomable-view';
import { Animated } from "react-native";
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as mime from 'react-native-mime-types';
import ModalSelector from "@/components/AppModalSelect";
import { useFontScale } from "@/context/FontScaleContext";
import AppFooterNav, { FooterNavItem } from './AppFooterNav';
import TText from '@/components/TText';
import { useSpeechToText } from '@/utils/useSpeechToText';
import { ThemeProvider, useTheme } from "@/src/theme/ThemeProvider";

import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
import { authenticatedFetch } from "../utils/auth";
interface FileAttachment { uri: string; name: string; type: string; file?: File}
interface ChatMessage {
  is_temp: boolean;
  reply_to_engineer_name: any;
  message_id: number;
  property_id: string;
  project_id: string;
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
  is_ticket?: boolean; // To track if the message is part of a ticket
  ticket_status?: string;
  ticket_priority?: string;
  ticket_number?: string;
  ticket_raised_by?: string;
  linked_ticket_id?: string;
  ticket_title?: string; // ✅ Add this line
  message?: string; // Added missing 'message' property
  id?: number; // Added missing 'id' property
  priority?: 'High' | 'Medium' | 'Low'; // Added missing 'priority' property
  ticket_id?: number; // Links a reply to a ticket
  ticket_type: string;
  sender?: 'engineer' | 'customer'; // Used for aligning message bubbles
  linked_ticket_info?: { priority?: 'High' | 'Medium' | 'Low'; status?: string;issue_type_name?: string; visible_to_clients?: boolean;};
}

interface Props {propertyId: string; projectId: string;
  userDetails: { employee_code: string; first_name: string; last_name?: string; email: string;};
}
interface Ticket {id: number; message: string; priority: 'High' | 'Medium' | 'Low';}
const PropertyChats: React.FC<Props> = ({ propertyId, userDetails, projectId }) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showReactionsFor, setShowReactionsFor] = useState<number | null>(null);
  const [showEmojiPickerFor, setShowEmojiPickerFor] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState<string>('');
  const [newUpdateFiles, setNewUpdateFiles] = useState<FileAttachment[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const seenIds = useRef<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState<number[]>([]);
  const searchInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollHeightBeforeFetch = useRef<number>(0);
  const scrollLockedRef = useRef(false);
  const lastFetchedBeforeId = useRef<number | null>(null);
  const socketManagerRef = useRef<ReturnType<typeof SocketManager.getInstance> | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [filter, setFilter] = useState<'all' | 'starred' | 'pinned' | 'tagged'>('all');
  const [selectedActionMessageId, setSelectedActionMessageId] = useState<number | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);
  const currentUserCode = userDetails.employee_code;
  const currentUserName = userDetails.last_name ? `${userDetails.first_name} ${userDetails.last_name}` : userDetails.first_name;
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [inputHeight, setInputHeight] = useState(40);
  const [selectedSendTarget, setSelectedSendTarget] = useState<'customer' | 'internal'>('internal'); // default
  const [showTicketModal, setShowTicketModal] = useState(false); // Modal visibility state
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null); // Selected message for raising a ticket
  const [selectedTab, setSelectedTab] = useState<string>('general');
  const [ticketDescription, setTicketDescription] = useState('');
  const [ticketPriority, setTicketPriority] = useState<'High' | 'Medium' | 'Low'>('Medium');
  const raisedMessages = messages.filter((msg) => msg.is_ticket);
  const [ticketTitle, setTicketTitle] = useState('');
  const [showTicketActionsDropdown, setShowTicketActionsDropdown] = useState(false);
  const [externalTickets, setExternalTickets] = useState<any[]>([]);
  const [closedTickets, setClosedTickets] = useState<string[]>([]);
  const tabScrollRef = useRef<ScrollView>(null);
  const tabLayouts = useRef<Record<string, { x: number; width: number }>>({});
  const [showRecipientSelector, setShowRecipientSelector] = useState(false);
  const [availableTickets, setAvailableTickets] = useState<any[]>([]);
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [messageToTag, setMessageToTag] = useState<ChatMessage | null>(null);
  const selectorRef = useRef<any>(null);
  const [assignedToOptions, setAssignedToOptions] = useState<{ key: string; label: string }[]>([]);
  const [selectedAssignee, setSelectedAssignee] = useState<{ key: string; label: string } | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(ticketTitle);
  const [externalTicketChats, setExternalTicketChats] = useState<{ [ticketId: string]: ChatMessage[] }>({});
  const [selectedTicketType, setSelectedTicketType] = useState<'customer' | 'internal'>('customer');
  const [showMsgMenu, setShowMsgMenu] = useState(false);
  const [menuMessage, setMenuMessage] = useState<ChatMessage | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
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
        Alert.alert("Voice input", message);
      },
    });
const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const openMsgMenu = (msg: ChatMessage, x: number, y: number) => { setMenuMessage(msg);setMenuPos({ x, y }); setShowMsgMenu(true);};
  
  const footerItems: FooterNavItem[] = [
    { id: 0, title: "Back", iconName: "arrow-back-outline" },
    { id: 2, title: "Schedules", iconName: "calendar-outline" },
    { id: 3, title: "Inventory", iconName: "list-outline" },
    { id: 4, title: "Labour", iconName: "people-outline" },
    { id: 5, title: "Documents", iconName: "document-text-outline" },
    { id: 7, title: "Review", iconName: "construct-outline" },
  ];
  const COLORS = {border: "#E6EAF2", accent: "#2C7BE5", accentSoft: "#E8F1FF", muted: "#6B7A90",disabledText: "#9AA0A6",};
  const [selectedSection, setSelectedSection] = useState<number>(2);
  const online = isConnected !== false;
  const propertyName = useMemo(() => String((useLocalSearchParams() as any)?.propertyName ?? (useLocalSearchParams() as any)?.property_name ?? ""), []);
  const projectLocation = useMemo(() => String( (useLocalSearchParams() as any)?.projectLocation ??(useLocalSearchParams() as any)?.project_location ?? "" ),[]);
  const isDisabledOffline = (id: number) => !online && (id === 5 || id === 7);
    const onFooterSelect = (item: FooterNavItem) => {
    if (item.id === 0) { router.back(); return; }
    if (isDisabledOffline(item.id)) {  Alert.alert("Offline", "This section is unavailable offline.");return;}
    setSelectedSection(item.id);
      router.push({
      pathname: "/PropertiesListScreen",
      params: { propertyId,selectedSection: String(item.id),  projectId, propertyName,  projectLocation,userDetails: JSON.stringify(userDetails), },
    } as any);
  };
  
  const closeMsgMenu = () => {
    setShowMsgMenu(false);
    setMenuMessage(null);
  };
  const getActiveTicketMeta = () => {
    if (!selectedTab || selectedTab === 'general') {
      return { ticketNo: null, status: null, label: 'Select Ticket' };
    }
    const tabId = selectedTab.startsWith('#') ? selectedTab.slice(1) : selectedTab;
    const ext = externalTickets.find((t) => t.issue_id === tabId);
    if (ext) {
      const ticketNo = String(ext.issue_id).split('_').pop() || String(ext.issue_id);
      const status = ext.status || null;
      return { ticketNo, status, label: `#${ticketNo}  ${String(status || '').toUpperCase()}`.trim(), };
    }
      const ticketNo = String(tabId).split('_').pop() || String(tabId);
    const status = isTicketClosed(tabId) ? 'Closed' : 'In Progress';
    return {ticketNo,status, label: `#${ticketNo}  ${String(status).toUpperCase()}`,};
  };
  
  const activeTicket = getActiveTicketMeta();
  useEffect(() => {
    if (showTicketModal) {
      axios.get(`${APP_API_BASE_URL}/assigned-employees/${propertyId}`) .then((res) => {
          const options = res.data?.employees?.map((emp: any) => ({
            key: emp.employee_code,
            label: emp.full_name || emp.email || emp.employee_code, 
          })) || [];
          setAssignedToOptions(options);
        })
    }}, [showTicketModal]);

  useEffect(() => {
    if (showTagSelector && selectorRef.current) {
      selectorRef.current.open();
    }
  }, [showTagSelector]);
  const handleTagTicket = async (msg: ChatMessage) => {
    try {
      setMessageToTag(msg);
      const res = await axios.get(`${APP_API_BASE_URL}/tickets/property/${propertyId}`);
      const tickets = res.data?.tickets || [];
      setAvailableTickets(tickets);
      setShowTagSelector(true);
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to load tickets',});
    }
  };

  const appendFilesCrossPlatform = async ( formData: FormData, attachments: FileAttachment[], key = 'files') => {
    for (const f of attachments) {
      const name = f.name || `file_${Date.now()}`;
      const guessedType = f.type || (mime.lookup(name) as string) || 'application/octet-stream';
      if (Platform.OS === 'web') {
        if (f.file instanceof File) { formData.append(key, new File([f.file], name, { type: f.file.type || guessedType })); } else {
          const resp = await fetch(f.uri);
          const blob = await resp.blob();
          formData.append(key, new File([blob], name, { type: guessedType }));
        }
      } else { formData.append(key, { uri: f.uri, name, type: guessedType,} as any);}
    }};

  const formatFileName = (propertyId: string, originalName: string): string => {
    const now = new Date();
    const pad = (num: number): string => String(num).padStart(2, '0');
    const day = pad(now.getDate());
    const month = pad(now.getMonth() + 1);
    const year = now.getFullYear();
    let hours = now.getHours();
    const minutes = pad(now.getMinutes());
    const seconds = pad(now.getSeconds());
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours === 0 ? 12 : hours;
    const formattedTime = `${pad(hours)}-${minutes}-${seconds}_${ampm}`;
    const formattedDate = `${day}-${month}-${year}`;
    const extMatch = originalName.match(/\.[0-9a-z]+$/i);
    const ext = extMatch ? extMatch[0] : '';
    return `${propertyId}_${formattedDate}_${formattedTime}${ext}`;
  };


  const pickImageFromCamera = async (setNewUpdateFiles: (updater: (prev: any[]) => any[]) => void) => {
    if (Platform.OS === 'web') {
      try {['webcam-preview', 'capture-btn', 'cancel-btn', 'button-container'].forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.remove();
        });
        const video = document.createElement('video');
        video.id = 'webcam-preview';
        video.style.position = 'fixed';
        video.style.top = '0';
        video.style.left = '0';
        video.style.width = '100vw';
        video.style.height = '100vh';
        video.style.zIndex = '9998';
        video.style.objectFit = 'cover';
        video.autoplay = true;
        video.playsInline = true;
        document.body.appendChild(video);
        // 🧱 Button Container (Centered)
        const buttonContainer = document.createElement('div');
        buttonContainer.id = 'button-container';
        buttonContainer.style.position = 'fixed';
        buttonContainer.style.bottom = '40px';
        buttonContainer.style.left = '50%';
        buttonContainer.style.transform = 'translateX(-50%)';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '20px';
        buttonContainer.style.zIndex = '9999';
        document.body.appendChild(buttonContainer);
        // ❌ Cancel Button
        const cancelBtn = document.createElement('button');
        cancelBtn.id = 'cancel-btn';
        cancelBtn.innerText = '❌ Cancel';
        Object.assign(cancelBtn.style, {
          padding: '12px 24px',
          fontSize: '12px',
          backgroundColor: 'gray',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
        });

        // 📸 Capture Button
        const captureBtn = document.createElement('button');
        captureBtn.id = 'capture-btn';
        captureBtn.innerText = '📸 Capture';
        Object.assign(captureBtn.style, {
          padding: '12px 24px',
          fontSize: '12px',
          backgroundColor: '#1976D2',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
        });

        buttonContainer.appendChild(cancelBtn);
        buttonContainer.appendChild(captureBtn);

        // 🔥 Start webcam
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        video.srcObject = stream;

        const cleanup = () => {
          stream.getTracks().forEach((track) => track.stop());
          [video, buttonContainer].forEach((el) => el.remove());
        };

        captureBtn.onclick = () => {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

          canvas.toBlob((blob) => {
            if (!blob) return;
            const renamed = formatFileName(propertyId, `camera_${Date.now()}.jpg`);
            const file = new File([blob], renamed, {
              type: 'image/jpeg',
            });
            const webFile = { uri: URL.createObjectURL(blob),  name: file.name,  type: file.type,  file, };
            setNewUpdateFiles((prev) => [...prev, webFile]);
            cleanup();
          }, 'image/jpeg');
        };
        cancelBtn.onclick = () => cleanup();
      } catch (err) {
        alert('Camera access failed. Please allow permission.');
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
        type: 'image/jpeg',
      }));
      setNewUpdateFiles((prev) => [...prev, ...files]);
    }
  };

  const pickImageFromGallery = async () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;

      input.onchange = () => {
        const files = Array.from(input.files || []).map((file) => {
          const renamed = formatFileName(propertyId, file.name);

          return {
            uri: URL.createObjectURL(file),
            name: renamed,
            type: file.type || 'image/jpeg',
            file, // needed for FormData
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
        type: 'image/jpeg',
      }));

      setNewUpdateFiles((prev) => [...prev, ...files]);
    }
  };

  const pickDocuments = async () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '*/*';
      input.multiple = true;

      input.onchange = () => {
        const files = Array.from(input.files || []).map((file) => ({
          uri: URL.createObjectURL(file),
          name: formatFileName(propertyId, file.name),
          type: file.type || mime.lookup(file.name) || 'application/octet-stream',
          file, // ✅ Raw file for web upload
        }));

        setNewUpdateFiles((prev) => [...prev, ...files]);
      };

      input.click();
      return;
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      multiple: true,
    });

    if (!result.canceled && result.assets.length > 0) {
      const files = result.assets.map((asset) => ({
        uri: asset.uri,
        name: formatFileName(propertyId, asset.name || `document_${Date.now()}`),
        type: asset.mimeType || mime.lookup(asset.name || '') || 'application/octet-stream',
      }));

      setNewUpdateFiles((prev) => [...prev, ...files]);
    }
  };


  const triggerNotification = async ({
    employee_code,
    property,
    message_id,
    message,
    device_id = 'UNKNOWN_DEVICE',
    from_customer = false,
  }: {
    employee_code: string;
    property: string;
    message_id: string;  // use the server message_id when you have it
    message: string;
    device_id?: string;
    from_customer?: boolean;
  }) => {
    try {
      const payload = {
        employee_code,
        property,              // <-- maps to backend 'property'
        message_id,            // <-- used as workflow id suffix
        message,               // <-- backend prefers 'message' over 'message_text'
        device_id,
        from_customer,         // influences Slack/Expo routing in your workflow
        visible_to_clients: from_customer,
      };

      const res = await authenticatedFetch(`${APP_API_BASE_URL}/trigger-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error('❌ Notification failed:', res.status, err);
      } else {
        console.log('📢 Notification triggered successfully');
      }
    } catch (err) {
      console.error('❌ Error sending notification:', err);
    }
  };
  const startListening = async () => {
    await startSpeechToText();
  };
  
  const stopListening = async () => {
    await stopSpeechToText();
  };
  
  const toggleListening = () => {
    if (isListening) stopListening();
    else startListening();
  };
  

  
  const handleSend = async (sendTarget: 'customer' | 'internal') => {
    if (!propertyId || !currentUserName || !currentUserCode) {
      Alert.alert('Error', 'Missing required fields.');
      return;
    }

    const messageBody = newMessage.trim(); // capture BEFORE any reset
    if (!messageBody && newUpdateFiles.length === 0) {
      Alert.alert('Error', 'Cannot send an empty message.');
      return;
    }

    const visibleToClients = sendTarget === 'customer';

    // ---------- Build FormData ----------
    const formData = new FormData();
    formData.append('property_id', propertyId);
    formData.append('engineer_name', currentUserName);
    formData.append('employee_code', currentUserCode);
    formData.append('message_text', messageBody);
    formData.append('ticket_type', sendTarget);
    formData.append('visible_to_clients', String(visibleToClients));

    // linked_ticket_id (general vs ticket tabs)
    if (selectedTab !== 'general' && selectedTab.startsWith('#ISS_')) {
      formData.append('linked_ticket_id', selectedTab.slice(1)); // remove '#'
    } else {
      formData.append('linked_ticket_id', '');
    }

    // reply threading
    if (replyToMessage) {
      formData.append('reply_to_message_id', String(replyToMessage.message_id));
    }

    // ---------- Attach files (cross-platform) ----------
    await appendFilesCrossPlatform(formData, newUpdateFiles, 'files');

    // ---------- Optimistic UI ----------
    const now = new Date();
    const formattedDate = `${String(now.getDate()).padStart(2, '0')}-${String(
      now.getMonth() + 1
    ).padStart(2, '0')}-${now.getFullYear()}, ${now.getHours() % 12 || 12}:${String(
      now.getMinutes()
    ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')} ${now.getHours() >= 12 ? 'PM' : 'AM'
      }`;

    const tempId = Date.now();

    setMessages((prev) => [
      ...prev,
      {
        message_id: tempId,
        is_temp: true,
        property_id: propertyId,
        project_id: projectId,
        engineer_name: currentUserName,
        employee_name: currentUserName,
        employee_code: currentUserCode,
        message_text: messageBody,
        created_at: formattedDate,
        reply_to_message_id: replyToMessage?.message_id,
        reply_to_text: replyToMessage?.message_text,
        reply_to_engineer_name: replyToMessage?.engineer_name,
        ticket_type: sendTarget,
        linked_ticket_id: selectedTab !== 'general' ? selectedTab.slice(1) : undefined,
        files: newUpdateFiles.map((f) => ({
          file_url: f.uri,
          file_name: f.name,
          file_type: f.type,
        })),
        reactions: {},
        is_starred: false,
        is_pinned: false,
      },
    ]);

    // Also mirror into the ticket thread if we’re inside a customer ticket tab
    if (selectedTab !== 'general' && selectedTab.startsWith('#ISS_')) {
      const ticketId = selectedTab.slice(1);
      const optimisticMessage: ChatMessage = {
        message_id: tempId,
        is_temp: true,
        property_id: propertyId,
        project_id: projectId,
        engineer_name: currentUserName,
        employee_name: currentUserName,
        employee_code: currentUserCode,
        message_text: messageBody,
        created_at: formattedDate,
        reply_to_message_id: replyToMessage?.message_id,
        reply_to_text: replyToMessage?.message_text,
        reply_to_engineer_name: replyToMessage?.engineer_name,
        ticket_type: sendTarget,
        linked_ticket_id: ticketId,
        files: newUpdateFiles.map((f) => ({
          file_url: f.uri,
          file_name: f.name,
          file_type: f.type,
        })),
        reactions: {},
        is_starred: false,
        is_pinned: false,
      };

      setExternalTicketChats((prev) => {
        const existing: ChatMessage[] = prev[ticketId] ?? [];
        const updated: ChatMessage[] = [...existing, optimisticMessage];
        updated.sort((a, b) => (a.message_id ?? 0) - (b.message_id ?? 0));
        return { ...prev, [ticketId]: updated };
      });
    }

    // (Delay resets until after network so we can reuse messageBody if needed)

    try {
      setLoading(true);
      let data: any = null;

      if (Platform.OS === 'android') {
        const response = await authenticatedFetch(`${APP_API_BASE_URL}/property-chat/send`, {
          method: 'POST',
          headers: { Accept: 'application/json' }, // let boundary be auto-set
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
        const response = await axios.post(`${APP_API_BASE_URL}/property-chat/send`, formData, {
          headers: { Accept: 'application/json' }, // don't set Content-Type manually
        });
        data = response.data;
      }

      // Extract the new message id, fall back to temp
      const serverMsgId =
        (data && (data.message_id ?? data?.message?.message_id ?? data?.result?.message_id)) ?? tempId;

      // Notify only for customer-visible messages; this is engineer -> customer
      if (visibleToClients) {
        await triggerNotification({
          employee_code: currentUserCode,
          property: propertyId,
          message_id: String(serverMsgId),
          message: messageBody,
          device_id: 'UNKNOWN_DEVICE',
          from_customer: false, // <-- engineer sending, not customer
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send the message.');
    } finally {
      setLoading(false);

      // ---------- Reset UI ----------
      setNewMessage('');
      setNewUpdateFiles([]);
      setReplyToMessage(null);
      setSelectedSendTarget('internal');
      setTimeout(() => scrollToBottom(true), 100);
    }
  };


  const isTicketClosed = (ticketId: string | number): boolean => {
    return closedTickets.includes(String(ticketId));
  };


  const ticketId = selectedTab?.startsWith('#ISS_') ? selectedTab.slice(1) : selectedTab;

  const isClosed = closedTickets.includes(String(ticketId));
  const animOpacity = useRef(new Animated.Value(isClosed ? 0.6 : 1)).current;
  const animBg = useRef(new Animated.Value(isClosed ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(animOpacity, {
      toValue: isClosed ? 0.6 : 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    Animated.timing(animOpacity, {
      toValue: isClosed ? 0.6 : 1,
      duration: 300,
      useNativeDriver: true, // ✅ opacity is fine with native driver
    }).start();
  }, [isClosed]);

  const scrollToTab = (tabKey: string) => {
    const layout = tabLayouts.current[tabKey];
    if (layout && tabScrollRef.current) {
      tabScrollRef.current.scrollTo({ x: layout.x - 16, animated: true }); // -16 for some margin
    }
  };

  useEffect(() => {
    socketManagerRef.current = SocketManager.getInstance(propertyId, currentUserCode, currentUserName);
    socketManagerRef.current.connect();
    return () => {
      socketManagerRef.current?.disconnect();
    };
  }, [propertyId]);


  const handleCloseTicket = async (ticketId: string) => {
    try {
      // 🔍 Find the ticket
      const ticket = externalTickets.find((t) => t.issue_id === ticketId);

      if (!ticket) {
        Alert.alert('Ticket Not Found', `Ticket #${ticketId} does not exist.`);
        return;
      }

      // 🚫 Check assigned employee
      if (ticket.assigned_to_employee_code !== currentUserCode) {
        Alert.alert(
          'Access Denied',
          `You are not the assigned employee for Ticket #${ticketId}. Only the assigned person can close it.`
        );
        return;
      }

      // ✅ Proceed to close
      const formData = new FormData();
      formData.append('employee_code', currentUserCode);

      const response = await authenticatedFetch(`${APP_API_BASE_URL}/tickets/${ticketId}/close`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to close ticket');
      }

      Toast.show({
        type: 'success',
        text1: `Ticket #${ticketId} closed successfully.`,
      });

      Alert.alert('✅ Ticket Closed', `Ticket #${ticketId} has been successfully closed.`);

      // 🔄 Update state
      setClosedTickets((prev) => [...prev, String(ticketId)]);

      setExternalTickets((prev) =>
        prev.map((ticket) =>
          ticket.issue_id === ticketId ? { ...ticket, status: 'Closed' } : ticket
        )
      );

      setMessages((prev) =>
        prev.map((msg) =>
          msg.linked_ticket_id === ticketId || String(msg.message_id) === String(ticketId)
            ? { ...msg, ticket_status: 'Closed' }
            : msg
        )
      );
    } catch (error: any) {
      console.error('❌ Error closing ticket:', error);
      Toast.show({
        type: 'error',
        text1: 'Close Failed',
        text2: error.message || 'Something went wrong.',
      });

      Alert.alert('❌ Failed to Close Ticket', error.message || 'Something went wrong. Please try again.');
    }
  };


  const handleReopenTicket = async (ticketId: string) => {
    try {
      const formData = new FormData();
      formData.append('employee_code', currentUserCode);

      const response = await authenticatedFetch(`${APP_API_BASE_URL}/tickets/${ticketId}/reopen`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Server responded with error:', data);
        throw new Error(data.detail || 'Failed to reopen ticket');
      }

      Toast.show({
        type: 'success',
        text1: `Ticket #${ticketId} reopened successfully.`,
      });

      Alert.alert('✅ Ticket Reopened', `Ticket #${ticketId} has been successfully reopened.`);

      setClosedTickets((prev) => prev.filter((id) => String(id) !== String(ticketId)));

      setExternalTickets((prev) =>
        prev.map((ticket) => (ticket.issue_id === ticketId ? { ...ticket, status: 'Open' } : ticket))
      );
    } catch (error: any) {
      console.error('❌ Error reopening ticket:', error);

      Toast.show({
        type: 'error',
        text1: 'Reopen Failed',
        text2: error.message || 'Something went wrong.',
      });

      Alert.alert('❌ Failed to Reopen Ticket', error.message || 'Please try again.');

      // 👇 Optionally fallback UI updates (if needed even on failure)
      setClosedTickets((prev) => prev.filter((id) => String(id) !== String(ticketId)));

      setExternalTickets((prev) =>
        prev.map((ticket) => (ticket.issue_id === ticketId ? { ...ticket, status: 'Open' } : ticket))
      );
    }
  };


  useEffect(() => {
    if (!selectedTab) {
      handleTabChange('general');
    }
  }, []);

  const fetchCustomerTickets = async () => {
    try {
      const res = await axios.get(`${APP_API_BASE_URL}/tickets/property/${propertyId}`);
      const tickets = res.data?.tickets || [];

      // ✅ Save the fetched tickets
      setExternalTickets(tickets);

      // ✅ Automatically track closed ticket IDs
      const closed = tickets.filter((t: any) => t.status === 'Closed').map((t: any) => String(t.issue_id));

      setClosedTickets(closed);
    } catch (err) {
      console.error('❌ Failed to fetch customer tickets:', err);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Couldn’t load customer tickets',
      });
    }
  };

  useEffect(() => {
    fetchCustomerTickets(); // load customer ticket tabs
    fetchMessages({ initialLoad: true }); // load general messages
  }, [propertyId]);

  useSocketEvents({
    propertyId,
    employeeCode: currentUserCode,
    engineerName: currentUserName,

    onNewMessage: async (data) => {
      if (!('linked_ticket_id' in data)) {
        data.linked_ticket_id = null;
      }

      if (data.linked_ticket_id) {
        try {
          const ticketRes = await axios.get(`${APP_API_BASE_URL}/customer-ticket-chat/${data.linked_ticket_id}`);
          const ticket = ticketRes.data?.ticket;

          data.ticket_status = ticket?.status;
          data.ticket_priority = ticket?.priority;
          data.ticket_title = ticket?.description || 'Customer Ticket';
        } catch (e) {
          console.warn('⚠️ Failed to fetch ticket metadata for WS message:', data.linked_ticket_id);
        }

        // 🔁 Update ticket tab messages
        setExternalTicketChats((prev) => {
          const messages = prev[data.linked_ticket_id] || [];

          const tempIndex = messages.findIndex(
            (m) => m.is_temp && m.message_text === data.message_text && m.employee_code === data.employee_code
          );

          let updated;
          if (tempIndex !== -1) {
            updated = [...messages];
            updated[tempIndex] = {
              ...updated[tempIndex],
              ...data,
              is_temp: false,
            };
          } else {
            const exists = messages.some((m) => m.message_id === data.message_id);
            if (exists) return prev;

            updated = [...messages, data];
          }

          updated.sort((a, b) => {
            const aTime = a.message_id ?? new Date(a.created_at).getTime() ?? 0;
            const bTime = b.message_id ?? new Date(b.created_at).getTime() ?? 0;
            return aTime - bTime;
          });

          return {
            ...prev,
            [data.linked_ticket_id]: updated,
          };
        });
      } else {
        // 🧾 General chat
        setMessages((prev) => {
          const tempIndex = prev.findIndex(
            (m) => m.is_temp && m.message_text === data.message_text && m.employee_code === data.employee_code
          );

          if (tempIndex !== -1) {
            const updated = [...prev];
            updated[tempIndex] = {
              ...updated[tempIndex],
              ...data,
              is_temp: false,
            };
            return updated.sort((a, b) => a.message_id - b.message_id);
          }

          const exists = prev.some((m) => m.message_id === data.message_id);
          return exists ? prev : [...prev, data].sort((a, b) => a.message_id - b.message_id);
        });
      }
    },

    onReactionUpdate: (data) => {
      // 🌍 General messages
      setMessages((prev) => prev.map((m) => (m.message_id === data.message_id ? { ...m, reactions: data.reactions || {} } : m)));

      // 🧾 Ticket messages
      setExternalTicketChats((prev) => {
        const updated = { ...prev };

        for (const ticketId in updated) {
          updated[ticketId] = updated[ticketId].map((m) =>
            m.message_id === data.message_id ? { ...m, reactions: data.reactions || {} } : m
          );
        }

        return updated;
      });
    },

    onStarUpdate: (data) => {
      if (filter !== 'all') return;

      // 🌍 General messages
      setMessages((prev) =>
        prev.map((m) =>
          m.message_id === data.message_id
            ? {
              ...m,
              is_starred: data.is_starred,
              starred_by: data.starred_by || [],
            }
            : m
        )
      );

      // 🧾 Ticket messages
      setExternalTicketChats((prev) => {
        const updated = { ...prev };

        for (const ticketId in updated) {
          updated[ticketId] = updated[ticketId].map((m) =>
            m.message_id === data.message_id
              ? {
                ...m,
                is_starred: data.is_starred,
                starred_by: data.starred_by || [],
              }
              : m
          );
        }

        return updated;
      });
    },
  });

  const toggleStar = async (messageId: number) => {
    const formData = new FormData();
    formData.append('employee_code', currentUserCode);
    try {
      const res = await authenticatedFetch(`${APP_API_BASE_URL}/property-chat/${messageId}/star`, {
        method: 'POST',
        body: formData,
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result?.error || 'Failed to star message');

      // ✅ Show toast
      Toast.show({
        type: 'success',
        text1: 'Star Updated',
        text2: result.message || 'Star toggled',
      });
      setShowReactionsFor(null);
      setShowEmojiPickerFor(null);

      // ✅ Update local state without refreshing
      setMessages((prev) =>
        filter === 'starred'
          ? prev.filter((m) => m.message_id !== messageId)
          : filter === 'pinned'
            ? prev
            : prev.map((m) => (m.message_id === messageId ? { ...m, is_starred: !m.is_starred } : m))
      );

      // ✅ Broadcast WebSocket to others
      socketManagerRef.current?.send({
        type: 'star_update',
        message_id: messageId,
        employee_code: currentUserCode,
      });
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: err.message || 'Something went wrong',
      });
    }
  };


  const ticketTabId = selectedTab.startsWith('#') ? selectedTab.slice(1) : null;

  const displayedMessages =
    selectedTab === 'general'
      ? (filter === 'tagged'
        ? messages.filter((msg) => typeof msg.linked_ticket_id === 'string' && msg.linked_ticket_id.trim().startsWith('ISS_'))
        : messages) 
      : (selectedTab.startsWith('#ISS_')
        ? externalTicketChats[ticketTabId!] || []
        : messages.filter((msg) => msg.linked_ticket_id === ticketTabId?.slice(1)));


  type FetchMessageOptions = {
    beforeId?: number;
    initialLoad?: boolean;
  };

  const NAME_COLORS = ['#D32F2F', '#1976D2', '#388E3C', '#F57C00', '#7B1FA2', '#0097A7', '#FBC02D', '#5D4037', '#0288D1', '#C2185B'];
  const getColorForName = (name: string) => {
    const hash = [...name].reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return NAME_COLORS[hash % NAME_COLORS.length];
  };

  const fetchMessages = async (options: FetchMessageOptions = {}) => {
    const { beforeId, initialLoad = false } = options;

    if (loading || (!hasMore && !initialLoad)) return;
    setLoading(true);

    try {
      let endpoint = `/property-chat/${propertyId}`;
      if (filter === 'starred') {
        endpoint = `/property-chat/${propertyId}/starred`;
      } else if (filter === 'pinned') {
        endpoint = `/property-chat/${propertyId}/pinned`;
      }

      const res = await axios.get(`${APP_API_BASE_URL}${endpoint}`, {
        params: { limit: 50, ...(beforeId && { before_message_id: beforeId }) },
      });

      const rawMessages: ChatMessage[] = res.data || [];
      console.log('📥 Fetched messages:', rawMessages.length, 'Filter:', filter);

      const newMessages = rawMessages.filter((msg) => !seenIds.current.has(msg.message_id));
      newMessages.forEach((msg) => seenIds.current.add(msg.message_id));

      const messageMap: { [id: number]: string } = {};
      const allMessagesForMap = initialLoad ? newMessages : [...newMessages, ...messages];
      allMessagesForMap.forEach((msg) => {
        messageMap[msg.message_id] = msg.message_text;
      });
      const enrichedMessages = newMessages.map((msg) => {
        const replyToText = msg.reply_to_message_id ? messageMap[msg.reply_to_message_id] || 'Referenced message' : undefined;

        const ticketInfo = msg.linked_ticket_info || {};

        return {
          ...msg,
          reply_to_text: replyToText,
          ticket_priority: ticketInfo.priority || undefined,
          ticket_status: ticketInfo.status || undefined,
          ticket_title: ticketInfo.issue_type_name || undefined,
        };
      });

      if (initialLoad) {
        setMessages([...enrichedMessages.reverse()]);
        scrollToBottom(true);
      } else {
        setMessages((prev) => [...enrichedMessages.reverse(), ...prev]);
      }

      if (newMessages.length < 20) setHasMore(false);

      // 🧠 NEW: Load external linked ticket threads
      const linkedTicketIds = new Set<string>();
      newMessages.forEach((msg) => {
        if (msg.linked_ticket_id) {
          linkedTicketIds.add(msg.linked_ticket_id);
        }
      });

      for (const ticketId of linkedTicketIds) {
        if (!externalTicketChats[ticketId]) {
          const res = await axios.get(`${APP_API_BASE_URL}/customer-ticket-chat/${ticketId}`); // ✅ correct one

          const chatMessages = res.data?.messages || [];

          const transformedMessages: ChatMessage[] = chatMessages
            .map((c: any) => ({
              message_id: c.message_id,
              message_text: c.message_text,
              employee_code: c.employee_code || '',
              engineer_name: c.engineer_name || 'Unknown',
              employee_name: c.employee_name || 'Unknown',
              created_at: c.created_at, // ✅ keep raw string
              files: c.files || [],
              is_temp: false,
              is_ticket: false,
              reply_to_message_id: c.reply_to_message_id,
              reply_to_text: c.reply_to_text,
              reply_to_engineer_name: c.reply_to_engineer_name,
              linked_ticket_id: ticketId,
              ticket_priority: c.priority,
              ticket_status: c.status,
              ticket_title: c.message_text || 'Customer Chat',
            }))
            .reverse();

          setExternalTicketChats((prev) => ({
            ...prev,
            [ticketId]: transformedMessages,
          }));
        }
      }
    } catch (e) {
      console.error('❌ Failed to fetch messages', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    seenIds.current.clear();
    setMessages([]);
    setHasMore(true);

    const endpoint =
      filter === 'starred'
        ? `/property-chat/${propertyId}/starred`
        : filter === 'pinned'
          ? `/property-chat/${propertyId}/pinned`
          : `/property-chat/${propertyId}`;
    axios.get(`${APP_API_BASE_URL}${endpoint}`, { params: filter === 'all' ? { limit: 50 } : {} }).then((res) => {
      const fetched = res.data || [];
      if (filter === 'all') {
        fetched.forEach((m: any) => seenIds.current.add(m.message_id));
        console.log('📥 Raw response from API');
      }
      const uniqueMessages = fetched.reduce((acc: ChatMessage[], msg: ChatMessage) => {
        if (!acc.some((m) => m.message_id === msg.message_id)) {
          acc.push(msg);
        }
        return acc;
      }, []);
      setMessages([]); // flush old visually stuck messages
      setTimeout(() => {
        setMessages(uniqueMessages.reverse());
        setTimeout(() => scrollToBottom(true), 100); // <-- Force scroll after setting messages!
      }, 0);
      console.log(`📌 Pinned/Starred loaded: ${fetched.length}, Unique: ${uniqueMessages.length}`);
      scrollToBottom(true);
    });
  }, [propertyId, filter]);

  const scrollToBottom = (instant = false) => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: !instant });
    }, 100);
  };
  const scrollLock = useRef(false);
  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const yOffset = e.nativeEvent.contentOffset.y;
    if (
      yOffset < 100 &&
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

  const debounceSearchRef = useRef<DebouncedFunc<(query: string) => void>>();

  useEffect(() => {
    debounceSearchRef.current = debounce(async (query: string) => {
      if (filter === 'tagged') {
        console.log('🎟️ Skipping search in tagged mode');
        return;
      }
      if (!query.trim()) {
        if (filter === 'all') {
          seenIds.current.clear();
          setHasMore(true);
          fetchMessages({ initialLoad: true });
        }
        return;
      }
      try {
        const isTicketTab = selectedTab.startsWith('#ISS_');
        const ticketId = selectedTab.slice(1);

        const apiEndpoint = isTicketTab ? `${APP_API_BASE_URL}/property-chat/search-by-ticket`: `${APP_API_BASE_URL}/property-chat/search`;
        const params = isTicketTab? { issue_id: ticketId, query } : { property_id: propertyId, query };
        const res = await axios.get(apiEndpoint, { params });
        const results = res.data;
        const formattedResults = results.map((msg: any) => ({
          ...msg,
          engineer_name: msg.employee_name,
          files: msg.files || [],
          reactions: msg.reactions || {},
          is_starred: msg.is_starred || false,
          is_pinned: msg.is_pinned || false,
        }));

        if (isTicketTab) {
          setExternalTicketChats((prev) => ({
            ...prev,
            [ticketId]: formattedResults,
          }));
        } else {
          setMessages(formattedResults);
        }
        setHasMore(false);
      } catch (err) {
        Toast.show({
          type: 'error',
          text1: 'Search Error',
          text2: 'Something went wrong',
        });
      }
    }, 500);
  }, [selectedTab, filter, propertyId]);


  useEffect(() => {
    setSearchQuery('');
    debounceSearchRef.current?.cancel(); // 🛑 Cancel old debounce if mid-flight
  }, [selectedTab]);



  const debounceSearch = useRef(
    debounce(async (query: string) => {
      if (filter === 'tagged') return; // 🎟️ Skip searching in tagged mode

      if (!query.trim()) {
        if (filter === 'all') {
          seenIds.current.clear();
          setHasMore(true);
          fetchMessages({ initialLoad: true });
        }
        return;
      }

      try {
        const isTicketTab = selectedTab.startsWith('#ISS_');
        const ticketId = selectedTab.slice(1);

        const apiEndpoint = isTicketTab
          ? `${APP_API_BASE_URL}/property-chat/search-by-ticket`
          : `${APP_API_BASE_URL}/property-chat/search`;

        const params = isTicketTab
          ? { issue_id: ticketId, query }
          : { property_id: propertyId, query };

        const res = await axios.get(apiEndpoint, { params });
        const results = res.data;

        console.log('🔍 Search results:', results.length);

        const formattedResults = results.map((msg: any) => ({
          ...msg,
          engineer_name: msg.employee_name,
          files: msg.files || [],
          reactions: msg.reactions || {},
          is_starred: msg.is_starred || false,
          is_pinned: msg.is_pinned || false,
        }));

        if (isTicketTab) {
          // For ticket chats, update only the current ticket chat thread
          setExternalTicketChats((prev) => ({
            ...prev,
            [ticketId]: formattedResults,
          }));
        } else {
          // For general chat, update main messages
          setMessages(formattedResults);
        }

        setHasMore(false);
      } catch (err) {
        console.error('❌ Search error', err);
        Toast.show({
          type: 'error',
          text1: 'Search Error',
          text2: 'Something went wrong',
        });
      }
    }, 500)
  ).current;


  useEffect(() => {
    if (filter !== 'tagged') {
      setSearchQuery('');
      debounceSearch.cancel(); // 🛑 Cancel any pending search only if not tagged
    }
  }, [filter]);




  const sendTyping = useRef(
    debounce(() => {
      socketManagerRef.current?.send({
        type: 'typing',
        property_id: propertyId,
        engineer_name: currentUserName,
        employee_code: currentUserCode,
      });
    }, 1000)
  ).current;

  const handleEmojiReaction = async (messageId: number, emoji: string) => {
    try {
      const formData = new FormData();
      formData.append('emoji', emoji);
      formData.append('employee_code', currentUserCode);
      const res = await authenticatedFetch(`${APP_API_BASE_URL}/property-chat/${messageId}/react`, { method: 'POST', body: formData });
      const result = await res.json();
      if (!res.ok) throw new Error('Failed to react');
      setMessages((prev) => prev.map((m) => (m.message_id === messageId ? { ...m, reactions: result.reactions } : m)));
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Could not update reaction' });
    } finally {
      setShowReactionsFor(null);
    }
  };


  const handleCreateTicketFromMessage = async (message: ChatMessage & { ticket_type: 'customer' | 'internal' }) => {
    const formData = new FormData();
    formData.append('project_id', projectId);
    formData.append('property_id', message.property_id);
    formData.append('message_id', message.message_id.toString());
    formData.append('reported_by_email', `${userDetails.first_name} ${userDetails.last_name}`);
    formData.append('created_by_employee_code', userDetails.employee_code);
    formData.append('priority', ticketPriority);
    formData.append('severity', 'Major');
    formData.append('issue_type', '4');
    formData.append('approximate_date', new Date().toISOString().split('T')[0]);
    formData.append('assigned_to_employee_code', selectedAssignee?.key || '');
    formData.append('ticket_type', message.ticket_type);
    formData.append('ticket_title', ticketTitle);
    formData.append('description', ticketDescription);  // ✅ this will match

    try {
      const res = await authenticatedFetch(`${APP_API_BASE_URL}/tickets/create-from-message`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        const issueId = data.issue_id;

        // ✅ Safeguard: ensure issueId is valid
        const isValidTicketId = issueId && issueId !== 'null' && issueId !== 'undefined' && typeof issueId === 'string';

        Toast.show({
          type: 'success',
          text1: 'Ticket Created',
          text2: `Ticket# ${issueId} from message #${data.linked_message_id}`,
        });

        // ✅ Refresh general messages
        await fetchMessages({ initialLoad: true });

        // ✅ Patch message locally with ticket info only if ID is valid
        setMessages((prev) =>
          prev.map((msg) =>
            msg.message_id === data.linked_message_id
              ? {
                ...msg,
                is_ticket: isValidTicketId,
                ticket_number: isValidTicketId ? issueId.split('_').pop() : undefined,
                linked_ticket_id: isValidTicketId ? issueId : undefined,
              }
              : msg
          )
        );

        // 🔁 Refresh external ticket tabs
        await fetchCustomerTickets();

        // ❌ DO NOT switch to an invalid tab
        if (isValidTicketId && selectedTab !== 'general') {
          handleTabChange(`#${issueId}`);
        }
      } else {
        throw new Error(data.message || 'Ticket creation failed');
      }
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: err.message || 'Failed to raise ticket',
      });
    }
  };


  const filterTabs = [
    { key: "all", label: "All", icon: null },
    { key: "tagged", label: "", icon: "confirmation-number"  }, // 💬 like screenshot
    { key: "starred", label: "", icon: "star-outline" },       // ☆ like screenshot
  ];
  
  

  const parseCustomDateFromStr = (input: string): Date => {
    try {
      const [datePart, timePart] = input.split(', ');  // Split date and time
      const [day, month, year] = datePart.split('-');  // Split the date into day, month, and year
      const [time, period] = timePart.split(' ');  // Split time and period (AM/PM)
      let [hours, minutes, seconds] = time.split(':').map(Number);  // Split time into hours, minutes, and seconds
      if (period === 'PM' && hours < 12) hours += 12;  // Convert PM to 24-hour format
      if (period === 'AM' && hours === 12) hours = 0;  // Convert 12 AM to 00 hours
      return new Date(
        `${year}-${month}-${day}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      );
    } catch {
      return new Date();  
    }
  };

  const handleTabChange = async (tabKey: string) => {
    if (!tabKey || tabKey === '#null' || tabKey === '#undefined' || (tabKey.startsWith('#ISS_') && tabKey.slice(1) === 'null')) {
      console.warn('🚫 Ignoring invalid tabKey:', tabKey);
      return;
    }
    setSelectedTab(tabKey);
    setTimeout(() => scrollToTab(tabKey), 100);
    if (tabKey === 'general') {
      seenIds.current.clear();
      setMessages([]);
      setHasMore(true);
      await fetchMessages({ initialLoad: true });
      scrollToBottom(true);
      return;
    }

    // 🟦 Ticket tab logic
    if (tabKey.startsWith('#ISS_')) {
      const ticketId = tabKey.slice(1);

      if (!externalTicketChats[ticketId]) {
        try {
          const res = await axios.get(`${APP_API_BASE_URL}/customer-ticket-chat/${ticketId}`);
          const chatData = res.data.messages || [];

          const transformedMessages: ChatMessage[] = chatData
            .map((msg: any) => ({
              message_id: msg.message_id,
              message_text: msg.message_text,
              employee_code: msg.employee_code,
              engineer_name: msg.engineer_name,
              employee_name: msg.employee_name,
              created_at: msg.created_at,
              files: msg.files || [],
              is_temp: false,
              reply_to_message_id: msg.reply_to_message_id,
              reply_to_text: msg.reply_to_text,
              linked_ticket_id: ticketId,
              ticket_priority: res.data.ticket.priority,
              ticket_status: res.data.ticket.status,
              ticket_title: res.data.ticket.description || 'Customer Ticket',
            }))
            .reverse();

          setExternalTicketChats((prev) => ({
            ...prev,
            [ticketId]: transformedMessages,
          }));
        } catch (err) {
          console.error('❌ Failed to load external ticket chat:', err);
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: "Couldn't load ticket chat.",
          });
        }
      }
    }
  };

  const ticketDropdownOptions = React.useMemo(() => {
    const tabMap = new Map<string, { key: string; label: string }>();
  
    // External tickets (from API)
    externalTickets.forEach((ticket) => {
      const key = `#${ticket.issue_id}`;
      const ticketNumber = ticket.issue_id?.split('_')?.pop() || ticket.issue_id;
      const isInternal = ticket.ticket_type === 'internal';
      const isClosed = ticket.status === 'Closed';
  
      tabMap.set(key, {
        key,
        label: `${isInternal ? 'E ' : ''}#${ticketNumber}${isClosed ? ' (Closed)' : ''}`,
      });
    });
  
    // Any ticket chat threads loaded dynamically (safety net)
    Object.keys(externalTicketChats).forEach((ticketId) => {
      if (!ticketId || ticketId === 'null' || ticketId === 'undefined' || ticketId.trim() === '') return;
  
      const key = `#${ticketId}`;
      if (!tabMap.has(key)) {
        const ticketNumber = ticketId.split('_').pop() || ticketId;
        const isClosed = isTicketClosed(ticketId);
        tabMap.set(key, {
          key,
          label: `E #${ticketNumber}${isClosed ? ' (Closed)' : ''}`,
        });
      }
    });
  
    // ModalSelector expects { key, label }
    return [
      { key: 'general', label: 'General' },
      ...Array.from(tabMap.values()),
    ];
  }, [externalTickets, externalTicketChats, closedTickets]);
  


  return (
    <View style={styles.container} testID="property-chats-root">
      <View style={styles.headerContainer}>
        <View style={styles.headerTitleContainer}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name='arrow-back' size={24} color={C.mutedText} />
          </TouchableOpacity>
          <TText style={styles.headerTitle}>Property chats</TText>
        </View>
        <TouchableOpacity onPress={() => router.push('/HomeScreen')}>
          <Ionicons name='home' size={24} color={C.mutedText} />
        </TouchableOpacity>
      </View>
      <View style={styles.ticketTabsContainer}>

      <View style={styles.tabRow}>
  <ModalSelector
    data={ticketDropdownOptions} // MUST include { key: 'general', label: 'General' } also
    cancelText="Cancel"
    onChange={(option: any) => handleTabChange(option.key as string)}
    optionTextStyle={{ fontSize: 11, color: C.text }}
    optionContainerStyle={{ backgroundColor: C.surface, borderBottomColor: C.border }}
    cancelStyle={{ backgroundColor: C.surface }}
    cancelTextStyle={{ color: C.text }}
    overlayStyle={{ backgroundColor: C.overlay }}
  >
    <TouchableOpacity style={styles.ticketSelector} activeOpacity={0.85}>
      <TText style={styles.ticketSelectorText} numberOfLines={1}>
        {ticketDropdownOptions.find((t) => t.key === selectedTab)?.label || "General"}
      </TText>

      <Ionicons name="chevron-down" size={18} color={C.mutedText} />
    </TouchableOpacity>
  </ModalSelector>
</View>

</View>


      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
        {selectedTab.startsWith('#') &&
          (() => {
            const tabId = selectedTab.slice(1);
            const internalTicket = messages.find((m) => m.message_id === parseInt(tabId));
            const externalTicket = externalTickets.find((t) => t.issue_id === tabId);

            const ticketLabel = internalTicket?.ticket_title || externalTicket?.description || `Ticket #${tabId}`;
            const isClosed = externalTicket ? externalTicket.status === 'Closed' : internalTicket?.ticket_status === 'Closed';

            const ticketTitle = internalTicket?.ticket_title || externalTicket?.ticket_title;
            // const ticketDescription = internalTicket?.description || externalTicket?.description;

            return (
              <View style={{ marginHorizontal: 12, marginTop: 0, marginBottom: 4 }}>
                <Animated.View
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    opacity: animOpacity,
                    backgroundColor: animBg.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['#e7f0fd', '#f8d7da'],
                    }),
                    borderColor: animBg.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['#c6d4e1', '#f5c6cb'],
                    }),
                  }}
                >
                  <View style={{ marginBottom: 4 }}>
                    {!isEditingTitle ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                        <TText style={{ fontWeight: 'bold', fontSize: 11, color: C.text }}>
                          {ticketTitle} {closedTickets.includes(String(ticketId)) ? '(Closed)' : ''}
                        </TText>
                        <TouchableOpacity onPress={() => setIsEditingTitle(true)} style={{ marginLeft: 6 }}>
                          <TText style={{ fontSize: 11, color: C.primaryStrong }}>✏️</TText>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TextInput
                          style={{
                            borderWidth: 1,
                            borderColor: C.border,
                            borderRadius: 4,
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                            fontSize: 11,
                            flex: 1,
                            color: C.text,
                            backgroundColor: C.surface,
                          }}
                          value={editedTitle}
                          onChangeText={setEditedTitle}
                          placeholder="Enter new title"
                          placeholderTextColor={C.subtleText}
                        />
                        <TouchableOpacity
                          onPress={async () => {
                            try {
                              setLoading(true);
                              const res = await axios.post(`${APP_API_BASE_URL}/tickets/update-title`, {
                                issue_id: ticketId,
                                ticket_title: editedTitle,
                                updated_by_employee_code: currentUserCode,
                              });

                              console.log('✅ Update success:', res.data);

                              // Optimistically update local state
                              setTicketTitle(editedTitle);
                              setIsEditingTitle(false);

                              setExternalTickets((prev) =>
                                prev.map((ticket) =>
                                  ticket.issue_id === ticketId
                                    ? { ...ticket, ticket_title: editedTitle, description: editedTitle }
                                    : ticket
                                )
                              );

                              // 🔄 Fetch fresh copy from server for safety
                              await fetchCustomerTickets();
                            } catch (err) {
                              console.error('❌ Failed to update title', err);
                              Toast.show({
                                type: 'error',
                                text1: 'Update Failed',
                                text2: 'Could not update ticket title',
                              });
                            } finally {
                              setLoading(false);
                            }
                          }}
                          style={{ marginLeft: 8 }}
                        >
                          <TText style={{ color: C.primaryStrong, fontWeight: 'bold' }}>{loading ? 'Saving...' : '💾'}</TText>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => setIsEditingTitle(false)} style={{ marginLeft: 8 }}>
                          <TText style={{ fontSize: 11 }}>❌</TText>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Show description if different */}
                    {ticketLabel?.trim() !== ticketTitle?.trim() && !isEditingTitle && (
                      <TText style={{ fontSize: 11, color: C.mutedText }}>{ticketLabel}</TText>
                    )}
                  </View>



                  <TouchableOpacity onPress={() => setShowTicketActionsDropdown((prev) => !prev)} style={{ position: 'absolute', top: 10, right: 10 }}>
                    <Ionicons name='ellipsis-horizontal' size={20} color={C.mutedText} />
                  </TouchableOpacity>
                </Animated.View>

              </View>
            );
          })()}

        {showTicketActionsDropdown &&
          selectedTab.startsWith('#') &&
          (() => {
            const ticketIdStr = selectedTab.slice(1);
            const isExternal = ticketIdStr.startsWith('ISS_');
            const ticketId = isExternal ? ticketIdStr : parseInt(ticketIdStr);

            const ticketMsg = !isExternal ? messages.find((m) => m.message_id === ticketId) : null;
            let externalTicket = null;
            if (isExternal) {
              externalTicket = externalTickets.find((t) => t.issue_id === ticketIdStr);

              if (!externalTicket && externalTicketChats[ticketIdStr]?.length) {
                const msg = externalTicketChats[ticketIdStr][0];
                externalTicket = {
                  issue_id: ticketIdStr,
                  status: msg.ticket_status,
                  priority: msg.ticket_priority,
                  description: msg.ticket_title,
                };
              }
            }

            const isInternalRaised = ticketMsg !== undefined;
            if (!isInternalRaised && !externalTicket) return null;

            const isClosed = externalTicket?.status === 'Closed' || ticketMsg?.ticket_status === 'Closed';

            return (
              <View
                style={{
                  position: 'absolute',
                  top: 40,
                  left: '60%',
                  transform: [{ translateX: -75 }],
                  width: 200,
                  backgroundColor: C.surface,
                  padding: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: C.border,
                  shadowColor: '#000',
                  shadowOpacity: 0.2,
                  shadowOffset: { width: 0, height: 2 },
                  shadowRadius: 4,
                  elevation: 30,
                  zIndex: 9999,
                  alignItems: 'center',
                }}>
                <View style={{ alignSelf: 'flex-end', width: '100%' }}>
                  {!isClosed ? (
                    <TouchableOpacity
                      onPress={() => {
                        handleCloseTicket(ticketIdStr);
                        setShowTicketActionsDropdown(false);
                      }}
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 16,
                        alignItems: 'flex-end',
                        backgroundColor: C.dangerSoft,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: C.border,
                        marginBottom: 8,
                      }}>
                      <TText style={{ color: C.danger, fontWeight: 'bold', fontSize: 11 }}>❌ Close Ticket</TText>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() => {
                        handleReopenTicket(ticketIdStr);
                        setShowTicketActionsDropdown(false);
                      }}
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 16,
                        alignItems: 'flex-start',
                        backgroundColor: C.successSoft,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: C.border,
                        marginBottom: 8,
                      }}>
                      <TText style={{ color: C.success, fontWeight: 'bold', fontSize: 11 }}>🔄 Reopen Ticket</TText>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })()}

        <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginBottom: 8, gap: 6, flexWrap: 'wrap' }}>
          {/* 👥 Online user count */}
          {onlineUsers.length > 0 && (
            <View style={{ marginRight: 6 }}>
              <TText style={[styles.onlineUserCount, { fontSize: 11 }]}>{onlineUsers.length} online</TText>
            </View>
          )}

          {/* 🔍 Search input */}
          <TextInput
            placeholder='Search...'
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);

              if (!text.trim()) {
                // query is cleared (via backspace)
                const isTicketTab = selectedTab.startsWith('#ISS_');
                const ticketId = selectedTab.slice(1);

                if (isTicketTab) {
                  axios.get(`${APP_API_BASE_URL}/customer-ticket-chat/${ticketId}`)
                    .then((res) => {
                      const chatData = res.data.messages || [];

                      const transformedMessages: ChatMessage[] = chatData.map((msg: any) => ({
                        message_id: msg.message_id,
                        message_text: msg.message_text,
                        employee_code: msg.employee_code,
                        engineer_name: msg.engineer_name,
                        employee_name: msg.employee_name,
                        created_at: msg.created_at,
                        files: msg.files || [],
                        is_temp: false,
                        reply_to_message_id: msg.reply_to_message_id,
                        reply_to_text: msg.reply_to_text,
                        linked_ticket_id: ticketId,
                        ticket_priority: res.data.ticket.priority,
                        ticket_status: res.data.ticket.status,
                        ticket_title: res.data.ticket.description || 'Customer Ticket',
                      })).reverse();

                      setExternalTicketChats((prev) => ({
                        ...prev,
                        [ticketId]: transformedMessages,
                      }));
                    })
                    .catch((err) => {
                      console.error('❌ Failed to reload on backspace clear:', err);
                    });
                } else if (filter === 'all') {
                  seenIds.current.clear();
                  setHasMore(true);
                  fetchMessages({ initialLoad: true });
                }

                debounceSearchRef.current?.cancel(); // cancel active debounce if any
                return;
              }

              debounceSearchRef.current?.(text); // normal search
            }}
            style={{
              flex: 1,
              padding: 8,
              backgroundColor: C.surfaceAlt,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: C.border,
              fontSize: 11,
              minWidth: '50%',
              color: C.text,
            }}
            placeholderTextColor={C.subtleText}
          />

          {/* ✅ Filter Chips only in general tab */}
          {selectedTab === 'general' && (
  <View style={{ flexDirection: 'row', marginLeft: 6 }}>
    {filterTabs.map((tab) => {
      const isActive = filter === tab.key;

      return (
        <TouchableOpacity
          key={tab.key}
          onPress={() => setFilter(tab.key as any)}
          style={{ marginLeft: 8 }}
        >
          <View
            style={{
              paddingVertical: 6,
              paddingHorizontal: tab.key === 'all' ? 12 : 10,
              borderRadius: 16,
              backgroundColor: isActive ? C.primarySoft : C.surfaceAlt,
              minWidth: tab.key === 'all' ? 54 : 38,
              height: 30,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {tab.icon ? (
              <MaterialIcons
                name={tab.icon as any}
                size={18}
              />
            ) : (
              <TText style={{ fontWeight: isActive ? 'bold' : 'normal', color: isActive ? C.primaryStrong : C.text }}>
                {tab.label}
              </TText>
            )}
          </View>
        </TouchableOpacity>
      );
    })}
  </View>
)}


          {/* ❌ Clear Button */}
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={async () => {
                setSearchQuery('');
                debounceSearchRef.current?.cancel(); // 🛑 Stop mid-flight debounce

                const isTicketTab = selectedTab.startsWith('#ISS_');
                const ticketId = selectedTab.slice(1);

                if (isTicketTab) {
                  try {
                    console.log('🧼 Clear pressed in ticket tab:', ticketId);
                    const res = await axios.get(`${APP_API_BASE_URL}/customer-ticket-chat/${ticketId}`);
                    const chatData = res.data.messages || [];

                    const transformedMessages: ChatMessage[] = chatData.map((msg: any) => ({
                      message_id: msg.message_id,
                      message_text: msg.message_text,
                      employee_code: msg.employee_code,
                      engineer_name: msg.engineer_name,
                      employee_name: msg.employee_name,
                      created_at: msg.created_at,
                      files: msg.files || [],
                      is_temp: false,
                      reply_to_message_id: msg.reply_to_message_id,
                      reply_to_text: msg.reply_to_text,
                      linked_ticket_id: ticketId,
                      ticket_priority: res.data.ticket.priority,
                      ticket_status: res.data.ticket.status,
                      ticket_title: res.data.ticket.description || 'Customer Ticket',
                    })).reverse();

                    setExternalTicketChats((prev) => ({
                      ...prev,
                      [ticketId]: transformedMessages,
                    }));
                  } catch (err) {
                    console.error('❌ Failed to reload ticket chat after clear:', err);
                    Toast.show({
                      type: 'error',
                      text1: 'Reload Error',
                      text2: 'Could not reload ticket messages',
                    });
                  }
                } else if (filter === 'all') {
                  seenIds.current.clear();
                  setHasMore(true);
                  fetchMessages({ initialLoad: true });
                }
              }}
              style={{ marginLeft: 8 }}
            >
              <TText style={{ color: C.primaryStrong, fontSize: 11 }}>Clear</TText>
            </TouchableOpacity>
          )}

        </View>
        <View style={styles.chatBoxContainer}>
          <TouchableWithoutFeedback
            onPress={() => {
              setSelectedActionMessageId(null);
              setShowReactionsFor(null);
              setShowEmojiPickerFor(null);
              setShowEmojiPicker(false);
              Keyboard.dismiss();
            }}>
            <ScrollView
              key={`scroll-${selectedTab}`}
              ref={scrollViewRef}
              style={styles.chatScroll}
              contentContainerStyle={{ padding: 10 }}
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
              }}>
             {displayedMessages.map((msg: ChatMessage) => {
  const isMine = msg.employee_code === currentUserCode;

  const time = parseCustomDateFromStr(msg.created_at).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const showTicketCard = selectedTab === 'general' && !!msg.linked_ticket_id;

  return (
    <View key={msg.message_id} style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowOther]}>

      <View style={styles.msgMain}>
        <View style={[styles.msgMetaRow, isMine && { justifyContent: 'flex-end' }]}>
          {!isMine ? (
            <TText style={styles.msgName}>{msg.engineer_name?.trim() || 'Unknown'}</TText>
          ) : (
            <TText style={styles.msgNameMine}>You</TText>
          )}
          <TText style={styles.msgDot}> • </TText>
          <TText style={styles.msgTime}>{time}</TText>
        </View>

        {/* Ticket Card */}
        {showTicketCard ? (
          <TouchableOpacity
            onPress={() => handleTabChange(`#${msg.linked_ticket_id}`)}
            activeOpacity={0.85}
            style={[styles.ticketCard, isMine && { alignSelf: 'flex-end' }]}
          >
            <View style={styles.ticketCardTop}>
              <TText style={styles.ticketCardTitle}>
                #{msg.linked_ticket_id?.split('_').pop()}
              </TText>

              <View style={styles.ticketStatusPill}>
                <TText style={styles.ticketStatusText}>
                  {msg.ticket_status === 'Closed' ? 'Closed' : 'In Progress'}
                </TText>
              </View>
            </View>

            <TText style={styles.ticketCardBody}>{msg.message_text}</TText>

            <TouchableOpacity
              onPress={(e) => {
                const { pageX, pageY } = e.nativeEvent;
                openMsgMenu(msg, pageX, pageY);
              }}
              style={styles.dotsBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons name="more-vert" size={18} color={C.text} />
            </TouchableOpacity>

          </TouchableOpacity>
        ) : (
          <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
            {!!msg.message_text && <TText style={styles.bubbleText}>{msg.message_text}</TText>}

            {/* Attachments */}
            {msg.files?.length > 0 && (
              <View style={{ marginTop: 10 }}>
                {msg.files.map((file: any, idx: number) => {
                  const isImage = file.file_type?.startsWith('image');
                  return (
                    <TouchableOpacity
                      key={`${msg.message_id}-${idx}`}
                      onPress={() => (isImage ? setPreviewImage(file.file_url) : Linking.openURL(file.file_url))}
                      style={{ marginTop: 6 }}
                    >
                      {isImage ? (
                        <Image
                          source={{ uri: file.file_url }}
                          style={styles.attachImg}
                          resizeMode="cover"
                        />
                      ) : (
                        <TText style={styles.fileLink}>{file.file_name}</TText>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Reactions */}
            {msg.reactions && Object.keys(msg.reactions).length > 0 && (
              <View style={styles.reactionsRowNew}>
                {Object.entries(msg.reactions).map(([emoji, users]) => (
                  <View key={emoji} style={styles.reactionChip}>
                    <TText style={styles.reactionChipText}>
                      {emoji} {(users as string[]).length}
                    </TText>
                  </View>
                ))}
              </View>
            )}

            {/* Icons row at top right of bubble */}
            <View style={{ flexDirection: 'row', position: 'absolute', top: 6, right: 6, alignItems: 'center', gap: 4 }}>
               {msg.is_starred && <MaterialIcons name="assistant-photo" size={16} color={C.danger} />}
               {msg.linked_ticket_id && <MaterialIcons name="confirmation-number" size={16} color={C.primaryStrong} />}
               <TouchableOpacity
                 onPress={(e) => {
                   const { pageX, pageY } = e.nativeEvent;
                   openMsgMenu(msg, pageX, pageY);
                 }}
                 style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}
                 hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
               >
                 <Ionicons name="ellipsis-vertical" size={18} color={C.text} />
               </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );
})}


              {newUpdateFiles.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, paddingTop: 8 }}>
                  {newUpdateFiles.map((file: any, index: number) => {
                    const isImage = file.type?.includes('image');
                    return (
                      <View key={index} style={{ marginRight: 10, alignItems: 'center', marginBottom: 8, position: 'relative' }}>
                        {isImage ? (
                          <Image source={{ uri: file.uri }} style={{ width: 80, height: 80, borderRadius: 10 }} resizeMode='cover' />
                        ) : (
                          <Ionicons name='document' size={40} color={C.mutedText} />
                        )}
                        <TText numberOfLines={1} style={{ maxWidth: 80, fontSize: 11 }}>
                          {file.name}
                        </TText>

                        <TouchableOpacity
                          onPress={() => setNewUpdateFiles((prev) => prev.filter((_, i) => i !== index))}
                          style={{
                            position: 'absolute',
                            top: -6,
                            right: -6,
                            backgroundColor: C.danger,
                            borderRadius: 10,
                            padding: 2,
                            zIndex: 1,
                          }}>
                          <Ionicons name='close' size={14} color={C.white} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </TouchableWithoutFeedback>
        </View>
        <Modal visible={showTicketModal} transparent={true} animationType='fade' onRequestClose={() => setShowTicketModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <TText style={styles.modalTitle}>🎫 Raise a Ticket</TText>

              <View style={styles.fieldGroup}>
                <TText style={styles.fieldLabel}>Title</TText>
                <TextInput style={styles.input} placeholder='Enter ticket title' value={ticketTitle} onChangeText={setTicketTitle} />
              </View>

              <View style={styles.fieldGroup}>
                <TText style={styles.fieldLabel}>Description</TText>
                <TextInput
                  style={[styles.input, styles.textarea]}
                  placeholder='Enter ticket description'
                  value={ticketDescription}
                  onChangeText={setTicketDescription}
                  multiline
                />
              </View>

              <View style={styles.fieldGroup}>
                <TText style={styles.fieldLabel}>Priority</TText>
                <View style={styles.buttonRow}>
                  {['High', 'Medium', 'Low'].map((level) => (
                    <TouchableOpacity
                      key={level}
                      onPress={() => setTicketPriority(level as 'High' | 'Medium' | 'Low')}
                      style={[styles.optionButton, ticketPriority === level && styles.optionButtonSelected]}>
                      <TText style={[styles.optionText, ticketPriority === level && styles.optionTextSelected]}>{level}</TText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <TText style={styles.fieldLabel}>Ticket Type</TText>
                <View style={styles.buttonRow}>
                  {['customer', 'internal'].map((type) => (
                    <TouchableOpacity
                      key={type}
                      onPress={() => setSelectedTicketType(type as 'customer' | 'internal')}
                      style={[styles.optionButton, selectedTicketType === type && styles.optionButtonSelected]}>
                      <TText style={[styles.optionText, selectedTicketType === type && styles.optionTextSelected]}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </TText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <TText style={styles.fieldLabel}>Assign To</TText>
                <ModalSelector
                  data={assignedToOptions}
                  optionTextStyle={{ fontSize: 11, color: C.text, textTransform: 'uppercase' }}
                  optionContainerStyle={{ backgroundColor: C.surface, borderBottomColor: C.border }}
                  cancelStyle={{ backgroundColor: C.surface }}
                  cancelTextStyle={{ color: C.text }}

                  initValue={selectedAssignee?.label || 'Select an Employee'}
                  onChange={(option: any) => setSelectedAssignee(option)}
                  selectStyle={{
                    borderWidth: 1,
                    borderColor: C.border,
                    borderRadius: 8,
                    padding: 12,
                    backgroundColor: C.surfaceAlt,
                  }}
                  cancelText='Cancel'
                />
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity
                  onPress={() => setShowTicketModal(false)}
                  style={{
                    backgroundColor: C.danger,
                    paddingVertical: 12,
                    paddingHorizontal: 20,
                    borderRadius: 8,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginHorizontal: 8,
                  }}>
                  <TText style={{ color: C.white, fontWeight: '600', fontSize: 11 }}>Cancel</TText>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    if (!selectedMessage) return;
                    handleCreateTicketFromMessage({
                      ...selectedMessage,
                      message_text: ticketTitle || selectedMessage.message_text,
                      ticket_type: selectedTicketType,
                    });
                    setShowTicketModal(false);
                    setTicketTitle('');
                    setTicketDescription('');
                  }}
                  style={styles.createButton}>
                  <TText style={styles.createText}>Create Ticket</TText>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        {showTagSelector && messageToTag && (
          <ModalSelector
            ref={selectorRef}
            initValue='' // 💥 removes "Select me!"
            data={availableTickets.map((t) => ({
              key: t.issue_id,
              label: `#${t.issue_id.split('_').pop()} - ${t.description}`,
            }))}
            selectStyle={{ borderWidth: 0 }}
            optionTextStyle={{
              fontSize: 11,
              color: C.text,
              textTransform: 'uppercase',
            }}
            optionContainerStyle={{ backgroundColor: C.surface, borderBottomColor: C.border }}
            cancelStyle={{ backgroundColor: C.surface }}
            cancelTextStyle={{ color: C.text }}
            cancelText='Cancel'
            onChange={async (option: any) => {
              try {
                const formData = new FormData();
                formData.append('message_id', String(messageToTag!.message_id));
                formData.append('linked_ticket_id', option.key);
                formData.append('property_id', propertyId); // ✅ Required by backend
                formData.append('updated_by', currentUserCode); // ✅ Use employee code as updater
                formData.append('source', 'app'); // ✅ Tag source for audit

                await axios.post(`${APP_API_BASE_URL}/property-chat/link-ticket`, formData);

                Toast.show({
                  type: 'success',
                  text1: 'Tagged Successfully',
                });

                setMessages((prev) =>
                  prev.map((m) =>
                    m.message_id === messageToTag!.message_id
                      ? {
                        ...m,
                        linked_ticket_id: option.key,
                        ticket_status: 'Open',
                        ticket_priority: 'Medium',
                        ticket_title: option.label,
                      }
                      : m
                  )
                );

                setShowTagSelector(false);
                setMessageToTag(null);
              } catch (err) {
                console.error('❌ Tagging failed:', err);
                Toast.show({
                  type: 'error',
                  text1: 'Tagging Failed',
                });
              }
            }}
            onModalClose={() => {
              setShowTagSelector(false);
              setMessageToTag(null);
            }}
          />
        )}

        {replyToMessage && (
          <View
            style={{
              padding: 8,
              backgroundColor: C.surfaceAlt,
              borderLeftWidth: 4,
              borderLeftColor: C.primaryStrong,
              marginHorizontal: 10,
              marginBottom: 4,
              borderRadius: 6,
            }}>
            <TText style={{ fontWeight: 'bold', marginBottom: 2, color: C.text }}>Replying to {replyToMessage.engineer_name || 'Unknown'}</TText>
            <TText numberOfLines={1} style={{ color: C.mutedText }}>
              {replyToMessage.message_text}
            </TText>
            <TouchableOpacity onPress={() => setReplyToMessage(null)} style={{ position: 'absolute', top: 4, right: 8 }}>
              <TText style={{ color: C.primaryStrong, fontSize: 11 }}>X</TText>
            </TouchableOpacity>
          </View>
        )}
        <>
          <View>
            {newMessage.trim().length > 0 && (
              <>
                <TouchableOpacity
                  onPress={() => setShowRecipientSelector(true)}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: C.surfaceAlt,
                    paddingVertical: 14,
                    paddingHorizontal: 18,
                    borderRadius: 10,
                    borderColor: C.border,
                    borderWidth: 1,
                    width: '90%',
                    alignSelf: 'center',
                    marginLeft: 4,
                  }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons
                      name={
                        selectedSendTarget === 'customer'
                          ? 'person-outline'
                          : selectedSendTarget === 'internal'
                            ? 'construct-outline'
                            : 'people-outline'
                      }
                      size={18}
                      color={C.text}
                      style={{ marginRight: 6 }}
                    />
                    <TText style={{ color: C.text, fontWeight: '600', fontSize: 11}}>
                      {selectedSendTarget === 'customer' ? 'Customer' : selectedSendTarget === 'internal' ? 'Team' : 'Select Recipient'}
                    </TText>
                  </View>
                  <TText style={{ color: C.text }}>Tap to change</TText>
                </TouchableOpacity>

                <Modal
                  visible={showRecipientSelector}
                  transparent
                  animationType='fade'
                  onRequestClose={() => setShowRecipientSelector(false)}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      backgroundColor: C.overlayStrong,
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                    }}
                    activeOpacity={1}
                    onPressOut={() => setShowRecipientSelector(false)}>
                    <View
                      style={{
                        backgroundColor: C.surface,
                        borderRadius: 12,
                        width: '90%',
                        padding: 20,
                        marginBottom: 90,
                        shadowColor: '#000',
                        shadowOpacity: 0.2,
                        shadowRadius: 6,
                        elevation: 5,
                      }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 16,
                        }}>
                        <TText style={{ fontSize: 11, fontWeight: '700', color: C.text }}>Select Recipient</TText>
                        <TouchableOpacity onPress={() => setShowRecipientSelector(false)}>
                          <Ionicons name='close' size={22} color={C.text} />
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}
                        onPress={() => {
                          setSelectedSendTarget('internal');
                          setShowRecipientSelector(false);
                        }}>
                        <Ionicons name='construct-outline' size={24} color={C.primaryStrong} style={{ marginRight: 12 }} />
                        <View>
                          <TText style={{ fontSize: 11, fontWeight: '600', color: C.text }}>Team</TText>
                          <TText style={{ fontSize: 11, color: C.mutedText }}>Team Conversation</TText>
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}
                        onPress={() => {
                          setSelectedSendTarget('customer');
                          setShowRecipientSelector(false);
                        }}>
                        <Ionicons name='person-outline' size={24} color={C.primaryStrong} style={{ marginRight: 12 }} />
                        <View>
                          <TText style={{ fontSize: 11, fontWeight: '600', color: C.text }}>Customer</TText>
                          <TText style={{ fontSize: 11, color: C.mutedText }}>Send Notification To Customer</TText>
                        </View>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                </Modal>
              </>
            )}
          </View>

          <View style={styles.inputWrapper}>
  <View style={styles.row}>
    
    {/* Input box */}
    <View style={styles.composerCard}>
 
      {/* Text Input */}
      <TextInput
        ref={searchInputRef}
        style={[styles.input, { height: Math.max(44, Math.min(inputHeight, 80)) }]}
        multiline
        placeholder="Share your updates..."
        placeholderTextColor={C.subtleText}
        value={newMessage}
        onChangeText={(text) => {
          setNewMessage(text);
          sendTyping();
        }}
        onContentSizeChange={(e) => {
          const h = e.nativeEvent.contentSize.height;
          setInputHeight(h);
        }}
      />

<ModalSelector
        data={[
          { key: "camera", label: "Camera" },
          { key: "gallery", label: "Gallery" },
          { key: "documents", label: "Documents" },
        ]}
        initValue=""
        onChange={async (option: any) => {
          if (option.key === "camera") await pickImageFromCamera(setNewUpdateFiles);
          else if (option.key === "gallery") await pickImageFromGallery();
          else if (option.key === "documents") await pickDocuments();
        }}
        selectStyle={{ borderWidth: 0 }}
        optionTextStyle={{ fontSize: 11, color: C.text, textTransform: "uppercase" }}
        optionContainerStyle={{ backgroundColor: C.surface, borderBottomColor: C.border }}
        cancelStyle={{ backgroundColor: C.surface }}
        cancelTextStyle={{ color: C.text }}
        cancelText="Cancel"
      >
        <TouchableOpacity style={styles.attachBtn} activeOpacity={0.8}>
          <Ionicons name="attach" size={20} color={C.mutedText} />
        </TouchableOpacity>
      </ModalSelector>
      <TouchableOpacity style={styles.micBtn} onPress={toggleListening} activeOpacity={0.8}>
  <Ionicons
    name={isListening ? "mic" : "mic-outline"}
    size={22}
    color={isListening ? C.danger : C.primaryStrong}
  />
</TouchableOpacity>

{/* ✅ Recording Indicator */}
{isListening && (
  <View style={styles.recordingPill}>
    <View style={styles.recordingDot} />
    <TText style={styles.recordingText}>Recording...</TText>

    {/* optional stop shortcut */}
    <TouchableOpacity onPress={stopListening} style={styles.recordingStopBtn} activeOpacity={0.8}>
      <Ionicons name="stop-circle" size={18} color={C.danger} />
    </TouchableOpacity>
  </View>
)}
    </View>

    {/* Send Button (outside input) */}
    <TouchableOpacity
      onPress={() => {
        if (!selectedSendTarget) {
          Alert.alert("Missing Option", "Please select Customer or Engineer.");
          return;
        }
        handleSend(selectedSendTarget);
      }}
      style={[styles.sendSquareBtn, (loading || !selectedSendTarget) && styles.sendBtnDisabled]}
      disabled={loading || !selectedSendTarget}
      activeOpacity={0.85}
    >
      <Ionicons name="send" size={20} color={C.white} />
    </TouchableOpacity>
  </View>
</View>


        </>
        {showMsgMenu && (
  <Modal transparent animationType="fade" visible onRequestClose={closeMsgMenu}>
    <Pressable
      style={styles.popoverOverlay}
      onPress={closeMsgMenu}
    >
      <Pressable
        onPress={() => {}}
        style={[
          styles.popoverMenu,
          (() => {
            const { width: W, height: H } = Dimensions.get("window");
            const MENU_W = 190;
            const MENU_H = 150;
            const PAD = 10;
            const left = Math.max(PAD, Math.min(menuPos.x - MENU_W, W - MENU_W - PAD));
            const top = Math.max(PAD, Math.min(menuPos.y + 8, H - MENU_H - PAD));
            return { left, top };
          })(),
        ]}
      >
        <TouchableOpacity
          style={styles.popoverBtn}
          onPress={() => {
            if (menuMessage) setReplyToMessage(menuMessage);
            closeMsgMenu();
          }}
        >
          <Ionicons name="return-up-back" size={16} color={C.text} />
          <TText style={styles.popoverText}>Reply</TText>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.popoverBtn}
          onPress={() => {
            if (menuMessage) toggleStar(menuMessage.message_id);
            closeMsgMenu();
          }}
        >
          <MaterialIcons
            name={menuMessage?.is_starred ? "assistant-photo" : "outlined-flag"}
            size={16}
            color={C.text}
          />
          <TText style={styles.popoverText}>
            {menuMessage?.is_starred ? "Unflag" : "Flag"}
          </TText>
        </TouchableOpacity>

        {selectedTab === "general" && (
          <TouchableOpacity
            disabled={!!menuMessage?.linked_ticket_id}
            style={[
              styles.popoverBtn,
              menuMessage?.linked_ticket_id && { opacity: 0.45 },
            ]}
            onPress={() => {
              if (!menuMessage?.linked_ticket_id && menuMessage) {
                handleTagTicket(menuMessage);
              }
              closeMsgMenu();
            }}
          >
            <MaterialIcons name="confirmation-number" size={16} color={C.text} />
            <TText style={styles.popoverText}>
              {menuMessage?.linked_ticket_id ? "Already Tagged" : "Tag to Ticket"}
            </TText>
          </TouchableOpacity>
        )}
      </Pressable>
    </Pressable>
  </Modal>
)}



        {previewImage && (
          <Modal visible={true} transparent={true} animationType='fade' onRequestClose={() => setPreviewImage(null)}>
            <View
              style={{
                flex: 1,
                backgroundColor: 'rgba(0,0,0,0.95)',
              }}>
              <TouchableOpacity
                style={{
                  position: 'absolute',
                  top: 40,
                  right: 20,
                  zIndex: 999,
                }}
                onPress={() => setPreviewImage(null)}>
                <Ionicons name='close' size={32} color={C.white} />
              </TouchableOpacity>

              <ReactNativeZoomableView
                maxZoom={3}
                minZoom={1}
                zoomStep={0.3}
                initialZoom={1}
                bindToBorders={true}
                style={{
                  flex: 1,
                }}>
                <Image
                  source={{ uri: previewImage }}
                  style={{
                    width: '100%',
                    height: '100%',
                    resizeMode: 'contain',
                  }}
                />
              </ReactNativeZoomableView>
            </View>
          </Modal>
        )}
      </KeyboardAvoidingView>
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
  useBottomInset={true}
/>
      
    </View>
  );
};

const createStyles = (C: any) => StyleSheet.create({
  chatScroll: { flex: 1 },
  reactionPicker: { flexDirection: 'row',alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8, backgroundColor: '#f1f1f1',borderRadius: 12, marginTop: 4,height: 40,},
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, gap: 1 },
  reactionBubble: { backgroundColor: '#e6f3ff', borderRadius: 16, paddingHorizontal: 8, paddingVertical: 4 },
  emojiSelectorWrapper: { maxHeight: 250, backgroundColor: '#fff',borderTopWidth: 1, borderColor: '#ccc', marginTop: 2,borderRadius: 10,overflow: 'scroll',},
  reactionText: { fontSize: 11, color: '#333' },
  onlineUsersBanner: { marginTop: 0, marginBottom: 10 },
  onlineUserCount: { fontWeight: 'bold', color: C.success, fontSize: 11 },
  onlineUserNames: { fontSize: 11, color: C.mutedText, marginTop: 2 },
  pinStarRow: { marginTop: 8, flexDirection: 'row', justifyContent: 'flex-start', gap: 10, padding: 4 },
  actionBubble: { paddingVertical: 6, paddingHorizontal: 12,backgroundColor: C.surfaceAlt,borderRadius: 20, borderWidth: 1, borderColor: C.border,},
  actionText: { fontSize: 11, color: C.text, fontWeight: '600' },
  chatBoxContainer: { flex: 1, backgroundColor: C.surface, marginLeft: 10, marginRight: 10 },
  emojiWrapper: { height: 220, backgroundColor: C.surface, borderTopWidth: 1, borderColor: C.border, zIndex: 5 },
  emojiScrollContent: { paddingBottom: 10 },
  textarea: { minHeight: 40, textAlignVertical: 'top',},
  sendButton: { borderRadius: 20, padding: 10, marginLeft: 4 },
  absoluteEmojiPicker: {position: 'absolute',backgroundColor: C.surface,borderTopWidth: 1, bottom: Platform.OS === 'ios' ? 60 : 70, borderColor: C.border,zIndex: 999, width: '100%', padding: 10,},
  ticketActionContainer: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, marginBottom: 10 },
  emojiRow: { flexDirection: 'row', alignItems: 'center' },
  container: { flex: 1, backgroundColor: C.bg },
  headerContainer: {flexDirection: 'row',alignItems: 'center', padding: 16,backgroundColor: C.surface,borderBottomWidth: 1, borderBottomColor: C.border, justifyContent: 'space-between',},
  headerTitleContainer: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 15, fontWeight: 'bold', color: C.text, marginLeft: 10, fontFamily: 'Arial',alignItems: 'center' },
  prioritySelector: { marginBottom: 20 },
  selectorButton: { backgroundColor: C.surfaceAlt, padding: 10, borderRadius: 5 },
  selectorOption: { fontSize: 11, color: C.text },
  raiseTicketButton: { backgroundColor: C.primaryStrong, padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  raiseTicketText: { color: C.white, fontWeight: 'bold' },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.overlayStrong },
  modalContent: { backgroundColor: C.surface, padding: 20, borderRadius: 10, width: '80%' },
  modalTitle: { fontSize: 11, fontWeight: 'bold', marginBottom: 12, textAlign: 'center', color: C.text },
  modalMessage: { fontSize: 11, marginBottom: 12, color: C.text },
  closeButton: { backgroundColor: C.surfaceAlt, padding: 10, borderRadius: 8, alignItems: 'center' },
  closeButtonText: { color: C.text, fontWeight: 'bold' },
  ticketTab: {backgroundColor: C.primaryStrong,padding: 10, borderRadius: 10, marginTop: 10, marginRight: 10, marginBottom: 10,flexDirection: 'row', justifyContent: 'space-between',alignItems: 'center',},
  ticketTabText: { color: C.white, fontWeight: 'bold', fontSize: 11 },
  ticketTabId: { color: C.white, fontSize: 11 },
  removeTicketTabButton: { backgroundColor: C.danger, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  removeTicketTabText: { color: C.white, fontSize: 11, fontWeight: 'bold' },
  ticketTabsContainer: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, backgroundColor: C.surface },
  dropdownText: { fontSize: 11, paddingVertical: 8, paddingHorizontal: 16, color: C.text },
  activeTab: { backgroundColor: C.primaryStrong },
  ticketDetails: { padding: 10, backgroundColor: C.surfaceAlt, borderRadius: 8, marginBottom: 10 },
  ticketDetailsText: { fontSize: 11, color: C.text, marginBottom: 5 },
  reopenButton: { backgroundColor: C.primaryStrong, padding: 10, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  reopenButtonText: { color: C.white, fontWeight: 'bold' },
  ticketTabContainer: { flex: 1, backgroundColor: C.surface, padding: 10 },
  messageBubble: { padding: 10, marginVertical: 6, borderRadius: 10, maxWidth: '80%' },
  engineerBubble: { backgroundColor: C.successSoft, alignSelf: 'flex-end' },
  customerBubble: { backgroundColor: C.dangerSoft, alignSelf: 'flex-start' },
  senderName: { fontWeight: 'bold', marginBottom: 4, color: C.text },
  fieldLabel: { fontSize: 11, fontWeight: '600', marginBottom: 6, color: C.text },
  priorityButtonRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20 },
  priorityButton: { padding: 10, backgroundColor: C.surfaceAlt, borderRadius: 5 },
  priorityButtonSelected: { backgroundColor: C.primaryStrong },
  priorityText: { color: C.text },
  modalButtonRow: { flexDirection: 'row', justifyContent: 'space-between' },
  modalCard: {backgroundColor: C.surface, borderRadius: 16,padding: 24,width: '90%', elevation: 5,},
  fieldGroup: { marginBottom: 16,},
  buttonRow: { flexDirection: 'row',justifyContent: 'space-between',},
  optionButton: {flex: 1, paddingVertical: 10,borderRadius: 8,borderWidth: 1,borderColor: C.border,marginHorizontal: 4, backgroundColor: C.surfaceAlt, alignItems: 'center',},
  optionButtonSelected: {backgroundColor: C.primaryStrong,borderColor: C.primaryStrong,},
  optionText: {color: C.text, fontWeight: '500',},
  optionTextSelected: {color: C.white,},
  actionRow: {flexDirection: 'row',justifyContent: 'center', marginTop: 16,},
  cancelButton: {paddingVertical: 10,paddingHorizontal: 16, marginRight: 8,},
  cancelText: { color: C.mutedText,},
  msgRow: {flexDirection: 'row', alignItems: 'flex-start',marginBottom: 14, paddingHorizontal: 8,},
  msgRowMine: { justifyContent: 'flex-end' },
  msgRowOther: { justifyContent: 'flex-start' },
  avatarWrap: { width: 34, alignItems: 'center' },
  avatarCircle: { width: 24,height: 24, borderRadius: 17, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center',},
  avatarText: { fontWeight: '800', color: C.text },
  msgMain: { flex: 1, maxWidth: '78%' },
  msgMetaRow: { flexDirection: 'row',alignItems: 'center', marginBottom: 6, },
  msgName: { fontSize: 11, fontWeight: '700', color: C.text },
  msgNameMine: { fontSize: 11, fontWeight: '700', color: C.text },
  msgDot: { color: C.subtleText, fontSize: 11 },
  msgTime: { fontSize: 11, color: C.subtleText, fontStyle: 'italic' },
  bubble: { position: 'relative', paddingVertical: 12,paddingHorizontal: 14, paddingRight: 44, borderRadius: 14,maxWidth: '80%', shadowColor: '#000', shadowOpacity: 0.06,shadowOffset: { width: 0, height: 2 },shadowRadius: 6, elevation: 2,},
  bubbleMine: { backgroundColor: C.primarySoft, borderTopRightRadius: 6, alignSelf: 'flex-end', },
  bubbleOther: {backgroundColor: C.surface,borderTopLeftRadius: 6, alignSelf: 'flex-start', },
  bubbleText: { fontSize: 11, color: C.text, lineHeight: 20 },
  dotsBtn: { position: 'absolute', top: 6,right: 6, width: 30, height: 30,borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceAlt,zIndex: 10,},
  attachImg: { width: 180, height: 120, borderRadius: 12 },
  fileLink: {color: C.primaryStrong,fontSize: 11,textDecorationLine: 'underline',},
  reactionsRowNew: { flexDirection: 'row',flexWrap: 'wrap', marginTop: 10, gap: 6,},
  reactionChip: { backgroundColor: C.surfaceAlt, borderRadius: 14,paddingVertical: 4, paddingHorizontal: 10,},
  reactionChipText: { fontSize: 11, color: C.text, fontWeight: '600' },
  ticketCard: { position: 'relative', backgroundColor: C.surfaceAlt,borderRadius: 16, padding: 14, paddingRight: 44,
    borderWidth: 1, borderColor: C.border, shadowColor: '#000', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 2,},
  
  ticketCardTop: {flexDirection: 'row',alignItems: 'center',justifyContent: 'space-between',marginBottom: 10, },
  ticketCardTitle: { fontSize: 11, fontWeight: '800', color: C.text },
  ticketStatusPill: { backgroundColor: C.primarySoft,paddingVertical: 6, paddingHorizontal: 10,  borderRadius: 12,},
  ticketStatusText: { fontSize: 11, fontWeight: '800', color: C.primaryStrong },
  ticketCardBody: { fontSize: 11, color: C.text },
  popoverOverlay: {flex: 1,  backgroundColor: "transparent",},
  popoverMenu: {position: "absolute", width: 190,backgroundColor: C.surface,borderRadius: 12, paddingVertical: 6,borderWidth: 1, borderColor: C.border, shadowColor: "#000",shadowOpacity: 0.12,shadowOffset: { width: 0, height: 6 }, shadowRadius: 10, elevation: 10,},
  popoverBtn: {flexDirection: "row",alignItems: "center", gap: 10, paddingVertical: 10,paddingHorizontal: 12,},
  tabRow: {flexDirection: "row",alignItems: "center",gap: 10,},
  generalPill: {borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, paddingVertical: 10, paddingHorizontal: 14,borderRadius: 12,},
  generalPillActive: { backgroundColor: C.primaryStrong, borderColor: C.primaryStrong,},
  generalPillText: { fontSize: 11, color: C.text, fontWeight: "600",},
  generalPillTextActive: { color: C.white,},
  ticketSelector: { minWidth: 340,height: 44, borderRadius: 12,borderWidth: 1,  borderColor: C.border, backgroundColor: C.surface, paddingHorizontal: 14, flexDirection: "row",alignItems: "center", justifyContent: "space-between", marginLeft:10},
  ticketSelectorText: {flex: 1,marginRight: 10,fontSize: 11, color: C.text, fontWeight: "600",},
  popoverText: { fontSize: 11,fontWeight: "600",color: C.text,},
  menuOverlay: { flex: 1,backgroundColor: 'rgba(0,0,0,0.25)',justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20,},
  inputWrapper: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8 },
  row: { flexDirection: "row",alignItems: "center",},
  recordingPill: {flexDirection: "row",alignItems: "center", backgroundColor: C.dangerSoft,borderWidth: 1, borderColor: C.border, paddingHorizontal: 10,paddingVertical: 6,borderRadius: 999,marginRight: 8, gap: 8,},
  recordingDot: { width: 8, height: 8,borderRadius: 4, backgroundColor: C.danger,},
  recordingText: {fontSize: 11, fontWeight: "700", color: C.danger, },
  recordingStopBtn: {marginLeft: 2,},
  composerCard: { flex: 1,flexDirection: "row", alignItems: "center", backgroundColor: C.surface,borderRadius: 16, paddingHorizontal: 12,paddingVertical: 8,shadowColor: "#000", shadowOpacity: 0.06,shadowRadius: 8, shadowOffset: { width: 0, height: 4 },elevation: 4,},
  micBtn: { paddingRight: 8,paddingLeft: 2,},
  input: { flex: 1,fontSize: 12, color: C.text,paddingVertical: 4,textAlignVertical: "center",},
  attachBtn: { paddingLeft: 8, paddingRight: 2,},
  sendSquareBtn: {width: 44, height: 44, marginLeft: 10,  borderRadius: 14,  backgroundColor: C.primaryStrong,justifyContent: "center", alignItems: "center",shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 8,shadowOffset: { width: 0, height: 5 }, elevation: 5,},
  sendBtnDisabled: {opacity: 0.5,},
  menuCard: {width: '100%', maxWidth: 320, backgroundColor: C.surface, borderRadius: 16, overflow: 'hidden',borderWidth: 1,borderColor: C.border,},
  menuItem: { paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1,borderBottomColor: C.border,},
  menuText: { fontSize: 11, fontWeight: '700', color: C.text },
  createButton: { paddingVertical: 10,paddingHorizontal: 10, backgroundColor: C.primaryStrong, borderRadius: 5,},
  createText: { color: C.white,fontWeight: '600', },
});

export default PropertyChats;
