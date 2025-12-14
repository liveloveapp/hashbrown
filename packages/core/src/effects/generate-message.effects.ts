import { s } from '../schema';
import { DeepPartial } from '../utils';
import { sleep, switchAsync } from '../utils/async';
import { createEffect } from '../utils/micro-ngrx';
import { apiActions, devActions, internalActions } from '../actions';
import { decodeFrames } from '../frames/decode-frames';
import { Chat } from '../models';
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
      const shouldGenerateMessage = store.read(selectShouldGenerateMessage);
      const debounce = store.read(selectDebounce);
      const retries = store.read(selectRetries);
      const tools = store.read(selectApiTools);
      const system = store.read(selectSystem);
      const emulateStructuredOutput = store.read(selectEmulateStructuredOutput);

      if (!shouldGenerateMessage) {
        return;
      }

      const params: Chat.Api.CompletionCreateParams = {
        model: typeof model === 'string' ? model : '',
        system,
        messages,
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

          store.dispatch(apiActions.generateMessageStart());

          let message: Chat.Api.AssistantMessage | null = null;

          for await (const frame of decodeFrames(frameStream, {
            signal: AbortSignal.any([
              cancelAbortController.signal,
              effectAbortController.signal,
            ]),
          })) {
            switch (frame.type) {
              case 'chunk': {
                message = _updateMessagesWithDelta(message, frame.chunk);
                if (message) {
                  store.dispatch(apiActions.generateMessageChunk(message));
                }
                break;
              }
              case 'error': {
                throw new Error(frame.error);
              }
              case 'finish': {
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
 * Merges existing and new tool calls.
 *
 * @param existingCalls - The existing tool calls.
 * @param newCalls - The new tool calls to merge.
 * @returns The merged array of tool calls.
 */
function mergeToolCalls(
  existingCalls: Chat.Api.ToolCall[] = [],
  newCalls: DeepPartial<Chat.Api.ToolCall>[] = [],
): Chat.Api.ToolCall[] {
  const merged = [...existingCalls];
  newCalls.forEach((newCall) => {
    const index = merged.findIndex((call) => call.index === newCall.index);
    if (index !== -1) {
      const existing = merged[index];
      merged[index] = {
        ...existing,
        function: {
          ...existing.function,
          arguments:
            existing.function.arguments + (newCall.function?.arguments ?? ''),
        },
      };
    } else {
      merged.push(newCall as Chat.Api.ToolCall);
    }
  });
  return merged;
}

/**
 * Updates the messages array with an incoming assistant delta.
 *
 * @param messages - The current messages array.
 * @param delta - The incoming message delta.
 * @returns The updated messages array.
 */
export function _updateMessagesWithDelta(
  message: Chat.Api.AssistantMessage | null,
  delta: Chat.Api.CompletionChunk,
): Chat.Api.AssistantMessage | null {
  if (message && message.role === 'assistant' && delta.choices.length) {
    const updatedToolCalls = mergeToolCalls(
      message.toolCalls,
      delta.choices[0].delta.toolCalls ?? [],
    );
    const updatedMessage: Chat.Api.AssistantMessage = {
      ...message,
      content: (message.content ?? '') + (delta.choices[0].delta.content ?? ''),
      toolCalls: updatedToolCalls,
    };
    return updatedMessage;
  } else if (
    delta.choices.length &&
    delta.choices[0]?.delta?.role === 'assistant'
  ) {
    return {
      role: 'assistant',
      content: delta.choices[0].delta.content ?? '',
      toolCalls: mergeToolCalls([], delta.choices[0].delta.toolCalls ?? []),
    };
  }
  return message;
}
