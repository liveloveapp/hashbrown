import { expect, test, vi } from 'vitest';
import type { Surfaces } from '@atc/shared';
import { createChartSurfacesHandler } from './chart-surfaces-handler';
import { callHandler, silenceErrors } from './test-http';

/** Calls the handler with a GET and a query string. */
const call = (
  handler: ReturnType<typeof createChartSurfacesHandler>,
  query: string,
) =>
  callHandler<Partial<Surfaces>>(handler, {
    url: `/api/chart/surfaces?${query}`,
  });

const json = (body: unknown) => new Response(JSON.stringify(body));
const ring = [
  [-122.3, 47.4],
  [-122.29, 47.4],
  [-122.29, 47.41],
  [-122.3, 47.4],
];
const taxiwayLayer = {
  features: [
    {
      properties: { DESIGNATOR: 'A' },
      geometry: { type: 'Polygon', coordinates: [ring] },
    },
  ],
};
const empty = { features: [] };
const airportHit = (ident: string) => ({
  features: [
    {
      properties: { IDENT: ident },
      geometry: { type: 'Point', coordinates: [-122.3, 47.4] },
    },
  ],
});
const overpass = {
  elements: [
    {
      type: 'way',
      tags: { aeroway: 'taxiway', ref: 'B' },
      geometry: [
        { lat: 1, lon: 2 },
        { lat: 2, lon: 3 },
      ],
    },
  ],
};

/** Routes by URL like the three upstream services. */
const upstream = (options: { airport: unknown; taxiways: unknown }) =>
  vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.includes('US_Airport')) return json(options.airport);
    if (url.includes('AM_Taxiway')) return json(options.taxiways);
    if (url.includes('AM_Apron') || url.includes('AM_Hotspot'))
      return json(empty);
    if (url.includes('overpass-api.de')) return json(overpass);
    throw new Error(`unexpected ${url}`);
  });

const NOW = Date.UTC(2026, 9, 10);

test('KSEA with Airport Mapping data is served from the FAA', async () => {
  const fetchFn = upstream({
    airport: airportHit('SEA'),
    taxiways: taxiwayLayer,
  });
  const handler = createChartSurfacesHandler({ fetchFn, now: () => NOW });

  const response = await call(handler, 'airport=ksea');

  expect(response.status).toBe(200);
  expect(response.body.source).toBe('faa');
  expect(response.body.code).toBe('KSEA');
  expect(response.headers['Cache-Control']).toBe(
    'public, s-maxage=86400, stale-while-revalidate=604800',
  );
  expect(
    fetchFn.mock.calls.some(([url]) => String(url).includes('overpass')),
  ).toBe(false);
});

test('KRDM without Airport Mapping data falls back to OSM once', async () => {
  const fetchFn = upstream({ airport: airportHit('RDM'), taxiways: empty });
  const handler = createChartSurfacesHandler({ fetchFn, now: () => NOW });

  const response = await call(handler, 'airport=KRDM');

  expect(response.status).toBe(200);
  expect(response.body.source).toBe('osm');
  expect(
    fetchFn.mock.calls.filter(([url]) => String(url).includes('overpass')),
  ).toHaveLength(1);
});

test('a malformed code returns 400 without calling upstream', async () => {
  const fetchFn = upstream({ airport: empty, taxiways: empty });
  const handler = createChartSurfacesHandler({ fetchFn, now: () => NOW });

  const response = await call(handler, 'airport=K%24X');

  expect(response.status).toBe(400);
  expect(fetchFn).not.toHaveBeenCalled();
});

test('an unknown well-formed code returns 400 and is not refetched', async () => {
  const fetchFn = upstream({ airport: empty, taxiways: empty });
  const handler = createChartSurfacesHandler({ fetchFn, now: () => NOW });

  const first = await call(handler, 'airport=ZZZZ');
  const second = await call(handler, 'airport=ZZZZ');

  expect(first.status).toBe(400);
  expect(second.status).toBe(400);
  expect(fetchFn).toHaveBeenCalledTimes(1);
});

test('upstream down with an empty cache returns 502', async () => {
  const errors = silenceErrors();
  const fetchFn = vi.fn<typeof fetch>(
    async () => new Response('no', { status: 500 }),
  );
  const handler = createChartSurfacesHandler({ fetchFn, now: () => NOW });

  const response = await call(handler, 'airport=KSEA');

  expect(response.status).toBe(502);
  errors.mockRestore();
});

test('an ArcGIS error body on an Airport Mapping layer counts as no FAA data', async () => {
  const errors = silenceErrors();
  const fetchFn = upstream({
    airport: airportHit('SEA'),
    taxiways: { error: { code: 429, message: 'Too many requests' } },
  });
  const handler = createChartSurfacesHandler({ fetchFn, now: () => NOW });

  const response = await call(handler, 'airport=KSEA');

  expect(response.status).toBe(200);
  expect(response.body.source).toBe('osm');
  errors.mockRestore();
});

test('an Airport Mapping layer that returns 500 falls back to OSM', async () => {
  const fetchFn = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.includes('US_Airport')) return json(airportHit('BDN'));
    if (url.includes('overpass-api.de')) return json(overpass);
    return new Response('down', { status: 500 });
  });
  const handler = createChartSurfacesHandler({ fetchFn, now: () => NOW });

  const response = await call(handler, 'airport=KBDN');

  expect(response.status).toBe(200);
  expect(response.body.source).toBe('osm');
});

test('the US_Airport lookup failing still fails the load', async () => {
  const errors = silenceErrors();
  const fetchFn = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.includes('overpass-api.de')) return json(overpass);
    if (url.includes('US_Airport'))
      return new Response('down', { status: 500 });
    return json(empty);
  });
  const handler = createChartSurfacesHandler({ fetchFn, now: () => NOW });

  const response = await call(handler, 'airport=KBDN');

  expect(response.status).toBe(502);
  errors.mockRestore();
});

test('an Overpass error remark sent as 200 is a failure, not runways-only', async () => {
  const errors = silenceErrors();
  const fetchFn = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.includes('US_Airport')) return json(airportHit('BDN'));
    if (url.includes('overpass-api.de'))
      return json({
        elements: [],
        remark: 'runtime error: Query timed out in "query" at line 1',
      });
    return json(empty);
  });
  const handler = createChartSurfacesHandler({ fetchFn, now: () => NOW });

  const response = await call(handler, 'airport=KBDN');

  expect(response.status).toBe(502);
  errors.mockRestore();
});

test('the Overpass query asks for at most 12 s of server time', async () => {
  const fetchFn = upstream({ airport: airportHit('RDM'), taxiways: empty });
  const handler = createChartSurfacesHandler({ fetchFn, now: () => NOW });

  await call(handler, 'airport=KRDM');

  const body = fetchFn.mock.calls.find(([url]) =>
    String(url).includes('overpass'),
  )?.[1]?.body;
  expect(decodeURIComponent(String(body))).toContain('[timeout:12]');
});

test('the whole load shares one deadline, so slow upstream steps add up to a 502', async () => {
  const errors = silenceErrors();
  const routed = upstream({ airport: airportHit('RDM'), taxiways: empty });
  const fetchFn = vi.fn<typeof fetch>(
    (input, init) =>
      new Promise((resolve, reject) => {
        // Like fetch: an already aborted signal rejects at once.
        if (init?.signal?.aborted) return reject(init.signal.reason);
        const timer = setTimeout(() => resolve(routed(input, init)), 30);
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(init.signal?.reason);
        });
      }),
  );
  const handler = createChartSurfacesHandler({
    fetchFn,
    now: () => NOW,
    deadlineMs: 50,
  });

  const response = await call(handler, 'airport=KRDM');

  expect(response.status).toBe(502);
  errors.mockRestore();
});
