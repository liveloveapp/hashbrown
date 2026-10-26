import type {
  WebLlmChunk,
  WebLlmEngine,
} from './experimental-webllm-transport';
import { TransportError } from './transport-error';

// interruptGenerate affects an entire engine, so ownership spans all local runs.
const activeEngines = new WeakSet<object>();

/**
 * Claims an application engine and owns its raw generation until the iterator drains.
 * Request preparation and resource release remain owned by the calling adapter.
 * @internal
 */
export function createWebLlmRun(options: {
  engine: Pick<WebLlmEngine, 'interruptGenerate'>;
  prepare?: (signal: AbortSignal) => Promise<void>;
  create: () =>
    Promise<AsyncIterable<WebLlmChunk>> | AsyncIterable<WebLlmChunk>;
  release: () => void;
  /** Requires one clean stop followed by iterator completion; legacy runs omit this. */
  strictCompletion?: boolean;
}): {
  start: (signal: AbortSignal) => Promise<ReadableStream<string>>;
  cleanup: () => void;
} {
  const { engine } = options;
  if (activeEngines.has(engine)) {
    throw new TransportError('The local engine is already generating', {
      code: 'MODEL_BUSY',
      retryable: false,
    });
  }
  activeEngines.add(engine);
  let pending: Promise<AsyncIterator<WebLlmChunk>> | undefined;
  let nextResult: Promise<IteratorResult<WebLlmChunk>> | undefined;
  let finished = false;
  let stopped = false;
  let cancelled = false;
  let cleanupStarted = false;
  let removeAbortListener: () => void = () => undefined;
  const release = () => {
    try {
      options.release();
    } finally {
      activeEngines.delete(engine);
    }
  };
  const cleanup = () => {
    if (cleanupStarted) return;
    cleanupStarted = true;
    cancelled = true;
    removeAbortListener();
    try {
      if (pending && !finished) engine.interruptGenerate();
    } finally {
      if (pending && !finished) {
        // WebLLM releases its model lock only after advancing past the last
        // chunk. Worker iterator.return() does not close its backend stream.
        // Keep ownership while draining, without delaying UI cancellation.
        void pending
          .then(async (iterator) => {
            let result = await nextResult;
            while (!result?.done) {
              result = await iterator.next();
            }
          })
          .finally(release)
          .catch(() => undefined);
      } else {
        release();
      }
    }
  };

  const start = async (
    signal: AbortSignal,
  ): Promise<ReadableStream<string>> => {
    signal.addEventListener('abort', cleanup, { once: true });
    removeAbortListener = () => signal.removeEventListener('abort', cleanup);
    if (signal.aborted || cancelled) {
      cleanup();
      throw aborted();
    }
    await options.prepare?.(signal);
    if (cancelled || signal.aborted) throw aborted();
    // Own synchronous create and async iterator acquisition failures as well.
    pending = Promise.resolve()
      .then(() => {
        if (cancelled) throw aborted();
        return options.create();
      })
      .then((stream) => stream[Symbol.asyncIterator]());
    let iterator: AsyncIterator<WebLlmChunk>;
    try {
      iterator = await pending;
    } catch (error) {
      throw engineError(error);
    }
    if (cancelled) throw aborted();
    return new ReadableStream<string>({
      async pull(controller) {
        try {
          while (!cancelled) {
            nextResult = Promise.resolve().then(() => iterator.next());
            const result = await nextResult;
            if (cancelled) return;
            if (result.done) {
              finished = true;
              if (options.strictCompletion && !stopped) {
                throw invalidCompletion();
              }
              controller.close();
              return;
            }
            const choice = result.value.choices[0];
            if (choice?.finish_reason === 'length') {
              throw new TransportError('Local model output was truncated', {
                code: 'WEBLLM_OUTPUT_TRUNCATED',
                retryable: false,
              });
            }
            const content = choice?.delta.content;
            if (options.strictCompletion) {
              if (
                result.value.choices.length > 1 ||
                (!choice && !stopped) ||
                (stopped && (content || choice?.finish_reason)) ||
                (choice?.finish_reason && choice.finish_reason !== 'stop')
              ) {
                throw invalidCompletion();
              }
              if (choice?.finish_reason === 'stop') stopped = true;
            }
            if (content) {
              controller.enqueue(content);
              return;
            }
          }
        } catch (error) {
          if (!cancelled) controller.error(engineError(error));
        }
      },
      cancel: cleanup,
    });
  };
  return { start, cleanup };
}

function aborted(): TransportError {
  return new TransportError('Prompt aborted', {
    code: 'PROMPT_API_ABORTED',
    retryable: false,
  });
}

function engineError(error: unknown): TransportError {
  return error instanceof TransportError
    ? error
    : new TransportError(
        error instanceof Error ? error.message : String(error),
        { code: 'WEBLLM_ENGINE_ERROR', retryable: false },
      );
}

function invalidCompletion(): TransportError {
  return new TransportError('Local model did not complete with a clean stop', {
    code: 'WEBLLM_INVALID_COMPLETION',
    retryable: false,
  });
}
