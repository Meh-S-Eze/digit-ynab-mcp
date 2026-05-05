import { SerializingMCPTool } from "./base/SerializingMCPTool.js";
import { logger } from "mcp-framework";
import * as ynab from "ynab";
import { z } from "zod";

interface TransactionInput {
  accountId: string;
  date: string;
  amount: number;
  payeeName?: string | null;
  payeeId?: string | null;
  categoryId?: string | null;
  memo?: string | null;
  cleared?: "cleared" | "uncleared" | "reconciled";
  approved?: boolean;
  flagColor?: string | null;
  importId?: string | null;
  subtransactions?: SubTransactionInput[];
}

interface SubTransactionInput {
  categoryId: string;
  amount: number;
  memo?: string | null;
  payeeId?: string | null;
  payeeName?: string | null;
}

interface CreateMultipleTransactionsInput {
  budgetId: string;
  transactions: TransactionInput[];
}

/**
 * CreateMultipleTransactionsResult - Return type for bulk transaction creation
 */
interface CreateMultipleTransactionsResult {
  total_requested: number;
  total_created: number;
  duplicates_found: number;
  transaction_ids: string[];
}

/**
 * Bulk-create multiple transactions in a single call.
 *
 * Use this when the user provides a list/CSV of transactions or wants to
 * import several charges at once for the same or different accounts.
 *
 * Amounts are provided in **dollars** and converted to YNAB milliunits.
 * - Expenses MUST be **negative** (e.g. -10.99 for $10.99 spent)
 * - Income MUST be **positive** (e.g. 1000.00 for $1,000 received)
 *
 * Returns a concise summary that includes:
 * - total requested
 * - total successfully created
 * - number of duplicates (if any)
 * - list of created transaction IDs
 */
class CreateMultipleTransactionsTool extends SerializingMCPTool<CreateMultipleTransactionsInput> {
  name = "create_multiple_transactions";
  description = "Create multiple transactions at once (bulk import). Use this when the user has several transactions to add in one step rather than calling the single-transaction tool repeatedly.";

  schema = z.object({
  budgetId: z.string().describe("The ID of the budget to create transactions in. Obtain this from the list_budgets tool or the YNAB_BUDGET_ID environment variable."),
  transactions: z.array(z.object({
        accountId: z.string().describe("ID of the account the money moved in/out of. Get from list_accounts."),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Transaction date in YYYY-MM-DD format."),
        amount: z
          .number()
          .describe(
            "The amount in dollars. Use negative values for expenses (e.g. -10.99) and positive values for income (e.g. 1000.00)."
          ),
        payeeName: z.string().nullable().optional(),
        payeeId: z.string().nullable().optional(),
        categoryId: z.string().nullable().optional(),
        memo: z.string().nullable().optional(),
        cleared: z.enum(["cleared", "uncleared", "reconciled"]).optional(),
        approved: z.boolean().optional(),
        flagColor: z.string().nullable().optional(),
        importId: z.string().nullable().optional(),
        subtransactions: z.array(z.object({
          categoryId: z.string(),
          amount: z.number().describe("The subtransaction amount in dollars (same sign as parent)."),
          memo: z.string().nullable().optional(),
          payeeId: z.string().nullable().optional(),
          payeeName: z.string().nullable().optional(),
        })).optional().describe("Array of subtransactions that make up the split. The sum of their amounts must equal the parent transaction total if 'amount' is provided."),
      })),
});

  private api: ynab.API;

  constructor() {
    super();
    this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
  }

  protected async executeInternal(input: CreateMultipleTransactionsInput): Promise<CreateMultipleTransactionsResult | string> {
    if (!process.env.YNAB_API_TOKEN) {
      return "YNAB API Token is not set";
    }

    if (!input.budgetId) {
      return "Budget ID is required. Please provide a budget ID.";
    }

    if (!input.transactions || input.transactions.length === 0) {
      return "Transactions array is required and must not be empty. Please provide at least one transaction.";
    }

    try {
      logger.info(`Creating ${input.transactions.length} transactions for budget ${input.budgetId}`);

      // Transform the input transactions to match YNAB API format
      const transformedTransactions: ynab.NewTransaction[] = input.transactions.map((tx) => {
        const baseTransaction: ynab.NewTransaction = {
          account_id: tx.accountId,
          date: tx.date,
          amount: Math.round(tx.amount * 1000), // Preserves sign: negative for expenses, positive for income
          payee_name: tx.payeeName || undefined,
          payee_id: tx.payeeId || undefined,
          category_id: tx.categoryId || undefined,
          memo: tx.memo || undefined,
          cleared: tx.cleared,
          approved: tx.approved,
          flag_color: (tx.flagColor as ynab.TransactionFlagColor) || undefined,
          import_id: tx.importId || undefined,
        };

        // If subtransactions are provided, convert them to YNAB format
        if (tx.subtransactions && tx.subtransactions.length > 0) {
          baseTransaction.subtransactions = tx.subtransactions.map((sub) => ({
            amount: Math.round(sub.amount * 1000), // Convert to milliunits
            category_id: sub.categoryId,
            memo: sub.memo || undefined,
            payee_id: sub.payeeId || undefined,
            payee_name: sub.payeeName || undefined,
          }));
        }

        return baseTransaction;
      });

      const data: ynab.PostTransactionsWrapper = {
        transactions: transformedTransactions,
      };

      const response = await this.api.transactions.createTransaction(input.budgetId, data);

      logger.info(`Successfully created ${response.data.transaction_ids.length} transactions`);

      if (response.data.duplicate_import_ids && response.data.duplicate_import_ids.length > 0) {
        logger.info(`Found ${response.data.duplicate_import_ids.length} duplicate import IDs`);
      }

      // Return structured response matching MCP format
      const result: CreateMultipleTransactionsResult = {
        total_requested: input.transactions.length,
        total_created: response.data.transaction_ids.length,
        duplicates_found: response.data.duplicate_import_ids?.length || 0,
        transaction_ids: response.data.transaction_ids,
      };

      return result;
    } catch (error: unknown) {
      logger.error(`Error creating multiple transactions for budget ${input.budgetId}:`);
      logger.error(JSON.stringify(error, null, 2));
      return `Error creating multiple transactions for budget ${input.budgetId}: ${JSON.stringify(error)}`;
    }
  }
}

export default CreateMultipleTransactionsTool;