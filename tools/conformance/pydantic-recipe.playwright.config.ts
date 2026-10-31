import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';
import configuration from './conformance.playwright.config';

export default defineConfig({
  ...configuration,
  testDir: resolve(__dirname, 'pydantic-recipe'),
  testMatch: 'pydantic-recipe.spec.ts',
  testIgnore: [],
  timeout: 30_000,
  outputDir: resolve(
    __dirname,
    '../../test-results/conformance/pydantic-recipe',
  ),
  reporter: [['list']],
});
