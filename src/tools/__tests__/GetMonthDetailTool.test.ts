import { describe, it, expect, vi, beforeEach } from 'vitest';
import GetMonthDetailTool from '../GetMonthDetailTool';
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

describe('GetMonthDetailTool', () => {
    let tool: GetMonthDetailTool;
    let mockApi: any;

    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.YNAB_API_TOKEN;
        delete process.env.YNAB_BUDGET_ID;

        mockApi = {
            months: {
                getBudgetMonth: vi.fn(),
            },
        };
        (ynab.API as any).mockImplementation(() => mockApi);
        tool = new GetMonthDetailTool();
    });

    it('should return error when YNAB API token is not set', async () => {
        const result = await tool.execute({
            budgetId: 'test-budget',
            month: 'current'
        });
        expect(result).toBe('YNAB API Token is not set');
    });

    it('should return month details correctly transformed', async () => {
        process.env.YNAB_API_TOKEN = 'test-token';
        const input = {
            budgetId: 'test-budget',
            month: '2025-01-01'
        };

        mockApi.months.getBudgetMonth.mockResolvedValue({
            data: {
                month: {
                    month: '2025-01-01',
                    note: 'Test Month',
                    to_be_budgeted: 100000,
                    age_of_money: 30,
                    income: 200000,
                    budgeted: 50000,
                    activity: -20000,
                    categories: [
                        { id: 'c1', name: 'Food', budgeted: 50000, activity: -10000, balance: 40000, hidden: false, deleted: false }
                    ]
                }
            }
        });

        const result = await tool.execute(input);

        expect(mockApi.months.getBudgetMonth).toHaveBeenCalledWith('test-budget', '2025-01-01');

        // Check conversions (milliunits -> dollars)
        expect(result).toMatchObject({
            month: '2025-01-01',
            to_be_budgeted: 100.00,
            age_of_money: 30,
            income: 200.00,
            categories: [
                { id: 'c1', name: 'Food', budgeted: 50.00, activity: -10.00, balance: 40.00 }
            ]
        });
    });
});