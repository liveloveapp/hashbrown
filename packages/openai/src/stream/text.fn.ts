import 'dotenv/config';
import { Chat, s } from '@hashbrownai/core';
import OpenAI from 'openai';

export async function* text(
  request: Chat.CompletionCreateParams,
): Chat.CompletionChunkResponse {
  const { messages, model, max_tokens, temperature, tools, response_format } =
    request;

  const openai = new OpenAI({
    apiKey: process.env['OPENAI_API_KEY'],
  });

  const stream = openai.beta.chat.completions.stream({
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
              parameters: s.toJsonSchema(tool.schema),
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
  });

  for await (const chunk of stream) {
    const chunkMessage: Chat.CompletionChunk = {
      choices: chunk.choices.map((choice) => ({
        index: choice.index,
        delta: choice.delta,
        finish_reason: choice.finish_reason,
      })),
    };
    yield chunkMessage;
  }
}
