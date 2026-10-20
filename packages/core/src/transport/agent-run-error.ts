/**
 * Error raised when an agent run ends with an AG-UI `RUN_ERROR` event.
 *
 * @remarks
 * The agent server reported the failure, so Hashbrown does not retry it.
 * The event's optional `code` is kept so callers can branch on it, for
 * example to tell a rate limit from a bad request.
 *
 * @example
 * ```ts
 * const error = chat.error();
 * if (error instanceof AgentRunError && error.code === 'THREAD_BUSY') {
 *   showBusyBanner();
 * }
 * ```
 *
 * @public
 */
export class AgentRunError extends Error {
  /** The `code` from the `RUN_ERROR` event, when the server sent one. */
  readonly code?: string;

  /**
   * Creates an agent run error.
   *
   * @param message - The `message` from the `RUN_ERROR` event.
   * @param options - Optional details from the event.
   */
  constructor(message: string, options: { code?: string } = {}) {
    super(message);
    this.name = 'AgentRunError';
    this.code = options.code;
  }
}
