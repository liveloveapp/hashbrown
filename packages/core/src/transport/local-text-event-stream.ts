import { type AGUIEvent, EventType, type RunAgentInput } from '@ag-ui/core';
import { TransportError } from './transport-error';

type LocalTextEventStreamOptions = {
  input: RunAgentInput;
  signal: AbortSignal;
  start: (signal: AbortSignal) => Promise<ReadableStream<string>>;
  destroy: () => void | Promise<void>;
};

/**
 * A local text generation represented as an AG-UI event stream with explicit
 * lifecycle cleanup.
 *
 * @internal
 */
export interface LocalTextEventStream {
  readonly events: AsyncIterable<AGUIEvent>;
  dispose(): Promise<void>;
}

/**
 * Adapts a local text stream to the AG-UI run and text message lifecycle.
 *
 * @internal
 */
export function createLocalTextEventStream(
  options: LocalTextEventStreamOptions,
): LocalTextEventStream {
  const { input, signal, start, destroy } = options;
  const messageId = `${input.runId}:message`;
  let reader: ReadableStreamDefaultReader<string> | undefined;
  let disposePromise: Promise<void> | undefined;

  const dispose = () => {
    disposePromise ??= (async () => {
      let cleanupFailed = false;
      let cleanupError: unknown;

      try {
        await reader?.cancel(signal.reason);
      } catch (error) {
        cleanupFailed = true;
        cleanupError = error;
      }

      try {
        reader?.releaseLock();
      } catch (error) {
        if (!cleanupFailed) {
          cleanupFailed = true;
          cleanupError = error;
        }
      }

      try {
        await destroy();
      } catch (error) {
        if (!cleanupFailed) {
          cleanupFailed = true;
          cleanupError = error;
        }
      }

      if (cleanupFailed) {
        throw cleanupError;
      }
    })();
    return disposePromise;
  };

  const events = (async function* (): AsyncGenerator<AGUIEvent> {
    let cleanupFailed = false;
    let cleanupError: unknown;

    try {
      throwIfAborted(signal);
      yield {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      };

      throwIfAborted(signal);
      const stream = await raceWithAbort(start(signal), signal, (lateStream) =>
        cancelLateStream(lateStream, signal.reason),
      );
      reader = stream.getReader();

      throwIfAborted(signal);
      yield {
        type: EventType.TEXT_MESSAGE_START,
        messageId,
        role: 'assistant',
      };

      while (true) {
        throwIfAborted(signal);
        const result = await raceWithAbort(reader.read(), signal);
        if (result.done) {
          break;
        }

        throwIfAborted(signal);
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: result.value,
        };
      }

      throwIfAborted(signal);
      yield {
        type: EventType.TEXT_MESSAGE_END,
        messageId,
      };

      throwIfAborted(signal);
      yield {
        type: EventType.RUN_FINISHED,
        threadId: input.threadId,
        runId: input.runId,
      };
    } finally {
      try {
        await dispose();
      } catch (error) {
        cleanupFailed = true;
        cleanupError = error;
      }
    }

    if (cleanupFailed) {
      throw cleanupError;
    }
  })();

  return { events, dispose };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw createAbortError();
  }
}

function createAbortError(): TransportError {
  return new TransportError('Prompt aborted', {
    retryable: false,
    code: 'PROMPT_API_ABORTED',
  });
}

function raceWithAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  onLateValue?: (value: T) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const handleAbort = () => {
      if (settled) {
        return;
      }

      settled = true;
      signal.removeEventListener('abort', handleAbort);
      reject(createAbortError());
    };
    const handleLateValue = (value: T) => {
      try {
        onLateValue?.(value);
      } catch {
        // Late cancellation is teardown-only and must remain owned.
      }
    };

    signal.addEventListener('abort', handleAbort, { once: true });
    operation.then(
      (value) => {
        if (settled) {
          handleLateValue(value);
          return;
        }

        settled = true;
        signal.removeEventListener('abort', handleAbort);
        resolve(value);
      },
      (error) => {
        if (settled) {
          return;
        }

        settled = true;
        signal.removeEventListener('abort', handleAbort);
        reject(error);
      },
    );

    if (signal.aborted) {
      handleAbort();
    }
  });
}

function cancelLateStream(stream: ReadableStream<string>, reason: unknown) {
  let lateReader: ReadableStreamDefaultReader<string>;
  try {
    lateReader = stream.getReader();
  } catch {
    return;
  }

  void (async () => {
    try {
      await lateReader.cancel(reason);
    } catch {
      // Late cancellation is teardown-only and must remain owned.
    } finally {
      try {
        lateReader.releaseLock();
      } catch {
        // The late stream may already have released its reader lock.
      }
    }
  })();
}
