import { logger } from "mcp-framework";
import { SerializingMCPTool, handleToolError } from "./base/SerializingMCPTool.js";
import { AxiosError } from "axios";
import * as ynab from "ynab";
import { z } from "zod";
import { Cache } from "../utils/Cache.js";

interface BudgetInfo {
  id: string;
  name: string;
}

interface ListBudgetsResult {
  budgets: BudgetInfo[];
}

/**
 * Fetch all available YNAB budgets.
 *
 * This is the **first tool to call** if you don't have a budgetId.
 * You need a budgetId for almost all other operations.
 *
 * Returns an array of {id, name} objects. Store the budgetId
 * for the remainder of the session.
 */
class ListBudgetsTool extends SerializingMCPTool {
  name = "list_budgets";
  description =
    "CRITICAL FIRST STEP: Fetch all available YNAB budgets. You need a budget ID before you can do almost anything else. Returns a list of {id, name} for each budget.";

  schema = z.object({});

  api: ynab.API;

  constructor() {
    super();
    this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
  }

  protected async executeInternal(): Promise<ListBudgetsResult | string> {
    try {
      if (!process.env.YNAB_API_TOKEN) {
        return handleToolError("YNAB API Token is not set. Please set the YNAB_API_TOKEN environment variable with your YNAB Personal Access Token (get it from https://app.ynab.com/settings/developer).");
      }

      const cacheKey = "budgets:list";
      const cachedResults = Cache.getInstance().get(cacheKey);
      if (cachedResults) {
        logger.info("Returning cached budget list");
        return cachedResults as ListBudgetsResult;
      }

      logger.info("Listing budgets");
      const budgetsResponse = await this.api.budgets.getBudgets();
      logger.info(`Found ${budgetsResponse.data.budgets.length} budgets`);

      const result: ListBudgetsResult = {
        budgets: budgetsResponse.data.budgets.map((budget) => ({
          id: budget.id,
          name: budget.name,
        })),
      };

      Cache.getInstance().set(cacheKey, result);
      return result;
    } catch (error: unknown) {
      logger.error(`Error listing budgets: ${JSON.stringify(error)}`);
      if (error instanceof AxiosError && error.response?.status === 401) {
        return handleToolError("Authentication failed. Your YNAB_API_TOKEN is invalid or expired. Get a fresh token from https://app.ynab.com/settings/developer.");
      }
      return handleToolError(error, "listing budgets");
    }
  }
}

export default ListBudgetsTool;