import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../..');

export default defineConfig({
  testDir: '.',
  testMatch: 'workflow.spec.ts',
  workers: 1,
  timeout: 30000,
  expect: { timeout: 10000 },
  // CI collects failure diagnostics from test-results/examples and
  // playwright-report/examples; anywhere else and a failed run uploads nothing.
  outputDir: resolve(repoRoot, 'test-results/examples/invoicing-deterministic'),
  reporter: [
    ['list'],
    [
      'html',
      {
        outputFolder: resolve(
          repoRoot,
          'playwright-report/examples/invoicing-deterministic',
        ),
        open: 'never',
      },
    ],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4330',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command:
      'npx tsx --tsconfig examples/invoicing/server/tsconfig.json examples/invoicing/server/browser-fixture.ts',
    cwd: '../../..',
    url: 'http://127.0.0.1:4330/api/snapshot',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
