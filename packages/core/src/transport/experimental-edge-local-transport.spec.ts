import { ExperimentalEdgeLocalTransport } from './experimental-edge-local-transport';
import { Chat } from '../models';
import { Frame } from '../frames';

const params: Chat.Api.CompletionCreateParams = {
  operation: 'generate',
  model: '' as Chat.Api.CompletionCreateParams['model'],
  system: 'system',
  messages: [
    {
      role: 'user',
      content: 'Hello',
    },
  ],
};

afterEach(() => {
  delete (globalThis as { LanguageModel?: unknown }).LanguageModel;
});

test('throws PLATFORM_UNSUPPORTED when the Prompt API is missing', async () => {
  const transport = new ExperimentalEdgeLocalTransport({});

  const sendPromise = transport.send({
    params,
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: 'edge-missing',
  });

  await expect(sendPromise).rejects.toMatchObject({
    code: 'PLATFORM_UNSUPPORTED',
  });
});

test('streams frames from the Prompt API', async () => {
  const promptStream = new ReadableStream<string>({
    start(controller) {
      controller.enqueue('Edge hello');
      controller.enqueue(' world');
      controller.close();
    },
  });

  const session = {
    prompt: jest.fn(),
    promptStreaming: jest.fn().mockResolvedValue(promptStream),
    destroy: jest.fn(),
  };

  const availability = jest.fn().mockResolvedValue('available');
  const create = jest.fn().mockResolvedValue(session);
  (globalThis as { LanguageModel?: unknown }).LanguageModel = {
    availability,
    create,
  };

  const transport = new ExperimentalEdgeLocalTransport({});

  const response = await transport.send({
    params,
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: 'edge-stream',
  });

  const frames = response.frames;
  const collected: Frame[] = [];

  if (frames) {
    for await (const frame of frames) {
      collected.push(frame);
    }
  }

  expect(session.promptStreaming).toHaveBeenCalledTimes(1);
  expect(
    collected.filter((frame) => frame.type === 'generation-chunk'),
  ).toHaveLength(2);
  expect(collected.at(-1)?.type).toBe('generation-finish');
  expect(response.metadata?.['status']).toBe('available');
});

test('emits download progress via monitor when provided', async () => {
  const promptStream = new ReadableStream<string>({
    start(controller) {
      controller.close();
    },
  });

  const session = {
    prompt: jest.fn(),
    promptStreaming: jest.fn().mockResolvedValue(promptStream),
    destroy: jest.fn(),
  };

  const create = jest.fn(
    async (options?: { monitor?: (m: unknown) => void }) => {
      const monitor = options?.monitor;
      if (monitor) {
        const listeners: Array<
          (event: { loaded: number; total: number }) => void
        > = [];
        monitor({
          addEventListener: (
            _type: 'downloadprogress',
            listener: (typeof listeners)[number],
          ) => {
            listeners.push(listener);
          },
        });
        listeners.forEach((listener) => listener({ loaded: 50, total: 100 }));
      }
      return session;
    },
  );

  const availability = jest.fn().mockResolvedValue('downloading');
  (globalThis as { LanguageModel?: unknown }).LanguageModel = {
    availability,
    create,
  };

  const onDownloadProgress = jest.fn();
  const transport = new ExperimentalEdgeLocalTransport({
    events: { downloadProgress: onDownloadProgress },
  });

  const response = await transport.send({
    params,
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: 'edge-progress',
  });

  // Drain frames to ensure promptStreaming is awaited.
  if (response.frames) {
    for await (const frame of response.frames) {
      void frame;
    }
  }

  expect(onDownloadProgress).toHaveBeenCalledWith(50);
  expect(response.metadata?.['status']).toBe('downloading');
});

test('invokes onDownloadRequired when availability is downloadable', async () => {
  const promptStream = new ReadableStream<string>({
    start(controller) {
      controller.close();
    },
  });

  const session = {
    prompt: jest.fn(),
    promptStreaming: jest.fn().mockResolvedValue(promptStream),
  };

  const availability = jest.fn().mockResolvedValue('downloadable');
  const create = jest.fn().mockResolvedValue(session);
  (globalThis as { LanguageModel?: unknown }).LanguageModel = {
    availability,
    create,
  };

  const onDownloadRequired = jest.fn();
  const transport = new ExperimentalEdgeLocalTransport({
    events: { downloadRequired: onDownloadRequired },
  });

  const response = await transport.send({
    params,
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: 'edge-download-required',
  });

  if (response.frames) {
    for await (const frame of response.frames) {
      void frame;
    }
  }

  expect(onDownloadRequired).toHaveBeenCalledWith('downloadable');
  expect(response.metadata?.['status']).toBe('downloadable');
});

test('moves system prompt into initialPrompts and strips it from streaming messages', async () => {
  const promptStream = new ReadableStream<string>({
    start(controller) {
      controller.close();
    },
  });

  const session = {
    prompt: jest.fn(),
    promptStreaming: jest.fn().mockResolvedValue(promptStream),
    destroy: jest.fn(),
  };

  const create = jest.fn().mockResolvedValue(session);
  (globalThis as { LanguageModel?: unknown }).LanguageModel = {
    create,
  };

  const transport = new ExperimentalEdgeLocalTransport({});

  const response = await transport.send({
    params,
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: 'edge-system',
  });

  if (response.frames) {
    for await (const frame of response.frames) {
      void frame;
    }
  }

  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      initialPrompts: [{ role: 'system', content: 'system' }],
    }),
  );

  expect(session.promptStreaming).toHaveBeenCalledWith(
    [{ role: 'user', content: 'Hello' }],
    expect.any(Object),
  );
});

test('cancels reader and destroys session on abort', async () => {
  const aborter = new AbortController();

  const cancel = jest.fn().mockResolvedValue(undefined);
  const read = jest
    .fn()
    .mockResolvedValueOnce({ value: 'chunk', done: false })
    .mockResolvedValueOnce({ value: undefined, done: true });
  const reader = { read, cancel, releaseLock: jest.fn() };
  const stream = { getReader: () => reader };

  const session = {
    prompt: jest.fn(),
    promptStreaming: jest
      .fn()
      .mockResolvedValue(stream as unknown as ReadableStream<string>),
    destroy: jest.fn(),
  };

  const create = jest.fn().mockResolvedValue(session);
  (globalThis as { LanguageModel?: unknown }).LanguageModel = {
    create,
  };

  const transport = new ExperimentalEdgeLocalTransport({});

  const response = await transport.send({
    params,
    signal: aborter.signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: 'edge-abort',
  });

  const frames = response.frames;
  if (!frames) {
    throw new Error('frames should be defined for abort test');
  }

  const first = await frames.next();
  expect(first.value?.type).toBe('generation-chunk');

  aborter.abort('stop');

  await expect(frames.next()).rejects.toMatchObject({
    code: 'PROMPT_API_ABORTED',
  });

  expect(cancel).toHaveBeenCalledTimes(1);
  expect(session.destroy).toHaveBeenCalledTimes(1);
});
