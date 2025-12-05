export interface TransportErrorOptions {
  /** Indicates whether the error condition is retryable. Defaults to true. */
  retryable?: boolean;
  /** Optional HTTP status or transport-specific status code. */
  status?: number;
  /** Optional machine-readable error code. */
  code?: string;
}

/**
 * Error thrown by transports when they cannot satisfy a request.
 *
 * @public
 */
export class TransportError extends Error {
  readonly retryable: boolean;
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, options: TransportErrorOptions = {}) {
    super(message);
    this.name = 'TransportError';
    this.retryable = options.retryable ?? true;
    this.status = options.status;
    this.code = options.code;
  }
}
