# Tool Catalog

Digit YNAB MCP exposes different tool inventories depending on environment configuration.

By default, only live read tools are registered. If `YNAB_MCP_ENABLE_WRITES=true`, write tools are added. If `YNAB_MCP_READ_MODE=cache`, ordinary live read tools are replaced by cache tools.

## Live Read Tools

These 13 tools are available by default.

| Tool | What it is for |
| --- | --- |
| `analyze_spending_by_category` | Summarize spending by category over a date range. |
| `analyze_transactions` | Search and filter transactions by date, account, category, payee, memo, and status. |
| `budget_summary` | Summarize budget health, balances, and category status. |
| `generate_spending_report` | Generate income and expense reporting across a selected period. |
| `get_month_detail` | Fetch detailed month-level budget data, category balances, activity, and assigned amounts. |
| `get_payees` | List payees for a budget. |
| `get_single_payee` | Fetch details for one payee. |
| `get_unapproved_transactions` | List transactions waiting for approval. |
| `health_check` | Check YNAB API connectivity and basic budget access. |
| `list_accounts` | List accounts in a budget. |
| `list_budgets` | List budgets available to the token. |
| `list_category_groups` | List category groups and categories. |
| `list_scheduled_transactions` | List recurring and scheduled transactions. |

## Cache Tools

These 3 tools are available when `YNAB_MCP_READ_MODE=cache`.

| Tool | What it is for |
| --- | --- |
| `budget_cache_status` | Inspect whether a cache file exists and when it was last refreshed. |
| `sync_budget_delta` | Refresh a local file-backed cache from YNAB, using delta sync when possible. |
| `read_budget_cache` | Query the local cache for budgets, accounts, categories, payees, and transactions. |

Cache mode is useful when an agent should avoid repeatedly pulling the full live budget during normal conversation.

## Write Tools

These 20 tools are registered only when `YNAB_MCP_ENABLE_WRITES=true`.

| Tool | What it changes |
| --- | --- |
| `approve_transaction` | Approve or unapprove a transaction. |
| `clear_transaction` | Mark a transaction as cleared, uncleared, or reconciled. |
| `create_account` | Create a YNAB account. |
| `create_category` | Create a category after preflight validation. See known category-create limitation in the README. |
| `create_category_group` | Create a category group. |
| `create_multiple_transactions` | Create multiple transactions in one request. |
| `create_payee` | Create a payee. |
| `create_scheduled_transaction` | Create a recurring scheduled transaction. |
| `create_split_transaction` | Create or update a transaction with subtransactions. |
| `create_transfer` | Create a linked transfer between accounts. |
| `delete_scheduled_transaction` | Permanently delete a scheduled transaction definition. |
| `delete_transaction` | Permanently delete a transaction. |
| `move_funds` | Move assigned money between categories. |
| `plan_write_action` | Produce a structured plan for a write action before applying it. |
| `update_category` | Update category metadata such as name, note, or goal fields. |
| `update_category_budget` | Update the assigned amount for a category in a month. |
| `update_category_group` | Update category group metadata. |
| `update_multiple_transactions` | Bulk update transactions. |
| `update_scheduled_transaction` | Update a scheduled transaction definition. |
| `update_single_transaction` | Update one transaction's amount, date, payee, category, memo, or cleared status. |

Write tools can mutate real YNAB data. Keep them disabled unless your agent workflow requires explicit user review before each mutation.

## Tool Inventory Smoke

Run these commands to verify what your MCP client should see:

```bash
npm run smoke:tools
YNAB_MCP_ENABLE_WRITES=true npm run smoke:tools
YNAB_MCP_READ_MODE=cache npm run smoke:tools
```

Expected counts:

| Mode | Tool count |
| --- | --- |
| Live read-only | 13 |
| Live read plus writes | 33 |
| Cache read-only | 3 |
| Cache read plus writes | 23 |
