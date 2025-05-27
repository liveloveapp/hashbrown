import { Chat } from '@hashbrownai/core';
import OpenAI, { AzureOpenAI } from 'openai';

export interface AzureClient {
  stream: {
    text: (
      apiKey: string,
      endpoint: string,
      apiVersion: string,
      request: Chat.Api.CompletionCreateParams,
    ) => AsyncIterable<Chat.Api.CompletionChunk>;
  };
}

export async function* text(
  apiKey: string,
  endpoint: string,
  apiVersion: string,
  request: Chat.Api.CompletionCreateParams,
): AsyncIterable<Chat.Api.CompletionChunk> {
  const { messages, model, tools, responseFormat, system } = request;

  const client = new AzureOpenAI({
    apiKey,
    endpoint,
    apiVersion,
    deployment: model,
  });

  const stream = await client.chat.completions.create({
    model: model,
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
              parameters: tool.parameters as Record<string, object>,
              strict: true,
            },
          }))
        : undefined,
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
    stream: true,
  });

  for await (const chunk of stream) {
    const chunkMessage: Chat.Api.CompletionChunk = {
      choices: chunk.choices.map((choice) => ({
        index: choice.index,
        delta: choice.delta,
        finishReason: choice.finish_reason,
      })),
    };
    yield chunkMessage;
  }
}
