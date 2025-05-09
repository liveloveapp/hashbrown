import { Chat, s } from '@hashbrownai/core';
import { BoundTool } from './create-tool.fn';

/**
 * Creates OpenAI tool definitions from the provided tools.
 *
 * @param tools - The list of tools from configuration.
 * @returns An array of tool definitions for the chat completion.
 */
export function createToolDefinitions(
  tools: BoundTool<
    string,
    s.ObjectType<Record<string, s.HashbrownType>>
  >[] = [],
): Chat.Tool[] {
  return tools.map((boundTool): Chat.Tool => boundTool.toTool());
}

/**
 * Merges existing and new tool calls.
 *
 * @param existingCalls - The existing tool calls.
 * @param newCalls - The new tool calls to merge.
 * @returns The merged array of tool calls.
 */
function mergeToolCalls(
  existingCalls: Chat.AssistantMessage['tool_calls'] = [],
  newCalls: Chat.AssistantMessage['tool_calls'] = [],
): Chat.AssistantMessage['tool_calls'] {
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
            existing.function.arguments + (newCall.function.arguments ?? ''),
        },
      };
    } else {
      merged.push(newCall);
    }
  });

  console.log(merged);
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
  message: Chat.Message | null,
  delta: Partial<Chat.Message>,
): Chat.Message | null {
  if (message && message.role === 'assistant') {
    const updatedToolCalls = mergeToolCalls(
      message.tool_calls,
      (delta as Chat.AssistantMessage).tool_calls ?? [],
    );
    const updatedMessage: Chat.Message = {
      ...message,
      content: (message.content ?? '') + (delta.content ?? ''),
      tool_calls: updatedToolCalls,
    };
    return updatedMessage;
  } else if (delta.role === 'assistant') {
    return {
      role: 'assistant',
      content: delta.content ?? '',
      tool_calls: delta.tool_calls ?? [],
    };
  }
  return message;
}
