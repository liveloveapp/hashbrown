/* eslint-disable @nx/enforce-module-boundaries -- Route smoke tests exercise application entry points directly. */
import { type AGUIEvent, EventType, type RunAgentInput } from '@ag-ui/core';
import { createHttpTransport, type TransportRequest } from '@hashbrownai/core';
import { startAimock } from '@hashbrownai/testing/aimock';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { onRequest as handleWorkerRequest } from '../../../../samples/fast-food/angular/functions/api/chat';
import { createApi } from '../../../../samples/fast-food/server/src/app';

jest.mock('express', () => ({
  __esModule: true,
  default: jest.requireActual('express'),
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
  const previousApiKey = process.env['OPENAI_API_KEY'];
  const previousBaseUrl = process.env['OPENAI_BASE_URL'];
  const previousModel = process.env['OPENAI_MODEL'];
  const aimock = await startAimock({ fixturePath: fixturePath('text.json') });
  process.env['OPENAI_API_KEY'] = 'test-not-used';
  process.env['OPENAI_BASE_URL'] = aimock.openAiBaseUrl;
  process.env['OPENAI_MODEL'] = 'gpt-4.1-mini';
  let server: Server | undefined;

  try {
    server = createApi().listen(0, '127.0.0.1');
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
    if (previousApiKey === undefined) {
      delete process.env['OPENAI_API_KEY'];
    } else {
      process.env['OPENAI_API_KEY'] = previousApiKey;
    }
    if (previousBaseUrl === undefined) {
      delete process.env['OPENAI_BASE_URL'];
    } else {
      process.env['OPENAI_BASE_URL'] = previousBaseUrl;
    }
    if (previousModel === undefined) {
      delete process.env['OPENAI_MODEL'];
    } else {
      process.env['OPENAI_MODEL'] = previousModel;
    }
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
        env: {
          OPENAI_API_KEY: 'test-not-used',
          OPENAI_BASE_URL: aimock.openAiBaseUrl,
          OPENAI_MODEL: 'gpt-4.1-mini',
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
