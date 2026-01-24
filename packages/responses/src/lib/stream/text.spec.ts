import type { Chat } from '@hashbrownai/core';

import { text } from './text.fn';

const streamFromChunks = (chunks: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  const encodedChunks = chunks.map((chunk) => encoder.encode(chunk));

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of encodedChunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
};

const decodeFrame = (chunk: Uint8Array): Record<string, unknown> => {
  const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  const length = view.getUint32(0, false);
  const payload = chunk.slice(4, 4 + length);
  const json = new TextDecoder().decode(payload);

  return JSON.parse(json) as Record<string, unknown>;
};

const collectFrames = async (
  stream: AsyncIterable<Uint8Array>,
): Promise<Record<string, unknown>[]> => {
  const frames: Record<string, unknown>[] = [];

  for await (const chunk of stream) {
    frames.push(decodeFrame(chunk));
  }

  return frames;
};

test('posts mapped request to /v1/responses and applies transforms', async () => {
  const fetchMock = jest.fn<
    Promise<Response>,
    [RequestInfo | URL, RequestInit?]
  >(
    async () =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: streamFromChunks(['data: [DONE]\n\n']),
      }) as Response,
  );

  const request: Chat.Api.CompletionCreateParams = {
    operation: 'generate',
    model: 'gpt-4',
    system: 'system',
    messages: [
      {
        role: 'user',
        content: 'Hello',
      },
    ],
    toolChoice: 'auto',
    tools: [
      {
        name: 'getWeather',
        description: 'Get weather',
        parameters: {
          type: 'object',
          properties: {
            city: { type: 'string' },
          },
          required: ['city'],
        },
      },
    ],
    responseFormat: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
      },
    },
  };

  const frames = await collectFrames(
    text({
      baseURL: 'https://api.example.com/',
      apiKey: 'test-key',
      headers: {
        'X-Test': 'true',
      },
      request,
      transformRequestOptions: (options) => ({
        ...options,
        tool_choice: 'required',
      }),
      fetchImpl: fetchMock as unknown as typeof fetch,
    }),
  );

  expect(frames).toEqual([]);
  expect(fetchMock).toHaveBeenCalledTimes(1);

  const call = fetchMock.mock.calls[0];
  if (!call) {
    throw new Error('Expected fetch to be called.');
  }

  const url = call[0];
  const init = call[1] as RequestInit | undefined;

  expect(url).toBe('https://api.example.com/v1/responses');
  expect(init?.method).toBe('POST');
  expect(init?.headers).toEqual({
    Accept: 'text/event-stream',
    Authorization: 'Bearer test-key',
    'Content-Type': 'application/json',
    'X-Test': 'true',
  });

  const parsedBody = JSON.parse(init?.body as string);
  expect(parsedBody).toEqual({
    model: 'gpt-4',
    instructions: 'system',
    input: [
      {
        type: 'message',
        role: 'user',
        content: 'Hello',
      },
    ],
    tools: [
      {
        type: 'function',
        name: 'getWeather',
        description: 'Get weather',
        parameters: {
          type: 'object',
          properties: {
            city: { type: 'string' },
          },
          required: ['city'],
        },
      },
    ],
    tool_choice: 'required',
    response_format: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
      },
    },
    stream: true,
  });
});

test('streams frames from SSE payloads', async () => {
  const fetchMock = jest.fn<
    Promise<Response>,
    [RequestInfo | URL, RequestInit?]
  >(
    async () =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: streamFromChunks([
          'event: response.created\n',
          'data: {"response":{"id":"resp_1"}}\n\n',
          'event: response.output_text.delta\n',
          'data: {"item_id":"item_1","output_index":0,"content_index":0,"delta":"Hello"}\n\n',
          'event: response.completed\n',
          'data: {"response":{"id":"resp_1","status":"completed"}}\n\n',
          'event: response.output_text.delta\n',
          'data: {"item_id":"item_2","output_index":1,"content_index":0,"delta":"Ignored"}\n\n',
        ]),
      }) as Response,
  );

  const request: Chat.Api.CompletionCreateParams = {
    operation: 'generate',
    model: 'gpt-4',
    system: 'system',
    messages: [],
  };

  const frames = await collectFrames(
    text({
      baseURL: 'https://api.example.com',
      request,
      fetchImpl: fetchMock as unknown as typeof fetch,
    }),
  );

  expect(frames).toEqual([
    {
      type: 'response.created',
      response: { id: 'resp_1' },
    },
    {
      type: 'response.output_text.delta',
      itemId: 'item_1',
      outputIndex: 0,
      contentIndex: 0,
      delta: 'Hello',
    },
    {
      type: 'response.completed',
      response: { id: 'resp_1', status: 'completed' },
    },
  ]);
});
