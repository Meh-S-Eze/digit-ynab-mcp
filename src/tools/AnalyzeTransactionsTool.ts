import { logger } from "mcp-framework";
import { SerializingMCPTool, handleToolError } from "./base/SerializingMCPTool.js";
import * as ynab from "ynab";
import { z } from "zod";
import { Cache } from "../utils/Cache.js";
import { clampSinceDateToMaxHistory } from "../utils/dateRangeLimit.js";

/**
 * TransactionRecord - Individual transaction in analysis result
 */
interface TransactionRecord {
  id: string;
  date: string;
  amount: number;
  memo: string | null;
  payee_name: string | null;
  category_name: string | null;
  account_name: string | null;
  cleared: string;
  approved: boolean;
  transfer_account_id: string | null;
  subtransactions: Array<{
    amount: number;
    category_name: string | null;
    memo: string | null;
  }>;
}

/**
 * AnalyzeTransactionsResult - Return type for transaction analysis
 */
interface AnalyzeTransactionsResult {
  summary: {
    total_found: number;
    showing: number;
    filters: {
      accountId?: string;
      categoryId?: string;
      fromDate?: string;
      toDate?: string;
    };
    history_cap: {
      max_days: number;
      applied: boolean;
      requested_from_date?: string;
      effective_from_date: string;
    };
  };
  transactions: TransactionRecord[];
}

interface AnalyzeTransactionsInput {
    budgetId?: string;
    accountId?: string;
    categoryId?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
}

/**
 * AnalyzeTransactionsTool - Comprehensive transaction search and analysis
 *
 * WHEN TO USE:
 * - User asks: "Show me my recent transactions", "What did I spend on X?", "Filter transactions from account Y"
 * - User wants: Transaction list, filtered search, account statement, category breakdown
 * - User is: Reviewing transactions, finding a specific transaction, auditing an account
 *
 * WORKFLOW:
 * 1. Optional: Call list_accounts() or get_month_detail() for account/category IDs
 * 2. Call this tool with filters (accountId, categoryId, date range, limit)
 * 3. Tool filters and sorts by date (most recent first)
 * 4. Returns: Matching transactions with full details
 *
 * COMMON CLAUDE PATTERNS:
 * User: "Show recent transactions" → analyze_transactions(limit=20)
 * User: "Show checking account transactions" → analyze_transactions(accountId=<id>)
 * User: "Show groceries spending" → analyze_transactions(categoryId=<id>, limit=50)
 * User: "Transactions from Jan 1 to Jan 31" → analyze_transactions(fromDate=2025-01-01, toDate=2025-01-31)
 *
 * IMPORTANT:
 * - Returns up to limit transactions (default 50, max recommended 100)
 * - Sorted by date descending (newest first)
 * - If both accountId and categoryId provided, accountId prioritized
 * - Splits subtransactions into separate line items
 * - Results cached for 5 minutes
 */
class AnalyzeTransactionsTool extends SerializingMCPTool<AnalyzeTransactionsInput> {
    name = "analyze_transactions";
    description = "WORKING: Search and analyze transactions with powerful filtering. Filter by account, category, and date range. Returns detailed transaction information including payee, amount, category, and memo. Perfect for finding specific transactions or analyzing spending patterns.";

    schema = z.object({
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to env var). Get from list_budgets() if needed."),
  accountId: z.string().optional().describe("Filter by specific account UUID. Get from list_accounts()."),
  categoryId: z.string().optional().describe("Filter by specific category UUID. Get from get_month_detail() for category IDs."),
  fromDate: z.string().optional().describe("Start date filter (YYYY-MM-DD). Include transactions from this date forward."),
  toDate: z.string().optional().describe("End date filter (YYYY-MM-DD). Only include transactions up to this date."),
  limit: z.coerce.number().optional().default(50).describe("Limit the number of transactions returned (default: 50, max: 100). Recommended: 20-50 for clarity."),
});

    private api: ynab.API;
    private budgetId: string;

    constructor() {
        super();
        this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
        this.budgetId = process.env.YNAB_BUDGET_ID || "";
    }

    protected async executeInternal(input: AnalyzeTransactionsInput): Promise<AnalyzeTransactionsResult | string> {
        const budgetId = input.budgetId || this.budgetId;

        if (!process.env.YNAB_API_TOKEN) {
            return "ERROR: YNAB API Token is not set. Please set YNAB_API_TOKEN environment variable.";
        }

        if (!budgetId) {
            return "ERROR: No budget ID provided. Call list_budgets() first to get a budget ID, then try again.";
        }

        const cappedRange = clampSinceDateToMaxHistory(input.fromDate);
        const effectiveFromDate = cappedRange.sinceDate;
        const cacheKey = `analyze_transactions:${budgetId}:${input.accountId || 'all'}:${input.categoryId || 'all'}:${effectiveFromDate}:${input.toDate || 'any'}:${input.limit || 50}`;
        const cachedResults = Cache.getInstance().get(cacheKey);
        if (cachedResults) {
            logger.info(`Returning cached analysis for ${cacheKey}`);
            return cachedResults;
        }

        try {
            logger.info(`Analyzing transactions for budget ${budgetId}`);

            // If we have an accountId, it's more efficient to use getTransactionsByAccount
            let transactions: any[];

            if (input.accountId) {
                const response = await this.api.transactions.getTransactionsByAccount(
                    budgetId,
                    input.accountId,
                    effectiveFromDate
                );
                transactions = response.data.transactions;
            } else if (input.categoryId) {
                const response = await this.api.transactions.getTransactionsByCategory(
                    budgetId,
                    input.categoryId,
                    effectiveFromDate
                );
                transactions = response.data.transactions;
            } else {
                const response = await this.api.transactions.getTransactions(
                    budgetId,
                    effectiveFromDate
                );
                transactions = response.data.transactions;
            }

            // Further filter in memory for category (if not used above) and toDate
            let filtered = transactions.filter(t => !t.deleted);

            if (input.categoryId && input.accountId) {
                // If both provided, the API call above only handled one. Filter the other here.
                // Note: The logic above prioritized accountId if both provided.
                filtered = filtered.filter(t => t.category_id === input.categoryId);
            }

            if (input.toDate) {
                filtered = filtered.filter(t => t.date <= input.toDate!);
            }

            // Sort by date descending
            filtered.sort((a, b) => b.date.localeCompare(a.date));

            const totalCount = filtered.length;
            const limitedResults = filtered.slice(0, input.limit || 50);

            const result: AnalyzeTransactionsResult = {
                summary: {
                    total_found: totalCount,
                    showing: limitedResults.length,
                    filters: {
                        accountId: input.accountId,
                        categoryId: input.categoryId,
                        fromDate: effectiveFromDate,
                        toDate: input.toDate
                    },
                    history_cap: {
                        max_days: cappedRange.maxDays,
                        applied: cappedRange.wasCapped || !input.fromDate,
                        requested_from_date: input.fromDate,
                        effective_from_date: effectiveFromDate
                    }
                },
                transactions: limitedResults.map(t => ({
                    id: t.id,
                    date: t.date,
                    amount: t.amount / 1000,
                    memo: t.memo,
                    payee_name: t.payee_name,
                    category_name: t.category_name,
                    account_name: t.account_name,
                    cleared: t.cleared,
                    approved: t.approved,
                    transfer_account_id: t.transfer_account_id,
                    subtransactions: t.subtransactions ? t.subtransactions.map((s: any) => ({
                        amount: s.amount / 1000,
                        category_name: s.category_name,
                        memo: s.memo
                    })) : []
                }))
            };

            Cache.getInstance().set(cacheKey, result);
            return result;

        } catch (error: unknown) {
            logger.error(`Error analyzing transactions:`);
            logger.error(JSON.stringify(error, null, 2));
            return `ERROR analyzing transactions: ${JSON.stringify(error)}`;
        }
    }
}

export default AnalyzeTransactionsTool;
