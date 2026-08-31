import type { Message } from '@ag-ui/core';
import OpenAI from 'openai';
import type { FunctionParameters } from 'openai/resources/shared';
import type { AzureHashbrownRunAgentInput } from './types';

function mapMessage(
  message: Message,
): OpenAI.ChatCompletionMessageParam | undefined {
  switch (message.role) {
    case 'developer':
    case 'system':
      return { role: message.role, content: message.content };
    case 'user':
      if (typeof message.content !== 'string') {
        throw new Error(
          'Azure OpenAI provider currently requires text user content',
        );
      }

      return { role: 'user', content: message.content };
    case 'assistant':
      return {
        role: 'assistant',
        content: message.content ?? null,
        tool_calls: message.toolCalls?.map((toolCall) => ({
          id: toolCall.id,
          type: 'function',
          function: {
            name: toolCall.function.name,
            arguments: toolCall.function.arguments,
          },
        })),
      };
    case 'tool':
      return {
        role: 'tool',
        content: message.content,
        tool_call_id: message.toolCallId,
      };
    case 'activity':
    case 'reasoning':
      return undefined;
  }
}

function createResponseFormat(
  responseSchema: object | undefined,
): OpenAI.Chat.ChatCompletionCreateParamsStreaming['response_format'] {
  if (!responseSchema) {
    return undefined;
  }

  return {
    type: 'json_schema',
    json_schema: {
      strict: true,
      name: 'schema',
      description: '',
      schema: structuredClone(responseSchema) as Record<string, unknown>,
    },
  };
}

/**
 * Maps an AG-UI run input to Azure OpenAI streaming request options.
 *
 * @param input - Standard AG-UI run input with optional Hashbrown metadata.
 * @param model - Model selected by the server for this endpoint.
 * @returns Fresh Azure OpenAI request options that do not mutate the input.
 *
 * @internal
 */
export function createAzureRequestOptions(
  input: AzureHashbrownRunAgentInput,
  model: string,
): OpenAI.Chat.ChatCompletionCreateParamsStreaming {
  return {
    stream: true,
    model,
    messages: input.messages.flatMap((message) => {
      const mapped = mapMessage(message);
      return mapped ? [mapped] : [];
    }),
    tools:
      input.tools.length === 0
        ? undefined
        : input.tools.map((tool) => ({
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description,
              parameters:
                tool.parameters === undefined
                  ? undefined
                  : (structuredClone(tool.parameters) as FunctionParameters),
              strict: true,
            },
          })),
    response_format: createResponseFormat(input.hashbrown?.responseSchema),
  };
}
