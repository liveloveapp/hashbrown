import { defineConfig } from '@playwright/test';
import { isAbsolute, resolve } from 'node:path';
import {
  candidateBrowserCompositions,
  candidateBrowserManifest,
  type CandidateBrowserMode,
} from './harness/candidate-browser-manifest';

const mode = process.env['HASHBROWN_CANDIDATE_BROWSER_MODE'];
if (mode !== 'pilot' && mode !== 'all')
  throw new Error('Explicit candidate browser mode required');
const evidence = process.env['HASHBROWN_CANDIDATE_EVIDENCE'];
if (!evidence || !isAbsolute(evidence))
  throw new Error('Explicit absolute candidate evidence directory required');
const manifest = candidateBrowserManifest(mode as CandidateBrowserMode);
const browserEnvironment: Record<string, string> = {};
for (const key of [
  'PATH',
  'TMPDIR',
  'TMP',
  'TEMP',
  'SystemRoot',
  'WINDIR',
  'LANG',
]) {
  const value = process.env[key];
  if (value !== undefined) browserEnvironment[key] = value;
}

export default defineConfig({
  outputDir: resolve(evidence, 'playwright-output'),
  testDir: resolve(__dirname, 'candidate-specs'),
  testMatch: 'browser-recovery.spec.ts',
  globalSetup: resolve(__dirname, 'harness/candidate-browser-recovery.ts'),
  workers: 1,
  maxFailures: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    [resolve(__dirname, 'harness/candidate-browser-reporter.ts')],
  ],
  use: {
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { env: browserEnvironment },
  },
  projects: candidateBrowserCompositions
    .filter((composition) =>
      manifest.some((record) => record.composition === composition),
    )
    .map((composition) => ({
      name: composition,
      metadata: { composition },
      grep: new RegExp(`${composition.split('.').join('[.]')}[.]`),
    })),
});
