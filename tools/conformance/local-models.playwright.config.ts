import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import conformance from './conformance.playwright.config';

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

export default defineConfig({
  ...conformance,
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
          launchOptions: {
            // Playwright disables OptimizationHints by default, which removes
            // Chrome's AI model broker. Use normal feature defaults locally.
            args: nativeTools
              ? [
                  '--disable-features=',
                  '--enable-features=AIPromptAPIToolUse,OnDeviceModelConversationBackend,AIApiFoundationalModel:model_version/v4',
                ]
              : native
                ? ['--disable-features=']
                : [],
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
