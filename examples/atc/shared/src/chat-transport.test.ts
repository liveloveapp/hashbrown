import { expect, test, vi } from 'vitest';
import type { TransportRequest } from '@hashbrownai/core';
import { createAtcChatTransport } from './chat-transport';

const request: TransportRequest = {
  input: {
    threadId: 'atc-thread',
    runId: 'atc-run',
    messages: [
      { id: 'user', role: 'user', content: 'Show the highest aircraft.' },
    ],
    tools: [],
    context: [],
    state: {},
    forwardedProps: { hashbrown: { responseSchema: { type: 'object' } } },
  },
  signal: new AbortController().signal,
  attempt: 1,
  maxAttempts: 1,
  requestId: 'atc-request',
};
const admission = {
  error: { kind: 'request_error', details: { code: 'run_in_flight' } },
};

async function consume(events: AsyncIterable<unknown>) {
  const result: unknown[] = [];
  for await (const event of events) result.push(event);
  return result;
}

function success() {
  return new Response(
    ['RUN_STARTED', 'RUN_FINISHED']
      .map(
        (type) =>
          `data: ${JSON.stringify({ type, threadId: 'atc-thread', runId: 'atc-run' })}\n\n`,
      )
      .join(''),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}

test('waits for a B4 admission conflict and repeats the exact pinned request', async () => {
  vi.useFakeTimers();
  try {
    const bodies: unknown[] = [];
    const fetchImpl = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        expect(url).toBe('/api/run');
        bodies.push(init?.body);
        return bodies.length === 1
          ? Response.json(admission, {
              status: 409,
              headers: { 'retry-after': '1' },
            })
          : success();
      },
    ) as typeof fetch;
    const transport = createAtcChatTransport(fetchImpl);

    const response = await transport.send(request);
    const pending = consume(response.events).then(
      (events) => ({ events, error: undefined }),
      (error: unknown) => ({ events: [], error }),
    );
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(bodies[1]).toBe(bodies[0]);
    expect(JSON.parse(String(bodies[1]))).toEqual(request.input);
    expect(result.error).toBeUndefined();
    expect(result.events).toHaveLength(2);
  } finally {
    vi.useRealTimers();
  }
});

test.each([
  {
    label: 'unrelated conflict',
    status: 409,
    body: { error: 'conflict' },
    hint: '1',
  },
  {
    label: 'permission conflict',
    status: 409,
    body: {
      error: { kind: 'request_error', details: { code: 'resume_required' } },
    },
    hint: '1',
  },
  {
    label: 'execution error',
    status: 409,
    body: { error: { ...admission.error, kind: 'execution_error' } },
    hint: '1',
  },
  { label: 'different status', status: 503, body: admission, hint: '1' },
  { label: 'missing hint', status: 409, body: admission, hint: null },
  { label: 'zero hint', status: 409, body: admission, hint: '0' },
  { label: 'negative hint', status: 409, body: admission, hint: '-1' },
  { label: 'malformed hint', status: 409, body: admission, hint: 'invalid' },
  { label: 'decimal hint', status: 409, body: admission, hint: '0.5' },
])('does not retry $label', async ({ status, body, hint }) => {
  const fetchImpl = vi.fn(async () =>
    Response.json(body, {
      status,
      headers: hint === null ? {} : { 'retry-after': hint },
    }),
  ) as typeof fetch;
  const transport = createAtcChatTransport(fetchImpl);

  const response = await transport.send(request);

  await expect(consume(response.events)).rejects.toMatchObject({
    status,
    retryable: false,
  });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test.each(['{broken', JSON.stringify(admission) + ' '.repeat(16384)])(
  'does not classify malformed or truncated bodies as admission conflicts',
  async (body) => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(body, {
          status: 409,
          headers: { 'content-type': 'application/json', 'retry-after': '1' },
        }),
    ) as typeof fetch;
    const transport = createAtcChatTransport(fetchImpl);

    const response = await transport.send(request);

    await expect(consume(response.events)).rejects.toMatchObject({
      status: 409,
      retryable: false,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  },
);

test('disposing during admission waiting prevents another physical request', async () => {
  vi.useFakeTimers();
  try {
    const fetchImpl = vi.fn(async () =>
      Response.json(admission, {
        status: 409,
        headers: { 'retry-after': '1' },
      }),
    ) as typeof fetch;
    const transport = createAtcChatTransport(fetchImpl);
    const response = await transport.send(request);
    const pending = consume(response.events).catch(() => []);
    await vi.advanceTimersByTimeAsync(0);

    await response.dispose?.();
    await vi.advanceTimersByTimeAsync(61000);
    await pending;

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});
