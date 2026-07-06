import { resolve } from 'node:path';
import type { Chat, Frame, GenerationChunkFrame } from '@hashbrownai/core';
import { runProviderTextWithAimock } from '@hashbrownai/testing/aimock';
import { HashbrownAnthropic } from './index';

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

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

function baseRequest(
  userMessage: string,
): Chat.Api.CompletionCreateParams {
  return {
    operation: 'generate',
    model: ANTHROPIC_MODEL,
    system: 'You are a deterministic test assistant.',
    messages: [{ role: 'user', content: userMessage }],
  };
}

test('Anthropic text streaming emits Hashbrown generation frames', async () => {
  const frames = await runProviderTextWithAimock({
    fixturePath: fixturePath('text.json'),
    createStream: (aimock) =>
      HashbrownAnthropic.stream.text({
        apiKey: 'test-not-used',
        baseURL: aimock.anthropicBaseUrl,
        request: baseRequest('say hi briefly'),
      }),
  });

  expect(frames[0].type).toBe('generation-start');
  expect(frames.at(-1)?.type).toBe('generation-finish');
  expect(streamedContent(frames)).toBe('Hello from aimock.');
});

test('Anthropic streaming preserves chunked content across multiple frames', async () => {
  const frames = await runProviderTextWithAimock({
    fixturePath: fixturePath('streaming.json'),
    createStream: (aimock) =>
      HashbrownAnthropic.stream.text({
        apiKey: 'test-not-used',
        baseURL: aimock.anthropicBaseUrl,
        request: baseRequest('stream deterministic text'),
      }),
  });

  expect(generationChunks(frames).length).toBeGreaterThan(1);
  expect(streamedContent(frames)).toContain(
    'Streaming fixture response with enough text',
  );
});

test('Anthropic tool calling emits tool call deltas', async () => {
  const frames = await runProviderTextWithAimock({
    fixturePath: fixturePath('tool-call.json'),
    createStream: (aimock) =>
      HashbrownAnthropic.stream.text({
        apiKey: 'test-not-used',
        baseURL: aimock.anthropicBaseUrl,
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
    toolCallDeltas.some(
      (toolCall) => toolCall.function?.name === 'lookup',
    ),
  ).toBe(true);
  expect(
    toolCallDeltas
      .map((toolCall) => toolCall.function?.arguments ?? '')
      .join(''),
  ).toContain('"query":"hashbrown"');
});

test('Anthropic structured output fixture emits JSON text content', async () => {
  const frames = await runProviderTextWithAimock({
    fixturePath: fixturePath('structured-output.json'),
    createStream: (aimock) =>
      HashbrownAnthropic.stream.text({
        apiKey: 'test-not-used',
        baseURL: aimock.anthropicBaseUrl,
        request: baseRequest('return structured output'),
      }),
  });

  expect(JSON.parse(streamedContent(frames))).toEqual({
    text: 'Hello from structured aimock.',
    ok: true,
  });
});

test('Anthropic provider errors emit generation-error frames', async () => {
  const frames = await runProviderTextWithAimock({
    fixturePath: fixturePath('error.json'),
    createStream: (aimock) =>
      HashbrownAnthropic.stream.text({
        apiKey: 'test-not-used',
        baseURL: aimock.anthropicBaseUrl,
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

test('Anthropic thread persistence wraps generation with thread frames', async () => {
  const savedThreads: Chat.Api.Message[][] = [];
  const frames = await runProviderTextWithAimock({
    fixturePath: fixturePath('text.json'),
    createStream: (aimock) =>
      HashbrownAnthropic.stream.text({
        apiKey: 'test-not-used',
        baseURL: aimock.anthropicBaseUrl,
        request: {
          ...baseRequest('say hi briefly'),
          threadId: 'anthropic-thread',
        },
        loadThread: async () => [
          {
            role: 'user',
            content: 'previous message',
          },
        ],
        saveThread: async (thread) => {
          savedThreads.push(thread);
          return 'anthropic-thread';
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
