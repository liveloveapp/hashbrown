import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../..');

// Regenerate by hand after the tape or the invoicing UI changes:
//   npx nx stills invoicing-e2e
// Stills are committed; CI never rewrites them.
export default defineConfig({
  testDir: '.',
  testMatch: 'record-stills.record.ts',
  workers: 1,
  timeout: 30000,
  expect: { timeout: 10000 },
  outputDir: resolve(repoRoot, 'test-results/examples/invoicing-stills'),
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4330',
    channel: 'chrome',
    headless: true,
  },
  webServer: {
    command:
      'npx tsx --tsconfig examples/invoicing/server/tsconfig.json examples/invoicing/server/browser-fixture.ts',
    cwd: '../../..',
    url: 'http://127.0.0.1:4330/api/snapshot',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
