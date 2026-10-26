import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import nativeUi from './local-native-ui.playwright.config';

if (process.env['LOCAL_LLM_APPLICATION_TOOL_PHASES'] !== '1') {
  throw new Error(
    'Application tool phase workflows require LOCAL_LLM_APPLICATION_TOOL_PHASES=1.',
  );
}
const live = process.env['LOCAL_LLM_NATIVE_TOOL_WORKFLOWS_LIVE'] === '1';
export default defineConfig({
  ...nativeUi,
  outputDir: resolve(
    __dirname,
    '../../test-results/conformance/native-ui-phases',
    live ? 'live' : 'contracts',
  ),
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: resolve(
          __dirname,
          '../../test-results/conformance/native-ui-phases',
          live ? 'live-report.json' : 'contracts-report.json',
        ),
      },
    ],
  ],
});
