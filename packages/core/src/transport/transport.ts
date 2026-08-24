import type { AGUIEvent, RunAgentInput } from '@ag-ui/core';

/**
 * Metadata returned alongside transport responses.
 *
 * @public
 */
export interface TransportMetadata {
  [key: string]: unknown;
}

/**
 * Request payload handed to transports.
 *
 * @public
 */
export interface TransportRequest {
  input: RunAgentInput & {
    hashbrown?: {
      responseSchema?: object;
      ui?: boolean;
    };
  };
  signal: AbortSignal;
  attempt: number;
  maxAttempts: number;
  requestId: string;
}

/**
 * Response returned from transports.
 *
 * @public
 */
export interface TransportResponse {
  events: AsyncIterable<AGUIEvent>;
  metadata?: TransportMetadata;
  dispose?: () => void | Promise<void>;
}

/**
 * Abstraction for AG-UI event responses.
 *
 * @public
 */
export interface Transport {
  readonly name: string;
  send(request: TransportRequest): Promise<TransportResponse>;
}

/**
 * Function that produces a transport lazily.
 *
 * @public
 */
export type TransportFactory = () => Transport;

/**
 * Either a concrete transport or a lazily-created transport.
 *
 * @public
 */
export type TransportOrFactory = Transport | TransportFactory;

/**
 * Resolve a transport or factory into a concrete transport instance.
 * Factories are invoked lazily; callers are responsible for memoization.
 *
 * @public
 */
export function resolveTransport(
  candidate?: TransportOrFactory,
): Transport | undefined {
  if (!candidate) {
    return undefined;
  }

  return typeof candidate === 'function'
    ? (candidate as TransportFactory)()
    : candidate;
}

export { TransportError } from './transport-error';
