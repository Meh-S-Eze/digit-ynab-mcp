import { SerializingMCPTool, handleToolError } from "./base/SerializingMCPTool.js";
import { logger } from "mcp-framework";
import * as ynab from "ynab";
import { z } from "zod";

/**
 * UpdateTransactionResult - Return type for transaction update
 */
interface UpdateTransactionResult {
  id: string;
  date: string;
  amount: number;
  payee_name: string | null;
  category_name: string | null;
  memo: string | null;
  cleared: string;
  approved: boolean;
}

interface TransactionUpdateInput {
  accountId?: string;
  date?: string;
  amount?: number;
  payeeName?: string | null;
  payeeId?: string | null;
  categoryId?: string | null;
  memo?: string | null;
  cleared?: "cleared" | "uncleared" | "reconciled";
  approved?: boolean;
  flagColor?: string | null;
}

interface UpdateSingleTransactionInput {
  budgetId: string;
  transactionId: string;
  accountId?: string;
  date?: string;
  amount?: number;
  payeeName?: string | null;
  payeeId?: string | null;
  categoryId?: string | null;
  memo?: string | null;
  cleared?: "cleared" | "uncleared" | "reconciled";
  approved?: boolean;
  flagColor?: string | null;
}

/**
 * UpdateSingleTransactionTool - Update an existing transaction
 *
 * WHEN TO USE:
 * - User asks: "Change the amount to X", "Fix this transaction", "Update payee to Y"
 * - User wants: Correct amount, change category, update date, fix memo
 * - User is: Fixing a mistake, recategorizing, reconciling, changing details
 *
 * WORKFLOW:
 * 1. MUST HAVE: transactionId (get from analyze_transactions())
 * 2. MUST HAVE: budgetId (get from list_budgets())
 * 3. MUST HAVE: At least one field to update (amount, category, date, etc.)
 * 4. Call this tool with transaction ID and field(s) to change
 * 5. Returns: Updated transaction details
 *
 * COMMON CLAUDE PATTERNS:
 * User: "Fix transaction to $50" → analyze_transactions() → update_single_transaction(transactionId, amount=50)
 * User: "Wrong category" → analyze_transactions() → get_month_detail() → update_single_transaction(categoryId=<new>)
 * User: "Mark as cleared" → clear_transaction() (simpler than this)
 *
 * IMPORTANT:
 * - Must specify BOTH budgetId AND transactionId
 * - Can update: amount, date, payee, category, memo, cleared status, approved status
 * - Negative amounts = expenses, positive = income
 * - Setting categoryId to empty string removes category
 * - This updates ONE transaction only; use update_multiple_transactions for bulk changes
 */
class UpdateSingleTransactionTool extends SerializingMCPTool<UpdateSingleTransactionInput> {
  name = "update_single_transaction";
  description = "WORKING: Update a single existing transaction. Change amount, date, payee, category, memo, or cleared status. Must provide budgetId, transactionId, and at least one field to update.";

  schema = z.object({
    budgetId: z
      .string()
      .describe(
        "REQUIRED: The ID of the budget containing this transaction. Get from list_budgets()."
      ),
    transactionId: z
      .string()
      .describe(
        "REQUIRED: The ID of the transaction to update. Get from analyze_transactions()."
      ),
    accountId: z
      .string()
      .optional()
      .describe(
        "Update the account this transaction belongs to. Get from list_accounts()."
      ),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Update the transaction date in YYYY-MM-DD format."),
    amount: z
      .number()
      .optional()
      .describe(
        "Update the amount in dollars. Negative = expense (e.g., -10.99), Positive = income (e.g., 1000.00)."
      ),
    payeeName: z
      .string()
      .nullable()
      .optional()
      .describe("Update the payee name. YNAB auto-creates if doesn't exist."),
    payeeId: z
      .string()
      .nullable()
      .optional()
      .describe(
        "Update by payee ID. Get from get_payees() or analyze_transactions()."
      ),
    categoryId: z
      .string()
      .nullable()
      .optional()
      .describe(
        "Update the category. Get from get_month_detail(). Use empty string to remove category."
      ),
    memo: z
      .string()
      .nullable()
      .optional()
      .describe("Update the memo/note for the transaction."),
    cleared: z
      .enum(["cleared", "uncleared", "reconciled"])
      .optional()
      .describe(
        "Update the cleared status: 'cleared', 'uncleared', or 'reconciled'."
      ),
    approved: z
      .boolean()
      .optional()
      .describe(
        "Update whether transaction is approved. Use approve_transaction() for easier approval."
      ),
    flagColor: z
      .string()
      .nullable()
      .optional()
      .describe(
        "Update the flag color (e.g., 'red', 'orange', 'yellow', 'green', 'blue', 'purple')."
      ),
  });

  private api: ynab.API;

  constructor() {
    super();
    this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
  }

  protected async executeInternal(input: UpdateSingleTransactionInput) {
    if (!process.env.YNAB_API_TOKEN) {
      return handleToolError("YNAB API Token is not set. Please set YNAB_API_TOKEN environment variable.");
    }

    if (!input.budgetId) {
      return handleToolError("Budget ID is required. Get from list_budgets() first.");
    }

    if (!input.transactionId) {
      return handleToolError("Transaction ID is required. Get from analyze_transactions() first.");
    }

    // Check if at least one update field is provided
    const hasUpdateFields = input.accountId || input.date || input.amount !== undefined ||
                           input.payeeName !== undefined || input.payeeId !== undefined ||
                           input.categoryId !== undefined || input.memo !== undefined ||
                           input.cleared || input.approved !== undefined || input.flagColor !== undefined;

    if (!hasUpdateFields) {
      return handleToolError("At least one field to update is required. Specify amount, category, date, payee, memo, or cleared status.");
    }

    try {
      logger.info(`Updating transaction ${input.transactionId} for budget ${input.budgetId}`);

      // Transform the input transaction to match YNAB API format
      const transformedTransaction: ynab.ExistingTransaction = {};

      // Set updateable fields (only if provided)
      if (input.accountId) transformedTransaction.account_id = input.accountId;
      if (input.date) transformedTransaction.date = input.date;
      if (input.amount !== undefined) transformedTransaction.amount = Math.round(input.amount * 1000); // Convert to milliunits
      if (input.payeeName !== undefined) transformedTransaction.payee_name = input.payeeName;
      if (input.payeeId !== undefined) transformedTransaction.payee_id = input.payeeId;
      // Only set category_id if it's a valid non-empty string (YNAB rejects null/empty category IDs)
      if (input.categoryId !== undefined && input.categoryId !== null && input.categoryId !== '') {
        transformedTransaction.category_id = input.categoryId;
      }
      if (input.memo !== undefined) transformedTransaction.memo = input.memo;
      if (input.cleared) transformedTransaction.cleared = input.cleared;
      if (input.approved !== undefined) transformedTransaction.approved = input.approved;
      if (input.flagColor !== undefined) transformedTransaction.flag_color = input.flagColor as ynab.TransactionFlagColor;

      const data: ynab.PutTransactionWrapper = {
        transaction: transformedTransaction,
      };

      const response = await this.api.transactions.updateTransaction(input.budgetId, input.transactionId, data);

      logger.info(`Successfully updated transaction ${input.transactionId}`);

      const updatedTransaction = response.data.transaction;
      return {
        id: updatedTransaction.id,
        date: updatedTransaction.date,
        amount: updatedTransaction.amount / 1000,
        payee_name: updatedTransaction.payee_name || null,
        category_name: updatedTransaction.category_name || null,
        memo: updatedTransaction.memo || null,
        cleared: updatedTransaction.cleared,
        approved: updatedTransaction.approved,
      };
    } catch (error: unknown) {
      logger.error(`Error updating transaction ${input.transactionId} for budget ${input.budgetId}:`);
      logger.error(JSON.stringify(error, null, 2));
      return handleToolError(error, `updating transaction ${input.transactionId}`);
    }
  }
}

export default UpdateSingleTransactionTool;