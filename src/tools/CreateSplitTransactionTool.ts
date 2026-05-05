import { SerializingMCPTool, handleToolError } from "./base/SerializingMCPTool.js";
import { logger } from "mcp-framework";
import * as ynab from "ynab";
import { z } from "zod";

interface SubTransactionInput {
  categoryId: string;
  amount: number;
  memo?: string | null;
  payeeId?: string | null;
  payeeName?: string | null;
}

interface CreateSplitTransactionInput {
  budgetId: string;
  transactionId: string;
  accountId?: string;
  date?: string;
  amount?: number;
  payeeId?: string | null;
  payeeName?: string | null;
  memo?: string | null;
  subtransactions: SubTransactionInput[];
}

/**
 * SplitTransactionResult - Return type for split transaction creation
 */
interface SplitTransactionResult {
  success: boolean;
  message: string;
  transaction_id: string;
  subtransaction_count: number;
  total_amount: number;
}

/**
 * Convert an existing transaction into a split transaction.
 *
 * Use this when the user describes a single purchase that should be
 * allocated to multiple categories, e.g.:
 * - "$100 at Target: $60 groceries, $40 household items"
 *
 * This does **not** create a new transaction; it updates the existing
 * one (identified by transactionId) to have subtransactions.
 *
 * IMPORTANT:
 * - If amount is provided, it MUST equal the sum of all subtransactions
 *   (within a small rounding tolerance).
 * - If amount is omitted, the sum of subtransactions becomes the new
 *   transaction total.
 */
class CreateSplitTransactionTool extends SerializingMCPTool<CreateSplitTransactionInput> {
  name = "create_split_transaction";
  description =
    "Update an existing transaction so it becomes a split transaction divided into multiple sub-transactions across different categories.";

  schema = z.object({
    budgetId: z
      .string()
      .describe("The ID of the budget containing the transaction."),
    transactionId: z
      .string()
      .describe(
        "The ID of the existing transaction to split. Obtain this from create_transaction, create_multiple_transactions, or get_unapproved_transactions."
      ),
    accountId: z
      .string()
      .optional()
      .describe("The ID of the account (optional, defaults to existing)."),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        "The transaction date in YYYY-MM-DD format (optional, defaults to existing)."
      ),
    amount: z
      .number()
      .optional()
      .describe(
        "The total transaction amount in dollars. If provided, it must match the sum of subtransactions."
      ),
    payeeId: z
      .string()
      .nullable()
      .optional()
      .describe("The payee ID for the transaction."),
    payeeName: z
      .string()
      .nullable()
      .optional()
      .describe("The payee name for the transaction."),
    memo: z
      .string()
      .nullable()
      .optional()
      .describe("A memo for the parent transaction."),
    subtransactions: z
      .array(
        z.object({
          categoryId: z.string(),
          amount: z
            .number()
            .describe(
              "The subtransaction amount in dollars (same sign as parent)."
            ),
          memo: z.string().nullable().optional(),
          payeeId: z.string().nullable().optional(),
          payeeName: z.string().nullable().optional(),
        })
      )
      .describe(
        "Array of subtransactions that make up the split. The sum of their amounts must equal the parent transaction total if 'amount' is provided."
      ),
  });

  private api: ynab.API;

  constructor() {
    super();
    this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
  }

  protected async executeInternal(
    input: CreateSplitTransactionInput
  ): Promise<SplitTransactionResult | string> {
    if (!process.env.YNAB_API_TOKEN) {
      return handleToolError("YNAB API Token is not set");
    }

    if (!input.budgetId) {
      return handleToolError(
        "Budget ID is required. Please provide a budget ID."
      );
    }

    if (!input.transactionId) {
      return handleToolError(
        "Transaction ID is required. Please provide a transaction ID."
      );
    }

    if (!input.subtransactions || input.subtransactions.length < 2) {
      return handleToolError(
        "At least 2 subtransactions are required for a split transaction."
      );
    }

    // Calculate total from subtransactions
    const subTotal = input.subtransactions.reduce(
      (sum, sub) => sum + sub.amount,
      0
    );

    // If amount is provided, validate it matches
    if (input.amount !== undefined) {
      if (Math.abs(subTotal - input.amount) > 0.01) {
        // Allow small floating point differences
        return handleToolError(
          `Subtransaction amounts (${subTotal}) do not match total amount (${input.amount}). The sum of all subtransaction amounts must equal the total transaction amount.`
        );
      }
    }

    const totalAmount =
      input.amount !== undefined ? input.amount : subTotal;

    try {
      logger.info(
        `Updating transaction ${input.transactionId} to split for budget ${input.budgetId}`
      );

      // Transform subtransactions to YNAB format
      const transformedSubtransactions: ynab.SaveSubTransaction[] =
        input.subtransactions.map((sub) => ({
          amount: Math.round(sub.amount * 1000), // Convert to milliunits
          category_id: sub.categoryId,
          memo: sub.memo || undefined,
          payee_id: sub.payeeId || undefined,
          payee_name: sub.payeeName || undefined,
        }));

      // Create the transaction update object
      const transactionData: ynab.ExistingTransaction = {
        amount: Math.round(totalAmount * 1000), // Convert to milliunits
        category_id: null, // Split transactions have null category_id
        subtransactions: transformedSubtransactions,
      };

      // Add optional fields if provided
      if (input.accountId) transactionData.account_id = input.accountId;
      if (input.date) transactionData.date = input.date;
      if (input.payeeId !== undefined)
        transactionData.payee_id = input.payeeId || null;
      if (input.payeeName !== undefined)
        transactionData.payee_name = input.payeeName || null;
      if (input.memo !== undefined) transactionData.memo = input.memo || null;

      const data: ynab.PutTransactionWrapper = {
        transaction: transactionData,
      };

      const response = await this.api.transactions.updateTransaction(
        input.budgetId,
        input.transactionId,
        data
      );

      if (!response.data.transaction) {
        return handleToolError(
          "Transaction update failed - no transaction data returned"
        );
      }

      const transaction = response.data.transaction;
      logger.info(`Successfully updated split transaction ${transaction.id}`);

      // Return structured response that matches MCP format
      return {
        success: true,
        message: `Successfully split transaction into ${(transaction.subtransactions || []).length} categories`,
        transaction_id: transaction.id,
        subtransaction_count: (transaction.subtransactions || []).length,
        total_amount: transaction.amount / 1000,
      };
    } catch (error: unknown) {
      logger.error(
        `Error updating split transaction for budget ${input.budgetId}:`
      );
      logger.error(JSON.stringify(error, null, 2));
      return handleToolError(error, `updating split transaction for budget ${input.budgetId}`);
    }
  }
}

export default CreateSplitTransactionTool;