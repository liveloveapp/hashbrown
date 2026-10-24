import { EventType, type RunAgentInput } from '@ag-ui/core';
import { type ChatResponse, Ollama } from 'ollama';
import { text } from './text.fn';

jest.mock('ollama', () => ({
  Ollama: jest.fn(),
}));

const MockedOllama = jest.mocked(Ollama);

function resetOllamaMock(): void {
  MockedOllama.mockReset();
}

function createInput(): RunAgentInput {
  return {
    threadId: 'thread-ollama',
    runId: 'run-ollama',
    messages: [{ id: 'user-ollama', role: 'user', content: 'Hello' }],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
  };
}

function createChunk(content: string, done = false): ChatResponse {
  return {
    model: 'qwen3',
    created_at: new Date('2026-08-31T00:00:00.000Z'),
    message: { role: 'assistant', content },
    done,
    done_reason: done ? 'stop' : '',
    total_duration: done ? 10 : 0,
    load_duration: 0,
    prompt_eval_count: 0,
    prompt_eval_duration: 0,
    eval_count: done ? 1 : 0,
    eval_duration: 0,
  };
}

function createProviderStream(values: ChatResponse[]) {
  const abort = jest.fn();
  return {
    abort,
    async *[Symbol.asyncIterator]() {
      for (const value of values) {
        yield value;
      }
    },
  };
}

test('creates a host client and streams a complete AG-UI run', async () => {
  resetOllamaMock();
  const providerStream = createProviderStream([
    createChunk('Hello'),
    createChunk('', true),
  ]);
  const chat = jest.fn().mockResolvedValue(providerStream);
  const abort = jest.fn();
  MockedOllama.mockImplementationOnce(
    () => ({ chat, abort }) as unknown as Ollama,
  );

  const result = await Array.fromAsync(
    text({
      host: 'http://ollama:11434',
      model: 'qwen3',
      input: createInput(),
    }),
  );

  expect(MockedOllama).toHaveBeenCalledWith({
    host: 'http://ollama:11434',
  });
  expect(chat).toHaveBeenCalledWith({
    stream: true,
    model: 'qwen3',
    messages: [{ role: 'user', content: 'Hello' }],
  });
  expect(result.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.TEXT_MESSAGE_START,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.RAW,
    EventType.TEXT_MESSAGE_END,
    EventType.RUN_FINISHED,
  ]);
});

test('uses an explicit client instead of constructing a host client', async () => {
  resetOllamaMock();
  const chat = jest
    .fn()
    .mockResolvedValue(createProviderStream([createChunk('', true)]));
  const client = { chat, abort: jest.fn() } as unknown as Ollama;

  await Array.fromAsync(
    text({
      client,
      host: 'http://ignored:11434',
      model: 'qwen3',
      input: createInput(),
    }),
  );

  expect(chat).toHaveBeenCalledTimes(1);
  expect(MockedOllama).not.toHaveBeenCalled();
});

test('passes transformed request options to Ollama', async () => {
  resetOllamaMock();
  const chat = jest
    .fn()
    .mockResolvedValue(createProviderStream([createChunk('', true)]));
  MockedOllama.mockImplementationOnce(
    () => ({ chat, abort: jest.fn() }) as unknown as Ollama,
  );

  await Array.fromAsync(
    text({
      model: 'gpt-oss:20b',
      input: createInput(),
      transformRequestOptions: async (request) => ({
        ...request,
        think: 'high',
        options: { temperature: 0 },
      }),
    }),
  );

  expect(chat).toHaveBeenCalledWith(
    expect.objectContaining({
      model: 'gpt-oss:20b',
      think: 'high',
      options: { temperature: 0 },
    }),
  );
});

test('maps request and provider failures to one RUN_ERROR event', async () => {
  resetOllamaMock();
  const chat = jest.fn().mockRejectedValue(new Error('provider unavailable'));
  MockedOllama.mockImplementationOnce(
    () => ({ chat, abort: jest.fn() }) as unknown as Ollama,
  );

  const result = await Array.fromAsync(
    text({ model: 'qwen3', input: createInput() }),
  );

  expect(result).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-ollama',
      runId: 'run-ollama',
    },
    { type: EventType.RUN_ERROR, message: 'provider unavailable' },
  ]);
});

test('does not start an Ollama request when already aborted', async () => {
  resetOllamaMock();
  const controller = new AbortController();
  controller.abort();

  const result = await Array.fromAsync(
    text({
      model: 'qwen3',
      input: createInput(),
      signal: controller.signal,
    }),
  );

  expect(result).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-ollama',
      runId: 'run-ollama',
    },
  ]);
  expect(MockedOllama).not.toHaveBeenCalled();
});

test('aborts an owned client while waiting for its stream', async () => {
  resetOllamaMock();
  const abort = jest.fn();
  let resolveStream!: (stream: ReturnType<typeof createProviderStream>) => void;
  const chat = jest.fn(
    () =>
      new Promise<ReturnType<typeof createProviderStream>>((resolve) => {
        resolveStream = resolve;
      }),
  );
  MockedOllama.mockImplementationOnce(
    () => ({ chat, abort }) as unknown as Ollama,
  );
  const controller = new AbortController();
  const iterator = text({
    model: 'qwen3',
    input: createInput(),
    signal: controller.signal,
  })[Symbol.asyncIterator]();

  await iterator.next();
  const pending = iterator.next();
  await Promise.resolve();
  controller.abort();
  await Promise.resolve();

  expect(abort).toHaveBeenCalledTimes(1);
  resolveStream(createProviderStream([]));
  await expect(pending).resolves.toEqual({ done: true, value: undefined });
});

test('does not globally abort an explicit client while waiting for its stream', async () => {
  resetOllamaMock();
  const abort = jest.fn();
  let resolveStream!: (stream: ReturnType<typeof createProviderStream>) => void;
  const chat = jest.fn(
    () =>
      new Promise<ReturnType<typeof createProviderStream>>((resolve) => {
        resolveStream = resolve;
      }),
  );
  const client = { chat, abort } as unknown as Ollama;
  const controller = new AbortController();
  const iterator = text({
    client,
    model: 'qwen3',
    input: createInput(),
    signal: controller.signal,
  })[Symbol.asyncIterator]();

  await iterator.next();
  const pending = iterator.next();
  await Promise.resolve();
  controller.abort();
  await Promise.resolve();

  expect(abort).not.toHaveBeenCalled();
  resolveStream(createProviderStream([]));
  await expect(pending).resolves.toEqual({ done: true, value: undefined });
});

function createDoneChunk(overrides: Partial<ChatResponse> = {}): ChatResponse {
  return { ...createChunk('', true), ...overrides };
}

async function runWith(chunks: ChatResponse[]) {
  resetOllamaMock();
  const chat = jest.fn().mockResolvedValue(createProviderStream(chunks));
  const client = { chat, abort: jest.fn() } as unknown as Ollama;

  return Array.fromAsync(
    text({ client, model: 'qwen3', input: createInput() }),
  );
}

function finished(metadata: Record<string, unknown>, usage?: unknown[]) {
  return {
    type: EventType.RUN_FINISHED,
    threadId: 'thread-ollama',
    runId: 'run-ollama',
    ...(usage ? { usage } : {}),
    metadata,
  };
}

test('ends a completed run with its usage and a stop reason', async () => {
  const chunks = [
    createChunk('Hello.'),
    createDoneChunk({
      model: 'qwen3:8b',
      done_reason: 'stop',
      prompt_eval_count: 120,
      eval_count: 40,
    }),
  ];

  const events = await runWith(chunks);

  expect(events.at(-2)?.type).toBe(EventType.TEXT_MESSAGE_END);
  expect(events.at(-1)).toEqual(
    finished(
      { hashbrown: { finishReason: 'stop' }, ollama: { doneReason: 'stop' } },
      [
        {
          provider: 'ollama',
          model: 'qwen3:8b',
          inputTokens: 120,
          outputTokens: 40,
          totalTokens: 160,
        },
      ],
    ),
  );
});

test('reports tool_calls when the model called a tool and stopped', async () => {
  const chunks = [
    {
      ...createChunk(''),
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [{ function: { name: 'lookup', arguments: {} } }],
      },
    },
    createDoneChunk({
      done_reason: 'stop',
      prompt_eval_count: 5,
      eval_count: 7,
    }),
  ];

  const events = await runWith(chunks);

  expect(events.at(-1)).toEqual(
    finished(
      {
        hashbrown: { finishReason: 'tool_calls' },
        ollama: { doneReason: 'stop' },
      },
      [
        {
          provider: 'ollama',
          model: 'qwen3',
          inputTokens: 5,
          outputTokens: 7,
          totalTokens: 12,
        },
      ],
    ),
  );
});

test.each([
  { reason: 'length', finishReason: 'length' },
  { reason: 'load', finishReason: 'other' },
  { reason: 'unload', finishReason: 'other' },
  { reason: 'something_new', finishReason: 'other' },
])(
  'finishes a run that ended with $reason as $finishReason',
  async ({ reason, finishReason }) => {
    const chunks = [
      createChunk('Cut off'),
      createDoneChunk({
        done_reason: reason,
        prompt_eval_count: 10,
        eval_count: 300,
      }),
    ];

    const events = await runWith(chunks);

    expect(events.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.RAW,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);
    expect(events.at(-1)).toEqual(
      finished(
        { hashbrown: { finishReason }, ollama: { doneReason: reason } },
        [
          {
            provider: 'ollama',
            model: 'qwen3',
            inputTokens: 10,
            outputTokens: 300,
            totalTokens: 310,
          },
        ],
      ),
    );
  },
);

test('omits input tokens when a cached prompt reports no prompt count', async () => {
  const done = createDoneChunk({ done_reason: 'stop', eval_count: 9 });
  delete (done as Partial<ChatResponse>).prompt_eval_count;

  const events = await runWith([createChunk('Hi'), done]);

  expect(events.at(-1)).toEqual(
    finished(
      { hashbrown: { finishReason: 'stop' }, ollama: { doneReason: 'stop' } },
      [{ provider: 'ollama', model: 'qwen3', outputTokens: 9 }],
    ),
  );
});

test('omits usage when Ollama reports no token counts', async () => {
  const done = createDoneChunk({ done_reason: 'stop' });
  delete (done as Partial<ChatResponse>).prompt_eval_count;
  delete (done as Partial<ChatResponse>).eval_count;

  const events = await runWith([createChunk('Hi'), done]);

  expect(events.at(-1)).toEqual(
    finished({
      hashbrown: { finishReason: 'stop' },
      ollama: { doneReason: 'stop' },
    }),
  );
});

test('keeps the final chunk as a RAW event before finishing', async () => {
  const done = createDoneChunk({ done_reason: 'stop', eval_count: 3 });

  const events = await runWith([createChunk('Hi'), done]);

  expect(events.find((event) => event.type === EventType.RAW)).toEqual({
    type: EventType.RAW,
    source: 'ollama',
    event: done,
  });
});

test('cancels the owned HTTP request before Ollama returns response headers', async () => {
  resetOllamaMock();
  const controller = new AbortController();
  let requestSignal: AbortSignal | null | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = jest.fn((_url, init) => {
    requestSignal = init?.signal;
    return new Promise<Response>((_resolve, reject) => {
      requestSignal?.addEventListener(
        'abort',
        () => reject(new Error('aborted')),
        { once: true },
      );
    });
  });
  const ActualOllama =
    jest.requireActual<typeof import('ollama')>('ollama').Ollama;
  MockedOllama.mockImplementationOnce((config) => new ActualOllama(config));

  try {
    const iterator = text({
      model: 'qwen3',
      input: createInput(),
      signal: controller.signal,
    })[Symbol.asyncIterator]();
    await iterator.next();
    const pending = iterator.next();
    await Promise.resolve();
    controller.abort();
    await pending;

    expect(requestSignal?.aborted).toBe(true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('settles cancellation before a shared client returns its stream and aborts that late stream', async () => {
  resetOllamaMock();
  const controller = new AbortController();
  const lateStream = createProviderStream([]);
  let resolveStream!: (stream: typeof lateStream) => void;
  const chat = jest.fn(
    () =>
      new Promise<typeof lateStream>((resolve) => {
        resolveStream = resolve;
      }),
  );
  const abort = jest.fn();
  const client = { chat, abort } as unknown as Ollama;
  const iterator = text({
    client,
    model: 'qwen3',
    input: createInput(),
    signal: controller.signal,
  })[Symbol.asyncIterator]();
  await iterator.next();
  const pending = iterator.next();
  let settled = false;
  void pending.then(() => {
    settled = true;
  });

  await Promise.resolve();
  controller.abort();
  for (let index = 0; index < 30; index += 1) await Promise.resolve();
  const settledBeforeResponse = settled;
  resolveStream(lateStream);
  await pending;
  for (let index = 0; index < 10; index += 1) await Promise.resolve();

  expect(settledBeforeResponse).toBe(true);
  expect(abort).not.toHaveBeenCalled();
  expect(lateStream.abort).toHaveBeenCalledTimes(1);
});
