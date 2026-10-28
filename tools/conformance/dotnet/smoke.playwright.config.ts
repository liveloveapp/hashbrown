import { defineConfig } from '@playwright/test';
import full from './dotnet.playwright.config';
import { nativeBrowserSmoke } from './harness/browser-smoke-selection';

/** Runs the browser integration journey once per supported framework/provider/API combination. */
export default defineConfig({
  ...full,
  testMatch: 'integration.spec.ts',
  grep: nativeBrowserSmoke,
});
