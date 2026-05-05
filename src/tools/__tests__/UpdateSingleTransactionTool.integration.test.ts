import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

describe('UpdateSingleTransactionTool Integration', () => {
  let mcpProcess: any;
  let serverOutput = '';

  beforeAll(async () => {
    // Verify the compiled file exists
    const compiledPath = join(process.cwd(), 'dist', 'tools', 'UpdateSingleTransactionTool.js');
    expect(existsSync(compiledPath)).toBe(true);

    // Start the MCP server
    mcpProcess = spawn('node', ['start-mcp.js'], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Collect server output
    mcpProcess.stdout.on('data', (data: Buffer) => {
      serverOutput += data.toString();
    });

    mcpProcess.stderr.on('data', (data: Buffer) => {
      serverOutput += data.toString();
    });

    // Wait for server to start
    await new Promise((resolve) => {
      const checkOutput = () => {
        if (serverOutput.includes('Server running and ready for connections')) {
          resolve(true);
        } else if (serverOutput.includes('Error') || serverOutput.includes('Failed')) {
          throw new Error(`MCP Server failed to start: ${serverOutput}`);
        } else {
          setTimeout(checkOutput, 100);
        }
      };
      checkOutput();
    });
  });

  afterAll(() => {
    if (mcpProcess) {
      mcpProcess.kill();
    }
  });

  it('should have compiled JavaScript file', () => {
    const compiledPath = join(process.cwd(), 'dist', 'tools', 'UpdateSingleTransactionTool.js');
    expect(existsSync(compiledPath)).toBe(true);
  });

  it('should be loaded by MCP server', () => {
    expect(serverOutput).toContain('update_single_transaction');
    expect(serverOutput).toContain('UpdateSingleTransactionTool.js: included');
    expect(serverOutput).toContain('Validated tool: update_single_transaction');
  });

  it('should be included in server tools list', () => {
    expect(serverOutput).toContain('Tools (24):');
    expect(serverOutput).toContain('update_single_transaction');
  });

  it('should not have compilation errors', () => {
    expect(serverOutput).not.toContain('SyntaxError');
    expect(serverOutput).not.toContain('ReferenceError');
    expect(serverOutput).not.toContain('Module not found');
  });
});