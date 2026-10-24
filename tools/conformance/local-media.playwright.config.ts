import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import conformance from './conformance.playwright.config';

if (process.env['CI'] || process.env['LOCAL_LLM_E2E'] !== '1') {
  throw new Error(
    'Local media tests require LOCAL_LLM_E2E=1 and cannot run in CI.',
  );
}
const native = process.env['LOCAL_LLM_MEDIA_NATIVE'] === '1';
const mode = native ? 'native' : 'shim';

export default defineConfig({
  ...conformance,
  testDir: resolve(__dirname, 'local-models'),
  testMatch: 'media.e2e.ts',
  outputDir: resolve(
    __dirname,
    '../../test-results/conformance/local-models/media',
    mode,
  ),
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: resolve(
          __dirname,
          '../../test-results/conformance/local-models/media',
          mode + '-report.json',
        ),
      },
    ],
  ],
  use: {
    ...conformance.use,
    ...(native
      ? {
          channel: 'chrome',
          headless: false,
          launchOptions: {
            args: ['--disable-features='],
            ignoreDefaultArgs: [
              '--disable-component-update',
              '--disable-background-networking',
              '--disable-field-trial-config',
            ],
          },
        }
      : {}),
  },
});
