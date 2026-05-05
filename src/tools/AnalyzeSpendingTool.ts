import { logger } from "mcp-framework";
import { SerializingMCPTool, handleToolError } from "./base/SerializingMCPTool.js";
import * as ynab from "ynab";
import { z } from "zod";
import { Cache } from "../utils/Cache.js";
import { clampSinceDateToMaxHistory } from "../utils/dateRangeLimit.js";

/**
 * AnalyzeSpendingResult - Return type for spending analysis
 */
interface AnalyzeSpendingResult {
  period: {
    from: string;
    to: string;
    months_back: number;
    max_days: number;
    requested_months_back: number;
  };
  total_spending: number;
  category_breakdown: Array<{
    category: string;
    total: number;
    transaction_count: number;
    category_id: string | null;
  }>;
  conversational_summary: string;
}

interface AnalyzeSpendingInput {
    budgetId?: string;
    monthsBack?: string | number;
}

/**
 * AnalyzeSpendingTool - Analyze spending patterns by category
 *
 * WHEN TO USE:
 * - User asks: "Where did my money go?", "Show my spending by category", "What did I spend on groceries?"
 * - User wants: Spending breakdown, category analysis, budget review
 * - User is: Analyzing spending patterns, finding problem areas, auditing expenses
 *
 * WORKFLOW:
 * 1. Optional: Call list_budgets() if user hasn't specified a budget
 * 2. Call this tool with monthsBack parameter (1-12 recommended)
 * 3. Tool analyzes transactions grouped by category
 * 4. Returns: Total spending + top categories ranked by amount
 *
 * COMMON CLAUDE PATTERNS:
 * User: "Show me my spending" → analyze_spending_by_category(monthsBack=1)
 * User: "Where did I spend most?" → analyze_spending_by_category() → identify largest category
 * User: "Was I over budget on groceries?" → budget_summary() + analyze_spending_by_category()
 *
 * IMPORTANT:
 * - Analyzes expenses only (not income)
 * - Excludes transfers between accounts
 * - Groups split transactions by their subtransaction categories
 * - Results cached for 5 minutes
 */
class AnalyzeSpendingTool extends SerializingMCPTool<AnalyzeSpendingInput> {
    name = "analyze_spending_by_category";
    description = "WORKING: Analyze your spending patterns by category over a specified time period. Shows total spending and breaks down spending by each category ranked from highest to lowest. Perfect for understanding where your money goes.";

    schema = z.object({
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to env var). Get from list_budgets() if needed."),
  monthsBack: z.string().optional().default("1").describe("Number of months to analyze (default: 1). Range: 1-12 months. Higher values take longer to analyze."),
});

    private api: ynab.API;
    private budgetId: string;

    constructor() {
        super();
        this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
        this.budgetId = process.env.YNAB_BUDGET_ID || "";
    }

    protected async executeInternal(input: AnalyzeSpendingInput): Promise<AnalyzeSpendingResult | string> {
        const budgetId = input.budgetId || this.budgetId;
        // Convert monthsBack to number if it's a string
        const requestedMonthsBack = typeof input.monthsBack === 'string' ? parseInt(input.monthsBack, 10) : (input.monthsBack ?? 1);
        const requestedStartDate = new Date();
        requestedStartDate.setMonth(requestedStartDate.getMonth() - requestedMonthsBack);
        const cappedRange = clampSinceDateToMaxHistory(requestedStartDate.toISOString().split('T')[0]);
        const monthsBack = Math.max(1, Math.min(requestedMonthsBack, Math.ceil(cappedRange.maxDays / 30)));

        if (!process.env.YNAB_API_TOKEN) {
            return "ERROR: YNAB API Token is not set. Please set YNAB_API_TOKEN environment variable.";
        }

        if (!budgetId) {
            return "ERROR: No budget ID provided. Call list_budgets() first to get a budget ID, then try again.";
        }

        const cacheKey = `analyze_spending:${budgetId}:${cappedRange.sinceDate}`;
        const cachedResults = Cache.getInstance().get(cacheKey);
        if (cachedResults) {
            logger.info(`Returning cached analysis for ${cacheKey}`);
            return cachedResults;
        }

        try {
            logger.info(`Analyzing spending for budget ${budgetId}, capped to ${cappedRange.maxDays} days`);
            const startDateStr = cappedRange.sinceDate;

            // Fetch transactions
            const transactionsResponse = await this.api.transactions.getTransactions(
                budgetId,
                startDateStr
            );

            const transactions = transactionsResponse.data.transactions;

            // Filter for spending (outflows and not transfers)
            // YNAB amounts are in milliunits, negative is outflow
            const spendingTransactions = transactions.filter(t =>
                t.amount < 0 &&
                !t.transfer_account_id && // Exclude transfers
                !t.deleted
            );

            // Group by category
            const categoryMap = new Map<string, { total: number, count: number, id: string | null }>();

            for (const t of spendingTransactions) {
                if (t.subtransactions && t.subtransactions.length > 0) {
                    // Handle split transactions by processing subtransactions
                    for (const sub of t.subtransactions) {
                        if (sub.deleted) continue;

                        const categoryName = sub.category_name || "Uncategorized";
                        const categoryId = sub.category_id || null;
                        const amount = Math.abs(sub.amount) / 1000;

                        const current = categoryMap.get(categoryName) || { total: 0, count: 0, id: categoryId };
                        categoryMap.set(categoryName, {
                            total: current.total + amount,
                            count: current.count + 1,
                            id: categoryId
                        });
                    }
                } else {
                    // Regular transaction
                    const categoryName = t.category_name || "Uncategorized";
                    const categoryId = t.category_id || null;
                    const amount = Math.abs(t.amount) / 1000;

                    const current = categoryMap.get(categoryName) || { total: 0, count: 0, id: categoryId };
                    categoryMap.set(categoryName, {
                        total: current.total + amount,
                        count: current.count + 1,
                        id: categoryId
                    });
                }
            }

            // Convert to array and sort
            const results = Array.from(categoryMap.entries()).map(([name, data]) => ({
                category: name,
                total: parseFloat(data.total.toFixed(2)),
                transaction_count: data.count,
                category_id: data.id
            })).sort((a, b) => b.total - a.total);

            const totalSpending = results.reduce((sum, r) => sum + r.total, 0);

            const summary: AnalyzeSpendingResult = {
                period: {
                    from: startDateStr,
                    to: new Date().toISOString().split('T')[0],
                    months_back: monthsBack,
                    max_days: cappedRange.maxDays,
                    requested_months_back: requestedMonthsBack
                },
                total_spending: parseFloat(totalSpending.toFixed(2)),
                category_breakdown: results,
                conversational_summary: `Since ${startDateStr}, you spent a total of $${totalSpending.toFixed(2)} across ${spendingTransactions.length} transactions. Your top spending category was "${results[0]?.category || 'N/A'}" at $${results[0]?.total.toFixed(2) || '0.00'}.`
            };

            Cache.getInstance().set(cacheKey, summary);
            return summary;

        } catch (error: unknown) {
            logger.error(`Error analyzing spending: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);
            logger.error(`Error type: ${typeof error}`);
            logger.error(`Error constructor: ${error?.constructor?.name}`);
            try {
                const errorStr = JSON.stringify(error, null, 2);
                logger.error(`Error JSON: ${errorStr}`);
                return `ERROR analyzing spending: ${errorStr}`;
            } catch (stringifyError) {
                logger.error(`Failed to stringify error: ${stringifyError}`);
                return `ERROR analyzing spending: ${String(error)}`;
            }
        }
    }
}

export default AnalyzeSpendingTool;
