import { TransportError } from '../transport';

/**
 * Synchronous retry state for one logical run.
 *
 * @internal
 */
export interface LogicalRunRetryState {
  readonly retries: number;
  readonly attempt: number;
}

/**
 * Attempt metadata supplied to one transport request.
 *
 * @internal
 */
export interface LogicalRunAttemptContext {
  readonly attempt: number;
  readonly maxAttempts: number;
}

/**
 * The next immutable retry state and its transport attempt metadata.
 *
 * @internal
 */
export interface StartedLogicalRunAttempt {
  readonly state: LogicalRunRetryState;
  readonly context: LogicalRunAttemptContext;
}

/**
 * The synchronous policy decision after a logical-run attempt fails.
 *
 * @internal
 */
export type LogicalRunFailureDecision =
  | { readonly kind: 'retry' }
  | { readonly kind: 'stop'; readonly exhaustedRetries: boolean };

/**
 * Creates retry state before the first attempt of a logical run.
 *
 * @internal
 */
export function createLogicalRunRetryState(
  retries: number,
): LogicalRunRetryState {
  return { retries, attempt: 0 };
}

/**
 * Advances retry state and returns metadata for the started attempt.
 *
 * @internal
 */
export function startLogicalRunAttempt(
  state: LogicalRunRetryState,
): StartedLogicalRunAttempt {
  const attempt = state.attempt + 1;

  return {
    state: { retries: state.retries, attempt },
    context: { attempt, maxAttempts: state.retries + 1 },
  };
}

/**
 * Decides whether a failed attempt should retry or stop.
 *
 * @internal
 */
export function decideLogicalRunFailure(
  state: LogicalRunRetryState,
  error: Error,
): LogicalRunFailureDecision {
  const retryable =
    !(error instanceof TransportError) || error.retryable !== false;

  if (!retryable || state.attempt >= state.retries + 1) {
    return {
      kind: 'stop',
      exhaustedRetries: retryable && state.retries > 0,
    };
  }

  return { kind: 'retry' };
}
