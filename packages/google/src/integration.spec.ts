import { resolve } from 'node:path';
import type { Chat, Frame, GenerationChunkFrame } from '@hashbrownai/core';
import {
  type AimockHandle,
  runProviderTextWithAimock,
} from '@hashbrownai/testing/aimock';
import { HashbrownGoogle } from './index';

const GOOGLE_MODEL = 'gemini-2.5-flash';
const GOOGLE_BASE_URL_ENV = 'HASHBROWN_GOOGLE_API_BASE_URL';

function fixturePath(name: string): string {
  return resolve(__dirname, '../../../tools/testing/aimock/fixtures', name);
}

function generationChunks(frames: Frame[]): GenerationChunkFrame[] {
  return frames.filter(
    (frame): frame is GenerationChunkFrame => frame.type === 'generation-chunk',
  );
}

function streamedContent(frames: Frame[]): string {
  return generationChunks(frames)
    .map((frame) => frame.chunk.choices[0]?.delta.content ?? '')
    .join('');
}

function baseRequest(userMessage: string): Chat.Api.CompletionCreateParams {
  return {
    operation: 'generate',
    model: GOOGLE_MODEL,
    system: 'You are a deterministic test assistant.',
    messages: [{ role: 'user', content: userMessage }],
  };
}

async function consumeProviderStream(
  stream: AsyncIterable<Uint8Array>,
): Promise<void> {
  for await (const chunk of stream) {
    void chunk;
  }
}

async function* googleTextWithAimock(
  aimock: AimockHandle,
  createStream: () => AsyncIterable<Uint8Array>,
): AsyncIterable<Uint8Array> {
  const previousBaseUrl = process.env[GOOGLE_BASE_URL_ENV];
  process.env[GOOGLE_BASE_URL_ENV] = aimock.url;

  try {
    yield* createStream();
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env[GOOGLE_BASE_URL_ENV];
    } else {
      process.env[GOOGLE_BASE_URL_ENV] = previousBaseUrl;
    }
  }
}

test('Google JSON response format mode requests JSON without a schema', async () => {
  let capturedConfig: unknown;

  await consumeProviderStream(
    HashbrownGoogle.stream.text({
      apiKey: 'test-api-key',
      request: {
        ...baseRequest('Hello'),
        system: 'Respond with JSON.',
        responseFormatMode: 'json',
      },
      transformRequestOptions: (options) => {
        capturedConfig = options.config;
        throw new Error('stop');
      },
    }),
  );

  expect(capturedConfig).toEqual(
    expect.objectContaining({
      responseMimeType: 'application/json',
      responseJsonSchema: undefined,
    }),
  );
});

test('Google text streaming emits Hashbrown generation frames', async () => {
  const frames = await runProviderTextWithAimock({
    fixturePath: fixturePath('text.json'),
    createStream: (aimock) =>
      googleTextWithAimock(aimock, () =>
        HashbrownGoogle.stream.text({
          apiKey: 'test-not-used',
          request: baseRequest('say hi briefly'),
        }),
      ),
  });

  expect(frames[0].type).toBe('generation-start');
  expect(frames.at(-1)?.type).toBe('generation-finish');
  expect(streamedContent(frames)).toBe('Hello from aimock.');
});

test('Google streaming preserves chunked content across multiple frames', async () => {
  const frames = await runProviderTextWithAimock({
    fixturePath: fixturePath('streaming.json'),
    createStream: (aimock) =>
      googleTextWithAimock(aimock, () =>
        HashbrownGoogle.stream.text({
          apiKey: 'test-not-used',
          request: baseRequest('stream deterministic text'),
        }),
      ),
  });

  expect(generationChunks(frames).length).toBeGreaterThan(1);
  expect(streamedContent(frames)).toContain(
    'Streaming fixture response with enough text',
  );
});

test('Google tool calling emits tool call deltas', async () => {
  const frames = await runProviderTextWithAimock({
    fixturePath: fixturePath('tool-call.json'),
    createStream: (aimock) =>
      googleTextWithAimock(aimock, () =>
        HashbrownGoogle.stream.text({
          apiKey: 'test-not-used',
          request: {
            ...baseRequest('call the lookup tool'),
            tools: [
              {
                name: 'lookup',
                description: 'Lookup deterministic fixture data.',
                parameters: {
                  type: 'object',
                  properties: {
                    query: { type: 'string' },
                  },
                  required: ['query'],
                },
              },
            ],
            toolChoice: 'required',
          },
        }),
      ),
  });

  const toolCallDeltas = generationChunks(frames).flatMap(
    (frame) => frame.chunk.choices[0]?.delta.toolCalls ?? [],
  );

  expect(toolCallDeltas.some((toolCall) => toolCall.id)).toBe(true);
  expect(
    toolCallDeltas.some((toolCall) => toolCall.function?.name === 'lookup'),
  ).toBe(true);
  expect(
    toolCallDeltas
      .map((toolCall) => toolCall.function?.arguments ?? '')
      .join(''),
  ).toContain('"query":"hashbrown"');
});

test('Google structured output emits JSON text content', async () => {
  const frames = await runProviderTextWithAimock({
    fixturePath: fixturePath('structured-output.json'),
    createStream: (aimock) =>
      googleTextWithAimock(aimock, () =>
        HashbrownGoogle.stream.text({
          apiKey: 'test-not-used',
          request: {
            ...baseRequest('return structured output'),
            responseFormat: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                ok: { type: 'boolean' },
              },
              required: ['text', 'ok'],
            },
          },
        }),
      ),
  });

  expect(JSON.parse(streamedContent(frames))).toEqual({
    text: 'Hello from structured aimock.',
    ok: true,
  });
});

test('Google provider errors emit generation-error frames', async () => {
  const frames = await runProviderTextWithAimock({
    fixturePath: fixturePath('error.json'),
    createStream: (aimock) =>
      googleTextWithAimock(aimock, () =>
        HashbrownGoogle.stream.text({
          apiKey: 'test-not-used',
          request: baseRequest('return provider error'),
        }),
      ),
  });

  expect(frames).toEqual([
    expect.objectContaining({
      type: 'generation-error',
      error: expect.stringContaining('Deterministic provider error'),
    }),
  ]);
});

test('Google thread persistence wraps generation with thread frames', async () => {
  const savedThreads: Chat.Api.Message[][] = [];
  const frames = await runProviderTextWithAimock({
    fixturePath: fixturePath('text.json'),
    createStream: (aimock) =>
      googleTextWithAimock(aimock, () =>
        HashbrownGoogle.stream.text({
          apiKey: 'test-not-used',
          request: {
            ...baseRequest('say hi briefly'),
            threadId: 'google-thread',
          },
          loadThread: async () => [
            {
              role: 'user',
              content: 'previous message',
            },
          ],
          saveThread: async (thread) => {
            savedThreads.push(thread);
            return 'google-thread';
          },
        }),
      ),
  });

  expect(frames.map((frame) => frame.type)).toEqual([
    'thread-load-start',
    'thread-load-success',
    'generation-start',
    ...generationChunks(frames).map((frame) => frame.type),
    'generation-finish',
    'thread-save-start',
    'thread-save-success',
  ]);
  expect(savedThreads).toHaveLength(1);
  expect(savedThreads[0].map((message) => message.content)).toContain(
    'Hello from aimock.',
  );
});
