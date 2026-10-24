import { expect, test, vi } from 'vitest';
import { createAgentFetchHandler } from './fetch-handler';
import { createVisitorIdentity } from './visitor';

const input = {
  threadId: 'thread',
  runId: 'run',
  messages: [{ id: 'user', role: 'user', content: 'Hello' }],
  tools: [],
  state: {},
  context: [],
  forwardedProps: {},
};
const visitors = () =>
  createVisitorIdentity({
    key: 'test-signing-key-at-least-32-characters',
    secure: true,
  });

test('the fetch ingress refuses alternate runtime URLs before reading the body', async () => {
  const runtime = { fetch: vi.fn(async () => new Response('unexpected')) };
  const app = createAgentFetchHandler({ runtime, visitors: visitors() });

  const response = await app.fetch(
    new Request('https://atc.test/threads/thread', {
      method: 'POST',
      body: '{}',
    }),
  );

  expect(response.status).toBe(404);
  expect(runtime.fetch).not.toHaveBeenCalled();
});

test('the fetch ingress pins requests and returns the original stream with signed identity', async () => {
  let forwarded: Request | undefined;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: first\n\n'));
      controller.close();
    },
  });
  const app = createAgentFetchHandler({
    visitors: visitors(),
    runtime: {
      fetch: async (request) => {
        forwarded = request;
        return new Response(body, {
          headers: { 'content-type': 'text/event-stream' },
        });
      },
    },
  });

  const response = await app.fetch(
    new Request('https://atc.test/api/run', {
      method: 'POST',
      body: JSON.stringify(input),
      headers: { 'x-atc-visitor': 'forged' },
    }),
  );

  expect(response.body).toBe(body);
  expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  expect(await response.text()).toBe('data: first\n\n');
  expect(forwarded?.url).toBe('http://atc.internal/agui/%2Fatc%23agent');
  expect(forwarded?.headers.get('x-atc-visitor')).not.toBe('forged');
});

test('fetch body, message and JSON limits match the Node endpoint', async () => {
  const runtime = { fetch: vi.fn(async () => new Response('unexpected')) };
  const app = createAgentFetchHandler({ runtime, visitors: visitors() });
  const bodies = [
    '{',
    JSON.stringify({ ...input, runId: '' }),
    JSON.stringify({ ...input, pad: 'x'.repeat(256 * 1024) }),
    JSON.stringify({
      ...input,
      messages: [{ id: 'user', role: 'user', content: 'x'.repeat(16_000) }],
    }),
  ];

  const statuses = [];
  for (const body of bodies)
    statuses.push(
      (
        await app.fetch(
          new Request('https://atc.test/api/run', { method: 'POST', body }),
        )
      ).status,
    );

  expect(statuses).toEqual([400, 400, 413, 413]);
  expect(runtime.fetch).not.toHaveBeenCalled();
});
