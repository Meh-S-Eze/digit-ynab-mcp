# YNAB MCP Server

Local-first YNAB MCP server for Codex and agent workflows.

This repo is the reusable MCP server code. It exposes structured YNAB tools for agent runtimes such as Codex, Claude Desktop, OpenClaw, Hermes, and Kilo-style clients.

It is intentionally limited to the MCP server. It does not include hosted app auth, onboarding, billing, support, landing pages, product UI, or private personal-budget workflow files.

## Digit

[Digit for YNAB](https://getdigit.app/) is the hosted product being built around this MCP engine.

This open-source repo is for people who want to wire YNAB into their own agent setup. Digit is for YNAB users who want the same kind of budget clarity without having to configure an MCP server, manage tokens by hand, or build their own safety workflow.

The product direction is simple: start with a read-only Preview that helps you ask real budget questions without changing anything in YNAB. From there, Advanced setup can support review-and-confirm changes for users who intentionally opt into budget actions.

## Safety Default

The server defaults to read-only mode:

```bash
YNAB_MCP_ENABLE_WRITES=false
```

In read-only mode, only discovery, read, and analysis tools are registered. Write-capable tools are not exposed to the MCP client.

Enable writes only for a trusted agent workflow with explicit user review:

```bash
YNAB_MCP_ENABLE_WRITES=true
```

## Cache-Read Mode

For personal/local workflows, live read tools can be hidden while sync/cache tools remain available:

```bash
YNAB_MCP_READ_MODE=cache
YNAB_MCP_CACHE_PATH="/path/to/ynab-cache.json"
```

In cache mode, the MCP exposes:

- `budget_cache_status`
- `sync_budget_delta`
- `read_budget_cache`
- write tools, if `YNAB_MCP_ENABLE_WRITES=true`

It does not expose ordinary live read tools such as `list_accounts`, `list_budgets`, or `budget_summary`. Use `sync_budget_delta` to refresh the local file-backed cache, then use `read_budget_cache` for normal budget questions.

## Local Setup

```bash
git clone https://github.com/Meh-S-Eze/digit-ynab-mcp.git
cd digit-ynab-mcp
npm install
npm run build
YNAB_API_TOKEN="<your-token>" YNAB_MCP_ENABLE_WRITES=false node dist/index.js
```

Optional:

```bash
YNAB_BUDGET_ID="<budget-id>"
```

## Codex-Style Local Config

```text
command: node
args: ["/path/to/digit-ynab-mcp/dist/index.js"]
env:
  YNAB_API_TOKEN: "<your-token>"
  YNAB_MCP_ENABLE_WRITES: "false"
  YNAB_MCP_READ_MODE: "live"
```

For app development, another local app can point at this same built entrypoint using:

```bash
MCP_SERVER_COMMAND=node
MCP_SERVER_ARGS_JSON='["/path/to/digit-ynab-mcp/dist/index.js"]'
```

## Validation

```bash
npm run build
npm test
npm run smoke:tools
YNAB_MCP_ENABLE_WRITES=true npm run smoke:tools
```

`smoke:tools` lists the registered MCP tools and shows whether write tools are available.

The default `npm test` suite is scoped to extraction-safe build, read, and write-gating coverage. Some copied legacy tool tests are still available through `npm run test:full-inherited`, but they need a later assertion rebaseline for the current structured JSON/error response shapes.

## Product Boundary

This repo stays limited to MCP server source, examples, and tests. Product-specific UX, hosted auth, managed onboarding, and personal budgeting skills live outside this repository.
