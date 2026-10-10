import { expect, test, vi } from 'vitest';
import type { AircraftSnapshot } from './aircraft';
import {
  createLiveLoader,
  createPollingFeed,
  FEED_INTERVAL_MS,
  startAtcFeed,
} from './feed';
import { createAtcStore } from './store';

const snapshot: AircraftSnapshot = { at: 1, aircraft: [] };

test('the polling feed marks live data and keeps polling', async () => {
  vi.useFakeTimers();
  const store = createAtcStore();
  const load = vi.fn(async () => snapshot);
  const feed = createPollingFeed({
    store,
    load,
    intervalMs: 5000,
  });

  feed.start();
  await vi.advanceTimersByTimeAsync(10_000);
  feed.stop();

  expect(load).toHaveBeenCalledTimes(3);
  expect(store.getState().feedStatus).toBe('live');
  expect(store.getState().updatedAt).toBe(1);
  vi.useRealTimers();
});

test('failures keep the last positions and escalate from delayed to stalled', async () => {
  vi.useFakeTimers();
  let clock = 0;
  const store = createAtcStore();
  const load = vi.fn(async () => {
    if (clock > 0) {
      throw new Error('upstream down');
    }
    return { at: 1, aircraft: [] };
  });
  const feed = createPollingFeed({
    store,
    load,
    intervalMs: 5000,
    now: () => clock,
  });
  feed.start();
  await vi.advanceTimersByTimeAsync(0);

  clock = 10_000;
  await vi.advanceTimersByTimeAsync(5000);
  const early = store.getState().feedStatus;
  clock = 20_000;
  await vi.advanceTimersByTimeAsync(5000);
  const delayed = store.getState().feedStatus;
  clock = 61_000;
  await vi.advanceTimersByTimeAsync(5000);
  feed.stop();

  expect([early, delayed, store.getState().feedStatus]).toEqual([
    'live',
    'delayed',
    'stalled',
  ]);
  expect(store.getState().updatedAt).toBe(1);
  vi.useRealTimers();
});

test('the live loader requests the area and validates the response', async () => {
  const fetchFn = vi.fn<typeof fetch>(async () => Response.json(snapshot));
  const failing = vi.fn(async () =>
    Response.json({ error: 'x' }, { status: 502 }),
  );

  const loaded = await createLiveLoader('pnw', fetchFn)();

  expect(loaded).toEqual(snapshot);
  expect(String(fetchFn.mock.calls[0][0])).toBe('/api/aircraft?area=pnw');
  await expect(createLiveLoader('pnw', failing)()).rejects.toThrow(
    'Aircraft feed returned 502',
  );
});

test('startAtcFeed polls the Pacific Northwest every 3 s until stopped', async () => {
  vi.useFakeTimers();
  const store = createAtcStore();
  const fetchFn = vi.fn<typeof fetch>(async () => Response.json(snapshot));

  const stop = startAtcFeed({ store, fetchFn });
  await vi.advanceTimersByTimeAsync(2 * FEED_INTERVAL_MS);
  stop();
  await vi.advanceTimersByTimeAsync(5 * FEED_INTERVAL_MS);

  expect(FEED_INTERVAL_MS).toBe(3000);
  expect(fetchFn).toHaveBeenCalledTimes(3);
  expect(fetchFn.mock.calls.map(([url]) => String(url))).toEqual([
    '/api/aircraft?area=pnw',
    '/api/aircraft?area=pnw',
    '/api/aircraft?area=pnw',
  ]);
  expect(store.getState().feedStatus).toBe('live');
  vi.useRealTimers();
});
