import { API_BASE_URL } from "@/utils/apiBase";
import { authenticatedFetch } from "@/utils/auth";

const CRM_LOCAL_BASE_URL = String(API_BASE_URL).replace(/\/+$/, "");

export type SalesLeadStage =
  | "fresh"
  | "requirements"
  | "shortlist"
  | "site_visit"
  | "negotiate"
  | "legal"
  | "handover"
  | "deal_close"
  | "lost";

export type SalesLead = {
  id: string;
  name: string;
  lead_code?: string | null;
  stage_key: SalesLeadStage | string;
  status_key?: string | null;
  priority_key?: string | null;
  owner_employee_code?: string | null;
  source_code?: string | null;
  location_text?: string | null;
  value_amount?: number | null;
  currency?: string | null;
  preferred_channel_key?: string | null;
  next_action_at?: string | null;
  next_action_text?: string | null;
  next_action_notes?: string | null;
  interest_level_key?: string | null;
  score?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  details_json?: Record<string, any> | null;
};

export type SalesLeadDetail = {
  lead: SalesLead;
  contacts: Array<Record<string, any>>;
  notes: Array<Record<string, any>>;
  activities: Array<Record<string, any>>;
  reminders: Array<Record<string, any>>;
  tasks: Array<Record<string, any>>;
};

export type SalesLeadMasterOption = {
  code: string;
  label?: string | null;
  sort_order?: number | null;
  is_active?: boolean | null;
};

export type SalesLeadMasters = {
  stages: SalesLeadMasterOption[];
  sources: SalesLeadMasterOption[];
  job_types: SalesLeadMasterOption[];
};

export type CreateSalesLeadInput = {
  name: string;
  lead_code?: string | null;
  stage_key?: string;
  status_key?: string;
  priority_key?: string;
  owner_employee_code?: string | null;
  source_code?: string | null;
  job_type_code?: string | null;
  location_text?: string | null;
  value_amount?: number | null;
  currency?: string;
  preferred_channel_key?: string | null;
  next_action_at?: string | null;
  next_action_text?: string | null;
  next_action_notes?: string | null;
  interest_level_key?: string | null;
  score?: number | null;
};

async function parseJsonSafe(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function normalizeLead(item: any): SalesLead {
  return {
    id: String(item?.id ?? item?.lead_id ?? ""),
    name: String(item?.name ?? item?.title ?? ""),
    lead_code: item?.lead_code ?? null,
    stage_key: String(item?.stage_key ?? "fresh"),
    status_key: item?.status_key ?? null,
    priority_key: item?.priority_key ?? null,
    owner_employee_code: item?.owner_employee_code ?? null,
    source_code: item?.source_code ?? null,
    location_text: item?.location_text ?? null,
    value_amount: item?.value_amount != null ? Number(item.value_amount) : null,
    currency: item?.currency ?? null,
    preferred_channel_key: item?.preferred_channel_key ?? null,
    next_action_at: item?.next_action_at ?? null,
    next_action_text: item?.next_action_text ?? null,
    next_action_notes: item?.next_action_notes ?? null,
    interest_level_key: item?.interest_level_key ?? null,
    score: item?.score != null ? Number(item.score) : null,
    created_at: item?.created_at ?? item?.createdAt ?? null,
    updated_at: item?.updated_at ?? item?.updatedAt ?? null,
    details_json: item?.details_json ?? null,
  };
}

function crmLeadUrl(path: string): string {
  const normalizedPath = String(path || "").trim();
  if (!normalizedPath) return CRM_LOCAL_BASE_URL;
  return `${CRM_LOCAL_BASE_URL}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;
}

export function normalizeSalesStageKey(stage: string): string {
  const key = String(stage || "").trim().toLowerCase();
  switch (key) {
    case "qualified":
    case "qualify":
      return "requirements";
    case "negotiation":
      return "negotiate";
    case "client":
      return "deal_close";
    default:
      return key;
  }
}

export function isSalesClientStage(stage: string): boolean {
  const key = normalizeSalesStageKey(stage);
  return key === "deal_close" || key === "handover";
}

export function salesStageLabel(stage: string) {
  const key = normalizeSalesStageKey(stage);
  switch (key) {
    case "fresh":
      return "Fresh";
    case "requirements":
      return "Requirements";
    case "shortlist":
      return "Shortlist";
    case "site_visit":
      return "Site Visit";
    case "negotiate":
      return "Negotiation";
    case "legal":
      return "Legal";
    case "handover":
      return "Handover";
    case "deal_close":
      return "Deal Close";
    case "lost":
      return "Lost";
    default:
      return key ? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Lead";
  }
}

export function promoteSalesStage(stage: string): string {
  const order = ["fresh", "requirements", "shortlist", "site_visit", "negotiate", "legal", "handover"];
  const current = normalizeSalesStageKey(stage || "fresh");
  if (current === "handover" || current === "deal_close" || current === "lost") return current;
  const index = order.indexOf(current);
  return order[Math.min(index + 1, order.length - 1)] || "requirements";
}

export function demoteSalesStage(stage: string): string {
  const order = ["fresh", "requirements", "shortlist", "site_visit", "negotiate", "legal", "handover"];
  const current = normalizeSalesStageKey(stage || "fresh");
  if (current === "lost") return "fresh";
  const index = order.indexOf(current);
  return order[Math.max(index - 1, 0)] || "fresh";
}

export async function listSalesLeads(args: {
  employeeCode: string;
  role?: string | null;
  isOpen?: boolean;
  limit?: number;
  offset?: number;
}): Promise<SalesLead[]> {
  const qs = new URLSearchParams({
    is_open: String(args.isOpen ?? true),
    limit: String(args.limit ?? 50),
    offset: String(args.offset ?? 0),
  });

  void args.employeeCode;
  void args.role;

  const res = await authenticatedFetch(`${crmLeadUrl("/crm/leads")}?${qs.toString()}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  const data = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(
      typeof data === "string"
        ? data
        : data?.detail || data?.message || `Failed to fetch leads (${res.status})`
    );
  }

  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  return items.map(normalizeLead).filter((lead:any) => lead.id);
}

export async function createSalesLead(args: {
  employeeCode?: string | null;
  role?: string | null;
  body: CreateSalesLeadInput;
}): Promise<SalesLead> {
  void args.employeeCode;
  void args.role;

  const res = await authenticatedFetch(crmLeadUrl("/crm/leads"), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args.body),
  });

  const data = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(
      typeof data === "string"
        ? data
        : data?.detail || data?.message || `Failed to create lead (${res.status})`
    );
  }

  return normalizeLead(data?.item ?? data?.lead ?? data);
}

export async function getSalesLeadDetail(args: {
  leadId: string;
  employeeCode: string;
  role?: string | null;
}): Promise<SalesLeadDetail> {
  void args.employeeCode;
  void args.role;

  const res = await authenticatedFetch(crmLeadUrl(`/crm/leads/${encodeURIComponent(args.leadId)}/detail`), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  const data = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(
      typeof data === "string"
        ? data
        : data?.detail || data?.message || `Failed to fetch lead detail (${res.status})`
    );
  }

  return {
    lead: normalizeLead(data?.lead ?? {}),
    contacts: Array.isArray(data?.contacts) ? data.contacts : [],
    notes: Array.isArray(data?.notes) ? data.notes : [],
    activities: Array.isArray(data?.activities) ? data.activities : [],
    reminders: Array.isArray(data?.reminders) ? data.reminders : [],
    tasks: Array.isArray(data?.tasks) ? data.tasks : [],
  };
}

export async function getSalesLeadMasters(args: {
  employeeCode: string;
  role?: string | null;
}): Promise<SalesLeadMasters> {
  void args.employeeCode;
  void args.role;

  const res = await authenticatedFetch(crmLeadUrl("/crm/masters"), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  const data = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(
      typeof data === "string"
        ? data
        : data?.detail || data?.message || `Failed to fetch lead masters (${res.status})`
    );
  }

  return {
    stages: Array.isArray(data?.stages) ? data.stages : [],
    sources: Array.isArray(data?.sources) ? data.sources : [],
    job_types: Array.isArray(data?.job_types) ? data.job_types : [],
  };
}

export async function moveSalesLeadStage(args: {
  leadId: string;
  employeeCode: string;
  role?: string | null;
  toStageKey: string;
  detailsJson?: Record<string, any> | null;
}): Promise<any> {
  void args.employeeCode;
  void args.role;

  const res = await authenticatedFetch(crmLeadUrl(`/crm/leads/${encodeURIComponent(args.leadId)}/move-stage`), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to_stage_key: args.toStageKey,
      details_json: args.detailsJson ?? null,
    }),
  });

  const data = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(
      typeof data === "string"
        ? data
        : data?.detail || data?.message || `Failed to move lead stage (${res.status})`
    );
  }

  return data;
}

export async function restoreSalesLead(args: {
  leadId: string;
  employeeCode: string;
  role?: string | null;
  targetStageKey?: string | null;
}): Promise<any> {
  void args.employeeCode;
  void args.role;

  const res = await authenticatedFetch(crmLeadUrl(`/crm/leads/${encodeURIComponent(args.leadId)}/restore`), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      target_stage_key: args.targetStageKey || "deal_close",
    }),
  });

  const data = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(
      typeof data === "string"
        ? data
        : data?.detail || data?.message || `Failed to restore lead (${res.status})`
    );
  }

  return data;
}
