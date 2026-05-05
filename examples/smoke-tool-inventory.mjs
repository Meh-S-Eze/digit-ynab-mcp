import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';

const serverPath = new URL('../dist/index.js', import.meta.url).pathname;
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  env: {
    ...process.env,
    YNAB_API_TOKEN: process.env.YNAB_API_TOKEN || 'smoke-token',
    PATH: process.env.PATH,
  },
  stderr: 'ignore',
});

const client = new Client(
  { name: 'personal-ynab-smoke', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

await client.connect(transport);
try {
  const result = await client.request({ method: 'tools/list' }, z.any());
  const names = (result.tools || []).map((tool) => tool.name).sort();
  const writeNames = names.filter((name) =>
    /^(create|update|delete|approve|clear|move|plan_write)/.test(name)
  );
  const cacheNames = names.filter((name) => /^(sync_budget_delta|read_budget_cache|budget_cache_status)$/.test(name));

  console.log(JSON.stringify({
    writesEnabled: process.env.YNAB_MCP_ENABLE_WRITES === 'true',
    readMode: process.env.YNAB_MCP_READ_MODE || 'live',
    toolCount: names.length,
    writeToolCount: writeNames.length,
    cacheToolCount: cacheNames.length,
    tools: names,
  }, null, 2));
} finally {
  const child = transport.process;
  await client.close().catch(() => {});
  await transport.close().catch(() => {});
  if (child && child.exitCode === null && !child.killed) {
    child.kill();
  }
}

process.exit(0);
