import { SerializingMCPTool, handleToolError } from "./base/SerializingMCPTool.js";
import { logger } from "mcp-framework";
import { z } from "zod";
import {
  getCategoryGroups,
  normalizeYnabName,
} from "../utils/YnabRestApi.js";
import { invalidateYnabCaches } from "../utils/CacheInvalidation.js";
import { createCategoryViaCurrentYnabSdk } from "../utils/YnabCurrentSdkCategoryCreate.js";

interface CreateCategoryInput {
  budgetId?: string;
  name: string;
  categoryGroupId: string;
  note?: string | null;
  goalTarget?: number | null;
  goalTargetDate?: string | null;
}

interface CreateCategoryResult {
  success: boolean;
  existed: boolean;
  category_id: string;
  name: string;
  category_group_id: string | null;
  message: string;
}

function formatCreateCategoryError(error: unknown) {
  if (error instanceof Error) {
    return JSON.stringify(
      {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      null,
      2
    );
  }

  return JSON.stringify(error, null, 2);
}

class CreateCategoryTool extends SerializingMCPTool<CreateCategoryInput> {
  name = "create_category";
  description =
    "Create a new category in the selected category group. This is idempotent by exact category name within the target group; if the category already exists there, it returns the existing category instead of creating a duplicate.";

  schema = z.object({
    budgetId: z
      .string()
      .optional()
      .describe("The ID of the budget/plan. Optional if YNAB_BUDGET_ID is set."),
    name: z
      .string()
      .min(1)
      .max(200)
      .describe("The exact category name to create."),
    categoryGroupId: z
      .string()
      .describe("The target category group ID for the new category."),
    note: z
      .string()
      .nullable()
      .optional()
      .describe("Optional note for the category."),
    goalTarget: z
      .number()
      .nullable()
      .optional()
      .describe("Optional goal target in dollars."),
    goalTargetDate: z
      .string()
      .nullable()
      .optional()
      .describe("Optional goal target date in YYYY-MM-DD format."),
  });

  protected async executeInternal(
    input: CreateCategoryInput
  ): Promise<CreateCategoryResult | string> {
    const budgetId = (input.budgetId || process.env.YNAB_BUDGET_ID || "").trim();
    const token = process.env.YNAB_API_TOKEN || process.env.YNAB_TOKEN;
    const categoryName = input.name.trim();
    const requestedCategoryGroupId = input.categoryGroupId.trim();
    let verifiedCategoryGroup: { id: string; name: string } | null = null;

    if (!token) {
      return handleToolError("YNAB API Token is not set. Please set YNAB_API_TOKEN environment variable.");
    }

    if (!budgetId) {
      return handleToolError("No budget ID provided. Call list_budgets() first.");
    }

    if (!categoryName) {
      return handleToolError("Category name is required.");
    }

    if (!requestedCategoryGroupId) {
      return handleToolError("Category group ID is required.");
    }

    const normalizedTarget = normalizeYnabName(categoryName);

    try {
      const categoryGroups = await getCategoryGroups(budgetId);
      const targetGroup = categoryGroups.find(
        (group) => !group.deleted && group.id.trim() === requestedCategoryGroupId
      );

      if (!targetGroup) {
        const availableGroups = categoryGroups
          .filter((group) => !group.deleted)
          .map((group) => `${group.name} (${group.id})`)
          .join(", ");

        return handleToolError(
          `Category group '${requestedCategoryGroupId}' was not found in budget '${budgetId}'. Available groups: ${availableGroups || "none"}.`,
          "creating category"
        );
      }
      verifiedCategoryGroup = { id: targetGroup.id, name: targetGroup.name };

      const existing = (targetGroup.categories || []).find(
        (category) =>
          !category.deleted &&
          (category.category_group_id || targetGroup.id) === targetGroup.id &&
          normalizeYnabName(category.name) === normalizedTarget
      );

      if (existing) {
        return {
          success: true,
          existed: true,
          category_id: existing.id,
          name: existing.name,
          category_group_id: existing.category_group_id || null,
          message: `Reusing existing category '${existing.name}'.`,
        };
      }

      const category = await createCategoryViaCurrentYnabSdk({
        planId: budgetId,
        name: categoryName,
        categoryGroupId: targetGroup.id,
        note: input.note,
        goalTargetMilliunits:
          typeof input.goalTarget === "number"
            ? Math.round(input.goalTarget * 1000)
            : undefined,
        goalTargetDate: input.goalTargetDate,
      });

      if (!category?.id) {
        return handleToolError(
          "YNAB did not return the created category.",
          "creating category"
        );
      }

      logger.info(`Created category ${category.id} in budget ${budgetId}`);
      invalidateYnabCaches();

      return {
        success: true,
        existed: false,
        category_id: category.id,
        name: category.name || categoryName,
        category_group_id: category.category_group_id || null,
        message: `Created category '${category.name || categoryName}'.`,
      };
    } catch (error: unknown) {
      logger.error("Error creating category:");
      logger.error(formatCreateCategoryError(error));
      const errorMessage =
        error instanceof Error ? error.message : String(error ?? "Unknown error");

      if (
        verifiedCategoryGroup &&
        /category_group_id does not exist in this budget/i.test(errorMessage)
      ) {
        return handleToolError(
          `YNAB rejected verified category group '${verifiedCategoryGroup.name}' (${verifiedCategoryGroup.id}) in budget '${budgetId}'. The group was present in GET /plans/${budgetId}/categories immediately before the create request, so this appears to be a YNAB create-category API mismatch. No category was created. Original error: ${errorMessage}`,
          "creating category"
        );
      }

      return handleToolError(error, "creating category");
    }
  }
}

export default CreateCategoryTool;
