import type { AGUIEvent } from '@ag-ui/core';
import type { Transport, TransportRequest } from '../transport';
import { TransportError } from '../transport';
import { runAgUiAttempt } from '../transport/ag-ui-run-driver';
import {
  createLogicalRunRetryState,
  decideLogicalRunFailure,
  startLogicalRunAttempt,
} from './logical-run-retry-policy';

/**
 * Identity and cancellation metadata for one attempt in a logical run.
 *
 * @internal
 */
export interface LogicalRunAttemptContext {
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly signal: AbortSignal;
}

/**
 * Metadata used to construct one request in a logical run.
 *
 * @internal
 */
export type LogicalRunRequestContext = LogicalRunAttemptContext;

/**
 * Inputs for executing and observing one logical AG-UI run.
 *
 * @internal
 */
export interface ExecuteLogicalRunOptions {
  readonly transport: Transport;
  readonly retries: number;
  readonly cancelSignal: AbortSignal;
  readonly retiredSignal: AbortSignal;
  readonly createRequest: (
    context: LogicalRunRequestContext,
  ) => TransportRequest;
  readonly onAttemptStarted?: (context: LogicalRunAttemptContext) => void;
  readonly onStarted: (context: LogicalRunAttemptContext) => void;
  readonly onEvent: (
    event: AGUIEvent,
    context: LogicalRunAttemptContext,
  ) => void;
  readonly onAttemptRolledBack?: (
    context: LogicalRunAttemptContext,
    error: Error | undefined,
  ) => void;
  readonly onAttemptError: (error: Error) => void;
}

/**
 * Terminal result of one logical AG-UI run across all of its attempts.
 *
 * @internal
 */
export type LogicalRunOutcome =
  | { readonly kind: 'finished' }
  | { readonly kind: 'server-error'; readonly error: Error }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'retired' }
  | {
      readonly kind: 'failed';
      readonly error: Error;
      readonly exhaustedRetries: boolean;
    };

/**
 * Executes a logical AG-UI run, including retries and attempt lifecycle repair.
 *
 * @internal
 */
export async function executeLogicalRun({
  transport,
  retries,
  cancelSignal,
  retiredSignal,
  createRequest,
  onAttemptStarted,
  onStarted,
  onEvent,
  onAttemptRolledBack,
  onAttemptError,
}: ExecuteLogicalRunOptions): Promise<LogicalRunOutcome> {
  let retryState = createLogicalRunRetryState(retries);

  while (true) {
    const interruption = getInterruption(retiredSignal, cancelSignal);
    if (interruption) {
      return interruption;
    }

    const startedAttempt = startLogicalRunAttempt(retryState);
    retryState = startedAttempt.state;
    const context: LogicalRunAttemptContext = {
      ...startedAttempt.context,
      signal: AbortSignal.any([retiredSignal, cancelSignal]),
    };
    const request = createRequest(context);
    let primaryError: Error | undefined;
    try {
      onAttemptStarted?.(context);
      const outcome = await runAgUiAttempt({
        transport,
        request,
        cancelSignal,
        retiredSignal,
        onStarted: () => onStarted(context),
        onEvent: (event) => onEvent(event, context),
      });

      if (retiredSignal.aborted || outcome.kind === 'retired') {
        onAttemptRolledBack?.(context, undefined);
        return { kind: 'retired' };
      }
      if (outcome.kind === 'finished') {
        return outcome;
      }
      if (outcome.kind === 'server-error') {
        onAttemptRolledBack?.(context, outcome.error);
        return outcome;
      }
      if (cancelSignal.aborted || outcome.kind === 'cancelled') {
        onAttemptRolledBack?.(context, undefined);
        return { kind: 'cancelled' };
      }
    } catch (error) {
      primaryError =
        error instanceof Error ? error : new Error('Unknown transport error');
    }

    const interruptionAfterFailure = getInterruption(
      retiredSignal,
      cancelSignal,
    );
    if (interruptionAfterFailure?.kind === 'retired') {
      onAttemptRolledBack?.(context, undefined);
      return interruptionAfterFailure;
    }
    if (interruptionAfterFailure?.kind === 'cancelled') {
      onAttemptRolledBack?.(context, undefined);
      return interruptionAfterFailure;
    }

    const error =
      primaryError ??
      new TransportError('Generation ended without a terminal outcome', {
        retryable: true,
        code: 'PROTOCOL_ERROR',
      });
    onAttemptRolledBack?.(context, error);
    onAttemptError(error);

    const failureDecision = decideLogicalRunFailure(retryState, error);
    if (failureDecision.kind === 'stop') {
      return {
        kind: 'failed',
        error,
        exhaustedRetries: failureDecision.exhaustedRetries,
      };
    }
  }
}

function getInterruption(
  retiredSignal: AbortSignal,
  cancelSignal: AbortSignal,
): Extract<LogicalRunOutcome, { kind: 'retired' | 'cancelled' }> | undefined {
  if (retiredSignal.aborted) {
    return { kind: 'retired' };
  }
  if (cancelSignal.aborted) {
    return { kind: 'cancelled' };
  }

  return undefined;
}
