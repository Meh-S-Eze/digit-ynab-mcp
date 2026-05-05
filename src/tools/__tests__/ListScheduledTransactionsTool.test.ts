import { describe, it, expect, vi, beforeEach } from 'vitest';
import ListScheduledTransactionsTool from '../ListScheduledTransactionsTool';
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

describe('ListScheduledTransactionsTool', () => {
    let tool: ListScheduledTransactionsTool;
    let mockApi: any;
    let mockCache: any;

    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.YNAB_API_TOKEN;
        delete process.env.YNAB_BUDGET_ID;

        mockApi = {
            scheduledTransactions: {
                getScheduledTransactions: vi.fn(),
            },
        };
        (ynab.API as any).mockImplementation(() => mockApi);

        mockCache = {
            get: vi.fn(),
            set: vi.fn(),
        };
        (Cache.getInstance as any).mockReturnValue(mockCache);

        tool = new ListScheduledTransactionsTool();
    });

    it('should return error when YNAB API token is not set', async () => {
        const result = await tool.execute({});
        expect(result).toBe('YNAB API Token is not set');
    });

    it('should return list of scheduled transactions correctly transformed', async () => {
        process.env.YNAB_API_TOKEN = 'test-token';
        mockCache.get.mockReturnValue(null);

        const mockScheduled = [
            { id: 's1', date_first: '2025-01-01', date_next: '2025-02-01', frequency: 'monthly', amount: -50000, memo: 'Rent', account_name: 'Checking', payee_name: 'Landlord', category_name: 'Rent', deleted: false },
        ];

        mockApi.scheduledTransactions.getScheduledTransactions.mockResolvedValue({
            data: {
                scheduled_transactions: mockScheduled
            }
        });

        const result: any = await tool.execute({ budgetId: 'test-budget' });

        expect(result).toHaveLength(1);
        expect(result[0].memo).toBe('Rent');
        expect(result[0].amount).toBe(-50.00);
        expect(mockCache.set).toHaveBeenCalled();
    });
});