import type { Message, Tool } from '@ag-ui/core';
import Anthropic from '@anthropic-ai/sdk';
import type { AnthropicHashbrownRunAgentInput } from './types';

const DEFAULT_MAX_TOKENS = 4096;

type AnthropicAssistantContentBlock =
  | Anthropic.Messages.TextBlockParam
  | Anthropic.Messages.ThinkingBlockParam
  | Anthropic.Messages.RedactedThinkingBlockParam
  | Anthropic.Messages.ToolUseBlockParam;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseToolArguments(argumentsValue: string): unknown {
  try {
    return JSON.parse(argumentsValue);
  } catch {
    return argumentsValue;
  }
}

function mapAssistantMessage(
  message: Extract<Message, { role: 'assistant' }>,
  reasoningBlocks: Array<
    | Anthropic.Messages.ThinkingBlockParam
    | Anthropic.Messages.RedactedThinkingBlockParam
  > = [],
): Anthropic.Messages.MessageParam {
  const content: AnthropicAssistantContentBlock[] = [
    ...reasoningBlocks,
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

function mapReasoningMessage(
  message: Extract<Message, { role: 'reasoning' }>,
):
  | Anthropic.Messages.ThinkingBlockParam
  | Anthropic.Messages.RedactedThinkingBlockParam
  | undefined {
  const metadata = message.metadata;
  if (
    !isRecord(metadata) ||
    !Object.prototype.hasOwnProperty.call(metadata, 'anthropic')
  ) {
    return undefined;
  }

  const marker = metadata['anthropic'];
  const messageReference = `Anthropic reasoning message "${message.id}"`;
  if (!isRecord(marker)) {
    throw new Error(`${messageReference} metadata.anthropic must be an object`);
  }

  const blockType = marker['blockType'];
  if (blockType !== 'thinking' && blockType !== 'redacted_thinking') {
    throw new Error(
      `${messageReference} metadata.anthropic.blockType must be "thinking" or "redacted_thinking"`,
    );
  }

  if (typeof message.content !== 'string') {
    throw new Error(`${messageReference} content must be a string`);
  }

  if (
    typeof message.encryptedValue !== 'string' ||
    message.encryptedValue.length === 0
  ) {
    throw new Error(
      `${messageReference} encryptedValue must be a non-empty string`,
    );
  }

  if (blockType === 'redacted_thinking') {
    if (message.content !== '') {
      throw new Error(
        `${messageReference} redacted_thinking content must be empty`,
      );
    }

    return { type: 'redacted_thinking', data: message.encryptedValue };
  }

  return {
    type: 'thinking',
    thinking: message.content,
    signature: message.encryptedValue,
  };
}

function mapPrecedingReasoning(
  messages: Message[],
  assistantIndex: number,
): Array<
  | Anthropic.Messages.ThinkingBlockParam
  | Anthropic.Messages.RedactedThinkingBlockParam
> {
  let reasoningStart = assistantIndex;
  while (
    reasoningStart > 0 &&
    messages[reasoningStart - 1]?.role === 'reasoning'
  ) {
    reasoningStart -= 1;
  }

  return messages
    .slice(reasoningStart, assistantIndex)
    .flatMap((message) =>
      message.role === 'reasoning' ? [mapReasoningMessage(message)] : [],
    )
    .filter(
      (
        block,
      ): block is
        | Anthropic.Messages.ThinkingBlockParam
        | Anthropic.Messages.RedactedThinkingBlockParam => block !== undefined,
    );
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

function mapTool(tool: Tool, index: number): Anthropic.Messages.Tool {
  const parameters = tool.parameters;
  const toolReference = `Anthropic tool "${tool.name}" at index ${index}`;

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
      `${toolReference} parameters must be a non-null, non-array object`,
    );
  }

  if (parameters['type'] !== 'object') {
    throw new Error(`${toolReference} parameters must have type "object"`);
  }

  let inputSchema: Anthropic.Messages.Tool.InputSchema;
  try {
    inputSchema = structuredClone(
      parameters,
    ) as Anthropic.Messages.Tool.InputSchema;
  } catch {
    throw new Error(`Failed to clone parameters for ${toolReference}`);
  }

  return {
    name: tool.name,
    description: tool.description,
    input_schema: inputSchema,
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
  const messages = input.messages.flatMap((message, index) => {
    const mapped =
      message.role === 'assistant'
        ? mapAssistantMessage(
            message,
            mapPrecedingReasoning(input.messages, index),
          )
        : mapMessage(message);
    return mapped ? [mapped] : [];
  });
  const tools = input.tools.map(mapTool);
  const responseSchema = input.hashbrown?.responseSchema;

  return {
    stream: true,
    model,
    max_tokens: DEFAULT_MAX_TOKENS,
    ...(systemMessages.length > 0
      ? { system: systemMessages.join('\n\n') }
      : {}),
    messages,
    ...(tools.length > 0 ? { tools } : {}),
    ...(responseSchema === undefined
      ? {}
      : {
          output_config: {
            format: {
              type: 'json_schema' as const,
              schema: structuredClone(
                responseSchema,
              ) as Anthropic.Messages.JSONOutputFormat['schema'],
            },
          },
        }),
  };
}
