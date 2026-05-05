import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

describe('Build Verification', () => {
  const srcToolsDir = join(process.cwd(), 'src', 'tools');
  const distToolsDir = join(process.cwd(), 'dist', 'tools');

  it('should have compiled all TypeScript tools to JavaScript', () => {
    // Get all TypeScript files from src/tools (excluding __tests__ and .test.ts files)
    const srcFiles = readdirSync(srcToolsDir)
      .filter(file => file.endsWith('.ts') && !file.includes('.test.') && !file.includes('.integration.'))
      .map(file => file.replace('.ts', '.js'));

    // Get all JavaScript files from dist/tools (excluding __tests__)
    const distFiles = readdirSync(distToolsDir)
      .filter(file => file.endsWith('.js') && !file.includes('.test.') && !file.includes('.integration.'));

    // Check that all source files have corresponding compiled files
    for (const srcFile of srcFiles) {
      const compiledPath = join(distToolsDir, srcFile);
      expect(existsSync(compiledPath), `${srcFile} should be compiled to ${compiledPath}`).toBe(true);
    }

    // Check that we have the expected number of tools
    expect(distFiles.length).toBeGreaterThan(0);
    console.log(`✅ Verified ${distFiles.length} tools are compiled:`, distFiles);
  });

  it('should have all required tools compiled', () => {
    const requiredTools = [
      'ApproveTransactionTool.js',
      'BudgetSummaryTool.js',
      'CreateMultipleTransactionsTool.js',
      'CreateSplitTransactionTool.js',
      'GetPayeesTool.js',
      'GetSinglePayeeTool.js',
      'GetUnapprovedTransactionsTool.js',
      'ListBudgetsTool.js',
      'UpdateMultipleTransactionsTool.js',
      'UpdateSingleTransactionTool.js'
    ];

    for (const tool of requiredTools) {
      const toolPath = join(distToolsDir, tool);
      expect(existsSync(toolPath), `${tool} should be compiled`).toBe(true);
    }
  });

  it('should have valid JavaScript syntax in compiled files', () => {
    const distFiles = readdirSync(distToolsDir)
      .filter(file => file.endsWith('.js') && !file.includes('.test.') && !file.includes('.integration.'));

    for (const file of distFiles) {
      const filePath = join(distToolsDir, file);
      const content = require('fs').readFileSync(filePath, 'utf8');

      // Basic syntax checks
      expect(content).toContain('export default');
      expect(content).toContain('class');
      expect(content).not.toContain('import type'); // TypeScript syntax should be removed
      expect(content).not.toContain('interface'); // TypeScript syntax should be removed
    }
  });
});