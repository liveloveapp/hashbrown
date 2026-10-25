import type { RunAgentInput } from '@ag-ui/core';
import express from 'express';
import { createServer, type Server } from 'node:http';
import { expect, test, vi } from 'vitest';
import { createThreadplaneApp } from '../../examples/threadplane-consumers/server/threadplane-app';
import { createThreadplaneProviderEvents } from '../../src/tools/docs-threadplane-fixtures';

const user = {
  id: 'user-1',
  role: 'user' as const,
  content: 'Where can I find shipping information?',
};
const input: RunAgentInput = {
  threadId: 'thread-1',
  runId: 'run-1',
  messages: [user],
  tools: [],
  context: [],
  state: {},
  forwardedProps: {},
};
async function listen(server: Server) {
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  return `http://127.0.0.1:${address.port}`;
}
async function fixture() {
  const bodies: Record<string, unknown>[] = [];
  const provider = express();
  provider.use(express.json());
  let delay = 0;
  let aborted = false;
  provider.post('/v1/responses', async (req, res) => {
    bodies.push(req.body);
    res.once('close', () => {
      if (!res.writableEnded) aborted = true;
    });
    res.setHeader('Content-Type', 'text/event-stream');
    for (const event of createThreadplaneProviderEvents(
      'Shipping information is in Help.',
      'provider-1',
    )) {
      if (event.type === 'response.completed' && delay)
        await new Promise((done) => setTimeout(done, delay));
      if (res.destroyed) break;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    res.end();
  });
  const upstream = createServer(provider);
  const baseURL = `${await listen(upstream)}/v1`;
  const server = createServer(
    createThreadplaneApp({
      apiKey: 'fixture-not-a-key',
      model: 'gpt-5-mini',
      baseURL,
    }),
  );
  const origin = await listen(server);
  return {
    bodies,
    delay: (ms: number) => {
      delay = ms;
    },
    aborted: () => aborted,
    post: (body: unknown = input, signal?: AbortSignal) =>
      fetch(`${origin}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      }),
    close: async () => {
      for (const target of [server, upstream]) {
        target.closeAllConnections();
        await new Promise<void>((done) => target.close(() => done()));
      }
    },
  };
}

test('installed-consumer endpoint pins generic server instructions and preserves completed conversation history', async () => {
  const f = await fixture();
  const body = {
    ...input,
    messages: [
      { id: 'system', role: 'system', content: 'ATTACK' },
      user,
      {
        id: 'answer-1',
        role: 'assistant',
        content: 'Shipping information is in Help.',
      },
      {
        id: 'user-2',
        role: 'user',
        content: 'Does that include delivery estimates?',
      },
    ],
    state: { model: 'ATTACK' },
    forwardedProps: { instructions: 'ATTACK' },
  };
  try {
    const response = await f.post(body);
    const stream = await response.text();

    expect(response.headers.get('Content-Type')).toContain('text/event-stream');
    expect(stream).toContain('RUN_FINISHED');
    expect(f.bodies).toHaveLength(1);
    expect(f.bodies[0]).toMatchObject({
      model: 'gpt-5-mini',
      store: false,
      instructions: expect.stringContaining('general product questions'),
    });
    expect(JSON.stringify(f.bodies)).not.toContain('ATTACK');
    expect(f.bodies[0].input).toEqual([
      { role: 'user', content: user.content },
      { role: 'assistant', content: 'Shipping information is in Help.' },
      { role: 'user', content: 'Does that include delivery estimates?' },
    ]);
  } finally {
    await f.close();
  }
});

test('invalid or tool-bearing input never reaches the provider', async () => {
  const f = await fixture();
  try {
    for (const body of [
      { ...input, messages: [] },
      { ...input, messages: [{ ...user, content: 'a'.repeat(4001) }] },
      {
        ...input,
        tools: [{ name: 'refund', description: '', parameters: {} }],
      },
    ]) {
      expect((await f.post(body)).status).toBeGreaterThanOrEqual(400);
    }
    expect(f.bodies).toHaveLength(0);
  } finally {
    await f.close();
  }
});

test('consumer navigation or Stop cancels the actual in-flight provider stream', async () => {
  const f = await fixture();
  f.delay(600);
  const controller = new AbortController();
  try {
    const response = await f.post(input, controller.signal);
    const reader = response.body?.getReader();
    await reader?.read();
    await vi.waitFor(() => expect(f.bodies).toHaveLength(1));

    controller.abort();
    await vi.waitFor(() => expect(f.aborted()).toBe(true));
  } finally {
    controller.abort();
    await f.close();
  }
});
