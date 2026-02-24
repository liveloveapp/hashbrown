import { parseSseStream } from './sse';

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

test('parses multiline data across chunk boundaries', async () => {
  const stream = streamFromChunks([
    'event: response.output_text.delta\n',
    'data: Hel',
    'lo\n',
    'data: wor',
    'ld\n\n',
  ]);
  const events: { event: string | null; data: string }[] = [];

  for await (const event of parseSseStream(stream)) {
    events.push(event);
  }

  expect(events).toEqual([
    {
      event: 'response.output_text.delta',
      data: 'Hello\nworld',
    },
  ]);
});

test('stops when the done sentinel is received', async () => {
  const stream = streamFromChunks([
    'data: first\n\n',
    'data: [DONE]\n\n',
    'data: after\n\n',
  ]);
  const events: { event: string | null; data: string }[] = [];

  for await (const event of parseSseStream(stream)) {
    events.push(event);
  }

  expect(events).toEqual([
    {
      event: null,
      data: 'first',
    },
  ]);
});
