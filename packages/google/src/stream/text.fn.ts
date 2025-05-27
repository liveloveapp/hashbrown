/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Content,
  FunctionCallingConfigMode,
  FunctionDeclaration,
  GenerateContentParameters,
  GoogleGenAI,
  Part,
  Schema,
} from '@google/genai';
import { Chat } from '@hashbrownai/core';
import convertToOpenApiSchema from '@openapi-contrib/json-schema-to-openapi-schema';

export async function* text(
  apiKey: string,
  request: Chat.Api.CompletionCreateParams,
): AsyncIterable<Chat.Api.CompletionChunk> {
  const { messages, model, tools, responseFormat, toolChoice, system } =
    request;
  const ai = new GoogleGenAI({
    apiKey,
  });
  const contents = messages.map((message): Content => {
    switch (message.role) {
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
            ...(message.toolCalls?.map(
              (toolCall): Part => ({
                functionCall: {
                  id: toolCall.id,
                  name: toolCall.function.name,
                  args: JSON.parse(toolCall.function.arguments),
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
                id: message.toolCallId,
                name: message.toolName,
                response: { result: JSON.stringify(message.content) },
              },
            },
          ],
        };
    }
  });

  let geminiTools: FunctionDeclaration[] = [];

  if (tools && tools.length) {
    geminiTools = await Promise.all(
      tools.map(async (tool): Promise<FunctionDeclaration> => {
        const schema = await toGeminiSchema(tool.parameters);
        return {
          name: tool.name,
          description: tool.description,
          parameters: schema as Schema,
        };
      }),
    );
  }

  const responseSchema = responseFormat
    ? ((await toGeminiSchema(responseFormat)) as Schema)
    : undefined;

  const config: GenerateContentParameters['config'] = {
    systemInstruction: {
      parts: [{ text: system }],
    },
    tools: [
      {
        functionDeclarations: geminiTools,
      },
    ],
    responseMimeType: responseFormat ? 'application/json' : 'text/plain',
    responseSchema: responseSchema,
    toolConfig: {
      functionCallingConfig: {
        mode:
          toolChoice === 'required'
            ? FunctionCallingConfigMode.ANY
            : toolChoice === 'none'
              ? FunctionCallingConfigMode.NONE
              : FunctionCallingConfigMode.AUTO,
      },
    },
  };

  const response = await ai.models.generateContentStream({
    model,
    config,
    contents,
  });

  const toolCallIndicesToStringId: Record<number, string> = {};
  const getToolCallId = (index: number) => {
    if (toolCallIndicesToStringId[index] === undefined) {
      toolCallIndicesToStringId[index] = `tool_call_${crypto.randomUUID()}`;
    }
    return toolCallIndicesToStringId[index];
  };

  for await (const chunk of await response) {
    const firstPart = chunk.candidates?.[0]?.content?.parts?.[0];
    if (firstPart && firstPart.functionCall) {
      const chunkMessage: Chat.Api.CompletionChunk = {
        choices: [
          {
            index: 0,
            delta: {
              content: null,
              role: 'assistant',
              toolCalls: [
                {
                  index: 0,
                  id: getToolCallId(0),
                  type: 'function',
                  function: {
                    name: firstPart.functionCall.name,
                    arguments: JSON.stringify(firstPart.functionCall.args),
                  },
                },
              ],
            },
            finishReason: null,
          },
        ],
      };
      yield chunkMessage;
    }

    const chunkMessage: Chat.Api.CompletionChunk = {
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
          finishReason: candidate.finishReason ?? null,
        })) ?? [],
    };
    yield chunkMessage;
  }
}

async function toGeminiSchema(jsonSchema: object): Promise<Schema> {
  const openApiSchema = await convertToOpenApiSchema(jsonSchema);

  function pruneSchema(obj: any): Schema {
    const result: any = {};
    if (obj.type) {
      result.type =
        typeof obj.type === 'string' ? obj.type.toUpperCase() : obj.type;
    }
    if ('enum' in obj) {
      result.enum = obj.enum;
    }
    if ('format' in obj) {
      result.format = obj.format;
    }
    if ('title' in obj) {
      result.title = obj.title;
    }
    if ('description' in obj) {
      result.description = obj.description;
    }
    if ('nullable' in obj) {
      result.nullable = obj.nullable;
    }
    if ('maxItems' in obj) {
      result.maxItems = obj.maxItems?.toString();
    }
    if ('minItems' in obj) {
      result.minItems = obj.minItems?.toString();
    }
    if ('properties' in obj && typeof obj.properties === 'object') {
      result.properties = Object.fromEntries(
        Object.entries(obj.properties).map(([key, value]) => [
          key,
          pruneSchema(value),
        ]),
      );
      result.propertyOrdering = Object.keys(obj.properties);
    }
    if ('required' in obj) {
      result.required = obj.required;
    }
    if ('minProperties' in obj) {
      result.minProperties = obj.minProperties?.toString();
    }
    if ('maxProperties' in obj) {
      result.maxProperties = obj.maxProperties?.toString();
    }
    if ('minLength' in obj) {
      result.minLength = obj.minLength?.toString();
    }
    if ('maxLength' in obj) {
      result.maxLength = obj.maxLength?.toString();
    }
    if ('pattern' in obj) {
      result.pattern = obj.pattern;
    }
    if ('example' in obj) {
      result.example = obj.example;
    }
    if ('anyOf' in obj && Array.isArray(obj.anyOf)) {
      result.anyOf = obj.anyOf.map(pruneSchema);
    }
    if ('propertyOrdering' in obj) {
      result.propertyOrdering = obj.propertyOrdering;
    }
    if ('default' in obj) {
      result.default = obj.default;
    }
    if ('items' in obj && typeof obj.items === 'object') {
      result.items = pruneSchema(obj.items);
    }
    if ('minimum' in obj) {
      result.minimum = obj.minimum;
    }
    if ('maximum' in obj) {
      result.maximum = obj.maximum;
    }
    return result;
  }

  return pruneSchema(openApiSchema);
}
