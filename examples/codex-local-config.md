# Codex Local MCP Config Example

Use this MCP server from Codex with a local built entrypoint:

```text
command: node
args: ["/path/to/digit-ynab-mcp/dist/index.js"]
env:
  YNAB_API_TOKEN: "<your-token>"
  YNAB_MCP_ENABLE_WRITES: "false"
  YNAB_MCP_READ_MODE: "live"
```

For a cache-first personal workflow, set:

```text
env:
  YNAB_API_TOKEN: "<your-token>"
  YNAB_BUDGET_ID: "<budget-id>"
  YNAB_MCP_ENABLE_WRITES: "true"
  YNAB_MCP_READ_MODE: "cache"
  YNAB_MCP_CACHE_PATH: "/path/to/ynab-cache.json"
```

Start read-only first. After you confirm the tool behavior against your own budget, enable writes only in a thread where you intend to review every mutation:

```text
env:
  YNAB_API_TOKEN: "<your-token>"
  YNAB_MCP_ENABLE_WRITES: "true"
```
