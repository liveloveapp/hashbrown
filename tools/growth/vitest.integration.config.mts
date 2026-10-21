import { defineConfig } from 'vitest/config';

import { validateGrowthDatabaseEnvironment } from './scripts/growth-database-preflight.mts';

if (
  process.env['GROWTH_INTEGRATION'] !== '1' ||
  !process.env['TEST_DATABASE_URL']?.trim()
) {
  throw new Error(
    'GROWTH_INTEGRATION=1 and a nonempty TEST_DATABASE_URL are required',
  );
}
validateGrowthDatabaseEnvironment({
  mode: 'integration',
  environment: process.env,
  nodeVersion: process.versions.node,
});

export default defineConfig({
  root: import.meta.dirname,
  test: {
    environment: 'node',
    fileParallelism: false,
    // Real Neon transactions include network round trips and cold compute startup.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ['test/**/*.integration.spec.ts'],
  },
});
