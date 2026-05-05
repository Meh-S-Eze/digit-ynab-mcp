import { logger } from "mcp-framework";
import { SerializingMCPTool, handleToolError } from "./base/SerializingMCPTool.js";
import * as ynab from "ynab";
import { z } from "zod";

interface HealthCheckInput {
    budgetId?: string;
}

class HealthCheckTool extends SerializingMCPTool<HealthCheckInput> {
    name = "health_check";
    description = "Check YNAB API connectivity and basic budget health.";

    schema = z.object({
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to env var)"),
});

    private api: ynab.API;
    private budgetId: string;

    constructor() {
        super();
        this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
        this.budgetId = process.env.YNAB_BUDGET_ID || "";
    }

    protected async executeInternal(input: HealthCheckInput) {
        const budgetId = input.budgetId || this.budgetId;

        if (!process.env.YNAB_API_TOKEN) {
            return { status: "error", message: "YNAB API Token is not set" };
        }

        try {
            const start = Date.now();

            // 1. Check User (Connectivity)
            const userResponse = await this.api.user.getUser();
            const latency = Date.now() - start;

            // 2. Check Budget (if ID available)
            let budgetStatus = "Not checked";
            if (budgetId) {
                try {
                    const budgetResponse = await this.api.budgets.getBudgetById(budgetId);
                    budgetStatus = `Connected to "${budgetResponse.data.budget.name}"`;
                } catch (e) {
                    budgetStatus = "Invalid Budget ID or Permission Denied";
                }
            }

            return {
                status: "ok",
                user_id: userResponse.data.user.id,
                latency_ms: latency,
                budget_status: budgetStatus,
                api_version: "v1",
                mcp_version: "Super-MCP v1.0"
            };

        } catch (error: unknown) {
            logger.error(`Health check failed:`);
            return { status: "fail", error: JSON.stringify(error) };
        }
    }
}

export default HealthCheckTool;