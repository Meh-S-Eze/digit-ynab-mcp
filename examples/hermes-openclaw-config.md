# Hermes / OpenClaw Style MCP Config

Use the same command/args/env shape in agent runtimes that support stdio MCP servers:

```json
{
  "mcpServers": {
    "ynab": {
      "command": "node",
      "args": [
        "/path/to/digit-ynab-mcp/dist/index.js"
      ],
      "env": {
        "YNAB_API_TOKEN": "<your-token>",
        "YNAB_MCP_ENABLE_WRITES": "false"
      }
    }
  }
}
```

Keep `YNAB_MCP_ENABLE_WRITES` false until the agent has a clear confirmation workflow.
