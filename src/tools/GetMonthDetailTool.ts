import { logger } from "mcp-framework";
import { SerializingMCPTool, handleToolError } from "./base/SerializingMCPTool.js";
import * as ynab from "ynab";
import { z } from "zod";

/**
 * CategoryData - Category details from month
 */
interface CategoryData {
  id: string;
  name: string;
  budgeted: number;
  activity: number;
  balance: number;
  hidden: boolean;
  deleted: boolean;
}

/**
 * GetMonthDetailResult - Return type for month detail
 */
interface GetMonthDetailResult {
  month: string;
  note: string | null;
  to_be_budgeted: number;
  age_of_money: number | null;
  income: number;
  budgeted: number;
  activity: number;
  categories: CategoryData[];
}

interface GetMonthDetailInput {
    budgetId?: string;
    month?: string;
}

/**
 * GetMonthDetailTool - Get full month details including all category budgets
 *
 * WHEN TO USE:
 * - User asks: "What's my budget for this month?", "How much do I have to budget?", "Category breakdown"
 * - User wants: Monthly budget overview, category details, Age of Money
 * - User is: Planning budget, reviewing categories, allocating funds
 *
 * WORKFLOW:
 * 1. Optional: Call list_budgets() if user hasn't specified a budget
 * 2. Call this tool with optional month (defaults to current month)
 * 3. Returns: Full month breakdown including all categories with budgeted/activity/balance
 * 4. Can then use update_category_budget() to adjust allocations
 *
 * COMMON CLAUDE PATTERNS:
 * User: "What's my budget?" → get_month_detail() → show categories with balances
 * User: "Age of Money?" → get_month_detail() → report age_of_money
 * User: "To be budgeted?" → get_month_detail() → show to_be_budgeted amount
 * User: "Move $100 to groceries" → get_month_detail() → identify categoryId → update_category_budget()
 *
 * MONTH PARAMETER:
 * - 'current' or omit = current month
 * - ISO format: '2025-01-01', '2025-02-01' (must be first day of month)
 * - Past months accessible for historical review
 *
 * KEY FIELDS:
 * - to_be_budgeted: Unallocated funds available
 * - age_of_money: Average age of money in budget (key metric!)
 * - income: Total income for the month
 * - budgeted: Total budgeted across all categories
 * - activity: Total spending/activity for the month
 * - categories: Full list of categories with individual balances
 *
 * IMPORTANT:
 * - Includes hidden categories (check hidden field)
 * - All amounts in dollars (converted from milliunits)
 * - Get categoryId from this tool for use in update_category_budget()
 * - Age of Money = days of spending you have saved
 */
class GetMonthDetailTool extends SerializingMCPTool<GetMonthDetailInput> {
    name = "get_month_detail";
    description = "WORKING: Get full details for a specific budget month. Shows 'Age of Money' (key metric!), 'To Be Budgeted' amount, and all category balances, budgets, and activity. Use to review budget status and identify category IDs for adjustments.";

    schema = z.object({
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to env var). Get from list_budgets() if needed."),
  month: z.string().optional().default("current").describe("The budget month in ISO format (e.g., 2025-01-01) or 'current' (default). Must be the first day of the month."),
});

    private api: ynab.API;
    private budgetId: string;

    constructor() {
        super();
        this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
        this.budgetId = process.env.YNAB_BUDGET_ID || "";
    }

    protected async executeInternal(input: GetMonthDetailInput): Promise<GetMonthDetailResult | string> {
        const budgetId = input.budgetId || this.budgetId;

        if (!process.env.YNAB_API_TOKEN) {
            return "ERROR: YNAB API Token is not set. Please set YNAB_API_TOKEN environment variable.";
        }

        if (!budgetId) {
            return "ERROR: No budget ID provided. Call list_budgets() first.";
        }

        try {
            logger.info(`Getting month detail for ${input.month} in budget ${budgetId}`);

            const response = await this.api.months.getBudgetMonth(
                budgetId,
                input.month || "current"
            );

            const month = response.data.month;

            // Transform response to be more AI-friendly (milliunits -> dollars, simplified structure)
            const categories = month.categories.map(c => ({
                id: c.id,
                name: c.name,
                budgeted: c.budgeted / 1000,
                activity: c.activity / 1000,
                balance: c.balance / 1000,
                hidden: c.hidden,
                deleted: c.deleted
            }));

            const result: GetMonthDetailResult = {
                month: month.month,
                note: month.note ?? null,
                to_be_budgeted: month.to_be_budgeted / 1000,
                age_of_money: month.age_of_money ?? null,
                income: month.income / 1000,
                budgeted: month.budgeted / 1000,
                activity: month.activity / 1000,
                categories: categories
            };

            return result;

        } catch (error: unknown) {
            logger.error(`Error getting month detail:`);
            logger.error(JSON.stringify(error, null, 2));
            return `ERROR getting month detail: ${JSON.stringify(error)}`;
        }
    }
}

export default GetMonthDetailTool;