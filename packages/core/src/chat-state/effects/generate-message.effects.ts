import { s } from '../../schema';
import { DeepPartial } from '../../utils';
import { sleep, switchAsync } from '../../utils/async';
import { createEffect } from '../../utils/micro-ngrx';
import { apiActions, devActions, internalActions } from '../actions';
import { Chat } from '../models';
import {
  selectApiMessages,
  selectApiTools,
  selectApiUrl,
  selectDebounce,
  selectEmulateStructuredOutput,
  selectMaxTokens,
  selectMiddleware,
  selectModel,
  selectResponseSchema,
  selectShouldGenerateMessage,
  selectTemperature,
} from '../reducers';

export const generateMessage = createEffect((store) => {
  const effectAbortController = new AbortController();

  store.when(
    devActions.init,
    devActions.setMessages,
    devActions.sendMessage,
    internalActions.runToolCallsSuccess,
    switchAsync(async (switchSignal) => {
      const apiUrl = store.read(selectApiUrl);
      const middleware = store.read(selectMiddleware);
      const model = store.read(selectModel);
      const temperature = store.read(selectTemperature);
      const maxTokens = store.read(selectMaxTokens);
      const responseSchema = store.read(selectResponseSchema);
      const messages = store.read(selectApiMessages);
      const shouldGenerateMessage = store.read(selectShouldGenerateMessage);
      const debounce = store.read(selectDebounce);
      const tools = store.read(selectApiTools);
      const emulateStructuredOutput = store.read(selectEmulateStructuredOutput);

      if (!shouldGenerateMessage) {
        return;
      }

      const params: Chat.Api.CompletionCreateParams = {
        model,
        messages,
        temperature,
        tools,
        max_tokens: maxTokens,
        tool_choice:
          emulateStructuredOutput && responseSchema ? 'required' : undefined,
        response_format:
          !emulateStructuredOutput && responseSchema
            ? s.toJsonSchema(responseSchema)
            : undefined,
      };

      await sleep(debounce, switchSignal);

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
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      store.dispatch(apiActions.generateMessageStart());

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let message: Chat.Api.AssistantMessage | null = null;

      while (true) {
        if (effectAbortController.signal.aborted || switchSignal.aborted) {
          return;
        }

        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });

        try {
          const jsonChunks = chunk.split(/(?<=})(?={)/);

          for (const jsonChunk of jsonChunks) {
            if (jsonChunk.trim()) {
              const jsonData = JSON.parse(
                jsonChunk,
              ) as Chat.Api.CompletionChunk;

              message = updateMessagesWithDelta(message, jsonData);

              // We just made it non-null on the line above, so we can safely
              // assert it here.

              if (message) {
                store.dispatch(apiActions.generateMessageChunk(message));
              }
            }
          }
        } catch (error) {
          console.error('Error parsing JSON chunk:', error);
        }
      }

      store.dispatch(
        apiActions.generateMessageSuccess(
          message as unknown as Chat.Api.AssistantMessage,
        ),
      );
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
      message.tool_calls,
      delta.choices[0].delta.tool_calls ?? [],
    );
    const updatedMessage: Chat.Api.AssistantMessage = {
      ...message,
      content: (message.content ?? '') + (delta.choices[0].delta.content ?? ''),
      tool_calls: updatedToolCalls,
    };
    return updatedMessage;
  } else if (delta.choices[0].delta.role === 'assistant') {
    return {
      role: 'assistant',
      content: delta.choices[0].delta.content ?? '',
      tool_calls: mergeToolCalls([], delta.choices[0].delta.tool_calls ?? []),
    };
  }
  return message;
}
