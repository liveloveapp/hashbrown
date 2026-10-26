import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import {
  LIVE_PROJECTS,
  publicChildEnvironment,
} from './harness/live-configuration';

export default defineConfig({
  testDir: resolve(__dirname, 'live-specs'),
  testMatch: 'qualification.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  repeatEach: 1,
  timeout: 60_000,
  globalTimeout: 900_000,
  expect: { timeout: 10_000 },
  outputDir:
    process.env['HASHBROWN_LIVE_OUTPUT'] ??
    resolve(__dirname, '../../../test-results/conformance/dotnet-live'),
  reporter: [[resolve(__dirname, 'harness/live-reporter.ts')]],
  use: {
    browserName: 'chromium',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    launchOptions: { env: publicChildEnvironment(process.env) },
  },
  projects: LIVE_PROJECTS.map((project) => ({
    name: project.name,
    metadata: {
      provider: project.provider,
      auth: project.auth,
      framework: project.framework,
      modelApi: 'responses',
    },
    use: {
      baseURL:
        process.env[
          project.framework === 'react'
            ? 'HASHBROWN_LIVE_REACT_ORIGIN'
            : 'HASHBROWN_LIVE_ANGULAR_ORIGIN'
        ],
    },
  })),
});
