import { SerializingMCPTool } from "./base/SerializingMCPTool.js";
import { logger } from "mcp-framework";
import { z } from "zod";
import { getCategoryGroups } from "../utils/YnabRestApi.js";

interface ListCategoryGroupsInput {
  budgetId?: string;
}

interface ListCategoryGroupsResult {
  category_groups: Array<{
    id: string;
    name: string;
    hidden: boolean;
    deleted: boolean;
    category_count: number;
  }>;
}

class ListCategoryGroupsTool extends SerializingMCPTool<ListCategoryGroupsInput> {
  name = "list_category_groups";
  description =
    "List category groups in the selected budget, including group IDs and how many categories each group currently contains.";

  schema = z.object({
    budgetId: z
      .string()
      .optional()
      .describe("The ID of the budget/plan. Optional if YNAB_BUDGET_ID is set."),
  });

  protected async executeInternal(
    input: ListCategoryGroupsInput
  ): Promise<ListCategoryGroupsResult | string> {
    const budgetId = input.budgetId || process.env.YNAB_BUDGET_ID || "";
    const token = process.env.YNAB_API_TOKEN || process.env.YNAB_TOKEN;

    if (!token) {
      return "ERROR: YNAB API Token is not set. Please set YNAB_API_TOKEN environment variable.";
    }

    if (!budgetId) {
      return "ERROR: No budget ID provided. Call list_budgets() first.";
    }

    try {
      const groups = await getCategoryGroups(budgetId);

      logger.info(`Listed ${groups.length} category groups for budget ${budgetId}`);

      return {
        category_groups: groups.map((group) => ({
          id: group.id,
          name: group.name,
          hidden: Boolean(group.hidden),
          deleted: Boolean(group.deleted),
          category_count: Array.isArray(group.categories) ? group.categories.length : 0,
        })),
      };
    } catch (error: unknown) {
      logger.error("Error listing category groups:");
      logger.error(JSON.stringify(error, null, 2));
      return `ERROR listing category groups: ${error instanceof Error ? error.message : JSON.stringify(error)}`;
    }
  }
}

export default ListCategoryGroupsTool;