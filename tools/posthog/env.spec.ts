import { expect, test, vi } from 'vitest';
import { env, parseEnv } from './env.ts';

const KEY = 'phx_'.padEnd(40, 'a');

test('env requires a 20-char key and a positive integer project id', () => {
  const valid = { POSTHOG_PERSONAL_API_KEY: KEY, POSTHOG_PROJECT_ID: '677870' };
  const badIds = ['0', '-1', '1.5', 'abc', '', undefined];

  const parsed = parseEnv(valid);

  expect(parsed).toEqual({
    POSTHOG_PERSONAL_API_KEY: KEY,
    POSTHOG_HOST: 'https://us.i.posthog.com',
    POSTHOG_PROJECT_ID: 677870,
  });
  expect(() =>
    parseEnv({ ...valid, POSTHOG_PERSONAL_API_KEY: 'phx_short' }),
  ).toThrow(/POSTHOG_PERSONAL_API_KEY/);
  expect(() => parseEnv({ POSTHOG_PROJECT_ID: '1' })).toThrow(
    /POSTHOG_PERSONAL_API_KEY/,
  );
  for (const id of badIds) {
    expect(() => parseEnv({ ...valid, POSTHOG_PROJECT_ID: id })).toThrow(
      /POSTHOG_PROJECT_ID/,
    );
  }
});

test('env errors never echo the key value', () => {
  const secret = 'phx_do_not_print';

  const attempt = () =>
    parseEnv({ POSTHOG_PERSONAL_API_KEY: secret, POSTHOG_PROJECT_ID: '1' });

  expect(attempt).toThrow(/POSTHOG_PERSONAL_API_KEY/);
  expect(attempt).not.toThrow(new RegExp(secret));
});

test('env accepts an https host override and rejects anything else', () => {
  const base = { POSTHOG_PERSONAL_API_KEY: KEY, POSTHOG_PROJECT_ID: '1' };

  const parsed = parseEnv({
    ...base,
    POSTHOG_HOST: 'https://eu.i.posthog.com/',
  });

  expect(parsed.POSTHOG_HOST).toBe('https://eu.i.posthog.com');
  expect(() => parseEnv({ ...base, POSTHOG_HOST: 'not a url' })).toThrow(
    /POSTHOG_HOST/,
  );
  expect(() =>
    parseEnv({ ...base, POSTHOG_HOST: 'http://us.i.posthog.com' }),
  ).toThrow(/POSTHOG_HOST/);
});

test('env() reads process.env on every call', () => {
  vi.stubEnv('POSTHOG_PERSONAL_API_KEY', KEY);
  vi.stubEnv('POSTHOG_PROJECT_ID', '42');
  vi.stubEnv('POSTHOG_HOST', '');

  try {
    const first = env();
    vi.stubEnv('POSTHOG_PROJECT_ID', '43');
    const second = env();

    expect(first.POSTHOG_PROJECT_ID).toBe(42);
    expect(second.POSTHOG_PROJECT_ID).toBe(43);
    expect(second.POSTHOG_HOST).toBe('https://us.i.posthog.com');
  } finally {
    vi.unstubAllEnvs();
  }
});
