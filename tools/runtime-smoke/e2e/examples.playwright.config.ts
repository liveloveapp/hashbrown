import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: resolve(__dirname, 'example-specs'),
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  outputDir: resolve(__dirname, '../../../test-results/examples'),
  reporter: [
    ['list'],
    [
      'html',
      {
        outputFolder: resolve(__dirname, '../../../playwright-report/examples'),
        open: 'never',
      },
    ],
  ],
  use: {
    browserName: 'chromium',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'angular', use: { baseURL: 'http://127.0.0.1:4321' } },
    { name: 'react', use: { baseURL: 'http://127.0.0.1:4322' } },
  ],
  webServer: ['angular', 'react'].map((framework, index) => ({
    command: `npx nx serve-example-${framework} runtime-smoke --skip-nx-cache`,
    cwd: resolve(__dirname, '../../..'),
    url: `http://127.0.0.1:${4321 + index}`,
    reuseExistingServer: false,
    timeout: 60_000,
  })),
});
