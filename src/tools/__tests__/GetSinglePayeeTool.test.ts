import { describe, it, expect, vi, beforeEach } from 'vitest';
import GetSinglePayeeTool from '../GetSinglePayeeTool';
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

describe('GetSinglePayeeTool', () => {
  let tool: GetSinglePayeeTool;
  let mockApi: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset environment variables
    delete process.env.YNAB_API_TOKEN;

    // Create mock API
    mockApi = {
      payees: {
        getPayeeById: vi.fn(),
      },
    };

    (ynab.API as any).mockImplementation(() => mockApi);

    tool = new GetSinglePayeeTool();
  });

  describe('execute', () => {
    it('should return error when YNAB API token is not set', async () => {
      const result = await tool.execute({ budgetId: 'test-budget', payeeId: 'test-payee' });

      expect(result).toBe('YNAB API Token is not set');
    });

    it('should return error when budget ID is missing', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';

      const result = await tool.execute({ budgetId: '', payeeId: 'test-payee' });

      expect(result).toBe('Budget ID is required. Please provide a budget ID.');
    });

    it('should return error when payee ID is missing', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';

      const result = await tool.execute({ budgetId: 'test-budget', payeeId: '' });

      expect(result).toBe('Payee ID is required. Please provide a payee ID.');
    });

    it('should successfully retrieve single payee when valid parameters are provided', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const payeeId = 'test-payee-id';

      const mockPayeeResponse = {
        data: {
          payee: {
            id: 'test-payee-id',
            name: 'Test Payee',
            transfer_account_id: 'account-1',
            deleted: false,
          },
        },
      };

      mockApi.payees.getPayeeById.mockResolvedValue(mockPayeeResponse);

      const result = await tool.execute({ budgetId, payeeId });

      expect(mockApi.payees.getPayeeById).toHaveBeenCalledWith(budgetId, payeeId);
      expect(result).toEqual({
        id: 'test-payee-id',
        name: 'Test Payee',
        transfer_account_id: 'account-1',
        deleted: false,
      });
    });

    it('should handle payee with null transfer_account_id', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const payeeId = 'test-payee-id';

      const mockPayeeResponse = {
        data: {
          payee: {
            id: 'test-payee-id',
            name: 'Test Payee',
            transfer_account_id: null,
            deleted: false,
          },
        },
      };

      mockApi.payees.getPayeeById.mockResolvedValue(mockPayeeResponse);

      const result = await tool.execute({ budgetId, payeeId });

      expect(result).toEqual({
        id: 'test-payee-id',
        name: 'Test Payee',
        transfer_account_id: null,
        deleted: false,
      });
    });

    it('should handle deleted payee', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const payeeId = 'test-payee-id';

      const mockPayeeResponse = {
        data: {
          payee: {
            id: 'test-payee-id',
            name: 'Deleted Payee',
            transfer_account_id: null,
            deleted: true,
          },
        },
      };

      mockApi.payees.getPayeeById.mockResolvedValue(mockPayeeResponse);

      const result = await tool.execute({ budgetId, payeeId });

      expect(result).toEqual({
        id: 'test-payee-id',
        name: 'Deleted Payee',
        transfer_account_id: null,
        deleted: true,
      });
    });

    it('should handle API errors gracefully', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const payeeId = 'invalid-payee-id';
      const apiError = new Error('Payee not found');

      mockApi.payees.getPayeeById.mockRejectedValue(apiError);

      const result = await tool.execute({ budgetId, payeeId });

      expect(result).toBe(`Error getting payee ${payeeId} for budget ${budgetId}: ${JSON.stringify(apiError)}`);
    });

    it('should handle network errors', async () => {
      process.env.YNAB_API_TOKEN = 'test-token';
      const budgetId = 'test-budget-id';
      const payeeId = 'test-payee-id';
      const networkError = new Error('Network timeout');

      mockApi.payees.getPayeeById.mockRejectedValue(networkError);

      const result = await tool.execute({ budgetId, payeeId });

      expect(result).toBe(`Error getting payee ${payeeId} for budget ${budgetId}: ${JSON.stringify(networkError)}`);
    });
  });
});