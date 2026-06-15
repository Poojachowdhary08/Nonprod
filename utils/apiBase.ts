const FIXED_NON_PROD_API_BASE_URL = "https://test.datso.io";
const LEGACY_API_ORIGIN_RE = /^https?:\/\/test\.datso\.io\/?/i;

type ApiBaseGlobal = typeof globalThis & {
  __API_BASE_URL__?: string;
};

export const API_BASE_URL = FIXED_NON_PROD_API_BASE_URL;
export const ENV = (process.env.EXPO_PUBLIC_ENV || (__DEV__ ? "dev" : "prod")).toLowerCase();
export const TELEMETRY_ENV = process.env.EXPO_PUBLIC_TELEMETRY_ENV || ENV;
export const IS_PROD_ENV = ENV === "prod" && !__DEV__;
export const IS_DEV_ENV = !IS_PROD_ENV;

(globalThis as ApiBaseGlobal).__API_BASE_URL__ = API_BASE_URL;

export function apiUrl(path = ""): string {
  const normalizedPath = String(path || "").trim();
  if (!normalizedPath) return API_BASE_URL;
  if (/^https?:\/\//i.test(normalizedPath)) return withApiBase(normalizedPath);
  return `${API_BASE_URL}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;
}

export function withApiBase(input: string): string {
  const value = String(input || "").trim();
  if (!value) return API_BASE_URL;
  if (!/^https?:\/\//i.test(value)) return apiUrl(value);

  if (LEGACY_API_ORIGIN_RE.test(value)) {
    const withoutOrigin = value.replace(LEGACY_API_ORIGIN_RE, "");
    return withoutOrigin ? apiUrl(withoutOrigin) : API_BASE_URL;
  }

  return value;
}
