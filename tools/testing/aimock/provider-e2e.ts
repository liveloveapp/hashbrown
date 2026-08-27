import { type AGUIEvent, EventSchemas } from '@ag-ui/core';
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

/**
 * Options for collecting a provider AG-UI stream against an aimock fixture.
 */
export interface ProviderAGUIAimockRunOptions {
  /** Path to one fixture file or a directory of `.json` fixture files. */
  readonly fixturePath: string;
  /** Optional chunk size passed through to aimock. */
  readonly chunkSize?: number;
  /** Create the provider stream after aimock is started. */
  readonly createStream: (
    aimock: AimockHandle,
    signal: AbortSignal,
  ) => AsyncIterable<AGUIEvent>;
  /** Observe each parsed event and optionally abort the provider stream. */
  readonly onEvent?: (
    event: AGUIEvent,
    controls: {
      /** Abort the helper-owned signal. Safe to call more than once. */
      readonly abort: () => void;
    },
  ) => void | Promise<void>;
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

/**
 * Run a provider AG-UI stream against aimock and collect validated events.
 */
export async function runProviderAGUIWithAimock(
  options: ProviderAGUIAimockRunOptions,
): Promise<AGUIEvent[]> {
  const aimock = await startAimock({
    fixturePath: options.fixturePath,
    chunkSize: options.chunkSize,
  });
  const abortController = new AbortController();
  const controls = {
    abort: () => {
      if (!abortController.signal.aborted) {
        abortController.abort();
      }
    },
  };
  let iterator: AsyncIterator<AGUIEvent> | undefined;

  try {
    iterator = options
      .createStream(aimock, abortController.signal)
      [Symbol.asyncIterator]();
    const events: AGUIEvent[] = [];

    while (true) {
      const next = await iterator.next();
      if (next.done) {
        return events;
      }

      const event = EventSchemas.parse(next.value);
      events.push(event);
      await options.onEvent?.(event, controls);
    }
  } finally {
    abortController.abort();
    try {
      await iterator?.return?.();
    } finally {
      await aimock.stop();
    }
  }
}
