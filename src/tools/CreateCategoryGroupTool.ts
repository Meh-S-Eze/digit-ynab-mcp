import { SerializingMCPTool, handleToolError } from "./base/SerializingMCPTool.js";
import { logger } from "mcp-framework";
import { z } from "zod";
import {
  getCategoryGroups,
  normalizeYnabName,
  requestYnabApi,
} from "../utils/YnabRestApi.js";
import { invalidateYnabCaches } from "../utils/CacheInvalidation.js";

interface CreateCategoryGroupInput {
  budgetId?: string;
  name: string;
}

interface CreateCategoryGroupResult {
  success: boolean;
  existed: boolean;
  category_group_id: string;
  name: string;
  message: string;
}

class CreateCategoryGroupTool extends SerializingMCPTool<CreateCategoryGroupInput> {
  name = "create_category_group";
  description =
    "Create a new category group in the selected budget. This is idempotent by exact category-group name; if the group already exists, it returns the existing group instead of creating a duplicate.";

  schema = z.object({
    budgetId: z
      .string()
      .optional()
      .describe("The ID of the budget/plan. Optional if YNAB_BUDGET_ID is set."),
    name: z
      .string()
      .min(1)
      .max(50)
      .describe("The exact category group name to create."),
  });

  protected async executeInternal(
    input: CreateCategoryGroupInput
  ): Promise<CreateCategoryGroupResult | string> {
    const budgetId = input.budgetId || process.env.YNAB_BUDGET_ID || "";
    const token = process.env.YNAB_API_TOKEN || process.env.YNAB_TOKEN;

    if (!token) {
      return handleToolError("YNAB API Token is not set. Please set YNAB_API_TOKEN environment variable.");
    }

    if (!budgetId) {
      return handleToolError("No budget ID provided. Call list_budgets() first.");
    }

    const normalizedTarget = normalizeYnabName(input.name);

    try {
      const existingGroups = await getCategoryGroups(budgetId);
      const existing = existingGroups.find(
        (group) => !group.deleted && normalizeYnabName(group.name) === normalizedTarget
      );

      if (existing) {
        return {
          success: true,
          existed: true,
          category_group_id: existing.id,
          name: existing.name,
          message: `Reusing existing category group '${existing.name}'.`,
        };
      }

      const createResponse = await requestYnabApi<{
        data?: {
          category_group?: {
            id: string;
            name: string;
          };
        };
      }>(`/plans/${encodeURIComponent(budgetId)}/category_groups`, {
        method: "POST",
        body: {
          category_group: {
            name: input.name,
          },
        },
      });

      const categoryGroup = createResponse?.data?.category_group;
      if (!categoryGroup?.id) {
        return handleToolError(
          "YNAB did not return the created category group.",
          "creating category group"
        );
      }

      logger.info(`Created category group ${categoryGroup.id} in budget ${budgetId}`);
      invalidateYnabCaches();

      return {
        success: true,
        existed: false,
        category_group_id: categoryGroup.id,
        name: categoryGroup.name,
        message: `Created category group '${categoryGroup.name}'.`,
      };
    } catch (error: unknown) {
      logger.error("Error creating category group:");
      logger.error(JSON.stringify(error, null, 2));
      return handleToolError(error, "creating category group");
    }
  }
}

export default CreateCategoryGroupTool;