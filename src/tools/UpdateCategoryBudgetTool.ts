import { SerializingMCPTool, handleToolError } from "./base/SerializingMCPTool.js";
import { logger } from "mcp-framework";
import * as ynab from "ynab";
import { z } from "zod";

interface UpdateCategoryBudgetInput {
    budgetId?: string;
    month: string;
    categoryId: string;
    budgeted: number;
}

/**
 * UpdateCategoryBudgetTool - Adjust category budgets for allocation
 *
 * WHEN TO USE:
 * - User asks: "Allocate $100 to groceries", "Move money to savings", "Increase food budget"
 * - User wants: Reallocate budget, adjust category amounts, fund categories
 * - User is: Planning budget, managing allocations, zero-based budgeting
 *
 * WORKFLOW:
 * 1. MUST HAVE: month (ISO format, e.g., '2025-01-01')
 * 2. MUST HAVE: categoryId (get from get_month_detail())
 * 3. MUST HAVE: budgeted amount (positive dollars, e.g., 150.00)
 * 4. Call this tool to update category budget
 * 5. To move money, decrease one category and increase another
 * 6. Returns: Confirmation with new budget
 *
 * COMMON CLAUDE PATTERNS:
 * User: "Allocate $100 to groceries" → get_month_detail() → find categoryId → update_category_budget(budgeted=100)
 * User: "Move $50 to savings" → get_month_detail() → decrease one category → increase savings category
 * User: "Clear the to be budgeted" → get_month_detail() → systematically allocate to_be_budgeted amount
 *
 * ALLOCATION STRATEGY (YNAB Philosophy):
 * 1. Get to_be_budgeted amount from get_month_detail()
 * 2. Allocate it by category (give every dollar a job)
 * 3. Increase/decrease categories to match your plan
 * 4. Loop until to_be_budgeted = $0.00
 *
 * IMPORTANT:
 * - Set budgeted to the TOTAL for category (not an increment)
 * - E.g., if current is $100 and you want to add $50, set to $150 (not $50)
 * - Month must be ISO format (2025-01-01 = January)
 * - Month must be first day of month
 * - Setting to 0 removes the budget allocation
 * - This is how you "fund" categories and balance to_be_budgeted
 * - Real-time allocation per YNAB methodology
 */
class UpdateCategoryBudgetTool extends SerializingMCPTool<UpdateCategoryBudgetInput> {
    name = "update_category_budget";
    description = "WORKING: Update the budgeted amount for a specific category in a specific month. Use this to allocate funds, move money between categories (by lowering one and raising another), or to assign new funds. Follow YNAB methodology: get_month_detail() to see to_be_budgeted, then allocate.";

    schema = z.object({
        budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to env var). Get from list_budgets() if needed."),
        month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("REQUIRED: The budget month in ISO format (e.g., 2025-01-01). MUST be the first day of the month."),
        categoryId: z.string().describe("REQUIRED: The ID of the category to update. Get from get_month_detail()."),
        budgeted: z.number().describe("REQUIRED: The NEW total budgeted amount in dollars (e.g., 150.00 or 0). Set this as the TOTAL, not an increment. Positive values only."),
    });

    private api: ynab.API;
    private budgetId: string;

    constructor() {
        super();
        this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
        this.budgetId = process.env.YNAB_BUDGET_ID || "";
    }

    protected async executeInternal(input: UpdateCategoryBudgetInput) {
        const budgetId = input.budgetId || this.budgetId;

        if (!process.env.YNAB_API_TOKEN) {
            return handleToolError("YNAB API Token is not set. Please set YNAB_API_TOKEN environment variable.");
        }

        if (!budgetId) {
            return handleToolError("No budget ID provided. Call list_budgets() first.");
        }

        try {
            logger.info(`Updating category ${input.categoryId} budget to $${input.budgeted} for month ${input.month}`);

            // Convert dollars to milliunits
            const milliunits = Math.round(input.budgeted * 1000);

            const data: ynab.PatchMonthCategoryWrapper = {
                category: {
                    budgeted: milliunits,
                },
            };

            const response = await this.api.categories.updateMonthCategory(
                budgetId,
                input.month,
                input.categoryId,
                data
            );

            const category = response.data.category;

            return `Successfully updated category '${category.name}' budgeted amount to $${(category.budgeted / 1000).toFixed(2)} for ${input.month}.`;

        } catch (error: unknown) {
            logger.error(`Error updating category budget:`);
            logger.error(JSON.stringify(error, null, 2));
            return handleToolError(error, "updating category budget");
        }
    }
}

export default UpdateCategoryBudgetTool;