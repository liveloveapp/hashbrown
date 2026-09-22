import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../..');
const angularPort = Number(process.env['NATIVE_PROVIDER_ANGULAR_PORT'] ?? 4421);
const reactPort = Number(process.env['NATIVE_PROVIDER_REACT_PORT'] ?? 4422);

export default defineConfig({
  testDir: resolve(__dirname, 'provider'),
  testMatch: 'native-ui.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  outputDir: resolve(repoRoot, 'test-results/invoicing/provider'),
  reporter: [
    ['list'],
    [
      'html',
      {
        outputFolder: resolve(repoRoot, 'playwright-report/invoicing/provider'),
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
      use: { baseURL: `http://127.0.0.1:${angularPort}` },
    },
    {
      name: 'react',
      use: { baseURL: `http://127.0.0.1:${reactPort}` },
    },
  ],
  webServer: [
    {
      command: `npx nx serve-built runtime-smoke-angular --skip-nx-cache --port=${angularPort}`,
      cwd: repoRoot,
      url: `http://127.0.0.1:${angularPort}`,
      timeout: 30_000,
      reuseExistingServer: false,
    },
    {
      command: `npx nx serve-built runtime-smoke-react --skip-nx-cache --port=${reactPort}`,
      cwd: repoRoot,
      url: `http://127.0.0.1:${reactPort}`,
      timeout: 30_000,
      reuseExistingServer: false,
    },
  ],
});
