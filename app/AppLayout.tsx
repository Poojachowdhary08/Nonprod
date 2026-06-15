// AppLayout.tsx
import React, { useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Pressable,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import Icon from "react-native-vector-icons/FontAwesome";
import TText from "@/components/TText";
import { useFontScale } from "@/context/FontScaleContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type DrawerItem = {
  key: string;
  label: string;
  icon: any;
  onPress: () => void;
};

type Props = {
  title?: string;
  online?: boolean;

  // Header actions
  onBellPress?: () => void;

  // Drawer profile
  profileName?: string;
  profileRole?: string;

  // Drawer list
  drawerItems: DrawerItem[];

  // Footer nav
  onBottomNavPress?: (key: "calendar" | "projects" | "dashboard" | "tasks" | "profile") => void;

  // Main page
  children: React.ReactNode;
};

export default function AppLayout({
  title = "Dashboard",
  online = true,
  onBellPress,
  profileName = "User",
  profileRole = "—",
  drawerItems,
  onBottomNavPress,
  children,
}: Props) {
  const insets = useSafeAreaInsets();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerX = useRef(new Animated.Value(-320)).current;

  const openDrawer = () => {
    setDrawerOpen(true);
    Animated.timing(drawerX, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const closeDrawer = () => {
    Animated.timing(drawerX, {
      toValue: -320,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setDrawerOpen(false));
  };

  const initial = useMemo(() => (profileName?.[0] ? profileName[0].toUpperCase() : "U"), [profileName]);

  return (
    <View style={styles.container} testID="app-layout-root">
      {/* ✅ Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={openDrawer} style={styles.headerIconBtn}>
          <MaterialIcons name="menu" size={26} color="#111827" />
        </TouchableOpacity>

        <TText style={styles.headerTitle}>{title}</TText>

        <View style={styles.headerRight}>
          <MaterialIcons
            name={online ? "wifi" : "wifi-off"}
            size={20}
            color={online ? "#22c55e" : "#ef4444"}
            style={{ marginRight: 10 }}
          />
          <TouchableOpacity onPress={onBellPress} style={styles.headerIconBtn}>
            <MaterialIcons name="notifications-none" size={26} color="#111827" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ✅ Page body */}
      <View style={{ flex: 1 }}>{children}</View>

      {/* ✅ Footer */}
      <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 2) }]}>
        <BottomNavBtn icon="calendar-today" active={false} onPress={() => onBottomNavPress?.("calendar")} />
        <BottomNavBtn icon="layers" active={false} onPress={() => onBottomNavPress?.("projects")} />
        <BottomNavBtn icon="dashboard" active onPress={() => onBottomNavPress?.("dashboard")} />
        <BottomNavBtn icon="assignment" active={false} onPress={() => onBottomNavPress?.("tasks")} />
        <BottomNavBtn icon="person" active={false} onPress={() => openDrawer()} />
      </View>

      {/* ✅ Drawer */}
      {drawerOpen && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={styles.drawerBackdrop} onPress={closeDrawer} />

          <Animated.View style={[styles.drawer, { paddingTop: insets.top + 10, transform: [{ translateX: drawerX }] }]}>
            <View style={styles.drawerProfile}>
              <View style={styles.avatar}>
                <TText style={{ fontWeight: "900", color: "#111827" }}>{initial}</TText>
              </View>

              <View style={{ flex: 1 }}>
                <TText style={styles.profileName}>{profileName}</TText>
                <TText style={styles.profileRole}>{profileRole}</TText>
              </View>

              <TouchableOpacity onPress={closeDrawer} style={{ padding: 6 }}>
                <MaterialIcons name="close" size={22} color="#111827" />
              </TouchableOpacity>
            </View>

            <View style={{ paddingTop: 10 }}>
              {drawerItems.map((it) => (
                <TouchableOpacity
                  key={it.key}
                  style={styles.drawerItem}
                  onPress={() => {
                    closeDrawer();
                    it.onPress();
                  }}
                  activeOpacity={0.8}
                >
                  <Icon name={it.icon} size={18} color="#9aa0a6" style={{ width: 26 }} />
                  <TText style={styles.drawerItemText}>{it.label}</TText>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

function BottomNavBtn({
  icon,
  active,
  onPress,
}: {
  icon: any;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={styles.navBtn}>
      <MaterialIcons name={icon} size={24} color={active ? "#2563eb" : "#9aa0a6"} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F6F7FB" },

  header: {
    height: 56,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  headerIconBtn: { padding: 6, borderRadius: 10 },
  headerTitle: { fontSize: 18, fontWeight: "900", color: "#111827" },
  headerRight: { flexDirection: "row", alignItems: "center" },

  bottomNav: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingTop: 8,
  },
  navBtn: { alignItems: "center", justifyContent: "center", width: 64 },

  drawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 300,
    backgroundColor: "#FFFFFF",
    boxShadow: "3px 0 12px rgba(0, 0, 0, 0.18)",
    elevation: 10,
  },
  drawerProfile: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: { fontSize: 15, fontWeight: "900", color: "#111827" },
  profileRole: { fontSize: 12, fontWeight: "700", color: "#6b7280", marginTop: 2 },

  drawerItem: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  drawerItemText: { fontSize: 14, fontWeight: "800", color: "#111827" },
});
