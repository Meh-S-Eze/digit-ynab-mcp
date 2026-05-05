import { SerializingMCPTool } from "./base/SerializingMCPTool.js";
import { logger } from "mcp-framework";
import { z } from "zod";
import * as ynab from "ynab";

interface UpdateTransactionInput {
  budgetId?: string;
  transactionId: string;
  approved?: boolean;
}

interface ApproveTransactionResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  message?: string;
}

/**
 * Approve or unapprove an existing transaction.
 *
 * Default behavior is to mark a transaction as approved (approved = true).
 * Use approved = false if you need to revert a transaction back to
 * an unapproved state.
 *
 * Typical workflow:
 * 1. Call get_unapproved_transactions to discover pending items
 * 2. Let the user select which transaction(s) to approve
 * 3. Call approve_transaction for each selected transactionId
 */
class ApproveTransactionTool extends SerializingMCPTool<UpdateTransactionInput> {
  name = "approve_transaction";
  description = "Approves (or un-approves) an existing transaction in your YNAB budget. Use this after creating or reviewing a transaction that should be marked as finalized.";

  private api: ynab.API;
  private budgetId: string;

  constructor() {
    super();
    this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
    this.budgetId = process.env.YNAB_BUDGET_ID || "";
  }

  schema = z.object({
    budgetId: z.string().optional()
      .describe("The id of the budget containing the transaction (optional, defaults to the budget set in the YNAB_BUDGET_ID environment variable). Use list_budgets to discover available budgets."),
    transactionId: z.string()
      .describe("The id of the transaction to approve. Get this from create_transaction, create_multiple_transactions, or get_unapproved_transactions."),
    approved: z.boolean().default(true)
      .describe("Whether the transaction should be marked as approved. Defaults to true. Set to false to un-approve a transaction."),
  });

  protected async executeInternal(input: UpdateTransactionInput): Promise<ApproveTransactionResult> {
    const budgetId = input.budgetId || this.budgetId;

    if (!budgetId) {
      return {
        success: false,
        error:
          "No budget ID provided. Please provide a budget ID or set the YNAB_BUDGET_ID environment variable. Use list_budgets to discover budgets.",
      };
    }

    try {
      // First, get the existing transaction to ensure we don't lose any data
      const existingTransaction = await this.api.transactions.getTransactionById(
        budgetId,
        input.transactionId
      );

      if (!existingTransaction.data.transaction) {
        return {
          success: false,
          error: "Transaction not found for the given transactionId.",
        };
      }

      const existingTransactionData = existingTransaction.data.transaction;

      const transaction: ynab.PutTransactionWrapper = {
        transaction: {
          approved: input.approved,
        },
      };

      const response = await this.api.transactions.updateTransaction(
        budgetId,
        existingTransactionData.id,
        transaction
      );

      if (!response.data.transaction) {
        return {
          success: false,
          error: "Failed to update transaction - no transaction data returned.",
        };
      }

      return {
        success: true,
        transactionId: response.data.transaction.id,
        message: "Transaction approval status updated successfully.",
      };
    } catch (error) {
      logger.error(`Error approving transaction for budget ${budgetId}:`);
      logger.error(JSON.stringify(error, null, 2));
      return {
        success: false,
        error: "An error occurred while approving the transaction.",
      };
    }
  }
}

export default ApproveTransactionTool;