import debounce from 'lodash.debounce';
import Toast from 'react-native-toast-message';
import React, { useEffect, useState, useRef } from 'react';
import {  View, StyleSheet, TouchableOpacity, Image, TextInput, KeyboardAvoidingView, Platform, ScrollView, Linking, NativeSyntheticEvent, NativeScrollEvent, Alert, Modal } from "react-native";
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import ModalSelector from "@/components/AppModalSelect";
import { Ionicons } from '@expo/vector-icons';
import * as mime from 'react-native-mime-types';
import axios from 'axios';
import { TouchableWithoutFeedback, Keyboard } from "react-native";
import { router, useLocalSearchParams } from 'expo-router';
import SocketManager from '@/utils/socketManager';
import useSocketEvents from '@/hooks/useSocketEvents';
import TText from "@/components/TText";
import { useFontScale } from "@/context/FontScaleContext";
import { useTheme } from "@/src/theme/ThemeProvider";
import { useSpeechToText } from '@/utils/useSpeechToText';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
import { authenticatedFetch } from "../utils/auth";
interface FileAttachment {
  uri: string;
  name: string;
  type: string;
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
  linked_ticket_id?: string;
  linked_ticket_info?: {
    priority?: 'High' | 'Medium' | 'Low';
    status?: string;
    issue_type_name?: string;
  };
}

interface Props {
  propertyId: string;
  projectId: string;

  userDetails: {
    name: any;
    client_id: any;
    employee_code: string;
    first_name: string;
    last_name?: string;
  };
}



const CustomerChats: React.FC<Props> = ({ propertyId, userDetails }) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();

  console.log('user details', userDetails);
  try {
    if (params.userDetails) {
      userDetails = JSON.parse(params.userDetails as string);
    }
  } catch (err) {
    console.error('❌ Failed to parse userDetails from router params', err);
  }
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
  const [filter, setFilter] = useState<'all' | 'starred' | 'pinned'>('all');
  const [selectedActionMessageId, setSelectedActionMessageId] = useState<number | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const currentUserCode = userDetails.client_id;
  const currentUserName = userDetails.name;
  const [selectedTab, setSelectedTab] = useState<string>('general');
  const [externalTickets, setExternalTickets] = useState<any[]>([]);
  const [externalTicketChats, setExternalTicketChats] = useState<{ [ticketId: string]: ChatMessage[] }>({});
  const [closedTickets, setClosedTickets] = useState<string[]>([]);
  const isTicketClosed = (ticketId: string | number) => closedTickets.includes(String(ticketId));
  const tabScrollRef = useRef<ScrollView>(null);
  const messageBody = newMessage.trim();
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

  const filterBg = (active: boolean) => (active ? C.primarySoft : C.surfaceAlt);
  const filterText = (active: boolean) => (active ? C.primaryStrong : C.mutedText);
  const selectorOptions = [
    { key: 'general', label: 'General' },
    ...externalTickets.map((ticket) => ({
      key: `#${ticket.issue_id.split('_').pop()}`,
      label: `Ticket #${ticket.issue_id.split('_').pop()}`,
    })),
  ];
  const activeSelectorLabel =
    selectorOptions.find((option) => option.key === selectedTab)?.label || 'General';



  // Enhanced WebSocket handler with full logging
  useSocketEvents({
    propertyId,
    employeeCode: currentUserCode,
    engineerName: currentUserName,

    onNewMessage: async (data) => {
      console.log("📡 CLIENT WS → new_message received:", data);

      if (!('linked_ticket_id' in data)) {
        console.log("🔍 linked_ticket_id missing. Setting to null.");
        data.linked_ticket_id = null;
      }

      if (data.linked_ticket_id) {
        console.log("🎫 Enriching message with ticket details for:", data.linked_ticket_id);
        try {
          const ticketRes = await axios.get(`${APP_API_BASE_URL}/customer-ticket-chat/${data.linked_ticket_id}`);
          const ticket = ticketRes.data?.ticket;

          data.ticket_status = ticket?.status;
          data.ticket_priority = ticket?.priority;
          data.ticket_title = ticket?.description || 'Customer Ticket';

          console.log("✅ Ticket metadata attached:", {
            status: data.ticket_status,
            priority: data.ticket_priority,
            title: data.ticket_title,
          });
        } catch (e) {
          console.warn("⚠️ Failed to fetch ticket metadata for:", data.linked_ticket_id, e);
        }

        // 🔐 Always store ticket messages regardless of current tab
        setExternalTicketChats((prev) => {
          const existing = prev[data.linked_ticket_id] || [];
          const exists = existing.some((m) => m.message_id === data.message_id);
          if (exists) {
            console.log("⛔ Duplicate ticket message detected. Skipping.");
            return prev;
          }

          const updated = [...existing, data].sort((a, b) => a.message_id - b.message_id);
          console.log("🧾 Stored in externalTicketChats:", data.linked_ticket_id, updated.map(m => m.message_id));

          return {
            ...prev,
            [data.linked_ticket_id]: updated,
          };
        });

        return;
      }

      // 🧍‍♂️ General messages fallback
      setMessages((prev) => {
        console.log("🧾 Previous messages count:", prev.length);

        const tempIndex = prev.findIndex(
          (m) =>
            m.is_temp &&
            m.message_text === data.message_text &&
            m.employee_code === data.employee_code
        );

        if (tempIndex !== -1) {
          console.log("♻️ Found and replacing optimistic temp message at index:", tempIndex);
          const updated = [...prev];
          updated[tempIndex] = {
            ...data,
            is_temp: false,
          };
          const sorted = updated.sort((a, b) => a.message_id - b.message_id);
          console.log("✅ Replaced and sorted messages. New count:", sorted.length);
          return sorted;
        }

        const alreadyExists = prev.some((m) => m.message_id === data.message_id);
        if (alreadyExists) {
          console.log("⛔ Duplicate general message. Ignoring.");
          return prev;
        }

        console.log("🆕 Appending new general message:", data.message_id);
        const appended = [...prev, data].sort((a, b) => a.message_id - b.message_id);
        console.log("✅ Message appended. New total messages:", appended.length);
        return appended;
      });
    },

    onReactionUpdate: (data) => {
      console.log("🔁 WS → reaction_update for:", data.message_id);

      // 🌍 General messages
      setMessages((prev) =>
        prev.map((m) =>
          m.message_id === data.message_id ? { ...m, reactions: data.reactions || {} } : m
        )
      );

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
      console.log("⭐ WS → star_update for:", data.message_id);
      if (filter !== 'all') {
        console.log("🚫 Not in 'all' filter view. Skipping star update.");
        return;
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.message_id === data.message_id
            ? { ...m, is_starred: data.is_starred, starred_by: data.starred_by || [] }
            : m
        )
      );

      setExternalTicketChats((prev) => {
        const updated = { ...prev };

        for (const ticketId in updated) {
          updated[ticketId] = updated[ticketId].map((m) =>
            m.message_id === data.message_id
              ? { ...m, is_starred: data.is_starred, starred_by: data.starred_by || [] }
              : m
          );
        }

        return updated;
      });
    },
  });




  const fetchCustomerTickets = async () => {
    try {
      const res = await axios.get(`${APP_API_BASE_URL}/tickets/property/${propertyId}/customer`);
      const tickets = res.data?.tickets || [];
      setExternalTickets(tickets);
      setClosedTickets(tickets.filter((t: any) => t.status === 'Closed').map((t: any) => String(t.issue_id)));
    } catch (err: any) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setExternalTickets([]);
        setClosedTickets([]);
        Toast.show({
          type: 'info',
          text1: 'No Tickets',
          text2: err.response?.data?.detail || 'No tickets present for this property.',
        });
        return;
      }
      console.error('❌ Failed to fetch tickets:', err);
    }
  };

  useEffect(() => {
    fetchCustomerTickets();
    fetchMessages({ initialLoad: true });
  }, [propertyId]);

  const options = [
    { key: 'camera', label: 'Take Photo' },
    { key: 'gallery', label: 'Choose from Gallery' },
    { key: 'documents', label: 'Pick a Document' },
  ];
  type FetchMessageOptions = {
    beforeId?: number;
    initialLoad?: boolean;
  };
  const NAME_COLORS = ['#D32F2F', '#1976D2', '#388E3C', '#F57C00', '#7B1FA2', '#0097A7', '#FBC02D', '#5D4037', '#0288D1', '#C2185B'];

  const getColorForName = (name: string): string => {
    const hash = [...name].reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return NAME_COLORS[hash % NAME_COLORS.length];
  };

  const fetchMessages = async (options: FetchMessageOptions = {}) => {
    const { beforeId, initialLoad = false } = options;

    if (loading || (!hasMore && !initialLoad)) return;
    setLoading(true);

    try {
      let endpoint = `/property-chat/${propertyId}/client-view`; // 🆕
      if (filter === 'starred') {
        endpoint = `/property-chat/${propertyId}/starred`;
      } else if (filter === 'pinned') {
        endpoint = `/property-chat/${propertyId}/pinned`;
      }

      const res = await axios.get(`${APP_API_BASE_URL}${endpoint}`, {
        params: {
          limit: 50,
          ...(beforeId && { before_message_id: beforeId }),
        },
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

      const enrichedMessages = newMessages.map((msg) => ({
        ...msg,
        reply_to_text: msg.reply_to_message_id ? messageMap[msg.reply_to_message_id] || 'Referenced message' : undefined,
      }));

      if (initialLoad) {
        setMessages([...enrichedMessages.reverse()]);
        scrollToBottom(true);
      } else {
        setMessages((prev) => [...enrichedMessages.reverse(), ...prev]);
      }

      if (newMessages.length < 20) setHasMore(false);
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
          : `/property-chat/${propertyId}/client-view`; // 🆕

    axios
      .get(`${APP_API_BASE_URL}${endpoint}`, {
        params: filter === 'all' ? { limit: 50 } : {},
      })
      .then((res) => {
        const fetched = res.data || [];
        // Only use seenIds for "all" tab fetch
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
      messages[0].message_id !== lastFetchedBeforeId.current // ✅ prevent duplicate fetch
    ) {
      scrollLock.current = true;
      scrollHeightBeforeFetch.current = e.nativeEvent.contentSize.height;
      scrollLockedRef.current = true;
      lastFetchedBeforeId.current = messages[0].message_id; // ✅ track last

      fetchMessages({ beforeId: messages[0].message_id }).finally(() => {
        scrollLock.current = false;
      });
    }
  };


  const debounceSearch = useRef(
    debounce(async (query: string) => {
      if (!query.trim()) {
        if (selectedTab === 'general') {
          seenIds.current.clear();
          setHasMore(true);
          fetchMessages({ initialLoad: true });
        } else {
          const ticketId = getCurrentTicketId();
          if (ticketId) {
            const res = await axios.get(`${APP_API_BASE_URL}/customer-ticket-chat/${ticketId}`);
            const chatData = res.data.messages || [];

            const transformed = chatData
              .filter((msg: any) => msg.visible_to_clients !== false)
              .reverse()
              .map((msg: any) => ({
                ...msg,
                is_temp: false,
                reply_to_text: msg.reply_to_text,
                files: msg.files || [],
                linked_ticket_id: ticketId,
                ticket_priority: res.data.ticket.priority,
                ticket_status: res.data.ticket.status,
                ticket_title: res.data.ticket.description || 'Ticket Chat',
              }));

            setExternalTicketChats((prev) => ({
              ...prev,
              [ticketId]: transformed,
            }));
          }
        }

        return;
      }

      try {
        if (selectedTab === 'general') {
          const res = await axios.get(`${APP_API_BASE_URL}/property-chat/search`, {
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
        } else {
          const ticketId = getCurrentTicketId();
          if (ticketId) {
            const res = await axios.get(`${APP_API_BASE_URL}/customer-ticket-chat/${ticketId}`);
            const filtered = res.data.messages?.filter((msg: any) => {
              const text = msg.message_text?.toLowerCase() || '';
              return msg.visible_to_clients !== false && text.includes(query.toLowerCase());
            }) || [];

            const transformed = filtered
              .reverse()
              .map((msg: any) => ({
                ...msg,
                is_temp: false,
                reply_to_text: msg.reply_to_text,
                files: msg.files || [],
                linked_ticket_id: ticketId,
                ticket_priority: res.data.ticket.priority,
                ticket_status: res.data.ticket.status,
                ticket_title: res.data.ticket.description || 'Ticket Chat',
              }));

            setExternalTicketChats((prev) => ({
              ...prev,
              [ticketId]: transformed,
            }));
          }
        }
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


  const getCurrentTicketId = () => {
    if (selectedTab === 'general') return null;
    return externalTickets.find((t) => selectedTab.endsWith(t.issue_id.split('_').pop()))?.issue_id || null;
  };




  // 🧠 Dynamically match linked_ticket_id from selectedTab (like "#0004")
  const resolvedTicketId = selectedTab?.startsWith("#")
    ? Object.keys(externalTicketChats).find((key) =>
      key.endsWith(selectedTab.slice(1))
    )
    : null;

  console.log("🧠 selectedTab:", selectedTab);
  console.log("🧩 resolvedTicketId from externalTicketChats:", resolvedTicketId);


  const messagesToRender = resolvedTicketId
    ? externalTicketChats[resolvedTicketId] || []
    : messages;

  console.log("🧾 Messages to render:", messagesToRender.map((m) => m.message_id));


  useEffect(() => {
    setSearchQuery('');
    debounceSearch.cancel();
  }, [filter, selectedTab]); // <-- include selectedTab

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

  const handleTabChange = async (tabKey: string) => {
    setSelectedTab(tabKey);

    if (tabKey === 'general') {
      seenIds.current.clear();
      setMessages([]);
      setHasMore(true);
      await fetchMessages({ initialLoad: true });
      return;
    }

    // Derive full issue_id from externalTickets
    const fullTicketId = externalTickets.find((t) => tabKey.endsWith(t.issue_id.split('_').pop()))?.issue_id || null;

    if (!fullTicketId) {
      console.warn('⚠️ Could not resolve full issue_id for tabKey:', tabKey);
      return;
    }

    if (!externalTicketChats[fullTicketId]) {
      try {
        const res = await axios.get(`${APP_API_BASE_URL}/customer-ticket-chat/${fullTicketId}`);
        const chatData = res.data.messages || [];

        const transformed = [...chatData]
          .filter((msg: any) => msg.visible_to_clients !== false) // only keep visible ones

          .reverse() // 🧭 oldest to newest
          .map((msg: any) => ({
            ...msg,
            is_temp: false,
            reply_to_text: msg.reply_to_text,
            files: msg.files || [],
            linked_ticket_id: fullTicketId,
            ticket_priority: res.data.ticket.priority,
            ticket_status: res.data.ticket.status,
            ticket_title: res.data.ticket.description || 'Ticket Chat',
          }));


        setExternalTicketChats((prev) => ({
          ...prev,
          [fullTicketId]: transformed,
        }));
      } catch (err) {
        console.error('❌ Failed to load ticket chat:', err);
        Toast.show({
          type: 'error',
          text1: 'Failed to load ticket messages',
          text2: 'Please try again later.',
        });
      }
    }
  };

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
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not update reaction',
      });
    } finally {
      setShowReactionsFor(null);
    }
  };

  // const togglePin = async (messageId: number) => {
  //   const formData = new FormData();
  //   formData.append("employee_code", currentUserCode);

  //   try {
  //     const res = await fetch(
  //       `${APP_API_BASE_URL}/property-chat/${propertyId}/${messageId}/pin`,
  //       {
  //         method: "POST",
  //         body: formData,
  //       }
  //     );

  //     const result = await res.json();

  //     if (!res.ok) {
  //       throw new Error(result?.error || "Failed to pin message");
  //     }

  //     // ✅ Show success toast or alert
  //     Toast.show({
  //       type: "success",
  //       text1: "Pin",
  //       text2: result.message || "Pin toggled",
  //     });
  //     setShowReactionsFor(null);
  //     setShowEmojiPickerFor(null);

  //     // ✅ Update messages locally
  //     setMessages((prev) =>
  //       filter === "pinned"
  //         ? prev.filter((m) => m.message_id !== messageId)
  //         : filter === "starred"
  //         ? prev
  //         : prev.map((m) =>
  //             m.message_id === messageId ? { ...m, is_pinned: !m.is_pinned } : m
  //           )
  //     );

  //     // ✅ Broadcast pin update via WebSocket
  //     socketRef.current?.send(
  //       JSON.stringify({
  //         type: "pin_update",
  //         message_id: messageId,
  //         employee_code: currentUserCode,
  //       })
  //     );
  //   } catch (err: any) {
  //     Toast.show({
  //       type: "error",
  //       text1: "Error",
  //       text2: err.message || "Something went wrong",
  //     });
  //     setShowReactionsFor(null);
  //     setShowEmojiPickerFor(null);
  //   }
  // };


type TriggerArgs = {
  employee_code: string;   // client_id in customer app
  property: string;        // property_id expected by backend
  message_id: string;      // server message id
  message: string;         // plain text (key name MUST be 'message')
  device_id?: string;
  from_customer?: boolean;
};

const triggerNotification = async (payload: TriggerArgs) => {
  try {
    const res = await authenticatedFetch(`${APP_API_BASE_URL}/trigger-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        from_customer: payload.from_customer ?? true,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn('❌ trigger-notification failed:', res.status, err);
    } else {
      console.log('📣 Temporal notification triggered');
    }
  } catch (e) {
    console.warn('❌ trigger-notification error:', e);
  }
};




  const filterTabs = [
    { key: 'all', label: 'All' },
    { key: 'starred', label: '🚩 ' },
  ];

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
    hours = hours === 0 ? 12 : hours; // Convert "0" to "12"

    const formattedTime = `${pad(hours)}-${minutes}-${seconds}_${ampm}`;
    const formattedDate = `${day}-${month}-${year}`;

    const extMatch = originalName.match(/\.[0-9a-z]+$/i);
    const ext = extMatch ? extMatch[0] : '';

    return `${propertyId}_${formattedDate}_${formattedTime}${ext}`;
  };
  const pickImageFromCamera = async (setNewUpdateFiles: (updater: (prev: any[]) => any[]) => void) => {
    if (Platform.OS === 'web') {
      try {
        // 🧹 Cleanup any previous elements
        ['webcam-preview', 'capture-btn', 'cancel-btn', 'button-container'].forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.remove();
        });

        // 🎥 Video preview
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
          fontSize: '16px',
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
          fontSize: '16px',
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

            const webFile = {
              uri: URL.createObjectURL(blob),
              name: file.name,
              type: file.type,
              file,
            };

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

    // 📱 Native (iOS/Android)
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


const handleSend = async () => {
  console.log('🚀 handleSend triggered');

  if (!propertyId || !userDetails?.client_id || !userDetails?.name) {
    Alert.alert('Error', 'Missing required user or property info.');
    return;
  }

  const messageBody = newMessage.trim();
  if (!messageBody && newUpdateFiles.length === 0) {
    Alert.alert('Error', 'Cannot send an empty message.');
    return;
  }

  const formData = new FormData();
  formData.append('property_id', propertyId);
  formData.append('employee_code', userDetails.client_id);
  formData.append('engineer_name', userDetails.name);
  formData.append('message_text', messageBody);
  formData.append('visible_to_clients', 'true');

  if (replyToMessage?.message_id != null) {
    formData.append('reply_to_message_id', String(replyToMessage.message_id));
  }
  if (replyToMessage?.message_text) {
    formData.append('reply_to_text', replyToMessage.message_text);
  }

  // Link to ticket if in a ticket tab
  let linked_ticket_id: string | undefined;
  if (selectedTab !== 'general') {
    linked_ticket_id = getCurrentTicketId() || undefined; // returns full 'ISS_0004'
    if (linked_ticket_id) {
      formData.append('linked_ticket_id', linked_ticket_id);
    }
  }

  // Attach files
  for (const file of newUpdateFiles) {
    const fileUri = Platform.OS === 'android' ? file.uri : file.uri.replace('file://', '');
    const fileName = file.name || `file_${Date.now()}`;
    const fileType = file.type || (mime.lookup(fileName) as string) || 'application/octet-stream';

    if (Platform.OS === 'web') {
      try {
        const response = await fetch(fileUri);
        const blob = await response.blob();
        const fileObj = new File([blob], fileName, { type: fileType });
        formData.append('files', fileObj);
      } catch (err) {
        console.error('❌ Web file fetch error:', err);
      }
    } else {
      formData.append('files', {
        uri: fileUri,
        name: fileName,
        type: fileType,
      } as any);
    }
  }

  // Optimistic UI
  const now = new Date();
  const formattedDate = now.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const tempId = Date.now();
  const optimisticMsg: ChatMessage = {
    message_id: tempId,
    is_temp: true,
    property_id: propertyId,
    employee_code: userDetails.client_id,
    engineer_name: userDetails.name,
    employee_name: userDetails.name,
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

  if (selectedTab === 'general') {
    setMessages((prev) => [...prev, optimisticMsg]);
  } else if (linked_ticket_id) {
    setExternalTicketChats((prev) => {
      const existing: ChatMessage[] = prev[linked_ticket_id!] ?? ([] as ChatMessage[]);
      return { ...prev, [linked_ticket_id!]: [...existing, optimisticMsg] };
    });
  }

  // Reset input state
  setNewMessage('');
  setNewUpdateFiles([]);
  setReplyToMessage(null);
  setSelectedActionMessageId(null);
  setTimeout(() => scrollToBottom(true), 100);

  // --- Send to API, trigger Temporal, refresh ticket thread if needed ---
  try {
    setLoading(true);

    let data: any = null;

    if (Platform.OS === 'android') {
      const response = await authenticatedFetch(`${APP_API_BASE_URL}/property-chat/send`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formData,
      });
      const txt = await response.text();
      try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
      if (!response.ok) throw new Error(`Fetch failed: ${response.status} - ${txt}`);
    } else {
      const response = await axios.post(`${APP_API_BASE_URL}/property-chat/send`, formData, {
        headers: { Accept: 'application/json' },
      });
      data = response.data;
    }

    // Extract real message id from common shapes
    const serverMsgId =
      (data && (data.message_id ?? data?.message?.message_id ?? data?.result?.message_id)) ?? tempId;

    // 🔔 Fire Temporal workflow — this is the customer app
    await triggerNotification({
      employee_code: userDetails.client_id,
      property: propertyId,
      message_id: String(serverMsgId),
      message: messageBody, // NOTE: API expects 'message'
      device_id: 'UNKNOWN_DEVICE', // pass real device id if available
      from_customer: true,
    });

    // Refresh ticket chat if relevant
    if (linked_ticket_id) {
      const res = await axios.get(`${APP_API_BASE_URL}/customer-ticket-chat/${linked_ticket_id}`);
      const chatData = res.data?.messages || [];

      const transformed: ChatMessage[] = chatData
        .filter((m: any) => m.visible_to_clients !== false)
        .reverse()
        .map((m: any) => ({
          ...m,
          is_temp: false,
          reply_to_text: m.reply_to_text,
          files: m.files || [],
          linked_ticket_id: linked_ticket_id!,
          ticket_priority: res.data.ticket.priority,
          ticket_status: res.data.ticket.status,
          ticket_title: res.data.ticket.description || 'Ticket Chat',
        }));

      setExternalTicketChats((prev) => ({ ...prev, [linked_ticket_id!]: transformed }));

      // If this ticket wasn’t in the tabs yet, refresh list
      if (!externalTickets.find((t) => t.issue_id === linked_ticket_id)) {
        await fetchCustomerTickets();
      }

      // Keep user scrolled to bottom if they’re on that tab
      if (selectedTab === `#${linked_ticket_id.split('_').pop()}`) {
        scrollToBottom(true);
      }
    }
  } catch (error: any) {
    console.error('❌ Error sending message:', error.response?.data || error.message);
    Alert.alert('Error', 'Failed to send the message.');
  } finally {
    setLoading(false);
  }
};


const parseCustomDate = (input: string): Date => {
  try {
    const [datePart, timePart] = input.split(', ');  // Split date and time
    const [day, month, year] = datePart.split('-');  // Split the date into day, month, and year
    const [time, period] = timePart.split(' ');  // Split time and period (AM/PM)
    let [hours, minutes, seconds] = time.split(':').map(Number);  // Split time into hours, minutes, and seconds

    // Adjust hours based on AM/PM
    if (period === 'PM' && hours < 12) hours += 12;  // Convert PM to 24-hour format
    if (period === 'AM' && hours === 12) hours = 0;  // Convert 12 AM to 00 hours

    return new Date(
      `${year}-${month}-${day}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    );
  } catch {
    return new Date();  // Return current date if there's an error
  }
};


  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.bg }]} edges={['left', 'right']} testID="customer-chats-root">
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: C.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>


      <View style={[styles.headerContainer, { backgroundColor: C.headerBg, borderBottomColor: C.border }]}>
        <View style={styles.headerTitleContainer}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name='arrow-back' size={24} color={C.mutedText} />
          </TouchableOpacity>
          <TText style={[styles.headerTitle, { color: C.text }]}>Customer Chat</TText>
        </View>
        <TouchableOpacity onPress={() => router.push('/CustomerHomeScreen')}>
          <Ionicons name='home' size={24} color={C.mutedText} />
        </TouchableOpacity>
      </View>


      <View style={[styles.ticketTabsContainer, { backgroundColor: C.surface }]}>
        {/* 👥 Online Users Count */}
        {onlineUsers.length > 0 && (
          <View style={{ marginBottom: 6 }}>
            <TText style={[styles.onlineUserCount, { fontSize: 12, color: C.success }]}>{onlineUsers.length} online</TText>
          </View>
        )}
        <View style={[styles.tabRow, { width: '100%' }]}>
          <ModalSelector
            data={selectorOptions}
            initValue=""
            onChange={(option: any) => void handleTabChange(String(option.key))}
            overlayStyle={{ backgroundColor: C.overlay }}
            cancelStyle={{ backgroundColor: C.surface }}
            cancelTextStyle={{ color: C.text, fontSize: 14, fontWeight: '700' }}
            optionContainerStyle={{ backgroundColor: C.surface, borderRadius: 14 }}
            optionStyle={{ backgroundColor: C.surface, borderBottomColor: C.border, borderBottomWidth: 1 }}
            optionTextStyle={{ color: C.text, fontSize: 14, fontWeight: '700' }}
            cancelText='Cancel'
            selectStyle={{ borderWidth: 0, padding: 0, marginBottom: 10 }}
          >
            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.ticketSelector, { borderColor: C.border, backgroundColor: C.surfaceAlt }]}
            >
              <TText style={[styles.ticketSelectorText, { color: C.text }]}>
                {activeSelectorLabel}
              </TText>
              <Ionicons name='chevron-down' size={18} color={C.mutedText} />
            </TouchableOpacity>
          </ModalSelector>
          {selectedTab !== 'general' && (() => {
            const ticketId = externalTickets.find((t) => selectedTab.endsWith(t.issue_id.split('_').pop()))?.issue_id;
            const ticket = externalTickets.find((t) => t.issue_id === ticketId);

            if (!ticket) return null;

            return (
              <View
                style={{
                  backgroundColor: C.primarySoft,
                  padding: 10,
                  borderRadius: 10,
                  marginTop: -2,
                  marginBottom: 6,
                  borderWidth: 1,
                  borderColor: C.border,
                }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <TText style={{ fontSize: 14, fontWeight: 'bold', color: C.text, flex: 1 }}>
                    {ticket.description || 'No Title'}
                  </TText>
                  <TText
                    style={{
                      fontWeight: '600',
                      color: ticket.status === 'Closed' ? C.mutedText : C.success,
                      marginLeft: 8,
                      fontSize: 13,
                    }}>
                    {ticket.status || 'N/A'}
                  </TText>
                </View>
              </View>

            );
          })()}
{/* 🔍 Show Search only in General tab */}
{selectedTab === 'general' && (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
    <TextInput
      placeholder="Search..."
      placeholderTextColor={C.mutedText}
      value={searchQuery}
      onChangeText={(text) => {
        setSearchQuery(text);
        debounceSearch(text);
      }}
      style={{
        flex: 1,
        padding: 8,
        backgroundColor: C.inputBg,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: C.border,
        fontSize: 13,
        color: C.text,
      }}
    />

    {filterTabs.map((tab) => (
      <TouchableOpacity key={tab.key} onPress={() => setFilter(tab.key as any)}>
        <View
          style={{
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: 16,
            backgroundColor: filterBg(filter === tab.key),
            borderWidth: 1,
            borderColor: filter === tab.key ? C.primaryStrong : C.border,
          }}>
          <TText
            style={{
              fontSize: 12,
              fontWeight: filter === tab.key ? 'bold' : 'normal',
              color: filterText(filter === tab.key),
            }}>
            {tab.label}
          </TText>
        </View>
      </TouchableOpacity>
    ))}

    {searchQuery.length > 0 && (
      <TouchableOpacity
        onPress={() => {
            setSearchQuery('');
            debounceSearch('');
          }}>
        <TText style={{ color: C.primaryStrong, fontSize: 12 }}>Clear</TText>
      </TouchableOpacity>
    )}
  </View>
)}


        </View>

      </View>

      <View style={[styles.chatBoxContainer, { backgroundColor: C.surface, borderColor: C.border }]}>
        <TouchableWithoutFeedback
          onPress={() => {
            setSelectedActionMessageId(null);
            setShowReactionsFor(null);
            setShowEmojiPickerFor(null); // 👈 closes the ➕ emoji selector
            setShowEmojiPicker(false); // 👈 If main input emoji
            Keyboard.dismiss();
          }}>
          <ScrollView
            key={`scroll-${filter}`} // 💥 this forces remount of the ScrollView DOM
            ref={scrollViewRef}
            style={[styles.chatScroll, { backgroundColor: C.surface }]}
            contentContainerStyle={{ padding: 10 }}
            onScroll={handleScroll}
            scrollEventThrottle={16} // instead of 100
            onContentSizeChange={(w, h) => {
              if (scrollLockedRef.current && scrollHeightBeforeFetch.current) {
                scrollViewRef.current?.scrollTo({
                  y: h - scrollHeightBeforeFetch.current,
                  animated: false,
                });
                scrollLockedRef.current = false;
              }
            }}>
            {(selectedTab === 'general' ? messages : externalTicketChats[getCurrentTicketId()] || []).map((msg, index) => {
              const isMine = msg.employee_code === currentUserCode;
              const prev = messages[index - 1];
              const showName = true;

              const dateObj = parseCustomDate(msg.created_at);
              const time = dateObj.toLocaleString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <View
                  key={msg.message_id}
                  style={{
                    alignItems: isMine ? 'flex-end' : 'flex-start',
                    marginBottom: 12,
                    paddingHorizontal: 12, // <-- adds margin to both left and right
                  }}>
                  {showName && (
                    <TText
                      style={{
                        fontSize: 13,
                        fontWeight: 'bold',
                        marginBottom: 4,
                        color: isMine ? C.text : getColorForName(msg.engineer_name ?? 'Unknown'),
                      }}>
                      {isMine ? 'You' : msg.engineer_name?.trim() || 'Unknown'}
                    </TText>
                  )}
                  {selectedTab === 'general' && msg.linked_ticket_id ? (
                    <TouchableOpacity
                      onPress={() => {
                        const ticketSuffix = (msg.linked_ticket_id as string).split('_').pop();
                        handleTabChange(`#${ticketSuffix}`);
                      }}
                      activeOpacity={0.9}
                      style={{
                        backgroundColor: C.primarySoft,
                        borderRadius: 12,
                        padding: 12,
                        borderWidth: 1,
                        borderColor: C.primaryStrong,
                        maxWidth: '85%',
                        alignSelf: isMine ? 'flex-end' : 'flex-start',
                      }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                        <TText style={{ fontWeight: 'bold', color: C.primaryStrong, fontSize: 14 }}>
                          Ticket# {msg.linked_ticket_id.split('_').pop()}
                        </TText>
                        <TText
                          style={{
                            backgroundColor: '#FFF7DD',
                            color: '#B45309',
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                            borderRadius: 8,
                            fontSize: 10,
                            marginLeft: 8,
                          }}>
                          {(msg.linked_ticket_info?.priority || 'MEDIUM').toUpperCase()}
                        </TText>
                        <TText
                          style={{
                            color: C.success,
                            fontWeight: 'bold',
                            marginLeft: 6,
                            fontSize: 11,
                          }}>
                          {msg.linked_ticket_info?.status || 'Open'}
                        </TText>
                      </View>

                      {!!msg.message_text && <TText style={{ color: C.text, fontSize: 14 }}>{msg.message_text}</TText>}

                      {msg.linked_ticket_info?.issue_type_name && (
                        <TText style={{ fontSize: 12, color: C.mutedText, marginTop: 4 }}>Type: {msg.linked_ticket_info.issue_type_name}</TText>
                      )}

                      {/* Files */}
                      {msg.files?.length > 0 && (
                        <View style={{ marginTop: 8 }}>
                          {msg.files.map((file, idx) => {
                            const isImage = file.file_type?.startsWith('image');
                            return (
                              <TouchableOpacity
                                key={`${msg.message_id}-${idx}`}
                                onPress={() => {
                                  if (isImage) setPreviewImage(file.file_url);
                                  else Linking.openURL(file.file_url);
                                }}
                                style={{ marginTop: 4 }}>
                                {isImage ? (
                                  <Image
                                    source={{ uri: file.file_url }}
                                    style={{ width: 140, height: 100, borderRadius: 10 }}
                                    resizeMode='cover'
                                  />
                                ) : (
                                  <TText
                                    style={{
                                      color: C.primaryStrong,
                                      fontSize: 14,
                                      textDecorationLine: 'underline',
                                    }}>
                                    {file.file_name}
                                  </TText>
                                )}
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}

                      {/* Timestamp */}
                      <TText style={{ fontSize: 10, color: C.mutedText, marginTop: 6 }}>{time}</TText>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() => setReplyToMessage(msg)}
                      onLongPress={() => {
                        setShowReactionsFor(msg.message_id);
                        setSelectedActionMessageId(msg.message_id);
                      }}
                      delayLongPress={300}
                      activeOpacity={0.8}
                      style={{
                        backgroundColor: isMine ? C.primarySoft : C.surfaceAlt,
                        padding: 10,
                        borderRadius: 16,
                        borderTopRightRadius: isMine ? 0 : 16,
                        borderTopLeftRadius: isMine ? 16 : 0,
                        maxWidth: '80%',
                        borderWidth: 1,
                        borderColor: C.border,
                      }}>
                      {/* Reply preview */}
                      {msg.reply_to_message_id && msg.reply_to_text && (
                        <View
                          style={{
                            backgroundColor: C.surface,
                            padding: 6,
                            borderLeftWidth: 3,
                            borderLeftColor: C.primaryStrong,
                            marginBottom: 6,
                            borderRadius: 6,
                          }}>
                          <TText
                            numberOfLines={1}
                            style={{
                              fontSize: 12,
                              fontStyle: 'italic',
                              color: C.mutedText,
                            }}>
                            {msg.reply_to_engineer_name ? `${msg.reply_to_engineer_name}: ` : ''}
                            {msg.reply_to_text}
                          </TText>
                        </View>
                      )}

                      {/* Message Text */}
                      {(!!msg.message_text || msg.is_starred) && (
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                          }}>
                          {!!msg.message_text && <TText style={{ color: C.text, fontSize: 14 }}>{msg.message_text}</TText>}
                          {msg.is_starred && <TText style={{ marginLeft: 4, fontSize: 12 }}>🚩</TText>}
                        </View>
                      )}

                      {msg.files?.length > 0 && (
                        <View style={{ marginTop: 8 }}>
                          {msg.files.map((file, idx) => {
                            const isImage = file.file_type?.startsWith('image');
                            return (
                              <TouchableOpacity
                                key={`${msg.message_id}-${idx}`}
                                onPress={() => {
                                  if (isImage) setPreviewImage(file.file_url);
                                  else Linking.openURL(file.file_url);
                                }}
                                style={{ marginTop: 4 }}>
                                {isImage ? (
                                  <Image
                                    source={{ uri: file.file_url }}
                                    style={{
                                      width: 140,
                                      height: 100,
                                      borderRadius: 10,
                                    }}
                                    resizeMode='cover'
                                  />
                                ) : (
                                  <TText
                                    style={{
                                      color: C.primaryStrong,
                                      fontSize: 14,
                                      textDecorationLine: 'underline',
                                    }}>
                                    {file.file_name}
                                  </TText>
                                )}
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}

                      {/* Reactions */}
                      {msg.reactions && (
                        <View style={styles.reactionsRow}>
                          {Object.entries(msg.reactions).map(([emoji, users]) => (
                            <View
                              key={emoji}
                              style={[styles.reactionBubble, { backgroundColor: C.primarySoft, borderColor: C.border }]}
                            >
                              <TText style={[styles.reactionText, { color: C.text }]}>
                                {emoji} {(users as string[]).length}
                              </TText>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Timestamp */}
                      <TText style={{ fontSize: 10, color: C.mutedText, marginTop: 4 }}>{time}</TText>
                    </TouchableOpacity>
                  )}


                  {/* Emoji picker / star / pin options (optional) */}
                  {showReactionsFor === msg.message_id && (
                    <View style={{ marginTop: 4 }}>
                      {/* <View style={styles.reactionPicker}>
                        {['👍', '👎', '✅', '❌', '😮', '🙏'].map((emoji) => (
                          <TouchableOpacity key={emoji} onPress={() => handleEmojiReaction(msg.message_id, emoji)}>
                            <TText style={{ fontSize: 20, marginRight: 6 }}>{emoji}</TText>
                          </TouchableOpacity>
                        ))}
                      </View> */}

                      <View style={styles.pinStarRow}>
                        <TouchableOpacity
                          onPress={() => toggleStar(msg.message_id)}
                          style={[styles.actionBubble, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}
                        >
                          <TText style={[styles.actionText, { color: C.text }]}>{msg.is_starred ? 'Unflag' : '🚩 Flag'}</TText>
                        </TouchableOpacity>
                        {/* <TouchableOpacity
              onPress={() => togglePin(msg.message_id)}
              style={styles.actionBubble}
            >
              <TText style={styles.actionText}>
                {msg.is_pinned ? "📌 Unpin" : "📌 Pin"}
              </TText>
            </TouchableOpacity> */}
                      </View>
                    </View>
                  )}
                </View>
              );
            })}

            {newUpdateFiles.length > 0 && (
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  paddingHorizontal: 10,
                  paddingTop: 8,
                }}>
                {newUpdateFiles.map((file, index) => {
                  const isImage = file.type?.includes('image');
                  return (
                    <View
                      key={index}
                      style={{
                        marginRight: 10,
                        alignItems: 'center',
                        marginBottom: 8,
                        position: 'relative',
                      }}>
                      {isImage ? (
                        <Image source={{ uri: file.uri }} style={{ width: 80, height: 80, borderRadius: 10 }} resizeMode='cover' />
                      ) : (
                        <Ionicons name='document' size={40} color={C.mutedText} />
                      )}
                      <TText numberOfLines={1} style={{ maxWidth: 80, fontSize: 12, color: C.text }}>
                        {file.name}
                      </TText>

                      {/* 🗑️ Remove Button */}
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
            <TText style={{ color: C.primaryStrong, fontSize: 12 }}>X</TText>
          </TouchableOpacity>
        </View>
      )}

      <View
        style={[
          styles.inputWrapper,
          {
            backgroundColor: C.bg,
            paddingBottom: Math.max(insets.bottom, 8),
          },
        ]}
      >
        <View style={styles.row}>
          <View style={[styles.composerCard, { backgroundColor: C.surface }]}>
            <TextInput
              ref={searchInputRef}
              style={[
                styles.input,
                {
                  height: 40,
                  textAlignVertical: 'center',
                  color: C.text,
                },
              ]}
              placeholder='Type your message...'
              placeholderTextColor={C.mutedText}
              value={newMessage}
              onChangeText={(text) => {
                setNewMessage(text);
                sendTyping();
              }}
              multiline
              numberOfLines={2}
            />

            <ModalSelector
              data={options}
              initValue=''
              onChange={async (option: any) => {
                if (option.key === 'camera') await pickImageFromCamera(setNewUpdateFiles);
                else if (option.key === 'gallery') await pickImageFromGallery();
                else if (option.key === 'documents') await pickDocuments();
              }}
              selectStyle={{ borderWidth: 0 }}
              overlayStyle={{ backgroundColor: C.overlay }}
              cancelStyle={{ backgroundColor: C.surface }}
              cancelTextStyle={{ color: C.text, fontSize: 14, fontWeight: '700' }}
              optionContainerStyle={{ backgroundColor: C.surface, borderRadius: 14 }}
              optionStyle={{ backgroundColor: C.surface, borderBottomColor: C.border, borderBottomWidth: 1 }}
              optionTextStyle={{
                fontSize: 14,
                color: C.text,
                textTransform: 'uppercase',
              }}
              cancelText='Cancel'>
              <TouchableOpacity style={styles.attachBtn} activeOpacity={0.8}>
                <Ionicons name='attach' size={20} color={C.mutedText} />
              </TouchableOpacity>
            </ModalSelector>

            <TouchableOpacity onPress={toggleListening} style={styles.micBtn} activeOpacity={0.8}>
              <Ionicons
                name={isListening ? 'mic' : 'mic-outline'}
                size={22}
                color={isListening ? C.danger : C.primaryStrong}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={handleSend}
            style={[
              styles.sendSquareBtn,
              { backgroundColor: C.primaryStrong },
              !(messageBody || newUpdateFiles.length) && styles.sendBtnDisabled,
            ]}
            disabled={!(messageBody || newUpdateFiles.length)}
            activeOpacity={0.85}
          >
            <Ionicons name='send' size={20} color={C.white} />
          </TouchableOpacity>
        </View>
      </View>

      {previewImage && (
        <Modal visible={true} transparent={true} animationType='fade' onRequestClose={() => setPreviewImage(null)}>
          <View
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.95)',
              justifyContent: 'center',
              alignItems: 'center',
            }}>
            <TouchableOpacity style={{ position: 'absolute', top: 40, right: 20, zIndex: 999 }} onPress={() => setPreviewImage(null)}>
              <Ionicons name='close' size={32} color={C.white} />
            </TouchableOpacity>
            <Image
              source={{ uri: previewImage }}
              style={{
                width: '90%',
                height: '80%',
                resizeMode: 'contain',
                borderRadius: 10,
              }}
            />
          </View>
        </Modal>
      )}
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chatScroll: {
    flex: 1,
  },
  reactionPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#f1f1f1',
    borderRadius: 12,
    marginTop: 4,
    height: 40, // ⬅️ Fixed height to prevent excess space
  },

  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    justifyContent: 'space-between',
  },
  headerTitleContainer: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
    gap: 1,
  },
  reactionBubble: {
    backgroundColor: '#e6f3ff',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  emojiSelectorWrapper: {
    maxHeight: 250,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: '#ccc',
    marginTop: 2,
    borderRadius: 10,
    overflow: 'scroll',
  },
  reactionText: {
    fontSize: 13,
    color: '#333',
  },
  onlineUsersBanner: {
    marginTop: 0,
    marginBottom: 10,
  },
  onlineUserCount: {
    fontWeight: 'bold',
    color: '#075e54',
    fontSize: 13,
  },
  onlineUserNames: {
    fontSize: 12,
    color: '#555',
    marginTop: 2,
  },
  pinStarRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 10,
    padding: 4,
  },
  actionBubble: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#f1f1f1',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  actionText: {
    fontSize: 11,
    fontWeight: '600',
  },
  ticketTabsContainer: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ticketSelector: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ticketSelectorText: {
    flex: 1,
    marginRight: 10,
    fontSize: 11,
    fontWeight: '600',
  },
  chatBoxContainer: {
    flex: 1,
    marginRight: 10,
    marginLeft: 10,
    marginBottom: 0,
    borderWidth: 1,
  },
  inputWrapper: {
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  emojiWrapper: {
    height: 220,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: '#ddd',
    zIndex: 5,
  },
  emojiScrollContent: {
    paddingBottom: 10,
  },
  input: {
    flex: 1,
    height: 40,
    fontSize: 12,
    paddingVertical: 4,
    textAlignVertical: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  composerCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  attachBtn: {
    paddingLeft: 8,
    paddingRight: 2,
  },
  micBtn: {
    paddingRight: 8,
    paddingLeft: 2,
  },
  sendSquareBtn: {
    width: 44,
    height: 44,
    marginLeft: 10,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  absoluteEmojiPicker: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    bottom: Platform.OS === 'ios' ? 60 : 70,
    borderColor: '#ddd',
    zIndex: 999,
    width: '100%',
    padding: 10,
  },
  emojiRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ticketTab: {
    backgroundColor: '#1976D2',
    padding: 10,
    borderRadius: 10,
    marginRight: 10,
    marginBottom: 10,
    borderWidth: 1,
  },
  ticketTabText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  activeTab: {
    backgroundColor: '#333300',
  },
});

export default CustomerChats;
