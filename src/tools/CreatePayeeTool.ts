import { SerializingMCPTool, handleToolError } from "./base/SerializingMCPTool.js";
import { logger } from "mcp-framework";
import { z } from "zod";
import { normalizeYnabName, requestYnabApi } from "../utils/YnabRestApi.js";
import { invalidateYnabCaches } from "../utils/CacheInvalidation.js";

interface CreatePayeeInput {
  budgetId?: string;
  name: string;
}

interface CreatePayeeResult {
  success: boolean;
  existed: boolean;
  payee_id: string;
  name: string;
  message: string;
}

class CreatePayeeTool extends SerializingMCPTool<CreatePayeeInput> {
  name = "create_payee";
  description =
    "Create a new payee in the selected budget. This is idempotent by exact payee name; if the payee already exists, it returns the existing payee instead of creating a duplicate.";

  schema = z.object({
    budgetId: z
      .string()
      .optional()
      .describe("The ID of the budget/plan. Optional if YNAB_BUDGET_ID is set."),
    name: z
      .string()
      .min(1)
      .max(500)
      .describe("The exact payee name to create."),
  });

  protected async executeInternal(input: CreatePayeeInput): Promise<CreatePayeeResult | string> {
    const budgetId = input.budgetId || process.env.YNAB_BUDGET_ID || "";
    const token = process.env.YNAB_API_TOKEN || process.env.YNAB_TOKEN;

    if (!token) {
      return handleToolError("YNAB API Token is not set. Please set YNAB_API_TOKEN environment variable.");
    }

    if (!budgetId) {
      return handleToolError("No budget ID provided. Call list_budgets() first.");
    }

    const normalizedTarget = normalizeYnabName(input.name);

    try {
      const listResponse = await requestYnabApi<{
        data?: {
          payees?: Array<{
            id: string;
            name: string;
            deleted?: boolean;
          }>;
        };
      }>(`/plans/${encodeURIComponent(budgetId)}/payees`, { method: "GET" });

      const existing = (listResponse?.data?.payees || []).find(
        (payee) => !payee.deleted && normalizeYnabName(payee.name) === normalizedTarget
      );

      if (existing) {
        return {
          success: true,
          existed: true,
          payee_id: existing.id,
          name: existing.name,
          message: `Reusing existing payee '${existing.name}'.`,
        };
      }

      const createResponse = await requestYnabApi<{
        data?: {
          payee?: {
            id: string;
            name: string;
          };
        };
      }>(`/plans/${encodeURIComponent(budgetId)}/payees`, {
        method: "POST",
        body: {
          payee: {
            name: input.name,
          },
        },
      });

      const payee = createResponse?.data?.payee;
      if (!payee?.id) {
        return handleToolError(
          "YNAB did not return the created payee.",
          "creating payee"
        );
      }

      logger.info(`Created payee ${payee.id} in budget ${budgetId}`);
      invalidateYnabCaches();

      return {
        success: true,
        existed: false,
        payee_id: payee.id,
        name: payee.name,
        message: `Created payee '${payee.name}'.`,
      };
    } catch (error: unknown) {
      logger.error("Error creating payee:");
      logger.error(JSON.stringify(error, null, 2));
      return handleToolError(error, "creating payee");
    }
  }
}

export default CreatePayeeTool;