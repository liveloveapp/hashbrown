import { expect, test } from 'vitest';
import { createPosthogClient, type FetchLike } from './client.ts';
import type { PosthogEnv } from './env.ts';

const ENV: PosthogEnv = {
  POSTHOG_PERSONAL_API_KEY: 'phx_'.padEnd(40, 'k'),
  POSTHOG_HOST: 'https://us.i.posthog.com',
  POSTHOG_PROJECT_ID: 677870,
};

function recordingFetch(responses: Array<() => Response>) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchFn: FetchLike = async (url, init) => {
    calls.push({ url: String(url), init });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    return next();
  };
  return { calls, fetchFn };
}

test('client retries 429/502/503/504 three times with capped backoff', async () => {
  const outcomes: Array<{ status: number; calls: number; sleeps: number[] }> =
    [];

  for (const status of [429, 502, 503, 504]) {
    const sleeps: number[] = [];
    const { calls, fetchFn } = recordingFetch([
      () => new Response('busy', { status }),
    ]);
    const client = createPosthogClient({
      env: ENV,
      fetch: fetchFn,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    await expect(client.get('/insights/')).rejects.toThrow(
      new RegExp(`${status}`),
    );
    outcomes.push({ status, calls: calls.length, sleeps });
  }
  const retryAfterSleeps: number[] = [];
  const retryAfter = recordingFetch([
    () =>
      new Response('slow down', {
        status: 429,
        headers: { 'retry-after': '60' },
      }),
    () => Response.json({ ok: true }),
  ]);
  const retryAfterClient = createPosthogClient({
    env: ENV,
    fetch: retryAfter.fetchFn,
    sleep: async (ms) => {
      retryAfterSleeps.push(ms);
    },
  });
  const recovered = await retryAfterClient.get('/insights/');

  for (const outcome of outcomes) {
    expect(outcome).toEqual({
      status: outcome.status,
      calls: 4,
      sleeps: [500, 1000, 2000],
    });
  }
  expect(recovered).toEqual({ ok: true });
  expect(retryAfterSleeps).toEqual([2000]);
});

test('client does not retry other failures and never echoes the key', async () => {
  const { calls, fetchFn } = recordingFetch([
    () => new Response('{"detail":"bad"}', { status: 500 }),
  ]);
  const client = createPosthogClient({
    env: ENV,
    fetch: fetchFn,
    sleep: async () => undefined,
  });

  const error = await client.get('/insights/').catch((e: unknown) => e);

  expect(calls).toHaveLength(1);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toMatch(/GET \/insights\/ failed with 500/);
  expect((error as Error).message).not.toContain(ENV.POSTHOG_PERSONAL_API_KEY);
});

test('client sends Bearer auth to the project API and parses JSON', async () => {
  const { calls, fetchFn } = recordingFetch([
    () => Response.json({ id: 7 }),
    () => Response.json({ id: 8 }),
    () => Response.json({ id: 9 }),
  ]);
  const client = createPosthogClient({
    env: ENV,
    fetch: fetchFn,
    sleep: async () => undefined,
  });

  const got = await client.get('/insights/', {
    limit: 100,
    offset: 0,
    skip: undefined,
  });
  const posted = await client.post('/dashboards/', { name: 'D' });
  const patched = await client.patch('/insights/7/', { deleted: true });

  expect([got, posted, patched]).toEqual([{ id: 7 }, { id: 8 }, { id: 9 }]);
  expect(calls.map((c) => [c.init?.method, c.url])).toEqual([
    [
      'GET',
      'https://us.i.posthog.com/api/projects/677870/insights/?limit=100&offset=0',
    ],
    ['POST', 'https://us.i.posthog.com/api/projects/677870/dashboards/'],
    ['PATCH', 'https://us.i.posthog.com/api/projects/677870/insights/7/'],
  ]);
  const headers = new Headers(calls[1].init?.headers);
  expect(headers.get('authorization')).toBe(
    `Bearer ${ENV.POSTHOG_PERSONAL_API_KEY}`,
  );
  expect(headers.get('content-type')).toBe('application/json');
  expect(calls[1].init?.body).toBe('{"name":"D"}');
});
