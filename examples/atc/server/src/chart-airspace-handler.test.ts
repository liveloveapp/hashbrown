import { expect, test, vi } from 'vitest';
import type { AirspacePayload } from '@atc/shared';
import { createChartAirspaceHandler } from './chart-airspace-handler';
import { callHandler, silenceErrors } from './test-http';

/** Calls the handler with a request to its route. */
const call = (
  handler: ReturnType<typeof createChartAirspaceHandler>,
  method = 'GET',
) =>
  callHandler<Partial<AirspacePayload>>(handler, {
    method,
    url: '/api/chart/airspace',
  });

const NOW = Date.UTC(2026, 9, 10);

function feature(n: number): unknown {
  const lon = -121.2 + (n % 100) * 0.001;
  return {
    type: 'Feature',
    properties: {
      NAME: `AIRPORT ${n} CLASS D`,
      IDENT: 'BDN',
      ICAO_ID: 'KBDN',
      CLASS: 'D',
      LOCAL_TYPE: 'CLASS_D',
      LOWER_VAL: 0,
      LOWER_CODE: 'SFC',
      UPPER_VAL: 3000,
      UPPER_CODE: 'MSL',
      UPPER_DESC: null,
      WKHR_CODE: 'H24',
    },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [lon, 44],
          [lon + 0.01, 44],
          [lon + 0.01, 44.01],
          [lon, 44.01],
          [lon, 44],
        ],
      ],
    },
  };
}

const page = (count: number, start = 0) =>
  Response.json({
    type: 'FeatureCollection',
    features: Array.from({ length: count }, (_, i) => feature(start + i)),
  });

const upstreamOk = () => vi.fn<typeof fetch>(async () => page(3));

test('GET returns the cycle, shelves and the cache header', async () => {
  const handler = createChartAirspaceHandler({
    fetchFn: upstreamOk(),
    now: () => NOW,
  });

  const response = await call(handler);

  expect(response.status).toBe(200);
  expect(response.body.cycle).toBe('2610');
  expect(response.body.shelves).toHaveLength(3);
  expect(response.headers['Cache-Control']).toBe(
    'public, s-maxage=86400, stale-while-revalidate=604800',
  );
  expect(response.headers['X-Atc-Stale']).toBeUndefined();
});

test('pages while a page returns exactly 1000 features', async () => {
  const fetchFn = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(page(1000))
    .mockResolvedValueOnce(page(2, 1000));
  const handler = createChartAirspaceHandler({ fetchFn, now: () => NOW });

  const response = await call(handler);

  expect(fetchFn).toHaveBeenCalledTimes(2);
  expect(String(fetchFn.mock.calls[0][0])).toContain('resultOffset=0');
  expect(String(fetchFn.mock.calls[1][0])).toContain('resultOffset=1000');
  expect(response.body.shelves).toHaveLength(1002);
});

test('pages in a stable order', async () => {
  const fetchFn = vi.fn<typeof fetch>(async () => page(3));
  const handler = createChartAirspaceHandler({ fetchFn, now: () => NOW });

  await call(handler);

  expect(String(fetchFn.mock.calls[0][0])).toContain('orderByFields=OBJECTID');
});

test('a full first page followed by an empty one yields 1000 shelves', async () => {
  const fetchFn = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(page(1000))
    .mockResolvedValueOnce(page(0));
  const handler = createChartAirspaceHandler({ fetchFn, now: () => NOW });

  const response = await call(handler);

  expect(fetchFn).toHaveBeenCalledTimes(2);
  expect(response.body.shelves).toHaveLength(1000);
});

test('POST returns 405', async () => {
  const handler = createChartAirspaceHandler({
    fetchFn: upstreamOk(),
    now: () => NOW,
  });

  const response = await call(handler, 'POST');

  expect(response.status).toBe(405);
});

test('an upstream 500 with an empty cache returns 502', async () => {
  const errors = silenceErrors();
  const handler = createChartAirspaceHandler({
    fetchFn: async () => new Response('no', { status: 500 }),
    now: () => NOW,
  });

  const response = await call(handler);

  expect(response.status).toBe(502);
  expect(response.body.error).toBe('Airspace data unavailable');
  errors.mockRestore();
});

test('an ArcGIS error body sent with 200 returns 502', async () => {
  const errors = silenceErrors();
  const handler = createChartAirspaceHandler({
    fetchFn: async () => Response.json({ error: { code: 429 } }),
    now: () => NOW,
  });

  const response = await call(handler);

  expect(response.status).toBe(502);
  errors.mockRestore();
});

test('after a success, an upstream failure past 24 h serves the stale copy', async () => {
  const errors = silenceErrors();
  let clock = NOW;
  let fail = false;
  const handler = createChartAirspaceHandler({
    fetchFn: async () => (fail ? new Response('no', { status: 500 }) : page(3)),
    now: () => clock,
  });

  await call(handler);
  fail = true;
  clock = NOW + 25 * 60 * 60 * 1000;
  const response = await call(handler);

  expect(response.status).toBe(200);
  expect(response.headers['X-Atc-Stale']).toBe('1');
  expect(response.body.shelves).toHaveLength(3);
  errors.mockRestore();
});

test('a failing new cycle serves the previous cycle as stale', async () => {
  const errors = silenceErrors();
  let clock = NOW;
  let fail = false;
  const handler = createChartAirspaceHandler({
    fetchFn: async () => (fail ? new Response('no', { status: 404 }) : page(3)),
    now: () => clock,
  });

  await call(handler);
  fail = true;
  clock = Date.UTC(2026, 9, 30);
  const response = await call(handler);

  expect(response.status).toBe(200);
  expect(response.body.cycle).toBe('2610');
  expect(response.headers['X-Atc-Stale']).toBe('1');
  errors.mockRestore();
});

test('logs dropped shelves', async () => {
  const errors = silenceErrors();
  const handler = createChartAirspaceHandler({
    fetchFn: async () =>
      Response.json({ features: [feature(1), { properties: {} }] }),
    now: () => NOW,
  });

  const response = await call(handler);

  expect(response.body.shelves).toHaveLength(1);
  expect(errors).toHaveBeenCalledWith('[atc] airspace dropped 1 shelves');
  errors.mockRestore();
});
