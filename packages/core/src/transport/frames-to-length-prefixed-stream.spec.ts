import { framesToLengthPrefixedStream } from './frames-to-length-prefixed-stream';
import { decodeFrames } from '../frames/decode-frames';
import { Frame } from '../frames';

test('appends a finish frame when generator completes', async () => {
  const frames = async function* (): AsyncGenerator<Frame> {
    yield {
      type: 'chunk',
      chunk: {
        choices: [
          {
            index: 0,
            delta: {
              role: 'assistant',
              content: 'Hello',
            },
            finishReason: null,
          },
        ],
      },
    };
  };

  const stream = framesToLengthPrefixedStream(frames());
  const decoded: Frame[] = [];
  const abortController = new AbortController();

  for await (const frame of decodeFrames(stream, {
    signal: abortController.signal,
  })) {
    decoded.push(frame);
  }

  expect(decoded[0]?.type).toBe('chunk');
  expect(decoded.at(-1)?.type).toBe('finish');
});

test('propagates generator errors', async () => {
  // eslint-disable-next-line require-yield
  const frames = async function* (): AsyncGenerator<Frame> {
    throw new Error('boom');
  };

  const stream = framesToLengthPrefixedStream(frames());
  const abortController = new AbortController();

  await expect(async () => {
    for await (const frame of decodeFrames(stream, {
      signal: abortController.signal,
    })) {
      expect(frame).toBeDefined();
    }
  }).rejects.toThrow('boom');
});
