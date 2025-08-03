import {
  Chat,
  encodeFrame,
  Frame,
  ɵupdateMessagesWithDelta,
} from '@hashbrownai/core';
import OpenAI from 'openai';
import { FunctionParameters } from 'openai/resources/shared';

export interface OpenAITextStreamOptions {
  apiKey: string;
  request: Chat.Api.CompletionCreateParams;
  transformRequestOptions?: (
    options: OpenAI.Chat.ChatCompletionCreateParamsStreaming,
  ) =>
    | OpenAI.Chat.ChatCompletionCreateParamsStreaming
    | Promise<OpenAI.Chat.ChatCompletionCreateParamsStreaming>;
  onChatCompletion?: (
    messages: OpenAI.ChatCompletionMessageParam[],
    completionMessage: Chat.Api.AssistantMessage | null,
    usage: OpenAI.Completions.CompletionUsage | undefined,
  ) => Promise<void>;
  includeUsage?: boolean;
}

export async function* text(
  options: OpenAITextStreamOptions,
): AsyncIterable<Uint8Array> {
  const {
    apiKey,
    request,
    transformRequestOptions,
    onChatCompletion,
    includeUsage = true,
  } = options;
  const { messages, model, tools, responseFormat, toolChoice, system } =
    request;

  const openai = new OpenAI({
    apiKey,
  });

  try {
    const baseOptions: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
      stream: true,
      model: model as string,
      messages: [
        {
          role: 'system',
          content: system,
        },
        ...messages.map((message): OpenAI.ChatCompletionMessageParam => {
          if (message.role === 'user') {
            return {
              role: message.role,
              content: message.content,
            };
          }
          if (message.role === 'assistant') {
            return {
              role: message.role,
              content: message.content,
              tool_calls:
                message.toolCalls && message.toolCalls.length > 0
                  ? message.toolCalls.map((toolCall) => ({
                      ...toolCall,
                      type: 'function',
                      function: {
                        ...toolCall.function,
                        arguments: JSON.stringify(toolCall.function.arguments),
                      },
                    }))
                  : undefined,
            };
          }
          if (message.role === 'tool') {
            return {
              role: message.role,
              content: JSON.stringify(message.content),
              tool_call_id: message.toolCallId,
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
      tool_choice: toolChoice,
      response_format: responseFormat
        ? {
            type: 'json_schema',
            json_schema: {
              strict: true,
              name: 'schema',
              description: '',
              schema: responseFormat as Record<string, unknown>,
            },
          }
        : undefined,
      ...(includeUsage ? { stream_options: { include_usage: true } } : {}),
    };

    const resolvedOptions: OpenAI.Chat.ChatCompletionCreateParams =
      transformRequestOptions
        ? await transformRequestOptions(baseOptions)
        : baseOptions;

    const stream = openai.chat.completions.stream(resolvedOptions);

    // Only getting used when onChatCompletion is provided
    const chunks: Array<Chat.Api.CompletionChunk> = [];
    let usage: OpenAI.Completions.CompletionUsage | undefined;

    for await (const chunk of stream) {
      console.log('chunk', chunk);
      const chunkMessage: Chat.Api.CompletionChunk = {
        choices: chunk.choices.map(
          (choice): Chat.Api.CompletionChunkChoice => ({
            index: choice.index,
            delta: {
              content: choice.delta.content,
              role: choice.delta.role,
              toolCalls: choice.delta.tool_calls,
            },
            finishReason: choice.finish_reason,
          }),
        ),
      };

      const frame: Frame = {
        type: 'chunk',
        chunk: chunkMessage,
      };

      if (onChatCompletion) {
        chunks.push(chunkMessage);
      }

      if (includeUsage && chunk.usage) {
        usage = chunk.usage;
      }

      yield encodeFrame(frame);
    }

    if (onChatCompletion) {
      const completionMessage = chunks.reduce(ɵupdateMessagesWithDelta, null);

      onChatCompletion(resolvedOptions.messages, completionMessage, usage);
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
