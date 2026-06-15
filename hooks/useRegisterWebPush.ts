import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePathname } from "expo-router";

import { authenticatedFetch } from "@/utils/auth";

const AUTH_USER_KEY = "auth_user";
const WEB_PUSH_DISMISSED_KEY = "web_push_prompt_dismissed";
const WEB_PUSH_STATUS_KEY = "web_push_status";

type WebPushCapability = {
  supported: boolean;
  isIos: boolean;
  standalone: boolean;
  requiresHomeScreenInstall: boolean;
  permission: NotificationPermission | "unsupported";
};

type HookState = WebPushCapability & {
  loading: boolean;
  enabled: boolean;
  dismissed: boolean;
  error: string;
  recipientCode: string;
  userType: string;
};

function safeWindow() {
  return typeof window !== "undefined" ? window : null;
}

function safeNavigator() {
  return typeof navigator !== "undefined" ? navigator : null;
}

function detectIosWeb(): boolean {
  const nav = safeNavigator();
  const ua = String(nav?.userAgent || "").toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
}

function detectStandalone(): boolean {
  const win = safeWindow() as (Window & { navigator?: { standalone?: boolean } }) | null;
  if (!win) return false;
  if (win.matchMedia?.("(display-mode: standalone)").matches) return true;
  return !!win.navigator?.standalone;
}

function getPermissionState(): NotificationPermission | "unsupported" {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

function isPushSupported(): boolean {
  const nav = safeNavigator();
  return !!(
    Platform.OS === "web" &&
    nav &&
    "serviceWorker" in nav &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    typeof Notification !== "undefined"
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const normalized = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(normalized);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getRecipientInfo(): Promise<{ userType: string; recipientCode: string }> {
  const raw = await AsyncStorage.getItem(AUTH_USER_KEY);
  if (!raw) return { userType: "", recipientCode: "" };
  try {
    const parsed = JSON.parse(raw);
    const userType = String(parsed?.user_type || "").trim().toLowerCase();
    const recipientCode =
      userType === "employee"
        ? String(parsed?.employee_code || "").trim()
        : userType === "client"
          ? String(parsed?.client_id || "").trim()
          : "";
    return { userType, recipientCode };
  } catch {
    return { userType: "", recipientCode: "" };
  }
}

async function getDismissedState(): Promise<boolean> {
  return (await AsyncStorage.getItem(WEB_PUSH_DISMISSED_KEY)) === "1";
}

async function getStoredEnabledState(): Promise<boolean> {
  return (await AsyncStorage.getItem(WEB_PUSH_STATUS_KEY)) === "enabled";
}

async function markEnabled() {
  await AsyncStorage.setItem(WEB_PUSH_STATUS_KEY, "enabled");
  await AsyncStorage.removeItem(WEB_PUSH_DISMISSED_KEY);
}

async function markDismissed() {
  await AsyncStorage.setItem(WEB_PUSH_DISMISSED_KEY, "1");
}

async function clearDismissed() {
  await AsyncStorage.removeItem(WEB_PUSH_DISMISSED_KEY);
}

export function useRegisterWebPush() {
  const pathname = usePathname();
  const [state, setState] = useState<HookState>({
    supported: false,
    isIos: false,
    standalone: false,
    requiresHomeScreenInstall: false,
    permission: "unsupported",
    loading: true,
    enabled: false,
    dismissed: false,
    error: "",
    recipientCode: "",
    userType: "",
  });

  const refreshState = useCallback(async () => {
    const supported = isPushSupported();
    const isIos = detectIosWeb();
    const standalone = detectStandalone();
    const dismissed = await getDismissedState();
    const { userType, recipientCode } = await getRecipientInfo();
    let enabled = await getStoredEnabledState();

    if (supported && recipientCode && (userType === "employee" || userType === "client")) {
      try {
        const registration = await navigator.serviceWorker.getRegistration("/sw.js");
        const subscription = registration ? await registration.pushManager.getSubscription() : null;
        enabled = enabled || !!subscription;
      } catch {
        // ignore refresh probe failures
      }
    }

    setState((prev) => ({
      ...prev,
      supported,
      isIos,
      standalone,
      requiresHomeScreenInstall: Boolean(isIos && !standalone),
      permission: supported ? getPermissionState() : "unsupported",
      enabled: Boolean(enabled && recipientCode && (userType === "employee" || userType === "client")),
      dismissed,
      recipientCode,
      userType,
      loading: false,
    }));
  }, []);

  useEffect(() => {
    void refreshState();
  }, [refreshState, pathname]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    const handleVisibilityOrFocus = () => {
      void refreshState();
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [refreshState]);

  const enable = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: "" }));

    try {
    if (!isPushSupported()) {
        throw new Error("This browser does not support web push notifications.");
      }

      const { userType, recipientCode } = await getRecipientInfo();
      if (!recipientCode || (userType !== "employee" && userType !== "client")) {
        throw new Error("Signed-in web session not found. Please log in again.");
      }

      if (detectIosWeb() && !detectStandalone()) {
        throw new Error("On iPhone/iPad, first add this app to the Home Screen, then open it from there.");
      }

      const vapidResponse = await authenticatedFetch("/webpush/public-key");
      const vapidPayload = await vapidResponse.json();
      if (!vapidResponse.ok || !vapidPayload?.public_key) {
        throw new Error(vapidPayload?.detail || "Unable to load web push public key.");
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription =
        existingSubscription ||
        (await (async () => {
          const permission = await Notification.requestPermission();
          if (permission !== "granted") {
            throw new Error("Notification permission was not granted.");
          }
          return registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPayload.public_key),
          });
        })());

      const registerResponse = await authenticatedFetch("/webpush/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employee_code: userType === "employee" ? recipientCode : undefined,
          client_id: userType === "client" ? recipientCode : undefined,
          endpoint: subscription.endpoint,
          keys: subscription.toJSON().keys,
        }),
      });

      if (!registerResponse.ok) {
        const errorPayload = await registerResponse.json().catch(() => ({}));
        throw new Error(errorPayload?.detail || "Failed to register web push subscription.");
      }

      await markEnabled();
      await clearDismissed();
      await refreshState();
    } catch (error: any) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: String(error?.message || error || "Failed to enable web push."),
      }));
      return false;
    }

    return true;
  }, [refreshState]);

  const dismiss = useCallback(async () => {
    await markDismissed();
    setState((prev) => ({ ...prev, dismissed: true }));
  }, []);

  const visible = useMemo(() => {
    if (Platform.OS !== "web") return false;
    if (state.loading) return false;
    if (!state.supported) return false;
    if (!state.recipientCode) return false;
    if (state.enabled) return false;
    if (state.dismissed) return false;
    return true;
  }, [state]);

  return {
    ...state,
    visible,
    enable,
    dismiss,
  };
}
