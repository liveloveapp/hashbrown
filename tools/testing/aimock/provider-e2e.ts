import { decodeFrames, type Frame } from '@hashbrownai/core';
import { type AimockHandle, startAimock } from './aimock-runner';

/**
 * Options for running a provider stream against an aimock fixture.
 */
export interface ProviderTextAimockRunOptions {
  /** Path to one fixture file or a directory of `.json` fixture files. */
  readonly fixturePath: string;
  /** Create the provider stream after aimock is started. */
  readonly createStream: (aimock: AimockHandle) => AsyncIterable<Uint8Array>;
}

function toReadableStream(
  iterable: AsyncIterable<Uint8Array>,
): ReadableStream<Uint8Array> {
  const iterator = iterable[Symbol.asyncIterator]();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next();
      if (next.done) {
        controller.close();
        return;
      }

      controller.enqueue(next.value);
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

/**
 * Run a Hashbrown provider text stream against aimock and collect frames.
 */
export async function runProviderTextWithAimock(
  options: ProviderTextAimockRunOptions,
): Promise<Frame[]> {
  const aimock = await startAimock({ fixturePath: options.fixturePath });
  const abortController = new AbortController();

  try {
    const stream = toReadableStream(options.createStream(aimock));
    const frames: Frame[] = [];

    for await (const frame of decodeFrames(stream, {
      signal: abortController.signal,
    })) {
      frames.push(frame);
    }

    return frames;
  } finally {
    abortController.abort();
    await aimock.stop();
  }
}
