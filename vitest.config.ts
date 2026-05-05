import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/tools/__tests__/AnalyzeSpendingTool.test.ts',
      'src/tools/__tests__/AnalyzeTransactionsTool.test.ts',
      'src/tools/__tests__/GenerateSpendingReportTool.test.ts',
      'src/tools/__tests__/GetUnapprovedTransactionsTool.test.ts',
      'src/tools/__tests__/PrelaunchEntityTools.test.ts',
      'src/tools/__tests__/build-verification.test.ts',
      'src/tools/__tests__/toolRegistry.test.ts',
    ],
    exclude: [
      '**/*.live.test.*',
      '**/*.integration.test.*',
      'node_modules/**',
      'dist/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
