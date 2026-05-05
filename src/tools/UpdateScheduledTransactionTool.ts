import { SerializingMCPTool } from "./base/SerializingMCPTool.js";
import { logger } from "mcp-framework";
import * as ynab from "ynab";
import { z } from "zod";
import { invalidateYnabCaches } from "../utils/CacheInvalidation.js";

interface UpdateScheduledTransactionInput {
  budgetId?: string;
  scheduledTransactionId: string;
  accountId?: string;
  date?: string;
  amount?: number;
  frequency?:
    | "never"
    | "daily"
    | "weekly"
    | "everyOtherWeek"
    | "twiceAMonth"
    | "every4Weeks"
    | "monthly"
    | "everyOtherMonth"
    | "every3Months"
    | "every4Months"
    | "twiceAYear"
    | "yearly"
    | "everyOtherYear";
  payeeId?: string | null;
  payeeName?: string | null;
  categoryId?: string | null;
  memo?: string | null;
  flagColor?: string | null;
}

interface UpdateScheduledTransactionResult {
  success: boolean;
  scheduled_transaction_id: string;
  date_next: string;
  frequency: string;
  amount: number;
  payee_name: string | null;
  memo: string | null;
  message: string;
}

class UpdateScheduledTransactionTool extends SerializingMCPTool<UpdateScheduledTransactionInput> {
  name = "update_scheduled_transaction";
  description =
    "Update an existing scheduled transaction. Supports account, date, amount, frequency, payee, category, memo, and flag color updates.";

  schema = z.object({
    budgetId: z
      .string()
      .optional()
      .describe("The ID of the budget/plan. Optional if YNAB_BUDGET_ID is set."),
    scheduledTransactionId: z
      .string()
      .describe("The scheduled transaction ID to update."),
    accountId: z
      .string()
      .optional()
      .describe("Optional new account ID."),
    date: z
      .string()
      .optional()
      .describe("Optional new first/next scheduled date in YYYY-MM-DD format."),
    amount: z
      .number()
      .optional()
      .describe("Optional new amount in dollars."),
    frequency: z
      .enum([
        "never",
        "daily",
        "weekly",
        "everyOtherWeek",
        "twiceAMonth",
        "every4Weeks",
        "monthly",
        "everyOtherMonth",
        "every3Months",
        "every4Months",
        "twiceAYear",
        "yearly",
        "everyOtherYear",
      ])
      .optional()
      .describe("Optional new recurrence frequency."),
    payeeId: z
      .string()
      .nullable()
      .optional()
      .describe("Optional new payee ID."),
    payeeName: z
      .string()
      .nullable()
      .optional()
      .describe("Optional new payee name."),
    categoryId: z
      .string()
      .nullable()
      .optional()
      .describe("Optional new category ID."),
    memo: z
      .string()
      .nullable()
      .optional()
      .describe("Optional new memo."),
    flagColor: z
      .string()
      .nullable()
      .optional()
      .describe("Optional flag color."),
  });

  private api: ynab.API;

  constructor() {
    super();
    this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
  }

  protected async executeInternal(
    input: UpdateScheduledTransactionInput
  ): Promise<UpdateScheduledTransactionResult | string> {
    const budgetId = input.budgetId || process.env.YNAB_BUDGET_ID || "";

    if (!process.env.YNAB_API_TOKEN && !process.env.YNAB_TOKEN) {
      return "ERROR: YNAB API Token is not set. Please set YNAB_API_TOKEN environment variable.";
    }

    if (!budgetId) {
      return "ERROR: No budget ID provided. Call list_budgets() first.";
    }

    if (
      input.accountId === undefined &&
      input.date === undefined &&
      input.amount === undefined &&
      input.frequency === undefined &&
      input.payeeId === undefined &&
      input.payeeName === undefined &&
      input.categoryId === undefined &&
      input.memo === undefined &&
      input.flagColor === undefined
    ) {
      return "ERROR: At least one field to update is required.";
    }

    try {
      const scheduledTransactionPatch: Record<string, unknown> = {};
      if (input.accountId !== undefined) scheduledTransactionPatch.account_id = input.accountId;
      if (input.date !== undefined) scheduledTransactionPatch.date = input.date;
      if (input.amount !== undefined) {
        scheduledTransactionPatch.amount = Math.round(input.amount * 1000);
      }
      if (input.frequency !== undefined) scheduledTransactionPatch.frequency = input.frequency;
      if (input.payeeId !== undefined) scheduledTransactionPatch.payee_id = input.payeeId;
      if (input.payeeName !== undefined) scheduledTransactionPatch.payee_name = input.payeeName;
      if (input.categoryId !== undefined) scheduledTransactionPatch.category_id = input.categoryId;
      if (input.memo !== undefined) scheduledTransactionPatch.memo = input.memo;
      if (input.flagColor !== undefined) {
        scheduledTransactionPatch.flag_color = input.flagColor;
      }

      const response = await this.api.scheduledTransactions.updateScheduledTransaction(
        budgetId,
        input.scheduledTransactionId,
        {
          scheduled_transaction:
            scheduledTransactionPatch as unknown as ynab.SaveScheduledTransaction,
        }
      );

      const scheduledTransaction = (response as any)?.data?.scheduled_transaction;
      if (!scheduledTransaction?.id) {
        return "ERROR updating scheduled transaction: YNAB did not return the updated scheduled transaction.";
      }
      logger.info(
        `Updated scheduled transaction ${scheduledTransaction.id} in budget ${budgetId}`
      );
      invalidateYnabCaches();

      return {
        success: true,
        scheduled_transaction_id: scheduledTransaction.id,
        date_next: scheduledTransaction.date_next,
        frequency: scheduledTransaction.frequency,
        amount: scheduledTransaction.amount / 1000,
        payee_name: scheduledTransaction.payee_name || null,
        memo: scheduledTransaction.memo || null,
        message: `Successfully updated scheduled transaction '${scheduledTransaction.id}'.`,
      };
    } catch (error: unknown) {
      logger.error("Error updating scheduled transaction:");
      logger.error(JSON.stringify(error, null, 2));
      return `ERROR updating scheduled transaction: ${error instanceof Error ? error.message : JSON.stringify(error)}`;
    }
  }
}

export default UpdateScheduledTransactionTool;