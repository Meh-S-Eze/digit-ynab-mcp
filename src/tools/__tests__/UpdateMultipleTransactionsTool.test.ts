import { describe, it, expect, vi, beforeEach } from 'vitest';
import UpdateMultipleTransactionsTool from '../UpdateMultipleTransactionsTool';
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

describe('UpdateMultipleTransactionsTool', () => {
  let tool: UpdateMultipleTransactionsTool;
  let mockApi: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset environment variables
    delete process.env.YNAB_API_TOKEN;
    delete process.env.YNAB_BUDGET_ID;

    // Create mock API
    mockApi = {
      transactions: {
        updateTransactions: vi.fn(),
      },
    };

    (ynab.API as any).mockImplementation(() => mockApi);

    tool = new UpdateMultipleTransactionsTool();
  });

  describe('execute', () => {
    it('should return error when YNAB API token is not set', async () => {
      const result = await tool.execute({
        budgetId: 'test-budget',
        transactions: [
          {
            id: 'transaction-1',
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
            id: 'transaction-1',
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

      expect(result).toBe('Transactions array is required and must not be empty. Please provide at least one transaction to update.');
    });

    it('should update multiple transactions successfully using transaction IDs', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const transactions = [
        {
          id: 'transaction-1',
          amount: -10.99, // Expense (negative)
          payeeName: 'Updated Payee 1',
          categoryId: 'category-1',
          memo: 'Updated transaction 1',
          cleared: 'cleared' as const,
          approved: true,
        },
        {
          id: 'transaction-2',
          amount: 1000.00, // Income (positive)
          payeeName: 'Updated Payee 2',
          categoryId: 'category-2',
          memo: 'Updated transaction 2',
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
              payeeName: 'Updated Payee 1',
              categoryId: 'category-1',
              memo: 'Updated transaction 1',
              cleared: 'cleared',
              approved: true,
            },
            {
              id: 'transaction-2',
              accountId: 'test-account-2',
              date: '2024-12-19',
              amount: 1000000, // Milliunits for 1000.00
              payeeName: 'Updated Payee 2',
              categoryId: 'category-2',
              memo: 'Updated transaction 2',
              cleared: 'uncleared',
              approved: false,
            },
          ],
          server_knowledge: 123,
        },
      };

      mockApi.transactions.updateTransactions.mockResolvedValue(mockResponse);

      const result = await tool.execute({ budgetId, transactions });

      expect(result).toBe('Successfully updated 2 out of 2 transactions. Transaction IDs: transaction-1, transaction-2');
    });

    it('should update multiple transactions successfully using import IDs', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const transactions = [
        {
          importId: 'import-1',
          amount: -25.50, // Expense
          payeeName: 'Updated Payee',
          memo: 'Updated memo',
        },
        {
          importId: 'import-2',
          amount: 500.00, // Income
          categoryId: 'category-1',
          approved: true,
        },
      ];

      const mockResponse = {
        data: {
          transaction_ids: ['transaction-1', 'transaction-2'],
          duplicate_import_ids: [],
          transactions: [
            {
              id: 'transaction-1',
              importId: 'import-1',
              amount: -25500, // Milliunits for -25.50
              payeeName: 'Updated Payee',
              memo: 'Updated memo',
            },
            {
              id: 'transaction-2',
              importId: 'import-2',
              amount: 500000, // Milliunits for 500.00
              categoryId: 'category-1',
              approved: true,
            },
          ],
          server_knowledge: 123,
        },
      };

      mockApi.transactions.updateTransactions.mockResolvedValue(mockResponse);

      const result = await tool.execute({ budgetId, transactions });

      expect(result).toBe('Successfully updated 2 out of 2 transactions. Transaction IDs: transaction-1, transaction-2');
    });

    it('should handle duplicate import IDs', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const transactions = [
        {
          importId: 'duplicate-import-id',
          amount: -15.75, // Expense
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

      mockApi.transactions.updateTransactions.mockResolvedValue(mockResponse);

      const result = await tool.execute({ budgetId, transactions });

      expect(result).toBe('Successfully updated 0 out of 1 transactions. Transaction IDs:  (1 duplicates found)');
    });

    it('should handle partial failures', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const transactions = [
        {
          id: 'transaction-1',
          amount: -15.75, // Expense
        },
        {
          id: 'transaction-2',
          amount: 500.00, // Income
        },
      ];

      const mockResponse = {
        data: {
          transaction_ids: ['transaction-1'], // Only one transaction updated
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

      mockApi.transactions.updateTransactions.mockResolvedValue(mockResponse);

      const result = await tool.execute({ budgetId, transactions });

      expect(result).toBe('Successfully updated 1 out of 2 transactions. Transaction IDs: transaction-1');
    });

    it('should handle API errors gracefully', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const transactions = [
        {
          id: 'invalid-transaction-id',
          amount: -50.00, // Expense
        },
      ];

      const apiError = new Error('Transaction not found');
      mockApi.transactions.updateTransactions.mockRejectedValue(apiError);

      const result = await tool.execute({ budgetId, transactions });

      expect(result).toBe(`Error updating multiple transactions for budget ${budgetId}: ${JSON.stringify(apiError)}`);
    });

    it('should handle network errors', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const transactions = [
        {
          id: 'transaction-1',
          amount: -75.25, // Expense
        },
      ];

      const networkError = new Error('Network timeout');
      mockApi.transactions.updateTransactions.mockRejectedValue(networkError);

      const result = await tool.execute({ budgetId, transactions });

      expect(result).toBe(`Error updating multiple transactions for budget ${budgetId}: ${JSON.stringify(networkError)}`);
    });

    it('should handle transactions with all optional fields', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const transactions = [
        {
          id: 'transaction-1',
          accountId: 'new-account',
          date: '2024-12-20',
          amount: 2500.00, // Income
          payeeName: 'Updated Payee',
          payeeId: 'payee-1',
          categoryId: 'category-1',
          memo: 'Updated memo',
          cleared: 'cleared' as const,
          approved: true,
          flagColor: 'red',
        },
      ];

      const mockResponse = {
        data: {
          transaction_ids: ['transaction-1'],
          duplicate_import_ids: [],
          transactions: [
            {
              id: 'transaction-1',
              accountId: 'new-account',
              date: '2024-12-20',
              amount: 2500000, // Milliunits for 2500.00
              payeeName: 'Updated Payee',
              categoryId: 'category-1',
              memo: 'Updated memo',
              cleared: 'cleared',
              approved: true,
            },
          ],
          server_knowledge: 123,
        },
      };

      mockApi.transactions.updateTransactions.mockResolvedValue(mockResponse);

      const result = await tool.execute({ budgetId, transactions });

      expect(result).toBe('Successfully updated 1 out of 1 transactions. Transaction IDs: transaction-1');
    });

    it('should handle mixed ID and import ID identification', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const transactions = [
        {
          id: 'transaction-1',
          amount: -10.00, // Expense
        },
        {
          importId: 'import-1',
          amount: 100.00, // Income
        },
      ];

      const mockResponse = {
        data: {
          transaction_ids: ['transaction-1', 'transaction-2'],
          duplicate_import_ids: [],
          transactions: [
            {
              id: 'transaction-1',
              amount: -10000, // Milliunits for -10.00
            },
            {
              id: 'transaction-2',
              importId: 'import-1',
              amount: 100000, // Milliunits for 100.00
            },
          ],
          server_knowledge: 123,
        },
      };

      mockApi.transactions.updateTransactions.mockResolvedValue(mockResponse);

      const result = await tool.execute({ budgetId, transactions });

      expect(result).toBe('Successfully updated 2 out of 2 transactions. Transaction IDs: transaction-1, transaction-2');
    });

    it('should handle minimal transaction updates', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const transactions = [
        {
          id: 'transaction-1',
          // Only updating the amount
          amount: -5.99, // Expense
        },
      ];

      const mockResponse = {
        data: {
          transaction_ids: ['transaction-1'],
          duplicate_import_ids: [],
          transactions: [
            {
              id: 'transaction-1',
              amount: -5990, // Milliunits for -5.99
            },
          ],
          server_knowledge: 123,
        },
      };

      mockApi.transactions.updateTransactions.mockResolvedValue(mockResponse);

      const result = await tool.execute({ budgetId, transactions });

      expect(result).toBe('Successfully updated 1 out of 1 transactions. Transaction IDs: transaction-1');
    });

    it('should handle null values in optional fields', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const transactions = [
        {
          id: 'transaction-1',
          payeeName: null,
          categoryId: null,
          memo: null,
          flagColor: null,
        },
      ];

      const mockResponse = {
        data: {
          transaction_ids: ['transaction-1'],
          duplicate_import_ids: [],
          transactions: [
            {
              id: 'transaction-1',
              payeeName: null,
              categoryId: null,
              memo: null,
              flagColor: null,
            },
          ],
          server_knowledge: 123,
        },
      };

      mockApi.transactions.updateTransactions.mockResolvedValue(mockResponse);

      const result = await tool.execute({ budgetId, transactions });

      expect(result).toBe('Successfully updated 1 out of 1 transactions. Transaction IDs: transaction-1');
    });
  });

  describe('schema validation', () => {
    it('should validate that either id or importId is provided', () => {
      const schema = tool.schema.shape.transactions;

      // Valid: only id provided
      expect(() => schema.parse([{ id: 'transaction-1', amount: 100 }])).not.toThrow();

      // Valid: only importId provided
      expect(() => schema.parse([{ importId: 'import-1', amount: 100 }])).not.toThrow();

      // Invalid: neither id nor importId provided
      expect(() => schema.parse([{ amount: 100 }])).toThrow();

      // Invalid: both id and importId provided
      expect(() => schema.parse([{ id: 'transaction-1', importId: 'import-1', amount: 100 }])).toThrow();
    });

    it('should validate date format', () => {
      const schema = tool.schema.shape.transactions;

      // Valid date format
      expect(() => schema.parse([{ id: 'transaction-1', date: '2024-12-19' }])).not.toThrow();

      // Invalid date format
      expect(() => schema.parse([{ id: 'transaction-1', date: '2024/12/19' }])).toThrow();
      expect(() => schema.parse([{ id: 'transaction-1', date: '12-19-2024' }])).toThrow();
    });
  });
});