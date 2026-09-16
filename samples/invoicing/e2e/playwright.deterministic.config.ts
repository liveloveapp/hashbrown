import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'workflow.spec.ts',
  workers: 1,
  timeout: 30000,
  expect: { timeout: 10000 },
  outputDir: '../../../work/invoicing-deterministic',
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4330',
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command:
      'npx tsx --tsconfig samples/invoicing/server/tsconfig.json samples/invoicing/server/browser-fixture.ts',
    cwd: '../../..',
    url: 'http://127.0.0.1:4330/api/snapshot',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
