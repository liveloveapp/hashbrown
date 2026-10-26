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
