import { describe, it, expect, vi, beforeEach } from 'vitest';
import MoveFundsTool from '../MoveFundsTool';
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

describe('MoveFundsTool', () => {
    let tool: MoveFundsTool;
    let mockApi: any;

    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.YNAB_API_TOKEN;
        delete process.env.YNAB_BUDGET_ID;

        mockApi = {
            categories: {
                getMonthCategoryById: vi.fn(),
                updateMonthCategory: vi.fn(),
            },
        };
        (ynab.API as any).mockImplementation(() => mockApi);

        tool = new MoveFundsTool();
    });

    it('should move funds correctly between categories', async () => {
        process.env.YNAB_API_TOKEN = 'test-token';
        const input = {
            budgetId: 'test-budget',
            month: '2025-01-01',
            sourceCategoryId: 'c1',
            destinationCategoryId: 'c2',
            amount: 50.00
        };

        mockApi.categories.getMonthCategoryById.mockImplementation((bid: string, month: string, cid: string) => {
            if (cid === 'c1') {
                return Promise.resolve({ data: { category: { id: 'c1', name: 'Food', budgeted: 200000 } } });
            }
            if (cid === 'c2') {
                return Promise.resolve({ data: { category: { id: 'c2', name: 'Rent', budgeted: 1000000 } } });
            }
        });

        const result: any = JSON.parse(await tool.execute(input));

        expect(mockApi.categories.updateMonthCategory).toHaveBeenCalledTimes(2);

        // Source should be decreased by 50000 milliunits
        expect(mockApi.categories.updateMonthCategory).toHaveBeenCalledWith('test-budget', '2025-01-01', 'c1', {
            category: { budgeted: 150000 }
        });

        // Destination should be increased by 50000 milliunits
        expect(mockApi.categories.updateMonthCategory).toHaveBeenCalledWith('test-budget', '2025-01-01', 'c2', {
            category: { budgeted: 1050000 }
        });

        expect(result.success).toBe(true);
        expect(result.message).toContain("moved $50.00 from 'Food' to 'Rent'");
    });

    it('should return error if source and destination are the same', async () => {
        process.env.YNAB_API_TOKEN = 'test-token';
        const result = await tool.execute({
            budgetId: 'test-budget',
            month: '2025-01-01',
            sourceCategoryId: 'c1',
            destinationCategoryId: 'c1',
            amount: 50
        });

        expect(result).toBe("Source and destination categories must be different.");
    });
});