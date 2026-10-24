import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');

export default defineConfig({
  testDir: resolve(__dirname, 'specs'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  outputDir: resolve(root, 'test-results/conformance/dotnet'),
  reporter: [
    ['list'],
    [
      'html',
      {
        open: 'never',
        outputFolder: resolve(root, 'playwright-report/conformance/dotnet'),
      },
    ],
  ],
  use: {
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: (['react', 'angular'] as const).flatMap((framework) =>
    (['openai', 'azure'] as const).map((provider) => ({
      name: `${framework}-${provider}`,
      metadata: { provider, framework },
      use: {
        baseURL: `http://127.0.0.1:${framework === 'react' ? 4432 : 4431}`,
      },
    })),
  ),
  webServer: [
    {
      command: 'npx nx serve-built runtime-smoke-react --port=4432',
      cwd: root,
      url: 'http://127.0.0.1:4432',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npx nx serve-built runtime-smoke-angular --port=4431',
      cwd: root,
      url: 'http://127.0.0.1:4431',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
