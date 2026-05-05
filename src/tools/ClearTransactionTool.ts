import { logger } from "mcp-framework";
import { SerializingMCPTool, handleToolError } from "./base/SerializingMCPTool.js";
import * as ynab from "ynab";
import { z } from "zod";

/**
 * ClearTransactionResultData - Individual transaction result
 */
interface ClearTransactionResultData {
  id: string;
  date: string;
  amount: number;
  cleared: string;
}

/**
 * ClearTransactionResult - Return type for clear status update
 */
interface ClearTransactionResult {
  success: boolean;
  message: string;
  transaction: ClearTransactionResultData;
}

interface ClearTransactionInput {
    budgetId?: string;
    transactionId: string;
    cleared: "cleared" | "uncleared" | "reconciled";
}

/**
 * ClearTransactionTool - Mark transaction as cleared/uncleared/reconciled
 *
 * WHEN TO USE:
 * - User asks: "Mark as cleared", "Reconcile transaction", "Unmark cleared"
 * - User wants: Reconcile bank statement, mark confirmed, remove clearance
 * - User is: Bank reconciliation, confirming transactions
 *
 * WORKFLOW:
 * 1. MUST HAVE: transactionId (get from analyze_transactions())
 * 2. MUST HAVE: cleared status (cleared, uncleared, or reconciled)
 * 3. Call this tool with transaction ID and status
 * 4. Returns: Updated transaction
 *
 * COMMON CLAUDE PATTERNS:
 * User: "Mark cleared" → analyze_transactions() → clear_transaction(cleared='cleared')
 * User: "Reconcile this" → clear_transaction(cleared='reconciled')
 *
 * CLEARED STATES:
 * - uncleared: Transaction not yet confirmed with bank
 * - cleared: Transaction confirmed (shown in bank statement)
 * - reconciled: Transaction matched with bank records (locked state)
 *
 * IMPORTANT:
 * - Different from 'approved' (approval is for budget planning)
 * - Cleared = confirmed with actual bank
 * - Reconciled = locked after bank reconciliation
 * - Use this after checking bank statement
 */
class ClearTransactionTool extends SerializingMCPTool<ClearTransactionInput> {
    name = "clear_transaction";
    description = "WORKING: Mark a transaction as cleared, uncleared, or reconciled. Cleared = confirmed with your bank. Reconciled = locked after bank reconciliation. Use this when reviewing your bank statement.";

    schema = z.object({
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to env var). Get from list_budgets() if needed."),
  transactionId: z.string().describe("REQUIRED: Transaction UUID to update. Get from analyze_transactions()."),
  cleared: z.enum(["cleared", "uncleared", "reconciled"]).describe("REQUIRED: New cleared status. 'cleared' = confirmed with bank, 'uncleared' = pending, 'reconciled' = locked after reconciliation."),
});

    private api: ynab.API;
    private budgetId: string;

    constructor() {
        super();
        this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
        this.budgetId = process.env.YNAB_BUDGET_ID || "";
    }

    protected async executeInternal(input: ClearTransactionInput): Promise<ClearTransactionResult | string> {
        const budgetId = input.budgetId || this.budgetId;

        if (!process.env.YNAB_API_TOKEN) {
            return "ERROR: YNAB API Token is not set. Please set YNAB_API_TOKEN environment variable.";
        }

        if (!budgetId) {
            return "ERROR: No budget ID provided. Call list_budgets() first.";
        }

        try {
            logger.info(`Updating cleared status for transaction ${input.transactionId} to ${input.cleared}`);

            // We use the patch transaction endpoint
            const response = await this.api.transactions.updateTransaction(
                budgetId,
                input.transactionId,
                {
                    transaction: {
                        cleared: input.cleared as ynab.TransactionClearedStatus
                    }
                }
            );

            const updated = response.data.transaction;

            return {
                success: true,
                message: `Transaction ${input.transactionId} is now ${input.cleared}.`,
                transaction: {
                    id: updated.id,
                    date: updated.date,
                    amount: updated.amount / 1000,
                    cleared: updated.cleared
                }
            };

        } catch (error: unknown) {
            logger.error(`Error clearing transaction:`);
            logger.error(JSON.stringify(error, null, 2));
            return `ERROR clearing transaction: ${JSON.stringify(error)}`;
        }
    }
}

export default ClearTransactionTool;