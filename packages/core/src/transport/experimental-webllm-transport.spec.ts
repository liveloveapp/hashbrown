import { type AGUIEvent, EventType } from '@ag-ui/core';
import {
  experimental_webllm,
  type WebLlmEngine,
} from './experimental-webllm-transport';
import { type TransportRequest } from './transport';

function request(
  overrides: Partial<TransportRequest['input']> = {},
  signal = new AbortController().signal,
): TransportRequest {
  return {
    input: {
      threadId: 'local-thread',
      runId: 'local-run',
      tools: [],
      context: [],
      state: {},
      messages: [{ id: 'u', role: 'user', content: 'Hello' }],
      ...overrides,
    },
    signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: 'request',
  };
}

function engine() {
  return {
    chat: {
      completions: {
        create: jest.fn(async function* () {
          yield { choices: [{ delta: { content: 'Hello ' } }] };
          yield { choices: [{ delta: { content: 'world' } }] };
        }),
      },
    },
    interruptGenerate: jest.fn(),
    unload: jest.fn(),
  };
}

async function collect(events: AsyncIterable<AGUIEvent>) {
  const result: AGUIEvent[] = [];
  for await (const event of events) result.push(event);
  return result;
}

test('streams an injected WebLLM engine through the matching AG-UI lifecycle', async () => {
  const injected = engine();
  const transport = experimental_webllm({ engine: injected })();

  const response = await transport.send(request());
  const events = await collect(response.events);

  expect(events.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.TEXT_MESSAGE_START,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.TEXT_MESSAGE_END,
    EventType.RUN_FINISHED,
  ]);
  expect(events[0]).toMatchObject({
    runId: 'local-run',
    threadId: 'local-thread',
  });
  expect(
    events
      .filter((event) => event.type === EventType.TEXT_MESSAGE_CONTENT)
      .map((event) => event.delta)
      .join(''),
  ).toBe('Hello world');
  expect(injected.unload).not.toHaveBeenCalled();
  expect(injected.interruptGenerate).not.toHaveBeenCalled();
});

test('encodes a JSON Schema as WebLLM json_object with a schema string', async () => {
  const injected = engine();
  const schema = { type: 'object', properties: { answer: { type: 'string' } } };
  const transport = experimental_webllm({
    engine: injected,
    model: 'app-selected',
  })();

  const response = await transport.send(
    request({
      forwardedProps: { hashbrown: { responseSchema: schema, ui: true } },
    }),
  );
  await collect(response.events);

  expect(injected.chat.completions.create).toHaveBeenCalledWith(
    expect.objectContaining({
      model: 'app-selected',
      stream: true,
      response_format: { type: 'json_object', schema: JSON.stringify(schema) },
    }),
  );
});

test('maps developer instructions to system messages without dropping their text', async () => {
  const injected = engine();
  const transport = experimental_webllm({ engine: injected })();

  const response = await transport.send(
    request({
      messages: [
        { id: 's', role: 'system', content: 'System' },
        { id: 'd', role: 'developer', content: 'Developer' },
        { id: 'u', role: 'user', content: 'Hello' },
      ],
    }),
  );
  await collect(response.events);

  expect(injected.chat.completions.create).toHaveBeenCalledWith(
    expect.objectContaining({
      messages: [
        { role: 'system', content: 'System\n\nDeveloper' },
        { role: 'user', content: 'Hello' },
      ],
    }),
  );
});

test.each([
  { tools: [{ name: 'lookup', description: 'Lookup', parameters: {} }] },
  {
    messages: [
      {
        id: 'u',
        role: 'user' as const,
        content: [{ type: 'text' as const, text: 'Hello' }],
      },
    ],
  },
  {
    messages: [
      { id: 't', role: 'tool' as const, toolCallId: 'call', content: 'Result' },
    ],
  },
])(
  'rejects unsupported inputs before invoking the engine: %j',
  async (overrides) => {
    const injected = engine();
    const transport = experimental_webllm({ engine: injected })();

    const result = transport.send(request(overrides));

    await expect(result).rejects.toMatchObject({
      code: 'FEATURE_UNSUPPORTED',
      retryable: false,
    });
    expect(injected.chat.completions.create).not.toHaveBeenCalled();
  },
);

test('does not invoke an engine after abort or disposal before iteration', async () => {
  const injected = engine();
  const controller = new AbortController();
  const transport = experimental_webllm({ engine: injected })();
  const response = await transport.send(request({}, controller.signal));

  controller.abort();
  await response.dispose?.();

  await expect(collect(response.events)).rejects.toMatchObject({
    code: 'PROMPT_API_ABORTED',
  });
  expect(injected.chat.completions.create).not.toHaveBeenCalled();
  expect(injected.interruptGenerate).not.toHaveBeenCalled();
});

test('interrupts a stalled engine read promptly without closing before it settles', async () => {
  const injected = engine();
  const returned = jest.fn(async () => ({
    done: true as const,
    value: undefined,
  }));
  const nextChunk = jest.fn(
    () =>
      new Promise<
        IteratorResult<import('./experimental-webllm-transport').WebLlmChunk>
      >(() => undefined),
  );
  const stalled: WebLlmEngine = {
    chat: {
      completions: {
        create: async () => ({
          [Symbol.asyncIterator]: () => ({
            next: nextChunk,
            return: returned,
          }),
        }),
      },
    },
    interruptGenerate: injected.interruptGenerate,
  };
  const controller = new AbortController();
  const response = await experimental_webllm({ engine: stalled })().send(
    request({}, controller.signal),
  );
  const iterator = response.events[Symbol.asyncIterator]();
  await iterator.next();
  await iterator.next();
  const next = iterator.next();

  controller.abort();

  await expect(next).rejects.toMatchObject({ code: 'PROMPT_API_ABORTED' });
  expect(injected.interruptGenerate).toHaveBeenCalledTimes(1);
  expect(returned).not.toHaveBeenCalled();
  expect(nextChunk).toHaveBeenCalledTimes(1);
});

test('prevents two transports from sharing an active engine', async () => {
  const injected = engine();
  const first = experimental_webllm({ engine: injected })();
  const second = experimental_webllm({ engine: injected })();
  const response = await first.send(request());

  await expect(second.send(request())).rejects.toMatchObject({
    code: 'MODEL_BUSY',
    retryable: false,
  });
  await response.dispose?.();
  const replacement = await second.send(request());
  await collect(replacement.events);

  expect(injected.unload).not.toHaveBeenCalled();
});

test('surfaces setup errors and allows another run', async () => {
  const injected = engine();
  injected.chat.completions.create.mockImplementationOnce(() => {
    throw new Error('GPU lost');
  });
  const transport = experimental_webllm({ engine: injected })();
  const response = await transport.send(request());

  await expect(collect(response.events)).rejects.toMatchObject({
    code: 'WEBLLM_ENGINE_ERROR',
    message: 'GPU lost',
  });
  const replacement = await transport.send(request());
  await collect(replacement.events);

  expect(injected.unload).not.toHaveBeenCalled();
});

test.each(['resolve', 'reject'])(
  'owns a late WebLLM setup %s after cancellation',
  async (settlement) => {
    let resolve: (
      value: AsyncIterable<
        import('./experimental-webllm-transport').WebLlmChunk
      >,
    ) => void = () => undefined;
    let reject: (error: Error) => void = () => undefined;
    const setup = new Promise<
      AsyncIterable<import('./experimental-webllm-transport').WebLlmChunk>
    >((resolveSetup, rejectSetup) => {
      resolve = resolveSetup;
      reject = rejectSetup;
    });
    const returned = jest.fn(async () => ({
      done: true as const,
      value: undefined,
    }));
    const injected: WebLlmEngine = {
      chat: { completions: { create: () => setup } },
      interruptGenerate: jest.fn(),
    };
    const controller = new AbortController();
    const transport = experimental_webllm({ engine: injected })();
    const response = await transport.send(request({}, controller.signal));
    const iterator = response.events[Symbol.asyncIterator]();
    await iterator.next();
    const pending = iterator.next();
    await new Promise<void>((resolve) => setImmediate(resolve));

    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: 'PROMPT_API_ABORTED' });
    await expect(transport.send(request())).rejects.toMatchObject({
      code: 'MODEL_BUSY',
    });
    if (settlement === 'resolve')
      resolve({
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ done: true as const, value: undefined }),
          return: returned,
        }),
      });
    else reject(new Error('late setup failure'));
    await new Promise<void>((resolve) => setImmediate(resolve));
    const replacement = await transport.send(request());
    await replacement.dispose?.();

    expect(injected.interruptGenerate).toHaveBeenCalledTimes(1);
    expect(returned).not.toHaveBeenCalled();
  },
);

test('rejects truncated output without completing the AG-UI run', async () => {
  const injected: WebLlmEngine = {
    chat: {
      completions: {
        create: async function* () {
          yield { choices: [{ delta: {}, finish_reason: 'length' }] };
        },
      },
    },
    interruptGenerate: jest.fn(),
  };
  const response = await experimental_webllm({ engine: injected })().send(
    request(),
  );
  const events: AGUIEvent[] = [];

  const result = (async () => {
    for await (const event of response.events) events.push(event);
  })();

  await expect(result).rejects.toMatchObject({
    code: 'WEBLLM_OUTPUT_TRUNCATED',
  });
  expect(events.some((event) => event.type === EventType.RUN_FINISHED)).toBe(
    false,
  );
});

for (const mode of ['cancel', 'truncate'] as const) {
  test(`drains ${mode} through the engine lock release before allowing retry`, async () => {
    let locked = false;
    let resumeDrain: () => void = () => undefined;
    const drainGate = new Promise<void>((resolve) => {
      resumeDrain = resolve;
    });
    const injected: WebLlmEngine = {
      chat: {
        completions: {
          async *create() {
            if (locked) throw new Error('Engine lock is still held');
            locked = true;
            yield {
              choices: [
                {
                  delta: { content: 'First token' },
                  finish_reason: mode === 'truncate' ? 'length' : null,
                },
              ],
            };
            await drainGate;
            yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
            // Real WebLLM releases after the final yield, without a finally.
            locked = false;
          },
        },
      },
      interruptGenerate: jest.fn(),
    };
    const controller = new AbortController();
    const transport = experimental_webllm({ engine: injected })();
    const response = await transport.send(request({}, controller.signal));
    const iterator = response.events[Symbol.asyncIterator]();
    await iterator.next();
    await iterator.next();

    if (mode === 'cancel') {
      await iterator.next();
      controller.abort();
      await expect(iterator.next()).rejects.toMatchObject({
        code: 'PROMPT_API_ABORTED',
      });
    } else {
      await expect(iterator.next()).rejects.toMatchObject({
        code: 'WEBLLM_OUTPUT_TRUNCATED',
      });
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
    await expect(transport.send(request())).rejects.toMatchObject({
      code: 'MODEL_BUSY',
    });
    resumeDrain();
    await new Promise<void>((resolve) => setImmediate(resolve));
    const retry = await transport.send(request());
    if (mode === 'cancel') await collect(retry.events);
    else
      await expect(collect(retry.events)).rejects.toMatchObject({
        code: 'WEBLLM_OUTPUT_TRUNCATED',
      });

    expect(locked).toBe(false);
  });
}

test('releases ownership when a pending engine read fails after cancellation', async () => {
  let rejectRead: (error: Error) => void = () => undefined;
  const failedRead = new Promise<
    IteratorResult<import('./experimental-webllm-transport').WebLlmChunk>
  >((_resolve, reject) => {
    rejectRead = reject;
  });
  const injected: WebLlmEngine = {
    chat: {
      completions: {
        create: () => ({
          [Symbol.asyncIterator]: () => ({ next: () => failedRead }),
        }),
      },
    },
    interruptGenerate: jest.fn(),
  };
  const controller = new AbortController();
  const transport = experimental_webllm({ engine: injected })();
  const response = await transport.send(request({}, controller.signal));
  const iterator = response.events[Symbol.asyncIterator]();
  await iterator.next();
  await iterator.next();
  const reading = iterator.next();

  controller.abort();
  await expect(reading).rejects.toMatchObject({ code: 'PROMPT_API_ABORTED' });
  await expect(transport.send(request())).rejects.toMatchObject({
    code: 'MODEL_BUSY',
  });
  rejectRead(new Error('GPU lost during cancellation'));
  await new Promise<void>((resolve) => setImmediate(resolve));
  const replacement = await transport.send(request());
  await replacement.dispose?.();

  expect(injected.interruptGenerate).toHaveBeenCalledTimes(1);
});
