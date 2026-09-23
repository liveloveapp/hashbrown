import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../..');

if (process.env.INVOICING_ENV_FILE)
  process.loadEnvFile(process.env.INVOICING_ENV_FILE);
if (!process.env.OPENAI_API_KEY)
  throw new Error(
    'Recording a real assistant answer requires OPENAI_API_KEY or INVOICING_ENV_FILE.',
  );

export default defineConfig({
  testDir: '.',
  testMatch: 'record-answer.record.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 240000,
  expect: { timeout: 90000 },
  outputDir: resolve(repoRoot, 'test-results/examples/invoicing-record'),
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4326', channel: 'chrome', headless: true },
  webServer: [
    {
      command: 'npx nx serve invoicing-server',
      cwd: '../../..',
      url: 'http://127.0.0.1:4325/api/snapshot',
      reuseExistingServer: true,
      timeout: 30000,
    },
    {
      command: 'npx nx serve invoicing-react',
      cwd: '../../..',
      url: 'http://127.0.0.1:4326',
      reuseExistingServer: true,
      timeout: 30000,
    },
  ],
});
