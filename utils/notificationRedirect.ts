import AsyncStorage from "@react-native-async-storage/async-storage";
import { NotificationResponse } from "expo-notifications";
import {
  encodeRouteUserDetails,
  loadLastPropertyRouteContext,
  toPropertyRouteParams,
} from "@/utils/propertyRouteContext";

type AppRouter = {
  push: (href: any) => void;
};

type StoredAuthUser = {
  user_type?: "employee" | "client";
  employee_code?: string | null;
  client_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  email?: string | null;
  phone_number?: string | null;
};

type NotificationData = Record<string, any>;

const AUTH_USER_KEY = "auth_user";
const CACHED_EMPLOYEE_KEY = "cached_employee";

const firstString = (value: unknown): string => {
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
};

async function loadStoredAuthUser(): Promise<StoredAuthUser | null> {
  try {
    const raw = await AsyncStorage.getItem(AUTH_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function loadCachedEmployee(): Promise<Record<string, any> | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHED_EMPLOYEE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function buildRouteUserDetails() {
  const [authUser, cachedEmployee] = await Promise.all([
    loadStoredAuthUser(),
    loadCachedEmployee(),
  ]);

  if ((authUser?.user_type || "").toLowerCase() === "client") {
    const firstName = firstString(authUser?.first_name || authUser?.name);
    const lastName = firstString(authUser?.last_name);
    const fullName = `${firstName} ${lastName}`.trim() || firstString(authUser?.name);
    return {
      userType: "client" as const,
      userDetails: {
        name: fullName || "Client",
        client_id: firstString(authUser?.client_id),
        employee_code: "",
        first_name: firstName || fullName || "Client",
        last_name: lastName,
      },
    };
  }

  return {
    userType: "employee" as const,
    userDetails: {
      first_name: firstString(cachedEmployee?.first_name || authUser?.first_name) || "User",
      last_name: firstString(cachedEmployee?.last_name || authUser?.last_name),
      email: firstString(cachedEmployee?.email || authUser?.email),
      job_title: firstString(cachedEmployee?.job_title),
      phone_number: firstString(cachedEmployee?.phone_number || authUser?.phone_number),
      employee_code: firstString(cachedEmployee?.employee_code || authUser?.employee_code),
      roles: Array.isArray(cachedEmployee?.roles) ? cachedEmployee.roles : [],
    },
  };
}

async function buildPropertyFallbackContext(data: NotificationData, userDetails: Record<string, any>) {
  const lastContext = await loadLastPropertyRouteContext();

  return {
    propertyId: firstString(data.property_id),
    projectId: firstString(data.project_id) || firstString(lastContext?.projectId),
    propertyName: firstString(data.property_name) || firstString(lastContext?.propertyName),
    projectLocation: firstString(data.project_location) || firstString(lastContext?.projectLocation),
    userDetails,
  };
}

function normalizeLegacyRole(raw: string): string | null {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return null;
  if (value.includes("sales team") || value === "sales_team" || value === "sales") return "SALES_TEAM";
  if (value.includes("stock manager") || value === "stock_manager") return "STOCK_MANAGEMENT_TEAM";
  if (value.includes("procurement") || value === "procurement_team") return "PROCUREMENT_TEAM";
  if (value.includes("site engineer") || value === "site_engineer") return "SITE_ENGINEER";
  if (value.includes("support staff") || value === "support_staff") return "SUPPORT_STAFF";
  if (value === "admin" || value === "administrator" || value === "admin_user" || value === "admin user") {
    return "ADMIN";
  }
  if (
    value.includes("avenue backend engineer") ||
    value.includes("backend engineer") ||
    value === "avenue_backend_engineer" ||
    value === "backend_team"
  ) {
    return "BACKEND_TEAM";
  }
  if (value === "finance" || value === "finance_team" || value === "accounts") return "FINANCE_TEAM";
  return null;
}

function resolveRoleKeys(userDetails: Record<string, any>): string[] {
  const seen = new Set<string>();
  const roles: string[] = [];
  const fromPayload = Array.isArray(userDetails?.roles) ? userDetails.roles : [];
  fromPayload.forEach((role) => {
    const normalized = String(role || "").trim().toUpperCase();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    roles.push(normalized);
  });
  if (!roles.length) {
    const fallback = normalizeLegacyRole(String(userDetails?.job_title || ""));
    if (fallback && !seen.has(fallback)) {
      seen.add(fallback);
      roles.push(fallback);
    }
  }
  return roles;
}

async function navigateByTargetScreen(
  router: AppRouter,
  targetScreen: string,
  data: NotificationData,
  userType: "employee" | "client",
  userDetails: Record<string, any>
): Promise<boolean> {
  const propertyId = firstString(data.property_id);
  const projectId = firstString(data.project_id);
  const issueId = firstString(data.issue_id);
  const requestId = firstString(data.request_id || data.issued_request_id);

  switch (targetScreen) {
    case "CustomerMessageWrapper":
      if (propertyId && projectId) {
        router.push({
          pathname: "/CustomerMessageWrapper",
          params: toPropertyRouteParams({
            propertyId,
            projectId,
            userDetails,
          }),
        });
        return true;
      }
      return false;

    case "PropertyChatsMessages":
      if (propertyId) {
        router.push({
          pathname: "/PropertyChatsMessages",
          params: {
            propertyId,
            userDetails: JSON.stringify(userDetails),
          },
        });
        return true;
      }
      return false;

    case "PropertiesListScreen": {
      if (!propertyId) return false;
      const propertyContext = await buildPropertyFallbackContext(data, userDetails);
      router.push({
        pathname: "/PropertiesListScreen",
        params: toPropertyRouteParams(propertyContext),
      });
      return true;
    }

    case "TaskWorkflowWrapper":
      if (propertyId) {
        router.push({
          pathname: "/TaskWorkflowWrapper",
          params: {
            propertyId,
            userDetails: encodeRouteUserDetails(userDetails),
          },
        });
        return true;
      }
      return false;

    case "TaskManagementForm": {
      if (!propertyId) return false;
      const propertyContext = await buildPropertyFallbackContext(data, userDetails);
        router.push({
          pathname: "/TaskManagementForm",
          params: {
            ...toPropertyRouteParams(propertyContext),
            schedule_id: firstString(data.schedule_id),
            schedule_name: firstString(data.schedule_name),
            update_id: firstString(data.update_id),
            fromNotification: "1",
          },
        });
      return true;
    }

    case "TaskList":
      router.push({
        pathname: "/TaskList",
        params: {
          first_name: firstString(userDetails.first_name),
          last_name: firstString(userDetails.last_name),
          employee_code: firstString(userDetails.employee_code),
          email: firstString(userDetails.email),
          phone_number: firstString(userDetails.phone_number),
        },
      });
      return true;

    case "TicketDetails":
      if (issueId) {
        router.push({
          pathname: "/TicketDetails",
          params: {
            issue_id: issueId,
            first_name: firstString(userDetails.first_name),
            last_name: firstString(userDetails.last_name),
            email: firstString(userDetails.email),
            employee_code: firstString(userDetails.employee_code),
          },
        });
        return true;
      }
      return false;

    case "StockRequestDetails":
      if (requestId) {
        router.push({
          pathname: "/StockRequestDetails",
          params: {
            request_id: requestId,
            employee_code: firstString(userDetails.employee_code),
          },
        });
        return true;
      }
      return false;

    case "RequestedInventory":
      if (userType === "employee") {
        router.push({
          pathname: "/RequestedInventory",
          params: {
            employee_code: firstString(userDetails.employee_code),
          },
        });
        return true;
      }
      return false;

    case "StockManager":
      router.push("/StockManager");
      return true;

    default:
      return false;
  }
}

export async function routeFromNotificationData(router: AppRouter, data: NotificationData) {
  const { userType, userDetails } = await buildRouteUserDetails();
  const roleKeys = resolveRoleKeys(userDetails || {});
  const type = firstString(data.type || data.notification_type).toLowerCase();
  const requestId = firstString(data.request_id);
  let targetScreen = firstString(data.target_screen);

    if (!targetScreen) {
      if (type === "property_chat") {
        targetScreen = userType === "client" ? "CustomerMessageWrapper" : "PropertyChatsMessages";
      } else if (type === "task_update") {
        targetScreen = "TaskManagementForm";
      } else if (
      type === "daily_task_update_bulk" ||
      type === "daily_task_update_per_property" ||
      type === "daily_task_update_reminder"
    ) {
      targetScreen = "TaskList";
    } else if (type === "ticket" || type === "ticket_chat") {
      targetScreen = "TicketDetails";
    }
  }

  if (
    type === "issue-stock-up" ||
    type === "inventory-alert-check" ||
    type === "return-stock" ||
    type === "inventory-return"
  ) {
    const requestIdOrIssuedId = requestId || firstString(data.issued_request_id);
    const isStockTeam =
      roleKeys.includes("STOCK_MANAGEMENT_TEAM") ||
      roleKeys.includes("PROCUREMENT_TEAM") ||
      roleKeys.includes("BACKEND_TEAM") ||
      roleKeys.includes("ADMIN") ||
      roleKeys.includes("SUPER_ADMIN");

    targetScreen = !isStockTeam
      ? (requestIdOrIssuedId ? "StockRequestDetails" : "RequestedInventory")
      : (requestIdOrIssuedId ? "StockRequestDetails" : (targetScreen || "StockManager"));
  }

  return targetScreen
    ? await navigateByTargetScreen(router, targetScreen, data, userType, userDetails)
    : false;
}

export async function handleNotificationResponseRedirect(
  router: AppRouter,
  response: NotificationResponse | null | undefined
) {
  const data = (response?.notification?.request?.content?.data || {}) as NotificationData;
  if (!data || typeof data !== "object") return false;
  return routeFromNotificationData(router, data);
}
