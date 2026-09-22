import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../..');
const angularPort = Number(process.env['RUNTIME_SMOKE_ANGULAR_PORT'] ?? 4411);
const reactPort = Number(process.env['RUNTIME_SMOKE_REACT_PORT'] ?? 4412);

export default defineConfig({
  testDir: resolve(__dirname, 'conformance/specs'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 15_000,
  expect: {
    timeout: 5_000,
  },
  outputDir: resolve(repoRoot, 'test-results/invoicing/conformance'),
  reporter: [
    ['list'],
    [
      'html',
      {
        outputFolder: resolve(
          repoRoot,
          'playwright-report/invoicing/conformance',
        ),
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
