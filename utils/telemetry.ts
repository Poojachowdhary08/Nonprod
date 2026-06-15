// utils/telemetry.ts
import axios from "axios";
import { Platform, AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";

const EVENT_BATCH_ENDPOINT = "/mobile-events/batch";

// How many events to send in one batch
const MAX_BATCH_SIZE = 50;

// ❌ We are intentionally NOT using periodic flush now
// const FLUSH_INTERVAL_MS = 10_000;

// Max queue length (after this we start dropping old events)
const MAX_QUEUE_LENGTH = 500;

// 🔹 Analytics session config (NOT login/auth session)
// One "session" groups a cluster of events while the user is active.
// If user is idle for 30 mins, we start a new analytics session.
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

type TelemetryGlobalContext = {
  appVersion?: string;
  env?: "dev" | "prod" | string;
  userId?: string | null;
  employeeCode?: string | null;
};

type TelemetryDynamicContext = {
  screen?: string;
  propertyId?: string | null;
  scheduleId?: number | string | null;
  issueId?: number | string | null;
  [key: string]: any;
};

type TelemetryEvent = {
  event: string;
  ts: string; // ISO string
  data: Record<string, any>;
};

let globalContext: TelemetryGlobalContext = {};
let dynamicContext: TelemetryDynamicContext = {};
let queue: TelemetryEvent[] = [];

// 🔹 guard so we don't recursively re-enter flushTelemetry
let isFlushing = false;

let telemetryEnabled = true;

// 🔹 Analytics session state (in-memory per app run)
let currentSessionId: string | null = null;
let lastSessionEventAtMs: number | null = null;

// --- Lifecycle hooks cleanup ---
let appStateSub: any | null = null;
let webVisibilityHandler: any | null = null;
let webBeforeUnloadHandler: any | null = null;

function generateSessionId(): string {
  const now = Date.now();
  const rand = Math.random().toString(16).slice(2, 10);
  const id = `sess_${now}_${rand}`;
  if (__DEV__) console.log("[Telemetry] 🔵 new analytics session_id", id);
  return id;
}

function getOrCreateSessionId(): string {
  const now = Date.now();

  if (currentSessionId && lastSessionEventAtMs != null) {
    const diff = now - lastSessionEventAtMs;
    if (diff < SESSION_IDLE_TIMEOUT_MS) {
      lastSessionEventAtMs = now;
      return currentSessionId;
    }
    if (__DEV__) {
      console.log(
        "[Telemetry] ⏱ session idle too long, rotating",
        currentSessionId,
        "idle(ms)=",
        diff
      );
    }
  }

  currentSessionId = generateSessionId();
  lastSessionEventAtMs = now;
  return currentSessionId;
}

/**
 * Initialize global telemetry context (call once in App root).
 * Also wires lifecycle hooks so we flush on background/close only.
 */
export function initTelemetry(ctx: TelemetryGlobalContext) {
  globalContext = { ...globalContext, ...ctx };

  if (__DEV__) console.log("[Telemetry] initTelemetry", globalContext);

  // Wire lifecycle hooks once
  wireLifecycleFlushHooks();
}

/**
 * Call this if you ever need to remove hooks (rare, but good hygiene).
 */
export function shutdownTelemetry() {
  if (appStateSub?.remove) appStateSub.remove();
  appStateSub = null;

  if (typeof document !== "undefined") {
    if (webVisibilityHandler) {
      document.removeEventListener("visibilitychange", webVisibilityHandler);
      webVisibilityHandler = null;
    }
  }

  if (typeof window !== "undefined") {
    if (webBeforeUnloadHandler) {
      window.removeEventListener("beforeunload", webBeforeUnloadHandler);
      webBeforeUnloadHandler = null;
    }
  }

  if (__DEV__) console.log("[Telemetry] shutdownTelemetry done");
}

export function updateGlobalContext(ctx: Partial<TelemetryGlobalContext>) {
  globalContext = { ...globalContext, ...ctx };
  if (__DEV__) console.log("[Telemetry] updateGlobalContext", globalContext);
}

export function updateDynamicContext(ctx: TelemetryDynamicContext) {
  dynamicContext = { ...dynamicContext, ...ctx };
  if (__DEV__) console.log("[Telemetry] updateDynamicContext", dynamicContext);
}

export function clearDynamicContext() {
  dynamicContext = {};
  if (__DEV__) console.log("[Telemetry] clearDynamicContext");
}

export function setTelemetryEnabled(enabled: boolean) {
  telemetryEnabled = enabled;
  if (__DEV__) console.log("[Telemetry] setTelemetryEnabled =", enabled);
}

export function trackEvent(event: string, data: Record<string, any> = {}) {
  if (!telemetryEnabled) return;

  const ts = new Date().toISOString();
  const sessionId = getOrCreateSessionId();

  const mergedData: Record<string, any> = {
    ...data,
    platform: Platform.OS,
    session_id: sessionId,
    ...globalContext,
    ...dynamicContext,
  };

  const payload: TelemetryEvent = { event, ts, data: mergedData };

  if (__DEV__) console.log("📲 [Telemetry]", event, mergedData);

  enqueueEvent(payload);
}

export function trackScreen(screen: string, extra: Record<string, any> = {}) {
  updateDynamicContext({ screen });
  trackEvent("screen_view", { screen, ...extra });
}

export function trackUI(params: {
  screen?: string;
  element: string;
  action: "click" | "toggle" | "submit" | "open" | "close" | string;
  extra?: Record<string, any>;
}) {
  const { screen, element, action, extra = {} } = params;
  if (screen) updateDynamicContext({ screen });

  trackEvent("ui_event", {
    screen: screen ?? dynamicContext.screen,
    element,
    action,
    ...extra,
  });
}

export function trackNetwork(params: {
  url: string;
  method?: string;
  status?: number;
  durationMs?: number;
  ok?: boolean;
  requestId?: string | null;
  extra?: Record<string, any>;
}) {
  const {
    url,
    method = "GET",
    status,
    durationMs,
    ok,
    requestId,
    extra = {},
  } = params;

  trackEvent("network_event", {
    url,
    method: method.toUpperCase(),
    status,
    duration_ms: durationMs,
    ok,
    request_id: requestId ?? null,
    ...extra,
  });
}

/**
 * ✅ Screen time tracking helper
 * Use inside a screen:
 *   useEffect(() => {
 *     const stop = startScreenTimer("RequestedInventory", {...});
 *     return stop;
 *   }, []);
 */
export function startScreenTimer(
  screenName: string,
  extra: Record<string, any> = {}
) {
  const startedAt = Date.now();

  // optional "enter" event (separate from screen_view)
  trackUI({
    screen: screenName,
    element: "screen_enter",
    action: "open",
    extra: {
      ...extra,
      startedAt,
    },
  });

  // cleanup on unmount
  return () => {
    const endedAt = Date.now();
    const durationMs = endedAt - startedAt;

    trackUI({
      screen: screenName,
      element: "screen_exit",
      action: "close",
      extra: {
        ...extra,
        startedAt,
        endedAt,
        durationMs,
      },
    });
  };
}

/**
 * ✅ Telemetry guard for polling / delta sync
 * - Still logs network_event always (you already do that)
 * - Only logs UI "delta_applied" if fingerprint changed
 *
 * Usage:
 *   const guard = makeDeltaGuard("RequestedInventory:delta");
 *   ...
 *   if (guard.shouldApply(changes)) { setState(); trackUI(...); }
 */
export function makeDeltaGuard(guardKey: string) {
  let lastFingerprint: string | null = null;

  function fingerprintList(rows: any[]): string {
    // Keep it stable + cheap:
    // request_id + updated_at/created_at is enough to detect changes.
    if (!Array.isArray(rows) || rows.length === 0) return "EMPTY";
    const parts = rows.map((r) => {
      const id = String(r?.request_id ?? "");
      const t = String(r?.updated_at ?? r?.created_at ?? "");
      const s = String(r?.status ?? "");
      return `${id}|${t}|${s}`;
    });
    parts.sort(); // stable order
    return parts.join("~");
  }

  return {
    shouldApply(rows: any[]): boolean {
      const fp = fingerprintList(rows);
      const changed = fp !== lastFingerprint;
      lastFingerprint = fp;

      if (!changed && __DEV__) {
        console.log("[Telemetry] delta guard: no-change", { guardKey });
      }
      return changed;
    },
    reset() {
      lastFingerprint = null;
      if (__DEV__) console.log("[Telemetry] delta guard reset", { guardKey });
    },
    getLastFingerprint() {
      return lastFingerprint;
    },
  };
}

/**
 * Flush the telemetry queue.
 *
 * IMPORTANT:
 * - Flush only sends queued events.
 * - It must NEVER call trackEvent() to avoid recursion loops.
 */
export async function flushTelemetry(options?: { reason?: string }) {
  if (!telemetryEnabled) return;
  if (isFlushing) return;
  if (queue.length === 0) return;

  isFlushing = true;

  const snapshot = queue.slice(0, MAX_BATCH_SIZE);
  if (snapshot.length === 0) {
    isFlushing = false;
    return;
  }

  const net = await NetInfo.fetch();
  if (!net.isConnected || net.isInternetReachable === false) {
    if (__DEV__) {
      console.log("[Telemetry] flush skipped - offline", {
        reason: options?.reason,
        queue_length: queue.length,
        attempted_batch_size: snapshot.length,
        net_isConnected: net.isConnected,
        net_isInternetReachable: net.isInternetReachable,
        net_type: net.type,
      });
    }
    isFlushing = false;
    return;
  }

  if (__DEV__) {
    console.log("[Telemetry] flushing", {
      reason: options?.reason,
      count: snapshot.length,
    });
  }

  try {
    await axios.post(
      EVENT_BATCH_ENDPOINT,
      { events: snapshot },
      {
        timeout: 5000,
        headers: { "Content-Type": "application/json" },
      }
    );

    // Remove successfully sent events
    queue = queue.slice(snapshot.length);

    if (__DEV__) {
      console.log("[Telemetry] flush success", {
        reason: options?.reason,
        sent_count: snapshot.length,
        remaining_queue_length: queue.length,
      });
    }
  } catch (err: any) {
    const message =
      err?.message || (typeof err === "string" ? err : "unknown flush error");

    console.warn("[Telemetry] flush failed (events kept in queue)", {
      reason: options?.reason,
      error_message: message,
      queue_length: queue.length,
      attempted_batch_size: snapshot.length,
    });
  } finally {
    isFlushing = false;
  }
}

// ----------------- internal helpers -----------------

function enqueueEvent(ev: TelemetryEvent) {
  if (queue.length >= MAX_QUEUE_LENGTH) {
    const dropped = queue.shift();
    if (__DEV__) {
      console.log("[Telemetry] dropping oldest event due to max queue", dropped);
    }
  }

  queue.push(ev);

  // If we have enough events, flush immediately (batch trigger)
  if (!isFlushing && queue.length >= MAX_BATCH_SIZE) {
    if (__DEV__) console.log("[Telemetry] queue hit MAX_BATCH_SIZE → flush()");
    flushTelemetry({ reason: "max_batch_size" }).catch((err) =>
      console.warn("[Telemetry] on-demand flush error", err)
    );
  }
}

/**
 * Wire lifecycle hooks:
 * - Native: flush when AppState becomes background/inactive
 * - Web: flush when tab hidden or unload
 */
function wireLifecycleFlushHooks() {
  // ---- React Native (mobile) ----
  if (!appStateSub && typeof AppState !== "undefined") {
    appStateSub = AppState.addEventListener("change", (nextState) => {
      // background / inactive = app leaving foreground
      if (nextState === "background" || nextState === "inactive") {
        if (queue.length > 0) {
          flushTelemetry({ reason: `appstate_${nextState}` }).catch(() => {});
        }
      }
    });
  }

  // ---- Web (expo web / react-native-web) ----
  if (Platform.OS === "web" && typeof document !== "undefined" && !webVisibilityHandler) {
    webVisibilityHandler = () => {
      if (document.visibilityState === "hidden") {
        if (queue.length > 0) {
          flushTelemetry({ reason: "visibility_hidden" }).catch(() => {});
        }
      }
    };
    document.addEventListener("visibilitychange", webVisibilityHandler);
  }

  if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.addEventListener === "function" && !webBeforeUnloadHandler) {
    // Note: beforeunload should be minimal. Some browsers block async;
    // but we try anyway. visibilitychange usually catches earlier.
    webBeforeUnloadHandler = () => {
      if (queue.length > 0) {
        // Fire and forget; browser may not wait.
        flushTelemetry({ reason: "beforeunload" }).catch(() => {});
      }
    };
    window.addEventListener("beforeunload", webBeforeUnloadHandler);
  }
}