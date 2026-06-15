import { API_BASE_URL as APP_API_BASE_URL } from "./apiBase";
// outbox.ts
// Offline Outbox for chat + task updates with file caching.
// iOS/Android: files copied into app cache dir; metadata in AsyncStorage.
// Web: metadata only (no file bytes cache).
// 🔥 CONSTRUCTION AUDIT LOGGING: All operations logged for compliance & audit trails.

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system';
import { AppState, Platform } from 'react-native';
import { trackEvent } from './telemetry';

export type SendTarget = 'customer' | 'employee';

type CachedFile = {
  cachedUri?: string; // absolute file path/uri we control (iOS/Android)
  name: string;
  type: string;
  originalUri?: string; // for reference/UI
  webHasFile?: boolean; // web-only hint
};

export type OutboxItem = {
  id: string;
  createdAt: number;

  /**
   * tries = number of FAILED attempts so far.
   * Attempt number = tries + 1
   * Max attempts allowed = MAX_RETRIES
   */
  tries: number;
  nextTryAt: number;

  scheduleId: number;
  taskId: string | null;
  propertyId: string;
  engineerName: string;
  employeeCode: string;
  phaseName: string;
  status: string;
  startISODate: string;
  endISODate: string;
  applyToAll: boolean;
  updateText: string;
  sendTarget: SendTarget;
  files: CachedFile[];

  /**
   * ✅ Progress flags (persisted):
   * Prevent duplicates on retry after partial success.
   */
  sentScheduleUpdate?: boolean;
  sentTaskUpdate?: boolean;
  sentChat?: boolean;
};

type DLQItem = OutboxItem & {
  failedAt: number;
  failureReason: string;
  totalAttempts: number;
};

const STORAGE_KEY = 'outbox:v2';
const DLQ_STORAGE_KEY = 'outbox:dlq:v2';

const MAX_RETRIES = 5; // max TOTAL attempts (tries+1) <= 5
const DLQ_MAX_ITEMS = 200;

/**
 * Optional queue cap: prevents a phone staying offline forever from growing unbounded.
 * Oldest items get dropped (per schedule compaction helps a lot already).
 */
const OUTBOX_MAX_ITEMS = 500;

/**
 * Limits for merge/compaction (to avoid huge payloads)
 */
const MERGE_MAX_FILES = 12;
const MERGE_MAX_TEXT_CHARS = 4000;

const CACHE_DIR =
  (FileSystem.cacheDirectory || FileSystem.documentDirectory || '') + 'outbox/';

const SCHEDULE_API_TIMEOUT_MS = 30000;
const FILE_UPLOAD_API_TIMEOUT_MS = 60000;
const CHAT_API_TIMEOUT_MS = 30000;

/**
 * Shared API base URL for this app.
 * `globalThis.__API_BASE_URL__` is populated in `utils/apiBase.ts`.
 */
const BASE_URL =
  // @ts-ignore
  (globalThis as any)?.__API_BASE_URL__ ||
  `${APP_API_BASE_URL}`;

const now = () => Date.now();
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

function jitter(ms: number) {
  const delta = Math.floor(ms * 0.3);
  return ms + Math.floor(Math.random() * (2 * delta) - delta);
}

// backoff: 1m, 5m, 15m, 60m, 2h (max)
function nextDelayByTries(triesSoFar: number) {
  const base = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 2 * 60 * 60_000];
  const pick = base[Math.min(triesSoFar, base.length - 1)];
  return jitter(pick);
}

async function safeText(res: Response) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function composeCombinedMsg(it: OutboxItem) {
  const diffs: string[] = [];
  const statusText = it.status ? it.status.toLowerCase() : '';
  diffs.push(`🟡 Status: *${statusText}*`);
  diffs.push(`📅 Start: *${it.startISODate}*`);
  diffs.push(`📅 End: *${it.endISODate}*`);
  if (it.updateText.trim()) diffs.push(`📝 Note: ${it.updateText.trim()}`);
  return diffs.join('\n');
}

/* ----------------------------- Storage helpers ----------------------------- */

async function readAll(): Promise<OutboxItem[]> {
  try {
    const s = await AsyncStorage.getItem(STORAGE_KEY);
    return s ? JSON.parse(s) : [];
  } catch (e) {
    console.warn('[OUTBOX] Failed to read storage', e);
    return [];
  }
}

async function hydrateIdentityFromCache(it: OutboxItem): Promise<OutboxItem> {
  const needsEmployeeCode = !String(it.employeeCode || '').trim();
  const needsEngineerName = !String(it.engineerName || '').trim() || String(it.engineerName || '').trim() === 'Unknown Engineer';

  if (!needsEmployeeCode && !needsEngineerName) return it;

  try {
    const raw = await AsyncStorage.getItem('cached_employee');
    if (!raw) return it;

    const cached = JSON.parse(raw);
    const firstName = String(cached?.first_name || '').trim();
    const lastName = String(cached?.last_name || '').trim();
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    const employeeCode = String(cached?.employee_code || '').trim();

    return {
      ...it,
      employeeCode: needsEmployeeCode ? employeeCode : it.employeeCode,
      engineerName: needsEngineerName ? (fullName || employeeCode || it.engineerName || 'Unknown Engineer') : it.engineerName,
    };
  } catch (e) {
    console.warn('[OUTBOX] Failed to hydrate identity from cache', e);
    return it;
  }
}

async function writeAll(items: OutboxItem[]) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.warn('[OUTBOX] Failed to write storage', e);
  }
}

async function upsertItem(it: OutboxItem) {
  const curr = await readAll();
  const idx = curr.findIndex((x) => x.id === it.id);
  if (idx === -1) curr.push(it);
  else curr[idx] = it;
  await writeAll(curr);
}

async function removeItemById(id: string) {
  const curr = await readAll();
  const next = curr.filter((x) => x.id !== id);
  await writeAll(next);
}

function capOutboxSize(items: OutboxItem[]) {
  if (items.length <= OUTBOX_MAX_ITEMS) return items;
  const sorted = [...items].sort((a, b) => a.createdAt - b.createdAt);
  const dropped = sorted.slice(0, sorted.length - OUTBOX_MAX_ITEMS);
  const kept = sorted.slice(sorted.length - OUTBOX_MAX_ITEMS);

  trackEvent('outbox_capped_dropped', {
    action: 'outbox_capped_dropped',
    droppedCount: dropped.length,
    keptCount: kept.length,
    timestamp: new Date().toISOString(),
  });

  // We do not cleanup cached files here (can be expensive and rare).
  // The normal compaction + successful sends cleanup most of it.
  return kept;
}

/* ------------------------------ Public exports ----------------------------- */

export async function readOutboxItems(): Promise<OutboxItem[]> {
  return await readAll();
}

export async function getOutboxItemsForSchedule(
  scheduleId: number
): Promise<OutboxItem[]> {
  const items = await readAll();
  return items.filter((it) => it.scheduleId === scheduleId);
}

/* ---------------------------- Cached file directory --------------------------- */

async function ensureCacheDir() {
  if (Platform.OS === 'web') return;
  if (!CACHE_DIR) return;

  try {
    const info = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
    }
  } catch (e) {
    console.warn('[OUTBOX] Failed to ensure CACHE_DIR', e);
  }
}

/* ---------------------------- Cached file cleanup --------------------------- */

async function cleanupCachedFiles(it: OutboxItem) {
  if (Platform.OS === 'web') return;

  for (const f of it.files || []) {
    // only delete files we own in our cache dir
    if (f.cachedUri && CACHE_DIR && f.cachedUri.startsWith(CACHE_DIR)) {
      try {
        await FileSystem.deleteAsync(f.cachedUri, { idempotent: true });
      } catch (e) {
        console.warn('[OUTBOX] Failed to delete cached file', f.cachedUri, e);
      }
    }
  }
}

/* ---------------------------- Dead Letter Queue ---------------------------- */

async function readDLQ(): Promise<DLQItem[]> {
  try {
    const raw = await AsyncStorage.getItem(DLQ_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[OUTBOX] Failed to read DLQ', e);
    return [];
  }
}

async function writeDLQ(items: DLQItem[]) {
  try {
    await AsyncStorage.setItem(DLQ_STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.warn('[OUTBOX] Failed to write DLQ', e);
  }
}

export async function getFailedOutboxItems(): Promise<{
  outbox: OutboxItem[];
  dlq: DLQItem[];
}> {
  const items = await readAll();
  const failedItems = items.filter((it) => (it.tries + 1) > MAX_RETRIES);
  const dlqItems = await readDLQ();
  return { outbox: failedItems, dlq: dlqItems };
}

export async function clearDLQ() {
  await writeDLQ([]);
  trackEvent('outbox_dlq_cleared', {
    action: 'outbox_dlq_cleared',
    timestamp: new Date().toISOString(),
  });
}

// Manual retry from DLQ
export async function requeueDLQItem(outboxItemId: string) {
  const dlq = await readDLQ();
  const idx = dlq.findIndex((x) => x.id === outboxItemId);
  if (idx === -1) return false;

  const item = dlq[idx];
  dlq.splice(idx, 1);
  await writeDLQ(dlq);

  const requeued: OutboxItem = {
    ...item,
    tries: 0,
    nextTryAt: now(),
    sentScheduleUpdate: false,
    sentTaskUpdate: false,
    sentChat: false,
  };

  const q = capOutboxSize(await readAll());

  const exists = q.some((x) => x.id === requeued.id);
  if (!exists) q.push(requeued);

  await writeAll(capOutboxSize(q));

  trackEvent('outbox_dlq_requeued', {
    action: 'outbox_dlq_requeued',
    outboxItemId: requeued.id,
    scheduleId: requeued.scheduleId,
    propertyId: requeued.propertyId,
    phaseName: requeued.phaseName,
    timestamp: new Date().toISOString(),
  });

  return true;
}

async function saveDLQToDatabase(dlqItem: DLQItem) {
  try {
    const logPayload = {
      email: dlqItem.engineerName || 'system',
      action: 'outbox_item_moved_to_dlq',
      page: 'outbox',
      timestamp: new Date(dlqItem.failedAt).toISOString(),
      remarks: `DLQ Item: ${dlqItem.failureReason}. Schedule: ${dlqItem.phaseName} (${dlqItem.scheduleId}), Property: ${dlqItem.propertyId}`,
      previous_data: {
        scheduleId: dlqItem.scheduleId,
        taskId: dlqItem.taskId,
        propertyId: dlqItem.propertyId,
        phaseName: dlqItem.phaseName,
        originalStatus: dlqItem.status,
        originalQueuedAt: new Date(dlqItem.createdAt).toISOString(),
        updateText: dlqItem.updateText,
        fileCount: dlqItem.files?.length || 0,
        employeeCode: dlqItem.employeeCode,
        engineerName: dlqItem.engineerName,
      },
      new_data: {
        outboxItemId: dlqItem.id,
        status: 'DLQ',
        failureReason: dlqItem.failureReason,
        totalAttempts: dlqItem.totalAttempts,
        failedAt: new Date(dlqItem.failedAt).toISOString(),
        timeInQueueMs: dlqItem.failedAt - dlqItem.createdAt,
        sendTarget: dlqItem.sendTarget,
      },
    };

    const response = await fetch(`${BASE_URL}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(logPayload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.warn('[OUTBOX] Failed to save DLQ to database', {
        status: response.status,
        error: errorText.substring(0, 200),
        dlqItemId: dlqItem.id,
      });
    }
  } catch (error: any) {
    console.warn('[OUTBOX] Error saving DLQ to database (non-critical)', {
      error: error?.message || String(error),
      dlqItemId: dlqItem.id,
    });
  }
}

async function moveToDLQ(item: OutboxItem, reason: string) {
  const dlqItems = await readDLQ();

  const dlqItem: DLQItem = {
    ...item,
    failedAt: now(),
    failureReason: reason,
    totalAttempts: item.tries + 1, // includes this last attempt
  };

  dlqItems.push(dlqItem);

  if (dlqItems.length > DLQ_MAX_ITEMS) {
    dlqItems.splice(0, dlqItems.length - DLQ_MAX_ITEMS);
  }

  await writeDLQ(dlqItems);

  // prevent cache leak
  await cleanupCachedFiles(item);

  const dlqLog = {
    action: 'outbox_item_moved_to_dlq',
    outboxItemId: item.id,
    scheduleId: item.scheduleId,
    taskId: item.taskId,
    propertyId: item.propertyId,
    phaseName: item.phaseName,
    status: item.status,
    engineerName: item.engineerName,
    employeeCode: item.employeeCode,
    totalAttempts: dlqItem.totalAttempts,
    failureReason: reason,
    queuedAt: new Date(item.createdAt).toISOString(),
    failedAt: new Date().toISOString(),
    timeInQueueMs: now() - item.createdAt,
    timestamp: new Date().toISOString(),
  };

  console.error('[OUTBOX AUDIT] Item moved to Dead Letter Queue', dlqLog);
  trackEvent('outbox_item_moved_to_dlq', dlqLog);

  // non-blocking
  saveDLQToDatabase(dlqItem).catch(() => {});
}

/* ----------------------------- Init + auto flush ---------------------------- */

let _netUnsub: any = null;
let _appStateSub: any = null;

function isAppActive() {
  return AppState.currentState === 'active';
}

function isOnlineEnough(state: any) {
  // NetInfo sometimes returns isConnected true but internet unreachable
  // We treat "unknown" as okay, but false as no.
  const reachable =
    state?.isInternetReachable === null || state?.isInternetReachable === undefined
      ? true
      : !!state.isInternetReachable;

  return !!state?.isConnected && reachable;
}

export async function initOutbox() {
  await ensureCacheDir();

  _netUnsub?.();
  _netUnsub = NetInfo.addEventListener((state) => {
    if (isOnlineEnough(state) && isAppActive()) {
      flush().catch(() => {});
    }
  });

  _appStateSub?.remove?.();
  _appStateSub = AppState.addEventListener('change', (s) => {
    if (s === 'active') {
      flush().catch(() => {});
    }
  });
}

export async function shutdownOutboxListeners() {
  try {
    _netUnsub?.();
  } catch {}
  try {
    _appStateSub?.remove?.();
  } catch {}
}

/* ------------------------- Status transition validation ------------------------- */
/**
 * NOTE: This validation is LOCAL-only (based on queued items).
 * Backend should still enforce real transition rules.
 */
async function validateStatusTransition(
  scheduleId: number,
  newStatus: string
): Promise<{ valid: boolean; error?: string }> {
  const normalizedNew = String(newStatus).trim().toLowerCase();
  if (normalizedNew !== 'completed') return { valid: true };

  const items = await readAll();
  const scheduleItems = items
    .filter((it) => it.scheduleId === scheduleId)
    .sort((a, b) => a.createdAt - b.createdAt);

  const latest = scheduleItems.length ? scheduleItems[scheduleItems.length - 1] : null;
  const latestStatus = latest?.status?.trim().toLowerCase();

  if (latestStatus === 'on hold' || latestStatus === 'hold') {
    return {
      valid: false,
      error: 'Cannot mark as Completed while on Hold. Please Resume first.',
    };
  }

  return { valid: true };
}

/* ------------------------------- Enqueue logic ------------------------------- */

export async function enqueue(
  item: Omit<
    OutboxItem,
    | 'id'
    | 'createdAt'
    | 'tries'
    | 'nextTryAt'
    | 'sentScheduleUpdate'
    | 'sentTaskUpdate'
    | 'sentChat'
  >
) {
  const validation = await validateStatusTransition(item.scheduleId, item.status);
  if (!validation.valid) {
    const errorMsg = validation.error || 'Invalid status transition';

    console.error('[OUTBOX] Status transition validation failed', {
      scheduleId: item.scheduleId,
      phaseName: item.phaseName,
      newStatus: item.status,
      error: errorMsg,
    });

    trackEvent('outbox_status_transition_invalid', {
      action: 'outbox_status_transition_invalid',
      scheduleId: item.scheduleId,
      propertyId: item.propertyId,
      phaseName: item.phaseName,
      newStatus: item.status,
      error: errorMsg,
      engineerName: item.engineerName,
      employeeCode: item.employeeCode,
      timestamp: new Date().toISOString(),
    });

    throw new Error(errorMsg);
  }

  const id = `ob_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  const record: OutboxItem = {
    ...item,
    id,
    createdAt: now(),
    tries: 0,
    nextTryAt: now(),
    sentScheduleUpdate: false,
    sentTaskUpdate: false,
    sentChat: false,
  };

  const items = capOutboxSize(await readAll());
  items.push(record);
  await writeAll(capOutboxSize(items));

  trackEvent('outbox_enqueue', {
    action: 'outbox_enqueue',
    outboxItemId: id,
    scheduleId: item.scheduleId,
    taskId: item.taskId,
    propertyId: item.propertyId,
    phaseName: item.phaseName,
    status: item.status,
    startDate: item.startISODate,
    endDate: item.endISODate,
    applyToAll: item.applyToAll,
    engineerName: item.engineerName,
    employeeCode: item.employeeCode,
    sendTarget: item.sendTarget,
    hasUpdateText: !!item.updateText.trim(),
    updateTextLength: item.updateText.length,
    fileCount: item.files?.length ?? 0,
    fileNames: item.files?.map((f) => f.name) || [],
    timestamp: new Date(record.createdAt).toISOString(),
    queueSize: items.length,
  });

  return record.id;
}

/* ------------------------------- File caching ------------------------------- */

export async function cacheFileIfNeeded(
  file: { uri?: string; name: string; type: string; file?: any },
  _name: any
): Promise<CachedFile> {
  if (Platform.OS === 'web') {
    return {
      name: file.name,
      type: file.type || 'application/octet-stream',
      originalUri: file.uri,
      webHasFile: !!file.file,
    };
  }

  await ensureCacheDir();

  try {
    if (!file.uri) {
      return { name: file.name, type: file.type || 'application/octet-stream' };
    }

    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
    const dest = `${CACHE_DIR}${Date.now()}_${Math.random()
      .toString(16)
      .slice(2)}.${ext}`;

    await FileSystem.copyAsync({ from: file.uri, to: dest });

    return {
      cachedUri: dest,
      originalUri: file.uri,
      name: file.name,
      type: file.type || 'application/octet-stream',
    };
  } catch (e) {
    console.warn('[OUTBOX] cacheFileIfNeeded copy failed, fallback to original', e);
    return {
      cachedUri: file.uri,
      originalUri: file.uri,
      name: file.name,
      type: file.type || 'application/octet-stream',
    };
  }
}

/* ----------------------- Compaction: latest-only per schedule ---------------------- */

function fileKey(f: CachedFile) {
  // stable-ish dedupe: cachedUri preferred, else originalUri, else name+type
  return (
    f.cachedUri ||
    f.originalUri ||
    `${(f.name || '').trim().toLowerCase()}::${(f.type || '').trim().toLowerCase()}`
  );
}

/**
 * Compacts items so that ONLY the latest OutboxItem per scheduleId remains.
 * Older items are merged into latest (notes/files) to avoid losing info,
 * BUT they will NOT send separate chat/task updates (prevents spam).
 *
 * Returns:
 * - compactedItems: new list to store
 * - cleanupItems: older items that should have cached files deleted (only those files not merged)
 */
function compactLatestOnly(items: OutboxItem[]) {
  if (!items.length) return { compactedItems: items, cleanupItems: [] as OutboxItem[] };

  // group by scheduleId
  const bySchedule = new Map<number, OutboxItem[]>();
  for (const it of items) {
    if (!bySchedule.has(it.scheduleId)) bySchedule.set(it.scheduleId, []);
    bySchedule.get(it.scheduleId)!.push(it);
  }

  const compacted: OutboxItem[] = [];
  const cleanup: OutboxItem[] = [];

  for (const [scheduleId, arr] of bySchedule.entries()) {
    arr.sort((a, b) => a.createdAt - b.createdAt);
    const latest = arr[arr.length - 1];

    if (arr.length === 1) {
      compacted.push(latest);
      continue;
    }

    // Merge older -> latest
    const older = arr.slice(0, -1);

    const mergedFileMap = new Map<string, CachedFile>();
    for (const f of latest.files || []) mergedFileMap.set(fileKey(f), f);

    let mergedText = (latest.updateText || '').trim();

    for (const o of older) {
      // Merge text
      const oText = (o.updateText || '').trim();
      if (oText) {
        const stamp = new Date(o.createdAt).toLocaleString();
        const block = `\n\n— Earlier (${stamp}):\n${oText}`;
        if ((mergedText + block).length <= MERGE_MAX_TEXT_CHARS) {
          mergedText = (mergedText ? mergedText : '') + block;
        } else if (!mergedText) {
          mergedText = oText.slice(0, MERGE_MAX_TEXT_CHARS);
        }
      }

      // Merge files (dedupe)
      for (const f of o.files || []) {
        const k = fileKey(f);
        if (!mergedFileMap.has(k) && mergedFileMap.size < MERGE_MAX_FILES) {
          mergedFileMap.set(k, f);
        }
      }
    }

    // Replace latest fields with merged ones
    latest.updateText = mergedText;
    latest.files = Array.from(mergedFileMap.values());

    // Important: DO NOT “carry over” sent flags from older items.
    // Latest item should control the network sends.
    // If latest already has partial-sent flags, keep them as-is.

    compacted.push(latest);

    // Anything older should be removed; but only cleanup cached files that were NOT merged.
    // We’ll compute which file keys exist in latest after merge and delete only the others.
    const keepKeys = new Set(latest.files.map((f) => fileKey(f)));

    for (const o of older) {
      const toCleanup: OutboxItem = { ...o, files: [] };
      for (const f of o.files || []) {
        const k = fileKey(f);
        if (!keepKeys.has(k)) {
          toCleanup.files.push(f);
        }
      }
      cleanup.push(toCleanup);
    }

    trackEvent('outbox_compacted_schedule', {
      action: 'outbox_compacted_schedule',
      scheduleId,
      droppedItems: older.length,
      mergedFilesNow: latest.files.length,
      mergedTextLen: latest.updateText?.length || 0,
      timestamp: new Date().toISOString(),
    });
  }

  // keep overall order: process by oldest createdAt among remaining
  compacted.sort((a, b) => a.createdAt - b.createdAt);

  return { compactedItems: compacted, cleanupItems: cleanup };
}

/* ------------------------------- Networking ------------------------------- */

async function submitOne(it: OutboxItem, mkObsHeaders: () => Record<string, string>) {
  it = await hydrateIdentityFromCache(it);
  await upsertItem(it);
  const submitStartTime = Date.now();
  const networkState = await NetInfo.fetch();

  trackEvent('outbox_submit_attempt', {
    action: 'outbox_submit_attempt',
    outboxItemId: it.id,
    scheduleId: it.scheduleId,
    taskId: it.taskId,
    propertyId: it.propertyId,
    phaseName: it.phaseName,
    status: it.status,
    engineerName: it.engineerName,
    employeeCode: it.employeeCode,
    attemptNumber: it.tries + 1,
    queuedAt: new Date(it.createdAt).toISOString(),
    timeInQueueMs: submitStartTime - it.createdAt,
    networkType: networkState.type,
    networkIsConnected: networkState.isConnected,
    networkIsInternetReachable: networkState.isInternetReachable,
    fileCount: it.files?.length ?? 0,
    sentScheduleUpdate: !!it.sentScheduleUpdate,
    sentTaskUpdate: !!it.sentTaskUpdate,
    sentChat: !!it.sentChat,
    timestamp: new Date().toISOString(),
  });

  trackEvent('work_tracking_status_change', {
    action: 'work_tracking_status_change',
    scheduleId: it.scheduleId,
    taskId: it.taskId,
    propertyId: it.propertyId,
    phaseName: it.phaseName,
    status: it.status,
    statusChange: it.status,
    updateText: it.updateText,
    fileCount: it.files?.length ?? 0,
    fileNames: it.files?.map((f) => f.name) || [],
    engineerName: it.engineerName,
    employeeCode: it.employeeCode,
    timestamp: new Date(it.createdAt).toISOString(),
    appliedToDatabase: true, // latest-only policy => if we are submitting, it's the latest
  });

  // STEP 1: PUT schedule (only if not already done)
  let scheduleUpdateError: Error | null = null;

  if (!it.sentScheduleUpdate) {
    const schedulePayload: any = {
      phasename: it.phaseName,
      startdate: it.startISODate,
      enddate: it.endISODate,
      status: it.status,
      applyToAll: it.applyToAll,
      task_id: it.taskId,
      employee_code: it.employeeCode,
    };

    const abortCtrl1 = new AbortController();
    const t1 = setTimeout(() => abortCtrl1.abort(), SCHEDULE_API_TIMEOUT_MS);
    const putStartTime = Date.now();

    try {
      const putRes = await fetch(`${BASE_URL}/update-schedule/${it.scheduleId}`, {
        method: 'PUT',
        headers: {
          ...mkObsHeaders(),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(schedulePayload),
        signal: abortCtrl1.signal,
      });

      clearTimeout(t1);

      if (!putRes.ok) {
        const err = await safeText(putRes);
        trackEvent('outbox_put_schedule_failed', {
          action: 'outbox_put_schedule_failed',
          outboxItemId: it.id,
          scheduleId: it.scheduleId,
          propertyId: it.propertyId,
          phaseName: it.phaseName,
          status: it.status,
          engineerName: it.engineerName,
          employeeCode: it.employeeCode,
          httpStatus: putRes.status,
          errorMessage: err.substring(0, 500),
          durationMs: Date.now() - putStartTime,
          attemptNumber: it.tries + 1,
          willRetry: true,
          timestamp: new Date().toISOString(),
        });

        scheduleUpdateError = new Error(`schedule failed: ${putRes.status} ${err}`);
      } else {
        it.sentScheduleUpdate = true;
        await upsertItem(it);

        trackEvent('outbox_put_schedule_success', {
          action: 'outbox_put_schedule_success',
          outboxItemId: it.id,
          scheduleId: it.scheduleId,
          propertyId: it.propertyId,
          phaseName: it.phaseName,
          status: it.status,
          startDate: it.startISODate,
          endDate: it.endISODate,
          applyToAll: it.applyToAll,
          engineerName: it.engineerName,
          employeeCode: it.employeeCode,
          httpStatus: putRes.status,
          durationMs: Date.now() - putStartTime,
          attemptNumber: it.tries + 1,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (e: any) {
      clearTimeout(t1);

      trackEvent('outbox_put_schedule_exception', {
        action: 'outbox_put_schedule_exception',
        outboxItemId: it.id,
        scheduleId: it.scheduleId,
        propertyId: it.propertyId,
        phaseName: it.phaseName,
        status: it.status,
        engineerName: it.engineerName,
        employeeCode: it.employeeCode,
        errorType: e?.name || 'Unknown',
        errorMessage: (e?.message || String(e)).substring(0, 500),
        attemptNumber: it.tries + 1,
        isTimeout: e?.name === 'AbortError',
        willRetry: true,
        timestamp: new Date().toISOString(),
      });

      scheduleUpdateError = e;
    }
  }

  // STEP 2: POST task-updates + chat (only if not already sent)
  const hasTaskOrChatWork = it.updateText.trim() || it.files.length > 0;

  if (hasTaskOrChatWork) {
    const taskFD = new FormData();
    taskFD.append('task_id', it.taskId || '');
    taskFD.append('property_id', it.propertyId);
    taskFD.append('schedule_id', String(it.scheduleId));
    taskFD.append('engineer_name', it.engineerName);
    taskFD.append('update_text', it.updateText);
    taskFD.append('employee_code', it.employeeCode || '');

    const chatFD = new FormData();
    chatFD.append('property_id', it.propertyId);
    chatFD.append('engineer_name', it.engineerName);
    chatFD.append('employee_code', it.employeeCode);
    chatFD.append(
      'message_text',
      `📌 Update for "${it.phaseName}"\n\n${composeCombinedMsg(it)}`
    );
    chatFD.append(
      'visible_to_clients',
      it.sendTarget === 'customer' ? 'true' : 'false'
    );

    for (const f of it.files) {
      if (Platform.OS === 'web') {
        /**
         * ⚠️ Web note:
         * If originalUri is a blob: URL from a previous session, fetch may fail.
         * This code tries anyway; if it fails, it just skips that file.
         */
        if (f.originalUri) {
          try {
            const res = await fetch(f.originalUri);
            const blob = await res.blob();
            const fileName = f.name || 'file';
            const fileType = f.type || blob.type || 'application/octet-stream';
            const webFile = new File([blob], fileName, { type: fileType });

            // @ts-ignore
            taskFD.append('update_files', webFile);
            // @ts-ignore
            chatFD.append('files', webFile);
          } catch (e) {
            console.warn('[OUTBOX] Failed to attach web file:', f.originalUri, e);
          }
        }
      } else {
        const uriToUse = f.cachedUri || f.originalUri;
        if (uriToUse) {
          const filePart: any = {
            uri: uriToUse,
            name: f.name,
            type: f.type || 'application/octet-stream',
          };
          // @ts-ignore
          taskFD.append('update_files', filePart);
          // @ts-ignore
          chatFD.append('files', filePart);
        }
      }
    }

    // POST /task-updates
    if (!it.sentTaskUpdate) {
      const abortCtrl2 = new AbortController();
      const t2 = setTimeout(() => abortCtrl2.abort(), FILE_UPLOAD_API_TIMEOUT_MS);
      const taskStartTime = Date.now();

      try {
        const taskRes = await fetch(`${BASE_URL}/task-updates`, {
          method: 'POST',
          headers: { ...mkObsHeaders(), Accept: 'application/json' },
          body: taskFD,
          signal: abortCtrl2.signal,
        });

        clearTimeout(t2);

        if (!taskRes.ok) {
          const t = await safeText(taskRes);
          trackEvent('outbox_post_task_updates_failed', {
            action: 'outbox_post_task_updates_failed',
            outboxItemId: it.id,
            scheduleId: it.scheduleId,
            propertyId: it.propertyId,
            phaseName: it.phaseName,
            engineerName: it.engineerName,
            employeeCode: it.employeeCode,
            httpStatus: taskRes.status,
            errorMessage: t.substring(0, 500),
            durationMs: Date.now() - taskStartTime,
            attemptNumber: it.tries + 1,
            timestamp: new Date().toISOString(),
          });
          throw new Error(`task-updates failed: ${taskRes.status} ${t}`);
        }

        it.sentTaskUpdate = true;
        await upsertItem(it);

        trackEvent('outbox_post_task_updates_success', {
          action: 'outbox_post_task_updates_success',
          outboxItemId: it.id,
          scheduleId: it.scheduleId,
          propertyId: it.propertyId,
          phaseName: it.phaseName,
          engineerName: it.engineerName,
          employeeCode: it.employeeCode,
          httpStatus: taskRes.status,
          durationMs: Date.now() - taskStartTime,
          attemptNumber: it.tries + 1,
          timestamp: new Date().toISOString(),
        });
      } catch (e: any) {
        clearTimeout(t2);
        trackEvent('outbox_post_task_updates_exception', {
          action: 'outbox_post_task_updates_exception',
          outboxItemId: it.id,
          scheduleId: it.scheduleId,
          propertyId: it.propertyId,
          phaseName: it.phaseName,
          engineerName: it.engineerName,
          employeeCode: it.employeeCode,
          errorType: e?.name || 'Unknown',
          errorMessage: (e?.message || String(e)).substring(0, 500),
          isTimeout: e?.name === 'AbortError',
          attemptNumber: it.tries + 1,
          timestamp: new Date().toISOString(),
        });
        throw e;
      }
    }

    // POST /property-chat/send
    if (!it.sentChat) {
      const abortCtrl3 = new AbortController();
      const t3 = setTimeout(() => abortCtrl3.abort(), CHAT_API_TIMEOUT_MS);
      const chatStartTime = Date.now();

      try {
        const chatRes = await fetch(`${BASE_URL}/property-chat/send`, {
          method: 'POST',
          headers: { ...mkObsHeaders(), Accept: 'application/json' },
          body: chatFD,
          signal: abortCtrl3.signal,
        });

        clearTimeout(t3);

        if (!chatRes.ok) {
          const t = await safeText(chatRes);
          trackEvent('outbox_post_chat_failed', {
            action: 'outbox_post_chat_failed',
            outboxItemId: it.id,
            scheduleId: it.scheduleId,
            propertyId: it.propertyId,
            phaseName: it.phaseName,
            engineerName: it.engineerName,
            employeeCode: it.employeeCode,
            sendTarget: it.sendTarget,
            httpStatus: chatRes.status,
            errorMessage: t.substring(0, 500),
            durationMs: Date.now() - chatStartTime,
            attemptNumber: it.tries + 1,
            timestamp: new Date().toISOString(),
          });
          throw new Error(`chat-send failed: ${chatRes.status} ${t}`);
        }

        it.sentChat = true;
        await upsertItem(it);

        trackEvent('outbox_post_chat_success', {
          action: 'outbox_post_chat_success',
          outboxItemId: it.id,
          scheduleId: it.scheduleId,
          propertyId: it.propertyId,
          phaseName: it.phaseName,
          engineerName: it.engineerName,
          employeeCode: it.employeeCode,
          sendTarget: it.sendTarget,
          httpStatus: chatRes.status,
          durationMs: Date.now() - chatStartTime,
          attemptNumber: it.tries + 1,
          timestamp: new Date().toISOString(),
        });
      } catch (e: any) {
        clearTimeout(t3);
        trackEvent('outbox_post_chat_exception', {
          action: 'outbox_post_chat_exception',
          outboxItemId: it.id,
          scheduleId: it.scheduleId,
          propertyId: it.propertyId,
          phaseName: it.phaseName,
          engineerName: it.engineerName,
          employeeCode: it.employeeCode,
          sendTarget: it.sendTarget,
          errorType: e?.name || 'Unknown',
          errorMessage: (e?.message || String(e)).substring(0, 500),
          isTimeout: e?.name === 'AbortError',
          attemptNumber: it.tries + 1,
          timestamp: new Date().toISOString(),
        });
        throw e;
      }
    }
  }

  // If schedule PUT failed, throw AFTER chat/task are handled.
  if (scheduleUpdateError) {
    trackEvent('outbox_submit_partial_success', {
      action: 'outbox_submit_partial_success',
      outboxItemId: it.id,
      scheduleId: it.scheduleId,
      propertyId: it.propertyId,
      phaseName: it.phaseName,
      status: it.status,
      engineerName: it.engineerName,
      employeeCode: it.employeeCode,
      scheduleUpdateSucceeded: false,
      scheduleUpdateError: scheduleUpdateError.message,
      chatSent: !!it.sentChat,
      taskSent: !!it.sentTaskUpdate,
      willRetryScheduleUpdate: true,
      timestamp: new Date().toISOString(),
    });

    throw scheduleUpdateError;
  }

  trackEvent('outbox_submit_complete_success', {
    action: 'outbox_submit_complete_success',
    outboxItemId: it.id,
    scheduleId: it.scheduleId,
    taskId: it.taskId,
    propertyId: it.propertyId,
    phaseName: it.phaseName,
    status: it.status,
    engineerName: it.engineerName,
    employeeCode: it.employeeCode,
    attemptNumber: it.tries + 1,
    totalDurationMs: Date.now() - submitStartTime,
    queuedAt: new Date(it.createdAt).toISOString(),
    completedAt: new Date().toISOString(),
    timestamp: new Date().toISOString(),
  });
}

/* --------------------------------- Flush --------------------------------- */

let _flushing = false;

export async function flush(mkObsHeaders?: () => Record<string, string>) {
  if (_flushing) return;
  _flushing = true;

  const flushStartTime = Date.now();

  try {
    if (!isAppActive()) {
      trackEvent('outbox_flush_skipped_background', {
        action: 'outbox_flush_skipped_background',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const state = await NetInfo.fetch();

    trackEvent('outbox_flush_start', {
      action: 'outbox_flush_start',
      networkType: state.type,
      networkIsConnected: state.isConnected,
      networkIsInternetReachable: state.isInternetReachable,
      timestamp: new Date().toISOString(),
    });

    if (!isOnlineEnough(state)) {
      trackEvent('outbox_flush_skipped_offline', {
        action: 'outbox_flush_skipped_offline',
        networkType: state.type,
        networkIsConnected: state.isConnected,
        networkIsInternetReachable: state.isInternetReachable,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    let items = await readAll();
    if (!items.length) {
      trackEvent('outbox_flush_skipped_empty', {
        action: 'outbox_flush_skipped_empty',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // ✅ NEW: compact to latest-only per schedule to prevent spam
    const { compactedItems, cleanupItems } = compactLatestOnly(items);

    // Write compacted list back if changed
    if (compactedItems.length !== items.length) {
      await writeAll(capOutboxSize(compactedItems));

      // cleanup cached files for dropped items that weren't merged
      for (const c of cleanupItems) {
        await cleanupCachedFiles(c);
      }

      trackEvent('outbox_compaction_applied', {
        action: 'outbox_compaction_applied',
        beforeCount: items.length,
        afterCount: compactedItems.length,
        cleanupItems: cleanupItems.length,
        timestamp: new Date().toISOString(),
      });

      items = compactedItems;
    }

    // Ready items only
    const readyItems = items.filter((it) => now() >= it.nextTryAt);

    // fairness: oldest first
    readyItems.sort((a, b) => a.createdAt - b.createdAt);

    for (const it of readyItems) {
      const attemptNumber = it.tries + 1;

      // consistent retry rule
      if (attemptNumber > MAX_RETRIES) {
        await moveToDLQ(it, `Exceeded max attempts (${MAX_RETRIES})`);
        await removeItemById(it.id);
        continue;
      }

      try {
        const hdrs =
          mkObsHeaders ??
          (() => ({
            'x-request-id': `flush_${Date.now()}_${Math.random()
              .toString(16)
              .slice(2, 8)}`,
            'x-engineer-name': it.engineerName || 'Unknown',
            'x-employee-code': it.employeeCode || '',
            'x-app-version': 'rn-1.0.0',
          }));

        await submitOne(it, hdrs);

        // fully done => remove + cleanup cached files
        await removeItemById(it.id);
        await cleanupCachedFiles(it);
      } catch (err: any) {
        // FAILED attempt -> increment tries
        it.tries += 1;

        const nextAttemptNumber = it.tries + 1;
        const errMsg = String(err?.message || err).substring(0, 200);

        // If next attempt would exceed max => DLQ now
        if (nextAttemptNumber > MAX_RETRIES) {
          await moveToDLQ(it, `Exceeded max attempts (${MAX_RETRIES}). Last error: ${errMsg}`);
          await removeItemById(it.id);
          continue;
        }

        const delay = nextDelayByTries(it.tries - 1);
        it.nextTryAt = now() + delay;
        await upsertItem(it);

        trackEvent('outbox_item_retry_scheduled', {
          action: 'outbox_item_retry_scheduled',
          outboxItemId: it.id,
          scheduleId: it.scheduleId,
          propertyId: it.propertyId,
          phaseName: it.phaseName,
          status: it.status,
          engineerName: it.engineerName,
          employeeCode: it.employeeCode,
          attemptFailedCount: it.tries,
          nextAttemptNumber,
          nextTryAt: new Date(it.nextTryAt).toISOString(),
          backoffDelayMs: delay,
          errorType: err?.name || 'Unknown',
          errorMessage: (err?.message || String(err)).substring(0, 500),
          timestamp: new Date().toISOString(),
        });
      }

      await sleep(250);
    }

    const remaining = await readAll();
    trackEvent('outbox_flush_complete', {
      action: 'outbox_flush_complete',
      totalDurationMs: Date.now() - flushStartTime,
      itemsRemaining: remaining.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    trackEvent('outbox_flush_exception', {
      action: 'outbox_flush_exception',
      errorType: err?.name || 'Unknown',
      errorMessage: (err?.message || String(err)).substring(0, 500),
      durationMs: Date.now() - flushStartTime,
      timestamp: new Date().toISOString(),
    });
  } finally {
    _flushing = false;
  }
}
