import { SerializingMCPTool } from "./base/SerializingMCPTool.js";
import { logger } from "mcp-framework";
import { z } from "zod";
import { requestYnabApi } from "../utils/YnabRestApi.js";
import { invalidateYnabCaches } from "../utils/CacheInvalidation.js";

interface UpdateCategoryGroupInput {
  budgetId?: string;
  categoryGroupId: string;
  name: string;
}

interface UpdateCategoryGroupResult {
  success: boolean;
  category_group_id: string;
  name: string;
  message: string;
}

class UpdateCategoryGroupTool extends SerializingMCPTool<UpdateCategoryGroupInput> {
  name = "update_category_group";
  description =
    "Rename an existing category group in the selected budget.";

  schema = z.object({
    budgetId: z
      .string()
      .optional()
      .describe("The ID of the budget/plan. Optional if YNAB_BUDGET_ID is set."),
    categoryGroupId: z
      .string()
      .describe("The category group ID to update."),
    name: z
      .string()
      .min(1)
      .max(50)
      .describe("The new name for the category group."),
  });

  protected async executeInternal(
    input: UpdateCategoryGroupInput
  ): Promise<UpdateCategoryGroupResult | string> {
    const budgetId = input.budgetId || process.env.YNAB_BUDGET_ID || "";
    const token = process.env.YNAB_API_TOKEN || process.env.YNAB_TOKEN;

    if (!token) {
      return "ERROR: YNAB API Token is not set. Please set YNAB_API_TOKEN environment variable.";
    }

    if (!budgetId) {
      return "ERROR: No budget ID provided. Call list_budgets() first.";
    }

    try {
      const updateResponse = await requestYnabApi<{
        data?: {
          category_group?: {
            id: string;
            name: string;
          };
        };
      }>(
        `/plans/${encodeURIComponent(budgetId)}/category_groups/${encodeURIComponent(
          input.categoryGroupId
        )}`,
        {
          method: "PATCH",
          body: {
            category_group: {
              name: input.name,
            },
          },
        }
      );

      const categoryGroup = updateResponse?.data?.category_group;
      if (!categoryGroup?.id) {
        return "ERROR updating category group: YNAB did not return the updated category group.";
      }

      logger.info(`Updated category group ${categoryGroup.id} in budget ${budgetId}`);
      invalidateYnabCaches();

      return {
        success: true,
        category_group_id: categoryGroup.id,
        name: categoryGroup.name,
        message: `Successfully updated category group '${categoryGroup.name}'.`,
      };
    } catch (error: unknown) {
      logger.error("Error updating category group:");
      logger.error(JSON.stringify(error, null, 2));
      return `ERROR updating category group: ${error instanceof Error ? error.message : JSON.stringify(error)}`;
    }
  }
}

export default UpdateCategoryGroupTool;