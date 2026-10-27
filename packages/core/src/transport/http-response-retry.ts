import { raceTransportOperationWithAbort } from './race-transport-operation-with-abort';
import { TransportError } from './transport-error';

/**
 * Application classification of HTTP rejections before an event stream starts.
 *
 * @public
 */
export interface HttpResponseRetryPolicy {
  /** Maximum additional HTTP requests in one send. Zero disables retry processing. */
  maxRetries: number;
  /** Retry decision and waiting budget in milliseconds, starting at the first fetch. */
  maxElapsedMs: number;
  /** Return true only when repeating this rejected request is safe. */
  shouldRetry: (
    context: HttpResponseRetryContext,
  ) => boolean | Promise<boolean>;
  /**
   * Fallback delay when Retry-After is invalid or absent.
   *
   * @defaultValue 1000
   */
  delayMs?: number;
}

/**
 * Isolated, bounded snapshot of a rejected HTTP response.
 *
 * @public
 */
export interface HttpResponseRetryContext {
  /** Rejected HTTP status. */
  readonly status: number;
  /** Isolated response headers; mutations do not affect the response or request. */
  readonly headers: Headers;
  /** Response body decoded from at most 16 KiB of UTF-8 bytes. */
  readonly bodyText: string;
  /** Whether bytes beyond the snapshot limit were present. */
  readonly bodyTruncated: boolean;
  /** Number of additional HTTP requests already started. */
  readonly retryCount: number;
  /** Monotonic milliseconds since the first fetch. */
  readonly elapsedMs: number;
  /** Valid Retry-After duration, or undefined for absent or malformed values. */
  readonly retryAfterMs: number | undefined;
  /** Owned cancellation signal for this send. */
  readonly signal: AbortSignal;
}

const timerLimit = 2_147_483_647;
const bodyLimit = 16 * 1024;

/** Validate policy options before sending any request. @internal */
export function validateHttpResponseRetryPolicy(
  policy?: HttpResponseRetryPolicy,
): void {
  if (!policy) return;
  if (!Number.isSafeInteger(policy.maxRetries) || policy.maxRetries < 0) {
    throw new TransportError('maxRetries must be a nonnegative safe integer', {
      retryable: false,
    });
  }
  if (policy.maxRetries === 0) return;
  if (
    !Number.isFinite(policy.maxElapsedMs) ||
    policy.maxElapsedMs <= 0 ||
    policy.maxElapsedMs > timerLimit
  ) {
    throw new TransportError(
      'maxElapsedMs must be positive and within the timer limit',
      { retryable: false },
    );
  }
  const delay = policy.delayMs ?? 1000;
  if (
    !Number.isFinite(delay) ||
    delay < 0 ||
    delay > timerLimit ||
    typeof policy.shouldRetry !== 'function'
  ) {
    throw new TransportError('Invalid HTTP response retry policy', {
      retryable: false,
    });
  }
}

/** Build the existing nonretryable HTTP error from a response snapshot. @internal */
export function createHttpResponseError(
  response: Response,
  bodyText?: string,
): TransportError {
  const trimmedBody =
    bodyText && bodyText.length > 500 ? `${bodyText.slice(0, 500)}…` : bodyText;
  const statusText = response.statusText || 'HTTP error';
  return new TransportError(
    trimmedBody
      ? `${statusText} (${response.status}): ${trimmedBody}`
      : `${statusText} (${response.status})`,
    {
      status: response.status,
      retryable: false,
    },
  );
}

function retryAfter(value: string | null): number | undefined {
  if (value === null) return undefined;
  const text = value.trim();
  if (/^\d+$/.test(text)) return Number(text) * 1000;
  const day = '(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)';
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const month = `(${months.join('|')})`;
  const time = '(\\d{2}):(\\d{2}):(\\d{2})';
  const standard = new RegExp(
    `^${day}, (\\d{2}) ${month} (\\d{4}) ${time} GMT$`,
  ).exec(text);
  const obsolete = new RegExp(
    `^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\\d{2})-${month}-(\\d{2}) ${time} GMT$`,
  ).exec(text);
  const asctime = new RegExp(
    `^${day} ${month} ([ \\d]\\d) ${time} (\\d{4})$`,
  ).exec(text);
  const parts = standard ?? obsolete;
  if (!parts && !asctime) return undefined;
  const dateDay = Number(parts ? parts[1] : asctime?.[2]);
  const dateMonth = months.indexOf(parts ? parts[2] : (asctime?.[1] ?? ''));
  let dateYear = Number(parts ? parts[3] : asctime?.[6]);
  const hour = Number(parts ? parts[4] : asctime?.[3]);
  const minute = Number(parts ? parts[5] : asctime?.[4]);
  const second = Number(parts ? parts[6] : asctime?.[5]);
  const now = new Date();
  if (obsolete) {
    dateYear += Math.floor(now.getUTCFullYear() / 100) * 100;
    if (dateYear < now.getUTCFullYear()) dateYear += 100;
  }
  const parsed = new Date(0);
  parsed.setUTCFullYear(dateYear, dateMonth, dateDay);
  parsed.setUTCHours(hour, minute, second, 0);
  if (obsolete) {
    const futureLimit = new Date(now);
    futureLimit.setUTCFullYear(now.getUTCFullYear() + 50);
    if (parsed.getTime() > futureLimit.getTime()) {
      dateYear -= 100;
      parsed.setUTCFullYear(dateYear, dateMonth, dateDay);
      parsed.setUTCHours(hour, minute, second, 0);
    }
  }
  // UTC setters normalize impossible dates; require every supplied component to survive.
  if (
    parsed.getUTCFullYear() !== dateYear ||
    parsed.getUTCMonth() !== dateMonth ||
    parsed.getUTCDate() !== dateDay ||
    parsed.getUTCHours() !== hour ||
    parsed.getUTCMinutes() !== minute ||
    parsed.getUTCSeconds() !== second
  )
    return undefined;
  return Math.max(0, parsed.getTime() - now.getTime());
}

function abortError(signal: AbortSignal): unknown {
  return (
    signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
  );
}

/** Capture a replayable request and fetch rejected responses under an opt-in policy. @internal */
export function createHttpResponseRetryFetch(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  policy: HttpResponseRetryPolicy,
  signal: AbortSignal,
): () => Promise<Response> {
  if (typeof init.body !== 'string') {
    throw new TransportError(
      'HTTP response retries require a string request body',
      { retryable: false },
    );
  }
  const snapshot = { ...init, headers: new Headers(init.headers), signal };
  return async () => {
    const started = performance.now();
    const remaining = () => policy.maxElapsedMs - (performance.now() - started);
    let retryCount = 0;

    while (true) {
      if (signal.aborted) throw abortError(signal);
      // An issued request may legitimately take longer than the retry budget.
      const response = await raceTransportOperationWithAbort(
        async () => {
          const result = await fetchImpl(url, {
            ...snapshot,
            headers: new Headers(snapshot.headers),
          });
          if (signal.aborted) {
            void result.body?.cancel().catch(() => undefined);
            throw abortError(signal);
          }
          return result;
        },
        signal,
        () => abortError(signal),
      );
      if (response.ok) return response;

      let bodyText: string | undefined;
      const failure = () => createHttpResponseError(response, bodyText);
      const bounded = <T>(
        operation: () => T | PromiseLike<T>,
        disposeOperation?: () => void,
      ): Promise<T> => {
        if (remaining() <= 0) return Promise.reject(failure());
        if (signal.aborted) return Promise.reject(abortError(signal));
        return new Promise<T>((resolve, reject) => {
          let settled = false;
          const settle = (complete: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
            disposeOperation?.();
            complete();
          };
          const timer = setTimeout(
            () => settle(() => reject(failure())),
            remaining(),
          );
          const onAbort = () => settle(() => reject(abortError(signal)));
          signal.addEventListener('abort', onAbort, { once: true });
          Promise.resolve()
            .then(operation)
            .then(
              (value) => settle(() => resolve(value)),
              (error) => settle(() => reject(error)),
            );
          if (signal.aborted) onAbort();
        });
      };
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let readPending = false;
      let cleanup: Promise<void> | undefined;
      const release = () => {
        try {
          reader?.releaseLock();
        } catch {
          /* A pending read owns the lock until settlement. */
        }
      };
      const cancel = () => {
        if (!cleanup)
          cleanup = Promise.resolve()
            .then(() => {
              try {
                return reader?.cancel();
              } finally {
                // Cancellation can remain pending after the owned read has settled.
                if (!readPending) release();
              }
            })
            .catch(() => undefined)
            .finally(release);
        return cleanup;
      };
      let bodyTruncated = false;
      try {
        reader = response.body?.getReader();
        const bytes = new Uint8Array(bodyLimit);
        let length = 0;
        if (reader) {
          const ownedReader = reader;
          while (true) {
            const result = await bounded(async () => {
              readPending = true;
              try {
                return await ownedReader.read();
              } finally {
                readPending = false;
                if (cleanup) release();
              }
            });
            if (result.done) break;
            const available = bodyLimit - length;
            bytes.set(result.value.subarray(0, available), length);
            length += Math.min(result.value.length, available);
            if (result.value.length > available) {
              bodyTruncated = true;
              break;
            }
          }
        }
        bodyText = new TextDecoder().decode(bytes.subarray(0, length));
        await bounded(cancel);
        if (retryCount >= policy.maxRetries || remaining() <= 0)
          throw failure();
        const retryAfterMs = retryAfter(response.headers.get('Retry-After'));
        const delay = retryAfterMs ?? policy.delayMs ?? 1000;
        if (
          !Number.isFinite(delay) ||
          delay > timerLimit ||
          delay > remaining()
        )
          throw failure();
        const selected = await bounded(() =>
          policy.shouldRetry({
            status: response.status,
            headers: new Headers(response.headers),
            bodyText: bodyText ?? '',
            bodyTruncated,
            retryCount,
            elapsedMs: performance.now() - started,
            retryAfterMs,
            signal,
          }),
        );
        if (
          selected !== true ||
          remaining() <= 0 ||
          signal.aborted ||
          delay > remaining()
        )
          throw failure();
        if (delay > 0) {
          let waitTimer: ReturnType<typeof setTimeout> | undefined;
          await bounded(
            () =>
              new Promise<void>((resolve) => {
                waitTimer = setTimeout(resolve, delay);
              }),
            () => clearTimeout(waitTimer),
          );
        }
        if (signal.aborted) throw abortError(signal);
        if (remaining() <= 0 || retryCount >= policy.maxRetries)
          throw failure();
        retryCount += 1;
      } catch {
        void cancel();
        if (signal.aborted) throw abortError(signal);
        throw failure();
      }
    }
  };
}
