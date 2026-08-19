import type { AGUIEvent, RunAgentInput } from '@ag-ui/core';
import { Chat } from '../models';
import { Frame } from '../frames';
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
  /**
   * Modern AG-UI input sent directly to AG-UI-compatible transports.
   */
  input?: RunAgentInput & {
    hashbrown?: {
      responseSchema?: object;
      ui?: boolean;
    };
  };
  /**
   * Legacy completion parameters used by frame-based providers.
   *
   * @deprecated Modern transports should consume `input`.
   */
  params: Chat.Api.CompletionCreateParams;
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
  /** Validated AG-UI events streamed by a modern transport. */
  events?: AsyncIterable<AGUIEvent>;
  stream?: ReadableStream<Uint8Array>;
  frames?: AsyncGenerator<Frame>;
  metadata?: TransportMetadata;
  dispose?: () => void | Promise<void>;
}

/**
 * Abstraction for modern AG-UI event responses and deprecated legacy frame or
 * byte-stream responses.
 *
 * @public
 */
export interface Transport {
  readonly name: string;
  /**
   * Whether this transport supports legacy thread-loading requests. When
   * omitted, the current legacy behavior is preserved. Modern HTTP transport
   * implementations set this to `false`.
   */
  readonly supportsLegacyThreadLoading?: boolean;
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
