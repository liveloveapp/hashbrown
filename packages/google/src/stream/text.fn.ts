import {
  Content,
  GenerateContentParameters,
  GoogleGenAI,
  Part,
} from '@google/genai';
import { Chat, s } from '@hashbrownai/core';

export async function* text(
  apiKey: string,
  request: Chat.CompletionCreateParams,
): Chat.CompletionChunkResponse {
  const { messages, model, response_format, tools } = request;
  const ai = new GoogleGenAI({
    apiKey,
  });
  const contents = messages.map((message): Content => {
    switch (message.role) {
      case 'system':
      case 'user':
        return {
          role: 'user',
          parts: [
            {
              text: message.content,
            },
          ],
        };
      case 'assistant': {
        return {
          role: 'model',
          parts: [
            ...(message.tool_calls?.map(
              (tool_call): Part => ({
                functionCall: {
                  id: tool_call.id,
                  name: tool_call.function.name,
                  args: JSON.parse(tool_call.function.arguments),
                },
              }),
            ) ?? []),
            ...(message.content ? [{ text: message.content }] : []),
          ],
        };
      }
      case 'tool':
        return {
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: message.tool_call_id,
                name: message.tool_name,
                response: { result: JSON.stringify(message.content) },
              },
            },
          ],
        };
    }
  });

  const config: GenerateContentParameters['config'] = {
    tools:
      tools && tools.length
        ? [
            {
              functionDeclarations: tools?.map((tool) => ({
                name: tool.name,
                description: tool.description,
                parameters: s.toOpenApi(tool.schema),
              })),
            },
          ]
        : undefined,
    /**
     * @todo Mike Ryan, Brian Love - how do we emulate structured outputs
     * with tool calls when dealing with Google models?
     */
    // responseMimeType: response_format ? 'application/json' : 'text/plain',
    // responseSchema: response_format
    //   ? s.toOpenApiSchema(response_format)
    //   : undefined,
  };

  const response = await ai.models.generateContentStream({
    model,
    config,
    contents,
  });

  for await (const chunk of await response) {
    const firstPart = chunk.candidates?.[0]?.content?.parts?.[0];
    if (firstPart && firstPart.functionCall) {
      const chunkMessage: Chat.CompletionChunk = {
        choices: [
          {
            index: 0,
            delta: {
              content: null,
              role: 'assistant',
              tool_calls: [
                {
                  index: 0,
                  id: firstPart.functionCall.id,
                  type: 'function',
                  function: {
                    name: firstPart.functionCall.name,
                    arguments: JSON.stringify(firstPart.functionCall.args),
                  },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      };
      yield chunkMessage;
    }

    const chunkMessage: Chat.CompletionChunk = {
      choices:
        chunk.candidates?.map((candidate, index) => ({
          index: candidate.index ?? index,
          delta: {
            content:
              candidate.content?.parts?.reduce((str: string, part: Part) => {
                if (part.text) {
                  return str + part.text;
                }

                return str;
              }, '') ?? null,
            // todo: Brian Love: candidate.content?.role ??
            role: 'assistant',
          },
          logprobs: null,
          finish_reason: candidate.finishReason ?? null,
        })) ?? [],
    };
    yield chunkMessage;
  }
}
