import type { Message, Metadata, Tool } from '@ag-ui/core';
import type {
  ChatRequest,
  Message as OllamaMessage,
  Tool as OllamaTool,
} from 'ollama';
import type { OllamaHashbrownRunAgentInput } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOllamaThinkingMarker(metadata: Metadata | undefined): boolean {
  if (!isRecord(metadata)) {
    return false;
  }

  const ollama = metadata['ollama'];
  return isRecord(ollama) && ollama['thinking'] === true;
}

function parseToolArguments(toolCall: {
  id: string;
  function: { arguments: string };
}): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(toolCall.function.arguments);
    if (isRecord(value)) {
      return value;
    }
  } catch {
    // Report the same public mapping error for malformed and non-object JSON.
  }

  throw new Error(
    `Ollama tool call "${toolCall.id}" arguments must be a JSON object`,
  );
}

function mapPrecedingReasoning(
  messages: Message[],
  assistantIndex: number,
): string | undefined {
  let reasoningStart = assistantIndex;
  while (
    reasoningStart > 0 &&
    messages[reasoningStart - 1]?.role === 'reasoning'
  ) {
    reasoningStart -= 1;
  }

  const thinking = messages
    .slice(reasoningStart, assistantIndex)
    .flatMap((message) =>
      message.role === 'reasoning' && hasOllamaThinkingMarker(message.metadata)
        ? [message.content]
        : [],
    )
    .join('');

  return thinking || undefined;
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
): OllamaMessage | undefined {
  switch (message.role) {
    case 'system':
    case 'developer':
      return { role: 'system', content: message.content };
    case 'user':
      if (typeof message.content !== 'string') {
        throw new Error('Ollama provider currently requires text user content');
      }

      return { role: 'user', content: message.content };
    case 'assistant': {
      const thinking = mapPrecedingReasoning(messages, index);
      const toolCalls = message.toolCalls?.map((toolCall) => ({
        function: {
          name: toolCall.function.name,
          arguments: parseToolArguments(toolCall),
        },
      }));
      return {
        role: 'assistant',
        content: message.content ?? '',
        ...(thinking === undefined ? {} : { thinking }),
        ...(toolCalls?.length ? { tool_calls: toolCalls } : {}),
      };
    }
    case 'tool': {
      const toolName = findToolCallName(
        messages.slice(0, index),
        message.toolCallId,
      );
      if (!toolName) {
        throw new Error(
          `Ollama tool result "${message.id}" references unknown tool call "${message.toolCallId}"`,
        );
      }

      return {
        role: 'tool',
        content: message.content,
        tool_name: toolName,
      };
    }
    case 'activity':
    case 'reasoning':
      return undefined;
  }
}

function mapTool(tool: Tool): OllamaTool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      ...(tool.parameters === undefined
        ? {}
        : {
            parameters: structuredClone(
              tool.parameters,
            ) as OllamaTool['function']['parameters'],
          }),
    },
  };
}

/**
 * Maps an AG-UI run input to Ollama streaming chat request options.
 *
 * @param input - Standard AG-UI run input with optional Hashbrown metadata.
 * @param model - Model selected by the server for this endpoint.
 * @returns Fresh Ollama request options that do not mutate the run input.
 *
 * @internal
 */
export function createOllamaRequestOptions(
  input: OllamaHashbrownRunAgentInput,
  model: string,
): ChatRequest & { stream: true } {
  const messages = input.messages.flatMap((message, index) => {
    const mapped = mapMessage(input.messages, message, index);
    return mapped ? [mapped] : [];
  });
  const tools = input.tools.map(mapTool);
  const responseSchema = input.hashbrown?.responseSchema;

  return {
    stream: true,
    model,
    messages,
    ...(tools.length > 0 ? { tools } : {}),
    ...(responseSchema === undefined
      ? {}
      : { format: structuredClone(responseSchema) }),
  };
}
