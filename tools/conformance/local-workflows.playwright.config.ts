import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import conformance from './conformance.playwright.config';

const live = process.env['LOCAL_LLM_WORKFLOWS_LIVE'] === '1';
const suite = live
  ? 'live-' +
    (process.env['LOCAL_LLM_MODEL'] ?? 'qwen2.5:14b').replace(
      /[^a-zA-Z0-9_-]/g,
      '_',
    )
  : 'deterministic';
if (process.env['CI'] || process.env['LOCAL_LLM_E2E'] !== '1') {
  throw new Error(
    'Local workflows require LOCAL_LLM_E2E=1 and cannot run in CI.',
  );
}

export default defineConfig({
  ...conformance,
  testDir: resolve(__dirname, 'local-models'),
  testMatch: 'workflows.e2e.ts',
  timeout: live ? 240_000 : 30_000,
  expect: { timeout: live ? 120_000 : 5_000 },
  outputDir: resolve(
    __dirname,
    '../../test-results/conformance/local-workflows',
    suite,
  ),
  // Nx startup reached 29.8s under local contention before the host was ready.
  webServer: Array.isArray(conformance.webServer)
    ? conformance.webServer.map((server) => ({ ...server, timeout: 90_000 }))
    : conformance.webServer,
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: resolve(
          __dirname,
          '../../test-results/conformance/local-workflows',
          suite + '-report.json',
        ),
      },
    ],
  ],
});
