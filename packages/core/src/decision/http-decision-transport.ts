import type { Chat } from '../models';
import { raceTransportOperationWithAbort } from '../transport/race-transport-operation-with-abort';
import { TransportError } from '../transport/transport-error';
import type { Response as DecisionResponse, Transport } from './decision.types';

/**
 * Options for {@link createHttpDecisionTransport}.
 *
 * @public
 */
export interface HttpDecisionTransportOptions {
  /**
   * URL that accepts decision requests.
   *
   * @defaultValue `/api/decide`
   */
  url?: string;
  /** Middleware applied in declaration order before each request is fetched. */
  middleware?: Chat.Middleware[];
  /** Fetch implementation used to issue requests. Defaults to global `fetch`. */
  fetch?: typeof fetch;
}

/**
 * Creates a decision transport that POSTs the request as JSON and returns the
 * parsed JSON response. Decoding the response is the runtime's job.
 *
 * @param options - URL, middleware, and fetch implementation.
 * @returns A decision transport.
 * @public
 */
export function createHttpDecisionTransport(
  options: HttpDecisionTransportOptions = {},
): Transport {
  const url = options.url ?? '/api/decide';
  const middleware = options.middleware ?? [];

  return async (request, signal) => {
    const abortError = () =>
      signal.reason ??
      new DOMException('The operation was aborted', 'AbortError');

    let init: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    };
    for (const apply of middleware) {
      init = await raceTransportOperationWithAbort(
        () => apply(init),
        signal,
        abortError,
      );
    }
    init = { ...init, signal };

    let response: Response;
    try {
      response = await (options.fetch ?? fetch)(url, init);
    } catch (error) {
      if (signal.aborted) throw abortError();
      throw new TransportError(
        error instanceof Error ? error.message : 'Decision request failed',
      );
    }

    if (!response.ok) {
      throw new TransportError(
        `Decision request failed with status ${response.status}`,
        {
          status: response.status,
          retryable: response.status >= 500 || response.status === 429,
        },
      );
    }

    try {
      // The body is passed through unchanged; the runtime decodes it.
      return (await response.json()) as DecisionResponse;
    } catch {
      if (signal.aborted) throw abortError();
      throw new TransportError('Decision response was not valid JSON', {
        status: response.status,
        retryable: false,
      });
    }
  };
}
