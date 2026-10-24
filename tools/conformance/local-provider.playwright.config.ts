import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

if (process.env['CI'] || process.env['LOCAL_LLM_E2E'] !== '1') {
  throw new Error(
    'Local provider tests require LOCAL_LLM_E2E=1 and cannot run in CI.',
  );
}

export default defineConfig({
  testDir: resolve(__dirname, 'local-models'),
  testMatch: 'provider.e2e.ts',
  timeout: 120_000,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  projects: [{ name: 'local-provider' }],
  outputDir: resolve(
    __dirname,
    '../../test-results/conformance/local-models/provider',
  ),
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: resolve(
          __dirname,
          '../../test-results/conformance/local-models/provider-report.json',
        ),
      },
    ],
  ],
});
