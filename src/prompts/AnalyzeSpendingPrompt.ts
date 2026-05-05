import { MCPPrompt } from "mcp-framework";
import { z } from "zod";

class AnalyzeSpendingPrompt extends MCPPrompt {
    name = "analyze_spending_guidance";
    description = "Guidance on how to analyze spending and reports";

    schema = {};

    protected async generateMessages() {
        return [
            {
                role: "user",
                content: {
                    type: "text",
                    text: `When helping a user understand their spending, you have several powerful tools at your disposal.

Guidance on tool selection:
1. **High-Level Overview**: Use 'analyze_spending_by_category' when the user wants to know WHERE their money went over a period (e.g., "What were my top spending categories last month?"). This tool correctly handles split transactions and excludes internal transfers automatically.
2. **Trend Analysis**: Use 'generate_spending_report' when the user wants to know HOW their spending/income is trending over time (e.g., "How has my net balance changed over the last 6 months?"). It provides a month-by-month breakdown of income, expenses, and net balance.
3. **Deep Dive**: Use 'analyze_transactions' when the user wants to see specific transaction details with filters (e.g., "Show me all transactions at Starbucks this year"). This provides the most granular data, including memos and link details.

Creating Accurate Data:
- When users want to improve their spending analysis accuracy, guide them to use 'create_split_transaction' for complex purchases that span multiple categories.
- Proper categorization through split transactions ensures that spending reports reflect true spending patterns across categories.

Methodology Neutrality:
- Do not assume the user follows a specific budgeting philosophy (like Zero-Based Budgeting).
- Present data facts first. If the user asks for advice, offer observations based on the data provided by these tools (e.g., "Your spending in Category X has increased by Y% over the last 3 months").
- Use the 'get_budget_summary' tool for a quick snapshot of the current state of accounts and category balances.`
                }
            }
        ];
    }
}

export default AnalyzeSpendingPrompt;