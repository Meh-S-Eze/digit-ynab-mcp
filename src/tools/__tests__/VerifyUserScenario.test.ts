import { describe, it, expect, vi, beforeEach } from 'vitest';
import CreateSplitTransactionTool from '../CreateSplitTransactionTool';
import * as ynab from 'ynab';

// Mock the ynab module
vi.mock('ynab', () => ({
  API: vi.fn(),
}));

// Mock the mcp-framework logger
vi.mock('mcp-framework', () => ({
  MCPTool: class MockMCPTool { constructor() { } },
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Verify User Scenario', () => {
  let tool: CreateSplitTransactionTool;
  let mockApi: any;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.YNAB_API_TOKEN;

    mockApi = {
      transactions: {
        updateTransaction: vi.fn(),
      },
    };
    (ynab.API as any).mockImplementation(() => mockApi);

    tool = new CreateSplitTransactionTool();
  });

  it('should handle the user provided scenario', async () => {
    process.env.YNAB_API_TOKEN = 'test-token';

    const mockTransaction = {
      id: 'transaction-example',
      date: '2025-12-13',
      amount: 82570, // Positive for inflow? Or negative for outflow?
      // User input has positive amount 82.57. Usually expenses are negative.
      // But let's assume the user input is what they want.
      // Wait, the user input has positive amounts for subtransactions too.
      // If it's an expense, they should be negative.
      // But maybe it's income? Or maybe the tool handles sign?
      // The tool schema says: "Use negative values for expenses (e.g. -50.00) and positive values for income"
      // The user input has positive values.
      // Let's see if the tool passes them through.
      payee_name: 'Example Grocery',
      memo: 'Example grocery purchase split across categories',
      account_name: 'Test Account',
      subtransactions: [
        { id: 's1', amount: 44970, category_name: 'Food', memo: 'Food items' },
        { id: 's2', amount: 27480, category_name: 'Household', memo: 'Household items' },
        { id: 's3', amount: 10120, category_name: 'Tax', memo: 'Tax' }
      ]
    };

    mockApi.transactions.updateTransaction.mockResolvedValue({
      data: {
        transaction: mockTransaction,
      },
    });

    const input = {
      accountId: "account-example",
      amount: 82.57,
      budgetId: "budget-example",
      date: "2025-12-13",
      memo: "Example grocery purchase split across categories",
      payeeId: "payee-example",
      payeeName: "Example Grocery",
      subtransactions: [
        {
          amount: 44.97,
          categoryId: "category-food-example",
          memo: "Food items"
        },
        {
          amount: 27.48,
          categoryId: "category-household-example",
          memo: "Household items"
        },
        {
          amount: 10.12,
          categoryId: "category-food-example",
          memo: "Tax and additional items"
        }
      ],
      transactionId: "transaction-example"
    };

    const result = await tool.execute(input);

    expect(mockApi.transactions.updateTransaction).toHaveBeenCalledWith(
      "budget-example",
      "transaction-example",
      {
        transaction: {
          account_id: "account-example",
          date: "2025-12-13",
          amount: 82570, // 82.57 * 1000
          payee_id: "payee-example",
          payee_name: "Example Grocery",
          memo: "Example grocery purchase split across categories",
          category_id: null,
          subtransactions: [
            {
              amount: 44970,
              category_id: "category-food-example",
              memo: "Food items",
              payee_id: undefined,
              payee_name: undefined
            },
            {
              amount: 27480,
              category_id: "category-household-example",
              memo: "Household items",
              payee_id: undefined,
              payee_name: undefined
            },
            {
              amount: 10120,
              category_id: "category-food-example",
              memo: "Tax and additional items",
              payee_id: undefined,
              payee_name: undefined
            }
          ]
        }
      }
    );

    expect(result).toContain('Successfully updated transaction transaction-example');
  });
});
