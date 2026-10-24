import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, onTestFinished, test, vi } from 'vitest';
import type { NodeHandler } from '../http';
import { createAgentRunHandler } from './handler';
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
    key: 'test-secret-at-least-32-characters-long',
    secure: false,
  });

async function listen(handler: NodeHandler): Promise<string> {
  const server: Server = createServer((req, res) => void handler(req, res));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  onTestFinished(() => {
    server.closeAllConnections();
    server.close();
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test('the public adapter accepts only POST and never exposes runtime routes', async () => {
  const runtime = { fetch: vi.fn(async () => new Response('unexpected')) };
  const url = await listen(
    createAgentRunHandler({ runtime, visitors: visitors() }),
  );

  const response = await fetch(`${url}/threads/thread`);

  expect(response.status).toBe(405);
  expect(runtime.fetch).not.toHaveBeenCalled();
});

test('the adapter constructs internal headers, keeps visitor identity, and forwards status', async () => {
  const requests: Request[] = [];
  const runtime = {
    fetch: async (request: Request) => {
      requests.push(request);
      return new Response('{"error":"Denied"}', {
        status: 404,
        headers: { 'content-type': 'application/json', 'retry-after': '10' },
      });
    },
  };
  const url = await listen(
    createAgentRunHandler({ runtime, visitors: visitors() }),
  );
  const post = (cookie?: string) =>
    fetch(url, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: {
        'x-atc-visitor': 'forged',
        authorization: 'forged',
        ...(cookie ? { cookie } : {}),
      },
    });

  const first = await post();
  const cookie = first.headers.get('set-cookie')?.split(';')[0];
  const second = await post(cookie);
  const normalized = await requests[0].json();

  expect(first.status).toBe(404);
  expect(first.headers.get('retry-after')).toBe('10');
  expect(second.headers.get('set-cookie')).toBeNull();
  expect(requests[0].url).toBe('http://atc.internal/agui/%2Fatc%23agent');
  expect(requests[0].headers.get('authorization')).toBeNull();
  expect(requests[0].headers.get('x-atc-visitor')).not.toBe('forged');
  expect(requests[1].headers.get('x-atc-visitor')).toBe(
    requests[0].headers.get('x-atc-visitor'),
  );
  expect(normalized).toEqual(input);
});

test('invalid envelopes never reach the runtime', async () => {
  const runtime = { fetch: vi.fn(async () => new Response('unexpected')) };
  const url = await listen(
    createAgentRunHandler({ runtime, visitors: visitors() }),
  );

  const response = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({ ...input, runId: '' }),
  });

  expect(response.status).toBe(400);
  expect(runtime.fetch).not.toHaveBeenCalled();
});

test('streaming reaches the browser immediately and disconnect cancels the provider and body', async () => {
  let requestSignal: AbortSignal | undefined;
  let cancelled = false;
  const runtime = {
    fetch: async (request: Request) => {
      requestSignal = request.signal;
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: first\n\n'));
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      );
    },
  };
  const url = await listen(
    createAgentRunHandler({ runtime, visitors: visitors() }),
  );
  const abort = new AbortController();

  const response = await fetch(url, {
    method: 'POST',
    body: JSON.stringify(input),
    signal: abort.signal,
  });
  if (!response.body) throw new Error('Expected streaming response');
  const first = await response.body.getReader().read();
  abort.abort();

  expect(new TextDecoder().decode(first.value)).toBe('data: first\n\n');
  await vi.waitFor(() => {
    expect(requestSignal?.aborted).toBe(true);
    expect(cancelled).toBe(true);
  });
});

test('initialization failures return JSON before streaming starts', async () => {
  const runtime = {
    fetch: async () => {
      throw new Error('Runtime unavailable');
    },
  };
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  onTestFinished(() => error.mockRestore());
  const url = await listen(
    createAgentRunHandler({ runtime, visitors: visitors() }),
  );

  const response = await fetch(url, {
    method: 'POST',
    body: JSON.stringify(input),
  });

  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: 'Run failed' });
});
