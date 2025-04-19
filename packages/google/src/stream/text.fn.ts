import 'dotenv/config';
import { Content, GoogleGenAI, Part, Type } from '@google/genai';
import { Chat } from '@hashbrownai/core';

export async function* text(
  request: Chat.CompletionCreateParams,
): Chat.CompletionChunkResponse {
  const ai = new GoogleGenAI({
    apiKey: process.env['GOOGLE_API_KEY'],
  });

  const contents = request.messages.map((message): Content => {
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

  console.log(JSON.stringify(contents, null, 2));

  const response = await ai.models.generateContentStream({
    model: request.model,
    config: {
      tools: [
        {
          functionDeclarations: request.tools?.map((tool) => ({
            name: tool.name,
            description: tool.description,
            parameters: {
              type: Type.OBJECT,
              properties: tool.schema['properties'] as any,
              required: tool.schema['required'] as string[],
            },
          })),
        },
      ],
    },
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
