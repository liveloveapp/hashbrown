import { apiActions, devActions, internalActions } from '../actions';
import { Chat } from '../models';
import {
  selectApiMessages,
  selectDebounce,
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
import { resolveTransport, TransportError } from '../transport';
import { createHashbrownRunAgentInput } from '../transport/hashbrown-run-agent-input';
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
  threadId: string | undefined;
  unclaimedToolSnapshot: AssistantTurnToolSnapshot | undefined;
};

export const generateMessage = createEffect((store) => {
  let activeGeneration: ActiveGeneration | undefined;
  let disposed = false;

  const settleUnclaimedToolSnapshot = (generation: ActiveGeneration) => {
    const snapshot = generation.unclaimedToolSnapshot;
    generation.unclaimedToolSnapshot = undefined;
    if (!snapshot || snapshot.toolCalls.length === 0) {
      return;
    }

    const outcome = createStoppedToolTurnOutcome(snapshot.toolCalls);
    store.dispatch(
      internalActions.toolTurnSettled({
        toolCalls: [...snapshot.toolCalls],
        toolMessages: toToolMessages(snapshot.toolCalls, outcome),
        continuation: outcome.continuation,
      }),
    );
  };

  const interruptGeneration = (
    generation: ActiveGeneration,
    interruption: 'cancel' | 'retire',
  ) => {
    generation.coordinator[interruption]();
    settleUnclaimedToolSnapshot(generation);
  };

  const startGenerationCleanup = store.when(
    internalActions.start,
    devActions.setMessages,
    devActions.sendMessage,
    devActions.resendMessages,
    () => {
      if (disposed) {
        return;
      }

      if (activeGeneration) {
        interruptGeneration(activeGeneration, 'retire');
      }

      const configuredThreadId = store.read(selectThreadId);
      const threadId = configuredThreadId ?? _createRequestId();
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
          if (!store.read(selectShouldGenerateMessage)) {
            return { kind: 'cancelled' };
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
          const uiRequested = store.read(selectUiRequested);
          if (activeGeneration?.coordinator === coordinator) {
            activeGeneration.threadId = threadId;
          }

          await sleep(
            debounce,
            AbortSignal.any([cancelSignal, retiredSignal]),
          );
          if (retiredSignal.aborted) {
            return { kind: 'retired' };
          }
          if (cancelSignal.aborted) {
            return { kind: 'cancelled' };
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
            cancelSignal,
            retiredSignal,
            createRequest: ({ attempt, maxAttempts, signal }) => {
              const requestId = _createRequestId();

              return {
                input: createHashbrownRunAgentInput({
                  threadId,
                  runId: requestId,
                  system,
                  messages,
                  tools,
                  responseSchema: responseJsonSchema,
                  ui: uiRequested,
                }),
                signal,
                attempt,
                maxAttempts,
                requestId,
              };
            },
            onStarted: () => {
              if (disposed) {
                return;
              }

              store.dispatch(
                apiActions.generateMessageStart({
                  responseSchema,
                  toolsByName,
                }),
              );
            },
            onEvent: (event) => {
              if (disposed) {
                return;
              }

              store.dispatch(apiActions.generateMessageEvent(event));
            },
            onAttemptError: (error) => {
              if (disposed) {
                return;
              }

              store.dispatch(apiActions.generateMessageError(error));
            },
          });

          if (disposed) {
            return { kind: 'retired' };
          }

          if (outcome.kind === 'finished') {
            const streamingError = store.read(selectStreamingMessageError);
            if (streamingError) {
              store.dispatch(apiActions.generateMessageError(streamingError));
            } else {
              const streamingMessage = store.read(selectRawStreamingMessage);
              const streamingToolCalls = store.read(
                selectRawStreamingToolCalls,
              );

              if (streamingMessage) {
                const generation = generationRef.current;
                if (!generation) {
                  throw new Error('Generation ownership was not initialized');
                }

                const finalizedToolCalls = dedupeToolCalls(streamingToolCalls);
                generation.unclaimedToolSnapshot = {
                  toolCalls: finalizedToolCalls,
                  toolsByName,
                };
                store.dispatch(
                  apiActions.generateMessageSuccess({
                    message: streamingMessage,
                    toolCalls: finalizedToolCalls,
                  }),
                );
                if (retiredSignal.aborted || cancelSignal.aborted) {
                  settleUnclaimedToolSnapshot(generation);
                }
              } else {
                store.dispatch(
                  apiActions.generateMessageError(
                    new Error('No message was generated'),
                  ),
                );
              }
            }
          }

          return outcome;
        },
        readToolSnapshot: () => {
          const generation = generationRef.current;
          if (!generation) {
            return { toolCalls: [], toolsByName: {} };
          }

          const snapshot = generation.unclaimedToolSnapshot;
          generation.unclaimedToolSnapshot = undefined;

          return snapshot ?? { toolCalls: [], toolsByName: {} };
        },
        settleToolTurn: (toolCalls, outcome) => {
          store.dispatch(
            internalActions.toolTurnSettled({
              toolCalls: [...toolCalls],
              toolMessages: toToolMessages(toolCalls, outcome),
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
        threadId: configuredThreadId,
        unclaimedToolSnapshot: undefined,
      };
      generationRef.current = generation;
      activeGeneration = generation;

      return coordinator.completion.then((outcome) => {
        if (disposed) {
          return;
        }

        if (activeGeneration === generation) {
          activeGeneration = undefined;
        }

        if (outcome.kind === 'server-error') {
          store.dispatch(apiActions.generateMessageError(outcome.error));
        } else if (outcome.kind === 'failed' && outcome.exhaustedRetries) {
          store.dispatch(apiActions.generateMessageExhaustedRetries());
        }
      });
    },
  );

  const stopCleanup = store.when(devActions.stopMessageGeneration, () => {
    if (disposed) {
      return;
    }

    const generation = activeGeneration;
    activeGeneration = undefined;
    if (generation) {
      interruptGeneration(generation, 'cancel');
    }
  });

  const updateOptionsCleanup = store.when(devActions.updateOptions, (action) => {
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
    activeGeneration = undefined;
    if (generation) {
      interruptGeneration(generation, 'retire');
    }

    if (generation) {
      store.dispatch(internalActions.generationSilentlyRetired());
    }
  });

  return () => {
    if (disposed) {
      return;
    }
    disposed = true;

    const generation = activeGeneration;
    activeGeneration = undefined;
    if (generation) {
      interruptGeneration(generation, 'retire');
    }
    if (generation) {
      store.dispatch(internalActions.generationSilentlyRetired());
    }

    startGenerationCleanup();
    stopCleanup();
    updateOptionsCleanup();
  };
});

function toToolMessages(
  toolCalls: readonly Chat.Internal.ToolCall[],
  outcome: ToolTurnOutcome,
): Chat.Api.ToolMessage[] {
  return toolCalls.map((toolCall, index) => ({
    role: 'tool',
    content: outcome.results[index],
    toolCallId: toolCall.id,
    toolName: toolCall.name,
  }));
}

function dedupeToolCalls(
  toolCalls: readonly Chat.Internal.ToolCall[],
): Chat.Internal.ToolCall[] {
  return [
    ...new Map(toolCalls.map((toolCall) => [toolCall.id, toolCall])).values(),
  ];
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
