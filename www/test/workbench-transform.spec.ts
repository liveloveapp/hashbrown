import { expect, test } from 'vitest';
import {
  transformWorkbenchRequest,
  workbenchTransformContext,
} from '../examples/quickstart/server/workbench-transform';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';

test('adds server-owned public policy while preserving every mapped option without mutation', async () => {
  const before = {
    model: 'fixture-model',
    stream: true as const,
    instructions: 'Render SummaryCard.',
    input: 'private message',
    tools: [
      {
        type: 'function' as const,
        name: 'readContext',
        parameters: { type: 'object' },
        strict: true,
        description: 'Read',
      },
    ],
    text: {
      format: {
        type: 'json_schema' as const,
        name: 'plan',
        schema: { type: 'object' },
        strict: true,
      },
    },
    store: false,
    include: ['reasoning.encrypted_content' as const],
    reasoning: { effort: 'low' as const },
    max_output_tokens: 2048,
  };
  const original = structuredClone(before);

  const after = await transformWorkbenchRequest(
    before,
    workbenchTransformContext,
  );

  expect(after.instructions).toContain('canonical-docs');
  expect(after.instructions).toContain(before.instructions);
  expect({ ...after, instructions: before.instructions }).toEqual(before);
  expect(after).not.toBe(before);
  expect(before).toEqual(original);
});

test('captures immutable transformation evidence and clears it for each request and user turn', () => {
  const store = createWorkbenchStore();
  store.send('Plan');
  const trace = {
    before: {
      model: 'm',
      instructions: 'before',
      toolNames: [],
      responseFormat: null,
    },
    after: {
      model: 'm',
      instructions: 'after',
      toolNames: [],
      responseFormat: null,
    },
    preserved: { model: true },
  };

  store.record('event', {
    type: 'CUSTOM',
    name: 'workbench.request-transformation',
    value: trace,
  });
  trace.after.instructions = 'mutated';

  expect(store.getSnapshot().frame?.transformation?.after.instructions).toBe(
    'after',
  );
  expect(Object.isFrozen(store.getSnapshot().frame?.transformation)).toBe(true);
  store.record('request', {});
  expect(store.getSnapshot().frame?.transformation).toBeUndefined();
  store.record('event', {
    type: 'CUSTOM',
    name: 'workbench.request-transformation',
    value: trace,
  });
  store.settle('complete', 'stop');
  store.send('Next');
  expect(store.getSnapshot().frame?.transformation).toBeUndefined();
});

test('observes the actual OpenAI adapter mapping and closes the provider on return at trace yield', async () => {
  const { createServer } = await import('node:http');
  const { createWorkbenchOpenAIStream } =
    await import('../examples/quickstart/server/workbench-openai');
  const { pinWorkbenchInput } =
    await import('../examples/quickstart/server/workbench-app');
  const { createSupportProviderEvents } =
    await import('../src/tools/docs-request-transform-fixtures');
  let payload: Record<string, unknown> | undefined;
  let closed = false;
  let finishClosed: (() => void) | undefined;
  const closedPromise = new Promise<void>((done) => {
    finishClosed = done;
  });
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    payload = JSON.parse(body);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const event of createSupportProviderEvents('{"ui":[]}').slice(0, 2))
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    res.once('close', () => {
      closed = true;
      finishClosed?.();
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  const input = pinWorkbenchInput(
    {
      threadId: 't',
      runId: 'r',
      messages: [{ id: 'u', role: 'user', content: 'Private browser prompt' }],
      tools: [],
      context: [],
      state: {},
    },
    'request-transformation',
  );
  const iterator = createWorkbenchOpenAIStream({
    apiKey: 'fixture-only',
    model: 'fixture-model',
    baseURL: `http://127.0.0.1:${address.port}/v1`,
  })(input, new AbortController().signal, 'request-transformation')[
    Symbol.asyncIterator
  ]();

  try {
    expect((await iterator.next()).value?.type).toBe('RUN_STARTED');
    const event = (await iterator.next()).value;
    expect(event?.type).toBe('CUSTOM');
    const trace = event?.type === 'CUSTOM' ? event.value : undefined;
    expect(trace.after.instructions).toBe(payload?.['instructions']);
    expect(trace.after.model).toBe(payload?.['model']);
    expect(trace.after.toolNames).toEqual(['readContext']);
    expect(trace.after.responseFormat).toEqual(
      (payload?.['text'] as { format: unknown }).format,
    );
    expect(trace.after.maxOutputTokens).toBe(2048);
    expect(Object.values(trace.preserved).every(Boolean)).toBe(true);
    expect(JSON.stringify(trace)).not.toContain('Private browser prompt');
    await iterator.return?.();
    await closedPromise;
    expect(closed).toBe(true);
  } finally {
    await iterator.return?.();
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});

test('transform failure emits no successful trace and never falls back to an untransformed provider request', async () => {
  const { vi } = await import('vitest');
  const transform =
    await import('../examples/quickstart/server/workbench-transform');
  const { createWorkbenchOpenAIStream } =
    await import('../examples/quickstart/server/workbench-openai');
  const { pinWorkbenchInput } =
    await import('../examples/quickstart/server/workbench-app');
  const failure = vi
    .spyOn(transform, 'transformWorkbenchRequest')
    .mockRejectedValue(new Error('Context unavailable'));
  const request = vi.spyOn(globalThis, 'fetch');
  const input = pinWorkbenchInput({
    threadId: 't',
    runId: 'r',
    messages: [{ id: 'u', role: 'user', content: 'Plan' }],
    tools: [],
    context: [],
    state: {},
  });

  const events = [];
  for await (const event of createWorkbenchOpenAIStream({
    apiKey: 'fixture-only',
    model: 'fixture-model',
  })(input, new AbortController().signal, 'request-transformation'))
    events.push(event);

  expect(events.map((event) => event.type)).toEqual([
    'RUN_STARTED',
    'RUN_ERROR',
  ]);
  expect(request).not.toHaveBeenCalled();
  expect(failure).toHaveBeenCalledOnce();
});
