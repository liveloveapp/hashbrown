import { resolve } from 'node:path';
import type { Chat, Frame, GenerationChunkFrame } from '@hashbrownai/core';
import { runProviderTextWithAimock } from '@hashbrownai/testing/aimock';
import { HashbrownAzure } from './index';
import type { AzureCompletionCreateParams } from './stream/text.fn';

const AZURE_MODEL = 'gpt-4o@2025-01-01-preview';

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

function baseRequest(userMessage: string): AzureCompletionCreateParams {
  return {
    operation: 'generate',
    model: AZURE_MODEL,
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

test('Azure JSON response format mode requests JSON object output', async () => {
  let capturedResponseFormat: unknown;

  await consumeProviderStream(
    HashbrownAzure.stream.text({
      apiKey: 'test-api-key',
      endpoint: 'https://example.openai.azure.com/',
      request: {
        ...baseRequest('Hello'),
        system: 'Respond with JSON.',
        responseFormatMode: 'json',
      },
      transformRequestOptions: (options) => {
        capturedResponseFormat = options.response_format;
        throw new Error('stop');
      },
    }),
  );

  expect(capturedResponseFormat).toEqual({ type: 'json_object' });
});

test('Azure OpenAI text streaming emits Hashbrown generation frames', async () => {
  const frames = await runProviderTextWithAimock({
    fixturePath: fixturePath('text.json'),
    createStream: (aimock) =>
      HashbrownAzure.stream.text({
        apiKey: 'test-not-used',
        endpoint: aimock.url,
        request: baseRequest('say hi briefly'),
      }),
  });

  expect(frames[0].type).toBe('generation-start');
  expect(frames.at(-1)?.type).toBe('generation-finish');
  expect(streamedContent(frames)).toBe('Hello from aimock.');
});

test('Azure OpenAI streaming preserves chunked content across multiple frames', async () => {
  const frames = await runProviderTextWithAimock({
    fixturePath: fixturePath('streaming.json'),
    createStream: (aimock) =>
      HashbrownAzure.stream.text({
        apiKey: 'test-not-used',
        endpoint: aimock.url,
        request: baseRequest('stream deterministic text'),
      }),
  });

  expect(generationChunks(frames).length).toBeGreaterThan(1);
  expect(streamedContent(frames)).toContain(
    'Streaming fixture response with enough text',
  );
});

test('Azure OpenAI tool calling emits tool call deltas', async () => {
  const frames = await runProviderTextWithAimock({
    fixturePath: fixturePath('tool-call.json'),
    createStream: (aimock) =>
      HashbrownAzure.stream.text({
        apiKey: 'test-not-used',
        endpoint: aimock.url,
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

test('Azure OpenAI structured output emits JSON text content', async () => {
  const frames = await runProviderTextWithAimock({
    fixturePath: fixturePath('structured-output.json'),
    createStream: (aimock) =>
      HashbrownAzure.stream.text({
        apiKey: 'test-not-used',
        endpoint: aimock.url,
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
  });

  expect(JSON.parse(streamedContent(frames))).toEqual({
    text: 'Hello from structured aimock.',
    ok: true,
  });
});

test('Azure OpenAI provider errors emit generation-error frames', async () => {
  const frames = await runProviderTextWithAimock({
    fixturePath: fixturePath('error.json'),
    createStream: (aimock) =>
      HashbrownAzure.stream.text({
        apiKey: 'test-not-used',
        endpoint: aimock.url,
        request: baseRequest('return provider error'),
      }),
  });

  expect(frames).toEqual([
    { type: 'generation-start' },
    expect.objectContaining({
      type: 'generation-error',
      error: expect.stringContaining('Deterministic provider error'),
    }),
  ]);
});

test('Azure OpenAI thread persistence wraps generation with thread frames', async () => {
  const savedThreads: Chat.Api.Message[][] = [];
  const frames = await runProviderTextWithAimock({
    fixturePath: fixturePath('text.json'),
    createStream: (aimock) =>
      HashbrownAzure.stream.text({
        apiKey: 'test-not-used',
        endpoint: aimock.url,
        request: {
          ...baseRequest('say hi briefly'),
          threadId: 'azure-thread',
        },
        loadThread: async () => [
          {
            role: 'user',
            content: 'previous message',
          },
        ],
        saveThread: async (thread) => {
          savedThreads.push(thread);
          return 'azure-thread';
        },
      }),
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
