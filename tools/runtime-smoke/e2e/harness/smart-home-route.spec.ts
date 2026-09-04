/* eslint-disable @nx/enforce-module-boundaries -- Exercise the real sample route and provider adapter. */
import { EventSchemas, EventType } from '@ag-ui/core';
import { startAimock } from '@hashbrownai/testing/aimock';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { createApi } from '../../../../samples/smart-home/server/src/app';

jest.mock('express', () => ({
  __esModule: true,
  default: jest.requireActual('express'),
}));
jest.mock('cors', () => ({
  __esModule: true,
  default: jest.requireActual('cors'),
}));

test('Smart Home serves AG-UI through its native provider without process environment mutation', async () => {
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
