import { Chat } from '../models';
import { Transport, TransportRequest, TransportResponse } from './transport';
import { TransportError } from './transport-error';

export interface HttpTransportOptions {
  baseUrl: string;
  middleware?: Chat.Middleware[];
  fetchImpl?: typeof fetch;
}

/**
 * Default HTTP-based transport that mirrors Hashbrown's legacy behavior.
 *
 * @public
 */
export class HttpTransport implements Transport {
  readonly name = 'HttpTransport';
  private readonly baseUrl: string;
  private readonly middleware?: Chat.Middleware[];
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpTransportOptions) {
    this.baseUrl = options.baseUrl;
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
    if (!this.baseUrl) {
      throw new TransportError('Missing base URL for HttpTransport', {
        retryable: false,
      });
    }

    let requestInit: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request.params),
      signal: request.signal,
    };

    if (this.middleware?.length) {
      for (const middleware of this.middleware) {
        requestInit = await middleware(requestInit);
      }
    }

    const response = await this.fetchImpl(this.baseUrl, requestInit);

    if (!response.ok) {
      let bodyText: string | undefined;
      try {
        bodyText = await response.text();
      } catch {
        bodyText = undefined;
      }

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

    return {
      stream: response.body,
      metadata: {
        status: response.status,
      },
    };
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
