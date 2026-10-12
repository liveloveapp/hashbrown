import { expect, test, vi } from 'vitest';
import { silenceErrors } from '../test-http';
import { createCachedLoader, createCycleLoader } from './cached-loader';

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

/** 10 October 2026, in AIRAC cycle 2610; 2611 starts on 29 October. */
const CYCLE_2610 = Date.UTC(2026, 9, 10);
const DAY_MS = 24 * 60 * 60 * 1000;

test('a cycle loader builds once per cycle from the current cycle', async () => {
  const build = vi.fn(async ({ ident }: { ident: string }) => ident);
  const get = createCycleLoader({ build, now: () => CYCLE_2610 });

  const first = await get();
  const second = await get();

  expect(build).toHaveBeenCalledTimes(1);
  expect(first).toEqual({ value: '2610', stale: false });
  expect(second).toEqual({ value: '2610', stale: false });
});

test('a cycle loader serves the previous cycle as stale while a new one fails, up to 30 days', async () => {
  const errors = silenceErrors();
  let clock = CYCLE_2610;
  const build = vi.fn(async ({ ident }: { ident: string }) => {
    if (ident !== '2610') {
      throw new Error('not published');
    }
    return ident;
  });
  const get = createCycleLoader({ build, now: () => clock });

  await get();
  clock = Date.UTC(2026, 9, 30);
  const previous = await get();
  clock = CYCLE_2610 + 31 * DAY_MS;
  const expired = await get();

  expect(previous).toEqual({ value: '2610', stale: true });
  expect(expired).toBeNull();
  errors.mockRestore();
});
