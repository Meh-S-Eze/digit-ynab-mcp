import { SerializingMCPTool } from "./base/SerializingMCPTool.js";
import { logger } from "mcp-framework";
import { z } from "zod";
import { normalizeYnabName, requestYnabApi } from "../utils/YnabRestApi.js";
import { invalidateYnabCaches } from "../utils/CacheInvalidation.js";

interface CreateAccountInput {
  budgetId?: string;
  name: string;
  type: "checking" | "savings" | "cash" | "creditCard" | "otherAsset" | "otherLiability";
  balance?: number;
}

interface CreateAccountResult {
  success: boolean;
  existed: boolean;
  account_id: string;
  name: string;
  type: string;
  balance: number;
  message: string;
}

class CreateAccountTool extends SerializingMCPTool<CreateAccountInput> {
  name = "create_account";
  description =
    "Create a new YNAB account in the selected budget. This is idempotent by exact account name; if the account already exists, it returns the existing account instead of creating a duplicate.";

  schema = z.object({
    budgetId: z
      .string()
      .optional()
      .describe("The ID of the budget/plan. Optional if YNAB_BUDGET_ID is set."),
    name: z
      .string()
      .min(1)
      .max(200)
      .describe("The exact account name to create."),
    type: z
      .enum(["checking", "savings", "cash", "creditCard", "otherAsset", "otherLiability"])
      .describe("The account type to create."),
    balance: z
      .number()
      .optional()
      .describe("Optional starting balance in dollars. Defaults to 0."),
  });

  protected async executeInternal(input: CreateAccountInput): Promise<CreateAccountResult | string> {
    const budgetId = input.budgetId || process.env.YNAB_BUDGET_ID || "";
    const token = process.env.YNAB_API_TOKEN || process.env.YNAB_TOKEN;

    if (!token) {
      return "ERROR: YNAB API Token is not set. Please set YNAB_API_TOKEN environment variable.";
    }

    if (!budgetId) {
      return "ERROR: No budget ID provided. Call list_budgets() first.";
    }

    const normalizedTarget = normalizeYnabName(input.name);

    try {
      const listResponse = await requestYnabApi<{
        data?: {
          accounts?: Array<{
            id: string;
            name: string;
            type: string;
            balance: number;
            deleted?: boolean;
          }>;
        };
      }>(`/plans/${encodeURIComponent(budgetId)}/accounts`, { method: "GET" });

      const existing = (listResponse?.data?.accounts || []).find(
        (account) =>
          !account.deleted && normalizeYnabName(account.name) === normalizedTarget
      );

      if (existing) {
        return {
          success: true,
          existed: true,
          account_id: existing.id,
          name: existing.name,
          type: existing.type,
          balance: existing.balance / 1000,
          message: `Account '${existing.name}' already exists.`,
        };
      }

      const balance = typeof input.balance === "number" ? input.balance : 0;
      const createResponse = await requestYnabApi<{
        data?: {
          account?: {
            id: string;
            name: string;
            type: string;
            balance: number;
          };
        };
      }>(`/plans/${encodeURIComponent(budgetId)}/accounts`, {
        method: "POST",
        body: {
          account: {
            name: input.name,
            type: input.type,
            balance: Math.round(balance * 1000),
          },
        },
      });

      const account = createResponse?.data?.account;
      if (!account?.id) {
        return "ERROR creating account: YNAB did not return the created account.";
      }

      logger.info(`Created account ${account.id} in budget ${budgetId}`);
      invalidateYnabCaches();

      return {
        success: true,
        existed: false,
        account_id: account.id,
        name: account.name,
        type: account.type,
        balance: account.balance / 1000,
        message: `Successfully created account '${account.name}'.`,
      };
    } catch (error: unknown) {
      logger.error("Error creating account:");
      logger.error(JSON.stringify(error, null, 2));
      return `ERROR creating account: ${error instanceof Error ? error.message : JSON.stringify(error)}`;
    }
  }
}

export default CreateAccountTool;
