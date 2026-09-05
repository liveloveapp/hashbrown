import type {
  Message,
  Metadata,
  ReasoningMessage,
  RunAgentInput,
  Tool,
} from '@ag-ui/core';
import { Chat } from '../models';
import type { JsonValue } from '../utils';
import {
  normalizeToolRejection,
  normalizeToolResult,
} from './normalize-tool-result';

/**
 * AG-UI run input with Hashbrown framework semantics.
 *
 * @internal
 */
export type HashbrownRunAgentInput = RunAgentInput & {
  hashbrown?: {
    responseSchema?: object;
    ui?: boolean;
  };
};

/**
 * Inputs used to create an AG-UI run request from Hashbrown chat state.
 *
 * @internal
 */
export interface CreateHashbrownRunAgentInputOptions {
  threadId: string;
  runId: string;
  system?: string;
  messages: Chat.Api.Message[];
  tools: Chat.Api.Tool[];
  responseSchema?: object;
  ui?: boolean;
}

/**
 * Inputs used to create an AG-UI run request from an owned canonical checkpoint.
 *
 * @internal
 */
export interface CreateCanonicalRunAgentInputOptions {
  readonly threadId: string;
  readonly runId: string;
  readonly messages: readonly Readonly<Message>[];
  readonly state: JsonValue | undefined;
  readonly tools: readonly Chat.Api.Tool[];
  readonly responseSchema?: object;
  readonly ui?: boolean;
}

function cloneMetadata(metadata: Metadata | undefined): Metadata | undefined {
  return metadata === undefined ? undefined : structuredClone(metadata);
}

function cloneReasoningMessage(
  reasoning: Readonly<ReasoningMessage>,
): ReasoningMessage {
  return {
    ...reasoning,
    ...(reasoning.metadata !== undefined
      ? { metadata: cloneMetadata(reasoning.metadata) }
      : {}),
  };
}

function mapMessage(
  message: Chat.Api.Message,
  threadId: string,
  index: number,
): Message[] {
  const id = `${threadId}:message:${index}`;

  switch (message.role) {
    case 'user':
      return [{ id, role: 'user', content: message.content }];
    case 'assistant': {
      const assistant: Message = {
        id,
        role: 'assistant',
        ...(message.content !== undefined ? { content: message.content } : {}),
        ...(message.encryptedValue !== undefined
          ? { encryptedValue: message.encryptedValue }
          : {}),
        ...(message.metadata !== undefined
          ? { metadata: cloneMetadata(message.metadata) }
          : {}),
        ...(message.toolCalls !== undefined
          ? {
              toolCalls: message.toolCalls.map((toolCall) => ({
                id: toolCall.id,
                type: 'function' as const,
                ...(toolCall.encryptedValue !== undefined
                  ? { encryptedValue: toolCall.encryptedValue }
                  : {}),
                ...(toolCall.metadata !== undefined
                  ? { metadata: cloneMetadata(toolCall.metadata) }
                  : {}),
                function: {
                  name: toolCall.function.name,
                  arguments: toolCall.function.arguments,
                },
              })),
            }
          : {}),
      };

      if (message.reasoningDetails !== undefined) {
        return [
          ...message.reasoningDetails.map(cloneReasoningMessage),
          assistant,
        ];
      }

      if (message.reasoning !== undefined) {
        return [
          {
            id: `${id}:reasoning`,
            role: 'reasoning',
            content: message.reasoning,
          },
          assistant,
        ];
      }

      return [assistant];
    }
    case 'tool': {
      if (message.content.status === 'fulfilled') {
        return [
          {
            id: message.toolCallId,
            role: 'tool',
            toolCallId: message.toolCallId,
            content: normalizeToolResult(message.content.value),
          },
        ];
      }

      const error = normalizeToolRejection(message.content.reason);
      return [
        {
          id: message.toolCallId,
          role: 'tool',
          toolCallId: message.toolCallId,
          content: error,
          error,
        },
      ];
    }
    case 'error':
      return [];
  }
}

function mapTool(tool: Chat.Api.Tool): Tool {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  };
}

function createHashbrownExtension(
  responseSchema: object | undefined,
  ui: boolean | undefined,
): HashbrownRunAgentInput['hashbrown'] {
  return responseSchema !== undefined || ui === true
    ? {
        ...(responseSchema !== undefined ? { responseSchema } : {}),
        ...(ui === true ? { ui: true } : {}),
      }
    : undefined;
}

/**
 * Creates an AG-UI run input from an already-owned canonical checkpoint.
 *
 * @internal
 */
export function createCanonicalRunAgentInput({
  threadId,
  runId,
  messages,
  state,
  tools,
  responseSchema,
  ui,
}: CreateCanonicalRunAgentInputOptions): HashbrownRunAgentInput {
  const hashbrown = createHashbrownExtension(responseSchema, ui);

  return {
    threadId,
    runId,
    messages: messages as Message[],
    tools: tools.map(mapTool),
    context: [],
    state,
    forwardedProps: {},
    ...(hashbrown ? { hashbrown } : {}),
  };
}

/**
 * Maps Hashbrown chat state to the AG-UI run input sent over modern transports.
 *
 * @internal
 */
export function createHashbrownRunAgentInput({
  threadId,
  runId,
  system,
  messages,
  tools,
  responseSchema,
  ui,
}: CreateHashbrownRunAgentInputOptions): HashbrownRunAgentInput {
  const history = messages.flatMap((message, index) =>
    mapMessage(message, threadId, index),
  );
  const hashbrown = createHashbrownExtension(responseSchema, ui);

  return {
    threadId,
    runId,
    messages: [
      ...(system
        ? [
            {
              id: `${threadId}:system`,
              role: 'system' as const,
              content: system,
            },
          ]
        : []),
      ...history,
    ],
    tools: tools.map(mapTool),
    context: [],
    state: {},
    forwardedProps: {},
    ...(hashbrown ? { hashbrown } : {}),
  };
}
