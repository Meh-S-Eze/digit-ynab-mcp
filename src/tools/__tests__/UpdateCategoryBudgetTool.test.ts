import { describe, it, expect, vi, beforeEach } from 'vitest';
import UpdateCategoryBudgetTool from '../UpdateCategoryBudgetTool';
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

describe('UpdateCategoryBudgetTool', () => {
    let tool: UpdateCategoryBudgetTool;
    let mockApi: any;

    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.YNAB_API_TOKEN;
        delete process.env.YNAB_BUDGET_ID;

        mockApi = {
            categories: {
                updateMonthCategory: vi.fn(),
            },
        };
        (ynab.API as any).mockImplementation(() => mockApi);
        tool = new UpdateCategoryBudgetTool();
    });

    it('should return error when YNAB API token is not set', async () => {
        const result = await tool.execute({
            budgetId: 'test-budget',
            month: '2025-01-01',
            categoryId: 'cat-1',
            budgeted: 100
        });
        expect(result).toBe('ERROR: YNAB API Token is not set. Please set YNAB_API_TOKEN environment variable.');
    });

    it('should update category budgeting successfully', async () => {
        process.env.YNAB_API_TOKEN = 'test-token';
        const input = {
            budgetId: 'test-budget',
            month: '2025-01-01',
            categoryId: 'cat-1',
            budgeted: 50.00
        };

        mockApi.categories.updateMonthCategory.mockResolvedValue({
            data: {
                category: {
                    name: 'Groceries',
                    budgeted: 50000 // Returned in milliunits
                }
            }
        });

        const result = await tool.execute(input);

        expect(mockApi.categories.updateMonthCategory).toHaveBeenCalledWith(
            'test-budget',
            '2025-01-01',
            'cat-1',
            { category: { budgeted: 50000 } }
        );
        expect(result).toContain("Successfully updated category 'Groceries' budgeted amount to $50.00");
    });

    it('should handle zero gracefully', async () => {
        process.env.YNAB_API_TOKEN = 'test-token';
        const input = {
            budgetId: 'test-budget',
            month: '2025-01-01',
            categoryId: 'cat-1',
            budgeted: 0
        };

        mockApi.categories.updateMonthCategory.mockResolvedValue({
            data: { category: { name: 'Groceries', budgeted: 0 } }
        });

        const result = await tool.execute(input);

        expect(mockApi.categories.updateMonthCategory).toHaveBeenCalledWith(
            'test-budget',
            '2025-01-01',
            'cat-1',
            { category: { budgeted: 0 } }
        );
        expect(result).toContain("$0.00");
    });

    it('should handle large amounts (e.g. 1000)', async () => {
        process.env.YNAB_API_TOKEN = 'test-token';
        const input = {
            budgetId: 'test-budget',
            month: '2025-01-01',
            categoryId: 'cat-1',
            budgeted: 1000
        };

        mockApi.categories.updateMonthCategory.mockResolvedValue({
            data: { category: { name: 'Groceries', budgeted: 1000000 } }
        });

        const result = await tool.execute(input);

        expect(mockApi.categories.updateMonthCategory).toHaveBeenCalledWith(
            'test-budget',
            '2025-01-01',
            'cat-1',
            { category: { budgeted: 1000000 } }
        );
        expect(result).toContain("$1000.00");
    });
});