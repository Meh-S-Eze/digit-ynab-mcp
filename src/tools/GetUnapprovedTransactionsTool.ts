import { logger } from "mcp-framework";
import { SerializingMCPTool, handleToolError } from "./base/SerializingMCPTool.js";
import * as ynab from "ynab";
import { z } from "zod";
import { clampSinceDateToMaxHistory } from "../utils/dateRangeLimit.js";

interface GetUnapprovedTransactionsInput {
  budgetId?: string;
}

interface UnapprovedTransaction {
  id: string;
  date: string;
  amount: string; // String with 2 decimal places for clarity
  payee_name: string | null;
  account_name: string;
  category_name: string | null;
  memo: string | null;
  approved: boolean;
  import_id: string | null;
}

interface GetUnapprovedTransactionsResult {
  transactions: UnapprovedTransaction[];
  transaction_count: number;
  history_cap: {
    max_days: number;
    effective_from_date: string;
  };
}

/**
 * Discover all unapproved (pending) transactions in a budget.
 *
 * Use this when the user says:
 * - "Show me pending transactions"
 * - "What do I need to approve?"
 * - "List transactions waiting for approval"
 *
 * After reviewing with the user, use approve_transaction to mark
 * individual transactions as approved.
 *
 * Returns transactions with IDs so you can approve them.
 */
class GetUnapprovedTransactionsTool extends SerializingMCPTool<GetUnapprovedTransactionsInput> {
  name = "get_unapproved_transactions";
  description =
    "Fetch all unapproved (pending) transactions in a budget. Use this to discover transactions needing approval, then use approve_transaction to approve individual items.";

  schema = z.object({
  budgetId: z.string().optional().describe("The ID of the budget to fetch transactions for (optional, defaults to YNAB_BUDGET_ID env var). Get this from list_budgets."),
});

  private api: ynab.API;
  private budgetId: string;

  constructor() {
    super();
    this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
    this.budgetId = process.env.YNAB_BUDGET_ID || "";
  }

  protected async executeInternal(
    input: GetUnapprovedTransactionsInput
  ): Promise<GetUnapprovedTransactionsResult | string> {
    const budgetId = input.budgetId || this.budgetId;

    if (!budgetId) {
      return "No budget ID provided. Please provide a budget ID or set the YNAB_BUDGET_ID environment variable. Use the list_budgets tool to get a list of available budgets.";
    }

    try {
      logger.info(`Getting unapproved transactions for budget ${budgetId}`);
      const cappedRange = clampSinceDateToMaxHistory();

      const response = await this.api.transactions.getTransactions(
        budgetId,
        cappedRange.sinceDate,
        ynab.GetTransactionsTypeEnum.Unapproved
      );

      // Transform the transactions to a more readable format
      const transactions = this.transformTransactions(
        response.data.transactions
      );

      return {
        transactions,
        transaction_count: transactions.length,
        history_cap: {
          max_days: cappedRange.maxDays,
          effective_from_date: cappedRange.sinceDate,
        },
      };
    } catch (error) {
      logger.error(
        `Error getting unapproved transactions for budget ${budgetId}:`
      );
      logger.error(JSON.stringify(error, null, 2));
      return `Error getting unapproved transactions: ${
        error instanceof Error ? error.message : JSON.stringify(error)
      }`;
    }
  }

  private transformTransactions(
    transactions: ynab.TransactionDetail[]
  ): UnapprovedTransaction[] {
    return transactions
      .filter((transaction) => !transaction.deleted)
      .map((transaction) => ({
        id: transaction.id,
        date: transaction.date,
        amount: (transaction.amount / 1000).toFixed(2), // Convert milliunits to actual currency with 2 decimals
        payee_name: transaction.payee_name || null,
        account_name: transaction.account_name,
        category_name: transaction.category_name || null,
        memo: transaction.memo || null,
        approved: transaction.approved,
        import_id: transaction.import_id || null,
      }));
  }
}

export default GetUnapprovedTransactionsTool;
