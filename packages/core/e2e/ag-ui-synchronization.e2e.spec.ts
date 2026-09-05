import { EventType } from '@ag-ui/core';
import { join, resolve } from 'node:path';

type CoreModule = typeof import('../src/public_api');

const workspaceRoot = resolve(__dirname, '../../..');
const core = require(
  join(workspaceRoot, 'dist/packages/core/index.cjs'),
) as CoreModule;

function encodeSse(events: readonly unknown[]): Uint8Array {
  return new TextEncoder().encode(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
  );
}

function createSseResponse(events: readonly unknown[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encodeSse(events));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

async function waitForRuntimeIdle(runtime: {
  readonly isLoading: () => boolean;
}): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (!runtime.isLoading()) return;

    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  throw new Error('Timed out waiting for the built chat runtime to settle');
}

test('built HTTP runtime synchronizes and commits state and canonical messages', async () => {
  const responseEvents = [
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-built',
      runId: 'run-built',
    },
    { type: EventType.STATE_SNAPSHOT, snapshot: { count: 1 } },
    {
      type: EventType.STATE_DELTA,
      delta: [
        { op: 'replace', path: '/count', value: 2 },
        { op: 'add', path: '/status', value: 'ready' },
      ],
    },
    {
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        { id: 'user-snapshot', role: 'user', content: 'Synchronize.' },
        {
          id: 'assistant-snapshot',
          role: 'assistant',
          content: 'Synchronized.',
        },
      ],
    },
    {
      type: EventType.RUN_FINISHED,
      threadId: 'thread-built',
      runId: 'run-built',
    },
  ];
  const originalEvents = structuredClone(responseEvents);
  const requestBodies: Record<string, unknown>[] = [];
  const fetchImpl = jest.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBodies.push(
        JSON.parse(String(init?.body)) as Record<string, unknown>,
      );
      const body = requestBodies.at(-1);
      const threadId = body?.['threadId'];
      const runId = body?.['runId'];
      const events = responseEvents.map((event) =>
        event.type === EventType.RUN_STARTED ||
        event.type === EventType.RUN_FINISHED
          ? { ...event, threadId, runId }
          : event,
      );

      return createSseResponse(events);
    },
  );
  const runtime = core.createChatRuntime({
    debounce: 0,
    messages: [{ role: 'user', content: 'Synchronize.' }],
    state: { count: 0 },
    system: 'Synchronize shared state.',
    transport: core.createHttpTransport({
      fetchImpl: fetchImpl as typeof fetch,
    }),
  });
  const stateValues: unknown[] = [];
  const messageValues: unknown[] = [];
  const unsubscribeState = runtime.state.subscribe((value) =>
    stateValues.push(value),
  );
  const unsubscribeMessages = runtime.messages.subscribe((value) =>
    messageValues.push(value),
  );
  const teardown = runtime.start();

  try {
    await waitForRuntimeIdle(runtime);

    expect(requestBodies).toHaveLength(1);
    expect(requestBodies[0]).toMatchObject({ state: { count: 0 } });
    expect(requestBodies[0]?.['messages']).toEqual([
      expect.objectContaining({
        role: 'system',
        content: 'Synchronize shared state.',
      }),
      expect.objectContaining({ role: 'user', content: 'Synchronize.' }),
    ]);
    expect(stateValues).toEqual([
      { count: 0 },
      { count: 1 },
      { count: 2, status: 'ready' },
    ]);
    expect(runtime.state()).toEqual({ count: 2, status: 'ready' });
    expect(runtime.messages()).toEqual([
      { role: 'user', content: 'Synchronize.' },
      { role: 'assistant', content: 'Synchronized.', toolCalls: [] },
    ]);
    expect(messageValues).toContainEqual(runtime.messages());
    expect(responseEvents).toEqual(originalEvents);
  } finally {
    unsubscribeState();
    unsubscribeMessages();
    teardown();
  }
});

test('built HTTP runtime rolls back a failing synchronized draft', async () => {
  const requestBodies: Record<string, unknown>[] = [];
  const fetchImpl = jest.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requestBodies.push(body);

      return createSseResponse([
        {
          type: EventType.RUN_STARTED,
          threadId: body['threadId'],
          runId: body['runId'],
        },
        { type: EventType.STATE_SNAPSHOT, snapshot: { count: 9 } },
        {
          type: EventType.STATE_DELTA,
          delta: [{ op: 'remove', path: '/missing' }],
        },
        {
          type: EventType.RUN_FINISHED,
          threadId: body['threadId'],
          runId: body['runId'],
        },
      ]);
    },
  );
  const runtime = core.createChatRuntime({
    debounce: 0,
    messages: [{ role: 'user', content: 'Fail synchronization.' }],
    retries: 0,
    state: { count: 0 },
    system: 'Synchronize shared state.',
    transport: core.createHttpTransport({
      fetchImpl: fetchImpl as typeof fetch,
    }),
  });
  const stateValues: unknown[] = [];
  const unsubscribe = runtime.state.subscribe((value) =>
    stateValues.push(value),
  );
  const teardown = runtime.start();

  try {
    await waitForRuntimeIdle(runtime);

    expect(requestBodies).toHaveLength(1);
    expect(requestBodies[0]).toMatchObject({ state: { count: 0 } });
    expect(stateValues).toEqual([{ count: 0 }, { count: 9 }, { count: 0 }]);
    expect(runtime.state()).toEqual({ count: 0 });
    expect(runtime.error()).toEqual(
      expect.objectContaining({
        message: expect.stringContaining('path does not exist: /missing'),
        retryable: false,
      }),
    );
  } finally {
    unsubscribe();
    teardown();
  }
});
