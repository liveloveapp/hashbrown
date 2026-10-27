import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import { publicChildEnvironment } from './harness/live-configuration';

export default defineConfig({
  testDir: resolve(__dirname, 'local-specs'),
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 5_000 },
  outputDir: resolve(
    __dirname,
    '../../../test-results/conformance/local-native-approval',
  ),
  reporter: [['list']],
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
