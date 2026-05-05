import { logger } from "mcp-framework";
import { SerializingMCPTool, handleToolError } from "./base/SerializingMCPTool.js";
import * as ynab from "ynab";
import { z } from "zod";
import { Cache } from "../utils/Cache.js";

/**
 * ScheduledTransactionData - Individual scheduled transaction details
 */
interface ScheduledTransactionData {
  id: string;
  date_first: string;
  date_next: string;
  frequency: string;
  amount: number;
  memo: string | null;
  account_name: string;
  payee_name: string | null;
  category_name: string | null;
}

/**
 * ListScheduledTransactionsResult - Return type for scheduled transactions list
 */
type ListScheduledTransactionsResult = ScheduledTransactionData[];

interface ListScheduledTransactionsInput {
    budgetId?: string;
    refresh?: boolean;
    memo?: string;
    payeeName?: string;
    accountName?: string;
    dateNext?: string;
    limit?: number;
}

/**
 * ListScheduledTransactionsTool - List all recurring transactions
 *
 * WHEN TO USE:
 * - User asks: "Show my recurring transactions", "What's my next bill?", "List subscriptions"
 * - User wants: Overview of scheduled payments, recurring income, subscriptions
 * - User is: Reviewing recurring bills, managing subscriptions, planning for future
 *
 * WORKFLOW:
 * 1. Optional: Call list_budgets() if user hasn't specified a budget
 * 2. Call this tool with budget ID
 * 3. Returns: All scheduled (recurring) transactions
 * 4. Can then use create_scheduled_transaction() to add more or delete_scheduled_transaction() to remove
 *
 * COMMON CLAUDE PATTERNS:
 * User: "Show scheduled transactions" → list_scheduled_transactions() → show list
 * User: "Cancel subscription for Netflix" → list_scheduled_transactions() → find Netflix → delete_scheduled_transaction()
 * User: "What's coming up?" → list_scheduled_transactions() → show upcoming by date_next
 * User: "How much recurring?" → list_scheduled_transactions() → sum all amounts
 *
 * COMMON PATTERNS IN RESPONSE:
 * - Sort by date_next (upcoming first)
 * - Sum by frequency to show recurring totals (e.g., $X/month)
 * - Identify high-value recurring items
 * - Find monthly vs annual recurring
 *
 * IMPORTANT:
 * - These are SCHEDULED/REMINDERS, not actual transactions
 * - Shows: first occurrence, next occurrence, frequency, amount
 * - Use delete_scheduled_transaction(id) to stop recurring
 * - Use create_scheduled_transaction() to add new recurring
 * - Results cached for 5 minutes
 * - Sorted by date_next (earliest first) is helpful for user
 */
class ListScheduledTransactionsTool extends SerializingMCPTool<ListScheduledTransactionsInput> {
    name = "list_scheduled_transactions";
    description = "WORKING: List all scheduled (recurring) transactions in your budget. Shows bills, subscriptions, and recurring income with their frequencies and next occurrence dates. Use to review upcoming payments or identify subscriptions to cancel.";

    schema = z.object({
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to env var). Get from list_budgets() if needed."),
  refresh: z.boolean().optional().describe("When true, bypass the cached scheduled-transaction list and fetch fresh data from YNAB."),
  memo: z.string().optional().describe("Optional memo substring filter for narrowing scheduled transactions."),
  payeeName: z.string().optional().describe("Optional payee-name substring filter for narrowing scheduled transactions."),
  accountName: z.string().optional().describe("Optional account-name substring filter for narrowing scheduled transactions."),
  dateNext: z.string().optional().describe("Optional next-occurrence date filter (YYYY-MM-DD)."),
  limit: z.number().int().positive().optional().describe("Optional maximum number of results to return after filtering."),
});

    private api: ynab.API;
    private budgetId: string;

    constructor() {
        super();
        this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
        this.budgetId = process.env.YNAB_BUDGET_ID || "";
    }

    protected async executeInternal(input: ListScheduledTransactionsInput): Promise<ListScheduledTransactionsResult | string> {
        const budgetId = input.budgetId || this.budgetId;
        const normalize = (value: string | null | undefined) =>
            typeof value === "string" ? value.trim().toLowerCase() : "";
        const normalizedMemo = normalize(input.memo);
        const normalizedPayeeName = normalize(input.payeeName);
        const normalizedAccountName = normalize(input.accountName);
        const requestedDateNext = input.dateNext?.trim() || "";
        const requestedLimit =
            input.limit && Number.isFinite(input.limit) && input.limit > 0 ? Math.trunc(input.limit) : null;

        if (!process.env.YNAB_API_TOKEN) {
            return "ERROR: YNAB API Token is not set. Please set YNAB_API_TOKEN environment variable.";
        }

        if (!budgetId) {
            return "ERROR: No budget ID provided. Call list_budgets() first.";
        }

        const cacheKey = JSON.stringify({
            kind: "scheduled_transactions",
            budgetId,
            memo: normalizedMemo || null,
            payeeName: normalizedPayeeName || null,
            accountName: normalizedAccountName || null,
            dateNext: requestedDateNext || null,
            limit: requestedLimit,
        });
        const shouldRefresh = Boolean(input.refresh);
        const cachedResults = shouldRefresh ? null : Cache.getInstance().get(cacheKey);
        if (cachedResults) {
            logger.info(`Returning cached scheduled transactions for ${cacheKey}`);
            return cachedResults;
        }

        try {
            logger.info(`Listing scheduled transactions for budget ${budgetId}`);
            const response = await this.api.scheduledTransactions.getScheduledTransactions(budgetId);
            const scheduledTransactions = response.data.scheduled_transactions;

            let result: ListScheduledTransactionsResult = scheduledTransactions
                .filter(t => !t.deleted)
                .map(t => ({
                    id: t.id,
                    date_first: t.date_first,
                    date_next: t.date_next,
                    frequency: t.frequency,
                    amount: t.amount / 1000,
                    memo: t.memo ?? null,
                    account_name: t.account_name,
                    payee_name: t.payee_name ?? null,
                    category_name: t.category_name || "Uncategorized"
                }))
                .sort((a, b) => a.date_next.localeCompare(b.date_next)); // Sort by next occurrence

            if (normalizedMemo) {
                result = result.filter((item) => normalize(item.memo).includes(normalizedMemo));
            }

            if (normalizedPayeeName) {
                result = result.filter((item) => normalize(item.payee_name).includes(normalizedPayeeName));
            }

            if (normalizedAccountName) {
                result = result.filter((item) => normalize(item.account_name).includes(normalizedAccountName));
            }

            if (requestedDateNext) {
                result = result.filter((item) => item.date_next === requestedDateNext);
            }

            if (requestedLimit) {
                result = result.slice(0, requestedLimit);
            }

            Cache.getInstance().set(cacheKey, result);
            return result;

        } catch (error: unknown) {
            logger.error(`Error listing scheduled transactions:`);
            logger.error(JSON.stringify(error, null, 2));
            return `ERROR listing scheduled transactions: ${JSON.stringify(error)}`;
        }
    }
}

export default ListScheduledTransactionsTool;