import {
  Chat,
  encodeFrame,
  Frame,
  updateAssistantMessage,
} from '@hashbrownai/core';
import Anthropic from '@anthropic-ai/sdk';

type BaseAnthropicTextStreamOptions = {
  apiKey: string;
  baseURL?: string;
  request: Chat.Api.CompletionCreateParams;
  transformRequestOptions?: (
    options: Anthropic.Messages.MessageCreateParamsStreaming,
  ) =>
    | Anthropic.Messages.MessageCreateParamsStreaming
    | Promise<Anthropic.Messages.MessageCreateParamsStreaming>;
};

export type AnthropicTextStreamOptions = BaseAnthropicTextStreamOptions;

const DEFAULT_MAX_TOKENS = 4096;

export async function* text(
  options: AnthropicTextStreamOptions,
): AsyncIterable<Uint8Array> {
  const { apiKey, baseURL, request, transformRequestOptions } = options;
  const { model, tools, toolChoice, system } = request;

  const anthropic = new Anthropic({
    apiKey,
    baseURL,
  });

  if (request.operation === 'load-thread') {
    yield encodeFrame({
      type: 'error',
      error: {
        type: 'invalid_request',
        message: 'Thread operations are not supported.',
      },
    });
    return;
  }

  const mergedMessages = request.messages ?? [];
  let assistantMessage: Chat.Api.AssistantMessage | null = null;

  try {
    const baseOptions: Anthropic.Messages.MessageCreateParamsStreaming = {
      stream: true,
      model: model as string,
      max_tokens: DEFAULT_MAX_TOKENS,
      system,
      messages: toAnthropicMessages(mergedMessages),
      tools: tools && tools.length > 0 ? tools.map(toAnthropicTool) : undefined,
      tool_choice: mapToolChoice(toolChoice),
    };

    const resolvedOptions: Anthropic.Messages.MessageCreateParams =
      transformRequestOptions
        ? await transformRequestOptions(baseOptions)
        : baseOptions;

    const stream = anthropic.messages.stream(resolvedOptions);
    const debugStream = process.env['DEBUG_HASHBROWN_ANTHROPIC'] === '1';

    let finishReason: string | null = null;
    const toolCallBlocks = new Map<
      number,
      {
        id: string;
        name: string;
        index: number;
        buffer?: string;
        isOutput: boolean;
      }
    >();
    let toolCallCount = 0;

    yield encodeFrame({ type: 'generation-start' });

    for await (const event of stream) {
      let contentDelta: string | undefined;
      let toolCallDeltas: Chat.Api.ToolCall[] | undefined;

      if (debugStream) {
        console.log('[anthropic:event]', JSON.stringify(event));
      }

      switch (event.type) {
        case 'content_block_delta': {
          if (event.delta.type === 'text_delta') {
            contentDelta = event.delta.text;
          } else if (event.delta.type === 'input_json_delta') {
            const base = toolCallBlocks.get(event.index);
            if (base) {
              if (base.isOutput) {
                base.buffer = (base.buffer ?? '') + event.delta.partial_json;
                toolCallBlocks.set(event.index, base);
              } else {
                toolCallDeltas = [
                  {
                    index: base.index,
                    id: base.id,
                    type: 'function',
                    function: {
                      name: base.name,
                      arguments: event.delta.partial_json,
                    },
                  },
                ];
              }
            }
          }
          break;
        }
        case 'content_block_start': {
          if (event.content_block.type === 'tool_use') {
            const base = {
              id: event.content_block.id,
              name: event.content_block.name,
              index: toolCallCount++,
              buffer: undefined,
              isOutput: event.content_block.name === 'output',
            };

            toolCallBlocks.set(event.index, base);

            if (!base.isOutput) {
              toolCallDeltas = [
                {
                  index: base.index,
                  id: base.id,
                  type: 'function',
                  function: {
                    name: base.name,
                    arguments: '',
                  },
                },
              ];
            }
          }
          break;
        }
        case 'content_block_stop': {
          const base = toolCallBlocks.get(event.index);
          toolCallBlocks.delete(event.index);

          if (base?.isOutput && base.buffer) {
            contentDelta = normalizeOutputArguments(base.buffer);
          }
          break;
        }
        case 'message_delta': {
          finishReason = event.delta.stop_reason || null;
          break;
        }
      }

      if (contentDelta !== undefined || toolCallDeltas) {
        const chunkMessage: Chat.Api.CompletionChunk = {
          choices: [
            {
              index: 0,
              delta: {
                content: contentDelta ?? null,
                role: 'assistant',
                toolCalls: toolCallDeltas,
              },
              finishReason,
            },
          ],
        };

        if (debugStream && toolCallDeltas) {
          console.log('[anthropic:tool-delta]', JSON.stringify(toolCallDeltas));
        }

        assistantMessage = updateAssistantMessage(
          assistantMessage,
          chunkMessage,
        );

        yield encodeFrame({ type: 'generation-chunk', chunk: chunkMessage });
      }
    }

    yield encodeFrame({ type: 'generation-finish' });
  } catch (error: unknown) {
    const { message, stack } = normalizeError(error);
    const frame: Frame = {
      type: 'generation-error',
      error: message,
      stacktrace: stack,
    };

    yield encodeFrame(frame);
    return;
  }
}

function toAnthropicMessages(
  messages: Chat.Api.Message[],
): Anthropic.Messages.MessageParam[] {
  return messages.map((message): Anthropic.Messages.MessageParam => {
    if (message.role === 'user') {
      return {
        role: 'user',
        content: message.content ?? '',
      };
    }

    if (message.role === 'assistant') {
      const contentBlocks: Array<
        Anthropic.Messages.TextBlockParam | Anthropic.Messages.ToolUseBlockParam
      > = [];

      if (message.content) {
        contentBlocks.push({
          type: 'text',
          text:
            typeof message.content === 'string'
              ? message.content
              : JSON.stringify(message.content),
        });
      }

      if (message.toolCalls?.length) {
        contentBlocks.push(
          ...message.toolCalls.map((toolCall) => ({
            type: 'tool_use' as const,
            id: toolCall.id,
            name: toolCall.function.name,
            input: parseJson(toolCall.function.arguments),
          })),
        );
      }

      if (contentBlocks.length === 0) {
        return {
          role: 'assistant',
          content: '',
        };
      }

      if (contentBlocks.length === 1 && contentBlocks[0].type === 'text') {
        return {
          role: 'assistant',
          content: (contentBlocks[0] as Anthropic.Messages.TextBlockParam).text,
        };
      }

      return {
        role: 'assistant',
        content: contentBlocks,
      };
    }

    if (message.role === 'tool') {
      const serializedResult = serializeToolResult(message.content);

      return {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: message.toolCallId || '',
            content: serializedResult,
            is_error: message.content.status === 'rejected',
          },
        ],
      };
    }

    throw new Error(`Invalid message role: ${message['role']}`);
  });
}

function toAnthropicTool(tool: Chat.Api.Tool): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as Anthropic.Tool.InputSchema,
  };
}

function mapToolChoice(
  choice?: Chat.Api.CompletionToolChoiceOption,
): Anthropic.Messages.MessageCreateParams['tool_choice'] {
  switch (choice) {
    case 'auto': {
      return { type: 'auto' };
    }
    case 'required': {
      return { type: 'any' };
    }
    case 'none':
    default:
      return undefined;
  }
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function serializeToolResult(result: PromiseSettledResult<any>): string {
  if (result.status === 'fulfilled') {
    const value = result.value;
    return typeof value === 'string' ? value : JSON.stringify(value ?? '');
  }

  const reason = result.reason ?? 'Tool call failed';
  return typeof reason === 'string' ? reason : JSON.stringify(reason);
}

function normalizeOutputArguments(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    const normalized = normalizeNestedJson(parsed);
    return JSON.stringify(normalized);
  } catch {
    return raw;
  }
}

function normalizeNestedJson(value: unknown, parentKey?: string): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (looksLikeJson(trimmed)) {
      try {
        const parsed = JSON.parse(trimmed);
        const normalized = normalizeNestedJson(parsed, parentKey);

        if (
          parentKey &&
          isPlainObject(normalized) &&
          Object.keys(normalized).length === 1 &&
          Object.prototype.hasOwnProperty.call(normalized, parentKey)
        ) {
          return normalizeNestedJson(normalized[parentKey], parentKey);
        }

        return normalized;
      } catch {
        return value;
      }
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeNestedJson(item, parentKey));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [
        key,
        normalizeNestedJson(val, key),
      ]),
    );
  }

  return value;
}

function looksLikeJson(value: string): boolean {
  return (
    (value.startsWith('{') && value.endsWith('}')) ||
    (value.startsWith('[') && value.endsWith(']'))
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}
