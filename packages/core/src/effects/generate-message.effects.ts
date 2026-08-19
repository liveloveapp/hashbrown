import { type AGUIEvent, EventType } from '@ag-ui/core';
import { s } from '../schema';
import { sleep, switchAsync } from '../utils/async';
import { createEffect } from '../utils/micro-ngrx';
import { apiActions, devActions, internalActions } from '../actions';
import { decodeFrames } from '../frames/decode-frames';
import { Chat } from '../models';
import { createCompletionChunkEventAdapter } from '../transport/completion-chunk-to-agui-events';
import { updateAssistantMessage } from '../utils/assistant-message';
import {
  selectApiMessages,
  selectApiTools,
  selectApiUrl,
  selectDebounce,
  selectEmulateStructuredOutput,
  selectMiddleware,
  selectModel,
  selectPendingToolCalls,
  selectRawStreamingMessage,
  selectRawStreamingToolCalls,
  selectResponseSchema,
  selectRetries,
  selectShouldGenerateMessage,
  selectStreamingMessageError,
  selectStructuredOutput,
  selectSystem,
  selectThreadId,
  selectToolEntities,
  selectTools,
  selectTransport,
  selectUiRequested,
} from '../reducers';
import {
  framesToLengthPrefixedStream,
  ModelResolver,
  type RequestedFeatures,
  TransportError,
  TransportResponse,
} from '../transport';
import { createHashbrownRunAgentInput } from '../transport/hashbrown-run-agent-input';

export const generateMessage = createEffect((store) => {
  const effectAbortController = new AbortController();
  // This controller is used to cancel the current message generation
  // when a new message is sent or the user stops the generation.
  let cancelAbortController = new AbortController();
  let generatedThreadId: string | undefined;

  store.when(
    internalActions.sizzle,
    devActions.setMessages,
    devActions.sendMessage,
    devActions.resendMessages,
    switchAsync(async (switchSignal) => {
      if (cancelAbortController.signal.aborted) {
        cancelAbortController = new AbortController();
      }
      const runCancelSignal = cancelAbortController.signal;

      // Let sibling effects settle nested actions before snapshotting state.
      await Promise.resolve();

      const apiUrl = store.read(selectApiUrl);
      const middleware = store.read(selectMiddleware);
      const model = store.read(selectModel);
      const responseSchema = store.read(selectResponseSchema);
      const messages = store.read(selectApiMessages);
      const debounce = store.read(selectDebounce);
      const retries = store.read(selectRetries);
      const tools = store.read(selectApiTools);
      const internalTools = store.read(selectTools);
      const modernTools = Chat.helpers.toApiToolsFromInternal(
        internalTools,
        false,
        responseSchema ?? s.nullish(),
      );
      const toolsByName = store.read(selectToolEntities);
      const system = store.read(selectSystem);
      const emulateStructuredOutput = store.read(selectEmulateStructuredOutput);
      const structuredOutput = store.read(selectStructuredOutput);
      const structuredOutputMode = responseSchema
        ? (structuredOutput?.mode ??
          (emulateStructuredOutput ? 'tool' : 'strict'))
        : undefined;
      const responseJsonSchema = responseSchema
        ? s.toJsonSchema(responseSchema)
        : undefined;
      const shouldGenerateMessage = store.read(selectShouldGenerateMessage);
      const threadId = store.read(selectThreadId);
      const uiRequested = store.read(selectUiRequested);
      const shouldLoadThread = Boolean(threadId) && messages.length === 0;
      const messagePayload = threadId
        ? _extractMessageDelta(messages)
        : messages;
      const shouldProceed = shouldLoadThread || shouldGenerateMessage;

      if (!shouldProceed) {
        return;
      }

      if (threadId && !shouldLoadThread && messagePayload.length === 0) {
        return;
      }

      const params: Chat.Api.CompletionCreateParams = {
        operation: shouldLoadThread ? 'load-thread' : 'generate',
        model,
        system,
        messages: messagePayload,
        tools,
        toolChoice: structuredOutputMode === 'tool' ? 'required' : undefined,
        responseFormat:
          structuredOutputMode === 'strict' && responseSchema
            ? responseJsonSchema
            : undefined,
        responseFormatMode:
          structuredOutputMode === 'strict'
            ? 'schema'
            : structuredOutputMode === 'json'
              ? 'json'
              : undefined,
        threadId: threadId,
      };

      const requestedFeatures: RequestedFeatures = {
        tools:
          Boolean(params.tools?.length) || params.toolChoice === 'required',
        structured: Boolean(params.responseFormatMode),
        ui: uiRequested,
        threads: Boolean(threadId),
      };

      await sleep(debounce, switchSignal);

      let attempt = 0;
      const transportProvider = store.read(selectTransport);
      const resolver = new ModelResolver(model, {
        url: apiUrl,
        middleware: middleware ?? undefined,
        transport: transportProvider,
      });

      let skippedLegacyThreadLoad = false;
      const selectCompatibleTransport = async () => {
        let nextSelection = await resolver.select(requestedFeatures);
        while (
          shouldLoadThread &&
          nextSelection?.transport.supportsLegacyThreadLoading === false
        ) {
          skippedLegacyThreadLoad = true;
          resolver.skipFromError(
            nextSelection.spec,
            new TransportError(
              `Model spec "${nextSelection.spec.name}" does not support legacy thread loading.`,
              { retryable: false, code: 'FEATURE_UNSUPPORTED' },
            ),
          );
          nextSelection = await resolver.select(requestedFeatures);
        }

        return nextSelection;
      };

      let selection = await selectCompatibleTransport();
      if (!selection) {
        if (!skippedLegacyThreadLoad) {
          store.dispatch(
            apiActions.generateMessageError(
              new Error(
                'No compatible model spec found for the requested features.',
              ),
            ),
          );
        }
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
        } else {
          store.dispatch(
            apiActions.generateMessageError(
              new Error('No message was generated'),
            ),
          );
        }
      };

      let retryWithReplacement = false;
      try {
        do {
          if (
            effectAbortController.signal.aborted ||
            switchSignal.aborted ||
            runCancelSignal.aborted
          ) {
            return;
          }

          let transportResponse: TransportResponse | undefined;
          let activeRun:
            { threadId: string; runId: string; terminal: boolean } | undefined;
          let shouldFinalizeGeneration = false;
          let disposed = false;
          const disposeTransportResponse = async () => {
            if (disposed) {
              return;
            }

            disposed = true;
            await transportResponse?.dispose?.();
          };
          const dispatchRunError = (message: string) => {
            if (!activeRun || activeRun.terminal) {
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

          try {
            try {
              if (!retryWithReplacement) {
                attempt++;
              }
              retryWithReplacement = false;

              const requestAbortSignal = AbortSignal.any([
                switchSignal,
                effectAbortController.signal,
                runCancelSignal,
              ]);

              const paramsWithModel: Chat.Api.CompletionCreateParams = {
                ...params,
                model: selection.spec.name,
              };
              const aguiThreadId =
                threadId ?? (generatedThreadId ??= _createRequestId());
              const requestId = _createRequestId();
              const runId = requestId;

              transportResponse = await selection.transport.send({
                input: createHashbrownRunAgentInput({
                  threadId: aguiThreadId,
                  runId,
                  system,
                  messages,
                  tools: modernTools,
                  responseSchema: responseJsonSchema,
                  ui: uiRequested,
                }),
                params: paramsWithModel,
                signal: requestAbortSignal,
                attempt,
                maxAttempts: retries + 1,
                requestId,
              });

              if (runCancelSignal.aborted) {
                return;
              }

              if (transportResponse.events) {
                for await (const event of transportResponse.events) {
                  if (event.type === EventType.RUN_STARTED) {
                    if (activeRun) {
                      throw new TransportError(
                        'Received duplicate RUN_STARTED',
                        {
                          retryable: true,
                          code: 'PROTOCOL_ERROR',
                        },
                      );
                    }

                    if (
                      event.threadId !== aguiThreadId ||
                      event.runId !== runId
                    ) {
                      throw new TransportError(
                        'RUN_STARTED identity does not match the attempted run',
                        { retryable: true, code: 'PROTOCOL_ERROR' },
                      );
                    }

                    activeRun = {
                      threadId: event.threadId,
                      runId: event.runId,
                      terminal: false,
                    };
                    store.dispatch(
                      apiActions.generateMessageStart({
                        responseSchema,
                        emulateStructuredOutput: false,
                        toolsByName,
                      }),
                    );
                    store.dispatch(apiActions.generateMessageEvent(event));
                    continue;
                  }

                  if (event.type === EventType.RUN_ERROR) {
                    if (activeRun) {
                      activeRun = { ...activeRun, terminal: true };
                    }
                    store.dispatch(apiActions.generateMessageEvent(event));
                    throw new Error(event.message);
                  }

                  if (!activeRun) {
                    throw new TransportError(
                      `Received ${event.type} before RUN_STARTED`,
                      { retryable: true, code: 'PROTOCOL_ERROR' },
                    );
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
                    store.dispatch(apiActions.generateMessageEvent(event));
                    shouldFinalizeGeneration = true;
                    break;
                  }

                  store.dispatch(apiActions.generateMessageEvent(event));
                }

                if (activeRun && !activeRun.terminal) {
                  throw new TransportError(
                    'Generation stream ended before RUN_FINISHED or RUN_ERROR',
                    { retryable: true },
                  );
                }

                if (!activeRun) {
                  throw new TransportError(
                    'Generation stream ended before RUN_STARTED',
                    { retryable: true },
                  );
                }
              }

              if (!transportResponse.events) {
                const completionChunkAdapter =
                  createCompletionChunkEventAdapter(requestId);

                const frameStream = transportResponse.frames
                  ? framesToLengthPrefixedStream(transportResponse.frames)
                  : transportResponse.stream;

                if (!frameStream) {
                  throw new TransportError(
                    'Transport returned neither frames nor stream',
                    { retryable: false },
                  );
                }

                transportResponse = {
                  ...transportResponse,
                  metadata: {
                    ...(transportResponse.metadata ?? {}),
                    selection: selection.metadata,
                  },
                };

                for await (const frame of decodeFrames(frameStream, {
                  signal: AbortSignal.any([
                    runCancelSignal,
                    effectAbortController.signal,
                  ]),
                })) {
                  switch (frame.type) {
                    case 'thread-load-start': {
                      store.dispatch(apiActions.threadLoadStart());
                      break;
                    }
                    case 'thread-load-success': {
                      store.dispatch(
                        apiActions.threadLoadSuccess({
                          thread: frame.thread,
                          responseSchema,
                          toolsByName,
                        }),
                      );
                      if (params.operation === 'load-thread') {
                        return;
                      }
                      break;
                    }
                    case 'thread-load-failure': {
                      store.dispatch(
                        apiActions.threadLoadFailure({
                          error: frame.error,
                          stacktrace: frame.stacktrace,
                        }),
                      );
                      throw new Error(frame.error);
                    }
                    case 'generation-start': {
                      activeRun = {
                        threadId: aguiThreadId,
                        runId,
                        terminal: false,
                      };
                      store.dispatch(
                        apiActions.generateMessageStart({
                          responseSchema,
                          emulateStructuredOutput,
                          toolsByName:
                            emulateStructuredOutput && responseSchema
                              ? {
                                  ...toolsByName,
                                  output: {
                                    name: 'output',
                                    description:
                                      'Reserved tool for emulated structured output.',
                                    schema:
                                      s.normalizeSchemaOutput(responseSchema),
                                    handler: async () => undefined,
                                  },
                                }
                              : toolsByName,
                        }),
                      );
                      store.dispatch(
                        apiActions.generateMessageEvent({
                          type: EventType.RUN_STARTED,
                          threadId: aguiThreadId,
                          runId,
                        }),
                      );
                      break;
                    }
                    case 'generation-chunk': {
                      for (const event of completionChunkAdapter.push(
                        frame.chunk,
                      )) {
                        store.dispatch(apiActions.generateMessageEvent(event));
                      }
                      break;
                    }
                    case 'thread-save-success': {
                      store.dispatch(
                        apiActions.threadSaveSuccess({
                          threadId: frame.threadId,
                        }),
                      );
                      break;
                    }
                    case 'thread-save-start': {
                      store.dispatch(apiActions.threadSaveStart());
                      break;
                    }
                    case 'thread-save-failure': {
                      store.dispatch(
                        apiActions.threadSaveFailure({
                          error: frame.error,
                          stacktrace: frame.stacktrace,
                        }),
                      );
                      break;
                    }
                    case 'generation-error': {
                      dispatchRunError(frame.error);
                      // Assumption: a 'finish' will follow the 'error', but we know we need to retry
                      // as soon as we see the error.  Therefore, throw an exception to break out
                      // of the for loop.
                      throw new Error(frame.error);
                    }
                    case 'generation-finish': {
                      if (activeRun) {
                        activeRun = { ...activeRun, terminal: true };
                      }
                      const events: AGUIEvent[] = [
                        ...completionChunkAdapter.finish(),
                        {
                          type: EventType.RUN_FINISHED,
                          threadId: aguiThreadId,
                          runId,
                        },
                      ];
                      for (const event of events) {
                        store.dispatch(apiActions.generateMessageEvent(event));
                      }
                      shouldFinalizeGeneration = true;
                      break;
                    }
                  }
                }

                if (activeRun && !activeRun.terminal) {
                  const cancelled =
                    effectAbortController.signal.aborted ||
                    switchSignal.aborted ||
                    runCancelSignal.aborted;
                  if (cancelled) {
                    dispatchRunError('Generation cancelled');
                    return;
                  }

                  throw new TransportError(
                    'Generation stream ended before generation-finish',
                    { retryable: true },
                  );
                }
              }
            } finally {
              await disposeTransportResponse();
            }

            if (shouldFinalizeGeneration) {
              finalizeGeneration();
            }
          } catch (e) {
            const cancelled =
              effectAbortController.signal.aborted ||
              switchSignal.aborted ||
              runCancelSignal.aborted;
            if (cancelled) {
              dispatchRunError('Generation cancelled');
              return;
            }

            const error =
              e instanceof Error ? e : new Error('Unknown transport error');
            dispatchRunError(error.message);
            store.dispatch(apiActions.generateMessageError(error));

            const retryable =
              !(e instanceof TransportError) || e.retryable !== false;

            if (
              e instanceof TransportError &&
              (e.code === 'FEATURE_UNSUPPORTED' ||
                e.code === 'PLATFORM_UNSUPPORTED')
            ) {
              resolver.skipFromError(selection.spec, e);
              selection = await selectCompatibleTransport();
              if (!selection) {
                break;
              }
              retryWithReplacement = true;
              continue;
            }

            if (!retryable) {
              break;
            }

            continue;
          }

          break;
        } while (retryWithReplacement || attempt < retries + 1);
      } finally {
        const supersededOrDisposed =
          effectAbortController.signal.aborted || switchSignal.aborted;
        if (!supersededOrDisposed) {
          store.dispatch(
            apiActions.assistantTurnFinalized({
              toolCalls: store.read(selectPendingToolCalls),
              continuation: runCancelSignal.aborted ? 'stop' : 'continue',
            }),
          );
        }
      }

      // Did we exhaust our retries?
      if (retries > 0 && attempt > retries) {
        store.dispatch(apiActions.generateMessageExhaustedRetries());
      }
    }, effectAbortController.signal),
  );

  store.when(internalActions.toolTurnSettled, (action) => {
    if (action.payload.continuation !== 'continue') {
      return;
    }

    store.dispatch(internalActions.sizzle());
  });

  store.when(devActions.stopMessageGeneration, () => {
    cancelAbortController.abort();
  });

  return () => {
    effectAbortController.abort();
    cancelAbortController.abort();
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

/**
 * Updates the messages array with an incoming assistant delta.
 *
 * @param messages - The current messages array.
 * @param delta - The incoming message delta.
 * @returns The updated messages array.
 */
export function _extractMessageDelta(
  messages: Chat.Api.Message[],
): Chat.Api.Message[] {
  if (messages.length === 0) {
    return messages;
  }

  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]?.role === 'assistant') {
      return messages.slice(index + 1);
    }
  }

  return messages;
}

export function _updateMessagesWithDelta(
  message: Chat.Api.AssistantMessage | null,
  delta: Chat.Api.CompletionChunk,
): Chat.Api.AssistantMessage | null {
  return updateAssistantMessage(message, delta);
}
