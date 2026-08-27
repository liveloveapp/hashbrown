import type { Message, Tool } from '@ag-ui/core';
import Anthropic from '@anthropic-ai/sdk';
import type { AnthropicHashbrownRunAgentInput } from './types';

const DEFAULT_MAX_TOKENS = 4096;

function parseToolArguments(argumentsValue: string): unknown {
  try {
    return JSON.parse(argumentsValue);
  } catch {
    return argumentsValue;
  }
}

function mapAssistantMessage(
  message: Extract<Message, { role: 'assistant' }>,
): Anthropic.Messages.MessageParam {
  const content: Array<
    Anthropic.Messages.TextBlockParam | Anthropic.Messages.ToolUseBlockParam
  > = [
    ...(message.content
      ? [{ type: 'text' as const, text: message.content }]
      : []),
    ...(message.toolCalls ?? []).map((toolCall) => ({
      type: 'tool_use' as const,
      id: toolCall.id,
      name: toolCall.function.name,
      input: parseToolArguments(toolCall.function.arguments),
    })),
  ];

  return {
    role: 'assistant',
    content: content.length > 0 ? content : '',
  };
}

function mapMessage(
  message: Message,
): Anthropic.Messages.MessageParam | undefined {
  switch (message.role) {
    case 'developer':
    case 'system':
      return undefined;
    case 'user':
      if (typeof message.content !== 'string') {
        throw new Error(
          'Anthropic provider currently requires text user content',
        );
      }

      return {
        role: 'user',
        content: message.content,
      };
    case 'assistant':
      return mapAssistantMessage(message);
    case 'tool':
      return {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: message.toolCallId,
            content: message.content,
            ...(message.error !== undefined ? { is_error: true } : {}),
          },
        ],
      };
    case 'activity':
    case 'reasoning':
      return undefined;
  }
}

function mapTool(tool: Tool): Anthropic.Messages.Tool {
  const parameters = tool.parameters;

  if (parameters === undefined) {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: { type: 'object', properties: {} },
    };
  }

  if (
    parameters === null ||
    typeof parameters !== 'object' ||
    Array.isArray(parameters)
  ) {
    throw new Error(
      'Anthropic tool parameters must be a non-null, non-array object',
    );
  }

  if (parameters['type'] !== 'object') {
    throw new Error('Anthropic tool parameters must have type "object"');
  }

  return {
    name: tool.name,
    description: tool.description,
    input_schema: parameters as Anthropic.Messages.Tool.InputSchema,
  };
}

/**
 * Maps an AG-UI run input to Anthropic streaming message request options.
 *
 * @param input - Standard AG-UI run input with optional Hashbrown metadata.
 * @param model - Model selected by the server for this endpoint.
 * @returns Fresh Anthropic request options that do not mutate the run input.
 *
 * @internal
 */
export function createAnthropicRequestOptions(
  input: AnthropicHashbrownRunAgentInput,
  model: string,
): Anthropic.Messages.MessageCreateParamsStreaming {
  const systemMessages = input.messages.flatMap((message) =>
    message.role === 'system' || message.role === 'developer'
      ? [message.content]
      : [],
  );
  const messages = input.messages.flatMap((message) => {
    const mapped = mapMessage(message);
    return mapped ? [mapped] : [];
  });
  const tools = input.tools.map(mapTool);

  return {
    stream: true,
    model,
    max_tokens: DEFAULT_MAX_TOKENS,
    ...(systemMessages.length > 0
      ? { system: systemMessages.join('\n\n') }
      : {}),
    messages,
    ...(tools.length > 0 ? { tools } : {}),
  };
}
