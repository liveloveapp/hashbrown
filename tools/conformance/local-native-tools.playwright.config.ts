import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import conformance from './conformance.playwright.config';
import { localChromeLaunch } from './harness/local-chrome-launch';

if (process.env['CI'] || process.env['LOCAL_LLM_E2E'] !== '1') {
  throw new Error(
    'Native tool workflows require LOCAL_LLM_E2E=1 and cannot run in CI.',
  );
}
const live = process.env['LOCAL_LLM_NATIVE_TOOL_WORKFLOWS_LIVE'] === '1';
const chrome = localChromeLaunch({
  tools: true,
  modelVersion: process.env['LOCAL_LLM_CHROME_MODEL_VERSION'],
});

export default defineConfig({
  ...conformance,
  metadata: {
    ...conformance.metadata,
    localChromeExperiment: {
      applicable: live,
      requestedModelVersion: chrome.modelVersion,
      toolInterfaces: true,
      note: 'Requested browser configuration; not verified loaded model identity or inference quality.',
    },
  },
  testDir: resolve(__dirname, 'local-models'),
  testMatch: 'native-tool-workflows.e2e.ts',
  workers: 1,
  timeout: live ? 180_000 : 30_000,
  expect: { timeout: live ? 120_000 : 10_000 },
  outputDir: resolve(
    __dirname,
    '../../test-results/conformance/native-tool-workflows',
    live ? 'live' : 'contracts',
  ),
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: resolve(
          __dirname,
          '../../test-results/conformance/native-tool-workflows',
          live ? 'live-report.json' : 'contracts-report.json',
        ),
      },
    ],
  ],
  webServer:
    conformance.webServer &&
    (Array.isArray(conformance.webServer)
      ? conformance.webServer
      : [conformance.webServer]
    ).map((server) => ({ ...server, timeout: 90_000 })),
  use: {
    ...conformance.use,
    ...(live
      ? {
          channel: 'chrome',
          headless: false,
          launchOptions: chrome.launchOptions,
        }
      : {}),
  },
});
