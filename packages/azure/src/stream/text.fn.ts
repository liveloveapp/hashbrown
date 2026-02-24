import {
  AzureKnownModelIds,
  Chat,
  encodeFrame,
  Frame,
  updateAssistantMessage,
} from '@hashbrownai/core';
import OpenAI, { AzureOpenAI } from 'openai';
import type { FunctionParameters } from 'openai/resources/shared';

type BaseAzureTextStreamOptions = {
  apiKey: string;
  endpoint: string;
  request: AzureCompletionCreateParams;
  transformRequestOptions?: (
    options: OpenAI.Chat.ChatCompletionCreateParamsStreaming,
  ) =>
    | OpenAI.Chat.ChatCompletionCreateParamsStreaming
    | Promise<OpenAI.Chat.ChatCompletionCreateParamsStreaming>;
};

export type AzureTextStreamOptions = BaseAzureTextStreamOptions;

export interface AzureCompletionCreateParams extends Omit<
  Chat.Api.CompletionCreateParams,
  'model'
> {
  model: AzureKnownModelIds;
}

export async function* text(
  options: AzureTextStreamOptions,
): AsyncIterable<Uint8Array> {
  const { apiKey, endpoint, request, transformRequestOptions } = options;
  const {
    model: modelAndVersion,
    tools,
    responseFormat,
    system,
    toolChoice,
  } = request;
  if (!modelAndVersion.includes('@')) {
    throw new Error(
      'Model version is required when using Azure OpenAI. Please specify the model version in the `model` string when supplied to any resource.',
    );
  }

  const [model, apiVersion] = modelAndVersion.split('@');

  const client = new AzureOpenAI({
    apiKey,
    endpoint,
    apiVersion,
    deployment: model,
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
    const baseOptions: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
      stream: true,
      model: model,
      messages: [
        {
          role: 'system',
          content: system,
        },
        ...mergedMessages.map((message): OpenAI.ChatCompletionMessageParam => {
          if (message.role === 'user') {
            return {
              role: message.role,
              content: message.content,
            };
          }
          if (message.role === 'assistant') {
            return {
              role: message.role,
              content:
                message.content && typeof message.content !== 'string'
                  ? JSON.stringify(message.content)
                  : message.content,
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
    };

    const resolvedOptions: OpenAI.Chat.ChatCompletionCreateParams =
      transformRequestOptions
        ? await transformRequestOptions(baseOptions)
        : baseOptions;

    const stream = client.chat.completions.stream(resolvedOptions);

    yield encodeFrame({ type: 'generation-start' });

    for await (const chunk of stream) {
      const chunkMessage: Chat.Api.CompletionChunk = {
        choices: chunk.choices.map(
          (choice): Chat.Api.CompletionChunkChoice => ({
            index: choice.index,
            delta: {
              content: choice.delta?.content,
              role: choice.delta?.role,
              toolCalls: choice.delta?.tool_calls,
            },
            finishReason: choice.finish_reason,
          }),
        ),
      };

      const frame: Frame = {
        type: 'generation-chunk',
        chunk: chunkMessage,
      };

      assistantMessage = updateAssistantMessage(assistantMessage, chunkMessage);

      yield encodeFrame(frame);
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

function normalizeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}
