// app/_layout.tsx
import React, { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { View, StyleSheet, Text, TextInput, StatusBar, Platform } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import axios from "axios";
import * as Application from "expo-application";
import * as Notifications from "expo-notifications";

import { useSessionRedirect } from "@/hooks/useSessionRedirect";
import { API_BASE_URL, ENV } from "../utils/apiBase";
import { installAuthTransports } from "../utils/auth";
import { configureConsole } from "../utils/consoleControl";
import { initTelemetry } from "../utils/telemetry";
import { handleNotificationResponseRedirect } from "@/utils/notificationRedirect";
import WebPushPrompt from "@/components/WebPushPrompt";

import { FontScaleProvider } from "@/context/FontScaleContext";
import { ThemeProvider, useTheme } from "@/src/theme/ThemeProvider";
import GlobalAppUpdateGate from "@/components/GlobalAppUpdateGate";

configureConsole();
axios.defaults.baseURL = API_BASE_URL;
installAuthTransports(axios);

function ThemedAppShell() {
  const { theme } = useTheme();

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.colors.bg }]}
      edges={["top"]}
    >
      <StatusBar
        barStyle={theme.mode === "dark" ? "light-content" : "dark-content"}
        backgroundColor={theme.colors.bg}
      />

      <View style={styles.container}>
        <FontScaleProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.colors.bg },
            }}
          >
            <Stack.Screen name="HomeScreen" />
            <Stack.Screen name="CustomerHomeScreen" />
            <Stack.Screen name="LoginPage" />
            <Stack.Screen name="index" />
            <Stack.Screen name="ScanImage" />
            <Stack.Screen name="ProjectsScreen" />
            <Stack.Screen name="PropertiesScreen" />
            <Stack.Screen name="PropertiesListScreen" />
            <Stack.Screen name="PropertyDetailsScreen" />
            <Stack.Screen name="PropertyHistory" />
            <Stack.Screen name="PropertyUploadedDocuments" />
            <Stack.Screen name="LabourDetailsFormScreen" />
            <Stack.Screen name="TaskManagementForm" />
            <Stack.Screen name="TaskList" />
            <Stack.Screen name="ViewSchedulesForm" />
            <Stack.Screen name="InventoryScreen" />
            <Stack.Screen name="InventoryItemDetails" />
            <Stack.Screen name="MasterItems" />
            <Stack.Screen name="MasterItemDetails" />
            <Stack.Screen name="ComingSoon" />
            <Stack.Screen name="RequestedInventory" />
            <Stack.Screen name="EditDeleteInventory" />
            <Stack.Screen name="TaskSchedule" />
            <Stack.Screen name="PropertyInventory" />
            <Stack.Screen name="ManPower" />
            <Stack.Screen name="ManPowerList" />
            <Stack.Screen name="ManPowerListDetails" />
            <Stack.Screen name="PropertyChats" />
            <Stack.Screen name="TaskWorkflow" />
            <Stack.Screen name="EmojiPicker" />
            <Stack.Screen name="ReviewEngineer" />
            <Stack.Screen name="PropertyReviewEngineer" />
            <Stack.Screen name="TicketDetails" />
            <Stack.Screen name="PropertyRaiseIssue" />
            <Stack.Screen name="RaiseIssue" />
            <Stack.Screen name="ImageViewer" options={{ headerShown: true }} />
            <Stack.Screen name="PDFViewer" options={{ headerShown: true }} />
            <Stack.Screen name="PropertiesChatList" />
            <Stack.Screen name="PropertyChatsMessages" />
            <Stack.Screen name="Notifications" />
            <Stack.Screen name="CustomerProjects" />
            <Stack.Screen name="CustomerProperties" />
            <Stack.Screen name="CustomerPropertiesListScreen" />
            <Stack.Screen name="CustomerChats" />
            <Stack.Screen name="CustomerTaskWorkflow" />
            <Stack.Screen name="RedirectAfterLogin" />
            <Stack.Screen name="PropertyChatsWrapper" />
            <Stack.Screen name="CustomerMessageWrapper" />
            <Stack.Screen name="TaskWorkflowWrapper" />
            <Stack.Screen name="TaskHoldLogsScreen" />
            <Stack.Screen name="StockManager" />
            <Stack.Screen name="StockRequestDetails" />
            <Stack.Screen name="InventoryScanResult" />
            <Stack.Screen name="MultipleRequestMasterItem" />
            <Stack.Screen name="ScanQRResult" />
            <Stack.Screen name="PropertiesMasterItems" />
            <Stack.Screen name="PropertiesMultiRequestMasterItem" />
            <Stack.Screen name="PropertyWorkers" />
            <Stack.Screen name="WorkerEntriesScreen" />
            <Stack.Screen name="WorkerEntryDetailsScreen" />
            <Stack.Screen name="AppLayout" />
            <Stack.Screen name="AppFooterNav" />
            <Stack.Screen name="AvenueAskScreen" />
            <Stack.Screen name="StockInventoryScreen" />
            <Stack.Screen name="SalesLeads" />
            <Stack.Screen name="SalesDashboard" />
            <Stack.Screen name="AddLead" />
            <Stack.Screen name="LeadDetails" />
            <Stack.Screen name="SalesClients" />
          </Stack>

          <GlobalAppUpdateGate />
          <WebPushPrompt />
        </FontScaleProvider>
      </View>
    </SafeAreaView>
  );
}

export default function Layout() {
  useSessionRedirect();
  const router = useRouter();

  useEffect(() => {
    if (__DEV__) {
      console.log("[Layout] axios.defaults.baseURL =", axios.defaults.baseURL);
    }

    // Prevent OS font scaling from stacking with your custom slider scaling
    // @ts-ignore
    Text.defaultProps = Text.defaultProps || {};
    // @ts-ignore
    Text.defaultProps.allowFontScaling = false;
    // @ts-ignore
    TextInput.defaultProps = TextInput.defaultProps || {};
    // @ts-ignore
    TextInput.defaultProps.allowFontScaling = false;
    // @ts-ignore
    TextInput.defaultProps.underlineColorAndroid = "transparent";

    try {
      const appVersion = Application.nativeApplicationVersion || "prod";
      if (typeof initTelemetry === "function") {
        initTelemetry({
          appVersion,
          env: ENV,
          userId: null,
          employeeCode: null,
        });
      } else {
        console.warn("[Layout] initTelemetry is not a function");
      }
    } catch (e) {
      console.warn("[Layout] Telemetry init failed:", e);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || typeof document === "undefined") return;

    const ua = String(window.navigator?.userAgent || "").toLowerCase();
    const isIosWeb =
      /iphone|ipad|ipod/.test(ua) || (ua.includes("macintosh") && "ontouchend" in window);

    if (!isIosWeb) return;

    const styleId = "ios-web-input-zoom-guard";
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;

    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = styleId;
      styleEl.textContent = `
        html {
          -webkit-text-size-adjust: 100%;
        }

        input,
        textarea,
        select {
          font-size: 16px !important;
        }
      `;
      document.head.appendChild(styleEl);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let lastHandledKey = "";

    const handleResponse = async (response: Notifications.NotificationResponse | null | undefined) => {
      if (!active || !response) return;
      const requestId =
        response.notification?.request?.identifier ||
        response.notification?.request?.trigger?.toString?.() ||
        "";
      const actionId = response.actionIdentifier || "";
      const dedupeKey = `${requestId}:${actionId}`;
      if (dedupeKey && dedupeKey === lastHandledKey) return;
      lastHandledKey = dedupeKey;

      try {
        await handleNotificationResponseRedirect(router, response);
      } catch (error) {
        console.warn("[Layout] Notification redirect failed:", error);
      }
    };

    Notifications.getLastNotificationResponseAsync()
      .then(handleResponse)
      .catch((error) => console.warn("[Layout] Failed to load last notification response:", error));

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void handleResponse(response);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [router]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || !window.location) return;

    const pushPayloadRaw = new URLSearchParams(window.location.search).get("pushPayload");
    if (!pushPayloadRaw) return;

    try {
      const parsed = JSON.parse(decodeURIComponent(pushPayloadRaw));
      void handleNotificationResponseRedirect(router, {
        notification: {
          request: {
            identifier: "web-push-url",
            content: { data: parsed },
          },
        },
        actionIdentifier: "default",
      } as any);
    } catch (error) {
      console.warn("[Layout] Failed to parse web push payload from URL:", error);
    } finally {
      const nextUrl = `${window.location.pathname}${window.location.hash || ""}`;
      window.history.replaceState({}, "", nextUrl);
    }
  }, [router]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      const messageType = String(event?.data?.type || "");
      if (messageType !== "WEB_PUSH_NOTIFICATION_CLICK") return;

      const payload = event?.data?.payload || {};
      void handleNotificationResponseRedirect(router, {
        notification: {
          request: {
            identifier: "web-push-message",
            content: { data: payload },
          },
        },
        actionIdentifier: "default",
      } as any);
    };

    navigator.serviceWorker.addEventListener("message", handleServiceWorkerMessage);

    return () => {
      navigator.serviceWorker.removeEventListener("message", handleServiceWorkerMessage);
    };
  }, [router]);

  return (
    <SafeAreaProvider testID="layout-root">
      <ThemeProvider>
        <ThemedAppShell />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  container: {
    flex: 1,
  },
});
