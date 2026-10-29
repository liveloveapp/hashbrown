import { defineConfig } from '@playwright/test';
import packaged from './package.playwright.config';
import { nativeBrowserSmoke } from './harness/browser-smoke-selection';

/** Runs pinned PR integration journeys against the qualified external package consumer. */
export default defineConfig({
  ...packaged,
  testMatch: 'integration.spec.ts',
  grep: nativeBrowserSmoke,
});
