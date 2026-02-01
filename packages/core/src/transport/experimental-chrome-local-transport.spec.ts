import { ExperimentalChromeLocalTransport } from './experimental-chrome-local-transport';
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
  const transport = new ExperimentalChromeLocalTransport({});

  const sendPromise = transport.send({
    params,
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: 'test',
  });

  await expect(sendPromise).rejects.toMatchObject({
    code: 'PLATFORM_UNSUPPORTED',
  });
});

test('streams frames from the Prompt API', async () => {
  const promptStream = new ReadableStream<string>({
    start(controller) {
      controller.enqueue('Hello');
      controller.enqueue(' world');
      controller.close();
    },
  });

  const session = {
    prompt: jest.fn(),
    promptStreaming: jest.fn().mockResolvedValue(promptStream),
    destroy: jest.fn(),
  };

  const availability = jest.fn().mockResolvedValue({ status: 'available' });
  const create = jest.fn().mockResolvedValue(session);
  (globalThis as { LanguageModel?: unknown }).LanguageModel = {
    availability,
    create,
  };

  const transport = new ExperimentalChromeLocalTransport({});

  const response = await transport.send({
    params,
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: 'stream-test',
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
});

test('rejects tool calls as FEATURE_UNSUPPORTED', async () => {
  (globalThis as { LanguageModel?: unknown }).LanguageModel = {
    availability: jest.fn().mockResolvedValue({ status: 'available' }),
    create: jest.fn().mockResolvedValue({
      prompt: jest.fn(),
      promptStreaming: jest.fn(),
    }),
  };
  const transport = new ExperimentalChromeLocalTransport({});

  const sendPromise = transport.send({
    params: {
      ...params,
      tools: [
        {
          name: 'test',
          description: 'test',
          parameters: {},
        },
      ],
    },
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: 'tools',
  });

  await expect(sendPromise).rejects.toMatchObject({
    code: 'FEATURE_UNSUPPORTED',
  });
});
