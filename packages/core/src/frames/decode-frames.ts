/* eslint-disable @typescript-eslint/no-explicit-any */
import { Frame } from './frame-types';

/**
 * Decode options.
 *
 * @public
 */
export interface DecodeFramesOptions {
  signal: AbortSignal;
}

/**
 * Decode a ReadableStream\<Uint8Array\> of length-prefixed JSON frames into a stream of T.
 *
 * Frame format: [4-byte BE length][UTF-8 JSON payload]
 *
 * @public
 * @param stream - ReadableStream producing Uint8Array chunks
 * @param options - decoding options
 * @typeParam T - The type of the parsed JSON objects
 * @returns - A stream of parsed JSON objects of type T
 */
export async function* decodeFrames(
  stream: ReadableStream<Uint8Array>,
  options: DecodeFramesOptions,
): AsyncGenerator<Frame, void, unknown> {
  const { signal } = options;
  const reader = stream.getReader();
  const textDecoder = new TextDecoder();
  let buffer = new Uint8Array(0);

  signal.addEventListener(
    'abort',
    () => {
      reader.cancel().catch(() => {
        // ignore
      });
    },
    { once: true },
  );
  if (signal.aborted) {
    await reader.cancel();
    return;
  }

  try {
    while (true) {
      if (signal.aborted) {
        throw new Error('Decoding aborted');
      }

      const { value: chunk, done } = await reader.read();
      if (done) break;

      const newBuffer = new Uint8Array(buffer.length + chunk.length);
      newBuffer.set(buffer);
      newBuffer.set(chunk, buffer.length);
      buffer = newBuffer;

      let offset = 0;
      const view = new DataView(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength,
      );

      while (buffer.length - offset >= 4) {
        const length = view.getUint32(offset, /* Big Endian */ false);

        if (buffer.length - offset < 4 + length) {
          break;
        }

        const start = offset + 4;
        const end = start + length;
        try {
          const payloadBytes = buffer.subarray(start, end);
          const json = textDecoder.decode(payloadBytes);
          const frame = JSON.parse(json) as Frame;
          yield frame;

          if (frame.type === 'finish') {
            return;
          }
        } catch (err: any) {
          throw new Error(`Invalid JSON payload: ${err.message}`);
        }

        offset = end;
      }

      if (offset > 0) {
        buffer = buffer.subarray(offset);
      }
    }

    if (buffer.length > 0) {
      throw new Error(`Stream ended with ${buffer.length} leftover bytes`);
    }
  } finally {
    reader.releaseLock();
  }
}
