import { Chat } from '../models';
import { DeepPartial } from './types';

/**
 * Merges partial tool call deltas into a stable list.
 * @public
 */
export function mergeToolCalls(
  existingCalls: Chat.Api.ToolCall[] = [],
  newCalls: DeepPartial<Chat.Api.ToolCall>[] = [],
): Chat.Api.ToolCall[] {
  const merged = [...existingCalls];
  newCalls.forEach((newCall) => {
    const index = merged.findIndex((call) => call.index === newCall.index);
    if (index !== -1) {
      const existing = merged[index];
      const existingMetadata =
        existing.metadata && typeof existing.metadata === 'object'
          ? existing.metadata
          : undefined;
      const newMetadata =
        newCall.metadata && typeof newCall.metadata === 'object'
          ? newCall.metadata
          : undefined;
      merged[index] = {
        ...existing,
        function: {
          ...existing.function,
          arguments:
            existing.function.arguments + (newCall.function?.arguments ?? ''),
        },
        metadata: newMetadata
          ? { ...(existingMetadata ?? {}), ...newMetadata }
          : existing.metadata,
      };
    } else {
      merged.push(newCall as Chat.Api.ToolCall);
    }
  });
  return merged;
}

/**
 * Applies a streaming completion delta to an assistant message.
 * @public
 */
export function updateAssistantMessage(
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
