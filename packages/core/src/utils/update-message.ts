import { Chat } from '../models';
import { DeepPartial } from '../utils';

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
export function updateMessagesWithDelta(
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
