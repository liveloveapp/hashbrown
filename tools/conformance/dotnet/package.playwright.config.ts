import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import original from './dotnet.playwright.config';

if (
  process.env['HASHBROWN_DOTNET_HOST_MODE'] !== 'package' ||
  !process.env['HASHBROWN_DOTNET_CONSUMER_METADATA'] ||
  !process.env['HASHBROWN_DOTNET_CONSUMER_SHA256'] ||
  !process.env['HASHBROWN_LOCAL_NATIVE_CONSUMER_METADATA']
)
  throw new Error('Pinned prepared NuGet and npm package descriptors required');

export default defineConfig({
  ...original,
  webServer: [],
  outputDir: resolve(__dirname, '../../../test-results/conformance/package'),
  reporter: [['list'], [resolve(__dirname, 'harness/package-reporter.ts')]],
  projects: original.projects?.map((project) => ({
    ...project,
    use: {
      ...project.use,
      baseURL:
        process.env[
          `HASHBROWN_PACKAGE_${String(project.metadata?.['framework']).toUpperCase()}_URL`
        ],
    },
  })),
});
