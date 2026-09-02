import { EventType } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import { Chat } from '../models';
import { ɵprepareAgUiMessageEvent } from '../reducers/ag-ui-message-history';
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
import { resolveTransport, TransportError } from '../transport';
import {
  type AgUiRunAttemptOutcome,
  runAgUiAttempt,
} from '../transport/ag-ui-run-driver';
import { createHashbrownRunAgentInput } from '../transport/hashbrown-run-agent-input';
import { sleep, switchAsync } from '../utils/async';
import { updateAssistantMessage } from '../utils/assistant-message';
import { createEffect } from '../utils/micro-ngrx';
import {
  createLogicalRunRetryState,
  decideLogicalRunFailure,
  startLogicalRunAttempt,
} from './logical-run-retry-policy';

type ActiveGeneration = {
  threadId: string | undefined;
};

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

      let retryState = createLogicalRunRetryState(retries);
      let exhaustedRetries = false;

      try {
        while (true) {
          if (retiredSignal.aborted || runCancelSignal.aborted) {
            return;
          }

          const startedAttempt = startLogicalRunAttempt(retryState);
          retryState = startedAttempt.state;
          const { attempt, maxAttempts } = startedAttempt.context;

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
            maxAttempts,
            requestId,
          };
          let runStarted = false;
          let runTerminal = false;

          const synthesizeRunError = (
            message: string,
            allowCancelled = false,
          ) => {
            if (!runStarted || runTerminal || retiredSignal.aborted) {
              return;
            }
            if (runCancelSignal.aborted && !allowCancelled) {
              return;
            }

            runTerminal = true;
            store.dispatch(
              apiActions.generateMessageEvent({
                type: EventType.RUN_ERROR,
                message,
              }),
            );
          };

          let outcome: AgUiRunAttemptOutcome | undefined;
          let primaryError: Error | undefined;
          try {
            outcome = await runAgUiAttempt({
              transport,
              request: eventRequest,
              cancelSignal: runCancelSignal,
              retiredSignal,
              onStarted: () => {
                store.dispatch(
                  apiActions.generateMessageStart({
                    responseSchema,
                    toolsByName,
                  }),
                );
              },
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

                store.dispatch(
                  apiActions.generateMessageEvent(
                    ɵprepareAgUiMessageEvent(event),
                  ),
                );
              },
            });
          } catch (error) {
            primaryError =
              error instanceof Error
                ? error
                : new Error('Unknown transport error');
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

          const failureDecision = decideLogicalRunFailure(
            retryState,
            primaryError,
          );
          if (failureDecision.kind === 'stop') {
            exhaustedRetries = failureDecision.exhaustedRetries;
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
