import { useCallback, useEffect, useState } from "react";
import { Linking, Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";

interface ExtraManifest {
  version?: string;
}

interface VersionPayload {
  latest_version?: string;
  min_required_version?: string;
  force_update?: boolean;
  changelog?: string;
  deep_link?: string | null;
}

interface Options {
  employee_code: string;
  serverUrl: string;
  updateUrlFallback?: string;
  enabled?: boolean;
}

const normalizeVersion = (version?: string | null) =>
  `${version || ""}`
    .trim()
    .split(".")
    .map((part) => {
      const parsed = Number.parseInt(part.replace(/[^0-9].*$/, ""), 10);
      return Number.isFinite(parsed) ? parsed : 0;
    });

export const compareVersions = (left?: string | null, right?: string | null) => {
  const a = normalizeVersion(left);
  const b = normalizeVersion(right);
  const length = Math.max(a.length, b.length);

  for (let i = 0; i < length; i += 1) {
    const leftPart = a[i] ?? 0;
    const rightPart = b[i] ?? 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }

  return 0;
};

export const getInstalledAppVersion = () => {
  return (
    (Constants as any)?.nativeAppVersion ||
    (Constants as any)?.expoConfig?.version ||
    (Constants.manifest2?.extra as ExtraManifest)?.version ||
    (Constants.manifest as any)?.version ||
    "unknown"
  );
};

export const useAppVersionControl = ({ employee_code, serverUrl, updateUrlFallback = "", enabled = true }: Options) => {
  const [isBlocked, setIsBlocked] = useState(false);
  const [isOutdated, setIsOutdated] = useState(false);
  const [currentVersion, setCurrentVersion] = useState("unknown");
  const [latestVersion, setLatestVersion] = useState("");
  const [minRequiredVersion, setMinRequiredVersion] = useState("");
  const [forceUpdate, setForceUpdate] = useState(false);
  const [changelog, setChangelog] = useState("");
  const [updateUrl, setUpdateUrl] = useState(updateUrlFallback);
  const [isChecking, setIsChecking] = useState(false);

  const openUpdateLink = useCallback(async () => {
    if (!updateUrl) return;

    try {
      const supported = await Linking.canOpenURL(updateUrl);
      if (supported) {
        await Linking.openURL(updateUrl);
      }
    } catch (err) {
      console.error("Failed to open update URL:", err);
    }
  }, [updateUrl]);

  useEffect(() => {
    const checkVersion = async () => {
      const platform = Platform.OS;
      if (!enabled || !employee_code || !serverUrl || platform === "web") {
        return;
      }

      setIsChecking(true);
      setIsBlocked(false);
      setIsOutdated(false);

      try {
        const version = getInstalledAppVersion();
        setCurrentVersion(version);

        const device_id = Constants.deviceName || Device.modelName || "unknown";

        await fetch(`${serverUrl}/log-version`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employee_code,
            current_version: version,
            platform,
            device_id,
          }),
        });

        const res = await fetch(`${serverUrl}/get-latest-version?platform=${platform}`);
        const data = (await res.json()) as VersionPayload;
        const latest = data?.latest_version || "";
        const minRequired = data?.min_required_version || "";
        const shouldForce = !!data?.force_update;

        setLatestVersion(latest);
        setMinRequiredVersion(minRequired);
        setForceUpdate(shouldForce);
        setChangelog(data?.changelog || "");
        setUpdateUrl(data?.deep_link || updateUrlFallback);

        const isBelowMinRequired = minRequired ? compareVersions(version, minRequired) < 0 : false;
        const isBelowLatest = latest ? compareVersions(version, latest) < 0 : false;

        if (shouldForce && isBelowMinRequired) {
          setIsBlocked(true);
        } else if (isBelowLatest) {
          setIsOutdated(true);
        }
      } catch (err) {
        console.error("Version check failed:", err);
      } finally {
        setIsChecking(false);
      }
    };

    checkVersion();
  }, [employee_code, enabled, serverUrl, updateUrlFallback]);

  return {
    isBlocked,
    isOutdated,
    currentVersion,
    latestVersion,
    minRequiredVersion,
    forceUpdate,
    changelog,
    updateUrl,
    isChecking,
    openUpdateLink,
  };
};
