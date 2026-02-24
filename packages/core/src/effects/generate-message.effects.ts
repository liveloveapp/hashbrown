import { s } from '../schema';
import { sleep, switchAsync } from '../utils/async';
import { createEffect } from '../utils/micro-ngrx';
import { apiActions, devActions, internalActions } from '../actions';
import { decodeFrames } from '../frames/decode-frames';
import { Chat } from '../models';
import { updateAssistantMessage } from '../utils/assistant-message';
import {
  selectApiMessages,
  selectApiTools,
  selectApiUrl,
  selectDebounce,
  selectEmulateStructuredOutput,
  selectMiddleware,
  selectModel,
  selectRawStreamingMessage,
  selectRawStreamingToolCalls,
  selectResponseSchema,
  selectRetries,
  selectShouldGenerateMessage,
  selectStreamingMessageError,
  selectSystem,
  selectToolEntities,
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

export const generateMessage = createEffect((store) => {
  const effectAbortController = new AbortController();
  // This controller is used to cancel the current message generation
  // when a new message is sent or the user stops the generation.
  let cancelAbortController = new AbortController();

  store.when(
    internalActions.sizzle,
    devActions.setMessages,
    devActions.sendMessage,
    devActions.resendMessages,
    internalActions.runToolCallsSuccess,
    switchAsync(async (switchSignal) => {
      const apiUrl = store.read(selectApiUrl);
      const middleware = store.read(selectMiddleware);
      const model = store.read(selectModel);
      const responseSchema = store.read(selectResponseSchema);
      const messages = store.read(selectApiMessages);
      const debounce = store.read(selectDebounce);
      const retries = store.read(selectRetries);
      const tools = store.read(selectApiTools);
      const toolsByName = store.read(selectToolEntities);
      const system = store.read(selectSystem);
      const emulateStructuredOutput = store.read(selectEmulateStructuredOutput);
      const shouldGenerateMessage = store.read(selectShouldGenerateMessage);
      const messagePayload = messages;
      const shouldProceed = shouldGenerateMessage;

      if (!shouldProceed) {
        return;
      }

      const params: Chat.Api.CompletionCreateParams = {
        operation: 'generate',
        model,
        system,
        messages: messagePayload,
        tools,
        toolChoice:
          emulateStructuredOutput && responseSchema ? 'required' : undefined,
        responseFormat:
          !emulateStructuredOutput && responseSchema
            ? s.toJsonSchema(responseSchema)
            : undefined,
      };

      const requestedFeatures: RequestedFeatures = {
        tools:
          Boolean(params.tools?.length) || params.toolChoice === 'required',
        structured: Boolean(params.responseFormat),
        ui: store.read(selectUiRequested),
        threads: false,
      };

      await sleep(debounce, switchSignal);

      let attempt = 0;
      const transportProvider = store.read(selectTransport);
      const resolver = new ModelResolver(model, {
        url: apiUrl,
        middleware: middleware ?? undefined,
        transport: transportProvider,
      });

      let selection = await resolver.select(requestedFeatures);
      if (!selection) {
        store.dispatch(
          apiActions.generateMessageError(
            new Error(
              'No compatible model spec found for the requested features.',
            ),
          ),
        );
        return;
      }

      try {
        do {
          if (
            effectAbortController.signal.aborted ||
            switchSignal.aborted ||
            cancelAbortController.signal.aborted
          ) {
            // we need to reset the cancelAbortController for the next messsage
            if (cancelAbortController.signal.aborted) {
              cancelAbortController = new AbortController();
            }
            return;
          }

          let transportResponse: TransportResponse | undefined;

          try {
            attempt++;

            const requestAbortSignal = AbortSignal.any([
              switchSignal,
              effectAbortController.signal,
              cancelAbortController.signal,
            ]);

            const paramsWithModel: Chat.Api.CompletionCreateParams = {
              ...params,
              model: selection.spec.name,
            };

            transportResponse = await selection.transport.send({
              params: paramsWithModel,
              signal: requestAbortSignal,
              attempt,
              maxAttempts: retries + 1,
              requestId: _createRequestId(),
            });

            if (cancelAbortController.signal.aborted) {
              cancelAbortController = new AbortController();
              return;
            }

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

            let hasStarted = false;
            const textByItemId = new Map<string, string>();
            const toolArgsByItemId = new Map<string, string>();
            const toolItemsById = new Map<
              string,
              {
                itemId: string;
                id: string;
                index: number;
                name?: string;
                emittedArgsLength: number;
              }
            >();

            const ensureStarted = () => {
              if (hasStarted) {
                return;
              }
              hasStarted = true;
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
                            schema: s.normalizeSchemaOutput(responseSchema),
                            handler: async () => undefined,
                          },
                        }
                      : toolsByName,
                }),
              );
            };

            const dispatchTextDelta = (itemId: string, delta: string) => {
              if (!delta) {
                return;
              }
              ensureStarted();
              const current = textByItemId.get(itemId) ?? '';
              textByItemId.set(itemId, `${current}${delta}`);
              store.dispatch(
                apiActions.generateMessageChunk({
                  choices: [
                    {
                      index: 0,
                      delta: {
                        role: 'assistant',
                        content: delta,
                      },
                      finishReason: null,
                    },
                  ],
                }),
              );
            };

            const updateToolItem = (
              itemId: string,
              index: number,
              name: string | undefined,
              callId: string | undefined,
            ) => {
              const existing = toolItemsById.get(itemId);
              const next = {
                itemId,
                id: callId ?? itemId,
                index,
                name: name ?? existing?.name,
                emittedArgsLength: existing?.emittedArgsLength ?? 0,
              };
              toolItemsById.set(itemId, next);
              return next;
            };

            const dispatchToolArgs = (itemId: string, args: string) => {
              const toolItem = toolItemsById.get(itemId);
              if (!toolItem || !toolItem.name) {
                return;
              }

              if (args.length < toolItem.emittedArgsLength) {
                toolItem.emittedArgsLength = 0;
              }

              const delta = args.slice(toolItem.emittedArgsLength);
              if (!delta) {
                return;
              }

              toolItem.emittedArgsLength += delta.length;
              toolItemsById.set(itemId, toolItem);
              ensureStarted();
              store.dispatch(
                apiActions.generateMessageChunk({
                  choices: [
                    {
                      index: 0,
                      delta: {
                        role: 'assistant',
                        toolCalls: [
                          {
                            index: toolItem.index,
                            id: toolItem.id,
                            type: 'function',
                            function: {
                              name: toolItem.name,
                              arguments: delta,
                            },
                          },
                        ],
                      },
                      finishReason: null,
                    },
                  ],
                }),
              );
            };

            for await (const frame of decodeFrames(frameStream, {
              signal: AbortSignal.any([
                cancelAbortController.signal,
                effectAbortController.signal,
              ]),
            })) {
              switch (frame.type) {
                case 'generation-start': {
                  ensureStarted();
                  break;
                }
                case 'generation-chunk': {
                  store.dispatch(apiActions.generateMessageChunk(frame.chunk));
                  break;
                }
                case 'generation-error': {
                  // Assumption: a 'finish' will follow the 'error', but we know we need to retry
                  // as soon as we see the error.  Therefore, throw an exception to break out
                  // of the for loop.
                  throw new Error(frame.error);
                }
                case 'generation-finish': {
                  store.dispatch(apiActions.generateMessageFinish());

                  const streamingError = store.read(
                    selectStreamingMessageError,
                  );
                  if (streamingError) {
                    store.dispatch(
                      apiActions.generateMessageError(streamingError),
                    );
                    break;
                  }

                  const streamingMessage = store.read(
                    selectRawStreamingMessage,
                  );
                  const streamingToolCalls = store.read(
                    selectRawStreamingToolCalls,
                  );

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
                  break;
                }
                case 'response.created':
                case 'response.queued':
                case 'response.in_progress': {
                  ensureStarted();
                  break;
                }
                case 'response.output_text.delta': {
                  dispatchTextDelta(frame.itemId, frame.delta);
                  break;
                }
                case 'response.output_text.done': {
                  const previous = textByItemId.get(frame.itemId) ?? '';
                  const nextText = frame.text ?? '';
                  const delta = nextText.startsWith(previous)
                    ? nextText.slice(previous.length)
                    : nextText;
                  if (!nextText.startsWith(previous)) {
                    textByItemId.set(frame.itemId, '');
                  }
                  if (delta) {
                    dispatchTextDelta(frame.itemId, delta);
                  } else {
                    textByItemId.set(frame.itemId, nextText);
                  }
                  break;
                }
                case 'response.refusal.delta': {
                  dispatchTextDelta(frame.itemId, frame.delta);
                  break;
                }
                case 'response.refusal.done': {
                  const previous = textByItemId.get(frame.itemId) ?? '';
                  const nextText = frame.refusal ?? '';
                  const delta = nextText.startsWith(previous)
                    ? nextText.slice(previous.length)
                    : nextText;
                  if (!nextText.startsWith(previous)) {
                    textByItemId.set(frame.itemId, '');
                  }
                  if (delta) {
                    dispatchTextDelta(frame.itemId, delta);
                  } else {
                    textByItemId.set(frame.itemId, nextText);
                  }
                  break;
                }
                case 'response.output_item.added':
                case 'response.output_item.done': {
                  const item = frame.item;
                  if (!item || typeof item !== 'object') {
                    break;
                  }
                  const type =
                    typeof (item as { type?: unknown }).type === 'string'
                      ? (item as { type: string }).type
                      : undefined;
                  if (type !== 'function_call') {
                    break;
                  }
                  const itemId =
                    typeof (item as { id?: unknown }).id === 'string'
                      ? (item as { id: string }).id
                      : undefined;
                  if (!itemId) {
                    break;
                  }
                  const name =
                    typeof (item as { name?: unknown }).name === 'string'
                      ? (item as { name: string }).name
                      : undefined;
                  const callId =
                    typeof (item as { call_id?: unknown }).call_id === 'string'
                      ? (item as { call_id: string }).call_id
                      : undefined;
                  const toolItem = updateToolItem(
                    itemId,
                    frame.outputIndex,
                    name,
                    callId,
                  );
                  const args = toolArgsByItemId.get(itemId);
                  if (args) {
                    dispatchToolArgs(toolItem.itemId, args);
                  }
                  break;
                }
                case 'response.function_call_arguments.delta': {
                  const current = toolArgsByItemId.get(frame.itemId) ?? '';
                  const nextArgs = `${current}${frame.delta}`;
                  toolArgsByItemId.set(frame.itemId, nextArgs);
                  dispatchToolArgs(frame.itemId, nextArgs);
                  break;
                }
                case 'response.function_call_arguments.done': {
                  const nextArgs = frame.arguments ?? '';
                  toolArgsByItemId.set(frame.itemId, nextArgs);
                  dispatchToolArgs(frame.itemId, nextArgs);
                  break;
                }
                case 'response.completed':
                case 'response.incomplete': {
                  store.dispatch(apiActions.generateMessageFinish());

                  const streamingError = store.read(
                    selectStreamingMessageError,
                  );
                  if (streamingError) {
                    store.dispatch(
                      apiActions.generateMessageError(streamingError),
                    );
                    break;
                  }

                  const streamingMessage = store.read(
                    selectRawStreamingMessage,
                  );
                  const streamingToolCalls = store.read(
                    selectRawStreamingToolCalls,
                  );

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
                  break;
                }
                case 'response.failed': {
                  throw new Error('Response failed.');
                }
                case 'error': {
                  throw new Error(frame.error.message);
                }
              }
            }
          } catch (e) {
            const error =
              e instanceof Error ? e : new Error('Unknown transport error');
            store.dispatch(apiActions.generateMessageError(error));

            const retryable =
              !(e instanceof TransportError) || e.retryable !== false;

            if (
              e instanceof TransportError &&
              (e.code === 'FEATURE_UNSUPPORTED' ||
                e.code === 'PLATFORM_UNSUPPORTED')
            ) {
              resolver.skipFromError(selection.spec, e);
              selection = await resolver.select(requestedFeatures);
              if (!selection) {
                break;
              }
              continue;
            }

            if (!retryable) {
              break;
            }

            continue;
          } finally {
            await transportResponse?.dispose?.();
            if (cancelAbortController.signal.aborted) {
              cancelAbortController = new AbortController();
            }
          }

          break;
        } while (retries > 0 && attempt < retries + 1);
      } finally {
        store.dispatch(apiActions.assistantTurnFinalized());
      }

      // Did we exhaust our retries?
      if (retries > 0 && attempt > retries) {
        store.dispatch(apiActions.generateMessageExhaustedRetries());
      }
    }, effectAbortController.signal),
  );

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
