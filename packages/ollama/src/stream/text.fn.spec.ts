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
