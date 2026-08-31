import { type AGUIEvent, EventSchemas } from '@ag-ui/core';
import { type AimockHandle, startAimock } from './aimock-runner';

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
      if (abortController.signal.aborted) {
        return events;
      }
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
