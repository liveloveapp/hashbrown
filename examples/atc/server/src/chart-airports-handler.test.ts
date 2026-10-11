import type { IncomingMessage, ServerResponse } from 'node:http';
import { expect, test, vi } from 'vitest';
import type { ChartAirports } from '@atc/shared';
import { createChartAirportsHandler } from './chart-airports-handler';
import { aptBase, aptRwy, aptRwyEnd, frq } from './chart/nasr-fixture';
import { makeZip } from './chart/test-zip';

interface Sent {
  status: number;
  headers: Record<string, string>;
  body: Partial<ChartAirports> & { error?: string };
}

/** Calls the handler with a fake request and collects the response. */
async function call(
  handler: ReturnType<typeof createChartAirportsHandler>,
  method = 'GET',
): Promise<Sent> {
  const sent: Partial<Sent> = {};
  const res = {
    writeHead(status: number, headers: Record<string, string>) {
      sent.status = status;
      sent.headers = headers;
    },
    end(body: string) {
      sent.body = JSON.parse(body);
    },
  } as unknown as ServerResponse;
  const req = { method, url: '/api/chart/airports' } as IncomingMessage;

  await handler(req, res);

  return sent as Sent;
}

const aptZip = makeZip({
  'APT_BASE.csv': aptBase,
  'APT_RWY.csv': aptRwy,
  'APT_RWY_END.csv': aptRwyEnd,
});
const frqZip = makeZip({ 'FRQ.csv': frq });

/** Routes by URL suffix like the FAA site. */
const upstreamOk = () =>
  vi.fn<typeof fetch>(async (input) =>
    String(input).endsWith('_APT_CSV.zip')
      ? new Response(aptZip)
      : new Response(frqZip),
  );

/** Silences console.error; call `mockRestore()` on the result at the end of the test. */
const silenceErrors = () =>
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

const NOW = Date.UTC(2026, 9, 10);

test('GET returns the cycle, three airports and the cache header', async () => {
  const handler = createChartAirportsHandler({
    fetchFn: upstreamOk(),
    now: () => NOW,
  });

  const response = await call(handler);

  expect(response.status).toBe(200);
  expect(response.body.cycle).toBe('2610');
  expect(response.body.airports).toHaveLength(3);
  expect(response.headers['Cache-Control']).toBe(
    'public, s-maxage=86400, stale-while-revalidate=604800',
  );
  expect(response.headers['X-Atc-Stale']).toBeUndefined();
});

test('POST returns 405', async () => {
  const handler = createChartAirportsHandler({
    fetchFn: upstreamOk(),
    now: () => NOW,
  });

  const response = await call(handler, 'POST');

  expect(response.status).toBe(405);
});

test('an upstream 500 with an empty cache returns 502', async () => {
  const errors = silenceErrors();
  const handler = createChartAirportsHandler({
    fetchFn: async () => new Response('no', { status: 500 }),
    now: () => NOW,
  });

  const response = await call(handler);

  expect(response.status).toBe(502);
  expect(response.body.error).toBe('Chart data unavailable');
  errors.mockRestore();
});

test('after a success, an upstream failure past 24 h serves the stale copy', async () => {
  const errors = silenceErrors();
  let clock = NOW;
  let fail = false;
  const ok = upstreamOk();
  const handler = createChartAirportsHandler({
    fetchFn: async (input, init) =>
      fail ? new Response('no', { status: 500 }) : ok(input, init),
    now: () => clock,
  });

  await call(handler);
  fail = true;
  clock = NOW + 25 * 60 * 60 * 1000;
  const response = await call(handler);

  expect(response.status).toBe(200);
  expect(response.headers['X-Atc-Stale']).toBe('1');
  expect(response.body.airports).toHaveLength(3);
  errors.mockRestore();
});

test('the URL uses the NASR date of the current cycle', async () => {
  const fetchFn = upstreamOk();
  const handler = createChartAirportsHandler({ fetchFn, now: () => NOW });

  await call(handler);

  const urls = fetchFn.mock.calls.map(([input]) => String(input)).sort();
  expect(urls).toEqual([
    'https://nfdc.faa.gov/webContent/28DaySub/extra/01_Oct_2026_APT_CSV.zip',
    'https://nfdc.faa.gov/webContent/28DaySub/extra/01_Oct_2026_FRQ_CSV.zip',
  ]);
});

test('a failing new cycle serves the previous cycle as stale', async () => {
  const errors = silenceErrors();
  let clock = NOW;
  let fail = false;
  const ok = upstreamOk();
  const handler = createChartAirportsHandler({
    fetchFn: async (input, init) =>
      fail ? new Response('no', { status: 404 }) : ok(input, init),
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
