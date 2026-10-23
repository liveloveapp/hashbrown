import type { Message, Tool } from '@ag-ui/core';
import Anthropic from '@anthropic-ai/sdk';
import type {
  AnthropicBuiltInTools,
  AnthropicHashbrownRunAgentInput,
} from './types';
import { isProviderMetadata, readAnthropicHistory } from './anthropic-history';

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
  // Hashbrown stores reasoning as an ordered list on the assistant message and
  // joins text into one string, so where interleaved thinking sat between
  // text and tool_use blocks is not recorded. Replay keeps the reasoning
  // blocks in their original order and places them before text and tool use.
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
  representedMessageIds: ReadonlySet<string>,
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
      message.role === 'reasoning' && !representedMessageIds.has(message.id)
        ? [mapReasoningMessage(message)]
        : [],
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
      if (typeof message.content !== 'string') {
        throw new Error(
          'Anthropic provider currently requires text tool result content',
        );
      }

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
  builtInTools?: AnthropicBuiltInTools,
): Anthropic.Messages.MessageCreateParamsStreaming {
  const history = readAnthropicHistory(input.messages);
  const systemMessages = input.messages.flatMap((message) =>
    message.role === 'system' || message.role === 'developer'
      ? [message.content]
      : [],
  );
  const messages = input.messages.flatMap((original, index) => {
    const native = history.responses.get(original.id);
    if (native) return [{ role: 'assistant' as const, content: native }];
    if (history.representedMessageIds.has(original.id)) return [];
    if (
      original.role === 'tool' &&
      (history.providerCallIds.has(original.toolCallId) ||
        isProviderMetadata(original.metadata))
    )
      return [];
    const message =
      original.role === 'assistant'
        ? {
            ...original,
            toolCalls: original.toolCalls?.filter(
              (call) => !history.providerCallIds.has(call.id),
            ),
          }
        : original;
    if (
      message.role === 'assistant' &&
      original.role === 'assistant' &&
      original.toolCalls?.length &&
      !message.toolCalls?.length &&
      !message.content
    )
      return [];
    const mapped =
      message.role === 'assistant'
        ? mapAssistantMessage(
            message,
            mapPrecedingReasoning(
              input.messages,
              index,
              history.representedMessageIds,
            ),
          )
        : mapMessage(message);
    return mapped ? [mapped] : [];
  });
  const tools: Anthropic.Messages.ToolUnion[] = input.tools.map(mapTool);
  if (builtInTools?.webSearch)
    tools.push(
      builtInTools.webSearch === true
        ? { type: 'web_search_20250305', name: 'web_search' as const }
        : {
            ...structuredClone(builtInTools.webSearch),
            name: 'web_search' as const,
          },
    );
  if (builtInTools?.webFetch)
    tools.push(
      builtInTools.webFetch === true
        ? {
            type: 'web_fetch_20250910',
            name: 'web_fetch' as const,
            citations: { enabled: true },
          }
        : {
            ...structuredClone(builtInTools.webFetch),
            name: 'web_fetch' as const,
          },
    );
  if (builtInTools?.codeExecution)
    tools.push(
      builtInTools.codeExecution === true
        ? { type: 'code_execution_20250825', name: 'code_execution' as const }
        : {
            ...structuredClone(builtInTools.codeExecution),
            name: 'code_execution' as const,
          },
    );
  const responseSchema = input.forwardedProps?.hashbrown?.responseSchema;

  return {
    stream: true,
    model,
    max_tokens: DEFAULT_MAX_TOKENS,
    ...(systemMessages.length > 0
      ? { system: systemMessages.join('\n\n') }
      : {}),
    messages,
    ...(history.container ? { container: history.container } : {}),
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
