import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const angularPort = Number(process.env['RUNTIME_SMOKE_ANGULAR_PORT'] ?? 4431);
const reactPort = Number(process.env['RUNTIME_SMOKE_REACT_PORT'] ?? 4432);

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
  projects: (['chat-completions', 'responses'] as const).flatMap((modelApi) =>
    (['react', 'angular'] as const).flatMap((framework) =>
      (['openai', 'azure'] as const).map((provider) => ({
        name: `${framework}-${provider}${modelApi === 'responses' ? '-responses' : ''}`,
        metadata: { provider, framework, modelApi },
        use: {
          baseURL: `http://127.0.0.1:${framework === 'react' ? reactPort : angularPort}`,
        },
      })),
    ),
  ),
  webServer: [
    {
      command: `npx nx serve-built runtime-smoke-react --port=${reactPort}`,
      cwd: root,
      url: `http://127.0.0.1:${reactPort}`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `npx nx serve-built runtime-smoke-angular --port=${angularPort}`,
      cwd: root,
      url: `http://127.0.0.1:${angularPort}`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
