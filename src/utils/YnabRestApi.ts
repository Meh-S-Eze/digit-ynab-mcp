const DEFAULT_YNAB_API_BASE_URL = "https://api.ynab.com/v1";

interface YnabErrorResponse {
  error?: {
    id?: string;
    name?: string;
    detail?: string;
  };
}

export interface YnabCategoryGroupRecord {
  id: string;
  name: string;
  hidden?: boolean;
  deleted?: boolean;
  categories?: Array<YnabCategoryRecord>;
}

export interface YnabCategoryRecord {
  id: string;
  name: string;
  note?: string | null;
  category_group_id?: string | null;
  hidden?: boolean;
  deleted?: boolean;
  budgeted?: number;
  activity?: number;
  balance?: number;
}

export function getYnabApiToken() {
  return process.env.YNAB_API_TOKEN || process.env.YNAB_TOKEN || "";
}

export function getYnabApiBaseUrl() {
  return process.env.YNAB_API_BASE_URL || DEFAULT_YNAB_API_BASE_URL;
}

export function normalizeYnabName(value: string | null | undefined) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

export async function requestYnabApi<T>(
  path: string,
  options: Omit<RequestInit, "body"> & { body?: unknown } = {}
): Promise<T> {
  const token = getYnabApiToken();

  if (!token) {
    throw new Error("YNAB API Token is not set");
  }

  const url = `${getYnabApiBaseUrl()}${path}`;
  const { body, headers, ...rest } = options;

  const response = await fetch(url, {
    ...rest,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(headers || {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const payload = text ? safelyParseJson(text) : null;

  if (!response.ok) {
    const errorPayload = payload as YnabErrorResponse | null;
    const detail =
      errorPayload?.error?.detail ||
      errorPayload?.error?.name ||
      response.statusText ||
      "Unknown YNAB API error";
    throw new Error(`YNAB API ${response.status}: ${detail}`);
  }

  return payload as T;
}

export async function getCategoryGroups(planId: string) {
  const response = await requestYnabApi<{
    data?: {
      category_groups?: Array<YnabCategoryGroupRecord>;
    };
  }>(`/plans/${encodeURIComponent(planId)}/categories`, {
    method: "GET",
  });

  return response?.data?.category_groups || [];
}

export async function getCategories(planId: string) {
  const groups = await getCategoryGroups(planId);
  return groups.flatMap((group) =>
    (group.categories || []).map((category) => ({
      ...category,
      category_group_id: category.category_group_id || group.id,
      category_group_name: group.name,
    }))
  );
}

function safelyParseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}