import React, { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePathname } from "expo-router";
import AppUpdateDialog from "@/components/AppUpdateDialog";
import { getInstalledAppVersion, useAppVersionControl } from "@/hooks/useAppVersionControl";
import { API_BASE_URL } from "@/utils/apiBase";

const FALLBACK_UPDATE_URL = "https://play.google.com/apps/internaltest/4701703145995257919";
const SKIP_PATHS = new Set(["/", "/LoginPage", "/RedirectAfterLogin"]);

const GlobalAppUpdateGate = () => {
  const pathname = usePathname();
  const [employeeCode, setEmployeeCode] = useState("");
  const [dismissedUpdate, setDismissedUpdate] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadIdentity = async () => {
      try {
        const loginType = await AsyncStorage.getItem("login_type");
        if (!mounted) return;

        if (loginType === "email") {
          setEmployeeCode("EMP_CON_999");
          return;
        }

        const cachedEmployee = await AsyncStorage.getItem("cached_employee");
        if (!mounted) return;

        if (cachedEmployee) {
          const parsed = JSON.parse(cachedEmployee);
          setEmployeeCode(parsed?.employee_code || "");
        }
      } catch {
        if (mounted) setEmployeeCode("");
      }
    };

    loadIdentity();
    return () => {
      mounted = false;
    };
  }, [pathname]);

  const shouldEnableGate = !SKIP_PATHS.has(pathname || "") && !!employeeCode;

  const {
    isBlocked,
    isOutdated,
    currentVersion,
    latestVersion,
    changelog,
    openUpdateLink,
  } = useAppVersionControl({
    employee_code: employeeCode,
    serverUrl: API_BASE_URL,
    updateUrlFallback: FALLBACK_UPDATE_URL,
    enabled: shouldEnableGate,
  });

  useEffect(() => {
    if (isBlocked) {
      setDismissedUpdate(false);
      return;
    }

    if (!isOutdated) {
      setDismissedUpdate(false);
    }
  }, [isBlocked, isOutdated, latestVersion]);

  const installedVersion = currentVersion || getInstalledAppVersion();
  const showUpdateDialog = isBlocked || (isOutdated && !dismissedUpdate);

  return (
    <AppUpdateDialog
      visible={showUpdateDialog}
      currentVersion={installedVersion}
      latestVersion={latestVersion}
      changelog={changelog}
      forceUpdate={isBlocked}
      onUpdatePress={openUpdateLink}
      onClose={isBlocked ? undefined : () => setDismissedUpdate(true)}
    />
  );
};

export default GlobalAppUpdateGate;
