import * as transports from './index';

test('exports the structured tool protocol transport factory', () => {
  expect(transports).toHaveProperty(
    'experimental_webllm_tools',
    expect.any(Function),
  );
});

import { type AGUIEvent, EventType, type Message } from '@ag-ui/core';
import {
  experimental_webllm_tools,
  type ExperimentalWebLlmToolsTransportOptions,
} from './experimental-webllm-tools-transport';
import {
  experimental_webllm,
  type WebLlmChunk,
  type WebLlmEngine,
  type WebLlmImageContent,
  type WebLlmImageResource,
  type WebLlmRequest,
} from './experimental-webllm-transport';
import type { TransportRequest } from './transport';

function request(
  messages: Message[] = [{ id: 'u', role: 'user', content: 'Question' }],
  signal = new AbortController().signal,
): TransportRequest {
  return {
    input: {
      threadId: 'thread',
      runId: 'run',
      messages,
      tools: [
        {
          name: 'lookup',
          description: 'Look up',
          parameters: {
            type: 'object',
            properties: { query: { type: 'string', pattern: '^ok' } },
            required: ['query'],
            additionalProperties: false,
          },
        },
      ],
      context: [],
      state: {},
      forwardedProps: {
        hashbrown: {
          responseSchema: {
            type: 'object',
            properties: { answer: { type: 'string' } },
          },
          ui: true,
        },
      },
    },
    signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: 'r',
  };
}
const chunk = (content: string): WebLlmChunk => ({
  choices: [{ delta: { content } }],
});
const stop: WebLlmChunk = { choices: [{ delta: {}, finish_reason: 'stop' }] };
function engine(chunks: WebLlmChunk[] = [chunk('{"query":"ok value"}'), stop]) {
  return {
    chat: {
      completions: {
        create: jest.fn<
          ReturnType<WebLlmEngine['chat']['completions']['create']>,
          [WebLlmRequest]
        >(async function* () {
          yield* chunks;
        }),
      },
    },
    interruptGenerate: jest.fn(),
    unload: jest.fn(),
    resetChat: jest.fn(),
  };
}
const phase = () => ({ type: 'tool' as const, name: 'lookup' });
async function collect(events: AsyncIterable<AGUIEvent>) {
  const values: AGUIEvent[] = [];
  for await (const event of events) values.push(event);
  return values;
}
async function run(
  injected: WebLlmEngine,
  source = request(),
  selector: ExperimentalWebLlmToolsTransportOptions['toolPhase'] = phase,
) {
  const response = await experimental_webllm_tools({
    engine: injected,
    toolPhase: selector,
  })().send(source);
  return collect(response.events);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function flush() {
  for (let index = 0; index < 20; index++) await Promise.resolve();
}

test('emits only one validated canonical call after raw completion and releases the engine before START', async () => {
  const injected = engine();
  const response = await experimental_webllm_tools({
    engine: injected,
    toolPhase: phase,
  })().send(request());
  const iterator = response.events[Symbol.asyncIterator]();

  const started = await iterator.next();
  const call = await iterator.next();
  const continuation = await experimental_webllm_tools({
    engine: injected,
    toolPhase: phase,
  })().send(request());
  await continuation.dispose?.();
  const remaining: AGUIEvent[] = [];
  for (
    let next = await iterator.next();
    !next.done;
    next = await iterator.next()
  )
    remaining.push(next.value);

  expect(started.value).toEqual({
    type: EventType.RUN_STARTED,
    threadId: 'thread',
    runId: 'run',
  });
  expect(call.value).toEqual({
    type: EventType.TOOL_CALL_START,
    toolCallId: expect.any(String),
    toolCallName: 'lookup',
  });
  const id = (call.value as { toolCallId: string }).toolCallId;
  expect(id.trim()).toBe(id);
  expect(id.length).toBeGreaterThan(0);
  expect(remaining).toEqual([
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: id,
      delta: '{"query":"ok value"}',
    },
    { type: EventType.TOOL_CALL_END, toolCallId: id },
    { type: EventType.RUN_FINISHED, threadId: 'thread', runId: 'run' },
  ]);
  expect(injected.chat.completions.create.mock.calls[0][0]).not.toHaveProperty(
    'tools',
  );
  expect(injected.unload).not.toHaveBeenCalled();
  expect(injected.resetChat).not.toHaveBeenCalled();
});

test('waits for clean stop AND gated iterator done before emitting a call or releasing ownership', async () => {
  const done = deferred<IteratorResult<WebLlmChunk>>();
  const entered = deferred<void>();
  let index = 0;
  const injected = engine();
  injected.chat.completions.create = jest.fn<
    ReturnType<WebLlmEngine['chat']['completions']['create']>,
    [WebLlmRequest]
  >(() => ({
    [Symbol.asyncIterator]: () => ({
      next: async () => {
        if (index++ === 0)
          return { done: false, value: chunk('{"query":"ok"}') };
        if (index === 2) return { done: false, value: stop };
        entered.resolve();
        return done.promise;
      },
    }),
  }));
  const response = await experimental_webllm_tools({
    engine: injected,
    toolPhase: phase,
  })().send(request());
  const iterator = response.events[Symbol.asyncIterator]();
  await iterator.next();

  const next = iterator.next();
  await entered.promise;
  let emitted = false;
  void next.then(() => {
    emitted = true;
  });
  await flush();
  await expect(
    experimental_webllm_tools({ engine: injected, toolPhase: phase })().send(
      request(),
    ),
  ).rejects.toMatchObject({ code: 'MODEL_BUSY' });
  expect(emitted).toBe(false);
  done.resolve({ done: true, value: undefined });

  expect((await next).value?.type).toBe(EventType.TOOL_CALL_START);
  await iterator.return?.();
});

test.each([
  '```json\n{"query":"ok"}\n```',
  '{"query":"ok"} {}',
  '[]',
  'null',
  '1',
  '{}',
  '{"query":"bad"}',
  '{"query":"ok","extra":1}',
  '{"query":1}',
  '{"query":["ok"]}',
])(
  'rejects invalid complete arguments %s without executable events',
  async (raw) => {
    const seen: AGUIEvent[] = [];
    const response = await experimental_webllm_tools({
      engine: engine([chunk(raw), stop]),
      toolPhase: phase,
    })().send(request());

    const consume = async () => {
      for await (const event of response.events) seen.push(event);
    };

    await expect(consume()).rejects.toMatchObject({
      code: 'WEBLLM_TOOL_ARGUMENTS_INVALID',
      retryable: false,
    });
    expect(seen.map((event) => event.type)).toEqual([EventType.RUN_STARTED]);
  },
);

test.each([
  [[chunk('{"query":"ok"}')], 'WEBLLM_INVALID_COMPLETION'],
  [
    [
      chunk('{"query":"ok"}'),
      { choices: [{ delta: {}, finish_reason: 'length' }] },
    ],
    'WEBLLM_OUTPUT_TRUNCATED',
  ],
  [
    [
      chunk('{"query":"ok"}'),
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
    ],
    'WEBLLM_INVALID_COMPLETION',
  ],
  [[chunk('{"query":"ok"}'), stop, chunk(' ')], 'WEBLLM_INVALID_COMPLETION'],
  [[chunk('{"query":"ok"}'), stop, stop], 'WEBLLM_INVALID_COMPLETION'],
  [[{ choices: [{ delta: { content: 42 } }] }], 'WEBLLM_INVALID_COMPLETION'],
] as const)('preserves strict completion failure %s', async (chunks, code) => {
  const injected = engine(chunks as unknown as WebLlmChunk[]);

  await expect(run(injected)).rejects.toMatchObject({ code, retryable: false });
});

test('bounds raw UTF-8 including whitespace before parsing and counts split surrogate pairs once', async () => {
  const prefix = '{"query":"ok';
  const suffix = '"}';
  const padding = ' '.repeat(
    1024 * 1024 - new TextEncoder().encode(prefix + '😀' + suffix).length,
  );
  const accepted = engine([
    chunk(prefix + '\ud83d'),
    chunk('\ude00' + suffix + padding),
    stop,
  ]);
  const rejected = engine([
    chunk(prefix + '\ud83d'),
    chunk('\ude00' + suffix + padding + ' '),
    stop,
  ]);

  const events = await run(accepted);

  expect(
    events.find((event) => event.type === EventType.TOOL_CALL_ARGS),
  ).toMatchObject({ delta: '{"query":"ok😀"}' });
  await expect(run(rejected)).rejects.toMatchObject({
    code: 'WEBLLM_TOOL_ARGUMENTS_INVALID',
  });
});

test('captures engine, model, selector and lifecycle IDs before selector and caller mutations', async () => {
  const injected = engine();
  const replacement = engine();
  const source = request();
  const options: ExperimentalWebLlmToolsTransportOptions = {
    engine: injected,
    model: 'original',
    toolPhase: () => {
      options.engine = replacement;
      options.model = 'mutated';
      source.input.runId = 'mutated';
      source.input.threadId = 'mutated';
      source.input.tools[0].name = 'mutated';
      source.input.tools[0].parameters = {};
      return phase();
    },
  };
  const transport = experimental_webllm_tools(options)();

  const response = await transport.send(source);
  options.toolPhase = () => ({ type: 'finalize' });
  source.input.messages = [];
  const events = await collect(response.events);

  expect(
    events.find((event) => event.type === EventType.TOOL_CALL_START),
  ).toMatchObject({ toolCallName: 'lookup' });
  expect(events[0]).toMatchObject({ runId: 'run', threadId: 'thread' });
  expect(events.at(-1)).toMatchObject({ runId: 'run', threadId: 'thread' });
  expect(injected.chat.completions.create).toHaveBeenCalledWith(
    expect.objectContaining({
      model: 'original',
      messages: expect.arrayContaining([{ role: 'user', content: 'Question' }]),
    }),
  );
  expect(replacement.chat.completions.create).not.toHaveBeenCalled();
});

test('finalizes projected history using the original raw response schema and text lifecycle', async () => {
  const source = request([
    { id: 'u', role: 'user', content: 'Question' },
    {
      id: 'a',
      role: 'assistant',
      toolCalls: [
        {
          id: 'old',
          type: 'function',
          function: { name: 'lookup', arguments: '{"query":"ok"}' },
        },
      ],
    },
    { id: 'r', role: 'tool', toolCallId: 'old', content: 'Result' },
  ]);
  const injected = engine([chunk('{"answer":'), chunk('"done"}'), stop]);

  const events = await run(injected, source, () => ({ type: 'finalize' }));

  expect(events.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.TEXT_MESSAGE_START,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.TEXT_MESSAGE_END,
    EventType.RUN_FINISHED,
  ]);
  expect(injected.chat.completions.create).toHaveBeenCalledWith(
    expect.objectContaining({
      response_format: {
        type: 'json_object',
        schema: JSON.stringify(
          source.input.forwardedProps?.hashbrown?.responseSchema,
        ),
      },
    }),
  );
  const messages = injected.chat.completions.create.mock.calls[0][0].messages;
  expect(messages).toContainEqual({
    role: 'user',
    content:
      '{"type":"hashbrown.tool_result","protocol":1,"callId":"old","name":"lookup","status":"success","text":"Result"}',
  });
});

test('rejects media and missing response schema before engine acquisition', async () => {
  const injected = engine();
  const source = request();
  delete source.input.forwardedProps;

  await expect(run(injected, source)).rejects.toMatchObject({
    code: 'FEATURE_UNSUPPORTED',
  });
  await expect(
    experimental_webllm_tools({
      engine: injected,
      toolPhase: phase,
      media: {},
    } as unknown as ExperimentalWebLlmToolsTransportOptions)().send(request()),
  ).rejects.toMatchObject({ code: 'FEATURE_UNSUPPORTED' });
  expect(injected.chat.completions.create).not.toHaveBeenCalled();
});

test.each(['abort', 'dispose', 'return', 'throw'] as const)(
  'cancels argument buffering with %s and retains ownership until pending next drains',
  async (method) => {
    const entered = deferred<void>();
    const finish = deferred<IteratorResult<WebLlmChunk>>();
    let index = 0;
    const injected = engine();
    injected.chat.completions.create.mockImplementationOnce(() => ({
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          if (index++ === 0)
            return { done: false, value: chunk('{"query":"ok"}') };
          entered.resolve();
          return finish.promise;
        },
      }),
    }));
    const controller = new AbortController();
    const response = await experimental_webllm_tools({
      engine: injected,
      toolPhase: phase,
    })().send(request(undefined, controller.signal));
    const iterator = response.events[Symbol.asyncIterator]();
    await iterator.next();
    const pending = iterator.next();
    const failed = expect(pending).rejects.toMatchObject({
      code: 'PROMPT_API_ABORTED',
    });
    await entered.promise;

    let ending: Promise<unknown> | undefined;
    if (method === 'abort') controller.abort();
    if (method === 'dispose') ending = Promise.resolve(response.dispose?.());
    if (method === 'return') ending = iterator.return?.();
    if (method === 'throw') {
      ending = iterator
        .throw?.(new Error('consumer stopped'))
        .catch(() => undefined);
    }
    await failed;
    await ending;
    await expect(
      experimental_webllm_tools({ engine: injected, toolPhase: phase })().send(
        request(),
      ),
    ).rejects.toMatchObject({ code: 'MODEL_BUSY' });
    finish.resolve({ done: true, value: undefined });
    await flush();
    const after = await experimental_webllm_tools({
      engine: injected,
      toolPhase: phase,
    })().send(request());
    await after.dispose?.();

    expect(injected.interruptGenerate).toHaveBeenCalledTimes(1);
  },
);

test('aborts before creation and drains a late async create without exposing a tool call', async () => {
  const before = new AbortController();
  before.abort();
  const injected = engine();
  await expect(
    run(injected, request(undefined, before.signal)),
  ).rejects.toMatchObject({ code: 'PROMPT_API_ABORTED' });
  const late = deferred<AsyncIterable<WebLlmChunk>>();
  const entered = deferred<void>();
  let drained = false;
  injected.chat.completions.create.mockImplementationOnce(() => {
    entered.resolve();
    return late.promise;
  });
  const controller = new AbortController();
  const response = await experimental_webllm_tools({
    engine: injected,
    toolPhase: phase,
  })().send(request(undefined, controller.signal));
  const iterator = response.events[Symbol.asyncIterator]();
  await iterator.next();
  const pending = iterator.next();
  await entered.promise;

  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: 'PROMPT_API_ABORTED' });
  await expect(
    experimental_webllm_tools({ engine: injected, toolPhase: phase })().send(
      request(),
    ),
  ).rejects.toMatchObject({ code: 'MODEL_BUSY' });
  late.resolve({
    async *[Symbol.asyncIterator]() {
      yield chunk('{"query":"ok"}');
      yield stop;
      drained = true;
    },
  });
  await flush();
  const next = await experimental_webllm_tools({
    engine: injected,
    toolPhase: phase,
  })().send(request());
  await next.dispose?.();

  expect(drained).toBe(true);
  expect(injected.interruptGenerate).toHaveBeenCalledTimes(1);
});

test.each([
  EventType.TOOL_CALL_START,
  EventType.TOOL_CALL_ARGS,
  EventType.TOOL_CALL_END,
])('abort after %s suppresses remaining executable events', async (type) => {
  const controller = new AbortController();
  const response = await experimental_webllm_tools({
    engine: engine(),
    toolPhase: phase,
  })().send(request(undefined, controller.signal));
  const iterator = response.events[Symbol.asyncIterator]();
  const seen: AGUIEvent[] = [];
  while (true) {
    const result = await iterator.next();
    if (result.done) throw new Error('expected tool event');
    seen.push(result.value);
    if (result.value.type === type) break;
  }

  controller.abort();

  await expect(iterator.next()).rejects.toMatchObject({
    code: 'PROMPT_API_ABORTED',
  });
  expect(seen.some((event) => event.type === EventType.TOOL_CALL_END)).toBe(
    type === EventType.TOOL_CALL_END,
  );
});

test('rejects generated call IDs reused from canonical history', async () => {
  const source = request([
    { id: 'u', role: 'user', content: 'Question' },
    {
      id: 'a',
      role: 'assistant',
      toolCalls: [
        {
          id: '00000000-0000-4000-8000-000000000000',
          type: 'function',
          function: { name: 'lookup', arguments: '{"query":"ok"}' },
        },
      ],
    },
    {
      id: 'r',
      role: 'tool',
      toolCallId: '00000000-0000-4000-8000-000000000000',
      content: 'Result',
    },
  ]);
  const uuid = jest
    .spyOn(crypto, 'randomUUID')
    .mockReturnValue('00000000-0000-4000-8000-000000000000');

  try {
    await expect(run(engine(), source)).rejects.toMatchObject({
      code: 'WEBLLM_TOOL_ARGUMENTS_INVALID',
    });
  } finally {
    uuid.mockRestore();
  }
});

test.each([0, 1.5, 4, '2'])(
  'validates numeric constraints on arguments %s',
  async (value) => {
    const source = request();
    source.input.tools[0].parameters = {
      type: 'object',
      properties: { count: { type: 'integer', minimum: 1, maximum: 3 } },
      required: ['count'],
      additionalProperties: false,
    };

    await expect(
      run(engine([chunk(JSON.stringify({ count: value })), stop]), source),
    ).rejects.toMatchObject({ code: 'WEBLLM_TOOL_ARGUMENTS_INVALID' });
  },
);

test.each([
  { list: [{ value: 1 }] },
  { list: [[{ value: 'ok' }]] },
  { list: [{ value: 'ok', extra: true }] },
])('validates nested array object arguments %j', async (value) => {
  const source = request();
  source.input.tools[0].parameters = {
    type: 'object',
    properties: {
      list: {
        type: 'array',
        items: {
          type: 'object',
          properties: { value: { type: 'string' } },
          required: ['value'],
          additionalProperties: false,
        },
      },
    },
    required: ['list'],
    additionalProperties: false,
  };

  await expect(
    run(engine([chunk(JSON.stringify(value)), stop]), source),
  ).rejects.toMatchObject({ code: 'WEBLLM_TOOL_ARGUMENTS_INVALID' });
});

test.each([
  {
    type: 'object',
    properties: { email: { type: 'string', format: 'email' } },
    required: ['email'],
    additionalProperties: false,
  },
  {
    type: 'object',
    properties: { n: { type: 'integer', enum: [1.5] } },
    required: ['n'],
    additionalProperties: false,
  },
  { type: 'object', properties: {}, additionalProperties: true },
])(
  'rejects unsupported argument schemas before creation %j',
  async (parameters) => {
    const source = request();
    source.input.tools[0].parameters = parameters;
    const injected = engine();

    await expect(run(injected, source)).rejects.toMatchObject({
      code: 'FEATURE_UNSUPPORTED',
    });
    expect(injected.chat.completions.create).not.toHaveBeenCalled();
  },
);

test('forwards engine generation failures and releases ownership on failed validation', async () => {
  const injected = engine([chunk('{}'), stop]);

  await expect(run(injected)).rejects.toMatchObject({
    code: 'WEBLLM_TOOL_ARGUMENTS_INVALID',
  });
  injected.chat.completions.create.mockImplementationOnce(async function* () {
    yield chunk('{"query":');
    throw new Error('backend failed');
  });
  await expect(run(injected)).rejects.toMatchObject({
    code: 'WEBLLM_ENGINE_ERROR',
    retryable: false,
    message: 'backend failed',
  });
  await expect(run(injected)).rejects.toMatchObject({
    code: 'WEBLLM_TOOL_ARGUMENTS_INVALID',
  });
});

test.each(['text', 'tools'] as const)(
  'shares engine ownership in both directions with %s',
  async (owner) => {
    const injected = engine();
    const tools = experimental_webllm_tools({
      engine: injected,
      toolPhase: phase,
    })();
    const text = experimental_webllm({ engine: injected })();
    const textRequest = () => {
      const value = request();
      value.input.tools = [];
      return value;
    };
    const response = await (owner === 'text'
      ? text.send(textRequest())
      : tools.send(request()));

    await expect(
      owner === 'text' ? tools.send(request()) : text.send(textRequest()),
    ).rejects.toMatchObject({ code: 'MODEL_BUSY' });
    await expect(tools.send(request())).rejects.toMatchObject({
      code: 'MODEL_BUSY',
    });
    await response.dispose?.();
    const next = await tools.send(request());
    await next.dispose?.();

    expect(injected.chat.completions.create).not.toHaveBeenCalled();
  },
);

test.each(['images', 'tools'] as const)(
  'shares ownership between image and tool protocols with %s as owner',
  async (owner) => {
    const injected = {
      chat: {
        completions: {
          create: jest.fn<
            ReturnType<WebLlmEngine['chat']['completions']['create']>,
            [WebLlmRequest<WebLlmImageContent>]
          >(async function* () {
            yield chunk('{"query":"ok"}');
            yield stop;
          }),
        },
      },
      interruptGenerate: jest.fn(),
    };
    const images = experimental_webllm({
      engine: injected,
      media: {
        images: {},
        resolve: () => {
          throw new Error('unused');
        },
      },
    })();
    const tools = experimental_webllm_tools({
      engine: injected,
      toolPhase: phase,
    })();
    const imageRequest = request();
    imageRequest.input.tools = [];
    const first = await (owner === 'images'
      ? images.send(imageRequest)
      : tools.send(request()));

    await expect(
      owner === 'images' ? tools.send(request()) : images.send(imageRequest),
    ).rejects.toMatchObject({ code: 'MODEL_BUSY' });
    await first.dispose?.();
    const after = await tools.send(request());
    await after.dispose?.();

    expect(injected.chat.completions.create).not.toHaveBeenCalled();
  },
);

test('a late cancelled image preparation cannot release a newer tools run', async () => {
  const entered = deferred<void>();
  const late = deferred<WebLlmImageResource>();
  const dispose = jest.fn();
  const injected = {
    chat: {
      completions: {
        create: jest.fn<
          ReturnType<WebLlmEngine['chat']['completions']['create']>,
          [WebLlmRequest<WebLlmImageContent>]
        >(async function* () {
          yield stop;
        }),
      },
    },
    interruptGenerate: jest.fn(),
  };
  const images = experimental_webllm({
    engine: injected,
    media: {
      images: {},
      resolve: () => {
        entered.resolve();
        return late.promise;
      },
    },
  })();
  const tools = experimental_webllm_tools({
    engine: injected,
    toolPhase: phase,
  })();
  const source = request([
    {
      id: 'u',
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'url', value: 'owned-source', mimeType: 'image/png' },
        },
      ],
    },
  ]);
  source.input.tools = [];
  const first = await images.send(source);
  const iterator = first.events[Symbol.asyncIterator]();
  await iterator.next();
  const pending = iterator.next();
  await entered.promise;

  await expect(tools.send(request())).rejects.toMatchObject({
    code: 'MODEL_BUSY',
  });
  await first.dispose?.();
  await expect(pending).rejects.toMatchObject({ code: 'PROMPT_API_ABORTED' });
  const newer = await tools.send(request());
  late.resolve({ blob: new Blob(['image'], { type: 'image/png' }), dispose });
  await flush();
  await expect(tools.send(request())).rejects.toMatchObject({
    code: 'MODEL_BUSY',
  });
  await newer.dispose?.();

  expect(dispose).toHaveBeenCalledTimes(1);
  expect(injected.chat.completions.create).not.toHaveBeenCalled();
});

test('preserves invalid argument failure when cancellation throws and holds ownership through pending backend drain', async () => {
  const entered = deferred<void>();
  const finish = deferred<IteratorResult<WebLlmChunk>>();
  let index = 0;
  const injected = engine();
  injected.interruptGenerate.mockImplementation(() => {
    throw new Error('interrupt failed');
  });
  injected.chat.completions.create.mockImplementationOnce(() => ({
    [Symbol.asyncIterator]: () => ({
      next: async () => {
        if (index++ === 0)
          return { done: false, value: chunk(' '.repeat(1024 * 1024 + 1)) };
        entered.resolve();
        return finish.promise;
      },
    }),
  }));
  const response = await experimental_webllm_tools({
    engine: injected,
    toolPhase: phase,
  })().send(request());
  const seen: AGUIEvent[] = [];
  const consume = async () => {
    for await (const event of response.events) seen.push(event);
  };

  const consumed = consume();
  const assertion = expect(consumed).rejects.toMatchObject({
    code: 'WEBLLM_TOOL_ARGUMENTS_INVALID',
    retryable: false,
  });
  await entered.promise;
  try {
    await assertion;
  } finally {
    await expect(
      experimental_webllm_tools({ engine: injected, toolPhase: phase })().send(
        request(),
      ),
    ).rejects.toMatchObject({ code: 'MODEL_BUSY' });
    finish.resolve({ done: true, value: undefined });
    await flush();
  }
  const after = await experimental_webllm_tools({
    engine: injected,
    toolPhase: phase,
  })().send(request());
  await after.dispose?.();

  expect(seen.map((event) => event.type)).toEqual([EventType.RUN_STARTED]);
  expect(injected.interruptGenerate).toHaveBeenCalledTimes(1);
});
