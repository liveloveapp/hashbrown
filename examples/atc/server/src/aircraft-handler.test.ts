import type { AircraftSnapshot } from '@atc/shared';
import { expect, test, vi } from 'vitest';
import { createAircraftHandler } from './aircraft-handler';
import { callHandler, silenceErrors } from './test-http';

/** Calls the handler with a GET for an area. */
const get = (handler: ReturnType<typeof createAircraftHandler>, area = 'pnw') =>
  callHandler<Partial<AircraftSnapshot>>(handler, {
    url: `/api/aircraft?area=${area}`,
  });

const upstreamOk = () =>
  Response.json({
    ac: [{ hex: 'aa7f28', flight: 'UAL1372', lat: 44, lon: -121 }],
  });

test('the aircraft handler proxies adsb.lol, keeps all traffic, strips owner data and sets CDN caching', async () => {
  const fetchFn = vi.fn<typeof fetch>(async () =>
    Response.json({
      ac: [
        {
          hex: 'aa7f28',
          flight: 'UAL1372 ',
          t: 'B39M',
          ownOp: 'Owner',
          lat: 42,
          lon: -88,
          alt_baro: 35000,
        },
        {
          hex: 'a3f001',
          flight: 'N352LL',
          r: 'N352LL',
          t: 'C172',
          ownOp: 'Private Owner LLC',
          lat: 44,
          lon: -121,
          alt_baro: 4500,
        },
        { hex: 'a3f002', lat: 44.1, lon: -121.1 },
      ],
    }),
  );
  const handler = createAircraftHandler({ fetchFn, now: () => 7 });

  const response = await get(handler);

  expect(response.status).toBe(200);
  expect(response.headers['Cache-Control']).toBe(
    'public, s-maxage=3, stale-while-revalidate=5',
  );
  expect(String(fetchFn.mock.calls[0][0])).toBe(
    'https://api.adsb.lol/v2/point/44.0946/-121.2002/250',
  );
  expect(response.body.at).toBe(7);
  expect(response.body.aircraft?.map((a) => a.label)).toEqual([
    'UAL1372',
    'N352LL',
    'A3F002',
  ]);
  expect(JSON.stringify(response.body)).not.toContain('Owner');
});

test('the aircraft handler rejects unknown areas and reports upstream failures as 502', async () => {
  const silenced = silenceErrors();
  const down = vi.fn(async () => new Response('busy', { status: 503 }));
  const garbage = vi.fn(async () => new Response('<html>', { status: 200 }));
  const a = createAircraftHandler({ fetchFn: down });
  const b = createAircraftHandler({ fetchFn: garbage });

  const unknown = await get(a, 'lax');
  const failed = await get(a);
  const malformed = await get(b);

  expect(unknown.status).toBe(400);
  expect([failed.status, malformed.status]).toEqual([502, 502]);
  expect(failed.body).toEqual({ error: 'Aircraft feed unavailable' });
  expect(silenced).toHaveBeenCalledTimes(2);
  silenced.mockRestore();
});

test('concurrent requests share one upstream fetch', async () => {
  let release: (response: Response) => void = () => undefined;
  const fetchFn = vi.fn<typeof fetch>(
    () => new Promise<Response>((resolve) => (release = resolve)),
  );
  const handler = createAircraftHandler({ fetchFn, now: () => 1000 });

  const pending = [get(handler), get(handler), get(handler)];
  await Promise.resolve();
  release(upstreamOk());
  const responses = await Promise.all(pending);

  expect(fetchFn).toHaveBeenCalledTimes(1);
  expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
  expect(responses.map((r) => r.body.at)).toEqual([1000, 1000, 1000]);
});

test('a snapshot is reused for 10 s, then fetched again', async () => {
  let clock = 0;
  const fetchFn = vi.fn<typeof fetch>(async () => upstreamOk());
  const handler = createAircraftHandler({ fetchFn, now: () => clock });

  const first = await get(handler);
  clock = 9999;
  const reused = await get(handler);
  clock = 10_000;
  const refreshed = await get(handler);

  expect(fetchFn).toHaveBeenCalledTimes(2);
  expect([first.body.at, reused.body.at, refreshed.body.at]).toEqual([
    0, 0, 10_000,
  ]);
  expect(first.headers['Cache-Control']).toBe(
    'public, s-maxage=3, stale-while-revalidate=5',
  );
  expect(first.headers['X-Atc-Stale']).toBeUndefined();
});

test('unknown areas never reach upstream', async () => {
  const fetchFn = vi.fn<typeof fetch>(async () => upstreamOk());
  const handler = createAircraftHandler({ fetchFn, now: () => 0 });

  const unknown = await get(handler, 'lax');

  expect(unknown.status).toBe(400);
  expect(fetchFn).not.toHaveBeenCalled();
});

test('after a 429 it serves the last snapshot as stale and cools down for 15 s', async () => {
  const errors = silenceErrors();
  let clock = 0;
  let limited = false;
  const fetchFn = vi.fn<typeof fetch>(async () =>
    limited ? new Response('slow down', { status: 429 }) : upstreamOk(),
  );
  const handler = createAircraftHandler({ fetchFn, now: () => clock });
  await get(handler);
  limited = true;

  clock = 10_000;
  const stale = await get(handler);
  clock = 24_999;
  const cooling = await get(handler);
  limited = false;
  clock = 25_000;
  const recovered = await get(handler);

  expect(fetchFn).toHaveBeenCalledTimes(3);
  expect([stale.status, cooling.status, recovered.status]).toEqual([
    200, 200, 200,
  ]);
  expect([stale.body.at, cooling.body.at, recovered.body.at]).toEqual([
    0, 0, 25_000,
  ]);
  expect(stale.headers['X-Atc-Stale']).toBe('1');
  expect(cooling.headers['X-Atc-Stale']).toBe('1');
  expect(recovered.headers['X-Atc-Stale']).toBeUndefined();
  expect(errors).toHaveBeenCalledTimes(1);
  errors.mockRestore();
});

test('upstream failures serve stale data for up to 60 s, then 502', async () => {
  const errors = silenceErrors();
  let clock = 0;
  let down = false;
  const fetchFn = vi.fn<typeof fetch>(async () => {
    if (down) {
      throw new Error('network down');
    }
    return upstreamOk();
  });
  const handler = createAircraftHandler({ fetchFn, now: () => clock });
  await get(handler);
  down = true;

  clock = 60_000;
  const stale = await get(handler);
  clock = 60_001;
  const failed = await get(handler);

  expect([stale.status, failed.status]).toEqual([200, 502]);
  expect(stale.headers['X-Atc-Stale']).toBe('1');
  expect(failed.body).toEqual({ error: 'Aircraft feed unavailable' });
  errors.mockRestore();
});

test('a 429 with nothing cached answers 502 and skips upstream during the cooldown', async () => {
  const errors = silenceErrors();
  let clock = 0;
  const fetchFn = vi.fn<typeof fetch>(
    async () => new Response('slow down', { status: 429 }),
  );
  const handler = createAircraftHandler({ fetchFn, now: () => clock });

  const first = await get(handler);
  clock = 10_000;
  const cooling = await get(handler);

  expect([first.status, cooling.status]).toEqual([502, 502]);
  expect(fetchFn).toHaveBeenCalledTimes(1);
  errors.mockRestore();
});

test('concurrent requests share a failed upstream fetch and log it once', async () => {
  const errors = silenceErrors();
  let clock = 0;
  let fail: (error: Error) => void = () => undefined;
  const fetchFn = vi.fn<typeof fetch>(async () => upstreamOk());
  const handler = createAircraftHandler({ fetchFn, now: () => clock });
  await get(handler);
  fetchFn.mockImplementation(
    () => new Promise<Response>((_, reject) => (fail = reject)),
  );
  clock = 10_000;

  const pending = [get(handler), get(handler), get(handler)];
  await Promise.resolve();
  fail(new Error('network down'));
  const responses = await Promise.all(pending);

  expect(fetchFn).toHaveBeenCalledTimes(2);
  expect(responses.map((r) => [r.status, r.headers['X-Atc-Stale']])).toEqual([
    [200, '1'],
    [200, '1'],
    [200, '1'],
  ]);
  expect(errors).toHaveBeenCalledTimes(1);
  errors.mockRestore();
});

test('concurrent requests answer 502 when a shared fetch fails with nothing cached', async () => {
  const errors = silenceErrors();
  let fail: (error: Error) => void = () => undefined;
  const fetchFn = vi.fn<typeof fetch>(
    () => new Promise<Response>((_, reject) => (fail = reject)),
  );
  const handler = createAircraftHandler({ fetchFn, now: () => 0 });

  const pending = [get(handler), get(handler)];
  await Promise.resolve();
  fail(new Error('network down'));
  const responses = await Promise.all(pending);

  expect(fetchFn).toHaveBeenCalledTimes(1);
  expect(responses.map((r) => r.status)).toEqual([502, 502]);
  expect(errors).toHaveBeenCalledTimes(1);
  errors.mockRestore();
});

test('a hanging upstream call times out, serves stale data and starts no cooldown', async () => {
  const errors = silenceErrors();
  let clock = 0;
  const fetchFn = vi.fn<typeof fetch>(async () => upstreamOk());
  const handler = createAircraftHandler({
    fetchFn,
    now: () => clock,
    timeoutMs: 20,
  });
  await get(handler);
  fetchFn.mockImplementation(
    (_url, init) =>
      new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal?.reason),
        ),
      ),
  );
  clock = 10_000;

  const timedOut = await get(handler);
  clock = 10_001;
  await get(handler);

  expect(timedOut.status).toBe(200);
  expect(timedOut.headers['X-Atc-Stale']).toBe('1');
  expect(fetchFn).toHaveBeenCalledTimes(3);
  errors.mockRestore();
});
