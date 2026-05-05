import { describe, it, expect, vi, beforeEach } from 'vitest';
import ApproveTransactionTool from '../ApproveTransactionTool';
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

describe('ApproveTransactionTool', () => {
    let tool: ApproveTransactionTool;
    let mockApi: any;

    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.YNAB_API_TOKEN;
        delete process.env.YNAB_BUDGET_ID;

        mockApi = {
            transactions: {
                getTransactionById: vi.fn(),
                updateTransaction: vi.fn(),
            },
        };
        (ynab.API as any).mockImplementation(() => mockApi);
        tool = new ApproveTransactionTool();
    });

    it('should return error when budget ID is missing', async () => {
        const result = await tool.execute({
            transactionId: 'txn-1'
        });
        // Note: SerializingMCPTool wraps the return value in a string
        // The tool returns { success: false, error: ... }
        const parsed = JSON.parse(result);
        expect(parsed.success).toBe(false);
        expect(parsed.error).toContain('No budget ID provided');
    });

    it('should approve a transaction successfully', async () => {
        process.env.YNAB_API_TOKEN = 'test-token';
        const input = {
            budgetId: 'test-budget',
            transactionId: 'txn-1',
            approved: true
        };

        mockApi.transactions.getTransactionById.mockResolvedValue({
            data: { transaction: { id: 'txn-1', amount: 1000 } }
        });

        mockApi.transactions.updateTransaction.mockResolvedValue({
            data: { transaction: { id: 'txn-1', approved: true } }
        });

        const result = await tool.execute(input);
        const parsed = JSON.parse(result);

        expect(mockApi.transactions.updateTransaction).toHaveBeenCalledWith(
            'test-budget',
            'txn-1',
            { transaction: { approved: true } }
        );
        expect(parsed.success).toBe(true);
        expect(parsed.message).toContain('Transaction approval status updated successfully');
    });

    it('should un-approve a transaction successfully', async () => {
        process.env.YNAB_API_TOKEN = 'test-token';
        const input = {
            budgetId: 'test-budget',
            transactionId: 'txn-1',
            approved: false
        };

        mockApi.transactions.getTransactionById.mockResolvedValue({
            data: { transaction: { id: 'txn-1', amount: 1000 } }
        });

        mockApi.transactions.updateTransaction.mockResolvedValue({
            data: { transaction: { id: 'txn-1', approved: false } }
        });

        const result = await tool.execute(input);
        const parsed = JSON.parse(result);

        expect(mockApi.transactions.updateTransaction).toHaveBeenCalledWith(
            'test-budget',
            'txn-1',
            { transaction: { approved: false } }
        );
        expect(parsed.success).toBe(true);
    });

    it('should handle transaction not found', async () => {
        process.env.YNAB_API_TOKEN = 'test-token';
        const input = {
            budgetId: 'test-budget',
            transactionId: 'txn-missing'
        };

        mockApi.transactions.getTransactionById.mockResolvedValue({
            data: { transaction: null }
        });

        const result = await tool.execute(input);
        const parsed = JSON.parse(result);

        expect(parsed.success).toBe(false);
        expect(parsed.error).toContain('Transaction not found');
    });
});