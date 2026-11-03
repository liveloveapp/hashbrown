import type { Transport, TransportResponse } from '@hashbrownai/core';

/** Finite candidate transport observations, distinct from server admission evidence. */
export interface CandidateDeadlineRecord {
  /** Lifecycle boundary witnessed by the candidate wrapper. */
  readonly kind:
    'started' | 'deadline' | 'aborted' | 'complete' | 'error' | 'disposed';
  /** Original public transport request identity. */
  readonly requestId: string;
  /** Monotonic browser or Node clock reading at the boundary. */
  readonly monotonicMs: number;
  /** Actual source of an already-aborted composed signal, when this is an abort observation. */
  readonly abortSource?: 'caller' | 'deadline';
  /** Safe characterized metadata; the original reason itself is forwarded without replacement. */
  readonly abortReason?: string | Readonly<{ name: string; message: string }>;
}

/** Candidate-owned finite deadline policy around an actual public transport. */
export interface CandidateDeadlineTransportOptions {
  /** Actual public transport delegate; browser composition supplies HttpTransport. */
  readonly delegate: Transport;
  /** Positive finite integral deadline retained for the complete event stream. */
  readonly deadlineMs: number;
  /** Optional parent-owned observation callback for exact lifecycle boundaries. */
  readonly observe?: (record: CandidateDeadlineRecord) => void;
}

type PublicEvent =
  TransportResponse['events'] extends AsyncIterable<infer Value>
    ? Value
    : never;

/** Reads only native DOMException slots or own Error data; unknown reasons remain opaque. */
function abortReasonMetadata(
  reason: unknown,
): CandidateDeadlineRecord['abortReason'] {
  if (typeof reason === 'string') return reason;
  if (!reason || typeof reason !== 'object') return undefined;
  try {
    const prototype = Object.getPrototypeOf(reason);
    if (prototype === DOMException.prototype) {
      const nameGetter = Object.getOwnPropertyDescriptor(
        DOMException.prototype,
        'name',
      )?.get;
      const messageGetter = Object.getOwnPropertyDescriptor(
        DOMException.prototype,
        'message',
      )?.get;
      const name: unknown = nameGetter?.call(reason);
      const message: unknown = messageGetter?.call(reason);
      if (typeof name === 'string' && typeof message === 'string')
        return Object.freeze({ name, message });
    }
    if (prototype === Error.prototype) {
      const name = Object.getOwnPropertyDescriptor(reason, 'name');
      const message = Object.getOwnPropertyDescriptor(reason, 'message');
      if (
        (!name || ('value' in name && typeof name.value === 'string')) &&
        message &&
        'value' in message &&
        typeof message.value === 'string'
      )
        return Object.freeze({
          name: name ? name.value : 'Error',
          message: message.value,
        });
    }
  } catch {
    // Characterization cannot alter forwarding, cancellation, cleanup or retries.
  }
  return undefined;
}

/** Observes both settlement paths of an operation even if cancellation wins first. */
function withAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    operation.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

/** Wraps an actual public transport without changing SDK configuration or exports. */
export function createCandidateDeadlineTransport(
  options: CandidateDeadlineTransportOptions,
): Transport {
  const { delegate, deadlineMs, observe } = options;
  if (
    !Number.isSafeInteger(deadlineMs) ||
    deadlineMs <= 0 ||
    deadlineMs > 2_147_483_647
  )
    throw new RangeError('Candidate deadline must fit a positive finite timer');

  return {
    name: 'CandidateDeadlineTransport',
    async send(request) {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let response: TransportResponse | undefined;
      let disposal: Promise<void> | undefined;
      let cleanupRequested = false;
      let ended = false;
      let failure: { value: unknown } | undefined;

      const record = (
        kind: CandidateDeadlineRecord['kind'],
        abortSource?: CandidateDeadlineRecord['abortSource'],
      ) => {
        try {
          const abort =
            abortSource && controller.signal.aborted
              ? {
                  abortSource,
                  abortReason: abortReasonMetadata(controller.signal.reason),
                }
              : {};
          observe?.(
            Object.freeze({
              kind,
              requestId: request.requestId,
              monotonicMs: performance.now(),
              ...abort,
            }),
          );
        } catch {
          // Passive fixture observations cannot change transport or cancellation.
        }
      };
      const removeLifetime = () => {
        clearTimeout(timer);
        request.signal.removeEventListener('abort', callerAborted);
        controller.signal.removeEventListener('abort', cleanupOnAbort);
      };
      const disposeResponse = (): Promise<void> => {
        if (!response) return Promise.resolve();
        const owned = response;
        disposal ??= Promise.resolve()
          .then(() => owned.dispose?.())
          .then(() => {
            record('disposed');
          });
        return disposal;
      };
      const cleanup = (): Promise<void> => {
        cleanupRequested = true;
        removeLifetime();
        return disposeResponse();
      };
      const cleanupOnAbort = () => {
        void cleanup().catch(() => {
          record('error');
        });
      };
      const callerAborted = () => {
        controller.abort(request.signal.reason);
        record('aborted', 'caller');
      };
      const fail = async (error: unknown): Promise<never> => {
        ended = true;
        failure = { value: error };
        record('error');
        try {
          await cleanup();
        } catch (cleanupError) {
          if (cleanupError === error) throw error;
          const combined = new AggregateError(
            [error, cleanupError],
            'Candidate transport and delegate disposal failed',
          );
          failure = { value: combined };
          throw combined;
        }
        throw error;
      };

      record('started');
      controller.signal.addEventListener('abort', cleanupOnAbort, {
        once: true,
      });
      request.signal.addEventListener('abort', callerAborted, { once: true });
      if (request.signal.aborted) callerAborted();
      else {
        timer = setTimeout(() => {
          controller.abort(
            new DOMException(
              'Candidate transport deadline exceeded',
              'TimeoutError',
            ),
          );
          record('deadline', 'deadline');
        }, deadlineMs);
      }

      try {
        if (controller.signal.aborted) throw controller.signal.reason;
        const sending = Promise.resolve().then(async () => {
          if (controller.signal.aborted) throw controller.signal.reason;
          // Preserve the original owned input object, including private runtime policy identity.
          const received = await delegate.send({
            ...request,
            signal: controller.signal,
          });
          response = received;
          if (cleanupRequested) {
            // A late delegate response still owns resources even after send's abort won.
            await disposeResponse();
          }
          return received;
        });
        const received = await withAbort(sending, controller.signal);
        if (controller.signal.aborted) throw controller.signal.reason;
        const iterator = received.events[Symbol.asyncIterator]();
        const dispose = async () => {
          ended = true;
          removeLifetime();
          if (!controller.signal.aborted)
            controller.abort(
              new DOMException('Candidate transport disposed', 'AbortError'),
            );
          await cleanup();
        };
        const events: AsyncIterableIterator<PublicEvent> = {
          [Symbol.asyncIterator]() {
            return this;
          },
          async next() {
            if (ended) {
              if (failure) throw failure.value;
              return { done: true, value: undefined };
            }
            try {
              if (controller.signal.aborted) throw controller.signal.reason;
              const step = await withAbort(
                Promise.resolve().then(() => iterator.next()),
                controller.signal,
              );
              if (controller.signal.aborted) throw controller.signal.reason;
              if (step.done) {
                ended = true;
                await cleanup();
                record('complete');
              }
              return step;
            } catch (error) {
              return fail(error);
            }
          },
          async return() {
            await dispose();
            return { done: true, value: undefined };
          },
          async throw(error: unknown) {
            return fail(error);
          },
        };
        return { ...received, events, dispose };
      } catch (error) {
        return fail(error);
      }
    },
  };
}
