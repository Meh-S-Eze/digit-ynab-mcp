import * as ynabV4 from "ynab-v4";
import { getYnabApiBaseUrl, getYnabApiToken } from "./YnabRestApi.js";

interface CreateCategoryViaCurrentYnabSdkInput {
  planId: string;
  name: string;
  categoryGroupId: string;
  note?: string | null;
  goalTargetMilliunits?: number;
  goalTargetDate?: string | null;
}

export interface CurrentSdkCategoryResult {
  id: string;
  name: string | null;
  category_group_id?: string | null;
}

function normalizeYnabSdkError(error: unknown): Error {
  if (error instanceof Error) return error;

  const payload = error as {
    error?: {
      id?: string;
      name?: string;
      detail?: string;
    };
  } | null;

  if (payload?.error) {
    const detail =
      payload.error.detail ||
      payload.error.name ||
      JSON.stringify(payload.error);
    const prefix = payload.error.id ? `YNAB API ${payload.error.id}` : "YNAB API";
    return new Error(`${prefix}: ${detail}`);
  }

  return new Error(
    typeof error === "string" ? error : JSON.stringify(error ?? "Unknown error")
  );
}

export async function createCategoryViaCurrentYnabSdk(
  input: CreateCategoryViaCurrentYnabSdkInput
): Promise<CurrentSdkCategoryResult | null> {
  const api = new ynabV4.API(getYnabApiToken(), getYnabApiBaseUrl());

  try {
    const response = await api.categories.createCategory(input.planId, {
      category: {
        name: input.name,
        category_group_id: input.categoryGroupId,
        note: input.note ?? undefined,
        goal_target: input.goalTargetMilliunits,
        goal_target_date: input.goalTargetDate ?? undefined,
      },
    });

    return response.data.category || null;
  } catch (error) {
    throw normalizeYnabSdkError(error);
  }
}
