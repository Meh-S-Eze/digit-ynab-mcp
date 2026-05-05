import { describe, it, expect, vi, beforeEach } from 'vitest';
import UpdateSingleTransactionTool from '../UpdateSingleTransactionTool';
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

describe('UpdateSingleTransactionTool', () => {
  let tool: UpdateSingleTransactionTool;
  let mockApi: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset environment variables
    delete process.env.YNAB_API_TOKEN;
    delete process.env.YNAB_BUDGET_ID;

    // Create mock API
    mockApi = {
      transactions: {
        updateTransaction: vi.fn(),
      },
    };

    (ynab.API as any).mockImplementation(() => mockApi);

    tool = new UpdateSingleTransactionTool();
  });

  describe('execute', () => {
    it('should return error when YNAB API token is not set', async () => {
      const result = await tool.execute({
        budgetId: 'test-budget',
        transactionId: 'transaction-1',
        amount: 1000,
      });

      expect(result).toBe('ERROR: YNAB API Token is not set. Please set YNAB_API_TOKEN environment variable.');
    });

    it('should return error when budget ID is missing', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';

      const result = await tool.execute({
        budgetId: '',
        transactionId: 'transaction-1',
        amount: 1000,
      });

      expect(result).toBe('ERROR: Budget ID is required. Get from list_budgets() first.');
    });

    it('should return error when transaction ID is missing', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';

      const result = await tool.execute({
        budgetId: 'test-budget',
        transactionId: '',
        amount: 1000,
      });

      expect(result).toBe('ERROR: Transaction ID is required. Get from analyze_transactions() first.');
    });

    it('should return error when no update fields are provided', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';

      const result = await tool.execute({
        budgetId: 'test-budget',
        transactionId: 'transaction-1'
      });

      expect(result).toBe('ERROR: At least one field to update is required. Specify amount, category, date, payee, memo, or cleared status.');
    });

    it('should update a single transaction successfully', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const transactionId = 'transaction-1';

      const mockResponse = {
        data: {
          transaction: {
            id: 'transaction-1',
            account_id: 'test-account-1',
            date: '2024-12-19',
            amount: -10990, // Milliunits for -10.99
            payee_name: 'Updated Payee',
            category_name: 'Test Category',
            memo: 'Updated transaction',
            cleared: 'cleared',
            approved: true,
          },
        },
      };

      mockApi.transactions.updateTransaction.mockResolvedValue(mockResponse);

      const result = await tool.execute({
        budgetId,
        transactionId,
        amount: -10.99,
        payeeName: 'Updated Payee',
        categoryId: 'category-1',
        memo: 'Updated transaction',
        cleared: 'cleared',
        approved: true,
      });

      expect(JSON.parse(result)).toEqual({
        id: 'transaction-1',
        date: '2024-12-19',
        amount: -10.99,
        payee_name: 'Updated Payee',
        category_name: 'Test Category',
        memo: 'Updated transaction',
        cleared: 'cleared',
        approved: true,
      });
    });

    it('should handle transaction not found error', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const transactionId = 'invalid-transaction-id';

      const apiError = new Error('Transaction not found');
      mockApi.transactions.updateTransaction.mockRejectedValue(apiError);

      const result = await tool.execute({
        budgetId,
        transactionId,
        amount: 100.00
      });

      expect(result).toBe(`ERROR updating transaction ${transactionId}: ${JSON.stringify(apiError)}`);
    });

    it('should handle API errors gracefully', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const transactionId = 'transaction-1';

      const apiError = new Error('Invalid transaction data');
      mockApi.transactions.updateTransaction.mockRejectedValue(apiError);

      const result = await tool.execute({
        budgetId,
        transactionId,
        amount: -50.00
      });

      expect(result).toBe(`ERROR updating transaction ${transactionId}: ${JSON.stringify(apiError)}`);
    });

    it('should handle network errors', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const transactionId = 'transaction-1';

      const networkError = new Error('Network timeout');
      mockApi.transactions.updateTransaction.mockRejectedValue(networkError);

      const result = await tool.execute({
        budgetId,
        transactionId,
        amount: -75.25
      });

      expect(result).toBe(`ERROR updating transaction ${transactionId}: ${JSON.stringify(networkError)}`);
    });

    it('should handle transactions with all optional fields', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const transactionId = 'transaction-1';

      const mockResponse = {
        data: {
          transaction: {
            id: 'transaction-1',
            account_id: 'new-account',
            date: '2024-12-20',
            amount: 2500000, // Milliunits for 2500.00
            payee_name: 'Updated Payee',
            category_name: 'Test Category',
            memo: 'Updated memo',
            cleared: 'cleared',
            approved: true,
          },
        },
      };

      mockApi.transactions.updateTransaction.mockResolvedValue(mockResponse);

      const result = await tool.execute({
        budgetId,
        transactionId,
        accountId: 'new-account',
        date: '2024-12-20',
        amount: 2500.00,
        payeeName: 'Updated Payee',
        payeeId: 'payee-1',
        categoryId: 'category-1',
        memo: 'Updated memo',
        cleared: 'cleared',
        approved: true,
        flagColor: 'red',
      });

      expect(JSON.parse(result)).toEqual({
        id: 'transaction-1',
        date: '2024-12-20',
        amount: 2500.00,
        payee_name: 'Updated Payee',
        category_name: 'Test Category',
        memo: 'Updated memo',
        cleared: 'cleared',
        approved: true,
      });
    });

    it('should handle minimal transaction updates', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const transactionId = 'transaction-1';

      const mockResponse = {
        data: {
          transaction: {
            id: 'transaction-1',
            account_id: 'test-account-1',
            date: '2024-12-19',
            amount: -5990, // Milliunits for -5.99
            payee_name: null,
            category_name: null,
            memo: null,
            cleared: 'uncleared',
            approved: false,
          },
        },
      };

      mockApi.transactions.updateTransaction.mockResolvedValue(mockResponse);

      const result = await tool.execute({
        budgetId,
        transactionId,
        amount: -5.99
      });

      expect(JSON.parse(result)).toEqual({
        id: 'transaction-1',
        date: '2024-12-19',
        amount: -5.99,
        payee_name: null,
        category_name: null,
        memo: null,
        cleared: 'uncleared',
        approved: false,
      });
    });

    it('should handle null values in optional fields', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const transactionId = 'transaction-1';

      const mockResponse = {
        data: {
          transaction: {
            id: 'transaction-1',
            account_id: 'test-account-1',
            date: '2024-12-19',
            amount: -1000,
            payee_name: null,
            category_name: null,
            memo: null,
            cleared: 'uncleared',
            approved: false,
          },
        },
      };

      mockApi.transactions.updateTransaction.mockResolvedValue(mockResponse);

      const result = await tool.execute({
        budgetId,
        transactionId,
        payeeName: null,
        categoryId: null,
        memo: null,
        flagColor: null,
      });

      expect(JSON.parse(result)).toEqual({
        id: 'transaction-1',
        date: '2024-12-19',
        amount: -1.00,
        payee_name: null,
        category_name: null,
        memo: null,
        cleared: 'uncleared',
        approved: false,
      });
    });

    it('should handle partial field updates', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const transactionId = 'transaction-1';

      const mockResponse = {
        data: {
          transaction: {
            id: 'transaction-1',
            account_id: 'test-account-1',
            date: '2024-12-19',
            amount: -1000,
            payee_name: 'Original Payee',
            category_name: 'Original Category',
            memo: 'Updated memo only',
            cleared: 'uncleared',
            approved: true,
          },
        },
      };

      mockApi.transactions.updateTransaction.mockResolvedValue(mockResponse);

      const result = await tool.execute({
        budgetId,
        transactionId,
        memo: 'Updated memo only',
        approved: true,
      });

      expect(JSON.parse(result)).toEqual({
        id: 'transaction-1',
        date: '2024-12-19',
        amount: -1.00,
        payee_name: 'Original Payee',
        category_name: 'Original Category',
        memo: 'Updated memo only',
        cleared: 'uncleared',
        approved: true,
      });
    });
  });

  describe('schema validation', () => {
    it('should validate date format', () => {
      const schema = tool.schema.shape.date;

      // Valid date format
      expect(() => schema.parse('2024-12-19')).not.toThrow();

      // Invalid date format
      expect(() => schema.parse('2024/12/19')).toThrow();
      expect(() => schema.parse('12-19-2024')).toThrow();
    });

    it('should validate cleared status enum', () => {
      const schema = tool.schema.shape.cleared;

      // Valid cleared status
      expect(() => schema.parse('cleared')).not.toThrow();
      expect(() => schema.parse('uncleared')).not.toThrow();
      expect(() => schema.parse('reconciled')).not.toThrow();

      // Invalid cleared status
      expect(() => schema.parse('invalid')).toThrow();
    });
  });
});