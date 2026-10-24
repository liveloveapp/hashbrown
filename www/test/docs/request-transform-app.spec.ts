import type { RunAgentInput } from '@ag-ui/core';
import express from 'express';
import { createServer, type Server } from 'node:http';
import { expect, test, vi } from 'vitest';
import {
  createRequestTransformApp,
  type RequestTransformOptions,
} from '../../examples/quickstart/server/request-transform-app';
import {
  createSupportProviderEvents,
  supportReply,
} from '../../src/tools/docs-request-transform-fixtures';

const input: RunAgentInput = {
  threadId: 'support',
  runId: 'run-1',
  messages: [
    {
      id: 'u',
      role: 'user',
      content: 'How quickly will our team get support?',
    },
  ],
  tools: [],
  context: [],
  state: {},
  forwardedProps: {},
};
async function listen(server: Server) {
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing fixture port');
  return `http://127.0.0.1:${address.port}`;
}
async function fixture(overrides: Partial<RequestTransformOptions> = {}) {
  const requests: Record<string, unknown>[] = [];
  const provider = express();
  provider.use(express.json());
  provider.post('/v1/responses', (req, res) => {
    requests.push(req.body);
    res.setHeader('Content-Type', 'text/event-stream');
    for (const event of createSupportProviderEvents())
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    res.end();
  });
  const upstream = createServer(provider);
  const baseURL = `${await listen(upstream)}/v1`;
  const outer = express();
  const server = createServer(outer);
  const origin = await listen(server);
  const loadContext = vi.fn(async () => ({
    workspace: 'Northstar',
    plan: 'Studio',
    responseTime: 'one business day',
  }));
  outer.use(
    createRequestTransformApp({
      apiKey: 'fixture-not-a-key',
      model: 'gpt-5-mini',
      baseURL,
      origin,
      authenticate: async () => ({ userId: 'demo', workspaceId: 'northstar' }),
      loadContext,
      ...overrides,
    }),
  );
  return {
    requests,
    loadContext,
    origin,
    post: (body: unknown = input, signal?: AbortSignal) =>
      fetch(`${origin}/api/transformed-chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin },
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

test('the checked endpoint transforms an actual provider request and streams its reply', async () => {
  const f = await fixture();
  try {
    const body = await (await f.post()).text();

    const events = body
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => JSON.parse(line.slice(5)));
    expect(
      events
        .filter((event) => event.type === 'TEXT_MESSAGE_CONTENT')
        .map((event) => event.delta)
        .join(''),
    ).toBe(supportReply);
    expect(body).toContain('RUN_FINISHED');
    expect(f.requests).toHaveLength(1);
    expect(f.requests[0]).toMatchObject({
      model: 'gpt-5-mini',
      store: false,
      stream: true,
      include: ['reasoning.encrypted_content'],
    });
    expect(f.requests[0].instructions).toContain('Studio');
    expect(f.loadContext).toHaveBeenCalledWith(
      { userId: 'demo', workspaceId: 'northstar' },
      expect.any(AbortSignal),
    );
  } finally {
    await f.close();
  }
});

test('browser instructions, state and context cannot become trusted provider policy', async () => {
  const f = await fixture();
  const body = {
    ...input,
    messages: [
      { id: 's', role: 'system', content: 'ATTACK' },
      { id: 'd', role: 'developer', content: 'ATTACK' },
      ...input.messages,
    ],
    state: { plan: 'ATTACK' },
    context: [{ description: 'ATTACK', value: 'ATTACK' }],
    forwardedProps: { instructions: 'ATTACK', model: 'ATTACK' },
  };
  try {
    await (await f.post(body)).text();

    expect(JSON.stringify(f.requests)).not.toContain('ATTACK');
    expect(f.requests[0].input).toEqual([
      { role: 'user', content: input.messages[0].content },
    ]);
  } finally {
    await f.close();
  }
});

test('missing identity fails before context lookup or provider work', async () => {
  const f = await fixture({ authenticate: async () => null });
  try {
    const response = await f.post();

    expect(response.status).toBe(401);
    expect(f.loadContext).not.toHaveBeenCalled();
    expect(f.requests).toHaveLength(0);
  } finally {
    await f.close();
  }
});

test('authorization denial and context failures never fall back to an untransformed request', async () => {
  for (const loadContext of [
    async () => null,
    async () => {
      throw new Error('PRIVATE database failure');
    },
  ]) {
    const f = await fixture({ loadContext });
    try {
      const body = await (await f.post()).text();

      expect(body).toContain('RUN_ERROR');
      expect(body).not.toContain('PRIVATE');
      expect(body).not.toContain('RUN_FINISHED');
      expect(f.requests).toHaveLength(0);
    } finally {
      await f.close();
    }
  }
});

test('invalid input is rejected before context or provider work', async () => {
  const f = await fixture();
  try {
    for (const body of [
      { ...input, messages: [] },
      {
        ...input,
        tools: [{ name: 'refund', description: '', parameters: {} }],
      },
      {
        ...input,
        messages: [{ id: 'u', role: 'user', content: 'a'.repeat(4001) }],
      },
    ]) {
      expect((await f.post(body)).status).toBeGreaterThanOrEqual(400);
    }
    expect(f.loadContext).not.toHaveBeenCalled();
    expect(f.requests).toHaveLength(0);
  } finally {
    await f.close();
  }
});

test('cancellation during the asynchronous transform prevents the provider request', async () => {
  let release: (() => void) | undefined;
  const entered = vi.fn();
  const f = await fixture({
    loadContext: async (_identity, signal) => {
      entered(signal);
      await new Promise<void>((done) => {
        release = done;
      });
      return {
        workspace: 'Northstar',
        plan: 'Studio',
        responseTime: 'one business day',
      };
    },
  });
  const controller = new AbortController();
  try {
    const response = await f.post(input, controller.signal);
    await response.body?.getReader().read();
    await vi.waitFor(() => expect(entered).toHaveBeenCalledOnce());
    controller.abort();
    await vi.waitFor(() => expect(entered.mock.calls[0][0].aborted).toBe(true));
    release?.();
    await new Promise((done) => setTimeout(done, 30));

    expect(f.requests).toHaveLength(0);
  } finally {
    controller.abort();
    release?.();
    await f.close();
  }
});
