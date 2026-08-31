import type { Message, Metadata, Tool } from '@ag-ui/core';
import type {
  Message as BedrockMessage,
  Tool as BedrockTool,
  ContentBlock,
  ConverseStreamCommandInput,
  ReasoningContentBlock,
  ToolResultContentBlock,
} from '@aws-sdk/client-bedrock-runtime';
import type { BedrockHashbrownRunAgentInput } from './types';

type BedrockDocument = Extract<
  ToolResultContentBlock,
  { json: unknown }
>['json'];

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

function bedrockReasoningBlockType(
  metadata: Metadata | undefined,
): 'reasoning_text' | 'redacted_content' | undefined {
  if (!isRecord(metadata) || !isRecord(metadata['bedrock'])) {
    return undefined;
  }

  const blockType = metadata['bedrock']['blockType'];
  return blockType === 'reasoning_text' || blockType === 'redacted_content'
    ? blockType
    : undefined;
}

function mapReasoningMessage(
  message: Extract<Message, { role: 'reasoning' }>,
): ReasoningContentBlock | undefined {
  const blockType = bedrockReasoningBlockType(message.metadata);
  if (!blockType) {
    return undefined;
  }
  if (!message.encryptedValue) {
    throw new Error(
      `Bedrock reasoning message "${message.id}" requires encryptedValue`,
    );
  }

  if (blockType === 'redacted_content') {
    if (message.content !== '') {
      throw new Error(
        `Bedrock redacted reasoning message "${message.id}" must have empty content`,
      );
    }

    return {
      redactedContent: Uint8Array.from(
        Buffer.from(message.encryptedValue, 'base64'),
      ),
    };
  }

  return {
    reasoningText: {
      text: message.content,
      signature: message.encryptedValue,
    },
  };
}

function mapPrecedingReasoning(
  messages: Message[],
  assistantIndex: number,
): ContentBlock[] {
  let reasoningStart = assistantIndex;
  while (
    reasoningStart > 0 &&
    messages[reasoningStart - 1]?.role === 'reasoning'
  ) {
    reasoningStart -= 1;
  }

  return messages
    .slice(reasoningStart, assistantIndex)
    .flatMap((message): ContentBlock[] => {
      if (message.role !== 'reasoning') {
        return [];
      }
      const reasoningContent = mapReasoningMessage(message);
      return reasoningContent ? [{ reasoningContent }] : [];
    });
}

function mapAssistantMessage(
  message: Extract<Message, { role: 'assistant' }>,
  reasoning: ContentBlock[],
): BedrockMessage | undefined {
  const content: ContentBlock[] = [
    ...reasoning,
    ...(message.content ? [{ text: message.content }] : []),
    ...(message.toolCalls ?? []).map((toolCall): ContentBlock => ({
      toolUse: {
        toolUseId: toolCall.id,
        name: toolCall.function.name,
        input: parseJson(toolCall.function.arguments) as BedrockDocument,
      },
    })),
  ];

  return content.length === 0 ? undefined : { role: 'assistant', content };
}

function mapToolResult(
  message: Extract<Message, { role: 'tool' }>,
): BedrockMessage {
  const content: ToolResultContentBlock[] = [];
  if (message.error !== undefined) {
    content.push({ text: message.error });
  } else {
    const parsed = parseJson(message.content);
    content.push(
      typeof parsed === 'string'
        ? { text: parsed }
        : { json: parsed as BedrockDocument },
    );
  }

  return {
    role: 'user',
    content: [
      {
        toolResult: {
          toolUseId: message.toolCallId,
          content,
          ...(message.error === undefined ? {} : { status: 'error' }),
        },
      },
    ],
  };
}

function mapMessage(
  messages: Message[],
  message: Message,
  index: number,
): BedrockMessage | undefined {
  switch (message.role) {
    case 'system':
    case 'developer':
    case 'activity':
    case 'reasoning':
      return undefined;
    case 'user':
      if (typeof message.content !== 'string') {
        throw new Error(
          'Bedrock provider currently requires text user content',
        );
      }
      return { role: 'user', content: [{ text: message.content }] };
    case 'assistant':
      return mapAssistantMessage(
        message,
        mapPrecedingReasoning(messages, index),
      );
    case 'tool':
      return mapToolResult(message);
  }
}

function mapTool(tool: Tool): BedrockTool.ToolSpecMember {
  return {
    toolSpec: {
      name: tool.name,
      description: tool.description,
      inputSchema: {
        json: structuredClone(
          tool.parameters ?? { type: 'object', properties: {} },
        ) as BedrockDocument,
      },
    },
  };
}

/**
 * Maps an AG-UI run input to Bedrock ConverseStream request options.
 *
 * @param input - Standard AG-UI run input with optional Hashbrown metadata.
 * @param model - Model or inference profile selected by the server.
 * @returns Fresh Bedrock request options that do not mutate the run input.
 *
 * @internal
 */
export function createBedrockRequestOptions(
  input: BedrockHashbrownRunAgentInput,
  model: string,
): ConverseStreamCommandInput {
  const system = input.messages.flatMap((message) =>
    message.role === 'system' || message.role === 'developer'
      ? [{ text: message.content }]
      : [],
  );
  const messages = input.messages.flatMap((message, index) => {
    const mapped = mapMessage(input.messages, message, index);
    return mapped ? [mapped] : [];
  });
  const tools = input.tools.map(mapTool);
  const responseSchema = input.hashbrown?.responseSchema;

  return {
    modelId: model,
    ...(system.length === 0 ? {} : { system }),
    messages,
    ...(tools.length === 0
      ? {}
      : { toolConfig: { tools, toolChoice: { auto: {} } } }),
    ...(responseSchema === undefined
      ? {}
      : {
          outputConfig: {
            textFormat: {
              type: 'json_schema',
              structure: {
                jsonSchema: { schema: JSON.stringify(responseSchema) },
              },
            },
          },
        }),
  };
}
