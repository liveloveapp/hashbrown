import { expect, test } from 'vitest';
import { normalizeAppConfig } from './ConfigService';

test('preserves supported configuration values', () => {
  const config = {
    sdk: 'angular',
    provider: 'google',
    backend: 'fastify',
  } as const;

  const result = normalizeAppConfig(config);

  expect(result).toEqual(config);
});

test('replaces a removed provider with the default provider', () => {
  const config = {
    sdk: 'angular',
    provider: 'writer',
    backend: 'fastify',
  };

  const result = normalizeAppConfig(config);

  expect(result).toEqual({
    sdk: 'angular',
    provider: 'openai',
    backend: 'fastify',
  });
});

test('defaults to Angular when nothing is saved', () => {
  const saved = null;

  const result = normalizeAppConfig(saved);

  expect(result.sdk).toBe('angular');
});
