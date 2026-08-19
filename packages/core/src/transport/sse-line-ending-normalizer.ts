import type { parseSSEStream } from '@ag-ui/client';

interface Subscription {
  unsubscribe(): void;
}

interface Observer<T> {
  next(value: T): void;
  error(error: unknown): void;
  complete(): void;
}

interface Subscribable<T> {
  subscribe(observer: Observer<T>): Subscription;
}

interface HttpStreamEvent {
  type: string;
  data?: Uint8Array;
}

const CARRIAGE_RETURN = 13;
const LINE_FEED = 10;

function normalizeChunk(
  data: Uint8Array,
  hasTrailingCarriageReturn: boolean,
): { data: Uint8Array; hasTrailingCarriageReturn: boolean } {
  if (data.length === 0) {
    return { data, hasTrailingCarriageReturn };
  }

  const output = new Uint8Array(
    data.length + (hasTrailingCarriageReturn ? 1 : 0),
  );
  let inputIndex = 0;
  let outputIndex = 0;

  if (hasTrailingCarriageReturn) {
    output[outputIndex] = LINE_FEED;
    outputIndex += 1;
    if (data[0] === LINE_FEED) {
      inputIndex += 1;
    }
  }

  let trailingCarriageReturn = false;
  while (inputIndex < data.length) {
    const byte = data[inputIndex];
    if (byte !== CARRIAGE_RETURN) {
      output[outputIndex] = byte;
      outputIndex += 1;
      inputIndex += 1;
      continue;
    }

    if (inputIndex === data.length - 1) {
      trailingCarriageReturn = true;
      inputIndex += 1;
      continue;
    }

    output[outputIndex] = LINE_FEED;
    outputIndex += 1;
    inputIndex += data[inputIndex + 1] === LINE_FEED ? 2 : 1;
  }

  return {
    data: output.slice(0, outputIndex),
    hasTrailingCarriageReturn: trailingCarriageReturn,
  };
}

/**
 * Normalizes valid SSE CRLF and CR line endings without decoding UTF-8 data.
 *
 * @internal
 */
export function normalizeSseLineEndings<T extends HttpStreamEvent>(
  source: Subscribable<T>,
): Subscribable<T> {
  return {
    subscribe(observer) {
      let trailingCarriageReturnEvent: T | undefined;

      return source.subscribe({
        next(event) {
          if (event.type !== 'data' || !event.data) {
            observer.next(event);
            return;
          }

          const normalized = normalizeChunk(
            event.data,
            trailingCarriageReturnEvent !== undefined,
          );
          trailingCarriageReturnEvent = normalized.hasTrailingCarriageReturn
            ? event
            : undefined;
          if (normalized.data.length > 0) {
            observer.next({ ...event, data: normalized.data });
          }
        },
        error(error) {
          observer.error(error);
        },
        complete() {
          if (trailingCarriageReturnEvent) {
            observer.next({
              ...trailingCarriageReturnEvent,
              data: Uint8Array.of(LINE_FEED),
            });
          }
          observer.complete();
        },
      });
    },
  };
}

/**
 * Captures the upstream subscription hidden by `parseSSEStream` in AG-UI 0.0.58.
 *
 * The pinned parser only calls `subscribe` on its input and does not propagate
 * teardown, so this keeps the version-specific structural cast in one boundary.
 *
 * @internal
 */
export function captureAgUiClient058Subscription<T>(
  source: Subscribable<T>,
  capture: (subscription: Subscription) => void,
): Parameters<typeof parseSSEStream>[0] {
  const capturedSource = {
    subscribe(observer: Observer<T>) {
      const subscription = source.subscribe(observer);
      capture(subscription);
      return subscription;
    },
  };

  return capturedSource as unknown as Parameters<typeof parseSSEStream>[0];
}
