import { defineConfig } from '@playwright/test';
import application from './playwright.deterministic.config';
import conformance from './conformance.playwright.config';

/** Run canonical workflows and both-framework suites with one shared host lifecycle. */
export default defineConfig({
  ...conformance,
  testDir: '.',
  timeout: 30000,
  outputDir: '../../../test-results/invoicing/all',
  reporter: 'list',
  projects: [
    {
      name: 'application',
      testMatch: 'workflow.spec.ts',
      use: application.use,
      expect: application.expect,
    },
    ...(conformance.projects ?? []).map((project) => ({
      ...project,
      testMatch: [
        'conformance/specs/**/*.spec.ts',
        'provider/native-ui.spec.ts',
      ],
    })),
  ],
  webServer: [
    ...(Array.isArray(application.webServer)
      ? application.webServer
      : application.webServer
        ? [application.webServer]
        : []),
    ...(Array.isArray(conformance.webServer)
      ? conformance.webServer
      : conformance.webServer
        ? [conformance.webServer]
        : []),
  ],
});
