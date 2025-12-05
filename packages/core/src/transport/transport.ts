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
  stream?: ReadableStream<Uint8Array>;
  frames?: AsyncGenerator<Frame>;
  metadata?: TransportMetadata;
  dispose?: () => void | Promise<void>;
}

/**
 * Abstraction that converts chat params into a frame stream.
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
