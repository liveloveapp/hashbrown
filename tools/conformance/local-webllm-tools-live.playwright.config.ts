import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import conformance from './conformance.playwright.config';
import { requireWebLlmToolsLive } from './harness/webllm-tools-live-mode';

requireWebLlmToolsLive(process.env);

const ports = { angular: 4451, react: 4452 };
export default defineConfig({
  ...conformance,
  testDir: resolve(__dirname, 'local-models'),
  testMatch: 'webllm-tools-live.e2e.ts',
  timeout: 1_800_000,
  retries: 0,
  outputDir: resolve(
    __dirname,
    '../../test-results/conformance/webllm-tools-live',
  ),
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: resolve(
          __dirname,
          '../../test-results/conformance/webllm-tools-live/report.json',
        ),
      },
    ],
  ],
  use: { ...conformance.use, channel: 'chrome', headless: false },
  projects: Object.entries(ports).map(([name, port]) => ({
    name,
    use: { baseURL: `http://127.0.0.1:${port}` },
  })),
  webServer: Object.entries(ports).map(([name, port]) => ({
    command: `npx nx serve-built runtime-smoke-${name} --skip-nx-cache --port=${port}`,
    cwd: resolve(__dirname, '../..'),
    url: `http://127.0.0.1:${port}`,
    timeout: 30_000,
    reuseExistingServer: false,
  })),
  metadata: {
    scope:
      'Six fixed text-only application-selected structured tool cases; no native WebLLM tools or broader UI/media qualification.',
  },
});
