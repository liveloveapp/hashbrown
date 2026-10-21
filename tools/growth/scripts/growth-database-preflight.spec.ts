import { expect, test } from 'vitest';

import { validateGrowthDatabaseEnvironment } from './growth-database-preflight.mts';

test('migration mode requires DATABASE_URL and forbids B4_DATABASE_URL', () => {
  const ok = { DATABASE_URL: 'x' };

  expect(() =>
    validateGrowthDatabaseEnvironment({
      mode: 'migration',
      environment: ok,
      nodeVersion: '24.1.0',
    }),
  ).not.toThrow();
  expect(() =>
    validateGrowthDatabaseEnvironment({
      mode: 'migration',
      environment: {},
      nodeVersion: '24.1.0',
    }),
  ).toThrow('DATABASE_URL is required');
  expect(() =>
    validateGrowthDatabaseEnvironment({
      mode: 'migration',
      environment: { ...ok, B4_DATABASE_URL: 'y' },
      nodeVersion: '24.1.0',
    }),
  ).toThrow('B4_DATABASE_URL must be absent');
});

test('integration mode requires TEST_DATABASE_URL and forbids DATABASE_URL and old Node', () => {
  const ok = { TEST_DATABASE_URL: 'x' };

  expect(() =>
    validateGrowthDatabaseEnvironment({
      mode: 'integration',
      environment: ok,
      nodeVersion: '25.0.0',
    }),
  ).not.toThrow();
  expect(() =>
    validateGrowthDatabaseEnvironment({
      mode: 'integration',
      environment: { ...ok, DATABASE_URL: 'y' },
      nodeVersion: '24.0.0',
    }),
  ).toThrow('DATABASE_URL must be absent');
  expect(() =>
    validateGrowthDatabaseEnvironment({
      mode: 'integration',
      environment: ok,
      nodeVersion: '22.1.0',
    }),
  ).toThrow('Node 24');
});
