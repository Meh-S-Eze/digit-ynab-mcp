import { describe, it, expect, vi, beforeEach } from 'vitest';
import GetPayeesTool from '../GetPayeesTool';
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

describe('GetPayeesTool', () => {
  let tool: GetPayeesTool;
  let mockApi: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset environment variables
    delete process.env.YNAB_API_TOKEN;
    delete process.env.YNAB_BUDGET_ID;

    // Create mock API
    mockApi = {
      payees: {
        getPayees: vi.fn(),
      },
    };

    (ynab.API as any).mockImplementation(() => mockApi);

    tool = new GetPayeesTool();
  });

  describe('execute', () => {
    it('should return error when YNAB API token is not set', async () => {
      const result = await tool.execute({});

      expect(result).toBe('YNAB API Token is not set');
    });

    it('should return error when no budget ID is provided', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';

      const result = await tool.execute({});

      expect(result).toBe('No budget ID provided. Please provide a budget ID or set the YNAB_BUDGET_ID environment variable. Use the ListBudgets tool to get a list of available budgets.');
    });

    it('should successfully retrieve payees when valid parameters are provided', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';

      const mockPayeesResponse = {
        data: {
          payees: [
            {
              id: 'payee-1',
              name: 'Test Payee 1',
              transfer_account_id: null,
              deleted: false,
            },
            {
              id: 'payee-2',
              name: 'Test Payee 2',
              transfer_account_id: 'account-1',
              deleted: false,
            },
          ],
          server_knowledge: 123,
        },
      };

      mockApi.payees.getPayees.mockResolvedValue(mockPayeesResponse);

      const result = await tool.execute({ budgetId });

      expect(mockApi.payees.getPayees).toHaveBeenCalledWith(budgetId);
      expect(result).toEqual([
        {
          id: 'payee-1',
          name: 'Test Payee 1',
          transfer_account_id: null,
          deleted: false,
        },
        {
          id: 'payee-2',
          name: 'Test Payee 2',
          transfer_account_id: 'account-1',
          deleted: false,
        },
      ]);
    });

    it('should use environment variable budget ID when not provided in input', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      process.env.YNAB_BUDGET_ID = 'env-budget-id';

      // Recreate tool after setting environment variables
      tool = new GetPayeesTool();

      const mockPayeesResponse = {
        data: {
          payees: [],
          server_knowledge: 0,
        },
      };

      mockApi.payees.getPayees.mockResolvedValue(mockPayeesResponse);

      await tool.execute({});

      expect(mockApi.payees.getPayees).toHaveBeenCalledWith('env-budget-id');
    });

    it('should handle API errors gracefully', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const apiError = new Error('API Error');

      mockApi.payees.getPayees.mockRejectedValue(apiError);

      const result = await tool.execute({ budgetId });

      expect(result).toBe(`Error getting payees for budget ${budgetId}: ${JSON.stringify(apiError)}`);
    });

    it('should handle empty payees list', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';

      const mockPayeesResponse = {
        data: {
          payees: [],
          server_knowledge: 0,
        },
      };

      mockApi.payees.getPayees.mockResolvedValue(mockPayeesResponse);

      const result = await tool.execute({ budgetId });

      expect(result).toEqual([]);
    });
  });
});