import { type AGUIEvent, EventType } from '@ag-ui/core';
import type { Transport, TransportRequest } from '../transport';
import { TransportError } from '../transport';
import { runAgUiAttempt } from '../transport/ag-ui-run-driver';
import {
  createLogicalRunRetryState,
  decideLogicalRunFailure,
  startLogicalRunAttempt,
} from './logical-run-retry-policy';

/**
 * Metadata used to construct one request in a logical run.
 *
 * @internal
 */
export interface LogicalRunRequestContext {
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly signal: AbortSignal;
}

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
  readonly onStarted: () => void;
  readonly onEvent: (event: AGUIEvent) => void;
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
  onStarted,
  onEvent,
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
    const request = createRequest({
      ...startedAttempt.context,
      signal: AbortSignal.any([retiredSignal, cancelSignal]),
    });
    let runStarted = false;
    let runTerminal = false;

    const emitRunError = (message: string, allowCancelled = false) => {
      if (!runStarted || runTerminal || retiredSignal.aborted) {
        return;
      }
      if (cancelSignal.aborted && !allowCancelled) {
        return;
      }

      runTerminal = true;
      onEvent({ type: EventType.RUN_ERROR, message });
    };

    let primaryError: Error | undefined;
    try {
      const outcome = await runAgUiAttempt({
        transport,
        request,
        cancelSignal,
        retiredSignal,
        onStarted,
        onEvent: (event) => {
          if (event.type === EventType.RUN_STARTED) {
            runStarted = true;
          }
          if (
            event.type === EventType.RUN_FINISHED ||
            event.type === EventType.RUN_ERROR
          ) {
            runTerminal = true;
          }

          onEvent(event);
        },
      });

      if (retiredSignal.aborted || outcome.kind === 'retired') {
        return { kind: 'retired' };
      }
      if (outcome.kind === 'finished') {
        return outcome;
      }
      if (outcome.kind === 'server-error') {
        return outcome;
      }
      if (cancelSignal.aborted || outcome.kind === 'cancelled') {
        emitRunError('Generation cancelled', true);
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
      return interruptionAfterFailure;
    }
    if (interruptionAfterFailure?.kind === 'cancelled') {
      emitRunError('Generation cancelled', true);
      return interruptionAfterFailure;
    }

    const error =
      primaryError ??
      new TransportError('Generation ended without a terminal outcome', {
        retryable: true,
        code: 'PROTOCOL_ERROR',
      });
    emitRunError(error.message);
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
