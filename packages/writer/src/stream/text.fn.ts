/* eslint-disable @typescript-eslint/no-explicit-any */
import Writer from 'writer-sdk';
import { Chat } from '@hashbrownai/core';

export async function* text(
  apiKey: string,
  request: Chat.Api.CompletionCreateParams,
): AsyncIterable<Chat.Api.CompletionChunk> {
  const writer = new Writer({
    apiKey,
  });

  const stream = await writer.chat.chat({
    stream: true,
    model: request.model,
    max_tokens: request.max_tokens,
    temperature: request.temperature,
    tool_choice: request.tool_choice
      ? { value: request.tool_choice }
      : undefined,
    response_format: request.response_format
      ? {
          type: 'json_schema',
          json_schema: {
            strict: true,
            name: 'schema',
            description: '',
            schema: request.response_format,
          },
        }
      : undefined,
    tools:
      request.tools && request.tools.length > 0
        ? request.tools.map((tool) => ({
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters as Record<string, object>,
              strict: true,
            },
          }))
        : undefined,
    messages: request.messages.map(
      (message): Writer.Chat.ChatChatParams.Message => {
        switch (message.role) {
          case 'user':
            return {
              role: 'user',
              content: message.content,
            };
          case 'assistant':
            return {
              role: 'assistant',
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
          case 'tool':
            return {
              role: 'tool',
              content: JSON.stringify(message.content),
              tool_call_id: message.tool_call_id,
            };
          case 'system':
            return {
              role: 'system',
              content: message.content,
            };
          default:
            throw new Error(
              `Unsupported message role: ${(message as any).role}`,
            );
        }
      },
    ),
  });

  for await (const chunk of stream) {
    const chunkMessage: Chat.Api.CompletionChunk = {
      choices: chunk.choices.map((choice) => ({
        index: choice.index,
        delta: {
          ...choice.delta,
          tool_calls: choice.delta.tool_calls ?? undefined,
        },
        finish_reason: choice.finish_reason,
      })),
    };
    yield chunkMessage;
  }
}
