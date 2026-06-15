import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  Animated,
} from "react-native";
import Icon from "react-native-vector-icons/FontAwesome";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFontScale } from "@/context/FontScaleContext";
import TText from "@/components/TText";

// ✅ Define types
type NotificationType =
  | "task"
  | "approval"
  | "chat"
  | "offer"
  | "system"
  | "inventory";

interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

interface SectionData {
  title: string;
  data: NotificationItem[];
}

const rawNotifications: NotificationItem[] = [
    {
      id: "1",
      type: "task",
      title: "Task Started: Plumbing Work",
      message: "Plumbing task for Villa #203 has started.",
      timestamp: "2025-05-21T09:10:00Z",
      read: false,
    },
    {
      id: "2",
      type: "task",
      title: "Task Completed: Site Inspection",
      message: "Inspection at Lakshmi Nagar completed successfully.",
      timestamp: "2025-05-21T08:00:00Z",
      read: false,
    },
    {
      id: "3",
      type: "chat",
      title: "Message from Project Manager",
      message: "John: Please update the site progress ASAP.",
      timestamp: "2025-05-20T18:00:00Z",
      read: true,
    },
    {
      id: "4",
      type: "system",
      title: "Scheduled Downtime",
      message: "System maintenance is scheduled from 12 AM to 2 AM tonight.",
      timestamp: "2025-05-20T10:00:00Z",
      read: true,
    },
    {
      id: "5",
      type: "approval",
      title: "Inventory Request Approved",
      message: "Request for 5 Cement Bags has been approved.",
      timestamp: "2025-05-20T09:00:00Z",
      read: false,
    },
    {
      id: "6",
      type: "task",
      title: "Task Ongoing: Tile Fitting",
      message: "Work in progress at Flat #B2 - Expected to finish by evening.",
      timestamp: "2025-05-19T15:30:00Z",
      read: true,
    },
    {
      id: "7",
      type: "task",
      title: "New Task Assigned: Painting",
      message: "You’ve been assigned to paint Flat #C4 starting tomorrow.",
      timestamp: "2025-05-19T13:10:00Z",
      read: false,
    },
    {
      id: "8",
      type: "system",
      title: "App Updated",
      message: "New features and improvements have been added in version 2.4.1.",
      timestamp: "2025-05-18T08:00:00Z",
      read: true,
    },
    {
      id: "9",
      type: "task",
      title: "Ticket Raised: Power Fluctuation",
      message: "Electrical issue reported at Plot #L-12. Assigned to Ram.",
      timestamp: "2025-05-17T11:40:00Z",
      read: false,
    },
    {
      id: "10",
      type: "approval",
      title: "Ticket Closed: Water Leakage",
      message: "The reported leakage at Block A has been resolved.",
      timestamp: "2025-05-17T09:50:00Z",
      read: true,
    },
  ];
  

// ✅ Group notifications
const groupNotifications = (
  notifications: NotificationItem[]
): SectionData[] => {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  const sections: { [key: string]: NotificationItem[] } = {
    Today: [],
    Yesterday: [],
    Earlier: [],
  };

  notifications.forEach((item) => {
    const itemDate = new Date(item.timestamp).toDateString();
    if (itemDate === today) sections["Today"].push(item);
    else if (itemDate === yesterday) sections["Yesterday"].push(item);
    else sections["Earlier"].push(item);
  });

  return Object.keys(sections)
    .filter((key) => sections[key].length > 0)
    .map((title) => ({
      title,
      data: sections[title],
    }));
};

const getIcon = (type: NotificationType): string => {
  switch (type) {
    case "task":
      return "clipboard";
    case "approval":
      return "check-circle";
    case "chat":
      return "comments";
    case "system":
      return "bell";
    case "offer":
      return "tag";
    case "inventory":
      return "cubes";
    default:
      return "info-circle";
  }
};

const Notifications = () => {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [activeTab, setActiveTab] = useState<"all" | "unread">("all");
  const [notifications, setNotifications] = useState<NotificationItem[]>(rawNotifications);
  const filteredNotifications = notifications.filter((n) =>
    activeTab === "all" ? true : !n.read
  );
  
  
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, []);



  const sections = groupNotifications(filteredNotifications);

  const renderItem = ({ item }: { item: NotificationItem }) => (
    <Animated.View style={[styles.card, !item.read && styles.unread, { opacity: fadeAnim }]}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => {
            // ✅ Mark as read and remove
            setNotifications((prev) =>
              prev.map((n) =>
                n.id === item.id ? { ...n, read: true } : n
              )
            );
          
            // if (item.title.toLowerCase().includes("ticket")) {
            //   router.push({
            //     pathname: "/TicketDetails",
            //     params: {
            //       issue_id: "TICKET_123",
            //       first_name: "John",
            //       last_name: "Doe",
            //     },
            //   });
            // } else if (item.type === "task") {
            //   router.push({
            //     pathname: "/TaskList",
            //     params: {
            //       employee_code: "EMP_001",
            //       first_name: "John",
            //       last_name: "Doe",
            //     },
            //   });
            // } else {
            //   console.log("No navigation set for:", item.title);
            // }
          }}
          
          
        style={styles.row}
      >
        <View style={styles.iconContainer}>
          <Icon name={getIcon(item.type)} size={22} color="#003366" />
        </View>
        <View style={styles.textContainer}>
          <View style={styles.titleRow}>
            <TText style={styles.title}>{item.title}</TText>
            {!item.read && <View style={styles.unreadDot} />}
          </View>
          <TText style={styles.message}>{item.message}</TText>
          <TText style={styles.timestamp}>
            {new Date(item.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </TText>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );

  return (
    <View style={styles.container} testID="notifications-root">
      {/* Header */}
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#5a5a5c" />
        </TouchableOpacity>
        <TText style={styles.headerTitle}>Notifications</TText>
        <TouchableOpacity onPress={() => router.push("/HomeScreen")}>
          <Ionicons name="home" size={24} color="#5a5a5c" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "all" && styles.activeTab]}
          onPress={() => setActiveTab("all")}
        >
          <TText
            style={[
              styles.tabText,
              activeTab === "all" && styles.activeTabText,
            ]}
          >
            All
          </TText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "unread" && styles.activeTab]}
          onPress={() => setActiveTab("unread")}
        >
          <TText
            style={[
              styles.tabText,
              activeTab === "unread" && styles.activeTabText,
            ]}
          >
            Unread
          </TText>
        </TouchableOpacity>
      </View>

      {/* List */}
      <SectionList
        sections={sections}
        keyExtractor={(item: any) => item.id}
        contentContainerStyle={styles.listContainer}
        renderItem={renderItem}
        renderSectionHeader={({ section: { title } }) => (
          <TText style={styles.sectionHeader}>{title}</TText>
        )}
        ListEmptyComponent={
          <TText style={{ textAlign: "center", marginTop: 20 }}>
            No notifications
          </TText>
        }
      />
    </View>
  );
};

export default Notifications;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9f9f9" },
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#EAEAEA",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  tabContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingBottom: 6,
    paddingTop: 6,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTab: {
    borderBottomColor: "#003366",
  },
  tabText: {
    fontSize: 16,
    color: "#666",
    fontWeight: "500",
  },
  activeTabText: {
    color: "#003366",
    fontWeight: "bold",
  },
  listContainer: {
    padding: 16,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#444",
    marginTop: 20,
    marginBottom: 8,
  },
  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 0.5 },
    shadowOpacity: 0.1,
    shadowRadius: 1.5,
  },
  unread: {
    backgroundColor: "#eaf3ff",
  },
  row: {
    flexDirection: "row",
    flex: 1,
  },
  iconContainer: {
    width: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
    paddingLeft: 12,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1c1c1c",
    flexShrink: 1,
  },
  message: {
    fontSize: 13,
    color: "#555",
    marginTop: 2,
  },
  timestamp: {
    fontSize: 12,
    color: "#999",
    marginTop: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    backgroundColor: "#007AFF",
    borderRadius: 4,
    marginLeft: 8,
  },
});