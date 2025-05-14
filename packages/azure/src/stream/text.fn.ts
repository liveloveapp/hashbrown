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
  const { messages, model, max_tokens, temperature, tools, response_format } =
    request;

  const client = new AzureOpenAI({
    apiKey,
    endpoint,
    apiVersion,
    deployment: model,
  });

  const stream = await client.chat.completions.create({
    model: model,
    messages: messages.map((message): OpenAI.ChatCompletionMessageParam => {
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
            message.tool_calls && message.tool_calls.length > 0
              ? message.tool_calls.map((toolCall) => ({
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
          tool_call_id: message.tool_call_id,
        };
      }
      if (message.role === 'system') {
        return {
          role: message.role,
          content: message.content,
        };
      }

      throw new Error(`Invalid message role`);
    }),
    max_completion_tokens: max_tokens,
    temperature,
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
    response_format: response_format
      ? {
          type: 'json_schema',
          json_schema: {
            strict: true,
            name: 'schema',
            description: '',
            schema: response_format as Record<string, unknown>,
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
        finish_reason: choice.finish_reason,
      })),
    };
    yield chunkMessage;
  }
}
