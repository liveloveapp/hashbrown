import { Chat, encodeFrame, Frame } from '@hashbrownai/core';
import OllamaClient, { ChatRequest, Message, Ollama, ToolCall } from 'ollama';
import { FunctionParameters } from 'openai/resources/shared';

export interface OpenAITextStreamOptions {
  turbo?: { apiKey: string };
  request: Chat.Api.CompletionCreateParams;
}

export async function* text(
  options: OpenAITextStreamOptions,
): AsyncIterable<Uint8Array> {
  const { turbo, request } = options;
  const { messages, model, tools, responseFormat, toolChoice, system } =
    request;

  try {
    const baseOptions: ChatRequest & { stream: true } = {
      stream: true,
      model: model as string,
      // think: 'high' as any,
      think: true,
      options: {
        // num_ctx: 32768,
      },
      messages: [
        {
          role: 'system',
          content: system,
        },
        ...messages.map((message): Message => {
          if (message.role === 'user') {
            return {
              role: message.role,
              content: message.content,
            };
          }
          if (message.role === 'assistant') {
            return {
              role: message.role,
              content: message.content ?? '',
              tool_calls:
                message.toolCalls && message.toolCalls.length > 0
                  ? message.toolCalls.map(
                      (toolCall): ToolCall => ({
                        ...toolCall,
                        function: {
                          ...toolCall.function,
                          arguments: toolCall.function.arguments as unknown as {
                            [key: string]: any;
                          },
                        },
                      }),
                    )
                  : undefined,
            };
          }
          if (message.role === 'tool') {
            return {
              role: message.role,
              content: JSON.stringify(message.content),
            };
          }

          throw new Error(`Invalid message role`);
        }),
      ],
      tools:
        tools && tools.length > 0
          ? tools.map((tool) => ({
              type: 'function',
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters as FunctionParameters,
                strict: true,
              },
            }))
          : undefined,
      format: responseFormat ? responseFormat : undefined,
    };

    const client = turbo
      ? new Ollama({
          host: 'https://ollama.com',
          headers: {
            Authorization: `Bearer ${turbo.apiKey}`,
          },
        })
      : OllamaClient;

    const stream = await client.chat(baseOptions);

    for await (const chunk of stream) {
      const chunkMessage: Chat.Api.CompletionChunk = {
        choices: [
          {
            index: 0,
            delta: {
              content: chunk.message.content,
              role: chunk.message.role,
              toolCalls: chunk.message.tool_calls?.map((toolCall, index) => ({
                ...toolCall,
                id: `tool-call-${messages.length}-${index}`,
                index,
                function: {
                  ...toolCall.function,
                  arguments: toolCall.function.arguments as any,
                },
              })),
            },
            finishReason: chunk.done ? 'stop' : null,
          },
        ],
      };

      const frame: Frame = {
        type: 'chunk',
        chunk: chunkMessage,
      };

      yield encodeFrame(frame);
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
