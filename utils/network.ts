// utils/network.ts
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { Platform } from "react-native";

import { apiUrl } from "./apiBase";

function basicOnline(state: Pick<NetInfoState, "isConnected" | "isInternetReachable"> | null | undefined) {
  return !!(state?.isConnected && state?.isInternetReachable !== false);
}

async function probeBackendHealth(): Promise<boolean> {
  if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.onLine === false) {
    return false;
  }

  try {
    const res = await fetch(apiUrl(`/health?ts=${Date.now()}`), {
      method: "GET",
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  if (Platform.OS !== "web") return basicOnline(state);

  if (!state.isConnected) return false;
  if (state.isInternetReachable === true) return true;

  return probeBackendHealth();
}

export function listenNetwork(onChange: (online: boolean) => void) {
  let cancelled = false;

  const emit = async (state: NetInfoState) => {
    const online =
      Platform.OS === "web"
        ? await (async () => {
            if (!state.isConnected) return false;
            if (state.isInternetReachable === true) return true;
            return probeBackendHealth();
          })()
        : basicOnline(state);

    if (!cancelled) onChange(online);
  };

  const sub = NetInfo.addEventListener((state) => {
    void emit(state);
  });

  void NetInfo.fetch().then((state) => emit(state));

  return () => {
    cancelled = true;
    sub && sub();
  };
}
