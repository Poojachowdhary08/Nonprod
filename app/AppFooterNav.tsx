import React from "react";
import { View, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import TText from "@/components/TText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme/ThemeProvider";

export type FooterNavItem = {
  id: number;
  title: string;
  iconName?: string;
};

type Props = {
  items: FooterNavItem[];
  selectedSection: number;
  online: boolean;
  isDisabledOffline: (id: number) => boolean;
  onSelect: (item: FooterNavItem) => void;
  colors: {
    border: string;
    accent: string;
    accentSoft: string;
    muted: string;
    disabledText: string;
  };
  useBottomInset?: boolean;
  compact?: boolean;
};

const toTestIdSlug = (title: string) =>
  String(title || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const AppFooterNav: React.FC<Props> = ({
  items,
  selectedSection,
  online,
  isDisabledOffline,
  onSelect,
  colors,
  useBottomInset = false,
  compact = false,
}) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const bottomPad =
    Platform.OS === "ios"
      ? useBottomInset
        ? Math.max(insets.bottom, 8)
        : 8
      : Math.max(insets.bottom, 0);

  return (
    <View
      style={[
        styles.footer,
        {
          backgroundColor: theme.colors.navBg,
          borderTopColor: theme.colors.border,
        },
        { paddingBottom: bottomPad },
      ]}
      testID="app-footer-nav-root"
    >
      {items.map((it) => {
        const active = selectedSection === it.id;
        const disabled = it.id !== 0 && isDisabledOffline(it.id);
        const slug = toTestIdSlug(it.title);

        return (
          <TouchableOpacity
            key={it.id}
            testID={`app-footer-nav-item-${slug}`}
            accessibilityLabel={`footer-${slug}`}
            disabled={disabled}
            onPress={() => onSelect(it)}
            activeOpacity={disabled ? 1 : 0.85}
            style={[styles.footerItem, disabled && styles.footerItemDisabled]}
          >
            <View
              testID={`app-footer-nav-icon-wrap-${slug}`}
              style={[
                styles.footerIconWrap,
                {
                  borderColor: colors.border,
                  backgroundColor: active ? colors.accentSoft : theme.colors.surfaceAlt,
                },
              ]}
            >
              <Ionicons
                name={(it.iconName as any) || "ellipse-outline"}
                size={20}
                color={active ? colors.accent : colors.disabledText}
              />
            </View>

            <TText
              testID={`app-footer-nav-label-${slug}`}
              style={[
                styles.footerLabel,
                { color: active ? colors.accent : colors.muted },
                disabled && { color: colors.disabledText },
              ]}
              numberOfLines={1}
            >
              {it.title}
            </TText>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

export default AppFooterNav;

const styles = StyleSheet.create({
  footer: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#EAEAEA",
    paddingTop: 8,
    paddingHorizontal: 6,
  },
  footerItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    marginHorizontal: 2,
    borderRadius: 12,
  },
  footerItemDisabled: {
    opacity: 0.5,
  },
  footerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  footerLabel: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "900",
  },
});