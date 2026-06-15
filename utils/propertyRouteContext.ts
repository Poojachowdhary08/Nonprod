import AsyncStorage from "@react-native-async-storage/async-storage";

export type PropertyRouteContext = {
  propertyId: string;
  projectId: string;
  propertyName?: string;
  projectName?: string;
  projectLocation?: string;
  userDetails?: any;
};

const LAST_PROPERTY_CONTEXT_KEY = "route:lastPropertyContext:v1";

export const pickRouteParam = (value: any): string => {
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
};

export const parseRouteUserDetails = (raw: any) => {
  const value = pickRouteParam(raw);
  if (!value) return null;

  const tryParse = (input: string) => {
    let current: any = input;
    for (let i = 0; i < 3; i += 1) {
      if (typeof current !== "string") return current;
      try {
        current = JSON.parse(current);
      } catch {
        return null;
      }
    }
    return typeof current === "string" ? null : current;
  };

  const parsedDirect = tryParse(value);
  if (parsedDirect) return parsedDirect;

  try {
    return tryParse(decodeURIComponent(value));
  } catch {
    return null;
  }
};

export const encodeRouteUserDetails = (userDetails: any) => {
  try {
    return encodeURIComponent(JSON.stringify(userDetails || {}));
  } catch {
    return "";
  }
};

export const buildPropertyRouteContext = (
  params: Record<string, any> = {},
  fallback: Partial<PropertyRouteContext> = {}
): PropertyRouteContext => {
  const propertyId =
    pickRouteParam(params.propertyId) ||
    pickRouteParam(params.property_id) ||
    String(fallback.propertyId || "").trim();

  const projectId =
    pickRouteParam(params.projectId) ||
    pickRouteParam(params.project_id) ||
    String(fallback.projectId || "").trim();

  const propertyName =
    pickRouteParam(params.propertyName) ||
    pickRouteParam(params.property_name) ||
    String(fallback.propertyName || "").trim();

  const projectName =
    pickRouteParam(params.projectName) ||
    pickRouteParam(params.project_name) ||
    String(fallback.projectName || "").trim();

  const projectLocation =
    pickRouteParam(params.projectLocation) ||
    pickRouteParam(params.project_location) ||
    String(fallback.projectLocation || "").trim();

  const userDetails =
    parseRouteUserDetails(params.userDetails) ??
    parseRouteUserDetails(params.user_details) ??
    fallback.userDetails ??
    null;

  return {
    propertyId,
    projectId,
    propertyName,
    projectName,
    projectLocation,
    userDetails,
  };
};

export const isPropertyRouteContextComplete = (context: Partial<PropertyRouteContext> | null | undefined) =>
  !!context?.propertyId && !!context?.projectId && !!context?.userDetails;

export const toPropertyRouteParams = (
  context: Partial<PropertyRouteContext>,
  extraParams: Record<string, any> = {}
) => ({
  propertyId: String(context.propertyId || "").trim(),
  projectId: String(context.projectId || "").trim(),
  propertyName: String(context.propertyName || "").trim(),
  projectName: String(context.projectName || "").trim(),
  projectLocation: String(context.projectLocation || "").trim(),
  userDetails: encodeRouteUserDetails(context.userDetails || {}),
  ...extraParams,
});

export const saveLastPropertyRouteContext = async (context: Partial<PropertyRouteContext>) => {
  if (!isPropertyRouteContextComplete(context)) return;

  try {
    await AsyncStorage.setItem(
      LAST_PROPERTY_CONTEXT_KEY,
      JSON.stringify({
        propertyId: String(context.propertyId || "").trim(),
        projectId: String(context.projectId || "").trim(),
        propertyName: String(context.propertyName || "").trim(),
        projectName: String(context.projectName || "").trim(),
        projectLocation: String(context.projectLocation || "").trim(),
        userDetails: context.userDetails || null,
      })
    );
  } catch {}
};

export const loadLastPropertyRouteContext = async (): Promise<PropertyRouteContext | null> => {
  try {
    const raw = await AsyncStorage.getItem(LAST_PROPERTY_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const context = buildPropertyRouteContext({}, parsed);
    return isPropertyRouteContextComplete(context) ? context : null;
  } catch {
    return null;
  }
};
