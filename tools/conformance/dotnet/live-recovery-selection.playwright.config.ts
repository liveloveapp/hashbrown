import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  outputDir: resolve(
    __dirname,
    '../../../test-results/conformance/dotnet-live-recovery-selection',
  ),
  testDir: resolve(__dirname, 'live-recovery-specs'),
  testMatch: 'selection.spec.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  repeatEach: 1,
  timeout: 600_000,
  globalTimeout: 900_000,
  reporter: [['list']],
  use: { trace: 'off', screenshot: 'off', video: 'off' },
});
