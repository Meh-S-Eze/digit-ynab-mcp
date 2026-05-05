import { describe, it, expect, vi, beforeEach } from 'vitest';
import CreateSplitTransactionTool from '../CreateSplitTransactionTool';
import CreateMultipleTransactionsTool from '../CreateMultipleTransactionsTool';
import UpdateSingleTransactionTool from '../UpdateSingleTransactionTool';
import * as ynab from 'ynab';

// Mock the ynab module
vi.mock('ynab', () => ({
  API: vi.fn(),
}));

// Mock the mcp-framework logger
vi.mock('mcp-framework', () => ({
  MCPTool: class MockMCPTool { constructor() {} },
  SerializingMCPTool: class MockSerializingMCPTool { constructor() {} },
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Comprehensive Split Transaction Test Suite', () => {
  let splitTool: CreateSplitTransactionTool;
  let multipleTool: CreateMultipleTransactionsTool;
  let updateTool: UpdateSingleTransactionTool;
  let mockApi: any;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.YNAB_API_TOKEN;

    mockApi = {
      transactions: {
        updateTransaction: vi.fn(),
        createTransaction: vi.fn(),
      },
    };

    (ynab.API as any).mockImplementation(() => mockApi);

    splitTool = new CreateSplitTransactionTool();
    multipleTool = new CreateMultipleTransactionsTool();
    updateTool = new UpdateSingleTransactionTool();
  });

  describe('CreateSplitTransactionTool - Response Format Fix', () => {
    it('should return JSON string instead of structured object', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';

      const mockTransaction = {
        id: 'txn-123',
        date: '2025-01-15',
        amount: -50000,
        payee_name: 'Grocery Store',
        memo: 'Weekly groceries',
        account_name: 'Checking',
        subtransactions: [
          { id: 'sub-1', amount: -25000, category_name: 'Food', memo: 'Produce' },
          { id: 'sub-2', amount: -25000, category_name: 'Household', memo: 'Cleaning supplies' },
        ],
      };

      mockApi.transactions.updateTransaction.mockResolvedValue({
        data: { transaction: mockTransaction },
      });

      const input = {
        budgetId: 'budget-123',
        transactionId: 'txn-123',
        accountId: 'account-456',
        date: '2025-01-15',
        amount: -50.00,
        payeeName: 'Grocery Store',
        memo: 'Weekly groceries',
        subtransactions: [
          { categoryId: 'cat-food', amount: -25.00, memo: 'Produce' },
          { categoryId: 'cat-household', amount: -25.00, memo: 'Cleaning supplies' },
        ],
      };

      const result = await splitTool.execute(input);

      // Verify it returns a JSON string
      expect(typeof result).toBe('string');

      // Verify the JSON can be parsed
      const parsedResult = JSON.parse(result);
      expect(parsedResult).toEqual({
        success: true,
        message: 'Successfully split transaction into 2 categories',
        transaction_id: 'txn-123',
        subtransaction_count: 2,
        total_amount: -50,
      });
    });

    it('should handle errors and return JSON string', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';

      mockApi.transactions.updateTransaction.mockRejectedValue(new Error('API Error'));

      const result = await splitTool.execute({
        budgetId: 'budget-123',
        transactionId: 'txn-123',
        subtransactions: [
          { categoryId: 'cat-1', amount: -25.00 },
          { categoryId: 'cat-2', amount: -25.00 },
        ],
      });

      // Verify it returns a JSON string
      expect(typeof result).toBe('string');

      // Verify it returns a string (error case returns plain string, not JSON)
      expect(typeof result).toBe('string');
      expect(result).toContain('Error updating split transaction');
    });
  });

  describe('CreateMultipleTransactionsTool - Subtransactions Support', () => {
    it('should handle transactions with subtransactions', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';

      const mockResponse = {
        data: {
          transaction_ids: ['transaction-1'],
          duplicate_import_ids: [],
          transactions: [
            {
              id: 'transaction-1',
              accountId: 'test-account',
              date: '2024-12-19',
              amount: -100000, // -100 in milliunits
              payeeName: 'Walmart',
              categoryId: null, // Split transactions have null category_id
              memo: 'Split transaction',
              cleared: 'uncleared',
              approved: false,
              subtransactions: [
                { id: 'sub-1', amount: -80000, category_name: 'Groceries' },
                { id: 'sub-2', amount: -20000, category_name: 'Gifts' },
              ],
            },
          ],
          server_knowledge: 123,
        },
      };

      mockApi.transactions.createTransaction.mockResolvedValue(mockResponse);

      const input = {
        budgetId: 'test-budget-id',
        transactions: [
          {
            accountId: 'test-account',
            date: '2024-12-19',
            amount: -100,
            payeeName: 'Walmart',
            memo: 'Split transaction',
            subtransactions: [
              { categoryId: 'cat-groceries', amount: -80, memo: 'Groceries' },
              { categoryId: 'cat-gifts', amount: -20, memo: 'Gifts' },
            ],
          },
        ],
      };

      const result = await multipleTool.execute(input);

      // Verify it returns a JSON string
      expect(typeof result).toBe('string');

      // Verify the JSON can be parsed
      const parsedResult = JSON.parse(result);
      expect(parsedResult).toEqual({
        total_requested: 1,
        total_created: 1,
        duplicates_found: 0,
        transaction_ids: ['transaction-1'],
      });

      // Verify the API was called with subtransactions
      expect(mockApi.transactions.createTransaction).toHaveBeenCalledWith(
        'test-budget-id',
        expect.objectContaining({
          transactions: expect.arrayContaining([
            expect.objectContaining({
              account_id: 'test-account',
              date: '2024-12-19',
              amount: -100000,
              payee_name: 'Walmart',
              memo: 'Split transaction',
              subtransactions: expect.arrayContaining([
                expect.objectContaining({
                  amount: -80000,
                  category_id: 'cat-groceries',
                  memo: 'Groceries',
                }),
                expect.objectContaining({
                  amount: -20000,
                  category_id: 'cat-gifts',
                  memo: 'Gifts',
                }),
              ]),
            }),
          ]),
        })
      );
    });

    it('should handle transactions without subtransactions (backward compatibility)', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';

      const mockResponse = {
        data: {
          transaction_ids: ['transaction-1'],
          duplicate_import_ids: [],
          transactions: [
            {
              id: 'transaction-1',
              accountId: 'test-account',
              date: '2024-12-19',
              amount: -50000, // -50 in milliunits
              payeeName: 'Target',
              categoryId: 'cat-groceries',
              memo: 'Regular transaction',
              cleared: 'uncleared',
              approved: false,
            },
          ],
          server_knowledge: 123,
        },
      };

      mockApi.transactions.createTransaction.mockResolvedValue(mockResponse);

      const input = {
        budgetId: 'test-budget-id',
        transactions: [
          {
            accountId: 'test-account',
            date: '2024-12-19',
            amount: -50,
            payeeName: 'Target',
            categoryId: 'cat-groceries',
            memo: 'Regular transaction',
          },
        ],
      };

      const result = await multipleTool.execute(input);

      // Verify it returns a JSON string
      expect(typeof result).toBe('string');

      // Verify the JSON can be parsed
      const parsedResult = JSON.parse(result);
      expect(parsedResult).toEqual({
        total_requested: 1,
        total_created: 1,
        duplicates_found: 0,
        transaction_ids: ['transaction-1'],
      });

      // Verify the API was called without subtransactions
      expect(mockApi.transactions.createTransaction).toHaveBeenCalledWith(
        'test-budget-id',
        {
          transactions: [
            {
              account_id: 'test-account',
              date: '2024-12-19',
              amount: -50000,
              payee_name: 'Target',
              category_id: 'cat-groceries',
              memo: 'Regular transaction',
            },
          ],
        }
      );
    });
  });

  describe('UpdateSingleTransactionTool - Response Format Fix', () => {
    it('should return JSON string instead of structured object', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';

      const mockTransaction = {
        id: 'txn-123',
        date: '2025-01-15',
        amount: -50000, // -50 in milliunits
        payee_name: 'Updated Payee',
        category_name: 'Updated Category',
        memo: 'Updated memo',
        cleared: 'cleared',
        approved: true,
      };

      mockApi.transactions.updateTransaction.mockResolvedValue({
        data: { transaction: mockTransaction },
      });

      const input = {
        budgetId: 'budget-123',
        transactionId: 'txn-123',
        accountId: 'account-456',
        date: '2025-01-15',
        amount: -50.00,
        payeeName: 'Updated Payee',
        categoryId: 'cat-updated',
        memo: 'Updated memo',
        cleared: 'cleared' as const,
        approved: true,
      };

      const result = await updateTool.execute(input);

      // Verify it returns a JSON string
      expect(typeof result).toBe('string');

      // Verify the JSON can be parsed
      const parsedResult = JSON.parse(result);
      expect(parsedResult).toEqual({
        id: 'txn-123',
        date: '2025-01-15',
        amount: -50,
        payee_name: 'Updated Payee',
        category_name: 'Updated Category',
        memo: 'Updated memo',
        cleared: 'cleared',
        approved: true,
      });
    });

    it('should handle null/undefined values properly', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';

      const mockTransaction = {
        id: 'txn-123',
        date: '2025-01-15',
        amount: -50000,
        payee_name: null,
        category_name: null,
        memo: null,
        cleared: 'uncleared',
        approved: false,
      };

      mockApi.transactions.updateTransaction.mockResolvedValue({
        data: { transaction: mockTransaction },
      });

      const input = {
        budgetId: 'budget-123',
        transactionId: 'txn-123',
        accountId: 'account-456',
        date: '2025-01-15',
        amount: -50.00,
        payeeName: null,
        categoryId: null,
        memo: null,
        cleared: 'uncleared' as const,
        approved: false,
      };

      const result = await updateTool.execute(input);

      // Verify it returns a JSON string
      expect(typeof result).toBe('string');

      // Verify the JSON can be parsed and null values are preserved
      const parsedResult = JSON.parse(result);
      expect(parsedResult).toEqual({
        id: 'txn-123',
        date: '2025-01-15',
        amount: -50,
        payee_name: null,
        category_name: null,
        memo: null,
        cleared: 'uncleared',
        approved: false,
      });
    });
  });

  describe('Integration Test - End-to-End Split Transaction Workflow', () => {
    it('should create a split transaction using CreateMultipleTransactionsTool', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';

      const mockResponse = {
        data: {
          transaction_ids: ['split-txn-123'],
          duplicate_import_ids: [],
          transactions: [
            {
              id: 'split-txn-123',
              accountId: 'test-account',
              date: '2025-01-15',
              amount: -100000, // -100 in milliunits
              payee_name: 'Walmart',
              category_name: null, // Split transactions have null category_name
              memo: 'Split: $80 groceries, $20 gifts',
              cleared: 'uncleared',
              approved: false,
              subtransactions: [
                { id: 'sub-1', amount: -80000, category_name: 'Groceries' },
                { id: 'sub-2', amount: -20000, category_name: 'Gifts' },
              ],
            },
          ],
          server_knowledge: 123,
        },
      };

      mockApi.transactions.createTransaction.mockResolvedValue(mockResponse);

      // Create a split transaction using CreateMultipleTransactionsTool
      const input = {
        budgetId: 'test-budget-id',
        transactions: [
          {
            accountId: 'test-account',
            date: '2025-01-15',
            amount: -100,
            payeeName: 'Walmart',
            memo: 'Split: $80 groceries, $20 gifts',
            subtransactions: [
              { categoryId: 'cat-groceries', amount: -80, memo: 'Groceries' },
              { categoryId: 'cat-gifts', amount: -20, memo: 'Gifts' },
            ],
          },
        ],
      };

      const result = await multipleTool.execute(input);

      // Verify the result
      expect(typeof result).toBe('string');
      const parsedResult = JSON.parse(result);
      expect(parsedResult.total_created).toBe(1);
      expect(parsedResult.transaction_ids).toContain('split-txn-123');

      // Verify the API call included subtransactions
      expect(mockApi.transactions.createTransaction).toHaveBeenCalledWith(
        'test-budget-id',
        expect.objectContaining({
          transactions: expect.arrayContaining([
            expect.objectContaining({
              account_id: 'test-account',
              date: '2025-01-15',
              amount: -100000,
              payee_name: 'Walmart',
              memo: 'Split: $80 groceries, $20 gifts',
              subtransactions: expect.arrayContaining([
                expect.objectContaining({
                  amount: -80000,
                  category_id: 'cat-groceries',
                  memo: 'Groceries',
                }),
                expect.objectContaining({
                  amount: -20000,
                  category_id: 'cat-gifts',
                  memo: 'Gifts',
                }),
              ]),
            }),
          ]),
        })
      );
    });
  });
});