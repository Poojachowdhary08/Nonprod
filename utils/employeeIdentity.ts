import AsyncStorage from "@react-native-async-storage/async-storage";

import { authenticatedFetch } from "./auth";

type RouteParamsLike = Record<string, unknown> | undefined | null;

type EmployeeIdentity = {
  employee_code: string;
  phone_number: string;
  source: "route" | "cache" | "auth_user" | "backend_lookup" | "unknown";
};

function unwrapValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function firstString(value: unknown): string {
  value = unwrapValue(value);
  return typeof value === "string" ? value.trim() : "";
}

function parsePossiblyEncodedJson(value: string): Record<string, unknown> | null {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const tryParse = (input: string) => {
    let current: unknown = input;
    for (let i = 0; i < 3; i += 1) {
      if (current && typeof current === "object") {
        return current as Record<string, unknown>;
      }
      if (typeof current !== "string") return null;
      try {
        current = JSON.parse(current);
      } catch {
        return null;
      }
    }
    return current && typeof current === "object" ? (current as Record<string, unknown>) : null;
  };

  const parsedDirect = tryParse(raw);
  if (parsedDirect) return parsedDirect;

  try {
    return tryParse(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

export async function resolveEmployeeIdentity(routeParams?: RouteParamsLike): Promise<EmployeeIdentity> {
  const params = routeParams || {};
  const details =
    parsePossiblyEncodedJson(firstString(params.employee_details)) ||
    parsePossiblyEncodedJson(firstString(params.userDetails)) ||
    parsePossiblyEncodedJson(firstString(params.user_details)) ||
    (() => {
      const raw = unwrapValue(params.employee_details) ?? unwrapValue(params.userDetails) ?? unwrapValue(params.user_details);
      return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    })();

  let employeeCode =
    firstString(params.employee_code) ||
    firstString(details?.employee_code) ||
    firstString(details?.emp_code) ||
    firstString(details?.employeeCode);
  let phoneNumber = firstString(params.phone_number) || firstString(details?.phone_number);
  let source: EmployeeIdentity["source"] = employeeCode ? "route" : "unknown";

  if (!employeeCode || !phoneNumber) {
    try {
      const cachedRaw = await AsyncStorage.getItem("cached_employee");
      const cached = cachedRaw ? JSON.parse(cachedRaw) : null;
      if (!employeeCode) employeeCode = firstString(cached?.employee_code);
      if (!phoneNumber) phoneNumber = firstString(cached?.phone_number);
      if ((employeeCode || phoneNumber) && source === "unknown") source = "cache";
    } catch {
      // Ignore cache parse issues and continue to auth/back-end fallback.
    }
  }

  if (!employeeCode || !phoneNumber) {
    try {
      const authUserRaw = await AsyncStorage.getItem("auth_user");
      const authUser = authUserRaw ? JSON.parse(authUserRaw) : null;
      if (!employeeCode) employeeCode = firstString(authUser?.employee_code);
      if (!phoneNumber) phoneNumber = firstString(authUser?.phone_number);
      if ((employeeCode || phoneNumber) && source === "unknown") source = "auth_user";
    } catch {
      // Ignore auth-user parse issues and continue to back-end fallback.
    }
  }

  if (!employeeCode && phoneNumber) {
    try {
      const response = await authenticatedFetch(
        `/employees/by-phone/${encodeURIComponent(phoneNumber)}/employee-code`
      );
      if (response.ok) {
        const payload = await response.json();
        employeeCode = firstString(payload?.employee_code);
        phoneNumber = firstString(payload?.phone_number) || phoneNumber;
        if (employeeCode) source = "backend_lookup";
      }
    } catch {
      // Let caller handle the unresolved state.
    }
  }

  return {
    employee_code: employeeCode,
    phone_number: phoneNumber,
    source,
  };
}
