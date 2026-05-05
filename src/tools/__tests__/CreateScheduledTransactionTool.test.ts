import { describe, it, expect, vi, beforeEach } from 'vitest';
import CreateScheduledTransactionTool from '../CreateScheduledTransactionTool';
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

describe('CreateScheduledTransactionTool', () => {
    let tool: CreateScheduledTransactionTool;
    let mockApi: any;

    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.YNAB_API_TOKEN;
        delete process.env.YNAB_BUDGET_ID;

        mockApi = {
            scheduledTransactions: {
                createScheduledTransaction: vi.fn(),
            },
        };
        (ynab.API as any).mockImplementation(() => mockApi);

        tool = new CreateScheduledTransactionTool();
    });

    it('should create a scheduled transaction correctly', async () => {
        process.env.YNAB_API_TOKEN = 'test-token';
        const input: any = {
            budgetId: 'test-budget',
            accountId: 'a1',
            date: '2025-01-01',
            amount: -50.00,
            frequency: 'monthly',
            memo: 'Rent'
        };

        mockApi.scheduledTransactions.createScheduledTransaction.mockResolvedValue({
            data: {
                scheduled_transaction: { id: 's1' }
            }
        });

        const result: any = await tool.execute(input);

        expect(mockApi.scheduledTransactions.createScheduledTransaction).toHaveBeenCalledWith('test-budget', {
            scheduled_transaction: {
                account_id: 'a1',
                date: '2025-01-01',
                amount: -50000,
                frequency: 'monthly',
                memo: 'Rent',
                payee_id: undefined,
                payee_name: undefined,
                category_id: undefined
            }
        });

        expect(result.success).toBe(true);
        expect(result.scheduled_transaction_id).toBe('s1');
    });
});