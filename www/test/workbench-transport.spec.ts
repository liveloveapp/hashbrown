import { expect, test } from 'vitest';
import type { Transport, TransportRequest } from '@hashbrownai/core';
import { EventType } from '@ag-ui/core';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { createWorkbenchTransport } from '../examples/quickstart/runtime/workbench-transport';

test('captures the real request and its stream lazily, preserving disposal', async () => {
  const store = createWorkbenchStore();
  store.send('Plan');
  let reads = 0;
  const dispose = () => undefined;
  const delegate: Transport = {
    name: 'fixture',
    send: async () => ({
      dispose,
      events: (async function* () {
        reads++;
        yield {
          type: EventType.RUN_STARTED,
          threadId: 't',
          runId: 'r',
        } as const;
      })(),
    }),
  };
  const request = {
    input: {
      threadId: 't',
      runId: 'r',
      messages: [],
      tools: [],
      context: [],
      state: {},
    },
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: 'request-1',
  } satisfies TransportRequest;

  const response = await createWorkbenchTransport(store, delegate).send(
    request,
  );

  expect(reads).toBe(0);
  expect(response.dispose).toBe(dispose);
  for await (const event of response.events)
    expect(event.type).toBe('RUN_STARTED');
  expect(store.getSnapshot().events.map((e) => e.kind)).toEqual([
    'user',
    'request',
    'event',
  ]);
});

test('ignores late events after clearing and starting a new conversation with the same turn number', async () => {
  const store = createWorkbenchStore();
  store.send('Old');
  const delegate: Transport = {
    name: 'fixture',
    send: async () => ({
      events: (async function* () {
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'late',
          delta: 'old response',
        } as const;
      })(),
    }),
  };
  const response = await createWorkbenchTransport(store, delegate).send({
    input: {
      threadId: 'old',
      runId: 'r',
      messages: [],
      tools: [],
      context: [],
      state: {},
    },
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: 'old',
  });
  store.clear();
  store.send('New');

  for await (const event of response.events)
    expect(event.type).toBe('TEXT_MESSAGE_CONTENT');

  expect(store.getSnapshot().frame?.json).toBe('');
});

test('records a real HTTP denial and reads the gate for each new request', async () => {
  const { createServer } = await import('node:http');
  const server = createServer((req, res) => {
    res.writeHead(403, {
      'X-Workbench-Source': 'demo-failure',
      'Content-Type': 'application/json',
    });
    res.end(
      JSON.stringify({
        error: 'private-response-body',
      }),
    );
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  const store = createWorkbenchStore();
  let denied = true;
  const responses: Response[] = [];
  const transport = createWorkbenchTransport(
    store,
    undefined,
    `http://127.0.0.1:${address.port}/api/workbench/debugging`,
    {
      getDebugDenied: () => denied,
      onResponse: (response) => responses.push(response),
    },
  );
  const request = {
    input: {
      threadId: 't',
      runId: 'r',
      messages: [],
      tools: [],
      context: [],
      state: {},
    },
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: 'request',
  } satisfies TransportRequest;

  try {
    store.send('Plan');
    await expect(
      (async () => {
        const response = await transport.send(request);
        for await (const event of response.events) void event;
      })(),
    ).rejects.toThrow();
    const response = store
      .getSnapshot()
      .events.find((event) => event.kind === 'response');
    expect(responses.map((response) => response.status)).toEqual([403]);
    expect(response?.payload).toMatchObject({
      status: 403,
      source: 'demo-failure',
      problem: 'Demo denial is enabled. Disable Demo denial and send again.',
    });
    expect((response?.payload as { url: string }).url).toContain(
      '?demoDenied=1',
    );
    expect(JSON.stringify(store.getSnapshot())).not.toContain(
      'private-response-body',
    );
    store.settle('error');
    denied = false;
    store.send('Retry');
    await expect(
      (async () => {
        const response = await transport.send(request);
        for await (const event of response.events) void event;
      })(),
    ).rejects.toThrow();
    expect(
      (
        store
          .getSnapshot()
          .events.filter((event) => event.kind === 'request')
          .at(-1)?.payload as { url: string }
      ).url,
    ).not.toContain('demoDenied');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});

test('ignores superseded request errors within the same user turn', async () => {
  const store = createWorkbenchStore();
  store.send('Plan');
  const transport = createWorkbenchTransport(store, {
    name: 'fixture',
    send: async () => ({
      events: (async function* () {
        yield { type: EventType.RUN_STARTED, threadId: 't', runId: 'r' };
        throw new Error('old request');
      })(),
    }),
  });
  const request = {
    input: {
      threadId: 't',
      runId: 'r',
      messages: [],
      tools: [],
      context: [],
      state: {},
    },
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: 'request',
  } satisfies TransportRequest;
  const old = await transport.send(request);
  await transport.send({ ...request, requestId: 'new' });

  await expect(
    (async () => {
      for await (const event of old.events) void event;
    })(),
  ).rejects.toThrow('old request');

  expect(store.getSnapshot().status).toBe('loading');
  expect(
    store.getSnapshot().events.some((event) => event.kind === 'error'),
  ).toBe(false);
});
