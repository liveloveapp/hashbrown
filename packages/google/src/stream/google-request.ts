import type { Message, Metadata, Tool } from '@ag-ui/core';
import {
  type Content,
  FunctionCallingConfigMode,
  type FunctionDeclaration,
  type GenerateContentConfig,
  type GenerateContentParameters,
  type Part,
} from '@google/genai';
import type { GoogleHashbrownRunAgentInput } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function asResponse(value: string): Record<string, unknown> {
  const parsed = parseJson(value);
  return isRecord(parsed) ? parsed : { result: parsed };
}

function hasGoogleMarker(
  metadata: Metadata | undefined,
  key: 'thought' | 'functionCall',
): boolean {
  if (!isRecord(metadata)) {
    return false;
  }

  const google = metadata['google'];
  return isRecord(google) && google[key] === true;
}

function mapReasoningMessage(
  message: Extract<Message, { role: 'reasoning' }>,
): Part | undefined {
  if (!hasGoogleMarker(message.metadata, 'thought')) {
    return undefined;
  }

  return {
    text: message.content,
    thought: true,
    ...(message.encryptedValue === undefined
      ? {}
      : { thoughtSignature: message.encryptedValue }),
  };
}

function mapPrecedingReasoning(
  messages: Message[],
  assistantIndex: number,
): Part[] {
  let reasoningStart = assistantIndex;
  while (
    reasoningStart > 0 &&
    messages[reasoningStart - 1]?.role === 'reasoning'
  ) {
    reasoningStart -= 1;
  }

  return messages
    .slice(reasoningStart, assistantIndex)
    .flatMap((message) =>
      message.role === 'reasoning' ? [mapReasoningMessage(message)] : [],
    )
    .filter((part): part is Part => part !== undefined);
}

function mapAssistantMessage(
  message: Extract<Message, { role: 'assistant' }>,
  reasoningParts: Part[],
): Content {
  const toolCallParts = (message.toolCalls ?? []).map((toolCall): Part => ({
    functionCall: {
      id: toolCall.id,
      name: toolCall.function.name,
      args: parseJson(toolCall.function.arguments) as Record<string, unknown>,
    },
    ...(toolCall.encryptedValue !== undefined &&
    hasGoogleMarker(toolCall.metadata, 'functionCall')
      ? { thoughtSignature: toolCall.encryptedValue }
      : {}),
  }));
  const textParts = message.content ? [{ text: message.content }] : [];

  return {
    role: 'model',
    parts: [...reasoningParts, ...toolCallParts, ...textParts],
  };
}

function findToolCallName(
  messages: Message[],
  toolCallId: string,
): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'assistant') {
      continue;
    }

    const toolCall = message.toolCalls?.find(
      (candidate) => candidate.id === toolCallId,
    );
    if (toolCall) {
      return toolCall.function.name;
    }
  }

  return undefined;
}

function mapMessage(
  messages: Message[],
  message: Message,
  index: number,
): Content | undefined {
  switch (message.role) {
    case 'developer':
    case 'system':
    case 'activity':
    case 'reasoning':
      return undefined;
    case 'user':
      if (typeof message.content !== 'string') {
        throw new Error('Google provider currently requires text user content');
      }

      return { role: 'user', parts: [{ text: message.content }] };
    case 'assistant':
      return mapAssistantMessage(
        message,
        mapPrecedingReasoning(messages, index),
      );
    case 'tool': {
      const name = findToolCallName(
        messages.slice(0, index),
        message.toolCallId,
      );
      return {
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: message.toolCallId,
              name,
              response:
                message.error === undefined
                  ? asResponse(message.content)
                  : { error: message.error },
            },
          },
        ],
      };
    }
  }
}

function mapTool(tool: Tool): FunctionDeclaration {
  return {
    name: tool.name,
    description: tool.description,
    ...(tool.parameters === undefined
      ? {}
      : { parametersJsonSchema: structuredClone(tool.parameters) }),
  };
}

/**
 * Maps an AG-UI run input to Google streaming content request options.
 *
 * @param input - Standard AG-UI run input with optional Hashbrown metadata.
 * @param model - Model selected by the server for this endpoint.
 * @param signal - Optional request cancellation signal.
 * @returns Fresh Google request options that do not mutate the run input.
 *
 * @internal
 */
export function createGoogleRequestOptions(
  input: GoogleHashbrownRunAgentInput,
  model: string,
  signal?: AbortSignal,
): GenerateContentParameters {
  const systemParts = input.messages.flatMap((message) =>
    message.role === 'system' || message.role === 'developer'
      ? [{ text: message.content }]
      : [],
  );
  const contents = input.messages.flatMap((message, index) => {
    const mapped = mapMessage(input.messages, message, index);
    return mapped ? [mapped] : [];
  });
  const functionDeclarations = input.tools.map(mapTool);
  const responseSchema = input.hashbrown?.responseSchema;
  const config: GenerateContentConfig = {
    ...(signal === undefined ? {} : { abortSignal: signal }),
    ...(systemParts.length === 0
      ? {}
      : { systemInstruction: { parts: systemParts } }),
    ...(functionDeclarations.length === 0
      ? {}
      : {
          tools: [{ functionDeclarations }],
          toolConfig: {
            functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO },
          },
        }),
    ...(responseSchema === undefined
      ? {}
      : {
          responseMimeType: 'application/json',
          responseJsonSchema: structuredClone(responseSchema),
        }),
  };

  return { model, contents, config };
}
