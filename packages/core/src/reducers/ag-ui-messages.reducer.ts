import {
  type AGUIEvent,
  EventType,
  type Message,
  type SystemMessage,
} from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import {
  applySystemMessageOverlay,
  ɵassertAgUiMessageAppendCompatibility,
  ɵownAgUiJsonValue,
  ɵownValidatedAgUiMessages,
  ɵreadAgUiMessageSnapshot,
} from './ag-ui-message-history';
import { createReducer, on } from '../utils/micro-ngrx';

/** Canonical AG-UI history synchronized transactionally with an agent run. @internal */
export interface AgUiMessagesState {
  readonly committed: readonly Readonly<Message>[];
  readonly draft: readonly Readonly<Message>[];
  readonly attemptActive: boolean;
  readonly protocolError: Error | undefined;
  readonly systemMessage: Readonly<SystemMessage> | undefined;
  readonly attemptStartToolCallIds: readonly string[];
  readonly activeTextMessageId: string | undefined;
  readonly activeReasoningMessageId: string | undefined;
  readonly activeToolCallId: string | undefined;
  readonly activeToolCallName: string | undefined;
  readonly activeAssistantMessageId: string | undefined;
}

/** The canonical outcome of one AG-UI message event. @internal */
export type ɵAgUiMessageEventDecision =
  | {
      readonly kind: 'accepted';
      readonly event: AGUIEvent;
      readonly state: AgUiMessagesState;
    }
  | { readonly kind: 'ignored'; readonly state: AgUiMessagesState }
  | { readonly kind: 'rejected'; readonly state: AgUiMessagesState };

/** Initial canonical AG-UI message state. @internal */
export const initialAgUiMessagesState: AgUiMessagesState = Object.freeze({
  committed: Object.freeze([]),
  draft: Object.freeze([]),
  attemptActive: false,
  protocolError: undefined,
  systemMessage: undefined,
  attemptStartToolCallIds: Object.freeze([]),
  activeTextMessageId: undefined,
  activeReasoningMessageId: undefined,
  activeToolCallId: undefined,
  activeToolCallName: undefined,
  activeAssistantMessageId: undefined,
});

/** Reduces canonical AG-UI messages independently from Hashbrown projections. @internal */
export const reducer = createReducer(
  initialAgUiMessagesState,
  on(devActions.init, (_state, action): AgUiMessagesState => {
    const systemMessage = action.payload.systemMessage;
    const committed = own(action.payload.canonicalMessages);

    return {
      committed: withoutSystemOverlay(committed, systemMessage),
      draft: Object.freeze([]),
      attemptActive: false,
      protocolError: undefined,
      systemMessage,
      attemptStartToolCallIds: Object.freeze([]),
      ...inactiveLifecycle(),
    };
  }),
  on(devActions.updateOptions, (state, action): AgUiMessagesState => {
    if (!Object.hasOwn(action.payload, 'systemMessage')) {
      return state;
    }

    return {
      ...state,
      systemMessage: action.payload.systemMessage,
    };
  }),
  on(internalActions.generationAttemptStarted, (state): AgUiMessagesState => {
    return {
      ...state,
      draft: state.committed,
      attemptActive: true,
      protocolError: undefined,
      attemptStartToolCallIds: freezeStrings(findToolCallIds(state.committed)),
      ...inactiveLifecycle(),
    };
  }),
  on(apiActions.generateMessageEvent, (state, action): AgUiMessagesState => {
    return (
      ɵreadAgUiMessageEventDecision(action) ??
      ɵdecideAgUiMessageEvent(state, action.payload)
    ).state;
  }),
  on(apiActions.generateMessageSuccess, (state): AgUiMessagesState => {
    if (!state.attemptActive) {
      return state;
    }

    return {
      ...state,
      committed: state.draft,
      attemptActive: false,
      protocolError: undefined,
      attemptStartToolCallIds: Object.freeze([]),
      ...inactiveLifecycle(),
    };
  }),
  on(internalActions.generationAttemptRolledBack, (state): AgUiMessagesState =>
    rollback(state),
  ),
  on(
    apiActions.generateMessageError,
    devActions.stopMessageGeneration,
    internalActions.generationSilentlyRetired,
    internalActions.logicalGenerationSettled,
    (state): AgUiMessagesState => rollback(state),
  ),
  on(devActions.sendMessage, (state, action): AgUiMessagesState => {
    if (action.payload.canonicalAppendCompatible === false) {
      return state;
    }
    try {
      const appended = own(action.payload.canonicalMessages);
      ɵassertAgUiMessageAppendCompatibility(state.committed, appended);
      const committed = [...state.committed, ...appended];
      return {
        ...state,
        committed,
        draft: Object.freeze([]),
        attemptActive: false,
        protocolError: undefined,
        attemptStartToolCallIds: Object.freeze([]),
        ...inactiveLifecycle(),
      };
    } catch (error) {
      return {
        ...state,
        protocolError:
          error instanceof Error
            ? error
            : new Error('Invalid canonical message fragment'),
      };
    }
  }),
  on(devActions.setMessages, (state, action): AgUiMessagesState => {
    const committed = own(action.payload.canonicalMessages);
    return {
      ...state,
      committed: withoutSystemOverlay(committed, state.systemMessage),
      draft: Object.freeze([]),
      attemptActive: false,
      protocolError: undefined,
      attemptStartToolCallIds: Object.freeze([]),
      ...inactiveLifecycle(),
    };
  }),
  on(devActions.resendMessages, (state): AgUiMessagesState => rollback(state)),
);

/** Selects the committed synchronized AG-UI history. @internal */
export const ɵselectCommittedAgUiMessages = (state: AgUiMessagesState) =>
  state.committed;

/** Selects draft history during an attempt and committed history otherwise. @internal */
export const ɵselectVisibleAgUiMessages = (state: AgUiMessagesState) =>
  state.attemptActive ? state.draft : state.committed;

/** Selects visible history after the configured system overlay is applied. @internal */
export const ɵselectEffectiveVisibleAgUiMessages = (state: AgUiMessagesState) =>
  applySystemMessageOverlay(
    ɵselectVisibleAgUiMessages(state),
    state.systemMessage,
  );

/** Selects committed request history after the configured system overlay is applied. @internal */
export const ɵselectEffectiveCommittedAgUiMessages = (
  state: AgUiMessagesState,
) => applySystemMessageOverlay(state.committed, state.systemMessage);

/** Selects immutable tool call IDs that existed when the current attempt began. @internal */
export const ɵselectAttemptStartToolCallIds = (state: AgUiMessagesState) =>
  state.attemptStartToolCallIds;

/** Selects the most recent canonical message protocol error. @internal */
export const ɵselectAgUiMessagesProtocolError = (state: AgUiMessagesState) =>
  state.protocolError;

/**
 * Validates and normalizes one AG-UI event before it is applied to derived
 * message projections.
 *
 * @internal
 */
export function ɵdecideAgUiMessageEvent(
  state: AgUiMessagesState,
  input: AGUIEvent,
): ɵAgUiMessageEventDecision {
  if (!state.attemptActive) {
    return { kind: 'ignored', state };
  }

  try {
    const event = correlateEvent(state, input);
    const draft = applyCanonicalMessageEvent(state.draft, event);
    const lifecycle = nextLifecycle(state, event, draft);
    const lifecycleChanged = Object.entries(lifecycle).some(
      ([key, value]) => state[key as keyof AgUiMessagesState] !== value,
    );
    if (isIgnoredEvent(event, draft)) {
      return { kind: 'ignored', state };
    }
    return {
      kind: 'accepted',
      event,
      state:
        draft === state.draft && !lifecycleChanged && !state.protocolError
          ? state
          : {
              ...state,
              draft,
              protocolError: undefined,
              ...lifecycle,
            },
    };
  } catch (error) {
    return {
      kind: 'rejected',
      state: {
        ...state,
        protocolError:
          error instanceof Error
            ? error
            : new Error('Invalid AG-UI message event'),
      },
    };
  }
}

/** Reads a root-prepared canonical event decision from one reducer action. @internal */
export function ɵreadAgUiMessageEventDecision(
  action: unknown,
): ɵAgUiMessageEventDecision | undefined {
  const candidate = action as {
    readonly ɵagUiMessageEventDecision?: ɵAgUiMessageEventDecision;
  };
  return candidate.ɵagUiMessageEventDecision;
}

/**
 * Applies a single AG-UI event to canonical history.
 *
 * @internal
 */
export function applyCanonicalMessageEvent(
  messages: readonly Readonly<Message>[],
  event: AGUIEvent,
): readonly Readonly<Message>[] {
  switch (event.type) {
    case EventType.MESSAGES_SNAPSHOT:
      return ɵreadAgUiMessageSnapshot(event);
    case EventType.ACTIVITY_SNAPSHOT:
    case EventType.ACTIVITY_DELTA:
      return messages;
    case EventType.TEXT_MESSAGE_START:
      return upsertText(
        messages,
        event.messageId,
        event.role,
        '',
        event,
        false,
      );
    case EventType.TEXT_MESSAGE_CONTENT:
      return upsertText(
        messages,
        event.messageId,
        undefined,
        event.delta,
        event,
        true,
      );
    case EventType.TEXT_MESSAGE_END:
      return messages.some((message) => message.id === event.messageId)
        ? upsertText(messages, event.messageId, undefined, '', event, false)
        : messages;
    case EventType.TEXT_MESSAGE_CHUNK:
      return event.messageId
        ? upsertText(
            messages,
            event.messageId,
            event.role,
            event.delta ?? '',
            event,
            true,
          )
        : messages;
    case EventType.REASONING_MESSAGE_START:
    case EventType.THINKING_TEXT_MESSAGE_START:
      return upsertText(
        messages,
        event.messageId as string,
        'reasoning',
        '',
        event,
        false,
      );
    case EventType.REASONING_MESSAGE_CONTENT:
    case EventType.THINKING_TEXT_MESSAGE_CONTENT:
      return upsertText(
        messages,
        event.messageId as string,
        'reasoning',
        event.delta as string,
        event,
        true,
      );
    case EventType.REASONING_MESSAGE_END:
    case EventType.THINKING_TEXT_MESSAGE_END:
      return messages.some((message) => message.id === event.messageId)
        ? upsertText(
            messages,
            event.messageId as string,
            'reasoning',
            '',
            event,
            false,
          )
        : messages;
    case EventType.REASONING_MESSAGE_CHUNK:
      return event.messageId
        ? upsertText(
            messages,
            event.messageId,
            'reasoning',
            event.delta ?? '',
            event,
            true,
          )
        : messages;
    case EventType.REASONING_ENCRYPTED_VALUE:
      return applyEncryptedValue(messages, event);
    case EventType.TOOL_CALL_START:
      return startToolCall(
        messages,
        event.toolCallId,
        event.toolCallName,
        event.parentMessageId,
        event,
      );
    case EventType.TOOL_CALL_ARGS:
      return appendToolCallArguments(
        messages,
        event.toolCallId,
        event.delta,
        event,
      );
    case EventType.TOOL_CALL_END:
      return appendToolCallArguments(messages, event.toolCallId, '', event);
    case EventType.TOOL_CALL_CHUNK:
      return event.toolCallId && event.toolCallName
        ? appendOrStartToolCall(messages, event)
        : messages;
    case EventType.TOOL_CALL_RESULT:
      return upsertToolResult(messages, event);
    default:
      return messages;
  }
}

function rollback(state: AgUiMessagesState): AgUiMessagesState {
  if (!state.attemptActive) {
    return state;
  }

  return {
    ...state,
    draft: state.committed,
    attemptActive: false,
    protocolError: undefined,
    attemptStartToolCallIds: Object.freeze([]),
    ...inactiveLifecycle(),
  };
}

function inactiveLifecycle() {
  return {
    activeTextMessageId: undefined,
    activeReasoningMessageId: undefined,
    activeToolCallId: undefined,
    activeToolCallName: undefined,
    activeAssistantMessageId: undefined,
  } as const;
}

function correlateEvent(state: AgUiMessagesState, event: AGUIEvent): AGUIEvent {
  switch (event.type) {
    case EventType.TEXT_MESSAGE_CHUNK:
      return event.messageId || !state.activeTextMessageId
        ? event
        : { ...event, messageId: state.activeTextMessageId };
    case EventType.REASONING_MESSAGE_CHUNK:
      return event.messageId || !state.activeReasoningMessageId
        ? event
        : { ...event, messageId: state.activeReasoningMessageId };
    case EventType.TOOL_CALL_CHUNK:
      if (event.toolCallId) {
        const existing = findToolCall(state.draft, event.toolCallId);
        return {
          ...event,
          parentMessageId:
            event.parentMessageId ??
            (existing ? undefined : state.activeAssistantMessageId),
          toolCallName:
            event.toolCallName ??
            (event.toolCallId === state.activeToolCallId
              ? state.activeToolCallName
              : existing?.tool.function.name),
        };
      }
      return !state.activeToolCallId
        ? event
        : {
            ...event,
            toolCallId: state.activeToolCallId,
            toolCallName: event.toolCallName ?? state.activeToolCallName,
            parentMessageId:
              event.parentMessageId ?? state.activeAssistantMessageId,
          };
    case EventType.TOOL_CALL_START:
      return event.parentMessageId ||
        !state.activeAssistantMessageId ||
        findToolCall(state.draft, event.toolCallId)
        ? event
        : { ...event, parentMessageId: state.activeAssistantMessageId };
    default:
      return event;
  }
}

function nextLifecycle(
  state: AgUiMessagesState,
  event: AGUIEvent,
  draft: readonly Readonly<Message>[],
) {
  switch (event.type) {
    case EventType.MESSAGES_SNAPSHOT:
      return inactiveLifecycle();
    case EventType.TEXT_MESSAGE_START:
      return {
        ...inactiveLifecycle(),
        activeTextMessageId: event.messageId,
        activeAssistantMessageId:
          event.role === 'assistant' ? event.messageId : undefined,
      };
    case EventType.TEXT_MESSAGE_END:
      return event.messageId === state.activeTextMessageId
        ? { activeTextMessageId: undefined }
        : {};
    case EventType.TEXT_MESSAGE_CHUNK:
      return event.messageId
        ? {
            activeTextMessageId: event.messageId,
            activeAssistantMessageId:
              (event.role ?? 'assistant') === 'assistant'
                ? event.messageId
                : state.activeAssistantMessageId,
          }
        : {};
    case EventType.REASONING_MESSAGE_START:
    case EventType.THINKING_TEXT_MESSAGE_START:
      return { activeReasoningMessageId: event.messageId as string };
    case EventType.REASONING_MESSAGE_END:
    case EventType.THINKING_TEXT_MESSAGE_END:
      return event.messageId === state.activeReasoningMessageId
        ? { activeReasoningMessageId: undefined }
        : {};
    case EventType.REASONING_MESSAGE_CHUNK:
      return event.messageId
        ? { activeReasoningMessageId: event.messageId }
        : {};
    case EventType.TOOL_CALL_START:
      return {
        activeToolCallId: event.toolCallId,
        activeToolCallName: event.toolCallName,
      };
    case EventType.TOOL_CALL_END:
      return event.toolCallId === state.activeToolCallId
        ? { activeToolCallId: undefined, activeToolCallName: undefined }
        : {};
    case EventType.TOOL_CALL_CHUNK:
      return event.toolCallId && findToolCall(draft, event.toolCallId)
        ? {
            activeToolCallId: event.toolCallId,
            activeToolCallName: event.toolCallName,
          }
        : {};
    default:
      return {};
  }
}

function isIgnoredEvent(
  event: AGUIEvent,
  draft: readonly Readonly<Message>[],
): boolean {
  if (
    event.type !== EventType.TOOL_CALL_ARGS &&
    event.type !== EventType.TOOL_CALL_END &&
    event.type !== EventType.TOOL_CALL_CHUNK
  ) {
    return false;
  }
  return !event.toolCallId || !findToolCall(draft, event.toolCallId);
}

function own(
  messages: readonly Readonly<Message>[],
): readonly Readonly<Message>[] {
  return ɵownValidatedAgUiMessages(messages as readonly Message[]);
}

function withoutSystemOverlay(
  messages: readonly Readonly<Message>[],
  systemMessage: Readonly<SystemMessage> | undefined,
): readonly Readonly<Message>[] {
  if (!systemMessage) {
    return messages;
  }

  const filtered = messages.filter(
    (message) => message.id !== systemMessage.id,
  );
  return filtered.length === messages.length
    ? messages
    : Object.freeze(filtered);
}

function freezeStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...values]);
}

function findToolCallIds(messages: readonly Readonly<Message>[]): string[] {
  return messages.flatMap((message) =>
    message.role === 'assistant'
      ? (message.toolCalls ?? []).map((tool) => tool.id)
      : [],
  );
}

function upsertText(
  messages: readonly Readonly<Message>[],
  id: string,
  role: Message['role'] | undefined,
  delta: string,
  event: AGUIEvent,
  append: boolean,
): readonly Readonly<Message>[] {
  if (findToolCall(messages, id)) {
    throw new Error(`AG-UI message ID ${id} conflicts with a tool call ID`);
  }
  const index = messages.findIndex((message) => message.id === id);
  if (index === -1) {
    const nextRole = role ?? 'assistant';
    return appendOwned(messages, makeTextMessage(id, nextRole, delta, event));
  }

  const current = messages[index];
  if (!current) {
    return messages;
  }
  if (role !== undefined && current.role !== role) {
    throw new Error(
      `AG-UI message ${id} cannot change role from ${current.role} to ${role}`,
    );
  }
  if (!isTextRole(current.role)) {
    throw new Error(`AG-UI message ${id} is not a text message`);
  }

  const textMessage = current as Extract<
    Message,
    { role: 'assistant' | 'user' | 'system' | 'developer' | 'reasoning' }
  >;
  const content = append
    ? (textMessage.content ?? '') + delta
    : (textMessage.content ?? delta);
  return replaceAt(
    messages,
    index,
    mergeEventFields({ ...textMessage, content }, event) as Message,
  );
}

function makeTextMessage(
  id: string,
  role: Message['role'],
  content: string,
  event: AGUIEvent,
): Message {
  if (!isTextRole(role)) {
    throw new Error(`AG-UI event cannot create ${role} as a text message`);
  }

  return mergeEventFields({ id, role, content } as Message, event);
}

function isTextRole(role: Message['role']): boolean {
  return (
    role === 'assistant' ||
    role === 'user' ||
    role === 'system' ||
    role === 'developer' ||
    role === 'reasoning'
  );
}

function startToolCall(
  messages: readonly Readonly<Message>[],
  toolCallId: string,
  toolCallName: string,
  parentMessageId: string | undefined,
  event: AGUIEvent,
): readonly Readonly<Message>[] {
  if (parentMessageId === toolCallId) {
    throw new Error(`AG-UI tool call ${toolCallId} cannot parent itself`);
  }
  if (messages.some((message) => message.id === toolCallId)) {
    throw new Error(
      `AG-UI tool call ID ${toolCallId} conflicts with a message ID`,
    );
  }
  const existing = findToolCall(messages, toolCallId);
  if (existing) {
    if (existing.tool.function.name !== toolCallName) {
      throw new Error(`AG-UI tool call ${toolCallId} cannot change name`);
    }
    if (
      parentMessageId !== undefined &&
      parentMessageId !== existing.message.id
    ) {
      throw new Error(`AG-UI tool call ${toolCallId} cannot change parent`);
    }
    if (event.metadata === undefined) {
      return messages;
    }
    const tool = freezeToolCall(
      mergeEventFields({ ...existing.tool }, event) as NonNullable<
        Extract<Message, { role: 'assistant' }>['toolCalls']
      >[number],
    );
    const assistant = freezeMessage({
      ...existing.message,
      toolCalls: Object.freeze(
        (existing.message.toolCalls ?? []).map((current) =>
          current.id === toolCallId ? tool : current,
        ),
      ),
    } as Message);
    return replaceAt(messages, existing.messageIndex, assistant);
  }
  const parentId = parentMessageId ?? `assistant-${toolCallId}`;
  const index = messages.findIndex((message) => message.id === parentId);
  if (index === -1 && findToolCall(messages, parentId)) {
    throw new Error(
      `AG-UI assistant parent ID ${parentId} conflicts with a tool call ID`,
    );
  }
  const assistant =
    index === -1
      ? ({
          id: parentId,
          role: 'assistant',
          content: '',
          toolCalls: [],
        } as Message)
      : messages[index];
  if (assistant?.role !== 'assistant') {
    throw new Error(
      `AG-UI tool call ${toolCallId} parent must be an assistant message`,
    );
  }
  const tool = freezeToolCall(
    mergeEventFields(
      {
        id: toolCallId,
        type: 'function' as const,
        function: { name: toolCallName, arguments: '' },
      },
      event,
    ) as NonNullable<
      Extract<Message, { role: 'assistant' }>['toolCalls']
    >[number],
  );
  const nextAssistant = freezeMessage({
    ...assistant,
    toolCalls: Object.freeze([...(assistant.toolCalls ?? []), tool]),
  } as Message);
  return index === -1
    ? appendOwned(messages, nextAssistant)
    : replaceAt(messages, index, nextAssistant);
}

function appendOrStartToolCall(
  messages: readonly Readonly<Message>[],
  event: Extract<AGUIEvent, { type: EventType.TOOL_CALL_CHUNK }>,
): readonly Readonly<Message>[] {
  if (!event.toolCallId || !event.toolCallName) {
    return messages;
  }

  const found = findToolCall(messages, event.toolCallId);
  if (found && found.tool.function.name !== event.toolCallName) {
    throw new Error(`AG-UI tool call ${event.toolCallId} cannot change name`);
  }
  if (
    found &&
    event.parentMessageId !== undefined &&
    event.parentMessageId !== found.message.id
  ) {
    throw new Error(`AG-UI tool call ${event.toolCallId} cannot change parent`);
  }
  const started = found
    ? messages
    : startToolCall(
        messages,
        event.toolCallId,
        event.toolCallName,
        event.parentMessageId,
        event,
      );
  return event.delta === undefined && event.metadata === undefined
    ? started
    : appendToolCallArguments(
        started,
        event.toolCallId,
        event.delta ?? '',
        event,
      );
}

function appendToolCallArguments(
  messages: readonly Readonly<Message>[],
  toolCallId: string,
  delta: string,
  event: AGUIEvent,
): readonly Readonly<Message>[] {
  const found = findToolCall(messages, toolCallId);
  if (!found) {
    return messages;
  }
  const tool = freezeToolCall(
    mergeEventFields(
      {
        ...found.tool,
        function: {
          ...found.tool.function,
          arguments: found.tool.function.arguments + delta,
        },
      },
      event,
    ) as NonNullable<
      Extract<Message, { role: 'assistant' }>['toolCalls']
    >[number],
  );
  const nextAssistant = freezeMessage({
    ...found.message,
    toolCalls: Object.freeze(
      (found.message.toolCalls ?? []).map((current) =>
        current.id === toolCallId ? tool : current,
      ),
    ),
  } as Message);
  return replaceAt(messages, found.messageIndex, nextAssistant);
}

function upsertToolResult(
  messages: readonly Readonly<Message>[],
  event: Extract<AGUIEvent, { type: EventType.TOOL_CALL_RESULT }>,
): readonly Readonly<Message>[] {
  const index = messages.findIndex((message) => message.id === event.messageId);
  if (index !== -1 && messages[index]?.role !== 'tool') {
    throw new Error(
      `AG-UI message ${event.messageId} cannot change role to tool`,
    );
  }
  if (
    index !== -1 &&
    messages[index]?.role === 'tool' &&
    messages[index].toolCallId !== event.toolCallId
  ) {
    throw new Error(
      `AG-UI tool result ${event.messageId} cannot change tool call`,
    );
  }
  if (!findToolCall(messages, event.toolCallId)) {
    return messages;
  }
  if (findToolCall(messages, event.messageId)) {
    throw new Error(
      `AG-UI message ID ${event.messageId} conflicts with a tool call ID`,
    );
  }
  const input = event as AGUIEvent & { readonly error?: string };
  const message = freezeMessage(
    mergeEventFields(
      {
        id: event.messageId,
        role: 'tool' as const,
        toolCallId: event.toolCallId,
        content: event.content,
        ...(input.error === undefined ? {} : { error: input.error }),
      } as Message,
      event,
    ),
  );
  return index === -1
    ? appendOwned(messages, message)
    : replaceAt(messages, index, message);
}

function applyEncryptedValue(
  messages: readonly Readonly<Message>[],
  event: Extract<AGUIEvent, { type: EventType.REASONING_ENCRYPTED_VALUE }>,
): readonly Readonly<Message>[] {
  if (event.subtype === 'message') {
    const index = messages.findIndex(
      (message) => message.id === event.entityId,
    );
    return index === -1
      ? messages
      : replaceAt(
          messages,
          index,
          freezeMessage({
            ...(messages[index] as Message),
            encryptedValue: event.encryptedValue,
          } as Message),
        );
  }
  const found = findToolCall(messages, event.entityId);
  if (!found) {
    return messages;
  }
  const next = freezeMessage({
    ...found.message,
    toolCalls: Object.freeze(
      (found.message.toolCalls ?? []).map((tool) =>
        tool.id === event.entityId
          ? freezeToolCall({ ...tool, encryptedValue: event.encryptedValue })
          : tool,
      ),
    ),
  } as Message);
  return replaceAt(messages, found.messageIndex, next);
}

function findToolCall(messages: readonly Readonly<Message>[], id: string) {
  for (
    let messageIndex = 0;
    messageIndex < messages.length;
    messageIndex += 1
  ) {
    const message = messages[messageIndex];
    if (message?.role !== 'assistant') continue;
    const tool = message.toolCalls?.find((current) => current.id === id);
    if (tool) return { messageIndex, message, tool };
  }
  return undefined;
}

function replaceAt<T>(
  values: readonly T[],
  index: number,
  value: T,
): readonly T[] {
  return Object.freeze(
    values.map((current, currentIndex) =>
      currentIndex === index ? value : current,
    ),
  );
}

function appendOwned<T>(values: readonly T[], value: T): readonly T[] {
  return Object.freeze([...values, value]);
}

function freezeMessage<T extends Message>(message: T): Readonly<T> {
  return Object.freeze(message);
}

function freezeToolCall(
  toolCall: NonNullable<
    Extract<Message, { role: 'assistant' }>['toolCalls']
  >[number],
): Readonly<
  NonNullable<Extract<Message, { role: 'assistant' }>['toolCalls']>[number]
> {
  return Object.freeze({
    ...toolCall,
    function: Object.freeze({ ...toolCall.function }),
  });
}

function mergeEventFields<T extends Record<string, unknown>>(
  message: T,
  event: AGUIEvent,
): T {
  const candidate = event as unknown as object;
  const metadata = ownEventField(candidate, 'metadata');
  const name = ownEventField(candidate, 'name');
  const subagentRunId = ownEventField(candidate, 'subagentRunId');
  return Object.freeze({
    ...message,
    ...(metadata === undefined
      ? {}
      : {
          metadata: Object.freeze({
            ...(message['metadata'] as Record<string, unknown> | undefined),
            ...(ɵownAgUiJsonValue(metadata) as Record<string, unknown>),
          }),
        }),
    ...(typeof name === 'string' ? { name } : {}),
    ...(typeof subagentRunId === 'string' ? { subagentRunId } : {}),
  }) as T;
}

function ownEventField(event: object, field: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(event, field);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}
