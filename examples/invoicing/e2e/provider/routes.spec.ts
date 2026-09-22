import {
  type AGUIEvent,
  EventSchemas,
  EventType,
  type RunAgentInput,
} from '@ag-ui/core';
import { createHttpTransport, type TransportRequest } from '@hashbrownai/core';
import { startAimock } from '@hashbrownai/testing/aimock';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { handleWorkerRequest } from './fixtures/worker-route';
import { createApi } from './fixtures/node-route';

jest.mock('express', () => ({
  __esModule: true,
  default: jest.requireActual('express'),
}));
jest.mock('cors', () => ({
  __esModule: true,
  default: jest.requireActual('cors'),
}));

function fixturePath(name: string): string {
  return resolve(process.cwd(), 'tools/testing/aimock/fixtures', name);
}

function createInput(): RunAgentInput {
  return {
    threadId: 'express-thread',
    runId: 'express-run',
    messages: [
      {
        id: 'express-system',
        role: 'system',
        content: 'You are a deterministic test assistant.',
      },
      {
        id: 'express-user',
        role: 'user',
        content: 'say hi briefly',
      },
    ],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
  };
}

async function collectEvents(
  events: AsyncIterable<AGUIEvent>,
): Promise<AGUIEvent[]> {
  const collected: AGUIEvent[] = [];

  for await (const event of events) {
    collected.push(event);
  }

  return collected;
}

test('OpenAI Express route streams canonical AG-UI SSE to HttpTransport', async () => {
  const aimock = await startAimock({ fixturePath: fixturePath('text.json') });
  let server: Server | undefined;

  try {
    server = createApi({
      apiKey: 'test-not-used',
      baseURL: aimock.openAiBaseUrl,
      model: 'gpt-4.1-mini',
    }).listen(0, '127.0.0.1');
    await new Promise<void>((resolveListening, reject) => {
      server?.once('listening', resolveListening);
      server?.once('error', reject);
    });
    const address = server.address() as AddressInfo;
    let observedContentType: string | null = null;
    const transport = createHttpTransport({
      baseUrl: `http://127.0.0.1:${address.port}/api/chat`,
      fetchImpl: async (input, init) => {
        const response = await fetch(input, init);
        observedContentType = response.headers.get('content-type');
        return response;
      },
    });
    const request: TransportRequest = {
      input: createInput(),
      signal: new AbortController().signal,
      attempt: 1,
      maxAttempts: 1,
      requestId: 'express-request',
    };

    const response = await transport.send(request);
    const events = await collectEvents(response.events);
    await response.dispose?.();

    expect(observedContentType).toMatch(/^text\/event-stream(?:;|$)/);
    expect(events).toEqual([
      {
        type: EventType.RUN_STARTED,
        threadId: 'express-thread',
        runId: 'express-run',
      },
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId: 'express-run:assistant',
        role: 'assistant',
      },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'express-run:assistant',
        delta: 'Hello from aimock.',
      },
      {
        type: EventType.TEXT_MESSAGE_END,
        messageId: 'express-run:assistant',
      },
      {
        type: EventType.RUN_FINISHED,
        threadId: 'express-thread',
        runId: 'express-run',
      },
    ]);
  } finally {
    if (server) {
      await new Promise<void>((resolveClosed, reject) => {
        server?.close((error) => (error ? reject(error) : resolveClosed()));
      });
    }
    await aimock.stop();
  }
});

test('OpenAI worker route streams canonical AG-UI SSE to HttpTransport', async () => {
  const aimock = await startAimock({ fixturePath: fixturePath('text.json') });
  let observedContentType: string | null = null;
  const transport = createHttpTransport({
    baseUrl: 'https://worker.example/api/chat',
    fetchImpl: async (input, init) => {
      const response = await handleWorkerRequest({
        request: new Request(input, init),
        options: {
          apiKey: 'test-not-used',
          baseURL: aimock.openAiBaseUrl,
          model: 'gpt-4.1-mini',
        },
      });
      observedContentType = response.headers.get('content-type');
      return response;
    },
  });
  const request: TransportRequest = {
    input: createInput(),
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: 'worker-request',
  };

  try {
    const response = await transport.send(request);
    const events = await collectEvents(response.events);
    await response.dispose?.();

    expect(observedContentType).toMatch(/^text\/event-stream(?:;|$)/);
    expect(events.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);
    expect(events.at(2)).toMatchObject({
      type: EventType.TEXT_MESSAGE_CONTENT,
      delta: 'Hello from aimock.',
    });
  } finally {
    await aimock.stop();
  }
});

test('OpenAI Express route serves AG-UI through its native provider without process environment mutation', async () => {
  const aimock = await startAimock({
    fixturePath: resolve('tools/testing/aimock/fixtures/text.json'),
  });
  let server: Server | undefined;

  try {
    server = createApi({
      apiKey: 'fixture-only',
      baseURL: aimock.openAiBaseUrl,
      model: 'gpt-4.1-mini',
    }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId: 'sample-thread',
        runId: 'sample-run',
        messages: [{ id: 'user', role: 'user', content: 'say hi briefly' }],
        tools: [],
        context: [],
        state: {},
        forwardedProps: {},
      }),
      signal: AbortSignal.timeout(5000),
    });
    const body = await response.text();
    const events = body
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => EventSchemas.parse(JSON.parse(line.slice(5))));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(events[0]).toEqual({
      type: EventType.RUN_STARTED,
      threadId: 'sample-thread',
      runId: 'sample-run',
    });
    expect(events.at(-1)).toEqual({
      type: EventType.RUN_FINISHED,
      threadId: 'sample-thread',
      runId: 'sample-run',
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: EventType.TEXT_MESSAGE_CONTENT,
        delta: 'Hello from aimock.',
      }),
    );
  } finally {
    try {
      if (server?.listening) {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          server?.close((error) => (error ? reject(error) : resolve())),
        );
      }
    } finally {
      await aimock.stop();
    }
  }
});
