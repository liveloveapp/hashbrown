import type { Message, Metadata, Tool } from '@ag-ui/core';
import {
  type Content,
  FunctionCallingConfigMode,
  type FunctionDeclaration,
  type GenerateContentConfig,
  type GenerateContentParameters,
  type Part,
} from '@google/genai';
import type {
  GoogleDeveloperBuiltInTools,
  GoogleHashbrownRunAgentInput,
  GoogleVertexBuiltInTools,
} from './types';
import {
  googleMarker,
  isGoogleProviderMetadata,
  readGoogleHistory,
} from './google-history';

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
  representedMessageIds: ReadonlySet<string>,
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
    .filter((message) => !representedMessageIds.has(message.id))
    .flatMap((message) =>
      message.role === 'reasoning' ? [mapReasoningMessage(message)] : [],
    )
    .filter((part): part is Part => part !== undefined);
}

function mapAssistantMessage(
  message: Extract<Message, { role: 'assistant' }>,
  reasoningParts: Part[],
  providerCallIds: ReadonlySet<string>,
): Content | undefined {
  const toolCallParts = (message.toolCalls ?? [])
    .filter((call) => !providerCallIds.has(call.id))
    .map((toolCall): Part => ({
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

  const parts = [...reasoningParts, ...toolCallParts, ...textParts];
  return parts.length ? { role: 'model', parts } : undefined;
}

function findToolCall(
  messages: Message[],
  toolCallId: string,
): { name: string; id?: string } | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'assistant') {
      continue;
    }

    const toolCall = message.toolCalls?.find(
      (candidate) => candidate.id === toolCallId,
    );
    if (toolCall) {
      const native = googleMarker(toolCall.metadata)?.['nativePart'];
      const nativeCall = isRecord(native) ? native['functionCall'] : undefined;
      return {
        name: toolCall.function.name,
        ...(isRecord(nativeCall)
          ? typeof nativeCall['id'] === 'string'
            ? { id: nativeCall['id'] }
            : {}
          : { id: toolCall.id }),
      };
    }
  }

  return undefined;
}

function mapMessage(
  messages: Message[],
  message: Message,
  index: number,
  providerCallIds: ReadonlySet<string>,
  representedMessageIds: ReadonlySet<string>,
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
        mapPrecedingReasoning(messages, index, representedMessageIds),
        providerCallIds,
      );
    case 'tool': {
      if (
        providerCallIds.has(message.toolCallId) ||
        isGoogleProviderMetadata(message.metadata)
      )
        return undefined;
      if (typeof message.content !== 'string') {
        throw new Error(
          'Google provider currently requires text tool result content',
        );
      }

      const call = findToolCall(messages.slice(0, index), message.toolCallId);
      return {
        role: 'user',
        parts: [
          {
            functionResponse: {
              ...(call
                ? call.id === undefined
                  ? {}
                  : { id: call.id }
                : { id: message.toolCallId }),
              name: call?.name,
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
 * @param context - Optional built-in tools and backend capability context.
 * @returns Fresh Google request options that do not mutate the run input.
 *
 * @internal
 */
export function createGoogleRequestOptions(
  input: GoogleHashbrownRunAgentInput,
  model: string,
  signal?: AbortSignal,
  context?: GoogleRequestContext,
): GenerateContentParameters {
  const systemParts = input.messages.flatMap((message) =>
    message.role === 'system' || message.role === 'developer'
      ? [{ text: message.content }]
      : [],
  );
  const history = readGoogleHistory(input.messages);
  const contents = input.messages.flatMap((message, index) => {
    const native = history.responses.get(message.id);
    if (native) return native;
    if (history.representedMessageIds.has(message.id)) return [];
    const mapped = mapMessage(
      input.messages,
      message,
      index,
      history.providerCallIds,
      history.representedMessageIds,
    );
    return mapped ? [mapped] : [];
  });
  const functionDeclarations = input.tools.map(mapTool);
  const builtIns = context?.builtInTools;
  const nativeTools = [
    ...(builtIns?.webSearch
      ? [
          {
            googleSearch:
              builtIns.webSearch === true
                ? {}
                : structuredClone(builtIns.webSearch),
          },
        ]
      : []),
    ...(builtIns?.webFetch
      ? [
          {
            urlContext:
              builtIns.webFetch === true
                ? {}
                : structuredClone(builtIns.webFetch),
          },
        ]
      : []),
    ...(builtIns?.codeExecution
      ? [
          {
            codeExecution:
              builtIns.codeExecution === true
                ? {}
                : structuredClone(builtIns.codeExecution),
          },
        ]
      : []),
  ];
  const circulation =
    !context?.vertexai &&
    (nativeTools.length > 0 ||
      contents.some((content) =>
        content.parts?.some((part) => part.toolCall || part.toolResponse),
      ));
  const responseSchema = input.forwardedProps?.hashbrown?.responseSchema;
  const config: GenerateContentConfig = {
    ...(signal === undefined ? {} : { abortSignal: signal }),
    ...(systemParts.length === 0
      ? {}
      : { systemInstruction: { parts: systemParts } }),
    ...(functionDeclarations.length || nativeTools.length
      ? {
          tools: [
            ...(functionDeclarations.length ? [{ functionDeclarations }] : []),
            ...nativeTools,
          ],
        }
      : {}),
    ...(functionDeclarations.length || circulation
      ? {
          toolConfig: {
            ...(circulation ? { includeServerSideToolInvocations: true } : {}),
            ...(functionDeclarations.length
              ? {
                  functionCallingConfig: {
                    mode: circulation
                      ? FunctionCallingConfigMode.VALIDATED
                      : FunctionCallingConfigMode.AUTO,
                  },
                }
              : {}),
          },
        }
      : {}),
    ...(responseSchema === undefined
      ? {}
      : {
          responseMimeType: 'application/json',
          responseJsonSchema: structuredClone(responseSchema),
        }),
  };

  const result = { model, contents, config };
  validateGoogleRequestOptions(result, context?.vertexai === true);
  return result;
}

/** Optional backend and native-tool configuration for request mapping. @internal */
export interface GoogleRequestContext {
  readonly builtInTools?:
    GoogleDeveloperBuiltInTools | GoogleVertexBuiltInTools;
  readonly vertexai?: boolean;
}

/** Validates the actual transformed request against installed SDK backend capabilities. @internal */
export function validateGoogleRequestOptions(
  request: GenerateContentParameters,
  vertexai: boolean,
): void {
  const toolConfig = request.config?.toolConfig;
  if (vertexai && toolConfig?.includeServerSideToolInvocations !== undefined)
    throw new Error(
      'Google Vertex AI does not support includeServerSideToolInvocations in this SDK; remove the circulation flag',
    );
  for (const tool of request.config?.tools ?? []) {
    if (!('googleSearch' in tool) || !tool.googleSearch) continue;
    const search = tool.googleSearch;
    if (vertexai && search.timeRangeFilter !== undefined)
      throw new Error(
        'Google Vertex AI search does not support timeRangeFilter',
      );
    if (
      !vertexai &&
      (search.excludeDomains !== undefined ||
        search.blockingConfidence !== undefined)
    )
      throw new Error(
        'Google Developer API search does not support excludeDomains or blockingConfidence',
      );
  }
  const contents = Array.isArray(request.contents)
    ? request.contents
    : [request.contents];
  const nativeParts = contents.flatMap((content): Part[] => {
    if (typeof content !== 'object' || content === null) return [];
    if ('parts' in content) return content.parts ?? [];
    return [content as Part];
  });
  if (
    vertexai &&
    nativeParts.some((part) => part.toolCall || part.toolResponse)
  )
    throw new Error(
      'Google Vertex AI does not support native toolCall/toolResponse replay in this SDK',
    );
  if (
    !vertexai &&
    toolConfig?.includeServerSideToolInvocations &&
    request.config?.tools?.some(
      (tool) =>
        'functionDeclarations' in tool && tool.functionDeclarations?.length,
    ) &&
    toolConfig.functionCallingConfig?.mode !==
      FunctionCallingConfigMode.VALIDATED
  )
    throw new Error(
      'Google Developer API mixed app tools and server circulation require function calling mode VALIDATED',
    );
}
