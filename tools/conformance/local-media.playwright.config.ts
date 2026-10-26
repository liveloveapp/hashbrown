import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import conformance from './conformance.playwright.config';
import { localChromeLaunch } from './harness/local-chrome-launch';

if (process.env['CI'] || process.env['LOCAL_LLM_E2E'] !== '1') {
  throw new Error(
    'Local media tests require LOCAL_LLM_E2E=1 and cannot run in CI.',
  );
}
const native = process.env['LOCAL_LLM_MEDIA_NATIVE'] === '1';
const mode = native ? 'native' : 'shim';

const chrome = localChromeLaunch({
  tools: false,
  modelVersion: process.env['LOCAL_LLM_CHROME_MODEL_VERSION'],
});

export default defineConfig({
  ...conformance,
  metadata: {
    ...conformance.metadata,
    localChromeExperiment: {
      applicable: native,
      requestedModelVersion: chrome.modelVersion,
      toolInterfaces: false,
      note: 'Requested browser configuration; not verified loaded model identity or inference quality.',
    },
  },
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
          launchOptions: chrome.launchOptions,
        }
      : {}),
  },
});
