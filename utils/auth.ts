import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";

import { API_BASE_URL, apiUrl } from "./apiBase";

const ACCESS_TOKEN_KEY = "access_token";
const ACCESS_TOKEN_EXPIRES_AT_KEY = "access_token_expires_at";
const REFRESH_TOKEN_KEY = "refresh_token";
const TOKEN_TYPE_KEY = "token_type";
const SESSION_ID_KEY = "session_id";
const AUTH_USER_KEY = "auth_user";
const USER_TYPE_KEY = "user_type";
const PHONE_NUMBER_KEY = "phone_number";
const LOGIN_TYPE_KEY = "login_type";
const DEVICE_ID_KEY = "device_id";
const CACHED_EMPLOYEE_KEY = "cached_employee";
const nativeFetch: typeof fetch = globalThis.fetch.bind(globalThis);
const API_ORIGIN = new URL(API_BASE_URL).origin;
let authTransportInstalled = false;
let refreshInFlight: Promise<AuthSessionResponse> | null = null;
const inflightAuthenticatedGets = new Map<string, Promise<Response>>();

const AUTH_STORAGE_KEYS = [
  ACCESS_TOKEN_KEY,
  ACCESS_TOKEN_EXPIRES_AT_KEY,
  REFRESH_TOKEN_KEY,
  TOKEN_TYPE_KEY,
  SESSION_ID_KEY,
  AUTH_USER_KEY,
  USER_TYPE_KEY,
  PHONE_NUMBER_KEY,
  LOGIN_TYPE_KEY,
  DEVICE_ID_KEY,
  CACHED_EMPLOYEE_KEY,
];

export type AuthUser = {
  id: string;
  user_type: "employee" | "client";
  employee_code?: string | null;
  client_id?: string | null;
  phone_number: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  job_title?: string | null;
  roles?: string[];
};

export type AuthSessionResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  refresh_expires_in: number;
  user: AuthUser;
  session: {
    session_id: string;
  };
};

export type CurrentUserResponse = AuthUser & {
  auth_source: "otp" | "password" | "google";
  session_id: string;
};

type PersistOptions = {
  loginType?: string | null;
  deviceId?: string | null;
};

type RetryableAxiosConfig = InternalAxiosRequestConfig & {
  _authRetried?: boolean;
};

async function readJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function toAbsoluteUrl(input: string): string {
  try {
    return new URL(input, API_BASE_URL).toString();
  } catch {
    return input;
  }
}

function isLocalApiRequest(input: string): boolean {
  const value = String(input || "").trim();
  if (!value) return false;
  if (/^(blob:|data:|file:|content:|asset:)/i.test(value)) return false;

  const absolute = toAbsoluteUrl(value);
  try {
    return new URL(absolute).origin === API_ORIGIN;
  } catch {
    return false;
  }
}

function isUnauthenticatedApiPath(input: string): boolean {
  const absolute = toAbsoluteUrl(input);

  try {
    const { pathname } = new URL(absolute);
    return (
      pathname === "/" ||
      pathname === "/health" ||
      pathname === "/auth/login/password" ||
      pathname === "/auth/otp/send" ||
      pathname === "/auth/otp/verify" ||
      pathname.startsWith("/auth/password/forgot/") ||
      pathname === "/auth/refresh" ||
      pathname === "/auth/logout" ||
      pathname === "/prelogin/register-device"
    );
  } catch {
    return false;
  }
}

function normalizeErrorMessage(payload: any, fallback: string) {
  if (typeof payload?.detail === "string" && payload.detail.trim()) return payload.detail.trim();
  if (typeof payload?.message === "string" && payload.message.trim()) return payload.message.trim();
  return fallback;
}

async function saveStoredUser(user: AuthUser, sessionId?: string | null) {
  await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  await AsyncStorage.setItem(USER_TYPE_KEY, user.user_type);
  await AsyncStorage.setItem(PHONE_NUMBER_KEY, user.phone_number || "");
  if (sessionId) await AsyncStorage.setItem(SESSION_ID_KEY, sessionId);
}

export async function persistAuthSession(
  payload: AuthSessionResponse,
  options?: PersistOptions
) {
  const expiresAt = Date.now() + Math.max(Number(payload.expires_in || 0), 0) * 1000;

  await AsyncStorage.multiSet([
    [ACCESS_TOKEN_KEY, payload.access_token],
    [REFRESH_TOKEN_KEY, payload.refresh_token],
    [TOKEN_TYPE_KEY, payload.token_type || "bearer"],
    [ACCESS_TOKEN_EXPIRES_AT_KEY, String(expiresAt)],
    [SESSION_ID_KEY, payload.session?.session_id || ""],
    [AUTH_USER_KEY, JSON.stringify(payload.user)],
    [USER_TYPE_KEY, payload.user.user_type],
    [PHONE_NUMBER_KEY, payload.user.phone_number || ""],
  ]);

  if (options?.loginType) {
    await AsyncStorage.setItem(LOGIN_TYPE_KEY, options.loginType);
  }

  if (options?.deviceId) {
    await AsyncStorage.setItem(DEVICE_ID_KEY, options.deviceId);
  }

  if (payload.user.user_type === "employee") {
    await AsyncStorage.setItem(
      CACHED_EMPLOYEE_KEY,
      JSON.stringify({
        first_name: payload.user.first_name || "User",
        last_name: payload.user.last_name || "",
        email: payload.user.email || "",
        job_title: payload.user.job_title || "",
        phone_number: payload.user.phone_number,
        employee_code: payload.user.employee_code || "",
        roles: Array.isArray(payload.user.roles) ? payload.user.roles : [],
      })
    );
  } else {
    await AsyncStorage.removeItem(CACHED_EMPLOYEE_KEY);
  }
}

export async function clearStoredAuth() {
  await AsyncStorage.multiRemove(AUTH_STORAGE_KEYS);
}

export async function getStoredAuthUser(): Promise<AuthUser | null> {
  try {
    const raw = await AsyncStorage.getItem(AUTH_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser | null;
    return parsed && parsed.user_type === "employee" ? parsed : null;
  } catch {
    return null;
  }
}

export async function getStoredRefreshToken() {
  return AsyncStorage.getItem(REFRESH_TOKEN_KEY);
}

export async function logoutCurrentSession() {
  const refreshToken = await getStoredRefreshToken();

  if (refreshToken) {
    try {
      await nativeFetch(apiUrl("/auth/logout"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch {
      // We still clear the local session to avoid trapping the user.
    }
  }

  await clearStoredAuth();
}

async function runRefreshAuthSession() {
  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) throw new Error("Missing refresh token.");

  const loginType = await AsyncStorage.getItem(LOGIN_TYPE_KEY);
  const deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);

  const response = await nativeFetch(apiUrl("/auth/refresh"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  const data = await readJson<AuthSessionResponse | { detail?: string; message?: string }>(response);
  if (!response.ok || !data || !("access_token" in data)) {
    await clearStoredAuth();
    throw new Error(normalizeErrorMessage(data, "Session expired. Please log in again."));
  }

  await persistAuthSession(data, { loginType, deviceId });
  return data;
}

export async function refreshAuthSession() {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = runRefreshAuthSession().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

export async function getValidAccessToken() {
  const [accessToken, expiresAtRaw] = await Promise.all([
    AsyncStorage.getItem(ACCESS_TOKEN_KEY),
    AsyncStorage.getItem(ACCESS_TOKEN_EXPIRES_AT_KEY),
  ]);

  const expiresAt = Number(expiresAtRaw || 0);
  if (accessToken && expiresAt - Date.now() > 60_000) {
    return accessToken;
  }

  const refreshed = await refreshAuthSession();
  return refreshed.access_token;
}

export async function authenticatedFetch(input: string, init?: RequestInit, retry = true) {
  const token = await getValidAccessToken();
  const headers = new Headers(init?.headers || {});
  headers.set("Authorization", `Bearer ${token}`);

  const requestUrl = apiUrl(input);
  const requestMethod = String(init?.method || "GET").toUpperCase();
  const shouldDeduplicate = requestMethod === "GET" && !init?.body;
  const dedupeKey = shouldDeduplicate ? `${requestMethod}:${requestUrl}` : null;

  if (dedupeKey) {
    const inFlight = inflightAuthenticatedGets.get(dedupeKey);
    if (inFlight) {
      return (await inFlight).clone();
    }
  }

  const requestPromise = nativeFetch(requestUrl, {
    ...init,
    headers,
  });

  if (dedupeKey) {
    inflightAuthenticatedGets.set(dedupeKey, requestPromise);
  }

  let response: Response;
  try {
    response = await requestPromise;
  } finally {
    if (dedupeKey) {
      inflightAuthenticatedGets.delete(dedupeKey);
    }
  }

  if (response.status === 401 && retry) {
    await refreshAuthSession();
    return authenticatedFetch(input, init, false);
  }

  return dedupeKey ? response.clone() : response;
}

export async function restoreAuthenticatedUser() {
  const response = await authenticatedFetch("/auth/me");
  const data = await readJson<CurrentUserResponse | { detail?: string; message?: string }>(response);

  if (!response.ok || !data || !("id" in data)) {
    if (response.status === 401) {
      await clearStoredAuth();
    }
    throw new Error(normalizeErrorMessage(data, "Unable to restore session."));
  }

  await saveStoredUser(data, data.session_id);
  return data;
}

export function installAuthTransports(axiosInstance: AxiosInstance) {
  if (authTransportInstalled) return;
  authTransportInstalled = true;

  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const requestMethod =
      init?.method ||
      (typeof input === "string" || input instanceof URL ? undefined : input.method) ||
      "GET";

    const shouldAuth =
      isLocalApiRequest(requestUrl) &&
      String(requestMethod).toUpperCase() !== "HEAD" &&
      !isUnauthenticatedApiPath(requestUrl) &&
      !(init?.headers && new Headers(init.headers).has("Authorization"));

    if (!shouldAuth) {
      return originalFetch(input, init);
    }

    const response = await authenticatedFetch(requestUrl, init);
    return response;
  }) as typeof fetch;

  axiosInstance.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
      const url = String(config.url || "").trim();
      if (!isLocalApiRequest(url) || isUnauthenticatedApiPath(url)) {
        return config;
      }

      const headers = config.headers || {};
      if (!("Authorization" in headers) && !("authorization" in headers)) {
        const token = await getValidAccessToken();
        config.headers = {
          ...headers,
          Authorization: `Bearer ${token}`,
        } as any;
      }

      return config;
    }
  );

  axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const config = error?.config as RetryableAxiosConfig | undefined;
      if (!config || config._authRetried || error?.response?.status !== 401) {
        return Promise.reject(error);
      }

      const url = String(config.url || "").trim();
      if (!isLocalApiRequest(url) || isUnauthenticatedApiPath(url)) {
        return Promise.reject(error);
      }

      config._authRetried = true;
      const refreshed = await refreshAuthSession();
      config.headers = {
        ...(config.headers || {}),
        Authorization: `Bearer ${refreshed.access_token}`,
      } as any;
      return axiosInstance(config);
    }
  );
}
