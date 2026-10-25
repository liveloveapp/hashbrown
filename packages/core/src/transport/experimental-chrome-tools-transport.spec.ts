import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';
import { EventType } from '@ag-ui/core';
import {
  detectChromeToolsCapabilities,
  experimental_chrome_tools,
} from './experimental-chrome-tools-transport';
import type { TransportRequest } from './transport';
import { createUiJsonSchema } from '../ui/ui-json-schema';
import { s } from '../schema';

function request(): TransportRequest {
  return {
    input: {
      threadId: 't',
      runId: 'r',
      context: [],
      state: {},
      forwardedProps: {},
      tools: [
        {
          name: 'lookup',
          description: 'Lookup',
          parameters: { type: 'object' },
        },
      ],
      messages: [{ id: 'u', role: 'user', content: 'look up' }],
    },
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: 'q',
  };
}
function install(
  chunks: unknown[] = [],
  status = 'available',
  readsTools = true,
) {
  class Value {
    constructor(init: object) {
      Object.assign(this, init);
    }
  }
  const destroy = jest.fn();
  const promptStreaming = jest.fn((input: unknown) => {
    void input;
    return new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(chunk));
        controller.close();
      },
    });
  });
  const create = jest.fn(async (options: unknown) => {
    void options;
    return { promptStreaming, destroy };
  });
  Object.assign(globalThis, {
    LanguageModel: {
      availability: jest.fn(async (options) => {
        if (readsTools) void options.tools;
        return status;
      }),
      create,
    },
    LanguageModelToolCall: Value,
    LanguageModelToolSuccess: Value,
    LanguageModelToolError: Value,
  });
  return { create, destroy, promptStreaming };
}
async function collect(chunks: unknown[]) {
  install(chunks);
  const response = await experimental_chrome_tools()().send(request());
  const events = [];
  for await (const event of response.events) events.push(event);
  return events;
}

test('reports model availability separately from unverified inference and ignored dictionaries', async () => {
  install([], 'available', false);

  const result = await detectChromeToolsCapabilities();

  expect(result.nativeInterface.toolsDictionary).toBe(false);
  expect(result.inference).toBe('unknown');
  expect(result.adapter.supported).toBe(false);
});

test('uses fresh authoritative sessions and typed expected modalities', async () => {
  const native = install(['done']);
  const transport = experimental_chrome_tools()();

  for (let i = 0; i < 2; i++) {
    const response = await transport.send(request());
    for await (const event of response.events) void event;
  }

  expect(native.create).toHaveBeenCalledTimes(2);
  expect(native.destroy).toHaveBeenCalledTimes(2);
  expect(native.create.mock.calls[0][0]).toEqual(
    expect.objectContaining({
      initialPrompts: [],
      expectedInputs: [
        { type: 'text', languages: ['en'] },
        { type: 'tool-call' },
        { type: 'tool-response' },
      ],
      expectedOutputs: [
        { type: 'text', languages: ['en'] },
        { type: 'tool-call' },
      ],
    }),
  );
  expect(native.promptStreaming.mock.calls[0][0]).toEqual([
    { role: 'user', content: 'look up' },
  ]);
});

test('emits canonical tool events after validating the completed turn', async () => {
  const events = await collect([
    {
      type: 'tool-call',
      value: { callID: '', name: 'lookup', arguments: { key: 'x' } },
    },
  ]);

  expect(events.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.TOOL_CALL_START,
    EventType.TOOL_CALL_ARGS,
    EventType.TOOL_CALL_END,
    EventType.RUN_FINISHED,
  ]);
  expect(events[1]).toEqual(
    expect.objectContaining({
      toolCallId: expect.stringMatching(/^[a-f0-9-]{36}$/),
      toolCallName: 'lookup',
    }),
  );
});

test.each([
  [
    {
      type: 'tool-call',
      value: { callID: 'id', name: 'lookup', arguments: {} },
    },
    { type: 'bad', value: 'truncated' },
  ],
  [
    { type: 'tool-call', value: { callID: '', name: 'lookup', arguments: {} } },
    {
      type: 'tool-call',
      value: { callID: 'other', name: 'lookup', arguments: {} },
    },
  ],
])(
  'withholds executable events for invalid completed turns',
  async (...chunks) => {
    install(chunks);
    const response = await experimental_chrome_tools()().send(request());
    const events: string[] = [];

    await expect(
      (async () => {
        for await (const event of response.events) events.push(event.type);
      })(),
    ).rejects.toThrow();
    expect(events).not.toContain(EventType.TOOL_CALL_END);
  },
);

test('requires explicit download approval and rejects unsupported requests before creation', async () => {
  const native = install([], 'downloadable');

  await expect(
    experimental_chrome_tools()().send(request()),
  ).rejects.toMatchObject({
    code: 'MODEL_DOWNLOAD_REQUIRED',
    retryable: false,
  });
  expect(native.create).not.toHaveBeenCalled();
});

test('abort before send never creates a session', async () => {
  const native = install();
  const controller = new AbortController();
  controller.abort();

  await expect(
    experimental_chrome_tools()().send({
      ...request(),
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ code: 'PROMPT_API_ABORTED' });
  expect(native.create).not.toHaveBeenCalled();
});

test('preserves plain native string text interleaved with calls', async () => {
  const events = await collect([
    'before',
    {
      type: 'tool-call',
      value: { callID: 'id', name: 'lookup', arguments: {} },
    },
    'after',
  ]);

  expect(
    events
      .filter((event) => event.type === EventType.TEXT_MESSAGE_CONTENT)
      .map((event) => event.delta),
  ).toEqual(['before', 'after']);
});

test('consumer return and repeated disposal destroy the owned session exactly once', async () => {
  const native = install(['done']);
  const response = await experimental_chrome_tools()().send(request());
  const iterator = response.events[Symbol.asyncIterator]();

  await iterator.next();
  await iterator.return?.();
  await response.dispose?.();
  await response.dispose?.();

  expect(native.destroy).toHaveBeenCalledTimes(1);
});

test('cancellation destroys a session that resolves after create was abandoned', async () => {
  const native = install();
  const controller = new AbortController();
  let resolve!: (session: {
    promptStreaming: typeof native.promptStreaming;
    destroy: typeof native.destroy;
  }) => void;
  let started!: () => void;
  const starting = new Promise<void>((done) => {
    started = done;
  });
  const creating = new Promise<{
    promptStreaming: typeof native.promptStreaming;
    destroy: typeof native.destroy;
  }>((done) => {
    resolve = done;
  });
  const sending = experimental_chrome_tools({
    createSession: () => {
      started();
      return creating;
    },
  })().send({ ...request(), signal: controller.signal });
  await starting;

  controller.abort();
  await expect(sending).rejects.toMatchObject({ code: 'PROMPT_API_ABORTED' });
  resolve({ promptStreaming: native.promptStreaming, destroy: native.destroy });
  await creating;
  await Promise.resolve();

  expect(native.destroy).toHaveBeenCalledTimes(1);
});

test('cancellation owns late prompt streams', async () => {
  const native = install();
  const controller = new AbortController();
  const cancel = jest.fn();
  let resolve!: (stream: ReadableStream<unknown>) => void;
  let started!: () => void;
  const starting = new Promise<void>((done) => {
    started = done;
  });
  const pending = new Promise<ReadableStream<unknown>>((done) => {
    resolve = done;
  });
  const response = await experimental_chrome_tools({
    createSession: async () => ({
      destroy: native.destroy,
      promptStreaming: () => {
        started();
        return pending;
      },
    }),
  })().send({ ...request(), signal: controller.signal });
  const iterator = response.events[Symbol.asyncIterator]();
  await iterator.next();
  const next = iterator.next();
  await starting;

  controller.abort();
  await expect(next).rejects.toMatchObject({ code: 'PROMPT_API_ABORTED' });
  resolve(new ReadableStream({ cancel }));
  await pending;
  await Promise.resolve();
  await Promise.resolve();

  expect(cancel).toHaveBeenCalledTimes(1);
  expect(native.destroy).toHaveBeenCalledTimes(1);
});

test.each(['unknown', 'unavailable'])(
  'rejects %s availability before creating a session',
  async (status) => {
    const native = install([], status);

    await expect(
      experimental_chrome_tools()().send(request()),
    ).rejects.toMatchObject({ code: 'FEATURE_UNSUPPORTED', retryable: false });
    expect(native.create).not.toHaveBeenCalled();
  },
);

test('rejects missing constructors even with a custom session provider', async () => {
  const native = install();
  Object.assign(globalThis, { LanguageModelToolError: undefined });

  await expect(
    experimental_chrome_tools({ createSession: native.create })().send(
      request(),
    ),
  ).rejects.toMatchObject({ code: 'FEATURE_UNSUPPORTED' });
  expect(native.create).not.toHaveBeenCalled();
});

test.each([{ responseSchema: {} }, { ui: true }])(
  'rejects unsupported generation modes before checking or creating a session',
  async (hashbrown) => {
    const native = install();
    const source = request();
    source.input.forwardedProps = { hashbrown };

    await expect(
      experimental_chrome_tools()().send(source),
    ).rejects.toMatchObject({ code: 'FEATURE_UNSUPPORTED', retryable: false });
    expect(native.create).not.toHaveBeenCalled();
  },
);

test('replays native success and error constructors with exact canonical identities', async () => {
  const native = install(['done']);
  const source = request();
  source.input.messages = [
    {
      id: 'a',
      role: 'assistant',
      toolCalls: [
        {
          id: 'id',
          type: 'function',
          function: { name: 'lookup', arguments: '{}' },
        },
      ],
    },
    { id: 'b', role: 'tool', toolCallId: 'id', content: 'secret' },
    {
      id: 'c',
      role: 'assistant',
      toolCalls: [
        {
          id: 'error-id',
          type: 'function',
          function: { name: 'lookup', arguments: '{}' },
        },
      ],
    },
    {
      id: 'd',
      role: 'tool',
      toolCallId: 'error-id',
      content: 'failure',
      error: 'failed',
    },
  ];

  const response = await experimental_chrome_tools()().send(source);
  for await (const event of response.events) void event;

  expect(native.promptStreaming).toHaveBeenCalledWith(
    [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            value: expect.objectContaining({
              callID: 'id',
              callId: 'id',
              name: 'lookup',
              arguments: {},
            }),
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool-response',
            value: expect.objectContaining({
              callID: 'id',
              name: 'lookup',
              result: [{ type: 'text', value: 'secret' }],
            }),
          },
        ],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            value: expect.objectContaining({
              callID: 'error-id',
              name: 'lookup',
            }),
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool-response',
            value: expect.objectContaining({
              callID: 'error-id',
              name: 'lookup',
              errorMessage: 'failure',
            }),
          },
        ],
      },
    ],
    expect.objectContaining({ signal: expect.anything() }),
  );
});

test('aggregates consecutive native text chunks into one assistant message', async () => {
  const events = await collect(['hello', ' world']);

  expect(
    events.filter((event) => event.type === EventType.TEXT_MESSAGE_START),
  ).toHaveLength(1);
  expect(
    events
      .filter((event) => event.type === EventType.TEXT_MESSAGE_CONTENT)
      .map((event) => event.delta)
      .join(''),
  ).toBe('hello world');
});

test('rejects stream read errors before exposing any executable event', async () => {
  const native = install();
  let count = 0;
  const response = await experimental_chrome_tools({
    createSession: async () => ({
      destroy: native.destroy,
      promptStreaming: () =>
        new ReadableStream({
          pull(controller) {
            if (count++ === 0)
              controller.enqueue({
                type: 'tool-call',
                value: { callID: 'id', name: 'lookup', arguments: {} },
              });
            else controller.error(new Error('truncated'));
          },
        }),
    }),
  })().send(request());
  const events: string[] = [];

  await expect(
    (async () => {
      for await (const event of response.events) events.push(event.type);
    })(),
  ).rejects.toThrow('truncated');
  expect(events).not.toContain(EventType.TOOL_CALL_END);
  expect(native.destroy).toHaveBeenCalledTimes(1);
});

test('concurrent requests own independent sessions', async () => {
  install();
  const destroyA = jest.fn();
  const destroyB = jest.fn();
  let index = 0;
  const transport = experimental_chrome_tools({
    createSession: async () => ({
      destroy: index++ === 0 ? destroyA : destroyB,
      promptStreaming: () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue('done');
            controller.close();
          },
        }),
    }),
  })();

  const [a, b] = await Promise.all([
    transport.send(request()),
    transport.send(request()),
  ]);
  await a.dispose?.();
  expect(destroyA).toHaveBeenCalledTimes(1);
  expect(destroyB).not.toHaveBeenCalled();
  for await (const event of b.events) void event;

  expect(destroyB).toHaveBeenCalledTimes(1);
});

test('bounds total inference time and cancels an acquired native reader', async () => {
  const native = install();
  const cancel = jest.fn();
  const response = await experimental_chrome_tools({
    timeoutMs: 20,
    createSession: async () => ({
      destroy: native.destroy,
      promptStreaming: () => new ReadableStream({ cancel }),
    }),
  })().send(request());

  await expect(
    (async () => {
      for await (const event of response.events) void event;
    })(),
  ).rejects.toMatchObject({ code: 'PROMPT_API_ABORTED' });
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(native.destroy).toHaveBeenCalledTimes(1);
});

test('streams text before the native turn reaches EOF', async () => {
  const native = install();
  const response = await experimental_chrome_tools({
    timeoutMs: 100,
    createSession: async () => ({
      destroy: native.destroy,
      promptStreaming: () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue('hello');
          },
        }),
    }),
  })().send(request());
  const iterator = response.events[Symbol.asyncIterator]();
  await iterator.next();

  const start = await iterator.next();
  const content = await iterator.next();
  await iterator.return?.();

  expect(start.value).toMatchObject({ type: EventType.TEXT_MESSAGE_START });
  expect(content.value).toMatchObject({
    type: EventType.TEXT_MESSAGE_CONTENT,
    delta: 'hello',
  });
});

test('allows an explicit bounded twenty-minute download budget', () => {
  expect(() => experimental_chrome_tools({ timeoutMs: 1200000 })).not.toThrow();
  expect(() => experimental_chrome_tools({ timeoutMs: 1200001 })).toThrow();
});

test.each([
  { callID: BigInt(1), name: 'lookup', arguments: {} },
  { callID: 'id', name: BigInt(1), arguments: {} },
])(
  'rejects non-JSON identities as non-retryable protocol failures',
  async (call) => {
    install([{ type: 'tool-call', value: call }]);
    const response = await experimental_chrome_tools()().send(request());

    await expect(
      (async () => {
        for await (const event of response.events) void event;
      })(),
    ).rejects.toMatchObject({ code: 'FEATURE_UNSUPPORTED', retryable: false });
  },
);

test.each(['image', 'audio'])(
  'rejects %s input before session creation',
  async (type) => {
    const native = install();
    const source = request();
    source.input.messages = [
      {
        id: 'u',
        role: 'user',
        content: [{ type, url: 'https://example.com/media' }],
      },
    ] as unknown as TransportRequest['input']['messages'];

    await expect(
      experimental_chrome_tools()().send(source),
    ).rejects.toMatchObject({ code: 'FEATURE_UNSUPPORTED', retryable: false });
    expect(native.create).not.toHaveBeenCalled();
  },
);

test('supports public native tools declarations in a Node-only consumer without DOM libraries', () => {
  const virtualDirectory = join(
    __dirname,
    '__node_tools_declaration_consumer__',
  );
  const declarationPath = join(
    virtualDirectory,
    'experimental-chrome-tools-transport.d.ts',
  );
  const consumerPath = join(virtualDirectory, 'consumer.ts');
  const declaration = ts.transpileDeclaration(
    readFileSync(
      join(__dirname, 'experimental-chrome-tools-transport.ts'),
      'utf8',
    ),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        declaration: true,
        emitDeclarationOnly: true,
      },
    },
  ).outputText;
  const consumer = `import type { ChromeToolsSessionOptions, ChromeToolsSession } from './experimental-chrome-tools-transport';
    const options: ChromeToolsSessionOptions = {
      tools: [], expectedInputs: [], expectedOutputs: [],
      monitor(monitor) { monitor.addEventListener('downloadprogress', (event) => { void event.loaded; }); },
    };
    const session: ChromeToolsSession = {
      promptStreaming(input, promptOptions) { void input; const schema: object | undefined = promptOptions.responseConstraint; void schema; return new ReadableStream<unknown>(); }, destroy() {},
    };
    void [options, session];`;
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.Node16,
    moduleResolution: ts.ModuleResolutionKind.Node16,
    lib: ['lib.es2022.d.ts'],
    types: ['node'],
    skipLibCheck: false,
    strict: true,
    noEmit: true,
  };
  const host = ts.createCompilerHost(options);
  const files = new Map([
    [declarationPath, declaration],
    [consumerPath, consumer],
  ]);
  for (const name of [
    'experimental-chrome-local-transport',
    'transport',
    'transport-error',
    'chrome-prompt-media',
    'chrome-tool-phase',
    'chrome-tool-messages',
  ]) {
    const output = ts.transpileDeclaration(
      readFileSync(join(__dirname, `${name}.ts`), 'utf8'),
      {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          declaration: true,
          emitDeclarationOnly: true,
        },
      },
    ).outputText;
    files.set(join(virtualDirectory, `${name}.d.ts`), output);
  }
  const originalDirectoryExists = host.directoryExists?.bind(host);
  host.directoryExists = (directory) =>
    directory === virtualDirectory ||
    originalDirectoryExists?.(directory) === true;
  const originalGetSourceFile = host.getSourceFile.bind(host);
  const originalFileExists = host.fileExists.bind(host);
  host.fileExists = (file) => files.has(file) || originalFileExists(file);
  host.getSourceFile = (
    file,
    languageVersion,
    onError,
    shouldCreateNewSourceFile,
  ) => {
    const source = files.get(file);
    return source === undefined
      ? originalGetSourceFile(
          file,
          languageVersion,
          onError,
          shouldCreateNewSourceFile,
        )
      : ts.createSourceFile(file, source, languageVersion);
  };

  const program = ts.createProgram([consumerPath], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);

  expect(
    diagnostics.map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    ),
  ).toEqual([]);
});

test('consumer disposal invokes destruction even when native reader cancellation never settles', async () => {
  const native = install();
  const cancel = jest.fn(() => new Promise<void>(() => undefined));
  const response = await experimental_chrome_tools({
    createSession: async () => ({
      destroy: native.destroy,
      promptStreaming: () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue('hello');
          },
          cancel,
        }),
    }),
  })().send(request());
  const iterator = response.events[Symbol.asyncIterator]();
  await iterator.next();
  await iterator.next();
  await iterator.next();

  const disposed = Promise.resolve(response.dispose?.()).then(() => true);
  const settled = await Promise.race([
    disposed,
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 100)),
  ]);

  expect(settled).toBe(true);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(native.destroy).toHaveBeenCalledTimes(1);
});

test('owned teardown remains bounded when asynchronous destroy never settles', async () => {
  install();
  const destroy = jest.fn(() => new Promise<void>(() => undefined));
  const response = await experimental_chrome_tools({
    createSession: async () => ({
      destroy,
      promptStreaming: () => new ReadableStream(),
    }),
  })().send(request());

  const disposed = Promise.resolve(response.dispose?.()).then(() => true);
  const settled = await Promise.race([
    disposed,
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 100)),
  ]);

  expect(settled).toBe(true);
  expect(destroy).toHaveBeenCalledTimes(1);
});

test('capability options own immutable JSON declarations', async () => {
  install();
  const inputSchema = {
    type: 'object',
    properties: { key: { type: 'string' } },
  };
  const tools = [{ name: 'lookup', description: 'Lookup', inputSchema }];

  const result = await detectChromeToolsCapabilities({}, tools);
  inputSchema.properties.key.type = 'number';
  tools[0].name = 'changed';

  expect(result.options.tools[0]).toEqual({
    name: 'lookup',
    description: 'Lookup',
    inputSchema: { type: 'object', properties: { key: { type: 'string' } } },
  });
  expect(JSON.parse(JSON.stringify(result)).options.tools).toEqual(
    result.options.tools,
  );
});

test.each([
  () => ({ type: 'object', bad: () => undefined }),
  () => {
    const value: Record<string, unknown> = { type: 'object' };
    value['cycle'] = value;
    return value;
  },
])('rejects non-serializable capability declarations', async (schema) => {
  install();

  await expect(
    detectChromeToolsCapabilities({}, [
      { name: 'lookup', description: 'Lookup', inputSchema: schema() },
    ]),
  ).rejects.toMatchObject({ code: 'FEATURE_UNSUPPORTED', retryable: false });
});

test('preserves multiple valid distinct native IDs after completed-turn validation', async () => {
  const events = await collect([
    'before',
    {
      type: 'tool-call',
      value: { callID: 'first', name: 'lookup', arguments: { key: 'one' } },
    },
    'between',
    {
      type: 'tool-call',
      value: { callID: 'second', name: 'lookup', arguments: { key: 'two' } },
    },
    'after',
  ]);

  expect(
    events
      .filter((event) => event.type === EventType.TOOL_CALL_END)
      .map((event) => event.toolCallId),
  ).toEqual(['first', 'second']);
});

test('withholds every executable call when valid IDs are duplicated', async () => {
  install([
    {
      type: 'tool-call',
      value: { callID: 'same', name: 'lookup', arguments: {} },
    },
    {
      type: 'tool-call',
      value: { callID: 'same', name: 'lookup', arguments: {} },
    },
  ]);
  const response = await experimental_chrome_tools()().send(request());
  const events: string[] = [];

  await expect(
    (async () => {
      for await (const event of response.events) events.push(event.type);
    })(),
  ).rejects.toMatchObject({ code: 'FEATURE_UNSUPPORTED' });
  expect(events).not.toContain(EventType.TOOL_CALL_START);
  expect(events).not.toContain(EventType.TOOL_CALL_END);
});

test.each([EventType.TOOL_CALL_START, EventType.TOOL_CALL_ARGS])(
  'cancellation after %s prevents executable completion',
  async (cancelAfter) => {
    const native = install([
      {
        type: 'tool-call',
        value: { callID: 'id', name: 'lookup', arguments: {} },
      },
    ]);
    const controller = new AbortController();
    const response = await experimental_chrome_tools()().send({
      ...request(),
      signal: controller.signal,
    });
    const events: string[] = [];

    await expect(
      (async () => {
        for await (const event of response.events) {
          events.push(event.type);
          if (event.type === cancelAfter) controller.abort();
        }
      })(),
    ).rejects.toMatchObject({ code: 'PROMPT_API_ABORTED' });
    expect(events).not.toContain(EventType.TOOL_CALL_END);
    expect(native.destroy).toHaveBeenCalledTimes(1);
  },
);

function schemaRequest(tools = true): TransportRequest {
  const source = request();
  source.input.forwardedProps = {
    hashbrown: {
      responseSchema: {
        type: 'object',
        properties: { answer: { type: 'string' } },
      },
    },
  };
  if (!tools) source.input.tools = [];
  return source;
}

function nativeTurn(chunks: unknown[]): ReadableStream<unknown> {
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });
}

async function schemaEvents(source = schemaRequest(), turns: unknown[][] = []) {
  const native = install();
  const prompt = jest.fn((input: readonly object[], options: object) => {
    void input;
    void options;
    return nativeTurn(turns.shift() ?? []);
  });
  const response = await experimental_chrome_tools({
    schemaFinalization: 'after-tool-planning',
    createSession: async () => ({
      promptStreaming: prompt,
      destroy: native.destroy,
    }),
  })().send(source);
  const events = [];
  for await (const event of response.events) events.push(event);
  return { events, prompt, native };
}

test('opt-in schema planning suppresses all prose and emits only validated calls', async () => {
  const { events, prompt } = await schemaEvents(schemaRequest(), [
    [
      'private planning',
      {
        type: 'tool-call',
        value: { callID: 'id', name: 'lookup', arguments: {} },
      },
      'private after',
    ],
  ]);

  expect(events.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.TOOL_CALL_START,
    EventType.TOOL_CALL_ARGS,
    EventType.TOOL_CALL_END,
    EventType.RUN_FINISHED,
  ]);
  expect(prompt).toHaveBeenCalledTimes(1);
  expect(prompt.mock.calls[0][1]).not.toHaveProperty('responseConstraint');
});

test('terminal planning finalizes once in the same session with an owned exact schema', async () => {
  const source = schemaRequest();
  const original = JSON.stringify(source.input);

  const { events, prompt, native } = await schemaEvents(source, [
    ['private reasoning'],
    ['{"answer":', '"receipt"}'],
  ]);

  expect(prompt).toHaveBeenCalledTimes(2);
  expect(prompt.mock.calls[0][0]).toEqual([
    { role: 'user', content: 'look up' },
  ]);
  expect(prompt.mock.calls[0][1]).not.toHaveProperty('responseConstraint');
  expect(prompt.mock.calls[1][0]).toEqual([
    { role: 'user', content: expect.stringContaining('without calling tools') },
  ]);
  expect(prompt.mock.calls[1][1]).toMatchObject({
    responseConstraint: {
      type: 'object',
      properties: { answer: { type: 'string' } },
    },
  });
  expect(
    events
      .filter((event) => event.type === EventType.TEXT_MESSAGE_CONTENT)
      .map((event) => event.delta),
  ).toEqual(['{"answer":', '"receipt"}']);
  expect(JSON.stringify(source.input)).toBe(original);
  expect(native.destroy).toHaveBeenCalledTimes(1);
});

test('schema without tools constrains authoritative history directly and preserves raw text', async () => {
  const { events, prompt } = await schemaEvents(schemaRequest(false), [
    ['```json\n{bad}\n```'],
  ]);

  expect(prompt).toHaveBeenCalledTimes(1);
  expect(prompt.mock.calls[0][0]).toEqual([
    { role: 'user', content: 'look up' },
  ]);
  expect(prompt.mock.calls[0][1]).toHaveProperty('responseConstraint');
  expect(
    events
      .filter((event) => event.type === EventType.TEXT_MESSAGE_CONTENT)
      .map((event) => event.delta),
  ).toEqual(['```json\n{bad}\n```']);
});

test.each([false, true])(
  'finalization rejects typed calls without executable events (tools=%s)',
  async (tools) => {
    install();
    const turns = [
      ...(tools ? [['private']] : []),
      [
        {
          type: 'tool-call',
          value: { callID: 'id', name: 'lookup', arguments: {} },
        },
      ],
    ];
    const response = await experimental_chrome_tools({
      schemaFinalization: 'after-tool-planning',
      createSession: async () => ({
        destroy: jest.fn(),
        promptStreaming: () => nativeTurn(turns.shift() ?? []),
      }),
    })().send(schemaRequest(tools));
    const events: string[] = [];

    await expect(
      (async () => {
        for await (const event of response.events) events.push(event.type);
      })(),
    ).rejects.toMatchObject({ code: 'FEATURE_UNSUPPORTED' });
    expect(events).not.toContain(EventType.TOOL_CALL_START);
  },
);

test('schema finalization capability reports policy while inference remains unknown', async () => {
  install();

  const result = await detectChromeToolsCapabilities({
    schemaFinalization: 'after-tool-planning',
  });

  expect(result.adapter.structuredOutput).toBe(true);
  expect(result.adapter.schemaFinalization).toBe('after-tool-planning');
  expect(result.inference).toBe('unknown');
  expect(result.adapter.ui).toBe(true);
  expect(result.adapter.media).toBe(false);
});

test('rejects invalid schema policies before native creation and detection', async () => {
  const native = install();
  const invalid = { schemaFinalization: 'always' } as never;

  expect(() => experimental_chrome_tools(invalid)).toThrow();
  await expect(detectChromeToolsCapabilities(invalid)).rejects.toMatchObject({
    code: 'FEATURE_UNSUPPORTED',
  });
  expect(native.create).not.toHaveBeenCalled();
});

test.each([
  [],
  { type: 'object', padding: 'x'.repeat(1024 * 1024) },
  { bad: () => undefined },
])(
  'bounds and validates schema before creating native sessions',
  async (responseSchema) => {
    const native = install();
    const source = schemaRequest();
    source.input.forwardedProps = { hashbrown: { responseSchema } };

    await expect(
      experimental_chrome_tools({
        schemaFinalization: 'after-tool-planning',
      })().send(source),
    ).rejects.toMatchObject({ code: 'FEATURE_UNSUPPORTED' });
    expect(native.create).not.toHaveBeenCalled();
  },
);

test('schema ownership survives source mutation while native creation is pending', async () => {
  const native = install();
  const source = schemaRequest(false);
  const schema = { type: 'object', properties: { answer: { type: 'string' } } };
  source.input.forwardedProps = { hashbrown: { responseSchema: schema } };
  let created!: () => void;
  const starting = new Promise<void>((resolve) => {
    created = resolve;
  });
  let resume!: () => void;
  const waiting = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const prompt = jest.fn(
    (
      input: readonly object[],
      options: { signal: AbortSignal; responseConstraint?: object },
    ) => {
      void input;
      void options;
      return nativeTurn(['{}']);
    },
  );
  const sending = experimental_chrome_tools({
    schemaFinalization: 'after-tool-planning',
    createSession: async () => {
      created();
      await waiting;
      return { destroy: native.destroy, promptStreaming: prompt };
    },
  })().send(source);
  await starting;

  schema.properties.answer.type = 'number';
  resume();
  const response = await sending;
  for await (const event of response.events) void event;

  const owned = prompt.mock.calls[0][1].responseConstraint;
  expect(owned).toEqual({
    type: 'object',
    properties: { answer: { type: 'string' } },
  });
  expect(owned).not.toBe(schema);
  expect(Object.isFrozen(owned)).toBe(true);
  expect(Object.isFrozen((owned as typeof schema).properties.answer)).toBe(
    true,
  );
});

test('additional canonical tool rounds replay results into fresh unconstrained planning sessions', async () => {
  const source = schemaRequest();
  source.input.messages.push(
    {
      id: 'a',
      role: 'assistant',
      toolCalls: [
        {
          id: 'first',
          type: 'function',
          function: { name: 'lookup', arguments: '{}' },
        },
      ],
    },
    { id: 'b', role: 'tool', toolCallId: 'first', content: 'hidden-token' },
  );

  const { prompt, events } = await schemaEvents(source, [
    [
      'private',
      {
        type: 'tool-call',
        value: {
          callID: 'dependent',
          name: 'lookup',
          arguments: { token: 'hidden-token' },
        },
      },
    ],
  ]);

  expect(prompt.mock.calls[0][0]).toEqual(
    expect.arrayContaining([
      {
        role: 'user',
        content: [
          {
            type: 'tool-response',
            value: expect.objectContaining({
              callID: 'first',
              result: [{ type: 'text', value: 'hidden-token' }],
            }),
          },
        ],
      },
    ]),
  );
  expect(prompt.mock.calls[0][1]).not.toHaveProperty('responseConstraint');
  expect(
    events.filter((event) => event.type === EventType.TOOL_CALL_END),
  ).toEqual([expect.objectContaining({ toolCallId: 'dependent' })]);
});

test.each(['planning', 'finalization'] as const)(
  'schema %s shares cancellation and nonblocking hung native cleanup',
  async (phase) => {
    install();
    const controller = new AbortController();
    const cancel = jest.fn(() => new Promise<void>(() => undefined));
    const destroy = jest.fn(() => new Promise<void>(() => undefined));
    let started!: () => void;
    const starting = new Promise<void>((resolve) => {
      started = resolve;
    });
    let count = 0;
    const response = await experimental_chrome_tools({
      schemaFinalization: 'after-tool-planning',
      createSession: async () => ({
        destroy,
        promptStreaming: () => {
          if (phase === 'finalization' && count++ === 0)
            return nativeTurn(['private']);
          started();
          return new ReadableStream({ cancel });
        },
      }),
    })().send({ ...schemaRequest(), signal: controller.signal });
    const consuming = (async () => {
      for await (const event of response.events) void event;
    })();
    const rejected = expect(consuming).rejects.toMatchObject({
      code: 'PROMPT_API_ABORTED',
    });
    await starting;

    controller.abort();
    await rejected;

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  },
);

test.each(['planning', 'finalization'] as const)(
  'schema %s timeout owns a late prompt stream',
  async (phase) => {
    install();
    const cancel = jest.fn();
    const destroy = jest.fn();
    let resolve!: (stream: ReadableStream<unknown>) => void;
    const pending = new Promise<ReadableStream<unknown>>((done) => {
      resolve = done;
    });
    let count = 0;
    const response = await experimental_chrome_tools({
      schemaFinalization: 'after-tool-planning',
      timeoutMs: 40,
      createSession: async () => ({
        destroy,
        promptStreaming: () =>
          phase === 'finalization' && count++ === 0
            ? nativeTurn(['private'])
            : pending,
      }),
    })().send(schemaRequest());

    await expect(
      (async () => {
        for await (const event of response.events) void event;
      })(),
    ).rejects.toMatchObject({ code: 'PROMPT_API_ABORTED' });
    resolve(new ReadableStream({ cancel }));
    await pending;
    await Promise.resolve();
    await Promise.resolve();

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  },
);

test('schema planning withholds every call and all prose for a malformed completed batch', async () => {
  install();
  const response = await experimental_chrome_tools({
    schemaFinalization: 'after-tool-planning',
    createSession: async () => ({
      destroy: jest.fn(),
      promptStreaming: () =>
        nativeTurn([
          'private',
          {
            type: 'tool-call',
            value: { callID: 'same', name: 'lookup', arguments: {} },
          },
          {
            type: 'tool-call',
            value: { callID: 'same', name: 'lookup', arguments: {} },
          },
        ]),
    }),
  })().send(schemaRequest());
  const events: string[] = [];

  await expect(
    (async () => {
      for await (const event of response.events) events.push(event.type);
    })(),
  ).rejects.toMatchObject({ code: 'FEATURE_UNSUPPORTED' });
  expect(events).toEqual([EventType.RUN_STARTED]);
});

test.each([undefined, null, [], 'schema', 1, { type: 'array' }])(
  'UI requires an object response schema before native creation (%p)',
  async (responseSchema) => {
    const native = install();
    const source = schemaRequest();
    source.input.forwardedProps = { hashbrown: { responseSchema, ui: true } };

    await expect(
      experimental_chrome_tools({
        schemaFinalization: 'after-tool-planning',
      })().send(source),
    ).rejects.toMatchObject({ code: 'FEATURE_UNSUPPORTED' });
    expect(native.create).not.toHaveBeenCalled();
  },
);

test.each([true, false])(
  'opt-in UI forwards the exact kit schema only to finalization (tools=%s)',
  async (tools) => {
    const source = schemaRequest(tools);
    const responseSchema = createUiJsonSchema({
      components: [
        {
          name: 'receipt',
          description: 'Show the exact tool receipt.',
          props: { value: s.string('Exact receipt') },
          children: false,
        },
      ],
    });
    source.input.forwardedProps = { hashbrown: { responseSchema, ui: true } };
    const output = '{"ui":[{"receipt":{"props":{"value":"exact"}}}]}';

    const { events, prompt, native } = await schemaEvents(source, [
      ...(tools ? [['PRIVATE_PLANNING']] : []),
      [output],
    ]);

    expect(prompt).toHaveBeenCalledTimes(tools ? 2 : 1);
    if (tools)
      expect(prompt.mock.calls[0][1]).not.toHaveProperty('responseConstraint');
    expect(
      (prompt.mock.calls.at(-1)?.[1] as { responseConstraint?: unknown })
        .responseConstraint,
    ).toEqual(responseSchema);
    expect(
      events
        .filter((event) => event.type === EventType.TEXT_MESSAGE_CONTENT)
        .map((event) => event.delta),
    ).toEqual([output]);
    expect(native.destroy).toHaveBeenCalledTimes(1);
  },
);

test.each(['planning', 'finalization'] as const)(
  'schema %s retains the native turn output bound',
  async (phase) => {
    install();
    let count = 0;
    const response = await experimental_chrome_tools({
      schemaFinalization: 'after-tool-planning',
      createSession: async () => ({
        destroy: jest.fn(),
        promptStreaming: () =>
          phase === 'finalization' && count++ === 0
            ? nativeTurn(['private'])
            : nativeTurn(['x'.repeat(4 * 1024 * 1024 + 1)]),
      }),
    })().send(schemaRequest());
    const types: string[] = [];

    await expect(
      (async () => {
        for await (const event of response.events) types.push(event.type);
      })(),
    ).rejects.toThrow('output bounds');
    expect(types).toEqual([EventType.RUN_STARTED]);
  },
);

test.each([null, 42, { type: 'text', value: '{}' }, { type: 'unknown' }])(
  'schema finalization rejects every non-string chunk without falling back',
  async (chunk) => {
    install();
    const promptStreaming = jest.fn(() => nativeTurn([chunk]));
    const response = await experimental_chrome_tools({
      schemaFinalization: 'after-tool-planning',
      createSession: async () => ({ destroy: jest.fn(), promptStreaming }),
    })().send(schemaRequest(false));

    await expect(
      (async () => {
        for await (const event of response.events) void event;
      })(),
    ).rejects.toMatchObject({ code: 'FEATURE_UNSUPPORTED' });
    expect(promptStreaming).toHaveBeenCalledTimes(1);
  },
);

function phaseRequest(): TransportRequest {
  const source = schemaRequest();
  source.input.tools.push({
    name: 'follow',
    description: 'Follow',
    parameters: { type: 'object' },
  });
  source.input.messages.push(
    {
      id: 'a',
      role: 'assistant',
      toolCalls: [
        {
          id: 'prior',
          type: 'function',
          function: { name: 'lookup', arguments: '{}' },
        },
      ],
    },
    { id: 'b', role: 'tool', toolCallId: 'prior', content: 'raw-token' },
  );
  return source;
}

test('selected phase exposes one tool while retaining typed other-tool history and suppressing prose', async () => {
  const native = install([
    'private',
    {
      type: 'tool-call',
      value: { callID: 'next', name: 'follow', arguments: {} },
    },
    'private after',
  ]);
  const selector = jest.fn(() => ({ type: 'tool' as const, name: 'follow' }));

  const response = await experimental_chrome_tools({
    schemaFinalization: 'after-tool-planning',
    toolPhase: selector,
  })().send(phaseRequest());
  const events = [];
  for await (const event of response.events) events.push(event);

  expect(selector).toHaveBeenCalledTimes(1);
  expect(native.create.mock.calls[0][0]).toMatchObject({
    tools: [{ name: 'follow' }],
  });
  expect(native.promptStreaming.mock.calls[0][0]).toEqual(
    expect.arrayContaining([
      {
        role: 'user',
        content: [
          {
            type: 'tool-response',
            value: expect.objectContaining({ callId: 'prior', name: 'lookup' }),
          },
        ],
      },
    ]),
  );
  expect(events.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.TOOL_CALL_START,
    EventType.TOOL_CALL_ARGS,
    EventType.TOOL_CALL_END,
    EventType.RUN_FINISHED,
  ]);
});

test.each(
  [
    [],
    ['private'],
    [
      {
        type: 'tool-call',
        value: { callID: 'one', name: 'follow', arguments: {} },
      },
      {
        type: 'tool-call',
        value: { callID: 'two', name: 'follow', arguments: {} },
      },
    ],
    [
      {
        type: 'tool-call',
        value: { callID: 'one', name: 'follow', arguments: {} },
      },
      {
        type: 'tool-call',
        value: { callID: 'one', name: 'follow', arguments: {} },
      },
    ],
    [
      {
        type: 'tool-call',
        value: { callID: 'one', name: 'lookup', arguments: {} },
      },
    ],
    [
      {
        type: 'tool-call',
        value: { callID: 'prior', name: 'follow', arguments: {} },
      },
    ],
    [
      {
        type: 'tool-call',
        value: { callID: 'one', name: 'follow', arguments: {} },
      },
      { type: 'bad' },
    ],
  ].map((chunks) => [chunks]),
)('tool phase rejects a whole invalid turn atomically (%p)', async (chunks) => {
  const native = install(chunks);
  const response = await experimental_chrome_tools({
    schemaFinalization: 'after-tool-planning',
    toolPhase: () => ({ type: 'tool', name: 'follow' }),
  })().send(phaseRequest());
  const types: string[] = [];

  await expect(
    (async () => {
      for await (const event of response.events) types.push(event.type);
    })(),
  ).rejects.toMatchObject({ code: 'FEATURE_UNSUPPORTED' });

  expect(types).toEqual([EventType.RUN_STARTED]);
  expect(native.promptStreaming).toHaveBeenCalledTimes(1);
  expect(native.destroy).toHaveBeenCalledTimes(1);
});

test('finalize phase retains historical declarations and constrains full typed history directly', async () => {
  const native = install(['{}']);
  const prompt = jest.fn((input: readonly object[], options: object) => {
    void input;
    void options;
    return nativeTurn(['{}']);
  });
  const response = await experimental_chrome_tools({
    schemaFinalization: 'after-tool-planning',
    toolPhase: () => ({ type: 'finalize' }),
    createSession: async () => ({
      destroy: native.destroy,
      promptStreaming: prompt,
    }),
  })().send(phaseRequest());

  for await (const event of response.events) void event;

  expect(prompt).toHaveBeenCalledTimes(1);
  expect(prompt.mock.calls[0][0]).toHaveLength(4);
  expect(prompt.mock.calls[0][1]).toHaveProperty('responseConstraint');
  expect(
    (response.metadata?.['capabilities'] as { options: { tools: unknown[] } })
      .options.tools,
  ).toEqual([expect.objectContaining({ name: 'lookup' })]);
});

test('phase validation and abort happen before native resources and selector evaluation', async () => {
  const native = install();
  const selector = jest.fn(() => ({ type: 'finalize' as const }));
  const controller = new AbortController();
  controller.abort();

  await expect(
    experimental_chrome_tools({
      schemaFinalization: 'after-tool-planning',
      toolPhase: selector,
    })().send({ ...phaseRequest(), signal: controller.signal }),
  ).rejects.toMatchObject({ code: 'PROMPT_API_ABORTED' });
  expect(selector).not.toHaveBeenCalled();
  await expect(
    experimental_chrome_tools({
      schemaFinalization: 'after-tool-planning',
      toolPhase: selector,
    })().send(request()),
  ).rejects.toMatchObject({ code: 'FEATURE_UNSUPPORTED' });
  expect(selector).not.toHaveBeenCalled();
  expect(() => experimental_chrome_tools({ toolPhase: selector })).toThrow();
  const invalid = jest.fn(() => ({ type: 'tool' as const, name: 'unknown' }));
  await expect(
    experimental_chrome_tools({
      schemaFinalization: 'after-tool-planning',
      toolPhase: invalid,
    })().send(phaseRequest()),
  ).rejects.toThrow();
  expect(native.create).not.toHaveBeenCalled();
  expect(
    (globalThis as unknown as { LanguageModel: { availability: jest.Mock } })
      .LanguageModel.availability,
  ).not.toHaveBeenCalled();
});

test('interleaved sends select phases independently from each current user turn', async () => {
  install();
  const selector = jest.fn(
    (context: import('./chrome-tool-phase').ChromeToolsTurnContext) =>
      context.completedCalls.length
        ? { type: 'finalize' as const }
        : { type: 'tool' as const, name: 'lookup' },
  );
  const created: string[][] = [];
  const transport = experimental_chrome_tools({
    schemaFinalization: 'after-tool-planning',
    toolPhase: selector,
    createSession: async (options) => {
      created.push(options.tools.map((tool) => tool.name));
      return {
        destroy: jest.fn(),
        promptStreaming: (_input, promptOptions) =>
          nativeTurn(
            promptOptions.responseConstraint === undefined
              ? [
                  {
                    type: 'tool-call',
                    value: { callID: 'new', name: 'lookup', arguments: {} },
                  },
                ]
              : ['{}'],
          ),
      };
    },
  })();
  const fresh = schemaRequest();
  fresh.input.runId = 'fresh';
  const completed = phaseRequest();
  completed.input.runId = 'completed';

  const responses = await Promise.all([
    transport.send(completed),
    transport.send(fresh),
  ]);
  await Promise.all(
    responses.map(async (response) => {
      for await (const event of response.events) void event;
    }),
  );

  expect(created).toEqual([['lookup'], ['lookup']]);
  expect(
    selector.mock.calls.map(([context]) => [
      context.runId,
      context.completedCalls.length,
    ]),
  ).toEqual([
    ['completed', 1],
    ['fresh', 0],
  ]);
});

test.each(['tool', 'finalize'] as const)(
  'explicit %s phase cancellation destroys once and never completes a call',
  async (phase) => {
    const native = install();
    const controller = new AbortController();
    const cancel = jest.fn();
    let started!: () => void;
    const starting = new Promise<void>((resolve) => {
      started = resolve;
    });
    const response = await experimental_chrome_tools({
      schemaFinalization: 'after-tool-planning',
      toolPhase: () =>
        phase === 'tool'
          ? { type: 'tool', name: 'lookup' }
          : { type: 'finalize' },
      createSession: async () => ({
        destroy: native.destroy,
        promptStreaming: () => {
          started();
          return new ReadableStream({ cancel });
        },
      }),
    })().send({ ...schemaRequest(), signal: controller.signal });
    const consuming = (async () => {
      for await (const event of response.events) void event;
    })();
    const rejected = expect(consuming).rejects.toMatchObject({
      code: 'PROMPT_API_ABORTED',
    });
    await starting;

    controller.abort();
    await rejected;
    await response.dispose?.();

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(native.destroy).toHaveBeenCalledTimes(1);
  },
);

test.each([
  null,
  {
    type: 'tool-call',
    value: { callID: 'new', name: 'lookup', arguments: {} },
  },
])(
  'explicit finalize rejects nontext %p in its single constrained prompt',
  async (chunk) => {
    const native = install([chunk]);
    const response = await experimental_chrome_tools({
      schemaFinalization: 'after-tool-planning',
      toolPhase: () => ({ type: 'finalize' }),
    })().send(phaseRequest());
    const types: string[] = [];

    await expect(
      (async () => {
        for await (const event of response.events) types.push(event.type);
      })(),
    ).rejects.toMatchObject({ code: 'FEATURE_UNSUPPORTED' });

    expect(types).toEqual([EventType.RUN_STARTED]);
    expect(native.promptStreaming).toHaveBeenCalledTimes(1);
  },
);

test('full historical catalog validation precedes selector and native capability checks', async () => {
  const native = install();
  const source = phaseRequest();
  source.input.tools = source.input.tools.filter(
    (tool) => tool.name !== 'lookup',
  );
  const selector = jest.fn(() => ({ type: 'finalize' as const }));

  await expect(
    experimental_chrome_tools({
      schemaFinalization: 'after-tool-planning',
      toolPhase: selector,
    })().send(source),
  ).rejects.toMatchObject({ code: 'FEATURE_UNSUPPORTED' });

  expect(selector).not.toHaveBeenCalled();
  expect(native.create).not.toHaveBeenCalled();
});

test('finalization retains only historical native declarations in original catalog order across user turns and errors', async () => {
  const native = install(['{}']);
  const source = phaseRequest();
  source.input.tools = [
    { name: 'follow', description: 'Follow', parameters: { type: 'object' } },
    { name: 'unused', description: 'Unused', parameters: { type: 'object' } },
    source.input.tools[0],
  ];
  source.input.messages.push(
    { id: 'later-user', role: 'user', content: 'later turn' },
    {
      id: 'later-assistant',
      role: 'assistant',
      toolCalls: [
        {
          id: 'failed-follow',
          type: 'function',
          function: { name: 'follow', arguments: '{}' },
        },
      ],
    },
    {
      id: 'later-result',
      role: 'tool',
      toolCallId: 'failed-follow',
      content: 'raw failure',
      error: 'failed',
    },
  );
  const selector = jest.fn(
    (context: import('./chrome-tool-phase').ChromeToolsTurnContext) => {
      void context;
      return { type: 'finalize' as const };
    },
  );
  const transport = experimental_chrome_tools({
    schemaFinalization: 'after-tool-planning',
    toolPhase: selector,
  })();

  const response = await transport.send(source);
  for await (const event of response.events) void event;
  const fresh = await transport.send(schemaRequest());
  for await (const event of fresh.events) void event;

  expect(native.create.mock.calls[0][0]).toMatchObject({
    tools: [{ name: 'follow' }, { name: 'lookup' }],
  });
  expect(native.create.mock.calls[1][0]).toMatchObject({ tools: [] });
  expect(
    (
      response.metadata?.['capabilities'] as {
        options: { tools: { name: string }[] };
      }
    ).options.tools.map((tool) => tool.name),
  ).toEqual(['follow', 'lookup']);
  expect(
    selector.mock.calls[0][0].completedCalls.map((call) => call.callId),
  ).toEqual(['failed-follow']);
  expect(selector.mock.calls[1][0].completedCalls).toEqual([]);
  expect(native.promptStreaming.mock.calls[0][0]).toEqual(
    expect.arrayContaining([
      {
        role: 'user',
        content: [
          {
            type: 'tool-response',
            value: expect.objectContaining({
              callId: 'failed-follow',
              name: 'follow',
              errorMessage: 'raw failure',
            }),
          },
        ],
      },
    ]),
  );
});

test.each(['lookup', 'follow', 'undeclared'])(
  'retained-history finalization rejects %s call after streamed text without executable events',
  async (name) => {
    const native = install([
      '{"answer":',
      { type: 'tool-call', value: { callID: 'new', name, arguments: {} } },
    ]);
    const response = await experimental_chrome_tools({
      schemaFinalization: 'after-tool-planning',
      toolPhase: () => ({ type: 'finalize' }),
    })().send(phaseRequest());
    const types: string[] = [];

    await expect(
      (async () => {
        for await (const event of response.events) types.push(event.type);
      })(),
    ).rejects.toMatchObject({ code: 'FEATURE_UNSUPPORTED' });

    expect(types).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
    ]);
    expect(native.promptStreaming).toHaveBeenCalledTimes(1);
    expect(native.destroy).toHaveBeenCalledTimes(1);
  },
);

test.each(['tool', 'finalize'] as const)(
  'explicit %s phase appends a private directive to its single native prompt after unchanged history',
  async (phase) => {
    const native = install(
      phase === 'tool'
        ? [
            {
              type: 'tool-call',
              value: { callID: 'new', name: 'follow', arguments: {} },
            },
          ]
        : ['{}'],
    );
    const source = phaseRequest();
    const original = JSON.stringify(source.input);
    const selector = jest.fn(
      (context: import('./chrome-tool-phase').ChromeToolsTurnContext) => {
        void context;
        return phase === 'tool'
          ? { type: 'tool' as const, name: 'follow' }
          : { type: 'finalize' as const };
      },
    );
    const response = await experimental_chrome_tools({
      schemaFinalization: 'after-tool-planning',
      toolPhase: selector,
    })().send(source);

    for await (const event of response.events) void event;

    expect(native.promptStreaming).toHaveBeenCalledTimes(1);
    const prompt = native.promptStreaming.mock.calls[0][0];
    expect(prompt).toEqual([
      { role: 'user', content: 'look up' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            value: expect.objectContaining({
              callID: 'prior',
              name: 'lookup',
              arguments: {},
            }),
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool-response',
            value: expect.objectContaining({
              callID: 'prior',
              name: 'lookup',
              result: [{ type: 'text', value: 'raw-token' }],
            }),
          },
        ],
      },
      {
        role: 'user',
        content:
          phase === 'tool'
            ? 'The application selected the next tool phase for this turn. Call "follow" exactly once using the existing conversation and tool results. Do not call other tools or provide a final answer.'
            : 'The application has completed the tool phase for this turn. Do not call tools. Return only the final answer using the supplied response schema and the existing conversation and tool results.',
      },
    ]);
    expect(JSON.stringify(source.input)).toBe(original);
    expect(selector).toHaveBeenCalledTimes(1);
    expect(selector.mock.calls[0][0]).toEqual({
      threadId: 't',
      runId: 'r',
      userMessage: { id: 'u', content: 'look up' },
      completedCalls: [
        {
          callId: 'prior',
          name: 'lookup',
          arguments: {},
          result: { type: 'success', text: 'raw-token' },
        },
      ],
    });
  },
);
