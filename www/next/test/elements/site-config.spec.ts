import { expect, test } from 'vitest';
import {
  APP_CONFIG_STORAGE_KEY,
  DEFAULT_APP_CONFIG,
  normalizeAppConfig,
  parseStoredAppConfig,
} from '../../src/lib/site-config';

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

test('uses the same storage key and defaults as the Angular ConfigService', () => {
  const key = APP_CONFIG_STORAGE_KEY;

  const defaults = DEFAULT_APP_CONFIG;

  expect(key).toBe('config');
  expect(defaults).toEqual({
    sdk: 'angular',
    provider: 'openai',
    backend: 'express',
  });
});

test('parses a stored config string and falls back to defaults on bad JSON', () => {
  const stored = '{"sdk":"react","provider":"openai","backend":"hono"}';

  const parsed = parseStoredAppConfig(stored);
  const broken = parseStoredAppConfig('{not json');

  expect(parsed).toEqual({ sdk: 'react', provider: 'openai', backend: 'hono' });
  expect(broken).toEqual(DEFAULT_APP_CONFIG);
});
