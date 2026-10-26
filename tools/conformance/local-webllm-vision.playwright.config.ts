import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import conformance from './conformance.playwright.config';
import { requireWebLlmVisionSmoke } from './harness/webllm-vision-mode';

requireWebLlmVisionSmoke(process.env);

export default defineConfig({
  ...conformance,
  testDir: resolve(__dirname, 'local-models'),
  testMatch: 'webllm-vision.e2e.ts',
  timeout: 1_800_000,
  outputDir: resolve(__dirname, '../../test-results/conformance/webllm-vision'),
  reporter: [['list']],
  use: { ...conformance.use, channel: 'chrome', headless: false },
  metadata: {
    scope:
      'Explicitly authorized application-selected real VLM canary; no model default or HTTP fallback.',
  },
});
