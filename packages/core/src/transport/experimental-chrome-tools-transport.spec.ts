import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';
import { EventType } from '@ag-ui/core';
import {
  detectChromeToolsCapabilities,
  experimental_chrome_tools,
} from './experimental-chrome-tools-transport';
import type { TransportRequest } from './transport';

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
      promptStreaming() { return new ReadableStream<unknown>(); }, destroy() {},
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
