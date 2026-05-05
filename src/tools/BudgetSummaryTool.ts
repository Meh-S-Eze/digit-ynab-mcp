import { logger } from "mcp-framework";
import { SerializingMCPTool, handleToolError } from "./base/SerializingMCPTool.js";
import * as ynab from "ynab";
import { z } from "zod";
import { Cache } from "../utils/Cache.js";

interface BudgetSummaryInput {
  budgetId?: string;
  month: string;
}

interface BudgetSummaryResult {
  monthBudget: {
    month: string;
    income: number;
    budgeted: number;
    activity: number;
    to_be_budgeted: number;
    age_of_money: number | null;
    note: string | null;
  };
  accounts: Array<{
    id: string;
    name: string;
    type: string;
    balance: number;
  }>;
  categories: Array<{
    id: string;
    name: string;
    budgeted: number;
    activity: number;
    balance: number;
    overspent: boolean;
  }>;
}

/**
 * Get a summarized view of a single budget month.
 *
 * This combines:
 * - high-level month stats (income, budgeted, activity, to_be_budgeted)
 * - account balances
 * - category balances with overspending flags
 *
 * Use this when the user asks things like:
 * - "What's my overall budget status this month?"
 * - "Which categories are overspent?"
 * - "How much do I have ready to assign?"
 */
class BudgetSummaryTool extends SerializingMCPTool<BudgetSummaryInput> {
  name = "budget_summary";
  description =
    "Get a summary of the budget for a specific month including income, budgeted, activity, ready-to-assign, account balances, and which categories are overspent.";

  schema = z.object({
  budgetId: z.string().optional().describe("The ID of the budget to get a summary for (optional, defaults to the budget set in the YNAB_BUDGET_ID environment variable). Use list_budgets to discover budgets."),
  month: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).default("current").describe("The budget month in ISO format (e.g. 2016-12-01). The string 'current' can also be used to specify the current calendar month (UTC)."),
});

  private api: ynab.API;
  private budgetId: string;

  constructor() {
    super();
    this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
    this.budgetId = process.env.YNAB_BUDGET_ID || "";
  }

  protected async executeInternal(input: BudgetSummaryInput): Promise<BudgetSummaryResult | string> {
    const budgetId = input.budgetId || this.budgetId;
    if (!budgetId) {
      return "No budget ID provided. Please provide a budget ID or set the YNAB_BUDGET_ID environment variable. Use the list_budgets tool to get a list of available budgets.";
    }

    const cacheKey = `budget_summary:${budgetId}:${input.month || "current"}`;
    const cachedResults = Cache.getInstance().get(cacheKey);
    if (cachedResults) {
      logger.info(`Returning cached summary for ${cacheKey}`);
      return cachedResults as BudgetSummaryResult;
    }

    try {
      logger.info(
        `Getting accounts and categories for budget ${budgetId} and month ${input.month}`
      );
      const accountsResponse = await this.api.accounts.getAccounts(budgetId);
      const accounts = accountsResponse.data.accounts.filter(
        (account) => account.deleted === false && account.closed === false
      );

      const monthBudgetResponse = await this.api.months.getBudgetMonth(
        budgetId,
        input.month
      );
      const monthData = monthBudgetResponse.data.month;

      const categories = monthData.categories.filter(
        (category) => category.deleted === false && category.hidden === false
      );

      const result: BudgetSummaryResult = {
        monthBudget: {
          month: monthData.month,
          income: monthData.income / 1000,
          budgeted: monthData.budgeted / 1000,
          activity: monthData.activity / 1000,
          to_be_budgeted: monthData.to_be_budgeted / 1000,
          age_of_money: monthData.age_of_money ?? null,
          note: monthData.note ?? null,
        },
        accounts: accounts.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          balance: a.balance / 1000,
        })),
        categories: categories.map((c) => ({
          id: c.id,
          name: c.name,
          budgeted: c.budgeted / 1000,
          activity: c.activity / 1000,
          balance: c.balance / 1000,
          overspent: c.balance < 0,
        })),
      };

      Cache.getInstance().set(cacheKey, result);
      return result;
    } catch (error: unknown) {
      logger.error(`Error getting budget ${budgetId}:`);
      logger.error(JSON.stringify(error, null, 2));
      return `Error getting budget ${budgetId}: ${JSON.stringify(error)}`;
    }
  }
}

export default BudgetSummaryTool;