import {
  type AGUIEvent,
  EventType,
  type Message,
  MessageSchema,
  type SystemMessage,
  type ToolMessage,
} from '@ag-ui/core';
import { Chat } from '../models';
import { s } from '../schema';
import { resolveWithSchema } from '../utils';

/** Options used to create stable local canonical message IDs. @internal */
export interface LowerCanonicalMessagesOptions {
  readonly createId: () => string;
}

/** Lowers Hashbrown view messages once at the runtime boundary. @internal */
export function lowerViewMessagesToAgUi(
  messages: readonly Chat.AnyMessage[],
  options: LowerCanonicalMessagesOptions,
): readonly Message[] {
  const lowered = messages.flatMap((message): readonly Message[] => {
    if (message.role === 'error') {
      return [];
    }

    if (message.role === 'user') {
      return [
        {
          id: options.createId(),
          role: 'user',
          content: serializeContent(message.content),
        },
      ];
    }

    const id = options.createId();
    const reasoning =
      message.reasoningDetails ??
      (message.reasoning === undefined
        ? []
        : [
            {
              id: options.createId(),
              role: 'reasoning' as const,
              content: message.reasoning,
            },
          ]);
    const toolCalls = message.toolCalls.map((toolCall) => ({
      id: toolCall.toolCallId,
      type: 'function' as const,
      function: {
        name: toolCall.name,
        arguments: serializeContent(toolCall.args),
      },
      ...(toolCall.encryptedValue !== undefined
        ? { encryptedValue: toolCall.encryptedValue }
        : {}),
      ...(toolCall.metadata !== undefined
        ? { metadata: toolCall.metadata }
        : {}),
    }));
    const assistant: Message = {
      id,
      role: 'assistant',
      ...(message.content !== undefined
        ? { content: serializeContent(message.content) }
        : {}),
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      ...(message.encryptedValue !== undefined
        ? { encryptedValue: message.encryptedValue }
        : {}),
      ...(message.metadata !== undefined ? { metadata: message.metadata } : {}),
    };
    const results = message.toolCalls.flatMap((toolCall): ToolMessage[] => {
      if (toolCall.status !== 'done') {
        return [];
      }

      const content =
        toolCall.result.status === 'rejected'
          ? serializeResult(toolCall.result.reason)
          : serializeResult(toolCall.result.value);
      return [
        {
          id: options.createId(),
          role: 'tool',
          toolCallId: toolCall.toolCallId,
          content,
          ...(toolCall.result.status === 'rejected' ? { error: content } : {}),
        },
      ];
    });

    return [...reasoning, assistant, ...results];
  });

  return ownAgUiMessages(lowered) as readonly Message[];
}

/** Pairs local view projections with the stable IDs assigned during lowering. @internal */
export function ɵpairViewMessagesWithAgUi(
  messages: readonly Chat.AnyMessage[],
  canonicalMessages: readonly Readonly<Message>[],
): AgUiMessageProjection {
  let cursor = 0;
  const projectedMessages = messages.flatMap((message) => {
    if (message.role === 'error') {
      return [{ role: 'error' as const, content: message.content }];
    }
    const internal = Chat.helpers.toInternalMessagesFromView(message);
    if (internal.length === 0) return internal;
    const role = message.role;
    const canonical = canonicalMessages.find(
      (candidate, index) => index >= cursor && candidate.role === role,
    );
    if (!canonical) return internal;
    cursor = canonicalMessages.indexOf(canonical) + 1;
    return internal.map((value) =>
      Chat.helpers.ɵwithInternalMessageId(value, canonical.id),
    );
  });
  return {
    messages: projectedMessages,
    toolCalls: Chat.helpers.toInternalToolCallsFromView([...messages]),
  };
}

/** Clones and freezes untrusted canonical history. @internal */
export function ownAgUiMessages(
  messages: readonly Message[],
): readonly Readonly<Message>[] {
  if (!Array.isArray(messages)) {
    throw new TypeError('canonical message history must be an array');
  }

  return cloneAgUiValue(
    messages,
    '$',
    new Set<object>(),
  ) as readonly Readonly<Message>[];
}

/** Clones and freezes a JSON-compatible AG-UI extension value. @internal */
export function ɵownAgUiJsonValue(value: unknown): unknown {
  return cloneAgUiValue(value, '$', new Set<object>());
}

/**
 * Owns one remote AG-UI snapshot before it fan-outs through the reducer tree.
 * Invalid snapshots retain their validation error so every slice can reject
 * the same transport input without repeating ownership work.
 *
 * @internal
 */
export function ɵprepareAgUiMessageEvent(event: AGUIEvent): AGUIEvent {
  if (event.type !== EventType.MESSAGES_SNAPSHOT) {
    return event;
  }

  try {
    return Object.freeze({
      ...event,
      ɵnormalizedMessages: ɵownValidatedAgUiMessages(event.messages),
    }) as AGUIEvent;
  } catch (error) {
    return Object.freeze({
      ...event,
      ɵsnapshotError:
        error instanceof Error ? error : new Error('Invalid AG-UI snapshot'),
    }) as AGUIEvent;
  }
}

/** Reads an owned snapshot or applies the direct-reducer safety fallback. @internal */
export function ɵreadAgUiMessageSnapshot(
  event: Extract<AGUIEvent, { type: EventType.MESSAGES_SNAPSHOT }>,
): readonly Readonly<Message>[] {
  const prepared = event as typeof event & {
    readonly ɵnormalizedMessages?: readonly Readonly<Message>[];
    readonly ɵsnapshotError?: Error;
  };
  if (prepared.ɵsnapshotError) {
    throw prepared.ɵsnapshotError;
  }
  return (
    prepared.ɵnormalizedMessages ?? ɵownValidatedAgUiMessages(event.messages)
  );
}

/** Owns canonical history and rejects duplicate global message and tool-call IDs. @internal */
export function ɵownValidatedAgUiMessages(
  messages: readonly Message[],
): readonly Readonly<Message>[] {
  const owned = ownAgUiMessages(messages);
  const ids = new Set<string>();
  const toolCalls = new Set<string>();
  const toolResults: readonly Extract<Message, { role: 'tool' }>[] =
    owned.filter(
      (message): message is Extract<Message, { role: 'tool' }> =>
        message.role === 'tool',
    );
  for (const [index, message] of owned.entries()) {
    validateAgUiMessage(message, index);
    if (ids.has(message.id)) {
      throw new Error(`AG-UI message ID ${message.id} is duplicated`);
    }
    ids.add(message.id);
    if (message.role !== 'assistant') continue;
    for (const [toolIndex, toolCall] of (message.toolCalls ?? []).entries()) {
      if (ids.has(toolCall.id)) {
        throw new Error(
          `AG-UI tool call ID ${toolCall.id} conflicts with a message ID`,
        );
      }
      if (toolCalls.has(toolCall.id)) {
        throw new Error(`AG-UI tool call ID ${toolCall.id} is duplicated`);
      }
      ids.add(toolCall.id);
      toolCalls.add(toolCall.id);
      validateToolCall(toolCall, index, toolIndex);
    }
  }
  for (const result of toolResults) {
    if (!toolCalls.has(result.toolCallId)) {
      throw new Error(
        `AG-UI tool result ${result.id} references unknown tool call ${result.toolCallId}`,
      );
    }
  }
  return owned;
}

/**
 * Verifies that an already-owned canonical fragment can be appended to an
 * already-validated history without reusing a message or tool-call ID.
 *
 * @internal
 */
export function ɵassertAgUiMessageAppendCompatibility(
  messages: readonly Readonly<Message>[],
  appended: readonly Readonly<Message>[],
): void {
  ɵappendAgUiCanonicalIds(ɵindexAgUiCanonicalIds(messages), appended);
}

/** Validates one owned canonical message against the installed AG-UI protocol. @internal */
function validateAgUiMessage(message: Readonly<Message>, index: number): void {
  const parsed = MessageSchema.safeParse(message);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.length ? `.${issue.path.join('.')}` : '';
    throw new TypeError(
      `Invalid AG-UI message[${index}]${path}: ${issue?.message ?? 'invalid structure'}`,
    );
  }
  if (!isNonemptyString(message.id)) {
    throw new TypeError(
      `Invalid AG-UI message[${index}].id: expected nonempty string`,
    );
  }
}

/** Validates the stricter identity fields of an owned assistant tool call. @internal */
function validateToolCall(
  toolCall: NonNullable<
    Extract<Message, { role: 'assistant' }>['toolCalls']
  >[number],
  messageIndex: number,
  toolIndex: number,
): void {
  const prefix = `AG-UI message[${messageIndex}].toolCalls[${toolIndex}]`;
  if (!isNonemptyString(toolCall.id)) {
    throw new TypeError(`${prefix}.id must be a nonempty string`);
  }
  if (!isNonemptyString(toolCall.function.name)) {
    throw new TypeError(`${prefix}.function.name must be a nonempty string`);
  }
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** Creates or updates the app-owned system overlay without changing its ID. @internal */
export function createSystemMessage(
  id: string,
  content: string,
): Readonly<SystemMessage> {
  return ownAgUiMessages([
    { id, role: 'system', content },
  ])[0] as Readonly<SystemMessage>;
}

/**
 * Applies one system overlay to synchronized history without duplication.
 * An empty configured overlay removes only its matching stable ID; an absent
 * overlay leaves synchronized history unchanged.
 *
 * @internal
 */
export function applySystemMessageOverlay(
  messages: readonly Readonly<Message>[],
  systemMessage: Readonly<SystemMessage> | undefined,
): readonly Readonly<Message>[] {
  if (!systemMessage) {
    return messages;
  }

  if (!systemMessage.content) {
    const cleared = messages.filter(
      (message) => message.id !== systemMessage.id,
    );
    return cleared.length === messages.length
      ? messages
      : Object.freeze(cleared);
  }

  if (!messages.some((message) => message.id === systemMessage.id)) {
    return Object.freeze([systemMessage, ...messages]);
  }

  let inserted = false;
  return Object.freeze(
    messages.flatMap((message) => {
      if (message.id !== systemMessage.id) {
        return [message];
      }

      if (inserted) {
        return [];
      }

      inserted = true;
      return [systemMessage];
    }),
  );
}

/** The Hashbrown compatibility projection of canonical AG-UI history. @internal */
export interface AgUiMessageProjection {
  readonly messages: readonly Chat.Internal.Message[];
  readonly toolCalls: readonly Chat.Internal.ToolCall[];
}

/** A structural-sharing cache for one canonical AG-UI history projection. @internal */
export interface ɵAgUiMessageProjectionCache {
  readonly canonicalMessages: readonly Readonly<Message>[];
  readonly canonicalIds: ɵAgUiCanonicalIdIndex;
  readonly toolsByName: Readonly<Record<string, Chat.Internal.Tool>>;
  readonly responseSchema: s.HashbrownType | undefined;
  readonly projection: AgUiMessageProjection;
  readonly entries: readonly ɵAgUiMessageProjectionEntry[];
}

interface ɵAgUiMessageProjectionEntry {
  readonly source: Readonly<Message>;
  readonly reasoning: readonly Readonly<
    Extract<Message, { role: 'reasoning' }>
  >[];
  readonly toolResults: readonly (
    Readonly<Extract<Message, { role: 'tool' }>> | undefined
  )[];
  readonly message: Chat.Internal.Message;
  readonly toolCalls: readonly Chat.Internal.ToolCall[];
}

/** An immutable index of canonical message and nested tool-call IDs. @internal */
export interface ɵAgUiCanonicalIdIndex {
  readonly messageIds: readonly string[];
  readonly toolCallIds: readonly string[];
}

/** Builds an immutable canonical ID index for projection-boundary validation. @internal */
export function ɵindexAgUiCanonicalIds(
  messages: readonly Readonly<Message>[],
): ɵAgUiCanonicalIdIndex {
  return Object.freeze({
    messageIds: Object.freeze(messages.map((message) => message.id)),
    toolCallIds: Object.freeze(
      messages.flatMap((message) =>
        message.role === 'assistant'
          ? (message.toolCalls ?? []).map((toolCall) => toolCall.id)
          : [],
      ),
    ),
  });
}

/**
 * Validates an appended canonical fragment against a previously indexed
 * committed history and returns the index for the resulting history.
 *
 * @internal
 */
export function ɵappendAgUiCanonicalIds(
  index: ɵAgUiCanonicalIdIndex,
  appended: readonly Readonly<Message>[],
): ɵAgUiCanonicalIdIndex {
  const messageIds = new Set(index.messageIds);
  const toolCallIds = new Set(index.toolCallIds);
  for (const message of appended) {
    if (toolCallIds.has(message.id)) {
      throw new Error(
        `AG-UI message ID ${message.id} conflicts with a tool call ID`,
      );
    }
    if (messageIds.has(message.id)) {
      throw new Error(`AG-UI message ID ${message.id} is duplicated`);
    }
    messageIds.add(message.id);
    if (message.role !== 'assistant') continue;
    for (const toolCall of message.toolCalls ?? []) {
      if (messageIds.has(toolCall.id)) {
        throw new Error(
          `AG-UI tool call ID ${toolCall.id} conflicts with a message ID`,
        );
      }
      if (toolCallIds.has(toolCall.id)) {
        throw new Error(`AG-UI tool call ID ${toolCall.id} is duplicated`);
      }
      toolCallIds.add(toolCall.id);
    }
  }
  return Object.freeze({
    messageIds: Object.freeze([...messageIds]),
    toolCallIds: Object.freeze([...toolCallIds]),
  });
}

/** Projects canonical history into Hashbrown's existing message model. @internal */
export function projectAgUiMessages(
  messages: readonly Readonly<Message>[],
  toolsByName: Readonly<Record<string, Chat.Internal.Tool>>,
  responseSchema?: s.HashbrownType,
): AgUiMessageProjection {
  const resultsByToolCallId = new Map(
    messages.flatMap((message) =>
      message.role === 'tool' ? [[message.toolCallId, message] as const] : [],
    ),
  );
  const projectedMessages: Chat.Internal.Message[] = [];
  const projectedToolCalls: Chat.Internal.ToolCall[] = [];
  let pendingReasoning: readonly Readonly<
    Extract<Message, { role: 'reasoning' }>
  >[] = [];

  for (const message of messages) {
    if (message.role === 'reasoning') {
      pendingReasoning = [...pendingReasoning, message];
      continue;
    }

    if (message.role === 'assistant') {
      const toolCalls = message.toolCalls ?? [];
      projectedMessages.push(
        Chat.helpers.ɵwithInternalMessageId(
          {
            role: 'assistant',
            ...(message.content !== undefined
              ? { content: message.content }
              : {}),
            ...(responseSchema && message.content !== undefined
              ? {
                  contentResolved: resolveWithSchema(
                    responseSchema,
                    message.content,
                  ),
                }
              : {}),
            toolCallIds: toolCalls.map((toolCall) => toolCall.id),
            ...(message.encryptedValue !== undefined
              ? { encryptedValue: message.encryptedValue }
              : {}),
            ...(message.metadata !== undefined
              ? { metadata: structuredClone(message.metadata) }
              : {}),
            ...(pendingReasoning.length > 0
              ? {
                  reasoning: {
                    kind: 'details' as const,
                    details: pendingReasoning.map(cloneReasoningMessage),
                  },
                }
              : {}),
          },
          message.id,
        ),
      );
      projectedToolCalls.push(
        ...toolCalls.map((toolCall) =>
          projectToolCall(
            toolCall,
            resultsByToolCallId.get(toolCall.id),
            toolsByName,
          ),
        ),
      );
      pendingReasoning = [];
      continue;
    }

    pendingReasoning = [];
    if (message.role === 'user') {
      projectedMessages.push(
        Chat.helpers.ɵwithInternalMessageId(
          {
            role: 'user',
            content: structuredClone(
              message.content,
            ) as Chat.Internal.UserMessage['content'],
          },
          message.id,
        ),
      );
    }
  }

  return {
    messages: projectedMessages,
    toolCalls: projectedToolCalls,
  };
}

/**
 * Projects canonical history while reusing unchanged projected assistant and
 * user entries from the previous immutable projection cache.
 *
 * @internal
 */
export function ɵreconcileAgUiMessageProjection(
  previous: ɵAgUiMessageProjectionCache | undefined,
  messages: readonly Readonly<Message>[],
  toolsByName: Readonly<Record<string, Chat.Internal.Tool>>,
  responseSchema?: s.HashbrownType,
): ɵAgUiMessageProjectionCache {
  const resultSources = new Map(
    messages.flatMap((message) =>
      message.role === 'tool' ? [[message.toolCallId, message] as const] : [],
    ),
  );
  const previousEntries = previous?.entries ?? [];
  const entries: ɵAgUiMessageProjectionEntry[] = [];
  const projectedMessages: Chat.Internal.Message[] = [];
  const projectedToolCalls: Chat.Internal.ToolCall[] = [];
  let pendingReasoning: readonly Readonly<
    Extract<Message, { role: 'reasoning' }>
  >[] = [];

  for (const source of messages) {
    if (source.role === 'reasoning') {
      pendingReasoning = [...pendingReasoning, source];
      continue;
    }
    if (source.role !== 'assistant' && source.role !== 'user') {
      pendingReasoning = [];
      continue;
    }

    const toolResults =
      source.role === 'assistant'
        ? (source.toolCalls ?? []).map((toolCall) =>
            resultSources.get(toolCall.id),
          )
        : [];
    const previousEntry = previousEntries.find(
      (entry) => entry.source.id === source.id,
    );
    const reusable =
      previous?.toolsByName === toolsByName &&
      previous.responseSchema === responseSchema &&
      previousEntry !== undefined &&
      previousEntry.source === source &&
      sameReferences(previousEntry.reasoning, pendingReasoning) &&
      sameReferences(previousEntry.toolResults, toolResults);
    const entry =
      reusable && previousEntry
        ? previousEntry
        : createProjectionEntry(
            source,
            pendingReasoning,
            toolResults,
            toolsByName,
            responseSchema,
          );
    entries.push(entry);
    projectedMessages.push(entry.message);
    projectedToolCalls.push(...entry.toolCalls);
    pendingReasoning = [];
  }

  const projection: AgUiMessageProjection = {
    messages:
      previous &&
      sameReferences(previous.projection.messages, projectedMessages)
        ? previous.projection.messages
        : projectedMessages,
    toolCalls:
      previous &&
      sameReferences(previous.projection.toolCalls, projectedToolCalls)
        ? previous.projection.toolCalls
        : projectedToolCalls,
  };
  return {
    canonicalMessages: messages,
    canonicalIds: ɵindexAgUiCanonicalIds(messages),
    toolsByName,
    responseSchema,
    projection,
    entries,
  };
}

function createProjectionEntry(
  source: Readonly<Extract<Message, { role: 'assistant' | 'user' }>>,
  reasoning: readonly Readonly<Extract<Message, { role: 'reasoning' }>>[],
  toolResults: readonly (
    Readonly<Extract<Message, { role: 'tool' }>> | undefined
  )[],
  toolsByName: Readonly<Record<string, Chat.Internal.Tool>>,
  responseSchema: s.HashbrownType | undefined,
): ɵAgUiMessageProjectionEntry {
  if (source.role === 'user') {
    return {
      source,
      reasoning,
      toolResults,
      message: Chat.helpers.ɵwithInternalMessageId(
        {
          role: 'user',
          content: structuredClone(
            source.content,
          ) as Chat.Internal.UserMessage['content'],
        },
        source.id,
      ),
      toolCalls: [],
    };
  }
  const sourceToolCalls = source.toolCalls ?? [];
  return {
    source,
    reasoning,
    toolResults,
    message: Chat.helpers.ɵwithInternalMessageId(
      {
        role: 'assistant',
        ...(source.content !== undefined ? { content: source.content } : {}),
        ...(responseSchema && source.content !== undefined
          ? {
              contentResolved: resolveWithSchema(
                responseSchema,
                source.content,
              ),
            }
          : {}),
        toolCallIds: sourceToolCalls.map((toolCall) => toolCall.id),
        ...(source.encryptedValue !== undefined
          ? { encryptedValue: source.encryptedValue }
          : {}),
        ...(source.metadata !== undefined
          ? { metadata: structuredClone(source.metadata) }
          : {}),
        ...(reasoning.length > 0
          ? {
              reasoning: {
                kind: 'details' as const,
                details: reasoning.map(cloneReasoningMessage),
              },
            }
          : {}),
      },
      source.id,
    ),
    toolCalls: sourceToolCalls.map((toolCall, index) =>
      projectToolCall(toolCall, toolResults[index], toolsByName),
    ),
  };
}

function sameReferences<T>(
  previous: readonly T[],
  next: readonly T[],
): boolean {
  return (
    previous.length === next.length &&
    previous.every((value, index) => value === next[index])
  );
}

function cloneReasoningMessage(
  message: Extract<Message, { role: 'reasoning' }>,
): Extract<Message, { role: 'reasoning' }> {
  return {
    ...message,
    ...(message.metadata !== undefined
      ? { metadata: structuredClone(message.metadata) }
      : {}),
  };
}

function projectToolCall(
  toolCall: NonNullable<
    Extract<Message, { role: 'assistant' }>['toolCalls']
  >[number],
  result: Extract<Message, { role: 'tool' }> | undefined,
  toolsByName: Readonly<Record<string, Chat.Internal.Tool>>,
): Chat.Internal.ToolCall {
  const tool = Object.hasOwn(toolsByName, toolCall.function.name)
    ? toolsByName[toolCall.function.name]
    : undefined;
  const metadata = mergeMetadata(toolCall.metadata, result?.metadata);
  const encryptedValue = toolCall.encryptedValue ?? result?.encryptedValue;
  const argumentsResolved =
    tool && s.isHashbrownType(tool.schema)
      ? resolveWithSchema(tool.schema, toolCall.function.arguments)
      : undefined;

  return {
    id: toolCall.id,
    name: toolCall.function.name,
    arguments: toolCall.function.arguments,
    ...(argumentsResolved !== undefined ? { argumentsResolved } : {}),
    ...(encryptedValue !== undefined ? { encryptedValue } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
    status: result ? 'done' : 'pending',
    ...(result
      ? {
          result:
            result.error === undefined
              ? { status: 'fulfilled' as const, value: result.content }
              : { status: 'rejected' as const, reason: result.error },
        }
      : {}),
  };
}

function mergeMetadata(
  first: Record<string, unknown> | undefined,
  second: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (first === undefined && second === undefined) {
    return undefined;
  }

  return {
    ...(first === undefined ? {} : structuredClone(first)),
    ...(second === undefined ? {} : structuredClone(second)),
  };
}

function serializeContent(value: unknown): string {
  return typeof value === 'string' ? value : (JSON.stringify(value) ?? 'null');
}

function serializeResult(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }

  return serializeContent(value);
}

function cloneAgUiValue(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): unknown {
  if (value === undefined) {
    throw invalidAgUiValue(path, 'undefined is not JSON-compatible');
  }

  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw invalidAgUiValue(path, 'numbers must be finite');
    }

    return value;
  }

  if (typeof value !== 'object') {
    throw invalidAgUiValue(path, `${typeof value} is not JSON-compatible`);
  }

  if (ancestors.has(value)) {
    throw invalidAgUiValue(path, 'cyclic values are not JSON-compatible');
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (const key of Object.keys(value)) {
        if (!isArrayIndex(key, value.length)) {
          throw invalidAgUiValue(
            `${path}.${key}`,
            'non-index properties are not supported',
          );
        }
      }

      const clone: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, index);
        if (!descriptor) {
          throw invalidAgUiValue(
            `${path}[${index}]`,
            'sparse arrays are not JSON-compatible',
          );
        }

        if (!('value' in descriptor)) {
          throw invalidAgUiValue(
            `${path}[${index}]`,
            'accessors are not supported',
          );
        }

        clone.push(
          cloneAgUiValue(descriptor.value, `${path}[${index}]`, ancestors),
        );
      }

      return Object.freeze(clone);
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw invalidAgUiValue(path, 'only plain objects are JSON-compatible');
    }

    const clone = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) {
        throw invalidAgUiValue(`${path}.${key}`, 'accessors are not supported');
      }

      Object.defineProperty(clone, key, {
        configurable: false,
        enumerable: true,
        value: cloneAgUiValue(descriptor.value, `${path}.${key}`, ancestors),
        writable: false,
      });
    }

    return Object.freeze(clone);
  } finally {
    ancestors.delete(value);
  }
}

function isArrayIndex(key: string, length: number): boolean {
  const index = Number(key);
  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < length &&
    String(index) === key
  );
}

function invalidAgUiValue(path: string, detail: string): TypeError {
  return new TypeError(`Invalid AG-UI message value at ${path}: ${detail}.`);
}
