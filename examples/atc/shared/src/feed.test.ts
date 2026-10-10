import { expect, test, vi } from 'vitest';
import type { AircraftSnapshot } from './aircraft';
import {
  createLiveLoader,
  createPollingFeed,
  createReplayLoader,
  readAtcOptions,
} from './feed';
import { createAtcStore } from './store';

const snapshot: AircraftSnapshot = { at: 1, aircraft: [] };

test('readAtcOptions reads replay and clamps the tick', () => {
  const options = [
    readAtcOptions(''),
    readAtcOptions('?replay=1&tick=1000'),
    readAtcOptions('?replay=1&tick=5'),
    readAtcOptions('?tick=abc'),
  ];

  expect(options).toEqual([
    { replay: false, tickMs: 5000 },
    { replay: true, tickMs: 1000 },
    { replay: true, tickMs: 250 },
    { replay: false, tickMs: 5000 },
  ]);
});

test('the polling feed marks live data and keeps polling', async () => {
  vi.useFakeTimers();
  const store = createAtcStore();
  const load = vi.fn(async () => snapshot);
  const feed = createPollingFeed({
    store,
    load,
    intervalMs: 5000,
    mode: 'live',
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
    mode: 'live',
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

test('replay mode reports replay and cycles through frames', async () => {
  const frames: AircraftSnapshot[] = [
    { at: 1, aircraft: [] },
    { at: 2, aircraft: [] },
  ];
  const load = createReplayLoader(frames);

  const ats = [(await load()).at, (await load()).at, (await load()).at];

  expect(ats).toEqual([1, 2, 1]);
});

test('the live loader requests the area and validates the response', async () => {
  const fetchFn = vi.fn<typeof fetch>(async () => Response.json(snapshot));
  const failing = vi.fn(async () =>
    Response.json({ error: 'x' }, { status: 502 }),
  );

  const loaded = await createLiveLoader('ord', fetchFn)();

  expect(loaded).toEqual(snapshot);
  expect(String(fetchFn.mock.calls[0][0])).toBe('/api/aircraft?area=ord');
  await expect(createLiveLoader('ord', failing)()).rejects.toThrow(
    'Aircraft feed returned 502',
  );
});
