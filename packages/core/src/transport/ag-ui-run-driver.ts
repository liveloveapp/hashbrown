import { type AGUIEvent, EventType } from '@ag-ui/core';
import type {
  Transport,
  TransportRequest,
  TransportResponse,
} from './transport';
import { TransportError } from './transport-error';

/**
 * Result of executing one AG-UI transport attempt.
 *
 * @internal
 */
export type AgUiRunAttemptOutcome =
  | { kind: 'finished' }
  | { kind: 'server-error'; error: Error }
  | { kind: 'cancelled' }
  | { kind: 'retired' };

/**
 * Inputs for executing and observing one AG-UI transport attempt.
 *
 * @internal
 */
export interface RunAgUiAttemptOptions {
  transport: Transport;
  request: TransportRequest;
  cancelSignal: AbortSignal;
  retiredSignal: AbortSignal;
  onStarted: () => void | Promise<void>;
  onEvent: (event: AGUIEvent) => void | Promise<void>;
}

type InterruptionOutcome = Extract<
  AgUiRunAttemptOutcome,
  { kind: 'cancelled' | 'retired' }
>;

type SettledSend =
  | { kind: 'response'; response: TransportResponse }
  | { kind: 'error'; error: unknown };

type SettledNext =
  | { kind: 'event'; result: IteratorResult<AGUIEvent> }
  | { kind: 'error'; error: unknown };

type InterruptionWait = {
  promise: Promise<{ kind: 'interrupted' }>;
  dispose: () => void;
};

type RunIdentity = {
  readonly threadId: string;
  readonly runId: string;
};

/**
 * Executes exactly one transport request and validates its AG-UI run protocol.
 *
 * @internal
 */
export async function runAgUiAttempt({
  transport,
  request,
  cancelSignal,
  retiredSignal,
  onStarted,
  onEvent,
}: RunAgUiAttemptOptions): Promise<AgUiRunAttemptOutcome> {
  const interruptionBeforeSend = getInterruption(retiredSignal, cancelSignal);
  if (interruptionBeforeSend) {
    return interruptionBeforeSend;
  }

  const expectedIdentity: RunIdentity = {
    threadId: request.input.threadId,
    runId: request.input.runId,
  };
  const sendPromise = transport.send(request);
  const settledSend = settleSend(sendPromise);
  const sendInterruption = waitForInterruption(retiredSignal, cancelSignal);
  const sendResult = await Promise.race([
    settledSend,
    sendInterruption.promise,
  ]);
  sendInterruption.dispose();

  const interruptionAfterSend = getInterruption(retiredSignal, cancelSignal);
  if (sendResult.kind === 'interrupted' || interruptionAfterSend) {
    if (sendResult.kind === 'response') {
      await disposeResponse(sendResult.response);
    } else if (sendResult.kind === 'interrupted') {
      void sendPromise.then(
        async (lateResponse) => disposeResponse(lateResponse),
        () => undefined,
      );
    }

    return (
      interruptionAfterSend ??
      getInterruption(retiredSignal, cancelSignal) ?? {
        kind: 'cancelled',
      }
    );
  }

  if (sendResult.kind === 'error') {
    throw sendResult.error;
  }

  return consumeResponse({
    response: sendResult.response,
    expectedIdentity,
    cancelSignal,
    retiredSignal,
    onStarted,
    onEvent,
  });
}

async function consumeResponse({
  response,
  expectedIdentity,
  cancelSignal,
  retiredSignal,
  onStarted,
  onEvent,
}: Pick<
  RunAgUiAttemptOptions,
  'cancelSignal' | 'retiredSignal' | 'onStarted' | 'onEvent'
> & {
  response: TransportResponse;
  expectedIdentity: RunIdentity;
}): Promise<AgUiRunAttemptOutcome> {
  let iterator: AsyncIterator<AGUIEvent> | undefined;
  let iteratorDone = false;
  let cleanedUp = false;

  const cleanup = async () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;

    const cleanupTasks: Promise<void>[] = [];
    if (!iteratorDone && iterator) {
      cleanupTasks.push(closeIterator(iterator));
    }
    cleanupTasks.push(disposeResponse(response));

    await Promise.allSettled(cleanupTasks);
  };

  try {
    const events = response.events;
    if (!events || typeof events[Symbol.asyncIterator] !== 'function') {
      throw protocolError('Transport response did not provide an event stream');
    }

    iterator = events[Symbol.asyncIterator]();
    let started = false;

    while (true) {
      const interruptionBeforeNext = getInterruption(
        retiredSignal,
        cancelSignal,
      );
      if (interruptionBeforeNext) {
        return interruptionBeforeNext;
      }

      const nextResult = await nextEvent(iterator, retiredSignal, cancelSignal);
      if (nextResult.kind === 'interrupted') {
        return (
          getInterruption(retiredSignal, cancelSignal) ?? {
            kind: 'cancelled',
          }
        );
      }
      if (nextResult.kind === 'error') {
        throw nextResult.error;
      }

      const { result } = nextResult;
      if (result.done) {
        iteratorDone = true;
        if (!started) {
          throw protocolError('Generation stream ended before RUN_STARTED');
        }

        throw protocolError(
          'Generation stream ended before RUN_FINISHED or RUN_ERROR',
        );
      }

      const interruptionBeforeEvent = getInterruption(
        retiredSignal,
        cancelSignal,
      );
      if (interruptionBeforeEvent) {
        return interruptionBeforeEvent;
      }

      const event = result.value;
      if (!started) {
        if (event.type !== EventType.RUN_STARTED) {
          throw protocolError(`Received ${event.type} before RUN_STARTED`);
        }
        if (
          event.threadId !== expectedIdentity.threadId ||
          event.runId !== expectedIdentity.runId
        ) {
          throw protocolError(
            'RUN_STARTED identity does not match the attempted run',
          );
        }

        await invokeCallback(onStarted);
        const interruptionAfterStarted = getInterruption(
          retiredSignal,
          cancelSignal,
        );
        if (interruptionAfterStarted) {
          return interruptionAfterStarted;
        }

        started = true;
        await invokeCallback(() => onEvent(event));
        continue;
      }

      if (event.type === EventType.RUN_STARTED) {
        throw protocolError('Received duplicate RUN_STARTED');
      }

      if (event.type === EventType.RUN_FINISHED) {
        if (
          event.threadId !== expectedIdentity.threadId ||
          event.runId !== expectedIdentity.runId
        ) {
          throw protocolError(
            'RUN_FINISHED identity does not match the active run',
          );
        }

        await invokeCallback(() => onEvent(event));
        return { kind: 'finished' };
      }

      if (event.type === EventType.RUN_ERROR) {
        await invokeCallback(() => onEvent(event));
        return { kind: 'server-error', error: new Error(event.message) };
      }

      await invokeCallback(() => onEvent(event));
    }
  } finally {
    await cleanup();
  }
}

async function nextEvent(
  iterator: AsyncIterator<AGUIEvent>,
  retiredSignal: AbortSignal,
  cancelSignal: AbortSignal,
): Promise<SettledNext | { kind: 'interrupted' }> {
  const settledNext: Promise<SettledNext> = Promise.resolve()
    .then(() => iterator.next())
    .then(
      (result) => ({ kind: 'event' as const, result }),
      (error: unknown) => ({ kind: 'error' as const, error }),
    );
  const interruption = waitForInterruption(retiredSignal, cancelSignal);

  const result = await Promise.race([settledNext, interruption.promise]);
  interruption.dispose();

  return result;
}

function settleSend(send: Promise<TransportResponse>): Promise<SettledSend> {
  return send.then(
    (response) => ({ kind: 'response', response }),
    (error: unknown) => ({ kind: 'error', error }),
  );
}

function waitForInterruption(
  retiredSignal: AbortSignal,
  cancelSignal: AbortSignal,
): InterruptionWait {
  let resolveInterruption!: (result: { kind: 'interrupted' }) => void;
  const promise = new Promise<{ kind: 'interrupted' }>((resolve) => {
    resolveInterruption = resolve;
  });
  const handleInterruption = () => {
    resolveInterruption({ kind: 'interrupted' });
  };

  retiredSignal.addEventListener('abort', handleInterruption, { once: true });
  cancelSignal.addEventListener('abort', handleInterruption, { once: true });
  if (getInterruption(retiredSignal, cancelSignal)) {
    handleInterruption();
  }

  return {
    promise,
    dispose: () => {
      retiredSignal.removeEventListener('abort', handleInterruption);
      cancelSignal.removeEventListener('abort', handleInterruption);
    },
  };
}

function getInterruption(
  retiredSignal: AbortSignal,
  cancelSignal: AbortSignal,
): InterruptionOutcome | undefined {
  if (retiredSignal.aborted) {
    return { kind: 'retired' };
  }
  if (cancelSignal.aborted) {
    return { kind: 'cancelled' };
  }

  return undefined;
}

async function disposeResponse(response: TransportResponse): Promise<void> {
  try {
    const dispose = response.dispose;
    if (dispose) {
      await dispose.call(response);
    }
  } catch {
    // Cleanup must not replace the attempt's primary result or error.
  }
}

async function closeIterator(
  iterator: AsyncIterator<AGUIEvent>,
): Promise<void> {
  try {
    const returnIterator = iterator.return;
    if (returnIterator) {
      await returnIterator.call(iterator);
    }
  } catch {
    // Cleanup must not replace the attempt's primary result or error.
  }
}

function protocolError(message: string): TransportError {
  return new TransportError(message, {
    retryable: true,
    code: 'PROTOCOL_ERROR',
  });
}

async function invokeCallback(
  callback: () => void | Promise<void>,
): Promise<void> {
  try {
    await callback();
  } catch (error) {
    if (
      error instanceof TransportError &&
      error.code === 'PROTOCOL_ERROR' &&
      !error.retryable
    ) {
      throw error;
    }

    throw new TransportError(
      error instanceof Error ? error.message : 'AG-UI callback failed',
      {
        retryable: false,
        code: 'PROTOCOL_ERROR',
      },
    );
  }
}
