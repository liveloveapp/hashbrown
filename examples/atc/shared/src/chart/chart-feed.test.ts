import { expect, test, vi } from 'vitest';
import { createAtcStore } from '../store';
import { loadSurfaces, startChartFeed } from './chart-feed';

const payload = { cycle: '2610', effective: '2026-10-08', airports: [] };

function fakeScheduler() {
  const delays: number[] = [];
  const pending: Array<() => void> = [];
  return {
    delays,
    schedule: (fn: () => void, ms: number) => {
      delays.push(ms);
      pending.push(fn);
      return () => undefined;
    },
    async runNext() {
      pending.shift()?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test('a successful fetch makes the chart ready', async () => {
  const store = createAtcStore();
  const fetchFn = vi.fn<typeof fetch>(async () => Response.json(payload));

  startChartFeed({ store, fetchFn, schedule: fakeScheduler().schedule });
  await flush();

  expect(fetchFn.mock.calls[0][0]).toBe('/api/chart/airports');
  expect(store.getState().chart.status).toBe('ready');
});

test('failures go limited and retry at 30 s, 2 min, then every 10 min', async () => {
  const store = createAtcStore();
  const fetchFn = vi.fn<typeof fetch>(
    async () => new Response('no', { status: 500 }),
  );
  const scheduler = fakeScheduler();

  startChartFeed({ store, fetchFn, schedule: scheduler.schedule });
  await flush();
  for (let i = 0; i < 3; i++) {
    await scheduler.runNext();
  }
  await scheduler.runNext();

  expect(store.getState().chart.status).toBe('limited');
  expect(scheduler.delays).toEqual([30000, 120000, 600000, 600000, 600000]);
});

test('a retry that succeeds makes the chart ready', async () => {
  const store = createAtcStore();
  const fetchFn = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response('no', { status: 503 }))
    .mockResolvedValueOnce(Response.json(payload));
  const scheduler = fakeScheduler();

  startChartFeed({ store, fetchFn, schedule: scheduler.schedule });
  await flush();
  expect(store.getState().chart.status).toBe('limited');
  await scheduler.runNext();

  expect(store.getState().chart.status).toBe('ready');
  expect(scheduler.delays).toEqual([30000]);
});

test('loadSurfaces fetches a code once', async () => {
  const store = createAtcStore();
  const fetchFn = vi.fn<typeof fetch>(async () =>
    Response.json({ source: 'osm', features: [] }),
  );

  await loadSurfaces({ store, code: 'KSEA', fetchFn });
  await loadSurfaces({ store, code: 'KSEA', fetchFn });

  expect(fetchFn).toHaveBeenCalledTimes(1);
  expect(fetchFn.mock.calls[0][0]).toBe('/api/chart/surfaces?airport=KSEA');
  expect(store.getState().surfaces.get('KSEA')).toEqual({
    code: 'KSEA',
    source: 'osm',
    features: [],
  });
});

test('loadSurfaces marks a 500 as failed', async () => {
  const store = createAtcStore();
  const fetchFn = vi.fn<typeof fetch>(
    async () => new Response('no', { status: 500 }),
  );

  await loadSurfaces({ store, code: 'KSEA', fetchFn });

  expect(store.getState().surfaces.get('KSEA')).toBe('failed');
});
