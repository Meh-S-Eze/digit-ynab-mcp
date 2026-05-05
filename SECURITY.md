# Security

YNAB MCP Server can access sensitive financial data through the YNAB API token you provide.

## Token Handling

- Do not commit real YNAB tokens.
- Prefer environment variables over checked-in config files.
- Rotate a token immediately if it is exposed.

## Write Safety

The public/local default is read-only:

```bash
YNAB_MCP_ENABLE_WRITES=false
```

Set `YNAB_MCP_ENABLE_WRITES=true` only when your agent workflow has an explicit confirmation step you trust. Enabling writes exposes tools that can create, update, approve, clear, move, transfer, schedule, or delete YNAB data.

## Reporting Issues

Open a GitHub issue for non-sensitive bugs. Do not include YNAB tokens, account IDs, transaction exports, or private budget data in public issues.

For a sensitive report, use a private channel first and include only the smallest reproduction details needed to understand the issue.
