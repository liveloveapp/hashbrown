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
  selectResponseSchema,
  selectRetries,
  selectShouldGenerateMessage,
  selectSystem,
  selectThreadId,
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
      const system = store.read(selectSystem);
      const emulateStructuredOutput = store.read(selectEmulateStructuredOutput);
      const shouldGenerateMessage = store.read(selectShouldGenerateMessage);
      const threadId = store.read(selectThreadId);
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
        toolChoice:
          emulateStructuredOutput && responseSchema ? 'required' : undefined,
        responseFormat:
          !emulateStructuredOutput && responseSchema
            ? s.toJsonSchema(responseSchema)
            : undefined,
        threadId: threadId,
      };

      const requestedFeatures: RequestedFeatures = {
        tools:
          Boolean(params.tools?.length) || params.toolChoice === 'required',
        structured: Boolean(params.responseFormat),
        ui: store.read(selectUiRequested),
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

            let message: Chat.Api.AssistantMessage | null = null;

            for await (const frame of decodeFrames(frameStream, {
              signal: AbortSignal.any([
                cancelAbortController.signal,
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
                    apiActions.threadLoadSuccess({ thread: frame.thread }),
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
                  store.dispatch(apiActions.generateMessageStart());
                  break;
                }
                case 'generation-chunk': {
                  message = updateAssistantMessage(message, frame.chunk);
                  if (message) {
                    store.dispatch(apiActions.generateMessageChunk(message));
                  }
                  break;
                }
                case 'thread-save-success': {
                  store.dispatch(
                    apiActions.threadSaveSuccess({ threadId: frame.threadId }),
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
                  // Assumption: a 'finish' will follow the 'error', but we know we need to retry
                  // as soon as we see the error.  Therefore, throw an exception to break out
                  // of the for loop.
                  throw new Error(frame.error);
                }
                case 'generation-finish': {
                  if (message) {
                    store.dispatch(
                      apiActions.generateMessageSuccess(
                        message as unknown as Chat.Api.AssistantMessage,
                      ),
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
