/**
 * The machine-readable reason a decision failed.
 *
 * @public
 */
export type DecisionErrorCode =
  | 'invalid_request'
  | 'unauthorized'
  | 'rate_limited'
  | 'upstream'
  | 'invalid_response';

/**
 * An error raised by {@link HashbrownTypeSafe.decide}. Map `status` straight
 * onto your HTTP response.
 *
 * @public
 */
export class DecisionError extends Error {
  override readonly name = 'DecisionError';

  /**
   * @param code - The machine-readable reason.
   * @param status - The HTTP status to answer with.
   * @param message - A human-readable description.
   * @param cause - The underlying error, if any.
   */
  constructor(
    readonly code: DecisionErrorCode,
    readonly status: number,
    message: string,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
  }
}
