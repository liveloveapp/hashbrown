import { parseSSEStream } from '@ag-ui/client';
import { type AGUIEvent, EventSchemas } from '@ag-ui/core';
import { Chat } from '../models';
import { observableToAsyncIterable } from './observable-to-async-iterable';
import {
  captureAgUiClient058Subscription,
  normalizeSseLineEndings,
} from './sse-line-ending-normalizer';
import { Transport, TransportRequest, TransportResponse } from './transport';
import { TransportError } from './transport-error';

interface HttpEventObserver {
  next(event: HttpStreamEvent): void;
  error(error: unknown): void;
  complete(): void;
}

interface HttpEventSubscription {
  unsubscribe(): void;
}

interface HttpEventSubscribable {
  subscribe(observer: HttpEventObserver): HttpEventSubscription;
}

type HttpStreamEvent =
  | { type: 'headers'; status: number; headers: Headers }
  | { type: 'data'; data: Uint8Array };

/**
 * Options for the default HTTP transport.
 * @public
 */
export interface HttpTransportOptions {
  /**
   * URL that accepts AG-UI run requests.
   *
   * @defaultValue `/run`
   */
  baseUrl?: string;
  /** Middleware applied in declaration order before each request is fetched. */
  middleware?: Chat.Middleware[];
  /** Fetch implementation used to issue requests. Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
}

/**
 * Default HTTP transport for AG-UI event streams.
 *
 * @public
 */
export class HttpTransport implements Transport {
  readonly name = 'HttpTransport';
  readonly supportsLegacyThreadLoading = false;
  private readonly baseUrl: string;
  private readonly middleware?: Chat.Middleware[];
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpTransportOptions) {
    this.baseUrl =
      !options.baseUrl || options.baseUrl.trim() === ''
        ? '/run'
        : options.baseUrl;
    this.middleware = options.middleware;
    const boundFetch =
      typeof fetch === 'function' ? fetch.bind(globalThis) : undefined;
    this.fetchImpl = options.fetchImpl ?? (boundFetch as typeof fetch);
    if (!this.fetchImpl) {
      throw new TransportError('No fetch implementation available', {
        retryable: false,
      });
    }
  }

  async send(request: TransportRequest): Promise<TransportResponse> {
    if (!request.input) {
      throw new TransportError('Missing AG-UI run input', {
        retryable: false,
      });
    }

    const internalAbortController = new AbortController();
    let requestAbortListenerAttached = false;
    const handleRequestAbort = () => {
      if (!internalAbortController.signal.aborted) {
        internalAbortController.abort(request.signal.reason);
      }
    };
    const removeRequestAbortListener = () => {
      if (!requestAbortListenerAttached) {
        return;
      }

      requestAbortListenerAttached = false;
      request.signal.removeEventListener('abort', handleRequestAbort);
    };
    let upstreamSubscription: { unsubscribe(): void } | undefined;
    let cancellationRequested = false;
    let cancelled = false;
    const cancelUpstream = () => {
      if (cancelled) {
        return;
      }

      cancelled = true;
      removeRequestAbortListener();
      if (!internalAbortController.signal.aborted) {
        internalAbortController.abort();
      }
      if (upstreamSubscription) {
        upstreamSubscription.unsubscribe();
      } else {
        cancellationRequested = true;
      }
    };

    try {
      if (request.signal.aborted) {
        handleRequestAbort();
      } else {
        request.signal.addEventListener('abort', handleRequestAbort, {
          once: true,
        });
        requestAbortListenerAttached = true;
      }

      let requestInit: RequestInit = {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request.input),
        signal: internalAbortController.signal,
      };

      if (this.middleware?.length) {
        for (const middleware of this.middleware) {
          requestInit = await middleware(requestInit);
        }
      }
      requestInit = {
        ...requestInit,
        signal: internalAbortController.signal,
      };

      const httpEvents = createHttpEventSource(() =>
        this.fetchImpl(this.baseUrl, requestInit),
      );
      const normalizedHttpEvents = normalizeSseLineEndings(httpEvents);
      const capturedHttpEvents = captureAgUiClient058Subscription(
        normalizedHttpEvents,
        (subscription) => {
          upstreamSubscription = subscription;
          if (cancellationRequested) {
            subscription.unsubscribe();
          }
        },
      );

      const parsedEvents = parseSSEStream(capturedHttpEvents);
      const events = observableToAsyncIterable<unknown, AGUIEvent>(
        parsedEvents,
        (value) => EventSchemas.parse(value),
        cancelUpstream,
      );
      internalAbortController.signal.addEventListener(
        'abort',
        () => {
          if (!cancelled) {
            events.close();
          }
        },
        { once: true },
      );
      if (internalAbortController.signal.aborted) {
        events.close();
      }

      return {
        events,
        dispose: () => events.close(),
      };
    } catch (error) {
      cancelUpstream();
      throw error;
    }
  }
}

function createHttpEventSource(
  fetchResponse: () => Promise<Response>,
): HttpEventSubscribable {
  return {
    subscribe(observer) {
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let stopped = false;
      let cancellationStarted = false;

      const cancelReader = async () => {
        if (!reader || cancellationStarted) {
          return;
        }

        cancellationStarted = true;
        try {
          await reader.cancel();
        } catch {
          // Cancellation is teardown-only and the observable state has already
          // settled. Keep the owned cancellation promise from escaping.
        }
      };
      const unsubscribe = () => {
        if (stopped) {
          return;
        }

        stopped = true;
        void cancelReader();
      };
      const error = (cause: unknown) => {
        if (stopped) {
          return;
        }

        stopped = true;
        void cancelReader();
        observer.error(cause);
      };
      const complete = () => {
        if (stopped) {
          return;
        }

        stopped = true;
        void cancelReader();
        observer.complete();
      };

      const consumeResponse = async () => {
        try {
          const response = await fetchResponse();
          if (response.body) {
            reader = response.body.getReader();
          }
          if (stopped) {
            void cancelReader();
            return;
          }

          await validateResponse(response, reader);
          if (!reader) {
            throw new Error('Response body is null');
          }
          if (stopped) {
            void cancelReader();
            return;
          }

          observer.next({
            type: 'headers',
            status: response.status,
            headers: response.headers,
          });
          while (!stopped) {
            const { done, value } = await reader.read();
            if (done) {
              complete();
              return;
            }

            observer.next({ type: 'data', data: value });
          }
        } catch (cause) {
          error(cause);
        }
      };

      void consumeResponse();
      return { unsubscribe };
    },
  };
}

async function validateResponse(
  response: Response,
  reader: ReadableStreamDefaultReader<Uint8Array> | undefined,
): Promise<void> {
  if (!response.ok) {
    const bodyText = reader ? await readResponseText(reader) : undefined;

    const trimmedBody =
      bodyText && bodyText.length > 500
        ? `${bodyText.slice(0, 500)}…`
        : bodyText;
    const statusText = response.statusText || 'HTTP error';
    const message = trimmedBody
      ? `${statusText} (${response.status}): ${trimmedBody}`
      : `${statusText} (${response.status})`;

    throw new TransportError(message, {
      status: response.status,
      retryable: false,
    });
  }

  if (!response.body) {
    throw new TransportError('Response body is null', {
      status: response.status,
      retryable: false,
    });
  }

  const contentType = response.headers.get('content-type');
  const mediaType = contentType?.split(';', 1)[0].trim().toLowerCase();
  if (mediaType !== 'text/event-stream') {
    throw new TransportError(
      `Expected text/event-stream response but received ${contentType ?? 'no content type'}`,
      {
        status: response.status,
        retryable: false,
      },
    );
  }
}

async function readResponseText(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<string | undefined> {
  const decoder = new TextDecoder();
  let bodyText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return bodyText + decoder.decode();
      }

      bodyText += decoder.decode(value, { stream: true });
    }
  } catch {
    return undefined;
  }
}

/**
 * Helper for creating HTTP transports while preserving inference.
 *
 * @public
 */
export function createHttpTransport(options: HttpTransportOptions): Transport {
  return new HttpTransport(options);
}
