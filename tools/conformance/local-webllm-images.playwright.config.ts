import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import conformance from './conformance.playwright.config';
import { requireWebLlmImageContracts } from './harness/webllm-image-contract-mode';

requireWebLlmImageContracts(process.env);

export default defineConfig({
  ...conformance,
  testDir: resolve(__dirname, 'local-models'),
  testMatch: 'webllm-images.e2e.ts',
  outputDir: resolve(__dirname, '../../test-results/conformance/webllm-images'),
  reporter: [['list']],
  metadata: {
    scope:
      'Deterministic image transport and worker contracts; no runtime/model/inference qualification.',
  },
});
