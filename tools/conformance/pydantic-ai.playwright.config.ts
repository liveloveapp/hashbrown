import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';
import configuration from './conformance.playwright.config';

export default defineConfig({
  ...configuration,
  testDir: resolve(__dirname, 'pydantic-ai'),
  testMatch: 'pydantic-ai.spec.ts',
  testIgnore: [],
  timeout: 30_000,
  outputDir: resolve(__dirname, '../../test-results/conformance/pydantic-ai'),
  reporter: [['list']],
});
