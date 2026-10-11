import { expect, test, vi } from 'vitest';
import { createCachedLoader } from './cached-loader';

/** Silences console.error; call `mockRestore()` on the result at the end of the test. */
const silenceErrors = () =>
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

test('concurrent calls share one load', async () => {
  let release: (value: string) => void = () => undefined;
  const load = vi.fn(
    () => new Promise<string>((resolve) => (release = resolve)),
  );
  const get = createCachedLoader({
    load,
    freshMs: 1000,
    staleLimitMs: 5000,
    now: () => 0,
  });

  const pending = [get('a'), get('a'), get('a')];
  await Promise.resolve();
  release('value');
  const results = await Promise.all(pending);

  expect(load).toHaveBeenCalledTimes(1);
  expect(results).toEqual(Array(3).fill({ value: 'value', stale: false }));
});

test('a fresh value is reused without loading again', async () => {
  let clock = 0;
  const load = vi.fn(async () => `v${clock}`);
  const get = createCachedLoader({
    load,
    freshMs: 1000,
    staleLimitMs: 5000,
    now: () => clock,
  });

  const first = await get('a');
  clock = 999;
  const reused = await get('a');
  clock = 1000;
  const refreshed = await get('a');

  expect(load).toHaveBeenCalledTimes(2);
  expect([first?.value, reused?.value, refreshed?.value]).toEqual([
    'v0',
    'v0',
    'v1000',
  ]);
});

test('a failed reload serves the stale value within the stale limit', async () => {
  const errors = silenceErrors();
  let clock = 0;
  let fail = false;
  const load = vi.fn(async () => {
    if (fail) {
      throw new Error('down');
    }
    return 'good';
  });
  const get = createCachedLoader({
    load,
    freshMs: 1000,
    staleLimitMs: 5000,
    now: () => clock,
  });

  await get('a');
  fail = true;
  clock = 4000;
  const stale = await get('a');
  clock = 5001;
  const expired = await get('a');

  expect(stale).toEqual({ value: 'good', stale: true });
  expect(expired).toBeNull();
  expect(errors).toHaveBeenCalledWith(
    '[atc] chart load failed',
    'a',
    expect.any(Error),
  );
  errors.mockRestore();
});

test('with no value and a failed load the result is null', async () => {
  const errors = silenceErrors();
  const get = createCachedLoader({
    load: async () => {
      throw new Error('down');
    },
    freshMs: 1000,
    staleLimitMs: 5000,
    now: () => 0,
  });

  const result = await get('a');

  expect(result).toBeNull();
  errors.mockRestore();
});
