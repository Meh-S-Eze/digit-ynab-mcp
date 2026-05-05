import { logger } from "mcp-framework";
import { SerializingMCPTool, handleToolError } from "./base/SerializingMCPTool.js";
import * as ynab from "ynab";
import { z } from "zod";

interface GetSinglePayeeInput {
  budgetId: string;
  payeeId: string;
}

class GetSinglePayeeTool extends SerializingMCPTool<GetSinglePayeeInput> {
  name = "get_single_payee";
  description = "Get detailed information about a specific payee";

  schema = z.object({
  budgetId: z.string().describe("The ID of the budget containing the payee"),
  payeeId: z.string().describe("The ID of the payee to retrieve details for"),
});

  private api: ynab.API;

  constructor() {
    super();
    this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
  }

  protected async executeInternal(input: GetSinglePayeeInput) {
    if (!process.env.YNAB_API_TOKEN) {
      return "YNAB API Token is not set";
    }

    if (!input.budgetId) {
      return "Budget ID is required. Please provide a budget ID.";
    }

    if (!input.payeeId) {
      return "Payee ID is required. Please provide a payee ID.";
    }

    try {
      logger.info(`Getting payee details for budget ${input.budgetId}, payee ${input.payeeId}`);
      const payeeResponse = await this.api.payees.getPayeeById(input.budgetId, input.payeeId);
      logger.info(`Successfully retrieved payee: ${payeeResponse.data.payee.name}`);

      const payee = {
        id: payeeResponse.data.payee.id,
        name: payeeResponse.data.payee.name,
        transfer_account_id: payeeResponse.data.payee.transfer_account_id,
        deleted: payeeResponse.data.payee.deleted,
      };

      return payee;
    } catch (error: unknown) {
      logger.error(`Error getting payee ${input.payeeId} for budget ${input.budgetId}:`);
      logger.error(JSON.stringify(error, null, 2));
      return `Error getting payee ${input.payeeId} for budget ${input.budgetId}: ${JSON.stringify(error)}`;
    }
  }
}

export default GetSinglePayeeTool;