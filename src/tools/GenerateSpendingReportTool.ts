import { logger } from "mcp-framework";
import { SerializingMCPTool, handleToolError } from "./base/SerializingMCPTool.js";
import * as ynab from "ynab";
import { z } from "zod";
import { Cache } from "../utils/Cache.js";
import { clampSinceDateToMaxHistory } from "../utils/dateRangeLimit.js";

/**
 * MonthlyReport - Individual month in spending report
 */
interface MonthlyReport {
  month: string;
  income: number;
  expenses: number;
  net: number;
}

/**
 * GenerateSpendingReportResult - Return type for spending report
 */
interface GenerateSpendingReportResult {
  parameters: {
    budgetId: string;
    monthsBack: number;
    requestedMonthsBack: number;
    maxDays: number;
    from: string;
  };
  monthly_report: MonthlyReport[];
  totals: {
    income: number;
    expenses: number;
    net: number;
  };
  conversational_summary: string;
}

interface SpendingReportInput {
    budgetId?: string;
    monthsBack?: string | number;
}

/**
 * GenerateSpendingReportTool - Generate comprehensive income/expense report
 *
 * WHEN TO USE:
 * - User asks: "Show me my income and expenses", "Monthly spending report", "How much did I earn and spend?"
 * - User wants: Income/expense breakdown, monthly trends, financial overview
 * - User is: Tracking finances, monthly review, budget analysis, forecasting
 *
 * WORKFLOW:
 * 1. Optional: Call list_budgets() if user hasn't specified a budget
 * 2. Call this tool with monthsBack parameter (1-12 typical)
 * 3. Tool fetches transactions for period and groups by month
 * 4. Separates income (positive amounts) from expenses (negative amounts)
 * 5. Returns: Monthly breakdown + totals + summary
 *
 * COMMON CLAUDE PATTERNS:
 * User: "Monthly report" → generate_spending_report(monthsBack=6)
 * User: "How much did I earn?" → generate_spending_report() → report.totals.income
 * User: "Annual spending" → generate_spending_report(monthsBack=12)
 *
 * IMPORTANT:
 * - Separates income (inflows) and expenses (outflows)
 * - Excludes transfers between accounts
 * - Grouped by calendar month (YYYY-MM)
 * - Results show average if requesting many months
 * - Results cached for 10 minutes
 */
class GenerateSpendingReportTool extends SerializingMCPTool<SpendingReportInput> {
    name = "generate_spending_report";
    description = "WORKING: Generate a comprehensive income and expense report over a specified time period. Shows monthly breakdown of income, expenses, and net balance. Perfect for financial planning and understanding your financial trends.";

    schema = z.object({
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to env var). Get from list_budgets() if needed."),
  monthsBack: z.string().optional().default("6").describe("Number of months to analyze (default: 6). Range: 1-24 months. Higher values take longer to analyze."),
});

    private api: ynab.API;
    private budgetId: string;

    constructor() {
        super();
        this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
        this.budgetId = process.env.YNAB_BUDGET_ID || "";
    }

    protected async executeInternal(input: SpendingReportInput): Promise<GenerateSpendingReportResult | string> {
        const budgetId = input.budgetId || this.budgetId;
        // Convert monthsBack to number if it's a string
        const requestedMonthsBack = typeof input.monthsBack === 'string' ? parseInt(input.monthsBack, 10) : (input.monthsBack ?? 6);
        const requestedStartDate = new Date();
        requestedStartDate.setMonth(requestedStartDate.getMonth() - requestedMonthsBack);
        requestedStartDate.setDate(1);
        const cappedRange = clampSinceDateToMaxHistory(requestedStartDate.toISOString().split('T')[0]);
        const monthsBack = Math.max(1, Math.min(requestedMonthsBack, Math.ceil(cappedRange.maxDays / 30)));

        if (!process.env.YNAB_API_TOKEN) {
            return "ERROR: YNAB API Token is not set. Please set YNAB_API_TOKEN environment variable.";
        }

        if (!budgetId) {
            return "ERROR: No budget ID provided. Call list_budgets() first to get a budget ID, then try again.";
        }

        const cacheKey = `spending_report:${budgetId}:${cappedRange.sinceDate}`;
        const cachedResults = Cache.getInstance().get(cacheKey);
        if (cachedResults) {
            logger.info(`Returning cached report for ${cacheKey}`);
            return cachedResults;
        }

        try {
            logger.info(`Generating spending report for budget ${budgetId}, capped to ${cappedRange.maxDays} days`);
            const startDateStr = cappedRange.sinceDate;

            const transactionsResponse = await this.api.transactions.getTransactions(
                budgetId,
                startDateStr
            );

            const transactions = transactionsResponse.data.transactions;

            const monthlyStats = new Map<string, { income: number, expenses: number, net: number }>();

            for (const t of transactions) {
                if (t.deleted || t.transfer_account_id) continue;

                const month = t.date.substring(0, 7); // YYYY-MM
                const amount = t.amount / 1000;

                const current = monthlyStats.get(month) || { income: 0, expenses: 0, net: 0 };

                if (amount > 0) {
                    current.income += amount;
                } else {
                    current.expenses += Math.abs(amount);
                }
                current.net += amount;

                monthlyStats.set(month, current);
            }

            const report = Array.from(monthlyStats.entries()).map(([month, stats]) => ({
                month,
                income: parseFloat(stats.income.toFixed(2)),
                expenses: parseFloat(stats.expenses.toFixed(2)),
                net: parseFloat(stats.net.toFixed(2))
            })).sort((a, b) => a.month.localeCompare(b.month));

            const totalIncome = report.reduce((sum, r) => sum + r.income, 0);
            const totalExpenses = report.reduce((sum, r) => sum + r.expenses, 0);

            const result: GenerateSpendingReportResult = {
                parameters: {
                    budgetId,
                    monthsBack,
                    requestedMonthsBack,
                    maxDays: cappedRange.maxDays,
                    from: startDateStr
                },
                monthly_report: report,
                totals: {
                    income: parseFloat(totalIncome.toFixed(2)),
                    expenses: parseFloat(totalExpenses.toFixed(2)),
                    net: parseFloat((totalIncome - totalExpenses).toFixed(2))
                },
                conversational_summary: `Since ${startDateStr}, your average monthly income was $${(totalIncome / Math.max(report.length, 1)).toFixed(2)} and average monthly expenses were $${(totalExpenses / Math.max(report.length, 1)).toFixed(2)}.`
            };

            Cache.getInstance().set(cacheKey, result);
            return result;

        } catch (error: unknown) {
            logger.error(`Error generating spending report: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);
            logger.error(`Error type: ${typeof error}`);
            logger.error(`Error constructor: ${error?.constructor?.name}`);
            try {
                const errorStr = JSON.stringify(error, null, 2);
                logger.error(`Error JSON: ${errorStr}`);
                return `ERROR generating spending report: ${errorStr}`;
            } catch (stringifyError) {
                logger.error(`Failed to stringify error: ${stringifyError}`);
                return `ERROR generating spending report: ${String(error)}`;
            }
        }
    }
}

export default GenerateSpendingReportTool;
