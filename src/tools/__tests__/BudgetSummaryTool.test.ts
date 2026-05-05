import { describe, it, expect, vi, beforeEach } from 'vitest';
import BudgetSummaryTool from '../BudgetSummaryTool';
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

describe('BudgetSummaryTool', () => {
    let tool: BudgetSummaryTool;
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
            months: {
                getBudgetMonth: vi.fn(),
            },
        };
        (ynab.API as any).mockImplementation(() => mockApi);

        mockCache = {
            get: vi.fn(),
            set: vi.fn(),
        };
        (Cache.getInstance as any).mockReturnValue(mockCache);

        tool = new BudgetSummaryTool();
    });

    it('should return standardized summary correctly', async () => {
        process.env.YNAB_API_TOKEN = 'test-token';
        mockCache.get.mockReturnValue(null);

        mockApi.accounts.getAccounts.mockResolvedValue({
            data: {
                accounts: [
                    { id: 'a1', name: 'Checking', type: 'checking', balance: 1000000, deleted: false, closed: false }
                ]
            }
        });

        mockApi.months.getBudgetMonth.mockResolvedValue({
            data: {
                month: {
                    month: '2025-01-01',
                    income: 5000000,
                    budgeted: 4000000,
                    activity: -1000000,
                    to_be_budgeted: 1000000,
                    age_of_money: 30,
                    note: 'Test',
                    categories: [
                        { id: 'c1', name: 'Food', budgeted: 500000, activity: -100000, balance: 400000, deleted: false, hidden: false }
                    ]
                }
            }
        });

        const result: any = await tool.execute({ budgetId: 'test-budget', month: '2025-01-01' });

        expect(result.monthBudget.income).toBe(5000.00);
        expect(result.accounts[0].balance).toBe(1000.00);
        expect(result.categories[0].balance).toBe(400.00);
        expect(mockCache.set).toHaveBeenCalled();
    });
});