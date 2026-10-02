import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import { localServers } from '../local-servers';

const repoRoot = resolve(__dirname, '../../../..');
const remote = process.env.PERF_BASE_URL;

if (!remote) {
  if (process.env.INVOICING_ENV_FILE)
    process.loadEnvFile(process.env.INVOICING_ENV_FILE);
  if (!process.env.OPENAI_API_KEY)
    throw new Error(
      'perf-live against local servers needs OPENAI_API_KEY or INVOICING_ENV_FILE; or set PERF_BASE_URL to a deployed app.',
    );
}

/**
 * The live performance scenario (`npx nx perf-live invoicing-e2e`): local
 * servers by default, or any deployment through PERF_BASE_URL. Uses the live
 * model, so results vary run to run; it reports medians.
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'perf.live.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 15 * 60_000,
  expect: { timeout: 120_000 },
  outputDir: resolve(repoRoot, 'test-results/examples/invoicing-perf'),
  reporter: [['list']],
  use: {
    baseURL: remote ?? 'http://127.0.0.1:4326',
    channel: 'chrome',
    headless: true,
  },
  webServer: remote ? undefined : localServers(repoRoot),
});
