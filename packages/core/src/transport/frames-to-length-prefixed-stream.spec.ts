import { framesToLengthPrefixedStream } from './frames-to-length-prefixed-stream';
import { decodeFrames } from '../frames/decode-frames';
import { encodeFrame, Frame } from '../frames';

test('appends a finish frame when generator completes', async () => {
  const frames = async function* (): AsyncGenerator<Frame> {
    yield {
      type: 'generation-chunk',
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

  expect(decoded[0]?.type).toBe('generation-chunk');
  // No implicit finish frame is appended; generator controls lifecycle.
  expect(decoded).toHaveLength(1);
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

test('decodes Japanese and Chinese frame content when UTF-8 bytes are split', async () => {
  const frame: Frame = {
    type: 'generation-chunk',
    chunk: {
      choices: [
        {
          index: 0,
          delta: {
            role: 'assistant',
            content: 'こんにちは、你好',
          },
          finishReason: null,
        },
      ],
    },
  };
  const encoded = encodeFrame(frame);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of encoded) {
        controller.enqueue(Uint8Array.of(byte));
      }
      controller.close();
    },
  });
  const abortController = new AbortController();
  const decoded: Frame[] = [];

  for await (const decodedFrame of decodeFrames(stream, {
    signal: abortController.signal,
  })) {
    decoded.push(decodedFrame);
  }

  expect(decoded).toEqual([frame]);
});
