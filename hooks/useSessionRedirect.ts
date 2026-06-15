// hooks/useSessionRedirect.ts
import { useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, useRootNavigationState } from "expo-router";
import * as Linking from "expo-linking";
import { clearStoredAuth, restoreAuthenticatedUser } from "../utils/auth";

// If app opened via deep link to these paths, don't override it with Home/Login
const DEEP_LINK_KEEP_PATHS = [
  "/TaskManagementForm",
  "/TaskWorkflow",
  "/PropertyChats",
  "/CustomerChats",
  "/TicketDetails",
  "/ScanQRResult",
  "/ScanImage",
];

const normalizePathFromUrl = (url: string) => {
  try {
    const parsed = Linking.parse(url);
    const path = parsed.path ? `/${parsed.path}` : "/";
    return path;
  } catch {
    return "/";
  }
};

export const useSessionRedirect = () => {
  const router = useRouter();
  const rootNavState = useRootNavigationState();

  const hasRunRef = useRef(false);

  useEffect(() => {
    // ✅ Wait until Root Navigation is mounted
    if (!rootNavState?.key) return;

    // ✅ Run only once
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    let cancelled = false;

    const safeReplace = (path: string) => {
      if (cancelled) return;
      try {
        router.replace(path as any);
      } catch (e) {
        console.warn("[useSessionRedirect] router.replace failed:", e);
      }
    };

    const verifySessionAndRedirect = async () => {
      try {
        // ✅ Native-safe deep link detection
        const initialUrl = await Linking.getInitialURL();
        const initialPath = initialUrl ? normalizePathFromUrl(initialUrl) : null;

        const isDeepLink =
          !!initialPath &&
          DEEP_LINK_KEEP_PATHS.some((p) => initialPath.startsWith(p));

        if (__DEV__) {
          console.log("[useSessionRedirect] rootNav ready:", rootNavState.key);
          console.log("[useSessionRedirect] initialUrl:", initialUrl);
          console.log("[useSessionRedirect] initialPath:", initialPath);
          console.log("[useSessionRedirect] isDeepLink:", isDeepLink);
        }

        const loginType = await AsyncStorage.getItem("login_type");

        // 1) Email login → employee
        if (loginType === "email") {
          await AsyncStorage.setItem("user_type", "employee");
          console.log("[useSessionRedirect] Email login — employee");
          if (!isDeepLink) safeReplace("/HomeScreen");
          return;
        }

        const refreshToken = await AsyncStorage.getItem("refresh_token");

        if (!refreshToken) {
          console.log("[useSessionRedirect] Missing creds — LoginPage");
          if (!isDeepLink) safeReplace("/LoginPage");
          return;
        }

        // 3) Restore the canonical JWT-backed user session.
        const currentUser = await restoreAuthenticatedUser();

        if (currentUser.user_type === "employee") {
          await AsyncStorage.setItem("user_type", "employee");
          console.log("[useSessionRedirect] ✅ Employee JWT session valid");
          if (!isDeepLink) safeReplace("/HomeScreen");
          return;
        }

        if (currentUser.user_type === "client") {
          await AsyncStorage.setItem("user_type", "client");
          console.log("[useSessionRedirect] ✅ Client JWT session valid");
          if (!isDeepLink) safeReplace("/CustomerHomeScreen");
          return;
        }

        console.warn("[useSessionRedirect] Unknown JWT user type — clearing");
        await clearStoredAuth();
        if (!isDeepLink) safeReplace("/LoginPage");
      } catch (err) {
        console.error("[useSessionRedirect] Fatal error:", err);
        await clearStoredAuth();
        safeReplace("/LoginPage");
      }
    };

    verifySessionAndRedirect();

    return () => {
      cancelled = true;
    };
  }, [rootNavState?.key, router]);
};
