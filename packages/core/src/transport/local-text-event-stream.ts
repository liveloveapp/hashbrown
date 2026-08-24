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
  const cancellationController = new AbortController();
  const cancellationSignal = cancellationController.signal;
  let reader: ReadableStreamDefaultReader<string> | undefined;
  let cleanupPromise: Promise<void> | undefined;
  let externalAbortListenerAttached = false;

  const removeExternalAbortListener = () => {
    if (!externalAbortListenerAttached) {
      return;
    }

    externalAbortListenerAttached = false;
    signal.removeEventListener('abort', handleExternalAbort);
  };
  const requestCancellation = (reason: unknown = createAbortError()) => {
    removeExternalAbortListener();
    if (!cancellationSignal.aborted) {
      cancellationController.abort(reason);
    }
  };
  const handleExternalAbort = () => {
    requestCancellation(signal.reason);
    void cleanup().catch(() => undefined);
  };

  const cleanup = () => {
    cleanupPromise ??= (async () => {
      let cleanupFailed = false;
      let cleanupError: unknown;

      removeExternalAbortListener();
      try {
        await reader?.cancel(cancellationSignal.reason);
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
    return cleanupPromise;
  };
  const dispose = () => {
    requestCancellation();
    return cleanup();
  };

  if (signal.aborted) {
    handleExternalAbort();
  } else {
    signal.addEventListener('abort', handleExternalAbort, { once: true });
    externalAbortListenerAttached = true;
  }

  const generator = (async function* (): AsyncGenerator<AGUIEvent> {
    let cleanupFailed = false;
    let cleanupError: unknown;

    try {
      throwIfAborted(cancellationSignal);
      yield {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      };

      throwIfAborted(cancellationSignal);
      const stream = await raceWithAbort(
        start(cancellationSignal),
        cancellationSignal,
        (lateStream) => cancelLateStream(lateStream, cancellationSignal.reason),
      );
      const acquiredReader = stream.getReader();
      if (cleanupPromise) {
        await cancelReader(acquiredReader, cancellationSignal.reason);
        throw createAbortError();
      }
      reader = acquiredReader;

      throwIfAborted(cancellationSignal);
      yield {
        type: EventType.TEXT_MESSAGE_START,
        messageId,
        role: 'assistant',
      };

      while (true) {
        throwIfAborted(cancellationSignal);
        const result = await raceWithAbort(reader.read(), cancellationSignal);
        if (result.done) {
          break;
        }

        throwIfAborted(cancellationSignal);
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: result.value,
        };
      }

      throwIfAborted(cancellationSignal);
      yield {
        type: EventType.TEXT_MESSAGE_END,
        messageId,
      };

      throwIfAborted(cancellationSignal);
      yield {
        type: EventType.RUN_FINISHED,
        threadId: input.threadId,
        runId: input.runId,
      };
    } finally {
      try {
        await cleanup();
      } catch (error) {
        cleanupFailed = true;
        cleanupError = error;
      }
    }

    if (cleanupFailed) {
      throw cleanupError;
    }
  })();
  const iterator: AsyncIterableIterator<AGUIEvent> = {
    [Symbol.asyncIterator]() {
      return this;
    },
    next: () => generator.next(),
    return: async (value?: unknown) => {
      requestCancellation();
      const cleanupResult = cleanup();
      void cleanupResult.catch(() => undefined);

      try {
        const result = await generator.return(value);
        await cleanupResult;
        return result;
      } catch (error) {
        try {
          await cleanupResult;
        } catch {
          // A cleanup failure cannot replace the primary iterator failure.
        }
        throw error;
      }
    },
    throw: (error?: unknown) => generator.throw(error),
  };
  const events: AsyncIterable<AGUIEvent> = {
    [Symbol.asyncIterator]: () => iterator,
  };

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

  void cancelReader(lateReader, reason);
}

async function cancelReader(
  reader: ReadableStreamDefaultReader<string>,
  reason: unknown,
): Promise<void> {
  try {
    await reader.cancel(reason);
  } catch {
    // Cancellation is teardown-only and must remain owned.
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The stream may already have released its reader lock.
    }
  }
}
