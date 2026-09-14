import {
  assertInterruptsNotExpired,
  validateInterruptOutcome,
} from '../transport/interrupt-validation';
import { ɵselectInterrupts } from '../reducers';
import { type AGUIEvent, EventType } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import { Chat } from '../models';
import { ɵprepareAgUiMessageEvent } from '../reducers/ag-ui-message-history';
import {
  selectDebounce,
  selectRawStreamingMessage,
  selectResponseSchema,
  selectRetries,
  selectShouldGenerateMessage,
  selectStreamingMessageError,
  selectThreadId,
  selectToolEntities,
  selectTools,
  selectTransport,
  selectUiRequested,
  ɵselectAgentStateProtocolError,
  ɵselectAgUiMessagesProtocolError,
  ɵselectAttemptOwnedPendingToolCalls,
  ɵselectCommittedAgentState,
  ɵselectEffectiveCommittedAgUiMessages,
  ɵselectGenerationAttemptId,
  ɵselectGenerationId,
} from '../reducers';
import { s } from '../schema';
import { resolveTransport, TransportError } from '../transport';
import { createCanonicalRunAgentInput } from '../transport/hashbrown-run-agent-input';
import {
  normalizeToolRejection,
  normalizeToolResult,
} from '../transport/normalize-tool-result';
import { sleep } from '../utils/async';
import { updateAssistantMessage } from '../utils/assistant-message';
import { createEffect } from '../utils/micro-ngrx';
import {
  type AssistantTurnCoordinator,
  type AssistantTurnToolSnapshot,
  createAssistantTurnCoordinator,
} from './assistant-turn-coordinator';
import { executeLogicalRun } from './logical-run-coordinator';
import type { ToolTurnOutcome } from './tool-turn-coordinator';

type ActiveGeneration = {
  coordinator: AssistantTurnCoordinator;
  generationId: string;
  threadId: string | undefined;
  unclaimedToolSnapshot: AssistantTurnToolSnapshot | undefined;
  activeAttempt:
    | {
        context: object;
        attemptId: string;
        terminalAccepted: boolean;
        terminalEvent: AGUIEvent | undefined;
        toolsByName: Record<string, Chat.Internal.Tool>;
      }
    | undefined;
  settled: boolean;
};

export const generateMessage = createEffect((store) => {
  let activeGeneration: ActiveGeneration | undefined;
  let disposed = false;

  const ownsGeneration = (generation: ActiveGeneration) =>
    !generation.settled &&
    activeGeneration === generation &&
    store.read(ɵselectGenerationId) === generation.generationId;

  const ownsAttempt = (generation: ActiveGeneration, context: object) =>
    ownsGeneration(generation) &&
    generation.activeAttempt?.context === context &&
    store.read(ɵselectGenerationAttemptId) ===
      generation.activeAttempt.attemptId;

  const readSynchronizationProtocolError = () => {
    const stateProtocolError = store.read(ɵselectAgentStateProtocolError);
    const messagesProtocolError = store.read(ɵselectAgUiMessagesProtocolError);

    return stateProtocolError ?? messagesProtocolError;
  };

  const assertSynchronizationProtocolIsValid = () => {
    const protocolError = readSynchronizationProtocolError();
    if (protocolError) {
      throw synchronizationProtocolError(protocolError);
    }
  };

  const releaseAttempt = (
    generation: ActiveGeneration,
    context: object,
    rollback: boolean,
    dispatch: typeof store.dispatch = store.dispatch,
    onCommit?: (callback: () => void) => void,
  ) => {
    if (!ownsAttempt(generation, context)) {
      return false;
    }

    const attemptId = generation.activeAttempt?.attemptId;
    if (!attemptId) {
      return false;
    }
    if (rollback) {
      dispatch(internalActions.generationAttemptRolledBack());
    }
    if (!ownsAttempt(generation, context)) {
      return false;
    }
    dispatch(
      internalActions.generationAttemptReleased({
        generationId: generation.generationId,
        attemptId,
      }),
    );
    const clearActiveAttempt = () => {
      if (generation.activeAttempt?.attemptId === attemptId) {
        generation.activeAttempt = undefined;
      }
    };
    if (onCommit) {
      onCommit(clearActiveAttempt);
    } else {
      clearActiveAttempt();
    }

    return true;
  };

  const settleLogicalGeneration = (generation: ActiveGeneration) => {
    if (!ownsGeneration(generation)) {
      return false;
    }

    const attempt = generation.activeAttempt;
    if (attempt) {
      releaseAttempt(generation, attempt.context, true);
    }
    if (!ownsGeneration(generation)) {
      return false;
    }

    store.dispatch(
      internalActions.logicalGenerationSettled({
        generationId: generation.generationId,
      }),
    );
    generation.settled = true;
    if (activeGeneration === generation) {
      activeGeneration = undefined;
    }

    return true;
  };

  const finishAttempt = (
    generation: ActiveGeneration,
    context: object,
    dispatch: typeof store.dispatch = store.dispatch,
    onCommit?: (callback: () => void) => void,
  ) => {
    if (!ownsAttempt(generation, context)) {
      return false;
    }

    const attemptId = generation.activeAttempt?.attemptId;
    if (!attemptId) return false;
    const streamingError = store.read(selectStreamingMessageError);
    if (streamingError) {
      throw synchronizationProtocolError(streamingError);
    } else {
      const streamingMessage =
        store.read(selectRawStreamingMessage) ?? undefined;
      const terminalEvent = generation.activeAttempt?.terminalEvent;
      const interrupts =
        terminalEvent?.type === EventType.RUN_FINISHED
          ? validateInterruptOutcome(terminalEvent.outcome)
          : undefined;
      const finalizedToolCalls = interrupts
        ? []
        : store.read(ɵselectAttemptOwnedPendingToolCalls);
      if (interrupts) {
        dispatch(
          internalActions.interruptsPublished({
            generationId: generation.generationId,
            attemptId,
            batch: Object.freeze({ id: _createRequestId(), interrupts }),
          }),
        );
      }
      const toolsByName = generation.activeAttempt?.toolsByName ?? {};
      const toolTurnId =
        finalizedToolCalls.length === 0 ? undefined : _createRequestId();
      if (toolTurnId) {
        dispatch(
          internalActions.toolTurnReserved({
            generationId: generation.generationId,
            toolTurnId,
            toolCalls: finalizedToolCalls,
          }),
        );
        const publishToolSnapshot = () => {
          generation.unclaimedToolSnapshot = {
            toolTurnId,
            toolCalls: finalizedToolCalls,
            toolsByName,
          };
        };
        if (onCommit) {
          onCommit(publishToolSnapshot);
        } else {
          publishToolSnapshot();
        }
      }
      dispatch(
        apiActions.generateMessageSuccess({
          ...(streamingMessage ? { message: streamingMessage } : {}),
          toolCalls: finalizedToolCalls,
        }),
      );
    }

    const interrupted =
      generation.activeAttempt?.terminalEvent?.type ===
        EventType.RUN_FINISHED &&
      generation.activeAttempt.terminalEvent.outcome?.type === 'interrupt';
    const released = releaseAttempt(
      generation,
      context,
      false,
      dispatch,
      onCommit,
    );
    if (interrupted) {
      dispatch(
        internalActions.logicalGenerationSettled({
          generationId: generation.generationId,
        }),
      );
      const settle = () => {
        generation.settled = true;
        if (activeGeneration === generation) activeGeneration = undefined;
      };
      if (onCommit) onCommit(settle);
      else settle();
    }
    return released;
  };

  const settleUnclaimedToolSnapshot = (
    generation: ActiveGeneration,
    defer = false,
  ) => {
    const snapshot = generation.unclaimedToolSnapshot;
    generation.unclaimedToolSnapshot = undefined;
    const toolTurnId = snapshot?.toolTurnId;
    if (!snapshot || !toolTurnId || snapshot.toolCalls.length === 0) {
      return;
    }

    const outcome = createStoppedToolTurnOutcome(snapshot.toolCalls);
    const messages = createToolSettlementMessages(snapshot.toolCalls, outcome);
    const settle = () =>
      store.dispatch(
        internalActions.toolTurnSettled({
          generationId: generation.generationId,
          toolTurnId,
          toolCalls: [...snapshot.toolCalls],
          ...messages,
          continuation: outcome.continuation,
        }),
      );
    if (defer) {
      void Promise.resolve().then(settle);
    } else {
      settle();
    }
  };

  const interruptGeneration = (
    generation: ActiveGeneration,
    interruption: 'cancel' | 'retire',
    deferStoreCleanup = false,
  ) => {
    if (
      interruption === 'cancel' &&
      generation.activeAttempt?.terminalAccepted
    ) {
      return;
    }

    generation.coordinator[interruption]();

    const cleanUpStore = () => {
      if (!ownsGeneration(generation)) {
        return;
      }

      if (
        store.read(ɵselectInterrupts).generationId === generation.generationId
      ) {
        settleUnclaimedToolSnapshot(generation);
        void store.dispatchAndWait(
          internalActions.resumeSettlementStarted(),
          (followUps) => {
            if (!ownsGeneration(generation)) return;
            followUps.dispatch(
              internalActions.resumeSettled({
                generationId: generation.generationId,
                outcome: interruption === 'retire' ? 'retired' : 'cancelled',
              }),
            );
            const attempt = generation.activeAttempt;
            if (attempt)
              releaseAttempt(
                generation,
                attempt.context,
                true,
                followUps.dispatch,
                followUps.onCommit,
              );
            if (interruption === 'retire')
              followUps.dispatch(internalActions.generationSilentlyRetired());
            followUps.dispatch(
              internalActions.logicalGenerationSettled({
                generationId: generation.generationId,
              }),
            );
            followUps.onCommit(() => {
              generation.settled = true;
              if (activeGeneration === generation) activeGeneration = undefined;
            });
          },
        );
        return;
      }
      settleUnclaimedToolSnapshot(generation);
      if (!ownsGeneration(generation)) {
        return;
      }
      if (interruption === 'retire') {
        store.dispatch(internalActions.generationSilentlyRetired());
      }
      if (!ownsGeneration(generation)) {
        return;
      }
      settleLogicalGeneration(generation);
    };

    if (deferStoreCleanup) {
      // Thread changes may be dispatched from a state subscriber together with
      // replacement input. Let the dispatch queue assign replacement ownership
      // before an old generation emits un-tokenized retirement cleanup.
      void Promise.resolve().then(cleanUpStore);
    } else {
      cleanUpStore();
    }
  };

  const startGenerationCleanup = store.when(
    internalActions.start,
    devActions.setMessages,
    devActions.sendMessage,
    devActions.resendMessages,
    devActions.resume,
    (action) => {
      if (disposed) {
        return;
      }

      const resumeAction =
        action.type === devActions.resume.type ? action.payload : undefined;
      const interruptState = store.read(ɵselectInterrupts);
      if (
        interruptState.recoveryRequired ||
        (interruptState.pending && !resumeAction)
      )
        return;
      if (resumeAction && interruptState.claimId !== resumeAction.claimId)
        return;
      let initialResume = resumeAction;
      const configuredThreadId = store.read(selectThreadId);
      const threadId = configuredThreadId ?? _createRequestId();
      const generationId = resumeAction?.claimId ?? _createRequestId();
      const supersededGeneration = activeGeneration;
      if (supersededGeneration) {
        // Claimed tools settle synchronously while their exact ownership is
        // still current. An unclaimed reservation is handled only after the
        // replacement generation invalidates it below.
        supersededGeneration.coordinator.retire();
      }
      store.dispatch(
        internalActions.logicalGenerationStarted({ generationId }),
      );
      if (supersededGeneration) {
        settleUnclaimedToolSnapshot(supersededGeneration, true);
        supersededGeneration.settled = true;
      }
      const generationRef: { current: ActiveGeneration | undefined } = {
        current: undefined,
      };
      const coordinator = createAssistantTurnCoordinator({
        executeModelRun: async ({ cancelSignal, retiredSignal }) => {
          // Let the triggering reducer and nested settlements complete before
          // taking the request snapshot for this model round.
          await Promise.resolve();

          if (retiredSignal.aborted) {
            return { kind: 'retired' };
          }
          if (cancelSignal.aborted) {
            return { kind: 'cancelled' };
          }
          const resumedRun = initialResume;
          initialResume = undefined;
          if (!resumedRun && !store.read(selectShouldGenerateMessage)) {
            return { kind: 'cancelled' };
          }

          const responseSchema = resumedRun
            ? resumedRun.checkpoint.responseSchema
            : store.read(selectResponseSchema);
          const messages = resumedRun
            ? resumedRun.checkpoint.messages
            : store.read(ɵselectEffectiveCommittedAgUiMessages);
          const state = resumedRun
            ? resumedRun.checkpoint.state
            : store.read(ɵselectCommittedAgentState);
          const debounce = resumedRun
            ? resumedRun.checkpoint.debounce
            : store.read(selectDebounce);
          const retries = resumedRun
            ? resumedRun.checkpoint.retries
            : store.read(selectRetries);
          const internalTools = resumedRun
            ? resumedRun.checkpoint.internalTools
            : store.read(selectTools);
          const tools = Chat.helpers.toApiToolsFromInternal(internalTools);
          const toolsByName = resumedRun
            ? resumedRun.checkpoint.toolsByName
            : store.read(selectToolEntities);
          const responseJsonSchema = responseSchema
            ? s.toJsonSchema(responseSchema)
            : undefined;
          const uiRequested = resumedRun
            ? resumedRun.checkpoint.uiRequested
            : store.read(selectUiRequested);
          if (activeGeneration?.coordinator === coordinator) {
            activeGeneration.threadId = threadId;
          }

          await sleep(debounce, AbortSignal.any([cancelSignal, retiredSignal]));
          if (retiredSignal.aborted) {
            return { kind: 'retired' };
          }
          if (cancelSignal.aborted) {
            return { kind: 'cancelled' };
          }

          const transportProvider = resumedRun
            ? resumedRun.checkpoint.transportProvider
            : store.read(selectTransport);
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
            if (retiredSignal.aborted) {
              return { kind: 'retired' };
            }
            if (cancelSignal.aborted) {
              return { kind: 'cancelled' };
            }

            return {
              kind: 'server-error',
              error:
                error instanceof Error
                  ? error
                  : new Error('Unknown transport initialization error'),
            };
          }

          const outcome = await executeLogicalRun({
            transport,
            retries,
            isResume: resumedRun !== undefined,
            beforeSend: resumedRun
              ? () => {
                  try {
                    assertInterruptsNotExpired(
                      resumedRun.batch.interrupts,
                      Date.now(),
                    );
                  } catch (error) {
                    throw new TransportError((error as Error).message, {
                      retryable: false,
                      code: 'INTERRUPT_EXPIRED',
                    });
                  }
                }
              : undefined,
            cancelSignal,
            retiredSignal,
            createRequest: ({ attempt, maxAttempts, signal }) => {
              const requestId = _createRequestId();

              return {
                input: createCanonicalRunAgentInput({
                  threadId,
                  runId: requestId,
                  messages,
                  state,
                  tools,
                  responseSchema: responseJsonSchema,
                  ui: uiRequested,
                  resume: resumedRun?.options.entries,
                }),
                signal,
                attempt,
                maxAttempts,
                requestId,
              };
            },
            onAttemptStarted: (context) => {
              const generation = generationRef.current;
              if (!generation || !ownsGeneration(generation)) {
                return;
              }

              const attemptId = _createRequestId();
              generation.activeAttempt = {
                context,
                attemptId,
                terminalAccepted: false,
                terminalEvent: undefined,
                toolsByName,
              };
              store.dispatch(
                internalActions.generationAttemptClaimed({
                  generationId: generation.generationId,
                  attemptId,
                }),
              );
              if (!ownsAttempt(generation, context)) {
                return;
              }
              store.dispatch(internalActions.generationAttemptStarted());
            },
            onAttemptRolledBack: (context) => {
              const generation = generationRef.current;
              if (generation) {
                releaseAttempt(generation, context, true);
              }
            },
            onStarted: async (context) => {
              const generation = generationRef.current;
              if (!generation || !ownsAttempt(generation, context)) {
                return;
              }

              if (resumedRun) {
                store.dispatch(
                  internalActions.resumeAcknowledged({
                    generationId,
                    claimId: resumedRun.claimId,
                  }),
                );
                if (!ownsAttempt(generation, context)) return;
              }
              await store.dispatchAndWait(
                apiActions.generateMessageStart({
                  responseSchema,
                  toolsByName,
                }),
              );
            },
            onEvent: async (event, context) => {
              const generation = generationRef.current;
              if (!generation || !ownsAttempt(generation, context)) {
                return;
              }

              let preparedEvent: AGUIEvent | undefined;
              try {
                preparedEvent = ɵprepareAgUiMessageEvent(event);
                if (event.type === EventType.RUN_FINISHED) {
                  const attempt = generation.activeAttempt;
                  if (attempt) {
                    attempt.terminalAccepted = true;
                    attempt.terminalEvent = preparedEvent;
                  }
                }

                await store.dispatchAndWait(
                  apiActions.generateMessageEvent(preparedEvent),
                  event.type === EventType.RUN_FINISHED
                    ? (followUps) => {
                        if (!ownsAttempt(generation, context)) {
                          return;
                        }

                        assertSynchronizationProtocolIsValid();
                        finishAttempt(
                          generation,
                          context,
                          followUps.dispatch,
                          followUps.onCommit,
                        );
                      }
                    : undefined,
                );
                if (event.type === EventType.RUN_FINISHED) {
                  return;
                }
                if (!ownsAttempt(generation, context)) {
                  return;
                }

                assertSynchronizationProtocolIsValid();
              } catch (error) {
                const attempt = generation.activeAttempt;
                if (attempt && attempt.terminalEvent === preparedEvent) {
                  attempt.terminalAccepted = false;
                  attempt.terminalEvent = undefined;
                }

                throw synchronizationProtocolError(error);
              }
            },
          });

          const generation = generationRef.current;
          if (!generation || !ownsGeneration(generation)) {
            return { kind: 'retired' };
          }

          if (outcome.kind === 'finished') {
            const attempt = generation.activeAttempt;
            if (attempt) {
              finishAttempt(generation, attempt.context);
            }
          }

          return outcome;
        },
        readToolSnapshot: () => {
          const generation = generationRef.current;
          if (!generation || !ownsGeneration(generation)) {
            return { toolCalls: [], toolsByName: {} };
          }

          const snapshot = generation.unclaimedToolSnapshot;
          generation.unclaimedToolSnapshot = undefined;

          return snapshot ?? { toolCalls: [], toolsByName: {} };
        },
        toolTurnStarted: (snapshot) => {
          const generation = generationRef.current;
          if (
            !generation ||
            !ownsGeneration(generation) ||
            !snapshot.toolTurnId
          ) {
            return;
          }

          store.dispatch(
            internalActions.toolTurnStarted({
              generationId: generation.generationId,
              toolTurnId: snapshot.toolTurnId,
            }),
          );
        },
        settleToolTurn: (toolCalls, outcome, toolTurnId) => {
          const generation = generationRef.current;
          if (!generation || !toolTurnId) {
            return;
          }
          const messages = createToolSettlementMessages(toolCalls, outcome);
          store.dispatch(
            internalActions.toolTurnSettled({
              generationId: generation.generationId,
              toolTurnId,
              toolCalls: [...toolCalls],
              ...messages,
              continuation: outcome.continuation,
            }),
          );
        },
        reportNoTools: () => {
          if (!disposed) {
            store.dispatch(internalActions.skippedToolCalls());
          }
        },
      });
      const generation: ActiveGeneration = {
        coordinator,
        generationId,
        threadId: configuredThreadId,
        unclaimedToolSnapshot: undefined,
        activeAttempt: undefined,
        settled: false,
      };
      generationRef.current = generation;
      activeGeneration = generation;

      return coordinator.completion.then((outcome) => {
        if (!ownsGeneration(generation)) {
          return;
        }

        if (resumeAction) {
          return store.dispatchAndWait(
            internalActions.resumeSettlementStarted(),
            (followUps) => {
              if (!ownsGeneration(generation)) return;
              followUps.dispatch(
                internalActions.resumeSettled({
                  generationId,
                  outcome:
                    outcome.kind === 'finished'
                      ? 'success'
                      : outcome.kind === 'cancelled'
                        ? 'cancelled'
                        : 'failed',
                }),
              );
              if (
                outcome.kind === 'server-error' ||
                outcome.kind === 'failed'
              ) {
                followUps.dispatch(
                  apiActions.generateMessageError(outcome.error),
                );
                if (outcome.kind === 'failed' && outcome.exhaustedRetries)
                  followUps.dispatch(
                    apiActions.generateMessageExhaustedRetries(),
                  );
              }
              const attempt = generation.activeAttempt;
              if (attempt)
                releaseAttempt(
                  generation,
                  attempt.context,
                  true,
                  followUps.dispatch,
                  followUps.onCommit,
                );
              followUps.dispatch(
                internalActions.logicalGenerationSettled({ generationId }),
              );
              followUps.onCommit(() => {
                generation.settled = true;
                if (activeGeneration === generation)
                  activeGeneration = undefined;
              });
            },
          );
        }
        if (outcome.kind === 'server-error') {
          store.dispatch(apiActions.generateMessageError(outcome.error));
        } else if (outcome.kind === 'failed') {
          store.dispatch(apiActions.generateMessageError(outcome.error));
          if (ownsGeneration(generation) && outcome.exhaustedRetries) {
            store.dispatch(apiActions.generateMessageExhaustedRetries());
          }
        }

        settleLogicalGeneration(generation);
        return undefined;
      });
    },
  );

  const stopCleanup = store.when(devActions.stopMessageGeneration, () => {
    if (disposed) {
      return;
    }

    const generation = activeGeneration;
    if (generation) {
      interruptGeneration(generation, 'cancel');
    }
  });

  const updateOptionsCleanup = store.when(
    devActions.updateOptions,
    (action) => {
      if (disposed) {
        return;
      }

      if (!Object.prototype.hasOwnProperty.call(action.payload, 'threadId')) {
        return;
      }
      if (activeGeneration?.threadId === action.payload.threadId) {
        return;
      }

      const generation = activeGeneration;
      if (generation) {
        interruptGeneration(generation, 'retire', true);
      }
    },
  );

  return () => {
    if (disposed) {
      return;
    }
    disposed = true;

    const generation = activeGeneration;
    if (generation) {
      interruptGeneration(generation, 'retire');
    }

    startGenerationCleanup();
    stopCleanup();
    updateOptionsCleanup();
  };
});

function createToolSettlementMessages(
  toolCalls: readonly Chat.Internal.ToolCall[],
  outcome: ToolTurnOutcome,
): {
  readonly toolMessages: Chat.Api.ToolMessage[];
  readonly canonicalMessages: import('@ag-ui/core').ToolMessage[];
} {
  const entries = toolCalls.map((toolCall, index) => {
    const result = outcome.results[index];
    if (!result) {
      throw new Error('Tool outcome is missing a result');
    }
    const content =
      result.status === 'fulfilled'
        ? normalizeToolResult(result.value)
        : normalizeToolRejection(result.reason);
    return {
      toolMessage: {
        role: 'tool' as const,
        content: result,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
      },
      canonicalMessage: {
        id: _createRequestId(),
        role: 'tool' as const,
        toolCallId: toolCall.id,
        content,
        ...(result.status === 'rejected' ? { error: content } : {}),
      },
    };
  });
  return {
    toolMessages: entries.map((entry) => entry.toolMessage),
    canonicalMessages: entries.map((entry) => entry.canonicalMessage),
  };
}

function createStoppedToolTurnOutcome(
  toolCalls: readonly Chat.Internal.ToolCall[],
): ToolTurnOutcome {
  return {
    continuation: 'stop',
    results: toolCalls.map(() => ({
      status: 'rejected',
      reason: createToolCancellationError(),
    })),
  };
}

function synchronizationProtocolError(error: unknown): TransportError {
  if (
    error instanceof TransportError &&
    error.code === 'PROTOCOL_ERROR' &&
    !error.retryable
  ) {
    return error;
  }

  return new TransportError(
    error instanceof Error ? error.message : 'Invalid AG-UI event',
    {
      retryable: false,
      code: 'PROTOCOL_ERROR',
    },
  );
}

function createToolCancellationError(): Error {
  const error = new Error('Tool execution cancelled');
  error.name = 'AbortError';
  return error;
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
