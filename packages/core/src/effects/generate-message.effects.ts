import { s } from '../schema';
import { DeepPartial } from '../utils';
import { sleep, switchAsync } from '../utils/async';
import { createEffect } from '../utils/micro-ngrx';
import { apiActions, devActions, internalActions } from '../actions';
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
} from '../reducers';
import { decodeFrames } from '../frames/decode-frames';

export const generateMessage = createEffect((store) => {
  const effectAbortController = new AbortController();

  store.when(
    devActions.init,
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
        model,
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

      await sleep(debounce, switchSignal);

      let attempt = 0;

      do {
        attempt++;

        if (effectAbortController.signal.aborted || switchSignal.aborted) {
          return;
        }

        let requestInit: RequestInit = {
          method: 'POST',
          body: JSON.stringify(params),
          headers: {
            'Content-Type': 'application/json',
          },
          signal: switchSignal,
        };

        if (middleware && middleware.length) {
          for (const m of middleware) {
            requestInit = await m(requestInit);
          }
        }

        const response = await fetch(apiUrl, requestInit);

        if (!response.ok) {
          store.dispatch(
            apiActions.generateMessageError(
              new Error(`HTTP error! Status: ${response.status}`),
            ),
          );
          continue;
        }

        if (!response.body) {
          store.dispatch(
            apiActions.generateMessageError(new Error(`Response body is null`)),
          );
          continue;
        }

        store.dispatch(apiActions.generateMessageStart());

        let message: Chat.Api.AssistantMessage | null = null;

        try {
          for await (const frame of decodeFrames(response.body, {
            signal: effectAbortController.signal,
          })) {
            switch (frame.type) {
              case 'chunk': {
                message = updateMessagesWithDelta(message, frame.chunk);
                if (message) {
                  store.dispatch(apiActions.generateMessageChunk(message));
                }
                break;
              }
              case 'error': {
                // Assumption: a 'finish' will follow the 'error', but we know we need to retry
                // as soon as we see the error.  Therefore, throw an exception to break out
                // of the for loop.
                throw new Error(frame.error);
                break;
              }
              case 'finish': {
                if (message) {
                  store.dispatch(
                    apiActions.generateMessageSuccess(
                      message as unknown as Chat.Api.AssistantMessage,
                    ),
                  );
                }
                break;
              }
            }
          }
        } catch (e) {
          if (e instanceof Error) {
            store.dispatch(apiActions.generateMessageError(e));
          }
          continue;
        }

        break;
      } while (retries > 0 && attempt < retries + 1);

      // Did we exhaust our retries?
      if (retries > 0 && attempt > retries) {
        store.dispatch(apiActions.generateMessageExhaustedRetries());
      }
    }, effectAbortController.signal),
  );

  return () => {
    effectAbortController.abort();
  };
});

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
function updateMessagesWithDelta(
  message: Chat.Api.AssistantMessage | null,
  delta: Chat.Api.CompletionChunk,
): Chat.Api.AssistantMessage | null {
  if (message && message.role === 'assistant') {
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
  } else if (delta.choices[0]?.delta?.role === 'assistant') {
    return {
      role: 'assistant',
      content: delta.choices[0].delta.content ?? '',
      toolCalls: mergeToolCalls([], delta.choices[0].delta.toolCalls ?? []),
    };
  }
  return message;
}
