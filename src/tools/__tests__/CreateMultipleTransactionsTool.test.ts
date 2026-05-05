import { describe, it, expect, vi, beforeEach } from 'vitest';
import CreateMultipleTransactionsTool from '../CreateMultipleTransactionsTool';
import * as ynab from 'ynab';

// Mock the ynab module
vi.mock('ynab', () => ({
  API: vi.fn(),
}));

// Mock the mcp-framework logger
vi.mock('mcp-framework', () => ({
  MCPTool: class MockMCPTool {
    constructor() {}
  },
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('CreateMultipleTransactionsTool', () => {
  let tool: CreateMultipleTransactionsTool;
  let mockApi: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset environment variables
    delete process.env.YNAB_API_TOKEN;
    delete process.env.YNAB_BUDGET_ID;

    // Create mock API
    mockApi = {
      transactions: {
        createTransaction: vi.fn(),
      },
    };

    (ynab.API as any).mockImplementation(() => mockApi);

    tool = new CreateMultipleTransactionsTool();
  });

  describe('execute', () => {
    it('should return error when YNAB API token is not set', async () => {
      const result = await tool.execute({
        budgetId: 'test-budget',
        transactions: [
          {
            accountId: 'test-account',
            date: '2024-12-19',
            amount: 1000,
          }
        ]
      });

      expect(result).toBe('YNAB API Token is not set');
    });

    it('should return error when budget ID is missing', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';

      const result = await tool.execute({
        budgetId: '',
        transactions: [
          {
            accountId: 'test-account',
            date: '2024-12-19',
            amount: 1000,
          }
        ]
      });

      expect(result).toBe('Budget ID is required. Please provide a budget ID.');
    });

    it('should return error when transactions array is missing', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';

      const result = await tool.execute({
        budgetId: 'test-budget',
        transactions: []
      });

      expect(result).toBe('Transactions array is required and must not be empty. Please provide at least one transaction.');
    });

    it('should create multiple transactions successfully', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const transactions = [
        {
          accountId: 'test-account-1',
          date: '2024-12-19',
          amount: -10.99, // Expense (negative)
          payeeName: 'Test Payee 1',
          categoryId: 'category-1',
          memo: 'Test transaction 1',
          cleared: 'uncleared' as const,
          approved: false,
        },
        {
          accountId: 'test-account-2',
          date: '2024-12-19',
          amount: 1000.00, // Income (positive)
          payeeName: 'Test Payee 2',
          categoryId: 'category-2',
          memo: 'Test transaction 2',
          cleared: 'uncleared' as const,
          approved: false,
        },
      ];

      const mockResponse = {
        data: {
          transaction_ids: ['transaction-1', 'transaction-2'],
          duplicate_import_ids: [],
          transactions: [
            {
              id: 'transaction-1',
              accountId: 'test-account-1',
              date: '2024-12-19',
              amount: -10990, // Milliunits for -10.99
              payeeName: 'Test Payee 1',
              categoryId: 'category-1',
              memo: 'Test transaction 1',
              cleared: 'uncleared',
              approved: false,
            },
            {
              id: 'transaction-2',
              accountId: 'test-account-2',
              date: '2024-12-19',
              amount: 1000000, // Milliunits for 1000.00
              payeeName: 'Test Payee 2',
              categoryId: 'category-2',
              memo: 'Test transaction 2',
              cleared: 'uncleared',
              approved: false,
            },
          ],
          server_knowledge: 123,
        },
      };

      mockApi.transactions.createTransaction.mockResolvedValue(mockResponse);

      const result = await tool.execute({ budgetId, transactions });

      expect(result).toBe('Successfully created 2 out of 2 transactions. Transaction IDs: transaction-1, transaction-2');
    });

    it('should handle duplicate import IDs', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const transactions = [
        {
          accountId: 'test-account',
          date: '2024-12-19',
          amount: -25.50, // Expense
          importId: 'duplicate-import-id',
        },
      ];

      const mockResponse = {
        data: {
          transaction_ids: [],
          duplicate_import_ids: ['duplicate-import-id'],
          transactions: [],
          server_knowledge: 123,
        },
      };

      mockApi.transactions.createTransaction.mockResolvedValue(mockResponse);

      const result = await tool.execute({ budgetId, transactions });

      expect(result).toBe('Successfully created 0 out of 1 transactions. Transaction IDs:  (1 duplicates found)');
    });

    it('should handle partial failures', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const transactions = [
        {
          accountId: 'test-account-1',
          date: '2024-12-19',
          amount: -15.75, // Expense
        },
        {
          accountId: 'test-account-2',
          date: '2024-12-19',
          amount: 500.00, // Income
        },
      ];

      const mockResponse = {
        data: {
          transaction_ids: ['transaction-1'], // Only one transaction created
          duplicate_import_ids: [],
          transactions: [
            {
              id: 'transaction-1',
              accountId: 'test-account-1',
              date: '2024-12-19',
              amount: -15750, // Milliunits for -15.75
              payeeName: null,
              categoryId: null,
              memo: null,
              cleared: 'uncleared',
              approved: false,
            },
          ],
          server_knowledge: 123,
        },
      };

      mockApi.transactions.createTransaction.mockResolvedValue(mockResponse);

      const result = await tool.execute({ budgetId, transactions });

      expect(result).toBe('Successfully created 1 out of 2 transactions. Transaction IDs: transaction-1');
    });

    it('should handle API errors gracefully', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const transactions = [
        {
          accountId: 'test-account',
          date: '2024-12-19',
          amount: -50.00, // Expense
        },
      ];

      const apiError = new Error('Invalid account ID');
      mockApi.transactions.createTransaction.mockRejectedValue(apiError);

      const result = await tool.execute({ budgetId, transactions });

      expect(result).toBe(`Error creating multiple transactions for budget ${budgetId}: ${JSON.stringify(apiError)}`);
    });

    it('should handle network errors', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const transactions = [
        {
          accountId: 'test-account',
          date: '2024-12-19',
          amount: -75.25, // Expense
        },
      ];

      const networkError = new Error('Network timeout');
      mockApi.transactions.createTransaction.mockRejectedValue(networkError);

      const result = await tool.execute({ budgetId, transactions });

      expect(result).toBe(`Error creating multiple transactions for budget ${budgetId}: ${JSON.stringify(networkError)}`);
    });

    it('should handle transactions with all optional fields', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const transactions = [
        {
          accountId: 'test-account',
          date: '2024-12-19',
          amount: 2500.00, // Income
          payeeName: 'Test Payee',
          payeeId: 'payee-1',
          categoryId: 'category-1',
          memo: 'Test memo',
          cleared: 'cleared' as const,
          approved: true,
          flagColor: 'red',
          importId: 'import-1',
        },
      ];

      const mockResponse = {
        data: {
          transaction_ids: ['transaction-1'],
          duplicate_import_ids: [],
          transactions: [
            {
              id: 'transaction-1',
              accountId: 'test-account',
              date: '2024-12-19',
              amount: 2500000, // Milliunits for 2500.00
              payeeName: 'Test Payee',
              categoryId: 'category-1',
              memo: 'Test memo',
              cleared: 'cleared',
              approved: true,
            },
          ],
          server_knowledge: 123,
        },
      };

      mockApi.transactions.createTransaction.mockResolvedValue(mockResponse);

      const result = await tool.execute({ budgetId, transactions });

      expect(result).toBe('Successfully created 1 out of 1 transactions. Transaction IDs: transaction-1');
    });
  });
});