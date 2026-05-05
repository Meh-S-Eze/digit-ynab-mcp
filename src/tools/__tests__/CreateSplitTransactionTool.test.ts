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

describe('CreateSplitTransactionTool', () => {
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

  it('should update a transaction to be split successfully', async () => {
    process.env.YNAB_API_TOKEN = 'test-token';

    const mockTransaction = {
      id: 'txn-123',
      date: '2025-01-15',
      amount: -50000, // -50.00 in milliunits
      payee_name: 'Grocery Store',
      memo: 'Weekly groceries',
      account_name: 'Checking',
      subtransactions: [
        {
          id: 'sub-1',
          amount: -25000, // -25.00
          category_name: 'Food',
          memo: 'Produce',
          payee_name: null,
        },
        {
          id: 'sub-2',
          amount: -25000, // -25.00
          category_name: 'Household',
          memo: 'Cleaning supplies',
          payee_name: null,
        },
      ],
    };

    mockApi.transactions.updateTransaction.mockResolvedValue({
      data: {
        transaction: mockTransaction,
      },
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
        {
          categoryId: 'cat-food',
          amount: -25.00,
          memo: 'Produce',
        },
        {
          categoryId: 'cat-household',
          amount: -25.00,
          memo: 'Cleaning supplies',
        },
      ],
    };

    const result = await tool.execute(input);

    expect(mockApi.transactions.updateTransaction).toHaveBeenCalledWith('budget-123', 'txn-123', {
      transaction: {
        account_id: 'account-456',
        date: '2025-01-15',
        amount: -50000,
        payee_name: 'Grocery Store',
        memo: 'Weekly groceries',
        category_id: null,
        subtransactions: [
          {
            amount: -25000,
            category_id: 'cat-food',
            memo: 'Produce',
          },
          {
            amount: -25000,
            category_id: 'cat-household',
            memo: 'Cleaning supplies',
          },
        ],
      },
    });

    expect(result).toContain('Successfully updated transaction txn-123');
    expect(result).toContain('2025-01-15');
    expect(result).toContain('-50');
    expect(result).toContain('Grocery Store');
  });

  it('should return error when API token is not set', async () => {
    const result = await tool.execute({
      budgetId: 'budget-123',
      transactionId: 'txn-123',
      accountId: 'account-456',
      date: '2025-01-15',
      amount: -50.00,
      subtransactions: [
        { categoryId: 'cat-1', amount: -25.00 },
        { categoryId: 'cat-2', amount: -25.00 },
      ],
    });

    expect(result).toBe('YNAB API Token is not set');
  });

  it('should return error when budget ID is missing', async () => {
    process.env.YNAB_API_TOKEN = 'test-token';

    const result = await tool.execute({
      budgetId: '',
      transactionId: 'txn-123',
      accountId: 'account-456',
      date: '2025-01-15',
      amount: -50.00,
      subtransactions: [
        { categoryId: 'cat-1', amount: -25.00 },
        { categoryId: 'cat-2', amount: -25.00 },
      ],
    });

    expect(result).toBe('Budget ID is required. Please provide a budget ID.');
  });

  it('should return error when transaction ID is missing', async () => {
    process.env.YNAB_API_TOKEN = 'test-token';

    const result = await tool.execute({
      budgetId: 'budget-123',
      transactionId: '',
      accountId: 'account-456',
      date: '2025-01-15',
      amount: -50.00,
      subtransactions: [
        { categoryId: 'cat-1', amount: -25.00 },
        { categoryId: 'cat-2', amount: -25.00 },
      ],
    });

    expect(result).toBe('Transaction ID is required. Please provide a transaction ID.');
  });

  it('should return error when less than 2 subtransactions', async () => {
    process.env.YNAB_API_TOKEN = 'test-token';

    const result = await tool.execute({
      budgetId: 'budget-123',
      transactionId: 'txn-123',
      accountId: 'account-456',
      date: '2025-01-15',
      amount: -50.00,
      subtransactions: [
        { categoryId: 'cat-1', amount: -50.00 },
      ],
    });

    expect(result).toBe('At least 2 subtransactions are required for a split transaction.');
  });

  it('should return error when subtransaction amounts do not match total', async () => {
    process.env.YNAB_API_TOKEN = 'test-token';

    const result = await tool.execute({
      budgetId: 'budget-123',
      transactionId: 'txn-123',
      accountId: 'account-456',
      date: '2025-01-15',
      amount: -50.00,
      subtransactions: [
        { categoryId: 'cat-1', amount: -20.00 },
        { categoryId: 'cat-2', amount: -25.00 },
      ],
    });

    expect(result).toContain('Subtransaction amounts (-45) do not match total amount (-50)');
  });

  it('should calculate total amount if not provided', async () => {
    process.env.YNAB_API_TOKEN = 'test-token';

    const mockTransaction = {
      id: 'txn-123',
      date: '2025-01-15',
      amount: -50000,
      payee_name: 'Grocery Store',
      memo: 'Weekly groceries',
      account_name: 'Checking',
      subtransactions: [
        { id: 'sub-1', amount: -25000, category_name: 'Food', memo: 'Produce', payee_name: null },
        { id: 'sub-2', amount: -25000, category_name: 'Household', memo: 'Cleaning supplies', payee_name: null },
      ],
    };

    mockApi.transactions.updateTransaction.mockResolvedValue({
      data: {
        transaction: mockTransaction,
      },
    });

    const input = {
      budgetId: 'budget-123',
      transactionId: 'txn-123',
      // amount is missing, should be calculated
      subtransactions: [
        { categoryId: 'cat-food', amount: -25.00, memo: 'Produce' },
        { categoryId: 'cat-household', amount: -25.00, memo: 'Cleaning supplies' },
      ],
    };

    await tool.execute(input);

    expect(mockApi.transactions.updateTransaction).toHaveBeenCalledWith('budget-123', 'txn-123', expect.objectContaining({
      transaction: expect.objectContaining({
        amount: -50000, // Calculated from -25 + -25
      }),
    }));
  });

  it('should handle API errors gracefully', async () => {
    process.env.YNAB_API_TOKEN = 'test-token';

    mockApi.transactions.updateTransaction.mockRejectedValue(new Error('API Error'));

    const result = await tool.execute({
      budgetId: 'budget-123',
      transactionId: 'txn-123',
      accountId: 'account-456',
      date: '2025-01-15',
      amount: -50.00,
      subtransactions: [
        { categoryId: 'cat-1', amount: -25.00 },
        { categoryId: 'cat-2', amount: -25.00 },
      ],
    });

    expect(result).toContain('Error updating split transaction');
  });

  it('should handle case when no transaction is returned', async () => {
    process.env.YNAB_API_TOKEN = 'test-token';

    mockApi.transactions.updateTransaction.mockResolvedValue({
      data: {},
    });

    const result = await tool.execute({
      budgetId: 'budget-123',
      transactionId: 'txn-123',
      accountId: 'account-456',
      date: '2025-01-15',
      amount: -50.00,
      subtransactions: [
        { categoryId: 'cat-1', amount: -25.00 },
        { categoryId: 'cat-2', amount: -25.00 },
      ],
    });

    expect(result).toContain('Transaction update failed - no transaction data returned');
  });
});