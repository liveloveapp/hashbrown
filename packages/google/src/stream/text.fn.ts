/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  Content,
  FunctionCallingConfigMode,
  FunctionDeclaration,
  GenerateContentConfig,
  GenerateContentParameters,
  GoogleGenAI,
  Part,
} from '@google/genai';
import {
  Chat,
  encodeFrame,
  Frame,
  updateAssistantMessage,
} from '@hashbrownai/core';

type BaseGoogleTextStreamOptions = {
  apiKey: string;
  request: Chat.Api.CompletionCreateParams;
  transformRequestOptions?: (
    options: GenerateContentParameters,
  ) => GenerateContentParameters | Promise<GenerateContentParameters>;
};

export type GoogleTextStreamOptions = BaseGoogleTextStreamOptions;

export async function* text(
  options: GoogleTextStreamOptions,
): AsyncIterable<Uint8Array> {
  const { apiKey, request, transformRequestOptions } = options;
  const { model, tools, responseFormat, toolChoice, system } = request;

  const ai = new GoogleGenAI({
    apiKey,
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
    const modelName = resolveModelName(model);
    validateThoughtSignaturesForGemini3(modelName, mergedMessages);

    const contents = mergedMessages.map((message): Content => {
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
        case 'error':
          return {
            role: 'error',
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
              ...(message.toolCalls?.map((toolCall): Part => {
                const thoughtSignature = getThoughtSignature(toolCall);
                const functionPart = {
                  functionCall: {
                    id: toolCall.id,
                    name: toolCall.function.name,
                    args: JSON.parse(toolCall.function.arguments),
                  },
                  ...(thoughtSignature ? { thoughtSignature } : {}),
                };

                return functionPart as Part;
              }) ?? []),
              ...(message.content
                ? [
                    {
                      text:
                        typeof message.content !== 'string'
                          ? JSON.stringify(message.content)
                          : message.content,
                    },
                  ]
                : []),
            ],
          };
        }
        case 'tool': {
          const toolResult =
            message.content.status === 'fulfilled'
              ? message.content.value
              : { error: message.content.reason };
          return {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  id: message.toolCallId,
                  name: message.toolName,
                  response: toolResult,
                },
              },
            ],
          };
        }
      }
    });

    let geminiTools: FunctionDeclaration[] = [];

    if (tools && tools.length) {
      geminiTools = await Promise.all(
        tools.map(async (tool): Promise<FunctionDeclaration> => {
          return {
            name: tool.name,
            description: tool.description,
            parametersJsonSchema: tool.parameters,
          };
        }),
      );
    }

    const config: GenerateContentConfig = {
      systemInstruction: {
        parts: [{ text: system }],
      },
      responseMimeType: responseFormat ? 'application/json' : 'text/plain',
      responseJsonSchema: responseFormat,
    };

    // Only include tools and toolConfig when there are actual tools
    if (geminiTools.length > 0) {
      config.tools = [
        {
          functionDeclarations: geminiTools,
        },
      ];
      config.toolConfig = {
        functionCallingConfig: {
          mode:
            toolChoice === 'required'
              ? FunctionCallingConfigMode.ANY
              : toolChoice === 'none'
                ? FunctionCallingConfigMode.NONE
                : FunctionCallingConfigMode.AUTO,
        },
      };
    }

    const params: GenerateContentParameters = {
      model: model as string,
      config,
      contents,
    };

    const resolvedParams = transformRequestOptions
      ? await transformRequestOptions(params)
      : params;

    const response = await ai.models.generateContentStream(resolvedParams);

    const toolCallIndicesToStringId: Record<number, string> = {};
    const getToolCallId = (index: number) => {
      if (toolCallIndicesToStringId[index] === undefined) {
        toolCallIndicesToStringId[index] = `tool_call_${crypto.randomUUID()}`;
      }
      return toolCallIndicesToStringId[index];
    };

    yield encodeFrame({ type: 'generation-start' });

    let pendingThoughtSignature: string | undefined;
    let lastToolCallIndex: number | undefined;
    const toolCallSignaturesByIndex = new Map<number, string>();

    for await (const chunk of await response) {
      const firstCandidate = chunk.candidates?.[0];
      const candidateParts = firstCandidate?.content?.parts ?? [];
      const functionCallParts =
        candidateParts.filter((part) => part.functionCall) ?? [];

      for (const part of candidateParts) {
        const thoughtSignature = getThoughtSignature(part);
        if (thoughtSignature) {
          pendingThoughtSignature = thoughtSignature;
        }
      }

      if (functionCallParts.length) {
        const toolCallChunks = functionCallParts.map((part, index) => {
          const thoughtSignature =
            getThoughtSignature(part) ?? pendingThoughtSignature;
          const metadata = thoughtSignature
            ? {
                google: {
                  thoughtSignature,
                },
              }
            : undefined;
          if (thoughtSignature) {
            pendingThoughtSignature = undefined;
            toolCallSignaturesByIndex.set(index, thoughtSignature);
          }
          lastToolCallIndex = index;

          const toolChunk: Chat.Api.CompletionChunk = {
            choices: [
              {
                index: 0,
                delta: {
                  content: null,
                  role: 'assistant',
                  toolCalls: [
                    {
                      index,
                      id: getToolCallId(index),
                      type: 'function',
                      function: {
                        name: part.functionCall!.name,
                        arguments: JSON.stringify(part.functionCall!.args),
                      },
                      metadata,
                    },
                  ],
                },
                finishReason: null,
              },
            ],
          };

          return toolChunk;
        });

        for (const toolChunk of toolCallChunks) {
          const frame: Frame = {
            type: 'generation-chunk',
            chunk: toolChunk,
          };

          assistantMessage = updateAssistantMessage(
            assistantMessage,
            toolChunk,
          );

          yield encodeFrame(frame);
        }
      }

      if (
        pendingThoughtSignature &&
        lastToolCallIndex !== undefined &&
        !toolCallSignaturesByIndex.has(lastToolCallIndex) &&
        functionCallParts.length === 0
      ) {
        const metadataChunk: Chat.Api.CompletionChunk = {
          choices: [
            {
              index: 0,
              delta: {
                content: null,
                role: 'assistant',
                toolCalls: [
                  {
                    index: lastToolCallIndex,
                    id: getToolCallId(lastToolCallIndex),
                    type: 'function',
                    metadata: {
                      google: {
                        thoughtSignature: pendingThoughtSignature,
                      },
                    },
                  },
                ],
              },
              finishReason: null,
            },
          ],
        };

        toolCallSignaturesByIndex.set(
          lastToolCallIndex,
          pendingThoughtSignature,
        );
        pendingThoughtSignature = undefined;

        assistantMessage = updateAssistantMessage(
          assistantMessage,
          metadataChunk,
        );

        yield encodeFrame({ type: 'generation-chunk', chunk: metadataChunk });
      }

      const chunkMessage: Chat.Api.CompletionChunk = {
        choices:
          chunk.candidates?.map((candidate, index) => ({
            index: candidate.index ?? index,
            delta: {
              content:
                candidate.content?.parts?.reduce((str: string, part: Part) => {
                  if (part.text && !part.thought) {
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
      const frame: Frame = {
        type: 'generation-chunk',
        chunk: chunkMessage,
      };
      assistantMessage = updateAssistantMessage(assistantMessage, chunkMessage);
      yield encodeFrame(frame);
    }
    yield encodeFrame({ type: 'generation-finish' });
  } catch (error) {
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

function resolveModelName(
  model: Chat.Api.CompletionCreateParams['model'],
): string | undefined {
  if (typeof model === 'string') {
    return model;
  }

  if (Array.isArray(model)) {
    const firstString = model.find((value) => typeof value === 'string');
    return typeof firstString === 'string' ? firstString : undefined;
  }

  if (typeof model === 'object' && model) {
    const modelRecord = model as Record<string, unknown>;
    if (typeof modelRecord['name'] === 'string') {
      return modelRecord['name'];
    }
    if (typeof modelRecord['id'] === 'string') {
      return modelRecord['id'];
    }
  }

  return undefined;
}

function getThoughtSignature(
  value: Chat.Api.ToolCall | Part,
): string | undefined {
  if ('metadata' in value) {
    const metadata = value.metadata;
    if (!metadata || typeof metadata !== 'object') {
      return undefined;
    }
    const google = (metadata as { google?: { thoughtSignature?: unknown } })
      .google;
    return typeof google?.thoughtSignature === 'string'
      ? google.thoughtSignature
      : undefined;
  }

  const part = value as Part & {
    thoughtSignature?: unknown;
    thought_signature?: unknown;
    functionCall?: { thoughtSignature?: unknown };
    function_call?: { thought_signature?: unknown };
  };
  if (typeof part.thoughtSignature === 'string') {
    return part.thoughtSignature;
  }
  if (typeof part.thought_signature === 'string') {
    return part.thought_signature;
  }
  const nested = part.functionCall?.thoughtSignature;
  if (typeof nested === 'string') {
    return nested;
  }
  const nestedSnake = part.function_call?.thought_signature;
  return typeof nestedSnake === 'string' ? nestedSnake : undefined;
}

function validateThoughtSignaturesForGemini3(
  modelName: string | undefined,
  messages: Chat.Api.Message[],
): void {
  if (!modelName?.startsWith('gemini-3-')) {
    return;
  }

  const lastUserIndex = [...messages]
    .map((message, index) => ({ message, index }))
    .reverse()
    .find(({ message }) => message.role === 'user')?.index;

  if (lastUserIndex === undefined) {
    return;
  }

  const toolCallsInTurn = messages
    .slice(lastUserIndex + 1)
    .flatMap((message) =>
      message.role === 'assistant' ? (message.toolCalls ?? []) : [],
    );

  if (!toolCallsInTurn.length) {
    return;
  }

  const missingSignatures = toolCallsInTurn.filter(
    (toolCall) => !getThoughtSignature(toolCall),
  );

  if (!missingSignatures.length) {
    return;
  }

  const missingIds = missingSignatures
    .map((toolCall) => toolCall.id)
    .filter(Boolean)
    .join(', ');

  throw new Error(
    `Missing thoughtSignature for Gemini 3 tool calls${
      missingIds ? `: ${missingIds}` : ''
    }. Ensure tool call metadata includes google.thoughtSignature.`,
  );
}

function normalizeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}
