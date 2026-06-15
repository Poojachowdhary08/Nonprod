import React, { useMemo } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";

import TText from "@/components/TText";
import { useTheme } from "@/src/theme/ThemeProvider";
import { useRegisterWebPush } from "@/hooks/useRegisterWebPush";

export default function WebPushPrompt() {
  const { theme } = useTheme();
  const {
    visible,
    enable,
    dismiss,
    loading,
    error,
    isIos,
    requiresHomeScreenInstall,
    userType,
  } = useRegisterWebPush();

  const styles = useMemo(() => createStyles(theme.colors), [theme.colors]);

  if (Platform.OS !== "web" || !visible) return null;

  const title = requiresHomeScreenInstall
    ? "Install this app on your Home Screen to enable notifications"
    : "Enable browser notifications";

  const description = requiresHomeScreenInstall
    ? "On iPhone and iPad, open this site in Safari, tap Share, then Add to Home Screen. After opening the installed app, tap Enable."
    : isIos
      ? `Open the installed Home Screen app and allow notifications so you can receive Avenue ${userType === "client" ? "client" : "team"} updates even when the app is closed.`
      : `Turn on browser notifications so you can receive Avenue ${userType === "client" ? "client" : "team"} updates on web too.`;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.card}>
        <TText style={styles.title}>{title}</TText>
        <TText style={styles.body}>{description}</TText>
        {!!error && <TText style={styles.error}>{error}</TText>}
        <View style={styles.actions}>
          <Pressable
            style={[styles.secondaryButton, loading && styles.disabledButton]}
            onPress={() => void dismiss()}
            disabled={loading}
          >
            <TText style={styles.secondaryText}>Later</TText>
          </Pressable>
          <Pressable
            style={[styles.primaryButton, loading && styles.disabledButton]}
            onPress={() => void enable()}
            disabled={loading}
          >
            <TText style={styles.primaryText}>
              {requiresHomeScreenInstall ? "Enable After Install" : loading ? "Enabling..." : "Enable"}
            </TText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    wrap: {
      position: "absolute",
      right: 16,
      bottom: 20,
      left: 16,
      zIndex: 9999,
    },
    card: {
      borderRadius: 18,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    title: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.text,
      marginBottom: 8,
    },
    body: {
      fontSize: 13,
      lineHeight: 20,
      color: colors.mutedText,
      marginBottom: 12,
    },
    error: {
      fontSize: 12,
      lineHeight: 18,
      color: colors.danger,
      marginBottom: 10,
    },
    actions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 10,
    },
    primaryButton: {
      borderRadius: 999,
      backgroundColor: colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    secondaryButton: {
      borderRadius: 999,
      backgroundColor: colors.surfaceAlt || colors.bgElevated || colors.bg,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    primaryText: {
      color: colors.white,
      fontSize: 13,
      fontWeight: "800",
    },
    secondaryText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "700",
    },
    disabledButton: {
      opacity: 0.6,
    },
  });
}
