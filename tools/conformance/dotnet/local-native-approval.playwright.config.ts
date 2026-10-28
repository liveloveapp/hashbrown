import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import { LIVE_ASSERTION_TIMEOUT_MS } from './harness/live-wait-policy';
import { publicChildEnvironment } from './harness/live-configuration';

export default defineConfig({
  testDir: resolve(__dirname, 'local-specs'),
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: LIVE_ASSERTION_TIMEOUT_MS },
  outputDir: resolve(
    __dirname,
    '../../../test-results/conformance/local-native-approval',
  ),
  reporter: [['list'], [resolve(__dirname, 'harness/package-reporter.ts')]],
  use: {
    browserName: 'chromium',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    launchOptions: { env: publicChildEnvironment(process.env) },
  },
  projects: ['react', 'angular'].map((framework) => ({
    name: framework,
    metadata: { framework },
  })),
});
