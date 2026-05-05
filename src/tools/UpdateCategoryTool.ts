import { SerializingMCPTool } from "./base/SerializingMCPTool.js";
import { logger } from "mcp-framework";
import { z } from "zod";
import { requestYnabApi } from "../utils/YnabRestApi.js";
import { invalidateYnabCaches } from "../utils/CacheInvalidation.js";

interface UpdateCategoryInput {
  budgetId?: string;
  categoryId: string;
  name?: string | null;
  note?: string | null;
  categoryGroupId?: string | null;
  goalTarget?: number | null;
  goalTargetDate?: string | null;
}

interface UpdateCategoryResult {
  success: boolean;
  category_id: string;
  name: string | null;
  category_group_id: string | null;
  note: string | null;
  message: string;
}

class UpdateCategoryTool extends SerializingMCPTool<UpdateCategoryInput> {
  name = "update_category";
  description =
    "Update an existing category. Supports renaming a category, changing its note, moving it to a different category group, and updating goal fields.";

  schema = z.object({
    budgetId: z
      .string()
      .optional()
      .describe("The ID of the budget/plan. Optional if YNAB_BUDGET_ID is set."),
    categoryId: z
      .string()
      .describe("The category ID to update."),
    name: z
      .string()
      .nullable()
      .optional()
      .describe("Optional new category name."),
    note: z
      .string()
      .nullable()
      .optional()
      .describe("Optional new category note."),
    categoryGroupId: z
      .string()
      .nullable()
      .optional()
      .describe("Optional destination category group ID."),
    goalTarget: z
      .number()
      .nullable()
      .optional()
      .describe("Optional new goal target in dollars."),
    goalTargetDate: z
      .string()
      .nullable()
      .optional()
      .describe("Optional new goal target date in YYYY-MM-DD format."),
  });

  protected async executeInternal(
    input: UpdateCategoryInput
  ): Promise<UpdateCategoryResult | string> {
    const budgetId = input.budgetId || process.env.YNAB_BUDGET_ID || "";
    const token = process.env.YNAB_API_TOKEN || process.env.YNAB_TOKEN;

    if (!token) {
      return "ERROR: YNAB API Token is not set. Please set YNAB_API_TOKEN environment variable.";
    }

    if (!budgetId) {
      return "ERROR: No budget ID provided. Call list_budgets() first.";
    }

    if (
      input.name === undefined &&
      input.note === undefined &&
      input.categoryGroupId === undefined &&
      input.goalTarget === undefined &&
      input.goalTargetDate === undefined
    ) {
      return "ERROR: At least one field to update is required.";
    }

    try {
      const updateResponse = await requestYnabApi<{
        data?: {
          category?: {
            id: string;
            name: string | null;
            note?: string | null;
            category_group_id?: string | null;
          };
        };
      }>(`/plans/${encodeURIComponent(budgetId)}/categories/${encodeURIComponent(input.categoryId)}`, {
        method: "PATCH",
        body: {
          category: {
            name: input.name ?? undefined,
            note: input.note ?? undefined,
            category_group_id: input.categoryGroupId ?? undefined,
            goal_target:
              typeof input.goalTarget === "number"
                ? Math.round(input.goalTarget * 1000)
                : undefined,
            goal_target_date: input.goalTargetDate ?? undefined,
          },
        },
      });

      const category = updateResponse?.data?.category;
      if (!category?.id) {
        return "ERROR updating category: YNAB did not return the updated category.";
      }

      logger.info(`Updated category ${category.id} in budget ${budgetId}`);
      invalidateYnabCaches();

      return {
        success: true,
        category_id: category.id,
        name: category.name || null,
        category_group_id: category.category_group_id || null,
        note: category.note || null,
        message: `Successfully updated category '${category.name || input.categoryId}'.`,
      };
    } catch (error: unknown) {
      logger.error("Error updating category:");
      logger.error(JSON.stringify(error, null, 2));
      return `ERROR updating category: ${error instanceof Error ? error.message : JSON.stringify(error)}`;
    }
  }
}

export default UpdateCategoryTool;