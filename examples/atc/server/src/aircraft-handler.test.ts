import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, expect, test, vi } from 'vitest';
import { createAircraftHandler } from './aircraft-handler';

interface Sent {
  status: number;
  headers: Record<string, string>;
  body: { at?: number; error?: string };
}

/** Calls the handler with a fake GET request and collects the response. */
async function get(
  handler: ReturnType<typeof createAircraftHandler>,
  area = 'pnw',
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
  const req = {
    method: 'GET',
    url: `/api/aircraft?area=${area}`,
  } as IncomingMessage;

  await handler(req, res);

  return sent as Sent;
}

const upstreamOk = () =>
  Response.json({
    ac: [{ hex: 'aa7f28', flight: 'UAL1372', lat: 44, lon: -121 }],
  });

let silenced: ReturnType<typeof vi.spyOn> | undefined;
afterEach(() => silenced?.mockRestore());
const silenceErrors = () => {
  silenced = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  return silenced;
};

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

test('a snapshot is reused for 3 s, then fetched again', async () => {
  let clock = 0;
  const fetchFn = vi.fn<typeof fetch>(async () => upstreamOk());
  const handler = createAircraftHandler({ fetchFn, now: () => clock });

  const first = await get(handler);
  clock = 2999;
  const reused = await get(handler);
  clock = 3000;
  const refreshed = await get(handler);

  expect(fetchFn).toHaveBeenCalledTimes(2);
  expect([first.body.at, reused.body.at, refreshed.body.at]).toEqual([
    0, 0, 3000,
  ]);
  expect(first.headers['Cache-Control']).toBe(
    'public, s-maxage=3, stale-while-revalidate=30',
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

  clock = 5000;
  const stale = await get(handler);
  clock = 19_999;
  const cooling = await get(handler);
  limited = false;
  clock = 20_000;
  const recovered = await get(handler);

  expect(fetchFn).toHaveBeenCalledTimes(3);
  expect([stale.status, cooling.status, recovered.status]).toEqual([
    200, 200, 200,
  ]);
  expect([stale.body.at, cooling.body.at, recovered.body.at]).toEqual([
    0, 0, 20_000,
  ]);
  expect(stale.headers['X-Atc-Stale']).toBe('1');
  expect(cooling.headers['X-Atc-Stale']).toBe('1');
  expect(recovered.headers['X-Atc-Stale']).toBeUndefined();
  expect(errors).toHaveBeenCalledTimes(1);
});

test('upstream failures serve stale data for up to 60 s, then 502', async () => {
  silenceErrors();
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
});

test('a 429 with nothing cached answers 502 and skips upstream during the cooldown', async () => {
  silenceErrors();
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
});
