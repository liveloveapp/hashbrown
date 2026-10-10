import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import conformance from './conformance.playwright.config';

const repoRoot = resolve(__dirname, '../..');

/**
 * Run the conformance specs and the native-provider spec against both
 * runtime smoke hosts with one shared host lifecycle.
 */
export default defineConfig({
  ...conformance,
  testDir: __dirname,
  timeout: 30_000,
  outputDir: resolve(repoRoot, 'test-results/conformance/all'),
  reporter: 'list',
  projects: (conformance.projects ?? []).map((project) => ({
    ...project,
    testMatch: ['specs/**/*.spec.ts', 'provider/native-ui.spec.ts'],
  })),
});
