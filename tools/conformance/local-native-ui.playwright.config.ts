import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import nativeTools from './local-native-tools.playwright.config';

const live = process.env['LOCAL_LLM_NATIVE_TOOL_WORKFLOWS_LIVE'] === '1';

export default defineConfig({
  ...nativeTools,
  testMatch: 'native-ui-workflows.e2e.ts',
  outputDir: resolve(
    __dirname,
    '../../test-results/conformance/native-ui',
    live ? 'live' : 'contracts',
  ),
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: resolve(
          __dirname,
          '../../test-results/conformance/native-ui',
          live ? 'live-report.json' : 'contracts-report.json',
        ),
      },
    ],
  ],
});
