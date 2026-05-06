# Digit YNAB MCP

A local-first Model Context Protocol server that lets AI agents work with YNAB through structured, safety-gated tools.

This repo is for builders who want to connect YNAB to Codex, Claude Desktop, OpenClaw, Hermes, or another stdio MCP client. It gives an agent a typed tool layer for reading budgets, analyzing transactions, planning changes, and, when explicitly enabled, writing updates back to YNAB.

If you are a YNAB user who wants the guided hosted product instead of configuring an MCP server, see [Digit for YNAB](https://getdigit.app/).

## What It Does

Digit YNAB MCP exposes YNAB as agent tools instead of asking a model to improvise API calls. An MCP client can use it to:

- List budgets, accounts, category groups, payees, scheduled transactions, and unapproved transactions.
- Inspect monthly category balances and budget status.
- Analyze spending by category and search transaction history with filters.
- Generate income and expense reports over a date range.
- Sync a local file-backed budget cache and read from that cache during normal budget conversations.
- Plan budget writes before making them.
- Create, update, approve, clear, transfer, schedule, move, or delete YNAB records when write tools are explicitly enabled.

## At A Glance

| Area | Current behavior |
| --- | --- |
| Runtime | Node.js 22, stdio MCP |
| Install status | Source install today, npm publishing later |
| Auth | `YNAB_API_TOKEN` or `YNAB_TOKEN` environment variable |
| Default safety | Read-only tools only |
| Write opt-in | `YNAB_MCP_ENABLE_WRITES=true` |
| Cache mode | `YNAB_MCP_READ_MODE=cache` with `YNAB_MCP_CACHE_PATH` |
| Tool inventory | 13 live read tools, 20 write tools, 3 cache tools |

## Who This Is For

Use this repo if you are building a local agent workflow and you are comfortable supplying your own YNAB token, choosing your MCP client, and reviewing any budget changes your agent proposes.

This repo is not:

- The hosted Digit app.
- OAuth onboarding for nontechnical users.
- A billing, support, or product UI layer.
- A replacement for human review before YNAB writes.
- A place to store personal budget exports or tokens.

## Digit For YNAB

[Digit](https://getdigit.app/) is the hosted product being built around this MCP engine.

The open-source MCP is for builders who want direct control over their own agent setup. Digit is for YNAB users who want the same kind of budget clarity without configuring MCP, managing tokens by hand, or building their own safety workflow.

Digit starts with a read-only Preview: ask real budget questions without changing anything in YNAB. Advanced setup can later support review-and-confirm actions for users who intentionally opt into budget changes.

## Tool Overview

The server has three tool modes.

Read-only live mode is the default. It registers 13 tools for budget lookup, transaction analysis, payees, scheduled transactions, reports, and API health checks.

Write-enabled mode registers the read tools plus 20 write tools. Write tools are not visible to the MCP client unless `YNAB_MCP_ENABLE_WRITES=true`.

Cache-read mode registers 3 cache tools so an agent can refresh a local budget snapshot and answer most read questions from disk instead of repeatedly pulling live YNAB data.

See [docs/tools.md](docs/tools.md) for the full tool catalog.

## Safety Model

The server defaults to read-only mode:

```bash
YNAB_MCP_ENABLE_WRITES=false
```

In read-only mode, write-capable tools are not registered. The MCP client cannot call them because they are not in the tool inventory.

Enable writes only for a trusted workflow where the agent asks for explicit user approval before every YNAB mutation:

```bash
YNAB_MCP_ENABLE_WRITES=true
```

This server-side gate is a hard boundary, but it is not the whole safety story. Your agent instructions should still require review before categorizing, approving, clearing, moving money, creating accounts, deleting transactions, or changing scheduled transactions.

## Cache-Read Mode

For personal/local workflows, live read tools can be hidden while sync and cache tools remain available:

```bash
YNAB_MCP_READ_MODE=cache
YNAB_MCP_CACHE_PATH="/path/to/ynab-cache.json"
```

In cache mode, the MCP exposes:

- `budget_cache_status`
- `sync_budget_delta`
- `read_budget_cache`
- write tools, if `YNAB_MCP_ENABLE_WRITES=true`

Use `sync_budget_delta` to refresh the local file-backed cache, then use `read_budget_cache` for normal budget questions. This keeps agent conversations fast and reduces unnecessary full-budget reads.

## Install From Source

```bash
git clone https://github.com/Meh-S-Eze/digit-ynab-mcp.git
cd digit-ynab-mcp
npm install
npm run build
YNAB_API_TOKEN="<your-token>" YNAB_MCP_ENABLE_WRITES=false node dist/index.js
```

Optional budget default:

```bash
YNAB_BUDGET_ID="<budget-id>"
```

Get a YNAB Personal Access Token from YNAB's developer settings. Keep it in environment variables or your MCP client's secret storage. Do not commit it.

## MCP Client Configuration

Generic stdio shape:

```text
command: node
args: ["/path/to/digit-ynab-mcp/dist/index.js"]
env:
  YNAB_API_TOKEN: "<your-token>"
  YNAB_MCP_ENABLE_WRITES: "false"
  YNAB_MCP_READ_MODE: "live"
```

Claude Desktop, OpenClaw, Hermes, and similar JSON-style clients:

```json
{
  "mcpServers": {
    "ynab": {
      "command": "node",
      "args": ["/path/to/digit-ynab-mcp/dist/index.js"],
      "env": {
        "YNAB_API_TOKEN": "<your-token>",
        "YNAB_MCP_ENABLE_WRITES": "false",
        "YNAB_MCP_READ_MODE": "live"
      }
    }
  }
}
```

Cache-first local workflow:

```json
{
  "mcpServers": {
    "ynab": {
      "command": "node",
      "args": ["/path/to/digit-ynab-mcp/dist/index.js"],
      "env": {
        "YNAB_API_TOKEN": "<your-token>",
        "YNAB_BUDGET_ID": "<budget-id>",
        "YNAB_MCP_ENABLE_WRITES": "true",
        "YNAB_MCP_READ_MODE": "cache",
        "YNAB_MCP_CACHE_PATH": "/path/to/ynab-cache.json"
      }
    }
  }
}
```

Start read-only first. Turn on writes only after you have verified the tool inventory and your agent's confirmation behavior.

## Verify The Tool Inventory

```bash
npm run build
npm run smoke:tools
YNAB_MCP_ENABLE_WRITES=true npm run smoke:tools
```

Expected shape:

- Read-only smoke: 13 tools, 0 write tools.
- Write-enabled smoke: 33 tools, including 20 write tools.

## Development Checks

```bash
npm run build
npm test
```

The default `npm test` suite is scoped to extraction-safe build, read, write-gating, cache, and category-create coverage. Some copied legacy tool tests remain available through `npm run test:full-inherited`, but they need later assertion rebaseline for the current structured JSON and error response shapes.

## Known Limitations

- Category creation currently includes a guard for an observed YNAB API mismatch where `POST /plans/{plan_id}/categories` can reject a category group ID returned by `GET /plans/{plan_id}/categories`. See [the support template](docs/support/category-create-api-mismatch-template.md).
- This repo currently supports source install. npm package publishing is intentionally deferred.
- This repo does not include OAuth onboarding or hosted token management.
- MCP clients differ in how they display tool calls and confirmation prompts. Test your own client before enabling writes.

## Security

- Never commit YNAB tokens.
- Never commit budget exports, cache files, logs, or account-level financial data.
- Prefer environment variables or your MCP client's secret storage.
- Leave `YNAB_MCP_ENABLE_WRITES=false` unless you are actively using a trusted, confirmation-gated workflow.

See [SECURITY.md](SECURITY.md) for more.
