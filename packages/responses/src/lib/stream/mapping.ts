import type { Chat } from '@hashbrownai/core';

import type {
  OpenResponsesCreateResponseRequest,
  OpenResponsesFunctionCallItem,
  OpenResponsesInputItem,
  OpenResponsesTool,
} from './types';

/**
 * Map Hashbrown chat completion parameters to an Open Responses request.
 *
 * @public
 * @param request - Hashbrown chat completion parameters.
 * @returns Open Responses request payload.
 */
export function mapChatRequestToOpenResponses(
  request: Chat.Api.CompletionCreateParams,
): OpenResponsesCreateResponseRequest {
  const input = mapMessagesToInputItems(request.messages ?? []);
  const tools = mapTools(request.tools);

  return {
    model: request.model as string,
    instructions: request.system,
    input: input.length > 0 ? input : undefined,
    tools,
    tool_choice: request.toolChoice,
    response_format: request.responseFormat,
  };
}

const mapTools = (
  tools: Chat.Api.Tool[] | undefined,
): OpenResponsesTool[] | undefined => {
  if (!tools || tools.length === 0) {
    return undefined;
  }

  return tools.map((tool) => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
};

const mapMessagesToInputItems = (
  messages: Chat.Api.Message[],
): OpenResponsesInputItem[] =>
  messages.flatMap((message) => {
    if (message.role === 'user') {
      return [
        {
          type: 'message',
          role: 'user',
          content: normalizeContent(message.content),
        },
      ];
    }

    if (message.role === 'assistant') {
      const items: OpenResponsesInputItem[] = [];
      if (message.content !== undefined) {
        items.push({
          type: 'message',
          role: 'assistant',
          content: normalizeContent(message.content),
        });
      }

      if (message.toolCalls && message.toolCalls.length > 0) {
        items.push(...mapToolCalls(message.toolCalls));
      }

      return items;
    }

    if (message.role === 'tool') {
      return [
        {
          type: 'function_call_output',
          call_id: message.toolCallId,
          output: JSON.stringify(message.content),
        },
      ];
    }

    throw new Error(`Unsupported message role: ${message.role}`);
  });

const mapToolCalls = (
  toolCalls: Chat.Api.ToolCall[],
): OpenResponsesFunctionCallItem[] =>
  toolCalls.map((toolCall) => ({
    type: 'function_call',
    call_id: toolCall.id,
    name: toolCall.function.name,
    arguments: normalizeContent(toolCall.function.arguments),
  }));

const normalizeContent = (content: unknown): string => {
  if (typeof content === 'string') {
    return content;
  }

  return JSON.stringify(content);
};
