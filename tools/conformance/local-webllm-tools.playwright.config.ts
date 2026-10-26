import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import conformance from './conformance.playwright.config';
import { requireWebLlmToolContracts } from './harness/webllm-tool-contract-mode';

requireWebLlmToolContracts(process.env);

export default defineConfig({
  ...conformance,
  timeout: 30_000,
  testDir: resolve(__dirname, 'local-models'),
  testMatch: 'webllm-tools.e2e.ts',
  outputDir: resolve(
    __dirname,
    '../../test-results/conformance/webllm-tools/artifacts',
  ),
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: resolve(
          __dirname,
          '../../test-results/conformance/webllm-tools/contracts-report.json',
        ),
      },
    ],
  ],
  metadata: {
    scope:
      'Model-free LLMock structured tool contracts; no inference runtime, download, or model qualification.',
  },
});
