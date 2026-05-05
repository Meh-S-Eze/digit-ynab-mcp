import { SerializingMCPTool } from "./base/SerializingMCPTool.js";
import { logger } from "mcp-framework";
import axios from "axios";
import { z } from "zod";

interface PlanWriteActionInput {
  userIntent: string;
  budgetId?: string;
}

interface PlanWriteActionResult {
  intent: "read" | "write";
  action: string | null;
  summary: string;
  arguments: Record<string, any>;
  missingFields: string[];
  destructive: boolean;
}

class PlanWriteActionTool extends SerializingMCPTool<PlanWriteActionInput> {
  name = "plan_write_action";
  description =
    "Parse a user's natural language intent into a structured YNAB action plan. This is a meta-tool used to orchestrate complex write operations.";

  schema = z.object({
    userIntent: z
      .string()
      .describe("The natural language message from the user describing their intent."),
    budgetId: z
      .string()
      .optional()
      .describe("Optional preferred budget ID to use for the plan."),
  });

  protected async executeInternal(
    input: PlanWriteActionInput
  ): Promise<PlanWriteActionResult | string> {
    const provider = process.env.LLM_PROVIDER || "kilo";
    const apiKey =
      provider === "openrouter"
        ? process.env.OPENROUTER_API_KEY
        : process.env.KILO_API_KEY;
    const baseUrl =
      provider === "openrouter"
        ? process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1"
        : process.env.KILO_BASE_URL || "https://api.kilo.ai/api/gateway";
    const model =
      provider === "openrouter"
        ? process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat"
        : process.env.KILO_MODEL || "kilo-auto/balanced";

    if (!apiKey) {
      return `ERROR: LLM API Key for provider '${provider}' is not set.`;
    }

    const systemPrompt = `
You are a strict YNAB write-intent planner.
Return ONLY one JSON object and no markdown.

Allowed action values:
create_multiple_transactions, create_split_transaction, update_single_transaction, update_multiple_transactions, delete_transaction, clear_transaction, approve_transaction, create_transfer, create_scheduled_transaction, update_scheduled_transaction, delete_scheduled_transaction, move_funds, update_category_budget, create_account, create_payee, create_category_group, create_category, update_category_group, update_category

Use create_multiple_transactions for single transaction creation (one-item transactions array).
If IDs are unknown (e.g. you only have a name or memo for a delete/update action), you MUST list the required ID field (e.g. "scheduledTransactionId", "transactionId") in the "missingFields" array.
DO NOT invent IDs or put names/memos into ID fields.
If the user intent is read-only, output intent="read" and action=null.

Scheduled Transaction Fields:
- use "date" (NOT "startDate") for the next occurrence date.
- REQUIRED for delete/update: "scheduledTransactionId". If unknown, add to missingFields.
- "frequency": daily, weekly, everyOtherWeekly, twiceAMonth, every4Weeks, monthly, everyOtherMonth, every3Months, every6Months, yearly, everyOtherYear.

Output schema:
{"intent":"read|write","action":"string|null","summary":"string","arguments":{},"missingFields":[],"destructive":boolean}

${input.budgetId ? `Preferred budgetId: ${input.budgetId}` : ""}
IMPORTANT: Today's date is ${new Date().toISOString().split('T')[0]}.
`.trim();

    try {
      logger.info(`Planning write action for intent: "${input.userIntent}" using ${model}`);

      const response = await axios.post(
        `${baseUrl.replace(/\/+$/, "")}/chat/completions`,
        {
          model,
          temperature: 0,
          max_tokens: 1000,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: input.userIntent },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      const content = response.data?.choices?.[0]?.message?.content;
      if (!content) {
        return "ERROR: LLM returned an empty response.";
      }

      // Clean up markdown if model ignored the "no markdown" rule
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : content;

      try {
        const plan = JSON.parse(jsonStr);
        logger.info(`Successfully generated plan for action: ${plan.action}`);
        return plan as PlanWriteActionResult;
      } catch (parseError) {
        logger.error("Failed to parse planner JSON:");
        logger.error(content);
        return `ERROR: LLM returned invalid JSON: ${jsonStr}`;
      }
    } catch (error: any) {
      logger.error("Error calling LLM for planning:");
      const errorMsg = error.response?.data?.error?.message || error.message;
      return `ERROR calling LLM: ${errorMsg}`;
    }
  }
}

export default PlanWriteActionTool;
