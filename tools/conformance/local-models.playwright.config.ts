import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import conformance from './conformance.playwright.config';

if (process.env['CI'] || process.env['LOCAL_LLM_E2E'] !== '1') {
  throw new Error(
    'Local model tests require LOCAL_LLM_E2E=1 and cannot run in CI.',
  );
}

const native = process.env['LOCAL_LLM_NATIVE'] === '1';
const webllm = process.env['LOCAL_LLM_WEBLLM'] === '1';

export default defineConfig({
  ...conformance,
  testDir: resolve(__dirname, 'local-models'),
  testMatch: webllm
    ? 'webllm.e2e.ts'
    : native
      ? 'native.e2e.ts'
      : 'contracts.e2e.ts',
  timeout:
    native && process.env['LOCAL_LLM_DOWNLOAD'] === '1'
      ? 1_200_000
      : native || webllm
        ? 300_000
        : 30_000,
  outputDir: resolve(
    __dirname,
    '../../test-results/conformance/local-models',
    webllm ? 'webllm' : native ? 'native' : 'contracts',
  ),
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: resolve(
          __dirname,
          '../../test-results/conformance/local-models',
          webllm
            ? 'webllm-report.json'
            : native
              ? 'native-report.json'
              : 'contracts-report.json',
        ),
      },
    ],
  ],
  use: {
    ...conformance.use,
    ...(native || webllm
      ? {
          channel: 'chrome',
          headless: false,
          launchOptions: {
            // Playwright disables OptimizationHints by default, which removes
            // Chrome's AI model broker. Use normal feature defaults locally.
            args: native ? ['--disable-features='] : [],
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
