import { expect, test } from 'vitest';
import { readAgentBackendSettings } from './backend';

const secret = 'hosted-secret-with-at-least-32-characters';

test('hosted b4.run requires a shared signing key and database explicitly', () => {
  const missing = [
    { VERCEL: '1' },
    { VERCEL: '1', ATC_B4RUN_COOKIE_SECRET: secret },
  ];

  const reads = missing.map((env) => () => readAgentBackendSettings(env));

  expect(reads[0]).toThrow('ATC_B4RUN_COOKIE_SECRET');
  expect(reads[1]).toThrow('ATC_B4RUN_DATABASE_URL');
});

test('hosted settings use the dedicated ATC database and secure cookies', () => {
  const env = {
    VERCEL: '1',
    ATC_B4RUN_COOKIE_SECRET: secret,
    ATC_B4RUN_DATABASE_URL: 'postgres://atc.invalid/atc',
    DATABASE_URL: 'postgres://other.invalid/growth',
  };

  const settings = readAgentBackendSettings(env);

  expect(settings).toEqual({ cookieSecret: secret, secure: true });
});

test('local SQLite development needs no database or shared signing secret', () => {
  const first = readAgentBackendSettings({});
  const second = readAgentBackendSettings({});

  expect(first.secure).toBe(false);
  expect(first.cookieSecret).toHaveLength(64);
  expect(second.cookieSecret).not.toBe(first.cookieSecret);
});
