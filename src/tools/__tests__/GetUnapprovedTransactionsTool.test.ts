import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as ynab from 'ynab';
import GetUnapprovedTransactionsTool from '../GetUnapprovedTransactionsTool';

vi.mock('ynab', () => ({
  API: vi.fn(),
  GetTransactionsTypeEnum: {
    Unapproved: 'unapproved',
  },
}));

vi.mock('mcp-framework', () => ({
  MCPTool: class MockMCPTool { constructor() { } },
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('GetUnapprovedTransactionsTool', () => {
  let tool: GetUnapprovedTransactionsTool;
  let mockApi: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T12:00:00.000Z'));
    delete process.env.YNAB_BUDGET_ID;
    delete process.env.YNAB_MAX_IMPORT_HISTORY_DAYS;

    mockApi = {
      transactions: {
        getTransactions: vi.fn().mockResolvedValue({
          data: {
            transactions: [],
          },
        }),
      },
    };
    (ynab.API as any).mockImplementation(() => mockApi);
    tool = new GetUnapprovedTransactionsTool();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should cap unapproved transaction lookup to the default 30-day window', async () => {
    const result: any = JSON.parse(await tool.execute({ budgetId: 'test-budget' }));

    expect(mockApi.transactions.getTransactions).toHaveBeenCalledWith(
      'test-budget',
      '2026-04-01',
      'unapproved'
    );
    expect(result.history_cap).toEqual({
      max_days: 30,
      effective_from_date: '2026-04-01',
    });
  });

  it('should allow a longer local test lookback when configured', async () => {
    process.env.YNAB_MAX_IMPORT_HISTORY_DAYS = '90';

    const result: any = JSON.parse(await tool.execute({ budgetId: 'test-budget' }));

    expect(mockApi.transactions.getTransactions).toHaveBeenCalledWith(
      'test-budget',
      '2026-01-31',
      'unapproved'
    );
    expect(result.history_cap).toEqual({
      max_days: 90,
      effective_from_date: '2026-01-31',
    });
  });
});
