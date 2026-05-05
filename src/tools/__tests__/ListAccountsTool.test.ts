import { describe, it, expect, vi, beforeEach } from 'vitest';
import ListAccountsTool from '../ListAccountsTool';
import * as ynab from 'ynab';
import { Cache } from '../../utils/Cache';

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

// Mock the Cache
vi.mock('../../utils/Cache', () => ({
    Cache: {
        getInstance: vi.fn(),
    },
}));

describe('ListAccountsTool', () => {
    let tool: ListAccountsTool;
    let mockApi: any;
    let mockCache: any;

    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.YNAB_API_TOKEN;
        delete process.env.YNAB_BUDGET_ID;

        mockApi = {
            accounts: {
                getAccounts: vi.fn(),
            },
        };
        (ynab.API as any).mockImplementation(() => mockApi);

        mockCache = {
            get: vi.fn(),
            set: vi.fn(),
        };
        (Cache.getInstance as any).mockReturnValue(mockCache);

        tool = new ListAccountsTool();
    });

    it('should return error when YNAB API token is not set', async () => {
        const result = await tool.execute({});
        expect(result).toBe('YNAB API Token is not set');
    });

    it('should return list of accounts correctly transformed', async () => {
        process.env.YNAB_API_TOKEN = 'test-token';
        mockCache.get.mockReturnValue(null);

        const mockAccounts = [
            { id: 'a1', name: 'Checking', type: 'checking', on_budget: true, closed: false, balance: 1000000, cleared_balance: 900000, uncleared_balance: 100000, deleted: false },
            { id: 'a2', name: 'Savings', type: 'savings', on_budget: true, closed: false, balance: 5000000, cleared_balance: 5000000, uncleared_balance: 0, deleted: false },
        ];

        mockApi.accounts.getAccounts.mockResolvedValue({
            data: {
                accounts: mockAccounts
            }
        });

        const result: any = await tool.execute({ budgetId: 'test-budget' });

        expect(result).toHaveLength(2);
        expect(result[0].name).toBe('Checking');
        expect(result[0].balance).toBe(1000.00);
        expect(result[1].balance).toBe(5000.00);
        expect(mockCache.set).toHaveBeenCalled();
    });
});