import { logger } from "mcp-framework";
import { SerializingMCPTool, handleToolError } from "./base/SerializingMCPTool.js";
import * as ynab from "ynab";
import { z } from "zod";
import { Cache } from "../utils/Cache.js";

interface GetPayeesInput {
  budgetId?: string;
}

class GetPayeesTool extends SerializingMCPTool<GetPayeesInput> {
  name = "get_payees";
  description = "Get a list of all payees for a specified budget";

  schema = z.object({
  budgetId: z.string().optional().describe("The ID of the budget to get payees for (optional, defaults to the budget set in the YNAB_BUDGET_ID environment variable)"),
});

  private api: ynab.API;
  private budgetId: string;

  constructor() {
    super();
    this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
    this.budgetId = process.env.YNAB_BUDGET_ID || "";
  }

  protected async executeInternal(input: GetPayeesInput) {
    const budgetId = input.budgetId || this.budgetId;

    if (!process.env.YNAB_API_TOKEN) {
      return "YNAB API Token is not set";
    }

    if (!budgetId) {
      return "No budget ID provided. Please provide a budget ID or set the YNAB_BUDGET_ID environment variable. Use the ListBudgets tool to get a list of available budgets.";
    }

    const cacheKey = `payees:${budgetId}`;
    const cachedResults = Cache.getInstance().get(cacheKey);
    if (cachedResults) {
      logger.info(`Returning cached payees for ${cacheKey}`);
      return cachedResults;
    }

    try {
      logger.info(`Getting payees for budget ${budgetId}`);
      const payeesResponse = await this.api.payees.getPayees(budgetId);
      logger.info(`Found ${payeesResponse.data.payees.length} payees`);

      const payees = payeesResponse.data.payees.map((payee) => ({
        id: payee.id,
        name: payee.name,
        transfer_account_id: payee.transfer_account_id,
        deleted: payee.deleted,
      }));

      Cache.getInstance().set(cacheKey, payees);
      return payees;
    } catch (error: unknown) {
      logger.error(`Error getting payees for budget ${budgetId}:`);
      logger.error(JSON.stringify(error, null, 2));
      return `Error getting payees for budget ${budgetId}: ${JSON.stringify(error)}`;
    }
  }
}

export default GetPayeesTool;