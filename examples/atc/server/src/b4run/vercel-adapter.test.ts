import { expect, test, vi } from 'vitest';
import { createAtcVercelAdapter } from './vercel-adapter';

const input = {
  threadId: 'thread',
  runId: 'run',
  messages: [],
  tools: [],
  state: {},
  context: [],
  forwardedProps: {},
};
const env = {
  ATC_CHAT_BACKEND: 'b4run',
  ATC_B4RUN_COOKIE_SECRET: 'shared-secret-at-least-32-characters',
  ATC_B4RUN_DATABASE_URL: 'postgres://atc.test/state',
  DATABASE_URL: 'postgres://other.test/growth',
};

test('the generated runtime receives only guarded run requests and the dedicated state database', async () => {
  let forwarded: Request | undefined;
  let bindings: Record<string, string> | undefined;
  const runtime = {
    fetch: async (request: Request, runtimeEnv: Record<string, string>) => {
      forwarded = request;
      bindings = runtimeEnv;
      return new Response('data: done\n\n', {
        headers: { 'content-type': 'text/event-stream' },
      });
    },
  };
  const app = createAtcVercelAdapter(runtime, () => env);

  const response = await app.fetch(
    new Request('https://atc.test/api/run', {
      method: 'POST',
      body: JSON.stringify(input),
      headers: { 'x-atc-visitor': 'forged' },
    }),
  );

  expect(await response.text()).toBe('data: done\n\n');
  expect(response.headers.get('set-cookie')).toContain('Secure');
  expect(forwarded?.url).toBe('http://atc.internal/agui/%2Fatc%23agent');
  expect(forwarded?.headers.get('x-atc-visitor')).not.toBe('forged');
  expect(bindings).toEqual({
    DATABASE_URL: env.ATC_B4RUN_DATABASE_URL,
    B4_PG_TABLE_PREFIX: 'atc',
  });
  expect(env.DATABASE_URL).toBe('postgres://other.test/growth');
});

test('alternate generated runtime endpoints remain unreachable', async () => {
  const runtime = { fetch: vi.fn(async () => new Response('unexpected')) };
  const app = createAtcVercelAdapter(runtime, () => env);

  const statuses = await Promise.all(
    ['/agui/%2Fatc%23agent', '/threads/thread', '/healthz', '/readyz'].map(
      async (path) =>
        (await app.fetch(new Request(`https://atc.test${path}`))).status,
    ),
  );

  expect(statuses).toEqual([404, 404, 404, 404]);
  expect(runtime.fetch).not.toHaveBeenCalled();
});

test('a packaged agent cannot silently use the wrong backend or local storage', async () => {
  const runtime = { fetch: vi.fn(async () => new Response('unexpected')) };
  const settings = [
    {},
    { ATC_CHAT_BACKEND: 'b4run' },
    {
      ATC_CHAT_BACKEND: 'b4run',
      ATC_B4RUN_COOKIE_SECRET: env.ATC_B4RUN_COOKIE_SECRET,
    },
  ];

  const statuses = [];
  for (const settingsEnv of settings)
    statuses.push(
      (
        await createAtcVercelAdapter(runtime, () => settingsEnv).fetch(
          new Request('https://atc.test/api/run', {
            method: 'POST',
            body: JSON.stringify(input),
          }),
        )
      ).status,
    );

  expect(statuses).toEqual([503, 503, 503]);
  expect(runtime.fetch).not.toHaveBeenCalled();
});
