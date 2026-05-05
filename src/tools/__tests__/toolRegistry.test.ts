import { describe, expect, test } from 'vitest';
import { createEnabledTools, isMcpCacheReadMode, isMcpWriteEnabled } from '../../toolRegistry';

describe('tool registry write gating', () => {
  test('defaults to read-only tool inventory', () => {
    const tools = createEnabledTools({});
    const names = tools.map((tool) => tool.name);

    expect(names).toContain('list_budgets');
    expect(names).toContain('budget_summary');
    expect(names).not.toContain('create_multiple_transactions');
    expect(names).not.toContain('delete_transaction');
    expect(names).not.toContain('plan_write_action');
  });

  test('enables write tools only with explicit truthy env', () => {
    expect(isMcpWriteEnabled({ YNAB_MCP_ENABLE_WRITES: 'false' })).toBe(false);
    expect(isMcpWriteEnabled({ YNAB_MCP_ENABLE_WRITES: 'true' })).toBe(true);

    const tools = createEnabledTools({ YNAB_MCP_ENABLE_WRITES: 'true' });
    const names = tools.map((tool) => tool.name);

    expect(names).toContain('create_multiple_transactions');
    expect(names).toContain('delete_transaction');
    expect(names).toContain('plan_write_action');
  });

  test('cache read mode replaces live read tools with sync/cache tools', () => {
    expect(isMcpCacheReadMode({ YNAB_MCP_READ_MODE: 'cache' })).toBe(true);
    expect(isMcpCacheReadMode({ YNAB_MCP_READ_MODE: 'live' })).toBe(false);

    const tools = createEnabledTools({
      YNAB_MCP_READ_MODE: 'cache',
      YNAB_MCP_ENABLE_WRITES: 'true',
    });
    const names = tools.map((tool) => tool.name);

    expect(names).toContain('sync_budget_delta');
    expect(names).toContain('read_budget_cache');
    expect(names).toContain('budget_cache_status');
    expect(names).toContain('create_multiple_transactions');
    expect(names).not.toContain('list_budgets');
    expect(names).not.toContain('list_accounts');
    expect(names).not.toContain('budget_summary');
  });
});
