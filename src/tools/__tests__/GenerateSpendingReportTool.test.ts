import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import GenerateSpendingReportTool from '../GenerateSpendingReportTool';
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

describe('GenerateSpendingReportTool', () => {
    let tool: GenerateSpendingReportTool;
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
            },
        };
        (ynab.API as any).mockImplementation(() => mockApi);

        mockCache = {
            get: vi.fn(),
            set: vi.fn(),
        };
        (Cache.getInstance as any).mockReturnValue(mockCache);

        tool = new GenerateSpendingReportTool();
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

    it('should generate monthly report correctly', async () => {
        process.env.YNAB_API_TOKEN = 'test-token';
        mockCache.get.mockReturnValue(null);

        const mockTransactions = [
            { date: '2025-01-15', amount: 3000000, deleted: false }, // Income 3000
            { date: '2025-01-20', amount: -500000, deleted: false }, // Expense 500
            { date: '2025-02-10', amount: -1000000, deleted: false }, // Expense 1000
            { date: '2025-01-05', amount: -200000, deleted: true },  // Deleted
        ];

        mockApi.transactions.getTransactions.mockResolvedValue({
            data: {
                transactions: mockTransactions
            }
        });

        const result: any = JSON.parse(await tool.execute({ budgetId: 'test-budget', monthsBack: 2 }));

        expect(result.monthly_report).toHaveLength(2);

        const jan = result.monthly_report.find((m: any) => m.month === '2025-01');
        const feb = result.monthly_report.find((m: any) => m.month === '2025-02');

        expect(jan.income).toBe(3000.00);
        expect(jan.expenses).toBe(500.00);
        expect(jan.net).toBe(2500.00);

        expect(feb.income).toBe(0.00);
        expect(feb.expenses).toBe(1000.00);
        expect(feb.net).toBe(-1000.00);

        expect(result.totals.income).toBe(3000.00);
        expect(result.totals.expenses).toBe(1500.00);
        expect(result.totals.net).toBe(1500.00);
        expect(result.parameters).toMatchObject({
            monthsBack: 1,
            requestedMonthsBack: 2,
            maxDays: 30,
            from: '2026-04-01'
        });
        expect(mockApi.transactions.getTransactions).toHaveBeenCalledWith('test-budget', '2026-04-01');

        expect(mockCache.set).toHaveBeenCalled();
    });

    it('should allow a longer local test lookback when configured', async () => {
        process.env.YNAB_API_TOKEN = 'test-token';
        process.env.YNAB_MAX_IMPORT_HISTORY_DAYS = '90';
        mockCache.get.mockReturnValue(null);
        mockApi.transactions.getTransactions.mockResolvedValue({
            data: {
                transactions: []
            }
        });

        const result: any = JSON.parse(await tool.execute({ budgetId: 'test-budget', monthsBack: 3 }));

        expect(mockApi.transactions.getTransactions).toHaveBeenCalledWith('test-budget', '2026-02-01');
        expect(result.parameters).toMatchObject({
            monthsBack: 3,
            requestedMonthsBack: 3,
            maxDays: 90,
            from: '2026-02-01'
        });
    });

    it('should handle YNAB API errors gracefully and return structured error', async () => {
        process.env.YNAB_API_TOKEN = 'test-token';
        mockCache.get.mockReturnValue(null);

        const mockApiError = {
            error: {
                detail: 'Network timeout'
            },
            status: 500
        };

        mockApi.transactions.getTransactions.mockRejectedValue(mockApiError);

        const result: any = await tool.execute({
            budgetId: 'test-budget',
            monthsBack: 2
        });

        expect(result).toContain('ERROR: generating spending report');
        expect(result).toContain('Network timeout');
        expect(mockCache.set).not.toHaveBeenCalled();
    });
});
