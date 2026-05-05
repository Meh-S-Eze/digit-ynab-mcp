import { SerializingMCPTool } from "./base/SerializingMCPTool.js";
import { logger } from "mcp-framework";
import * as ynab from "ynab";
import { z } from "zod";
import { invalidateYnabCaches } from "../utils/CacheInvalidation.js";

/**
 * ScheduledTransactionResult - Return type for scheduled transaction creation
 */
interface ScheduledTransactionResult {
  success: boolean;
  message: string;
  scheduled_transaction_id: string;
}

interface CreateScheduledTransactionInput {
    budgetId?: string;
    accountId: string;
    date: string;
    amount: number;
    frequency: "never" | "daily" | "weekly" | "everyOtherWeek" | "twiceAMonth" | "every4Weeks" | "monthly" | "everyOtherMonth" | "every3Months" | "every4Months" | "twiceAYear" | "yearly" | "everyOtherYear";
    payeeId?: string;
    payeeName?: string;
    categoryId?: string;
    memo?: string;
}

/**
 * CreateScheduledTransactionTool - Create recurring transactions
 *
 * WHEN TO USE:
 * - User asks: "Set up recurring payment", "Create monthly bill reminder", "Recurring income"
 * - User wants: Automating transactions, reminders, regular payments
 * - User is: Setting up salary, bills, subscriptions
 *
 * WORKFLOW:
 * 1. MUST HAVE: accountId (get from list_accounts())
 * 2. MUST HAVE: frequency (monthly, weekly, yearly, etc.)
 * 3. MUST HAVE: amount (positive or negative), date, frequency
 * 4. Call this tool with all parameters
 * 5. Returns: Scheduled transaction ID for future reference
 *
 * COMMON CLAUDE PATTERNS:
 * User: "Set up monthly rent" → create_scheduled_transaction(accountId=<>, frequency=monthly, amount=-1500)
 * User: "My bi-weekly paycheck" → create_scheduled_transaction(frequency=everyOtherWeek, amount=2500)
 *
 * FREQUENCY GUIDE:
 * - daily, weekly, everyOtherWeek, twiceAMonth
 * - monthly, everyOtherMonth, every3Months, every4Months
 * - twiceAYear, yearly, everyOtherYear
 * - never = one-time (don't use this; use create_transaction instead)
 *
 * IMPORTANT:
 * - Negative amounts = expenses, positive = income
 * - Date = first occurrence (future occurrences calculated from here)
 * - Scheduled transactions are REMINDERS, not automatic posts
 * - Doesn't actually create transactions until approved
 * - Use payeeName or payeeId (YNAB creates payee if using name)
 */
class CreateScheduledTransactionTool extends SerializingMCPTool<CreateScheduledTransactionInput> {
    name = "create_scheduled_transaction";
    description = "WORKING: Create a recurring (scheduled) transaction for bills, salary, subscriptions, etc. Define frequency (monthly, weekly, yearly, etc.), amount, and payee. These are reminders and don't automatically post until approved.";

    schema = z.object({
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to env var). Get from list_budgets() if needed."),
  accountId: z.string().describe("REQUIRED: The account UUID for the transaction. Get from list_accounts()."),
  date: z.string().describe("REQUIRED: The first occurrence date (YYYY-MM-DD). Future dates calculated from this."),
  amount: z.number().describe("REQUIRED: Transaction amount in dollars. Negative = expense (e.g., -1500), Positive = income (e.g., 2500)."),
  frequency: z.enum([
                "never", "daily", "weekly", "everyOtherWeek", "twiceAMonth",
                "every4Weeks", "monthly", "everyOtherMonth", "every3Months",
                "every4Months", "twiceAYear", "yearly", "everyOtherYear"
            ]).describe("REQUIRED: How often this repeats. Common: daily, weekly, monthly, yearly. See documentation for all options."),
  payeeId: z.string().optional().describe("The payee UUID. Get from get_payees() or use payeeName instead."),
  payeeName: z.string().optional().describe("The payee name. YNAB auto-creates if doesn't exist. Use this if you don't have payeeId."),
  categoryId: z.string().optional().describe("The category UUID for this transaction. Get from get_month_detail()."),
  memo: z.string().optional().describe("Optional note (e.g., 'Monthly rent', 'Salary deposit')."),
});

    private api: ynab.API;
    private budgetId: string;

    constructor() {
        super();
        this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
        this.budgetId = process.env.YNAB_BUDGET_ID || "";
    }

    protected async executeInternal(input: CreateScheduledTransactionInput): Promise<ScheduledTransactionResult | string> {
        const budgetId = input.budgetId || this.budgetId;

        if (!process.env.YNAB_API_TOKEN) {
            return "ERROR: YNAB API Token is not set. Please set YNAB_API_TOKEN environment variable.";
        }

        if (!budgetId) {
            return "ERROR: No budget ID provided. Call list_budgets() first.";
        }

        try {
            logger.info(`Creating scheduled transaction in budget ${budgetId}`);

            const milliunits = Math.round(input.amount * 1000);

            const scheduledTransaction: ynab.SaveScheduledTransaction = {
                account_id: input.accountId,
                date: input.date,
                amount: milliunits,
                frequency: input.frequency,
                payee_id: input.payeeId,
                payee_name: input.payeeName,
                category_id: input.categoryId,
                memo: input.memo
            };

            const response = await this.api.scheduledTransactions.createScheduledTransaction(budgetId, {
                scheduled_transaction: scheduledTransaction
            });

            const created = response.data.scheduled_transaction;
            invalidateYnabCaches();

            return {
                success: true,
                message: `Successfully created ${input.frequency} scheduled transaction for $${input.amount.toFixed(2)}.`,
                scheduled_transaction_id: created.id
            };

        } catch (error: unknown) {
            logger.error(`Error creating scheduled transaction:`);
            logger.error(JSON.stringify(error, null, 2));
            return `ERROR creating scheduled transaction: ${JSON.stringify(error)}`;
        }
    }
}

export default CreateScheduledTransactionTool;