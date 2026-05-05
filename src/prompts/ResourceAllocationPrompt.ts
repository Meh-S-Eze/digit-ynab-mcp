import { MCPPrompt } from "mcp-framework";
import { z } from "zod";

class ResourceAllocationPrompt extends MCPPrompt {
    name = "resource_allocation_guidance";
    description = "Guidance on moving funds and allocating resources across categories";

    schema = {};

    protected async generateMessages() {
        return [
            {
                role: "user",
                content: {
                    type: "text",
                    text: `Helping users allocate resources across their different categories.

Effective Resource Moving:
1. **Reallocation**: If a user wants to move money FROM one category TO another, the 'move_funds' tool is the most efficient. It handles both the decrease and increase in a single logical operation, ensuring the total pool remains balanced.
2. **Direct Assignment**: If the user wants to set a specific amount for a category regardless of where it comes from, use 'update_category_budget'.
3. **Contextual Awareness**: Before moving large amounts, it's helpful to use 'get_month_detail' or 'get_budget_summary' to see current balances and avoid unintentionally creating a deficit in the source category.

Understanding Current Allocation:
- When users want to understand how their money is currently distributed across categories, use 'analyze_spending_by_category' to see actual spending patterns.
- For purchases that naturally span multiple categories, encourage the use of 'create_split_transaction' to maintain accurate category allocations.

Flexibility:
- The user is in control of their allocation strategy. Your role is to execute the mechanical changes to category targets as requested.
- If a user asks "Can I afford X?", use analytical tools like 'analyze_spending_by_category' and balance checks like 'list_accounts' to provide the data they need to make that decision.`
                }
            }
        ];
    }
}

export default ResourceAllocationPrompt;