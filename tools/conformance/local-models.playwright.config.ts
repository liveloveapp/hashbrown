import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import conformance from './conformance.playwright.config';
import { localChromeLaunch } from './harness/local-chrome-launch';

if (process.env['CI'] || process.env['LOCAL_LLM_E2E'] !== '1') {
  throw new Error(
    'Local model tests require LOCAL_LLM_E2E=1 and cannot run in CI.',
  );
}

const nativeToolRoundtrip =
  process.env['LOCAL_LLM_NATIVE_TOOL_ROUNDTRIP'] === '1';
const nativeTools =
  process.env['LOCAL_LLM_NATIVE_TOOLS'] === '1' || nativeToolRoundtrip;
const native = process.env['LOCAL_LLM_NATIVE'] === '1' || nativeTools;
const webllm = process.env['LOCAL_LLM_WEBLLM'] === '1';

const chrome = localChromeLaunch({
  tools: nativeTools,
  modelVersion: process.env['LOCAL_LLM_CHROME_MODEL_VERSION'],
});

export default defineConfig({
  ...conformance,
  metadata: {
    ...conformance.metadata,
    localChromeExperiment: {
      applicable: native,
      requestedModelVersion: chrome.modelVersion,
      toolInterfaces: nativeTools,
      note: 'Requested browser configuration; not verified loaded model identity or inference quality.',
    },
  },
  testDir: resolve(__dirname, 'local-models'),
  testMatch: nativeToolRoundtrip
    ? 'native-tools-roundtrip.e2e.ts'
    : nativeTools
      ? 'native-tools.e2e.ts'
      : webllm
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
    nativeToolRoundtrip
      ? 'native-tools-roundtrip'
      : nativeTools
        ? 'native-tools'
        : webllm
          ? 'webllm'
          : native
            ? 'native'
            : 'contracts',
  ),
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: resolve(
          __dirname,
          '../../test-results/conformance/local-models',
          nativeToolRoundtrip
            ? 'native-tools-roundtrip-report.json'
            : nativeTools
              ? 'native-tools-report.json'
              : webllm
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
          launchOptions: native
            ? chrome.launchOptions
            : {
                args: [],
                ignoreDefaultArgs: chrome.launchOptions.ignoreDefaultArgs,
              },
        }
      : {}),
  },
});
