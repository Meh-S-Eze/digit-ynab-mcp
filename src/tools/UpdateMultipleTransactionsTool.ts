import { logger } from "mcp-framework";
import { SerializingMCPTool, handleToolError } from "./base/SerializingMCPTool.js";
import * as ynab from "ynab";
import { z } from "zod";

/**
 * UpdateMultipleResult - Return type for bulk update
 */
interface UpdateMultipleResult {
  total_requested: number;
  total_updated: number;
  duplicates_found: number;
  transaction_ids: string[];
}

interface TransactionUpdateInput {
  id?: string | null;
  importId?: string | null;
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

interface UpdateMultipleTransactionsInput {
  budgetId: string;
  transactions: TransactionUpdateInput[];
}

/**
 * UpdateMultipleTransactionsTool - Bulk update multiple transactions
 *
 * WHEN TO USE:
 * - User asks: "Approve all pending", "Categorize bulk transactions", "Fix multiple transactions"
 * - User wants: Bulk recategorization, batch approval, mass corrections
 * - User is: Processing imports, reconciling, categorizing uploads
 *
 * WORKFLOW:
 * 1. MUST HAVE: budgetId (get from list_budgets())
 * 2. Get transaction IDs from analyze_transactions()
 * 3. Create array with ID + fields to update for each
 * 4. Call this tool with array
 * 5. Returns: Number updated, any duplicates detected
 *
 * COMMON CLAUDE PATTERNS:
 * User: "Approve all" → get_unapproved_transactions() → update_multiple_transactions(approved=true)
 * User: "Categorize these 5" → analyze_transactions() → update_multiple_transactions(categoryId=<id>)
 * User: "Clear all from checking" → analyze_transactions(accountId=<>) → update_multiple_transactions(cleared='cleared')
 *
 * IMPORTANT:
 * - More efficient than individual updates for 3+ transactions
 * - Each transaction MUST have either 'id' OR 'importId' (not both, not neither)
 * - Can update same field on all, or different fields per transaction
 * - Duplicate importIds detected and reported
 * - Returns list of successfully updated transaction IDs
 * - Single API call for the whole batch
 */
class UpdateMultipleTransactionsTool extends SerializingMCPTool<UpdateMultipleTransactionsInput> {
  name = "update_multiple_transactions";
  description = "WORKING: Update multiple transactions at once (bulk update). More efficient than individual updates for 3+ transactions. Each transaction must have either 'id' or 'importId'. Can update different fields for each transaction or the same field for all.";

  schema = z.object({
  budgetId: z.string().describe("REQUIRED: The ID of the budget containing these transactions. Get from list_budgets()."),
  transactions: z.array(z.object({
        id: z.string().nullable().optional(),
        importId: z.string().nullable().optional(),
        accountId: z.string().optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        amount: z.number().optional().describe("The amount in dollars. Negative = expense, Positive = income"),
        payeeName: z.string().nullable().optional(),
        payeeId: z.string().nullable().optional(),
        categoryId: z.string().nullable().optional(),
        memo: z.string().nullable().optional(),
        cleared: z.enum(["cleared", "uncleared", "reconciled"]).optional(),
        approved: z.boolean().optional(),
        flagColor: z.string().nullable().optional(),
      }).refine((data) => {
        // Either id OR importId must be provided, but not both
        const hasId = data.id && data.id !== null;
        const hasImportId = data.importId && data.importId !== null;
        return (hasId && !hasImportId) || (!hasId && hasImportId);
      }, {
        message: "Each transaction must have either 'id' OR 'importId', but not both",
      })),
});

  private api: ynab.API;

  constructor() {
    super();
    this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
  }

  protected async executeInternal(input: UpdateMultipleTransactionsInput): Promise<UpdateMultipleResult | string> {
    if (!process.env.YNAB_API_TOKEN) {
      return "ERROR: YNAB API Token is not set. Please set YNAB_API_TOKEN environment variable.";
    }

    if (!input.budgetId) {
      return "ERROR: Budget ID is required. Get from list_budgets() first.";
    }

    if (!input.transactions || input.transactions.length === 0) {
      return "ERROR: Transactions array is required and must not be empty. Provide at least one transaction to update.";
    }

    try {
      logger.info(`Updating ${input.transactions.length} transactions for budget ${input.budgetId}`);

      // Transform the input transactions to match YNAB API format
      const transformedTransactions: ynab.SaveTransactionWithIdOrImportId[] = input.transactions.map(tx => {
        const transformed: ynab.SaveTransactionWithIdOrImportId = {};

        // Set identification (either id OR import_id, not both)
        if (tx.id) {
          transformed.id = tx.id;
        } else if (tx.importId) {
          transformed.import_id = tx.importId;
        }

        // Set updateable fields (only if provided)
        if (tx.accountId) transformed.account_id = tx.accountId;
        if (tx.date) transformed.date = tx.date;
        if (tx.amount !== undefined) transformed.amount = Math.round(tx.amount * 1000); // Convert to milliunits
        if (tx.payeeName !== undefined) transformed.payee_name = tx.payeeName;
        if (tx.payeeId !== undefined) transformed.payee_id = tx.payeeId;
        // Only set category_id if it's a valid non-empty string (YNAB rejects null/empty category IDs)
        if (tx.categoryId !== undefined && tx.categoryId !== null && tx.categoryId !== '') {
          transformed.category_id = tx.categoryId;
        }
        if (tx.memo !== undefined) transformed.memo = tx.memo;
        if (tx.cleared) transformed.cleared = tx.cleared;
        if (tx.approved !== undefined) transformed.approved = tx.approved;
        if (tx.flagColor !== undefined) transformed.flag_color = tx.flagColor as ynab.TransactionFlagColor;

        return transformed;
      });

      const data: ynab.PatchTransactionsWrapper = {
        transactions: transformedTransactions,
      };

      const response = await this.api.transactions.updateTransactions(input.budgetId, data);

      logger.info(`Successfully updated ${response.data.transaction_ids.length} transactions`);

      if (response.data.duplicate_import_ids && response.data.duplicate_import_ids.length > 0) {
        logger.info(`Found ${response.data.duplicate_import_ids.length} duplicate import IDs`);
      }

      const summary = {
        total_requested: input.transactions.length,
        total_updated: response.data.transaction_ids.length,
        duplicates_found: response.data.duplicate_import_ids?.length || 0,
        transaction_ids: response.data.transaction_ids,
      };

      return summary;
    } catch (error: unknown) {
      logger.error(`Error updating multiple transactions for budget ${input.budgetId}:`);
      logger.error(JSON.stringify(error, null, 2));
      return `ERROR updating multiple transactions: ${JSON.stringify(error)}`;
    }
  }
}

export default UpdateMultipleTransactionsTool;