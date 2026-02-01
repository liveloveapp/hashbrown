import { encodeFrame, Frame } from '../frames';

/**
 * Converts an async generator of frames into the length-prefixed format used by Hashbrown.
 *
 * @internal
 */
export function framesToLengthPrefixedStream(
  frames: AsyncGenerator<Frame>,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let iteratorError: unknown;
      try {
        for await (const frame of frames) {
          controller.enqueue(encodeFrame(frame));
        }
      } catch (err) {
        iteratorError = err;
      }

      if (iteratorError) {
        controller.error(iteratorError);
        if (typeof frames.return === 'function') {
          await frames.return(undefined);
        }
        return;
      }

      controller.close();
      if (typeof frames.return === 'function') {
        await frames.return(undefined);
      }
    },
    async cancel(reason) {
      if (typeof frames.return === 'function') {
        await frames.return(reason);
      }
    },
  });
}
