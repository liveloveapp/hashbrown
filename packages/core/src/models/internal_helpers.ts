import { readToolOutcome } from './tool-outcome';
import * as Chat from './public_api';
import type { Metadata, ReasoningMessage } from '@ag-ui/core';
import { s } from '../schema';
import { JsonValue, resolveWithSchema } from '../utils';
import {
  isProviderToolCall,
  readResultFailure,
  ɵANSWER_METADATA_KEY,
  ɵreadAnswerAnnotations,
  ɵreadToolStep,
  ɵTOOL_STEP_METADATA_KEY,
} from './tool-step';

type ReasoningInput = {
  readonly reasoning?: string;
  readonly reasoningDetails?: readonly Readonly<ReasoningMessage>[];
};

/**
 * Associates an internal compatibility message with its canonical AG-UI ID.
 *
 * @internal
 */
export function ɵwithInternalMessageId<Message extends Chat.Internal.Message>(
  message: Message,
  id: string,
): Message & { readonly id: string } {
  return { ...message, id };
}

function cloneMetadata(metadata: Metadata | undefined): Metadata | undefined {
  return metadata === undefined ? undefined : structuredClone(metadata);
}

function cloneReasoningMessage(
  reasoning: Readonly<ReasoningMessage>,
): ReasoningMessage {
  return {
    ...reasoning,
    ...(reasoning.metadata
      ? { metadata: structuredClone(reasoning.metadata) }
      : {}),
  };
}

function cloneReasoningDetails(
  details: readonly Readonly<ReasoningMessage>[],
): readonly ReasoningMessage[] {
  return details.map(cloneReasoningMessage);
}

function toInternalReasoning(
  message: ReasoningInput,
): Chat.Internal.ɵInternalReasoning | undefined {
  if (message.reasoningDetails !== undefined) {
    return {
      kind: 'details',
      details: cloneReasoningDetails(message.reasoningDetails),
    };
  }

  if (message.reasoning !== undefined) {
    return {
      kind: 'display',
      text: message.reasoning,
    };
  }

  return undefined;
}

function toReasoningOutput(
  reasoning: Chat.Internal.ɵInternalReasoning | undefined,
): ReasoningInput {
  if (reasoning?.kind === 'details') {
    const text = reasoning.details
      .map((detail) => detail.content)
      .filter((content) => content.length > 0)
      .join('\n\n');

    return {
      ...(text ? { reasoning: text } : {}),
      reasoningDetails: cloneReasoningDetails(reasoning.details),
    };
  }

  if (reasoning?.kind === 'display') {
    return { reasoning: reasoning.text };
  }

  return {};
}

function normalizeAssistantContent(
  resolved: JsonValue | undefined,
  fallback: string | undefined,
): string | object | undefined {
  if (resolved === undefined) {
    return fallback;
  }

  if (resolved === null) {
    return 'null';
  }

  if (typeof resolved === 'string') {
    return resolved;
  }

  if (typeof resolved === 'number' || typeof resolved === 'boolean') {
    return JSON.stringify(resolved);
  }

  return resolved;
}

/**
 * Exposes the canonical id of a user or assistant message on its view.
 *
 * Projected messages always carry their canonical AG-UI id, so the view's
 * `id` is always a string in the store. The id is left off only for detached
 * internal messages that were never projected.
 */
function toViewId(id: string | undefined): { readonly id: string } {
  return (id === undefined ? {} : { id }) as { readonly id: string };
}

/**
 * Copies an activity message between the view and internal models. The
 * content and metadata are shared, not cloned: canonical activity content is
 * deep-frozen, and every update produces new objects.
 */
function copyActivityMessage(
  message: Chat.ActivityMessageInput | Chat.Internal.ActivityMessage,
): Chat.ActivityMessage {
  return {
    role: 'activity',
    id: message.id,
    activityType: message.activityType,
    content: message.content,
    ...(message.metadata !== undefined ? { metadata: message.metadata } : {}),
    links: { ...message.links },
  };
}

/**
 * Converts a view message to an internal message.
 *
 * @param message - The view message to convert.
 * @returns The internal message.
 * @internal
 */
export function toInternalMessagesFromView(
  message: Chat.AnyMessageInput,
): Chat.Internal.Message[] {
  switch (message.role) {
    case 'user': {
      return [
        {
          ...(message.id !== undefined ? { id: message.id } : {}),
          role: 'user',
          ...copySubagentOwner(message),
          content: message.content,
        },
      ];
    }

    case 'assistant': {
      const contentResolved =
        message.content && typeof message.content === 'object'
          ? (message.content as JsonValue)
          : undefined;
      const content =
        typeof message.content === 'string'
          ? (message.content as string | undefined)
          : JSON.stringify(message.content);
      const reasoning = toInternalReasoning(message);
      return [
        {
          ...(message.id !== undefined ? { id: message.id } : {}),
          role: 'assistant',
          ...copySubagentOwner(message),
          content,
          contentResolved,
          toolCallIds: message.toolCalls.map((toolCall) => toolCall.toolCallId),
          ...(message.encryptedValue !== undefined
            ? { encryptedValue: message.encryptedValue }
            : {}),
          ...(message.metadata !== undefined
            ? { metadata: cloneMetadata(message.metadata) }
            : {}),
          ...(reasoning ? { reasoning } : {}),
        },
      ];
    }

    case 'activity': {
      return [copyActivityMessage(message)];
    }

    case 'error': {
      return [];
    }
  }
}

/** The raw argument text as JSON when it is complete and valid, else null. */
function parseArguments(rawArguments: string): JsonValue | null {
  try {
    return JSON.parse(rawArguments) as JsonValue;
  } catch {
    return null;
  }
}

const STEP_OUTCOMES: Readonly<
  Record<string, Chat.ServerToolCallOutcome | undefined>
> = {
  completed: 'success',
  failed: 'failure',
  denied: 'denied',
  cancelled: 'cancelled',
};

/**
 * Project the tool calls the client has no tool for, which the agent server
 * executes itself, to the display-only `serverToolCalls` field. Returns an
 * empty object when there are none so the field stays absent.
 */
function toServerToolCalls(
  toolCallIds: readonly string[],
  toolCalls: Record<string, Chat.Internal.ToolCall>,
  tools: Chat.AnyTool[],
): { serverToolCalls?: readonly Chat.ServerToolCall[] } {
  const serverToolCalls = toolCallIds.flatMap(
    (toolCallId): Chat.ServerToolCall[] => {
      const toolCall = toolCalls[toolCallId];
      if (!toolCall) {
        return [];
      }
      const step = ɵreadToolStep(
        toolCall.metadata?.[ɵTOOL_STEP_METADATA_KEY],
        toolCallId,
      );
      if (
        !isProviderToolCall(toolCall) &&
        tools.some((tool) => tool.name === toolCall.name)
      ) {
        return [];
      }
      const rejectedReason =
        toolCall.result?.status === 'rejected'
          ? toolCall.result.reason
          : undefined;
      const resultFailure = readResultFailure(rejectedReason);
      const neutral = readToolOutcome(toolCall.metadata);
      const outcome: Chat.ServerToolCallOutcome | undefined =
        resultFailure !== undefined || neutral?.outcome === 'failure'
          ? 'failure'
          : (neutral?.outcome ??
            (step?.status === undefined || step.status === 'running'
              ? undefined
              : STEP_OUTCOMES[step.status]));
      const settled = outcome !== undefined;
      const status =
        settled || toolCall.status === 'done'
          ? 'complete'
          : toolCall.argumentsComplete
            ? 'executing'
            : 'inProgress';
      const error =
        neutral !== undefined
          ? (neutral.error ??
            (resultFailure ? { message: resultFailure } : undefined))
          : (step?.error ??
            (resultFailure ? { message: resultFailure } : undefined));
      const startedAt = step?.startedAt;
      const result: PromiseSettledResult<unknown> | undefined =
        outcome === 'failure' &&
        error !== undefined &&
        (neutral?.outcome === 'failure' || step?.error !== undefined)
          ? { status: 'rejected', reason: error }
          : toolCall.status === 'done'
            ? toolCall.result
            : undefined;
      return [
        {
          toolCallId,
          ...copyCallOwners(toolCall),
          name: toolCall.name,
          status,
          args:
            toolCall.argumentsResolved ?? parseArguments(toolCall.arguments),
          ...(result !== undefined ? { result } : {}),
          ...(toolCall.progress !== undefined
            ? { progress: toolCall.progress }
            : {}),
          ...(toolCall.encryptedValue !== undefined
            ? { encryptedValue: toolCall.encryptedValue }
            : {}),
          ...(toolCall.metadata !== undefined
            ? { metadata: cloneMetadata(toolCall.metadata) }
            : {}),
          ...(outcome !== undefined ? { outcome } : {}),
          ...(step?.label !== undefined ? { label: step.label } : {}),
          ...(step?.icon !== undefined ? { icon: step.icon } : {}),
          ...(step !== undefined ? { kind: step.kind } : {}),
          ...(step?.builtin !== undefined ? { builtin: step.builtin } : {}),
          ...(step?.queries !== undefined
            ? { queries: [...step.queries] }
            : {}),
          ...(step?.sources !== undefined
            ? { sources: step.sources.map((source) => ({ ...source })) }
            : {}),
          ...(error !== undefined ? { error: { ...error } } : {}),
          ...(startedAt !== undefined
            ? {
                timing: {
                  startedAt,
                  ...(step?.settledAt !== undefined
                    ? { settledAt: step.settledAt }
                    : {}),
                },
              }
            : {}),
          ...(step?.parentToolCallId !== undefined
            ? { parentToolCallId: step.parentToolCallId }
            : {}),
        },
      ];
    },
  );
  return serverToolCalls.length > 0 ? { serverToolCalls } : {};
}

function toAnswerAnnotations(
  metadata: Metadata | undefined,
): Pick<
  Chat.AssistantMessage<unknown, Chat.AnyTool>,
  'citations' | 'sources' | 'attribution'
> {
  const answer = ɵreadAnswerAnnotations(metadata?.[ɵANSWER_METADATA_KEY]);
  return {
    ...(answer?.citations !== undefined
      ? { citations: answer.citations.map((c) => ({ ...c })) }
      : {}),
    ...(answer?.sources !== undefined
      ? { sources: answer.sources.map((s) => ({ ...s })) }
      : {}),
    ...(answer?.attribution !== undefined
      ? { attribution: answer.attribution.map((a) => ({ ...a })) }
      : {}),
  };
}

/**
 * Converts an internal message to a view message.
 *
 * @param message - The internal message to convert.
 * @returns The view message.
 * @internal
 */
export function toViewMessagesFromInternal(
  message: Chat.Internal.Message,
  toolCalls: Record<string, Chat.Internal.ToolCall>,
  tools: Chat.AnyTool[],
  outputSchema?: s.HashbrownType,
  streaming = true,
): Chat.AnyMessage[] {
  void outputSchema;
  void streaming;

  switch (message.role) {
    case 'user': {
      return [
        {
          ...toViewId(message.id),
          role: 'user',
          ...copySubagentOwner(message),
          content: message.content,
        },
      ];
    }
    case 'error': {
      return [
        {
          role: 'error',
          content: message.content,
        },
      ];
    }
    case 'assistant': {
      const content = normalizeAssistantContent(
        message.contentResolved,
        message.content ?? '',
      );

      return [
        {
          ...toViewId(message.id),
          role: 'assistant',
          ...copySubagentOwner(message),
          content,
          ...(message.encryptedValue !== undefined
            ? { encryptedValue: message.encryptedValue }
            : {}),
          ...(message.metadata !== undefined
            ? { metadata: cloneMetadata(message.metadata) }
            : {}),
          ...toReasoningOutput(message.reasoning),
          ...toAnswerAnnotations(message.metadata),
          ...toServerToolCalls(message.toolCallIds, toolCalls, tools),
          toolCalls: message.toolCallIds.flatMap(
            (toolCallId): Chat.AnyToolCall[] => {
              const toolCall = toolCalls[toolCallId];
              const tool = isProviderToolCall(toolCall)
                ? undefined
                : tools.find((tool) => tool.name === toolCall.name);

              if (!tool) {
                return [];
              }

              const resolvedArgs =
                toolCall.argumentsResolved ??
                (typeof toolCall.arguments === 'object'
                  ? toolCall.arguments
                  : undefined);

              const toolArgsString =
                typeof toolCall.arguments === 'string'
                  ? toolCall.arguments
                  : JSON.stringify(toolCall.arguments);

              switch (toolCall.status) {
                case 'done': {
                  return [
                    {
                      role: 'tool',
                      status: 'done',
                      name: toolCall.name,
                      toolCallId,
                      ...copyCallOwners(toolCall),
                      ...(toolCall.encryptedValue !== undefined
                        ? { encryptedValue: toolCall.encryptedValue }
                        : {}),
                      ...(toolCall.metadata !== undefined
                        ? { metadata: cloneMetadata(toolCall.metadata) }
                        : {}),
                      args: s.isHashbrownType(tool.schema)
                        ? (resolvedArgs ?? null)
                        : (resolvedArgs ?? JSON.parse(toolArgsString)),

                      // The internal models don't use a union, since that tends to
                      // complicate reducer logic. This is necessary to uplift our
                      // internal model into the view union.
                      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                      result: toolCall.result!,
                    },
                  ];
                }
                case 'pending': {
                  return [
                    {
                      role: 'tool',
                      status: 'pending',
                      name: toolCall.name,
                      toolCallId,
                      ...copyCallOwners(toolCall),
                      progress: toolCall.progress,
                      ...(toolCall.encryptedValue !== undefined
                        ? { encryptedValue: toolCall.encryptedValue }
                        : {}),
                      ...(toolCall.metadata !== undefined
                        ? { metadata: cloneMetadata(toolCall.metadata) }
                        : {}),
                      args: s.isHashbrownType(tool.schema)
                        ? (resolvedArgs ?? null)
                        : (resolvedArgs ?? null),
                    },
                  ];
                }
              }
            },
          ),
        },
      ];
    }

    case 'activity': {
      return [copyActivityMessage(message)];
    }
  }
}

/**
 * Converts an internal message to an API message.
 *
 * @param message - The internal message to convert.
 * @param toolCalls - The tool calls to convert.
 * @returns The API message.
 * @internal
 */
export function toApiMessagesFromInternal(
  message: Chat.Internal.Message,
  toolCalls: Chat.Internal.ToolCall[],
): Chat.Api.Message[] {
  switch (message.role) {
    case 'user': {
      return [
        {
          role: 'user',
          content:
            typeof message.content === 'string'
              ? message.content
              : JSON.stringify(message.content),
        },
      ];
    }

    case 'assistant': {
      const content =
        typeof message.content === 'string'
          ? message.content
          : message.contentResolved
            ? JSON.stringify(message.contentResolved)
            : '';
      const toolCallsForMessage = toolCalls.filter((toolCall) =>
        message.toolCallIds.includes(toolCall.id),
      );
      const toolMessages = toolCallsForMessage.flatMap(
        (toolCall): Chat.Api.ToolMessage[] => {
          if (toolCall.status !== 'done' || !toolCall.result) {
            return [];
          }

          return [
            {
              role: 'tool',
              content: toolCall.result,
              toolCallId: toolCall.id,
              toolName: toolCall.name,
            },
          ];
        },
      );
      return [
        {
          role: 'assistant',
          content,
          ...(message.encryptedValue !== undefined
            ? { encryptedValue: message.encryptedValue }
            : {}),
          ...(message.metadata !== undefined
            ? { metadata: cloneMetadata(message.metadata) }
            : {}),
          ...toReasoningOutput(message.reasoning),
          toolCalls: toolCallsForMessage.map((toolCall, index) => ({
            id: toolCall.id,
            index,
            type: 'function',
            function: {
              name: toolCall.name,
              arguments:
                typeof toolCall.arguments === 'string'
                  ? toolCall.arguments
                  : JSON.stringify(toolCall.arguments),
            },
            ...(toolCall.encryptedValue !== undefined
              ? { encryptedValue: toolCall.encryptedValue }
              : {}),
            ...(toolCall.metadata !== undefined
              ? { metadata: cloneMetadata(toolCall.metadata) }
              : {}),
          })),
        },
        ...toolMessages,
      ];
    }

    case 'activity':
    case 'error': {
      // Activities are display material and never reach the agent.
      return [];
    }
  }
}

/**
 * Converts an internal tool to an API tool.
 *
 * @param tool - The internal tool to convert.
 * @returns The API tool.
 * @internal
 */
export function toApiToolsFromInternal(
  tools: Chat.Internal.Tool[],
): Chat.Api.Tool[] {
  return tools.map((tool) => ({
    description: tool.description,
    name: tool.name,
    parameters: s.isHashbrownType(tool.schema)
      ? s.toJsonSchema(tool.schema)
      : tool.schema,
  }));
}

/**
 * Converts an API tool call to an internal tool call.
 *
 * @param toolCall - The API tool call to convert.
 * @returns The internal tool calls.
 * @internal
 */
export function toInternalToolCallsFromApi(
  toolCall: Chat.Api.ToolCall,
): Chat.Internal.ToolCall[] {
  const rawArguments =
    typeof toolCall.function.arguments === 'string'
      ? toolCall.function.arguments
      : JSON.stringify(toolCall.function.arguments);

  return [
    {
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: rawArguments,
      argumentsResolved:
        typeof toolCall.function.arguments === 'object'
          ? toolCall.function.arguments
          : undefined,
      status: 'pending',
      ...(toolCall.encryptedValue !== undefined
        ? { encryptedValue: toolCall.encryptedValue }
        : {}),
      ...(toolCall.metadata !== undefined
        ? { metadata: cloneMetadata(toolCall.metadata) }
        : {}),
    },
  ];
}

/**
 * Converts a list of API messages (e.g., when hydrating a thread) into
 * internal tool call entities, stitching together assistant tool calls and
 * their corresponding tool results.
 * @internal
 */
export function toInternalToolCallsFromApiMessages(
  messages: Chat.Api.Message[] = [],
  toolsByName: Record<string, Chat.Internal.Tool> = {},
): Chat.Internal.ToolCall[] {
  const calls: Record<string, Chat.Internal.ToolCall> = {};

  // First capture all tool calls declared by assistant messages
  messages.forEach((message) => {
    if (message.role === 'assistant' && message.toolCalls) {
      message.toolCalls.forEach((toolCall) => {
        const rawArguments =
          typeof toolCall.function.arguments === 'string'
            ? toolCall.function.arguments
            : JSON.stringify(toolCall.function.arguments);
        const tool = isProviderToolCall(toolCall)
          ? undefined
          : toolsByName[toolCall.function.name];
        const argumentsResolved =
          tool && s.isHashbrownType(tool.schema)
            ? resolveWithSchema(tool.schema, rawArguments)
            : undefined;

        calls[toolCall.id] = {
          id: toolCall.id,
          name: toolCall.function.name,
          arguments: rawArguments,
          argumentsResolved:
            argumentsResolved ??
            (typeof toolCall.function.arguments === 'object'
              ? toolCall.function.arguments
              : isProviderToolCall(toolCall)
                ? (parseArguments(rawArguments) ?? undefined)
                : undefined),
          status: 'pending',
          ...(toolCall.encryptedValue !== undefined
            ? { encryptedValue: toolCall.encryptedValue }
            : {}),
          ...(toolCall.metadata !== undefined
            ? { metadata: cloneMetadata(toolCall.metadata) }
            : {}),
        };
      });
    }
  });

  // Then stitch in tool results
  messages.forEach((message) => {
    if (message.role === 'tool') {
      const existing = calls[message.toolCallId];
      calls[message.toolCallId] = {
        id: message.toolCallId,
        name: existing?.name ?? message.toolName,
        arguments: existing?.arguments ?? '',
        status: 'done',
        result: message.content,
        ...(existing?.encryptedValue !== undefined
          ? { encryptedValue: existing.encryptedValue }
          : {}),
        ...(existing?.metadata !== undefined
          ? { metadata: cloneMetadata(existing.metadata) }
          : {}),
      };
    }
  });

  return Object.values(calls);
}

/**
 * Converts a view message to an internal tool call.
 *
 * @param message - The view message to convert.
 * @returns The internal tool calls.
 * @internal
 */
export function toInternalToolCallsFromView(
  messages: Chat.AnyMessageInput[],
): Chat.Internal.ToolCall[] {
  return messages.flatMap((message): Chat.Internal.ToolCall[] => {
    if (message.role !== 'assistant') {
      return [];
    }

    return message.toolCalls.map((toolCall): Chat.Internal.ToolCall => {
      switch (toolCall.status) {
        case 'done': {
          return {
            id: toolCall.toolCallId,
            ...copySubagentOwner(message),
            ...copyCallOwners(toolCall),
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.args),
            argumentsResolved: toolCall.args,
            status: 'done',
            result: toolCall.result,
            ...(toolCall.encryptedValue !== undefined
              ? { encryptedValue: toolCall.encryptedValue }
              : {}),
            ...(toolCall.metadata !== undefined
              ? { metadata: cloneMetadata(toolCall.metadata) }
              : {}),
          };
        }
        case 'pending': {
          return {
            id: toolCall.toolCallId,
            ...copySubagentOwner(message),
            ...copyCallOwners(toolCall),
            name: toolCall.name,
            status: 'pending',
            arguments: JSON.stringify(toolCall.args),
            argumentsResolved: toolCall.args,
            ...(toolCall.encryptedValue !== undefined
              ? { encryptedValue: toolCall.encryptedValue }
              : {}),
            ...(toolCall.metadata !== undefined
              ? { metadata: cloneMetadata(toolCall.metadata) }
              : {}),
          };
        }
      }
    });
  });
}

/**
 * Converts an API assistant message to an internal assistant message.
 *
 * @param message - The API assistant message to convert.
 * @returns The internal assistant message.
 * @internal
 */
export function toInternalMessagesFromApi(
  message: Chat.Api.Message,
): Chat.Internal.Message[] {
  if (message.role === 'tool') {
    return [];
  }

  if (message.role === 'user') {
    return [
      {
        role: 'user',
        content: message.content,
      },
    ];
  }

  if (message.role === 'error') {
    return [
      {
        role: 'error',
        content: message.content,
      },
    ];
  }

  const rawContent = message.content;
  const content =
    typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
  const reasoning = toInternalReasoning(message);

  return [
    {
      role: 'assistant',
      content,
      contentResolved: typeof rawContent === 'object' ? rawContent : undefined,
      ...(message.encryptedValue !== undefined
        ? { encryptedValue: message.encryptedValue }
        : {}),
      ...(message.metadata !== undefined
        ? { metadata: cloneMetadata(message.metadata) }
        : {}),
      toolCallIds: message.toolCalls?.map((toolCall) => toolCall.id) || [],
      ...(reasoning ? { reasoning } : {}),
    },
  ];
}

/** Copies an optional owner while preserving the empty-string lane. */
function copySubagentOwner(value: { readonly subagentRunId?: string }): {
  readonly subagentRunId?: string;
} {
  return typeof value.subagentRunId === 'string'
    ? { subagentRunId: value.subagentRunId }
    : {};
}

/** Copies independent requester and result provenance for a local call. */
function copyCallOwners(value: {
  readonly subagentRunId?: string;
  readonly resultSubagentRunId?: string;
}): { readonly subagentRunId?: string; readonly resultSubagentRunId?: string } {
  return {
    ...copySubagentOwner(value),
    ...(typeof value.resultSubagentRunId === 'string'
      ? { resultSubagentRunId: value.resultSubagentRunId }
      : {}),
  };
}
