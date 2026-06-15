import React from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import TText from "@/components/TText";
import { useTheme } from "@/src/theme/ThemeProvider";

type SalesTab = "dashboard" | "leads" | "clients";

type Props = {
  activeTab: SalesTab;
  params?: Record<string, string>;
  showBackButton?: boolean;
};

const SalesFooterNav: React.FC<Props> = ({ activeTab, params = {}, showBackButton = false }) => {
  const router = useRouter();
  const { theme } = useTheme();
  const C = theme.colors;

  const styles = createStyles(C);

  const go = (tab: SalesTab) => {
    if (tab === "dashboard") {
      router.push({ pathname: "/SalesDashboard", params } as any);
      return;
    }

    if (tab === "leads") {
      router.push({ pathname: "/SalesLeads", params } as any);
      return;
    }

    router.push({ pathname: "/SalesClients", params } as any);
  };

  const items: { key: SalesTab; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
    { key: "dashboard", label: "Dashboard", icon: "insights" },
    { key: "leads", label: "Leads", icon: "groups" },
    { key: "clients", label: "Clients", icon: "person" },
  ];

  return (
    <View style={styles.wrap}>
      {showBackButton ? (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.back()}
          style={styles.btn}
        >
          <MaterialIcons name="arrow-back" size={22} color={C.navIconInactive} />
          <TText style={[styles.label, { color: C.navIconInactive }]}>Back</TText>
        </TouchableOpacity>
      ) : null}
      {items.map((item) => {
        const active = item.key === activeTab;
        const color = active ? C.navIconActive : C.navIconInactive;
        return (
          <TouchableOpacity
            key={item.key}
            activeOpacity={0.85}
            onPress={() => go(item.key)}
            style={styles.btn}
          >
            <MaterialIcons name={item.icon} size={22} color={color} />
            <TText style={[styles.label, { color }]}>{item.label}</TText>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const createStyles = (C: any) =>
  StyleSheet.create({
    wrap: {
      flexDirection: "row",
      justifyContent: "space-around",
      alignItems: "center",
      paddingTop: 12,
      paddingBottom: 22,
      borderTopWidth: 1,
      borderTopColor: "rgba(229,231,235,0.95)",
      backgroundColor: "rgba(255,255,255,0.94)",
    },
    btn: {
      width: 80,
      alignItems: "center",
      justifyContent: "center",
    },
    label: {
      marginTop: 6,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.6,
      textTransform: "uppercase",
    },
  });

export default SalesFooterNav;
