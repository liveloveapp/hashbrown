import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../..');

export default defineConfig({
  testDir: resolve(__dirname, 'specs'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 15_000,
  expect: {
    timeout: 5_000,
  },
  outputDir: resolve(repoRoot, 'test-results/runtime-smoke'),
  reporter: [
    ['list'],
    [
      'html',
      {
        outputFolder: resolve(repoRoot, 'playwright-report/runtime-smoke'),
        open: 'never',
      },
    ],
  ],
  use: {
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    navigationTimeout: 5_000,
    actionTimeout: 5_000,
  },
  projects: [
    {
      name: 'angular',
      use: { baseURL: 'http://127.0.0.1:4311' },
    },
    {
      name: 'react',
      use: { baseURL: 'http://127.0.0.1:4312' },
    },
  ],
  webServer: [
    {
      command: 'npx nx run runtime-smoke-angular:serve-built --skip-nx-cache',
      cwd: repoRoot,
      url: 'http://127.0.0.1:4311',
      timeout: 30_000,
      reuseExistingServer: false,
    },
    {
      command: 'npx nx run runtime-smoke-react:serve-built --skip-nx-cache',
      cwd: repoRoot,
      url: 'http://127.0.0.1:4312',
      timeout: 30_000,
      reuseExistingServer: false,
    },
  ],
});
