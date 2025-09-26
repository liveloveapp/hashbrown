import { Chat, encodeFrame, Frame } from '@hashbrownai/core';
import Anthropic from '@anthropic-ai/sdk';

export interface AnthropicTextStreamOptions {
  apiKey: string;
  baseURL?: string;
  request: Chat.Api.CompletionCreateParams;
  transformRequestOptions?: (
    options: Anthropic.Messages.MessageCreateParamsStreaming,
  ) =>
    | Anthropic.Messages.MessageCreateParamsStreaming
    | Promise<Anthropic.Messages.MessageCreateParamsStreaming>;
}

export async function* text(
  options: AnthropicTextStreamOptions,
): AsyncIterable<Uint8Array> {
  const { apiKey, baseURL, request, transformRequestOptions } = options;
  const { messages, model, tools, toolChoice, system } = request;

  const anthropic = new Anthropic({
    apiKey,
    baseURL: baseURL,
  });

  try {
    const baseOptions: Anthropic.Messages.MessageCreateParamsStreaming = {
      stream: true,
      model: model as string,
      max_tokens: 4096, // Default max tokens
      system,
      messages: messages.map((message): Anthropic.Messages.MessageParam => {
        if (message.role === 'user') {
          return {
            role: message.role,
            content: message.content || '',
          };
        }
        if (message.role === 'assistant') {
          return {
            role: message.role,
            content:
              message.content && typeof message.content !== 'string'
                ? JSON.stringify(message.content)
                : message.content || '',
          };
        }
        if (message.role === 'tool') {
          return {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: message.toolCallId || '',
                content: JSON.stringify(message.content),
              },
            ],
          };
        }

        throw new Error(`Invalid message role`);
      }),
      tools:
        tools && tools.length > 0
          ? tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              input_schema: tool.parameters as Anthropic.Tool.InputSchema,
            }))
          : undefined,
      tool_choice: toolChoice
        ? {
            type: 'auto',
          }
        : undefined,
    };

    const resolvedOptions: Anthropic.Messages.MessageCreateParams =
      transformRequestOptions
        ? await transformRequestOptions(baseOptions)
        : baseOptions;

    const stream = anthropic.messages.stream(resolvedOptions);

    let currentContent = '';
    const currentToolCalls: Chat.Api.ToolCall[] = [];
    let finishReason: string | null = null;

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          currentContent += event.delta.text;
        } else if (event.delta.type === 'input_json_delta') {
          currentContent += event.delta.partial_json;
        }
      } else if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          currentToolCalls.push({
            index: currentToolCalls.length,
            id: event.content_block.id,
            type: 'function',
            function: {
              name: event.content_block.name,
              arguments: '',
            },
          });
        }
      } else if (event.type === 'message_delta') {
        finishReason = event.delta.stop_reason || null;
      }

      // Send chunk for each content update
      if (
        event.type === 'content_block_delta' ||
        event.type === 'content_block_start'
      ) {
        const chunkMessage: Chat.Api.CompletionChunk = {
          choices: [
            {
              index: 0,
              delta: {
                content: currentContent,
                role: 'assistant',
                toolCalls:
                  currentToolCalls.length > 0 ? currentToolCalls : undefined,
              },
              finishReason: finishReason,
            },
          ],
        };

        const frame: Frame = {
          type: 'chunk',
          chunk: chunkMessage,
        };

        yield encodeFrame(frame);
      }
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      const frame: Frame = {
        type: 'error',
        error: error.toString(),
        stacktrace: error.stack,
      };

      yield encodeFrame(frame);
    } else {
      const frame: Frame = {
        type: 'error',
        error: String(error),
      };

      yield encodeFrame(frame);
    }
  } finally {
    const frame: Frame = {
      type: 'finish',
    };

    yield encodeFrame(frame);
  }
}
