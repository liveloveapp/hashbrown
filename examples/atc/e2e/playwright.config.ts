import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../..');

export default defineConfig({
  testDir: resolve(__dirname, 'src'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: resolve(repoRoot, 'test-results/atc'),
  reporter: [
    ['list'],
    [
      'html',
      {
        outputFolder: resolve(repoRoot, 'playwright-report/atc'),
        open: 'never',
      },
    ],
  ],
  use: {
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'angular' }, { name: 'react' }],
});
