import { type AGUIEvent, EventType } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import { Chat } from '../models';
import {
  selectApiMessages,
  selectDebounce,
  selectPendingToolCalls,
  selectRawStreamingMessage,
  selectRawStreamingToolCalls,
  selectResponseSchema,
  selectRetries,
  selectShouldGenerateMessage,
  selectStreamingMessageError,
  selectSystem,
  selectThreadId,
  selectToolEntities,
  selectTools,
  selectTransport,
  selectUiRequested,
} from '../reducers';
import { s } from '../schema';
import {
  resolveTransport,
  TransportError,
  type TransportResponse,
} from '../transport';
import { createHashbrownRunAgentInput } from '../transport/hashbrown-run-agent-input';
import { sleep, switchAsync } from '../utils/async';
import { updateAssistantMessage } from '../utils/assistant-message';
import { createEffect } from '../utils/micro-ngrx';

type ActiveRun = {
  threadId: string;
  runId: string;
  terminal: boolean;
};

type ActiveGeneration = {
  threadId: string | undefined;
};

type EventIterationResult =
  | { kind: 'event'; result: IteratorResult<AGUIEvent> }
  | { kind: 'cancelled' }
  | { kind: 'retired' };

type RunOutcome =
  | { kind: 'finished' }
  | { kind: 'server-error'; error: Error }
  | { kind: 'cancelled' }
  | { kind: 'retired' };

export const generateMessage = createEffect((store) => {
  const effectAbortController = new AbortController();
  let cancelAbortController = new AbortController();
  let threadIdentityAbortController = new AbortController();
  let activeGeneration: ActiveGeneration | undefined;

  store.when(
    internalActions.start,
    devActions.setMessages,
    devActions.sendMessage,
    devActions.resendMessages,
    switchAsync(async (switchSignal) => {
      const generation: ActiveGeneration = {
        threadId: store.read(selectThreadId),
      };
      activeGeneration = store.read(selectShouldGenerateMessage)
        ? generation
        : undefined;
      const releaseGeneration = () => {
        if (activeGeneration === generation) {
          activeGeneration = undefined;
        }
      };

      if (cancelAbortController.signal.aborted) {
        cancelAbortController = new AbortController();
      }
      const runCancelSignal = cancelAbortController.signal;
      const retiredSignal = AbortSignal.any([
        effectAbortController.signal,
        switchSignal,
        threadIdentityAbortController.signal,
      ]);

      // Let sibling effects settle nested actions before snapshotting state.
      await Promise.resolve();

      const shouldGenerateMessage = store.read(selectShouldGenerateMessage);
      if (!shouldGenerateMessage) {
        releaseGeneration();
        return;
      }
      if (
        !retiredSignal.aborted &&
        !runCancelSignal.aborted &&
        activeGeneration === undefined
      ) {
        activeGeneration = generation;
      }

      const responseSchema = store.read(selectResponseSchema);
      const messages = store.read(selectApiMessages);
      const debounce = store.read(selectDebounce);
      const retries = store.read(selectRetries);
      const internalTools = store.read(selectTools);
      const tools = Chat.helpers.toApiToolsFromInternal(internalTools);
      const toolsByName = store.read(selectToolEntities);
      const system = store.read(selectSystem);
      const responseJsonSchema = responseSchema
        ? s.toJsonSchema(responseSchema)
        : undefined;
      const configuredThreadId = store.read(selectThreadId);
      const threadId = configuredThreadId ?? _createRequestId();
      generation.threadId = threadId;
      const uiRequested = store.read(selectUiRequested);
      await sleep(debounce, switchSignal);
      if (retiredSignal.aborted || runCancelSignal.aborted) {
        releaseGeneration();
        return;
      }

      const transportProvider = store.read(selectTransport);
      let transport;
      try {
        transport = resolveTransport(transportProvider);
        if (!transport) {
          throw new TransportError('No transport configured', {
            retryable: false,
            code: 'CONFIGURATION_ERROR',
          });
        }
      } catch (error) {
        if (retiredSignal.aborted || runCancelSignal.aborted) {
          releaseGeneration();
          return;
        }

        releaseGeneration();
        store.dispatch(
          apiActions.generateMessageError(
            error instanceof Error
              ? error
              : new Error('Unknown transport initialization error'),
          ),
        );
        return;
      }

      if (retiredSignal.aborted || runCancelSignal.aborted) {
        releaseGeneration();
        return;
      }
      const finalizeGeneration = () => {
        const streamingError = store.read(selectStreamingMessageError);
        if (streamingError) {
          store.dispatch(apiActions.generateMessageError(streamingError));
          return;
        }

        const streamingMessage = store.read(selectRawStreamingMessage);
        const streamingToolCalls = store.read(selectRawStreamingToolCalls);

        if (streamingMessage) {
          store.dispatch(
            apiActions.generateMessageSuccess({
              message: streamingMessage,
              toolCalls: streamingToolCalls,
            }),
          );
          return;
        }

        store.dispatch(
          apiActions.generateMessageError(
            new Error('No message was generated'),
          ),
        );
      };

      let attempt = 0;
      let exhaustedRetries = false;

      try {
        while (true) {
          if (retiredSignal.aborted || runCancelSignal.aborted) {
            return;
          }

          attempt++;

          const requestId = _createRequestId();
          const eventRequest = {
            input: createHashbrownRunAgentInput({
              threadId,
              runId: requestId,
              system,
              messages,
              tools,
              responseSchema: responseJsonSchema,
              ui: uiRequested,
            }),
            signal: AbortSignal.any([retiredSignal, runCancelSignal]),
            attempt,
            maxAttempts: retries + 1,
            requestId,
          };
          let transportResponse: TransportResponse | undefined;
          let eventIterator: AsyncIterator<AGUIEvent> | undefined;
          let iteratorDone = false;
          let cleanedUp = false;
          let activeRun: ActiveRun | undefined;

          const cleanup = async () => {
            if (cleanedUp) {
              return;
            }
            cleanedUp = true;

            const cleanupTasks: Promise<unknown>[] = [];
            if (!iteratorDone && eventIterator?.return) {
              cleanupTasks.push(
                Promise.resolve().then(() => eventIterator?.return?.()),
              );
            }
            if (transportResponse?.dispose) {
              cleanupTasks.push(
                Promise.resolve().then(() => transportResponse?.dispose?.()),
              );
            }

            await Promise.allSettled(cleanupTasks);
          };

          const synthesizeRunError = (
            message: string,
            allowCancelled = false,
          ) => {
            if (!activeRun || activeRun.terminal || retiredSignal.aborted) {
              return;
            }
            if (runCancelSignal.aborted && !allowCancelled) {
              return;
            }

            activeRun = { ...activeRun, terminal: true };
            store.dispatch(
              apiActions.generateMessageEvent({
                type: EventType.RUN_ERROR,
                message,
              }),
            );
          };

          let outcome: RunOutcome | undefined;
          let primaryError: Error | undefined;
          try {
            transportResponse = await transport.send(eventRequest);

            if (retiredSignal.aborted) {
              outcome = { kind: 'retired' };
            } else if (runCancelSignal.aborted) {
              outcome = { kind: 'cancelled' };
            } else {
              const events = transportResponse.events;
              if (
                !events ||
                typeof events[Symbol.asyncIterator] !== 'function'
              ) {
                throw new TransportError(
                  'Transport response did not provide an event stream',
                  { retryable: true, code: 'PROTOCOL_ERROR' },
                );
              }
              eventIterator = events[Symbol.asyncIterator]();

              while (!outcome) {
                const iteration = await _nextEvent(
                  eventIterator,
                  retiredSignal,
                  runCancelSignal,
                );

                if (iteration.kind === 'retired') {
                  outcome = { kind: 'retired' };
                  break;
                }
                if (iteration.kind === 'cancelled') {
                  outcome = { kind: 'cancelled' };
                  break;
                }

                const { result } = iteration;
                if (result.done) {
                  iteratorDone = true;
                  if (!activeRun) {
                    throw new TransportError(
                      'Generation stream ended before RUN_STARTED',
                      { retryable: true, code: 'PROTOCOL_ERROR' },
                    );
                  }
                  if (!activeRun.terminal) {
                    throw new TransportError(
                      'Generation stream ended before RUN_FINISHED or RUN_ERROR',
                      { retryable: true, code: 'PROTOCOL_ERROR' },
                    );
                  }
                  break;
                }

                if (retiredSignal.aborted) {
                  outcome = { kind: 'retired' };
                  break;
                }
                if (runCancelSignal.aborted) {
                  outcome = { kind: 'cancelled' };
                  break;
                }

                const event = result.value;
                if (!activeRun) {
                  if (event.type !== EventType.RUN_STARTED) {
                    throw new TransportError(
                      `Received ${event.type} before RUN_STARTED`,
                      { retryable: true, code: 'PROTOCOL_ERROR' },
                    );
                  }
                  if (
                    event.threadId !== threadId ||
                    event.runId !== requestId
                  ) {
                    throw new TransportError(
                      'RUN_STARTED identity does not match the attempted run',
                      { retryable: true, code: 'PROTOCOL_ERROR' },
                    );
                  }

                  if (retiredSignal.aborted || runCancelSignal.aborted) {
                    outcome = retiredSignal.aborted
                      ? { kind: 'retired' }
                      : { kind: 'cancelled' };
                    break;
                  }
                  store.dispatch(
                    apiActions.generateMessageStart({
                      responseSchema,
                      toolsByName,
                    }),
                  );
                  if (retiredSignal.aborted || runCancelSignal.aborted) {
                    outcome = retiredSignal.aborted
                      ? { kind: 'retired' }
                      : { kind: 'cancelled' };
                    break;
                  }
                  activeRun = {
                    threadId: event.threadId,
                    runId: event.runId,
                    terminal: false,
                  };
                  store.dispatch(apiActions.generateMessageEvent(event));
                  continue;
                }

                if (event.type === EventType.RUN_STARTED) {
                  throw new TransportError('Received duplicate RUN_STARTED', {
                    retryable: true,
                    code: 'PROTOCOL_ERROR',
                  });
                }

                if (event.type === EventType.RUN_FINISHED) {
                  if (
                    event.threadId !== activeRun.threadId ||
                    event.runId !== activeRun.runId
                  ) {
                    throw new TransportError(
                      'RUN_FINISHED identity does not match the active run',
                      { retryable: true, code: 'PROTOCOL_ERROR' },
                    );
                  }

                  activeRun = { ...activeRun, terminal: true };
                  if (!retiredSignal.aborted && !runCancelSignal.aborted) {
                    store.dispatch(apiActions.generateMessageEvent(event));
                    outcome = { kind: 'finished' };
                  } else {
                    outcome = retiredSignal.aborted
                      ? { kind: 'retired' }
                      : { kind: 'cancelled' };
                  }
                  break;
                }

                if (event.type === EventType.RUN_ERROR) {
                  activeRun = { ...activeRun, terminal: true };
                  if (!retiredSignal.aborted && !runCancelSignal.aborted) {
                    store.dispatch(apiActions.generateMessageEvent(event));
                    outcome = {
                      kind: 'server-error',
                      error: new Error(event.message),
                    };
                  } else {
                    outcome = retiredSignal.aborted
                      ? { kind: 'retired' }
                      : { kind: 'cancelled' };
                  }
                  break;
                }

                if (!retiredSignal.aborted && !runCancelSignal.aborted) {
                  store.dispatch(apiActions.generateMessageEvent(event));
                } else {
                  outcome = retiredSignal.aborted
                    ? { kind: 'retired' }
                    : { kind: 'cancelled' };
                }
              }
            }
          } catch (error) {
            primaryError =
              error instanceof Error
                ? error
                : new Error('Unknown transport error');
          } finally {
            await cleanup();
          }

          if (retiredSignal.aborted || outcome?.kind === 'retired') {
            return;
          }

          if (outcome?.kind === 'finished') {
            releaseGeneration();
            finalizeGeneration();
            break;
          }

          if (outcome?.kind === 'server-error') {
            releaseGeneration();
            store.dispatch(apiActions.generateMessageError(outcome.error));
            break;
          }

          if (runCancelSignal.aborted || outcome?.kind === 'cancelled') {
            synthesizeRunError('Generation cancelled', true);
            return;
          }

          if (!primaryError) {
            primaryError = new TransportError(
              'Generation ended without a terminal outcome',
              { retryable: true, code: 'PROTOCOL_ERROR' },
            );
          }

          synthesizeRunError(primaryError.message);
          store.dispatch(apiActions.generateMessageError(primaryError));

          const retryable =
            !(primaryError instanceof TransportError) ||
            primaryError.retryable !== false;
          if (!retryable || attempt >= retries + 1) {
            exhaustedRetries = retryable && retries > 0;
            break;
          }
        }
      } finally {
        releaseGeneration();
        if (!retiredSignal.aborted) {
          store.dispatch(
            apiActions.assistantTurnFinalized({
              toolCalls: store.read(selectPendingToolCalls),
              continuation: runCancelSignal.aborted ? 'stop' : 'continue',
            }),
          );
        }
      }

      if (exhaustedRetries) {
        store.dispatch(apiActions.generateMessageExhaustedRetries());
      }
    }, effectAbortController.signal),
  );

  store.when(internalActions.toolTurnSettled, (action) => {
    if (action.payload.continuation !== 'continue') {
      return;
    }

    store.dispatch(internalActions.start());
  });

  store.when(devActions.stopMessageGeneration, () => {
    activeGeneration = undefined;
    cancelAbortController.abort();
  });

  store.when(devActions.updateOptions, (action) => {
    if (!Object.prototype.hasOwnProperty.call(action.payload, 'threadId')) {
      return;
    }
    if (activeGeneration?.threadId === action.payload.threadId) {
      return;
    }

    const retiredGeneration = activeGeneration;
    activeGeneration = undefined;
    threadIdentityAbortController.abort();
    threadIdentityAbortController = new AbortController();

    if (retiredGeneration) {
      store.dispatch(internalActions.generationSilentlyRetired());
    }
  });

  return () => {
    activeGeneration = undefined;
    effectAbortController.abort();
    cancelAbortController.abort();
    threadIdentityAbortController.abort();
  };
});

function _nextEvent(
  iterator: AsyncIterator<AGUIEvent>,
  retiredSignal: AbortSignal,
  cancelSignal: AbortSignal,
): Promise<EventIterationResult> {
  if (retiredSignal.aborted) {
    return Promise.resolve({ kind: 'retired' });
  }
  if (cancelSignal.aborted) {
    return Promise.resolve({ kind: 'cancelled' });
  }

  return new Promise<EventIterationResult>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      retiredSignal.removeEventListener('abort', handleRetired);
      cancelSignal.removeEventListener('abort', handleCancelled);
    };
    const settle = (result: EventIterationResult) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(result);
    };
    const fail = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };
    const handleRetired = () => settle({ kind: 'retired' });
    const handleCancelled = () => settle({ kind: 'cancelled' });

    retiredSignal.addEventListener('abort', handleRetired, { once: true });
    cancelSignal.addEventListener('abort', handleCancelled, { once: true });
    Promise.resolve()
      .then(() => iterator.next())
      .then((result) => settle({ kind: 'event', result }), fail);
  });
}

function _createRequestId() {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
}

export function _updateMessagesWithDelta(
  message: Chat.Api.AssistantMessage | null,
  delta: Chat.Api.CompletionChunk,
): Chat.Api.AssistantMessage | null {
  return updateAssistantMessage(message, delta);
}
