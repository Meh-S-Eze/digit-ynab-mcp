import { SerializingMCPTool } from "./base/SerializingMCPTool.js";
import { logger } from "mcp-framework";
import * as ynab from "ynab";
import { z } from "zod";

/**
 * TransferResult - Return type for transfer creation
 */
interface TransferResult {
  success: boolean;
  message: string;
  transaction_id: string | undefined;
  link: string;
}

interface CreateTransferInput {
    budgetId?: string;
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    date: string;
    memo?: string;
}

/**
 * CreateTransferTool - Transfer money between accounts
 *
 * WHEN TO USE:
 * - User asks: "Move money from X to Y", "Transfer between checking and savings"
 * - User wants: Move funds between accounts, split across accounts
 * - User is: Rebalancing accounts, moving emergency fund, consolidating
 *
 * WORKFLOW:
 * 1. MUST HAVE: fromAccountId and toAccountId (get from list_accounts())
 * 2. MUST HAVE: amount (positive number, e.g., 100.00)
 * 3. Call this tool with accounts and amount
 * 4. Tool creates linked transfer transactions (one on each account)
 * 5. Returns: Success confirmation + linked transaction IDs
 *
 * COMMON CLAUDE PATTERNS:
 * User: "Move $500 to savings" → list_accounts() → create_transfer(fromId=checking, toId=savings, amount=500)
 * User: "Transfer between accounts" → list_accounts() → create_transfer()
 *
 * IMPORTANT:
 * - Creates TWO linked transactions (one per account)
 * - ONLY for between-account transfers, NOT for account > category movement (use move_funds for that)
 * - Amount must be positive (direction set by from/to)
 * - This is different from split transactions (splits are within one transaction)
 * - Automatically marked as cleared/approved
 * - Transfers are excluded from spending analysis
 */
class CreateTransferTool extends SerializingMCPTool<CreateTransferInput> {
    name = "create_transfer";
    description = "WORKING: Move money between accounts. Creates a linked transfer transaction on both the source and destination accounts. Use this for moving money between your own accounts (checking to savings, etc), NOT for moving money between categories (use move_funds for that).";

    schema = z.object({
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to env var). Get from list_budgets() if needed."),
  fromAccountId: z.string().describe("REQUIRED: Source account UUID (where money comes FROM). Get from list_accounts()."),
  toAccountId: z.string().describe("REQUIRED: Destination account UUID (where money goes TO). Get from list_accounts()."),
  amount: z.number().describe("REQUIRED: Transfer amount (positive number, e.g., 500.00). Always positive; direction set by from/to accounts."),
  date: z.string().describe("REQUIRED: Transfer date in YYYY-MM-DD format (e.g., 2025-01-15)."),
  memo: z.string().optional().describe("Optional description for the transfer (e.g., 'Emergency fund', 'Monthly savings')."),
});

    private api: ynab.API;
    private budgetId: string;

    constructor() {
        super();
        this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
        this.budgetId = process.env.YNAB_BUDGET_ID || "";
    }

    protected async executeInternal(input: CreateTransferInput): Promise<TransferResult | string> {
        const budgetId = input.budgetId || this.budgetId;

        if (!process.env.YNAB_API_TOKEN) {
            return "ERROR: YNAB API Token is not set. Please set YNAB_API_TOKEN environment variable.";
        }

        if (!budgetId) {
            return "ERROR: No budget ID provided. Call list_budgets() first.";
        }

        if (input.fromAccountId === input.toAccountId) {
            return "ERROR: Cannot transfer to the same account. Provide different from/to accounts.";
        }

        try {
            logger.info(`Creating transfer in budget ${budgetId}`);

            // 1. Get accounts to find the transfer_payee_id for the target account
            const accountsResponse = await this.api.accounts.getAccounts(budgetId);
            const accounts = accountsResponse.data.accounts;

            const toAccount = accounts.find(a => a.id === input.toAccountId);
            const fromAccount = accounts.find(a => a.id === input.fromAccountId);

            if (!toAccount) return `ERROR: Destination account ${input.toAccountId} not found. Call list_accounts() to verify.`;
            if (!fromAccount) return `ERROR: Source account ${input.fromAccountId} not found. Call list_accounts() to verify.`;

            const transferPayeeId = toAccount.transfer_payee_id;
            if (!transferPayeeId) return `ERROR: Destination account '${toAccount.name}' does not have a transfer payee ID.`;

            // 2. Create the source transaction using the transfer payee
            const milliunits = Math.round(input.amount * 1000);

            const transaction: any = {
                account_id: input.fromAccountId,
                date: input.date,
                amount: -milliunits, // Outflow from source
                payee_id: transferPayeeId,
                memo: input.memo || "",
                cleared: "cleared",
                approved: true
            };

            const createResponse = await this.api.transactions.createTransaction(budgetId, {
                transaction
            });

            const created = createResponse.data.transaction;

            return {
                success: true,
                message: `Successfully transferred $${input.amount.toFixed(2)} from ${fromAccount.name} to ${toAccount.name}.`,
                transaction_id: created?.id,
                link: created?.transfer_transaction_id ? `Linked to ${created.transfer_transaction_id}` : "Not linked"
            };

        } catch (error: unknown) {
            logger.error(`Error creating transfer:`);
            logger.error(JSON.stringify(error, null, 2));
            return `ERROR creating transfer: ${JSON.stringify(error)}`;
        }
    }
}

export default CreateTransferTool;