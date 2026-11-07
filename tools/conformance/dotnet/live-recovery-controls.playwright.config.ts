import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import { publicChildEnvironment } from './harness/live-configuration';

export default defineConfig({
  outputDir: resolve(
    __dirname,
    '../../../test-results/conformance/dotnet-live-recovery-controls',
  ),
  testDir: resolve(__dirname, 'live-recovery-specs'),
  testMatch: 'controls.spec.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  repeatEach: 1,
  timeout: 300_000,
  globalTimeout: 900_000,
  reporter: [['list']],
  use: {
    browserName: 'chromium',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    launchOptions: { env: publicChildEnvironment(process.env) },
  },
});
