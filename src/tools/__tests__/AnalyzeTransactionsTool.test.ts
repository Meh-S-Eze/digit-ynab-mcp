import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AnalyzeTransactionsTool from '../AnalyzeTransactionsTool';
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

describe('AnalyzeTransactionsTool', () => {
    let tool: AnalyzeTransactionsTool;
    let mockApi: any;
    let mockCache: any;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-01T12:00:00.000Z'));
        delete process.env.YNAB_API_TOKEN;
        delete process.env.YNAB_BUDGET_ID;
        delete process.env.YNAB_MAX_IMPORT_HISTORY_DAYS;

        mockApi = {
            transactions: {
                getTransactions: vi.fn(),
                getTransactionsByAccount: vi.fn(),
                getTransactionsByCategory: vi.fn(),
            },
        };
        (ynab.API as any).mockImplementation(() => mockApi);

        mockCache = {
            get: vi.fn(),
            set: vi.fn(),
        };
        (Cache.getInstance as any).mockReturnValue(mockCache);

        tool = new AnalyzeTransactionsTool();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should return error when YNAB API token is not set', async () => {
        const result = await tool.execute({});
        expect(result).toContain('YNAB API Token is not set');
    });

    it('should return cached results if available', async () => {
        process.env.YNAB_API_TOKEN = 'test-token';
        const cachedData = { some: 'cached data' };
        mockCache.get.mockReturnValue(cachedData);

        const result = await tool.execute({ budgetId: 'test-budget' });

        expect(JSON.parse(result as string)).toEqual(cachedData);
        expect(mockCache.get).toHaveBeenCalled();
        expect(mockApi.transactions.getTransactions).not.toHaveBeenCalled();
    });

    it('should fetch all transactions when no filters are provided', async () => {
        process.env.YNAB_API_TOKEN = 'test-token';
        mockCache.get.mockReturnValue(null);
        mockApi.transactions.getTransactions.mockResolvedValue({
            data: {
                transactions: [
                    { id: '1', date: '2025-01-01', amount: -10000, memo: 'test', payee_name: 'P', category_name: 'C', account_name: 'A', cleared: 'cleared', approved: true, deleted: false, transfer_account_id: null, subtransactions: [] }
                ]
            }
        });

        const result: any = JSON.parse(await tool.execute({ budgetId: 'test-budget' }));

        expect(mockApi.transactions.getTransactions).toHaveBeenCalledWith('test-budget', '2026-04-01');
        expect(result.summary.history_cap).toMatchObject({
            max_days: 30,
            applied: true,
            effective_from_date: '2026-04-01'
        });
        expect(result.summary.total_found).toBe(1);
        expect(result.transactions[0].amount).toBe(-10);
        expect(result.transactions[0]).toHaveProperty('transfer_account_id');
        expect(result.transactions[0]).toHaveProperty('subtransactions');
        expect(mockCache.set).toHaveBeenCalled();
    });

    it('should fetch transactions by account when accountId is provided', async () => {
        process.env.YNAB_API_TOKEN = 'test-token';
        mockCache.get.mockReturnValue(null);
        mockApi.transactions.getTransactionsByAccount.mockResolvedValue({
            data: {
                transactions: []
            }
        });

        await tool.execute({ budgetId: 'test-budget', accountId: 'acc1' });

        expect(mockApi.transactions.getTransactionsByAccount).toHaveBeenCalledWith('test-budget', 'acc1', '2026-04-01');
    });

    it('should filter by toDate in memory', async () => {
        process.env.YNAB_API_TOKEN = 'test-token';
        mockCache.get.mockReturnValue(null);
        mockApi.transactions.getTransactions.mockResolvedValue({
            data: {
                transactions: [
                    { id: '1', date: '2025-01-01', amount: -10000, deleted: false },
                    { id: '2', date: '2025-01-05', amount: -20000, deleted: false }
                ]
            }
        });

        const result: any = JSON.parse(await tool.execute({ budgetId: 'test-budget', toDate: '2025-01-03' }));

        expect(result.summary.total_found).toBe(1);
        expect(result.transactions[0].id).toBe('1');
    });

    it('should allow an explicit longer local test lookback when configured', async () => {
        process.env.YNAB_API_TOKEN = 'test-token';
        process.env.YNAB_MAX_IMPORT_HISTORY_DAYS = '90';
        mockCache.get.mockReturnValue(null);
        mockApi.transactions.getTransactions.mockResolvedValue({
            data: {
                transactions: []
            }
        });

        const result: any = JSON.parse(await tool.execute({ budgetId: 'test-budget' }));

        expect(mockApi.transactions.getTransactions).toHaveBeenCalledWith('test-budget', '2026-01-31');
        expect(result.summary.history_cap).toMatchObject({
            max_days: 90,
            applied: true,
            effective_from_date: '2026-01-31'
        });
    });
});
