import { type AGUIEvent, EventType } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import { createChatRuntime } from '../chat-runtime';
import { Chat } from '../models';
import { s } from '../schema';
import { createStore } from '../utils/micro-ngrx';
import { projectAgUiMessages } from './ag-ui-message-history';
import {
  reducers,
  selectIsLoading,
  selectIsRunningToolCalls,
  selectThreadId,
  selectUnifiedError,
  selectViewMessages,
  ɵprepareRootAction,
  ɵselectAgUiMessagesProtocolError,
  ɵselectAttemptStartToolCallIds,
  ɵselectCommittedAgentState,
  ɵselectCommittedAgUiMessages,
  ɵselectEffectiveCommittedAgUiMessages,
  ɵselectEffectiveVisibleAgUiMessages,
  ɵselectVisibleAgentState,
  ɵselectVisibleAgUiMessages,
} from './index';

const initAction = { type: '@@init' } as const;

function createState() {
  return {
    config: reducers.config(undefined, initAction),
    generationOwnership: reducers.generationOwnership(undefined, initAction),
    agentState: reducers.agentState(undefined, initAction),
    agUiMessages: reducers.agUiMessages(undefined, initAction),
    messages: reducers.messages(undefined, initAction),
    status: reducers.status(undefined, initAction),
    streamingMessage: reducers.streamingMessage(undefined, initAction),
    toolCalls: reducers.toolCalls(undefined, initAction),
    tools: reducers.tools(undefined, initAction),
    thread: reducers.thread(undefined, initAction),
  };
}

function reduceAll(
  state: ReturnType<typeof createState>,
  action: { type: string },
) {
  return {
    config: reducers.config(state.config, action),
    generationOwnership: reducers.generationOwnership(
      state.generationOwnership,
      action,
    ),
    agentState: reducers.agentState(state.agentState, action),
    agUiMessages: reducers.agUiMessages(state.agUiMessages, action),
    messages: reducers.messages(state.messages, action),
    status: reducers.status(state.status, action),
    streamingMessage: reducers.streamingMessage(state.streamingMessage, action),
    toolCalls: reducers.toolCalls(state.toolCalls, action),
    tools: reducers.tools(state.tools, action),
    thread: reducers.thread(state.thread, action),
  };
}

test('gates rejected canonical events from every derived reducer', () => {
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(devActions.init({ system: '', canonicalMessages: [] }));
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [{ id: 'user-1', role: 'user', content: 'hello' }],
    }),
  );
  const before = store.read((state) => state);

  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'user-1',
      role: 'assistant',
    }),
  );
  const rejected = store.read((state) => state);

  expect(rejected.agUiMessages.protocolError).toBeInstanceOf(Error);
  expect(rejected.messages).toBe(before.messages);
  expect(rejected.toolCalls).toBe(before.toolCalls);
  expect(rejected.streamingMessage).toBe(before.streamingMessage);
  expect(rejected.status).toBe(before.status);
});

test('reconciles an earlier snapshot assistant before switching the live stream', () => {
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(devActions.init({ system: '', canonicalMessages: [] }));
  store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        { id: 'assistant-a', role: 'assistant', content: 'first' },
        { id: 'assistant-b', role: 'assistant', content: 'second' },
      ],
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'assistant-a',
      role: 'assistant',
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'assistant-a',
      delta: '!',
    }),
  );

  expect(selectViewMessages(store.read((state) => state))).toEqual([
    { role: 'assistant', content: 'first!', toolCalls: [] },
    { role: 'assistant', content: 'second', toolCalls: [] },
  ]);

  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'assistant-c',
      role: 'assistant',
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'assistant-c',
      delta: 'new',
    }),
  );

  const state = store.read((current) => current);

  expect(selectViewMessages(state)).toEqual([
    { role: 'assistant', content: 'first!', toolCalls: [] },
    { role: 'assistant', content: 'second', toolCalls: [] },
    { role: 'assistant', content: 'new', toolCalls: [] },
  ]);
  expect(state.streamingMessage.message).toMatchObject({
    role: 'assistant',
    content: 'new',
  });
  expect(state.streamingMessage.messageId).toBe('assistant-c');
});

test('projects trailing reasoning onto the next prepared assistant boundary', () => {
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(devActions.init({ system: '', canonicalMessages: [] }));
  store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [{ id: 'assistant-a', role: 'assistant', content: 'first' }],
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.REASONING_MESSAGE_START,
      messageId: 'reasoning-b',
      role: 'reasoning',
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: 'reasoning-b',
      delta: 'Plan',
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'assistant-b',
      role: 'assistant',
    }),
  );

  expect(selectViewMessages(store.read((state) => state))[1]).toMatchObject({
    role: 'assistant',
    content: '',
    reasoningDetails: [{ id: 'reasoning-b', content: 'Plan' }],
  });
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: 'reasoning-b',
      delta: ' next',
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.REASONING_MESSAGE_END,
      messageId: 'reasoning-b',
    }),
  );

  expect(store.read((state) => state).streamingMessage.error).toBeUndefined();
  expect(selectViewMessages(store.read((state) => state))[1]).toMatchObject({
    reasoningDetails: [{ id: 'reasoning-b', content: 'Plan next' }],
  });
  store.dispatch(
    apiActions.generateMessageSuccess({
      message: Chat.helpers.ɵwithInternalMessageId(
        { role: 'assistant', content: '', toolCallIds: [] },
        'assistant-b',
      ),
      toolCalls: [],
    }),
  );
  expect(selectViewMessages(store.read((state) => state))[1]).toMatchObject({
    role: 'assistant',
    reasoningDetails: [{ id: 'reasoning-b', content: 'Plan next' }],
  });
});

test('retains prepared tool ownership and settlement after switching assistants', () => {
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(
    devActions.init({
      system: '',
      canonicalMessages: [],
      tools: [
        {
          name: 'lookup',
          description: '',
          schema: s.object('lookup', {}),
          handler: async () => undefined,
        },
      ],
    }),
  );
  const initialized = store.read((state) => state);
  store.dispatch(
    apiActions.generateMessageStart({
      toolsByName: initialized.tools.entities,
    }),
  );
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        { id: 'assistant-a', role: 'assistant', content: 'first' },
        { id: 'assistant-b', role: 'assistant', content: 'second' },
      ],
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-a',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-a',
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'result-a',
      toolCallId: 'tool-a',
      content: 'found',
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'assistant-b',
      role: 'assistant',
    }),
  );

  expect(selectViewMessages(store.read((state) => state))[0]).toMatchObject({
    role: 'assistant',
    content: 'first',
    toolCalls: [
      {
        toolCallId: 'tool-a',
        name: 'lookup',
        status: 'done',
        result: { status: 'fulfilled', value: 'found' },
      },
    ],
  });
});

test('retains prepared assistant metadata after switching away from its stream', () => {
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(devActions.init({ system: '', canonicalMessages: [] }));
  store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        { id: 'assistant-a', role: 'assistant', content: 'first' },
        { id: 'assistant-b', role: 'assistant', content: 'second' },
      ],
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'assistant-a',
      role: 'assistant',
      metadata: { source: 'a' },
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'assistant-b',
      role: 'assistant',
    }),
  );

  expect(selectViewMessages(store.read((state) => state))[0]).toMatchObject({
    role: 'assistant',
    content: 'first',
    metadata: { source: 'a' },
  });
});

test('does not reuse a structured output identity across equal-content assistants', () => {
  const responseSchema = s.object('output', {
    answer: s.streaming.string('answer'),
  });
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(
    devActions.init({
      system: '',
      responseSchema,
      canonicalMessages: [],
      tools: [
        {
          name: 'lookup',
          description: '',
          schema: s.object('lookup', {}),
          handler: async () => undefined,
        },
      ],
    }),
  );
  const initialized = store.read((state) => state);
  store.dispatch(
    apiActions.generateMessageStart({
      responseSchema,
      toolsByName: initialized.tools.entities,
    }),
  );
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        {
          id: 'assistant-a',
          role: 'assistant',
          content: '{"answer":"same"}',
        },
        {
          id: 'assistant-b',
          role: 'assistant',
          content: '{"answer":"same"}',
          toolCalls: [
            {
              id: 'tool-b',
              type: 'function',
              function: { name: 'lookup', arguments: '' },
            },
          ],
        },
      ],
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'assistant-a',
      role: 'assistant',
    }),
  );
  const aContentResolved = store.read(
    (state) => state.streamingMessage.message?.contentResolved,
  );

  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'result-b',
      toolCallId: 'tool-b',
      content: 'done',
    }),
  );

  const state = store.read((current) => current);

  expect(state.streamingMessage.messageId).toBe('assistant-b');
  expect(state.streamingMessage.message?.contentResolved).not.toBe(
    aContentResolved,
  );
  expect(state.streamingMessage.message?.contentResolved).toEqual({
    answer: 'same',
  });
});

test('keeps local tool-call decorations through unrelated prepared canonical events', () => {
  const pendingArguments = { city: 'Paris' };
  const fulfilledValue = { temperature: 20 };
  const rejectedReason = new Error('unavailable');
  const fulfilledResult: PromiseSettledResult<unknown> = {
    status: 'fulfilled',
    value: fulfilledValue,
  };
  const rejectedResult: PromiseSettledResult<unknown> = {
    status: 'rejected',
    reason: rejectedReason,
  };
  const canonicalMessages = [
    {
      id: 'assistant-a',
      role: 'assistant' as const,
      content: '',
      toolCalls: [
        {
          id: 'pending-a',
          type: 'function' as const,
          function: { name: 'lookup', arguments: '' },
        },
        {
          id: 'fulfilled-a',
          type: 'function' as const,
          function: { name: 'lookup', arguments: '' },
        },
        {
          id: 'rejected-a',
          type: 'function' as const,
          function: { name: 'lookup', arguments: '' },
        },
      ],
    },
    {
      id: 'fulfilled-result-a',
      role: 'tool' as const,
      toolCallId: 'fulfilled-a',
      content: 'remote fulfilled',
    },
    {
      id: 'rejected-result-a',
      role: 'tool' as const,
      toolCallId: 'rejected-a',
      content: 'remote rejected',
      error: 'remote rejected',
    },
  ];
  const localToolCalls: Chat.Internal.ToolCall[] = [
    {
      id: 'pending-a',
      name: 'lookup',
      arguments: '',
      argumentsResolved: pendingArguments,
      status: 'pending',
    },
    {
      id: 'fulfilled-a',
      name: 'lookup',
      arguments: '',
      status: 'done',
      result: fulfilledResult,
    },
    {
      id: 'rejected-a',
      name: 'lookup',
      arguments: '',
      status: 'done',
      result: rejectedResult,
    },
  ];
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(
    devActions.init({
      system: '',
      canonicalMessages,
      localProjection: {
        messages: [
          {
            id: 'assistant-a',
            role: 'assistant',
            content: '',
            toolCallIds: localToolCalls.map((toolCall) => toolCall.id),
          },
        ],
        toolCalls: localToolCalls,
      },
    }),
  );
  store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));
  store.dispatch(internalActions.generationAttemptStarted());

  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'assistant-a',
      role: 'assistant',
      metadata: { unrelated: true },
    }),
  );
  const duringAttempt = store.read((state) => state);

  expect(duringAttempt.toolCalls.entities['pending-a']?.argumentsResolved).toBe(
    pendingArguments,
  );
  expect(duringAttempt.toolCalls.entities['fulfilled-a']?.result).toBe(
    fulfilledResult,
  );
  expect(duringAttempt.toolCalls.entities['rejected-a']?.result).toBe(
    rejectedResult,
  );
  store.dispatch(
    apiActions.generateMessageSuccess({
      message: Chat.helpers.ɵwithInternalMessageId(
        { role: 'assistant', content: '', toolCallIds: [] },
        'assistant-a',
      ),
      toolCalls: [],
    }),
  );
  const committed = store.read((state) => state);

  expect(committed.toolCalls.entities['pending-a']?.argumentsResolved).toBe(
    pendingArguments,
  );
  expect(committed.toolCalls.entities['fulfilled-a']?.result).toBe(
    fulfilledResult,
  );
  expect(committed.toolCalls.entities['rejected-a']?.result).toBe(
    rejectedResult,
  );
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'assistant-a',
      role: 'assistant',
      metadata: { retry: true },
    }),
  );
  const retried = store.read((state) => state);

  expect(retried.toolCalls.entities['pending-a']?.argumentsResolved).toBe(
    pendingArguments,
  );
  expect(retried.toolCalls.entities['fulfilled-a']?.result).toBe(
    fulfilledResult,
  );
  expect(retried.toolCalls.entities['rejected-a']?.result).toBe(rejectedResult);
  store.dispatch(internalActions.generationAttemptRolledBack());
  const retryRolledBack = store.read((state) => state);

  expect(
    retryRolledBack.toolCalls.entities['pending-a']?.argumentsResolved,
  ).toBe(pendingArguments);
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        {
          id: 'assistant-a',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'pending-a',
              type: 'function',
              function: { name: 'lookup', arguments: '{"city":"Rome"}' },
            },
            {
              id: 'fulfilled-a',
              type: 'function',
              function: { name: 'lookup', arguments: '' },
            },
            {
              id: 'rejected-a',
              type: 'function',
              function: { name: 'lookup', arguments: '' },
            },
          ],
        },
        {
          id: 'fulfilled-result-a',
          role: 'tool',
          toolCallId: 'fulfilled-a',
          content: 'remote replacement',
        },
        {
          id: 'rejected-result-a',
          role: 'tool',
          toolCallId: 'rejected-a',
          content: 'remote replacement error',
          error: 'remote replacement error',
        },
      ],
    }),
  );
  const replaced = store.read((state) => state);

  expect(
    replaced.toolCalls.entities['pending-a']?.argumentsResolved,
  ).toBeUndefined();
  expect(replaced.toolCalls.entities['fulfilled-a']?.result).not.toBe(
    fulfilledResult,
  );
  expect(replaced.toolCalls.entities['rejected-a']?.result).not.toBe(
    rejectedResult,
  );
  store.dispatch(internalActions.generationAttemptRolledBack());
  const rolledBack = store.read((state) => state);

  expect(rolledBack.toolCalls.entities['pending-a']?.argumentsResolved).toBe(
    pendingArguments,
  );
  expect(rolledBack.toolCalls.entities['fulfilled-a']?.result).toBe(
    fulfilledResult,
  );
  expect(rolledBack.toolCalls.entities['rejected-a']?.result).toBe(
    rejectedResult,
  );
});

test('keeps existing local tool provenance when sendMessage appends canonical history', () => {
  // Arrange
  const localResult: PromiseSettledResult<unknown> = {
    status: 'fulfilled',
    value: { temperature: 20 },
  };
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(
    devActions.init({
      system: '',
      canonicalMessages: [
        {
          id: 'assistant-a',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'lookup-a',
              type: 'function',
              function: { name: 'lookup', arguments: '' },
            },
          ],
        },
        {
          id: 'result-a',
          role: 'tool',
          toolCallId: 'lookup-a',
          content: 'remote result',
        },
      ],
      localProjection: {
        messages: [
          {
            id: 'assistant-a',
            role: 'assistant',
            content: '',
            toolCallIds: ['lookup-a'],
          },
        ],
        toolCalls: [
          {
            id: 'lookup-a',
            name: 'lookup',
            arguments: '',
            metadata: { phase: 'local', local: true },
            status: 'done',
            result: localResult,
          },
        ],
      },
    }),
  );

  // Act
  store.dispatch(
    devActions.sendMessage({
      message: { role: 'user', content: 'next' },
      canonicalMessages: [{ id: 'user-b', role: 'user', content: 'next' }],
      localProjection: {
        messages: [{ id: 'user-b', role: 'user', content: 'next' }],
        toolCalls: [],
      },
    }),
  );
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'assistant-a',
      role: 'assistant',
      metadata: { unrelated: true },
    }),
  );
  const state = store.read((current) => current);

  // Assert
  expect(state.toolCalls.entities['lookup-a']?.result).toBe(localResult);
});

test('resets local tool provenance when setMessages replaces canonical history', () => {
  // Arrange
  const localResult: PromiseSettledResult<unknown> = {
    status: 'fulfilled',
    value: { temperature: 20 },
  };
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(
    devActions.init({
      system: '',
      canonicalMessages: [
        {
          id: 'assistant-a',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'lookup-a',
              type: 'function',
              function: { name: 'lookup', arguments: '' },
            },
          ],
        },
      ],
      localProjection: {
        messages: [
          {
            id: 'assistant-a',
            role: 'assistant',
            content: '',
            toolCallIds: ['lookup-a'],
          },
        ],
        toolCalls: [
          {
            id: 'lookup-a',
            name: 'lookup',
            arguments: '',
            status: 'done',
            result: localResult,
          },
        ],
      },
    }),
  );

  // Act
  store.dispatch(
    devActions.setMessages({
      messages: [],
      canonicalMessages: [
        {
          id: 'assistant-b',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'lookup-a',
              type: 'function',
              function: { name: 'lookup', arguments: '' },
            },
          ],
        },
        {
          id: 'result-b',
          role: 'tool',
          toolCallId: 'lookup-a',
          content: 'replacement remote result',
        },
      ],
      localProjection: {
        messages: [
          {
            id: 'assistant-b',
            role: 'assistant',
            content: '',
            toolCallIds: ['lookup-a'],
          },
        ],
        toolCalls: [
          {
            id: 'lookup-a',
            name: 'lookup',
            arguments: '',
            status: 'pending',
          },
        ],
      },
    }),
  );
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'assistant-b',
      role: 'assistant',
      metadata: { unrelated: true },
    }),
  );
  const state = store.read((current) => current);

  // Assert
  expect(state.toolCalls.entities['lookup-a']?.result).toEqual({
    status: 'fulfilled',
    value: 'replacement remote result',
  });
  expect(state.toolCalls.entities['lookup-a']?.result).not.toBe(localResult);
});

test('preserves locally settled tool values until remote associations supersede them', () => {
  // Arrange
  const fulfilled: Chat.Internal.ToolCall = {
    id: 'fulfilled-a',
    name: 'lookup',
    arguments: '',
    argumentsResolved: { city: 'Paris' },
    status: 'pending',
  };
  const rejected: Chat.Internal.ToolCall = {
    id: 'rejected-a',
    name: 'lookup',
    arguments: '',
    argumentsResolved: { city: 'Rome' },
    status: 'pending',
  };
  const fulfilledResult: PromiseSettledResult<unknown> = {
    status: 'fulfilled',
    value: { temperature: 20 },
  };
  const rejectedReason = new Error('lookup unavailable');
  const rejectedResult: PromiseSettledResult<unknown> = {
    status: 'rejected',
    reason: rejectedReason,
  };
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(
    devActions.init({
      system: '',
      canonicalMessages: [
        {
          id: 'assistant-a',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: fulfilled.id,
              type: 'function',
              function: {
                name: fulfilled.name,
                arguments: fulfilled.arguments,
              },
            },
            {
              id: rejected.id,
              type: 'function',
              function: { name: rejected.name, arguments: rejected.arguments },
            },
          ],
        },
      ],
      localProjection: {
        messages: [
          {
            id: 'assistant-a',
            role: 'assistant',
            content: '',
            toolCallIds: [fulfilled.id, rejected.id],
          },
        ],
        toolCalls: [fulfilled, rejected],
      },
    }),
  );

  // Act
  store.dispatch(
    internalActions.toolTurnSettled({
      continuation: 'stop',
      toolCalls: [fulfilled, rejected],
      toolMessages: [
        {
          role: 'tool',
          toolCallId: fulfilled.id,
          toolName: fulfilled.name,
          content: fulfilledResult,
        },
        {
          role: 'tool',
          toolCallId: rejected.id,
          toolName: rejected.name,
          content: rejectedResult,
        },
      ],
    }),
  );
  const settled = store.read((current) => current);
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'assistant-a',
      role: 'assistant',
      metadata: { unrelated: true },
    }),
  );
  const preserved = store.read((current) => current);
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'fulfilled-result-a',
      toolCallId: fulfilled.id,
      content: 'remote fulfilled result',
    }),
  );
  const fulfilledSuperseded = store.read((current) => current);
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        {
          id: 'assistant-a',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: fulfilled.id,
              type: 'function',
              function: {
                name: fulfilled.name,
                arguments: fulfilled.arguments,
              },
            },
            {
              id: rejected.id,
              type: 'function',
              function: { name: rejected.name, arguments: rejected.arguments },
            },
          ],
        },
        {
          id: 'fulfilled-result-a',
          role: 'tool',
          toolCallId: fulfilled.id,
          content: 'remote fulfilled result',
        },
        {
          id: 'rejected-result-a',
          role: 'tool',
          toolCallId: rejected.id,
          content: 'remote rejected result',
          error: 'remote rejected result',
        },
      ],
    }),
  );
  const snapshotSuperseded = store.read((current) => current);

  // Assert
  expect(settled.toolCalls.entities[fulfilled.id]?.result).toBe(
    fulfilledResult,
  );
  expect(settled.toolCalls.entities[rejected.id]?.result).toBe(rejectedResult);
  expect(
    (settled.toolCalls.entities[rejected.id]?.result as PromiseRejectedResult)
      .reason,
  ).toBe(rejectedReason);
  expect(preserved.toolCalls.entities[fulfilled.id]?.result).toBe(
    fulfilledResult,
  );
  expect(preserved.toolCalls.entities[rejected.id]?.result).toBe(
    rejectedResult,
  );
  expect(fulfilledSuperseded.toolCalls.entities[fulfilled.id]?.result).toEqual({
    status: 'fulfilled',
    value: 'remote fulfilled result',
  });
  expect(fulfilledSuperseded.toolCalls.entities[fulfilled.id]?.result).not.toBe(
    fulfilledResult,
  );
  expect(fulfilledSuperseded.toolCalls.entities[rejected.id]?.result).toBe(
    rejectedResult,
  );
  expect(snapshotSuperseded.toolCalls.entities[rejected.id]?.result).toEqual({
    status: 'rejected',
    reason: 'remote rejected result',
  });
  expect(snapshotSuperseded.toolCalls.entities[rejected.id]?.result).not.toBe(
    rejectedResult,
  );
});

test('keeps local tool values through encryption before actual remote supersession', () => {
  // Arrange
  const typedArgs = { city: 'Paris' };
  const fulfilledValue = { temperature: 20 };
  const rejectedReason = new Error('lookup unavailable');
  const typed: Chat.Internal.ToolCall = {
    id: 'typed-a',
    name: 'lookup',
    arguments: '',
    argumentsResolved: typedArgs,
    status: 'pending',
  };
  const fulfilled: Chat.Internal.ToolCall = {
    id: 'fulfilled-a',
    name: 'lookup',
    arguments: '',
    status: 'done',
    result: { status: 'fulfilled', value: fulfilledValue },
  };
  const rejected: Chat.Internal.ToolCall = {
    id: 'rejected-a',
    name: 'lookup',
    arguments: '',
    status: 'done',
    result: { status: 'rejected', reason: rejectedReason },
  };
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(
    devActions.init({
      system: '',
      canonicalMessages: [
        {
          id: 'assistant-a',
          role: 'assistant',
          content: '',
          toolCalls: [typed, fulfilled, rejected].map((toolCall) => ({
            id: toolCall.id,
            type: 'function' as const,
            function: { name: toolCall.name, arguments: toolCall.arguments },
          })),
        },
      ],
      localProjection: {
        messages: [
          {
            id: 'assistant-a',
            role: 'assistant',
            content: '',
            toolCallIds: [typed.id, fulfilled.id, rejected.id],
          },
        ],
        toolCalls: [typed, fulfilled, rejected],
      },
    }),
  );
  store.dispatch(internalActions.generationAttemptStarted());

  // Act
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.REASONING_ENCRYPTED_VALUE,
      subtype: 'tool-call',
      entityId: typed.id,
      encryptedValue: 'opaque-typed',
    }),
  );
  const encrypted = store.read((state) => state);
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: typed.id,
      delta: '{}',
    }),
  );
  const argumentsSuperseded = store.read((state) => state);
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'fulfilled-result-a',
      toolCallId: fulfilled.id,
      content: 'remote fulfilled result',
    }),
  );
  const resultSuperseded = store.read((state) => state);
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        {
          id: 'assistant-a',
          role: 'assistant',
          content: '',
          toolCalls: [typed, fulfilled, rejected].map((toolCall) => ({
            id: toolCall.id,
            type: 'function' as const,
            function: { name: toolCall.name, arguments: toolCall.arguments },
          })),
        },
        {
          id: 'rejected-result-a',
          role: 'tool',
          toolCallId: rejected.id,
          content: 'remote rejected result',
          error: 'remote rejected result',
        },
      ],
    }),
  );
  const snapshotSuperseded = store.read((state) => state);

  // Assert
  expect(encrypted.toolCalls.entities[typed.id]?.argumentsResolved).toBe(
    typedArgs,
  );
  expect(encrypted.toolCalls.entities[fulfilled.id]?.result).toBe(
    fulfilled.result,
  );
  expect(encrypted.toolCalls.entities[rejected.id]?.result).toBe(
    rejected.result,
  );
  expect(
    (encrypted.toolCalls.entities[rejected.id]?.result as PromiseRejectedResult)
      .reason,
  ).toBe(rejectedReason);
  expect(encrypted.toolCalls.entities[typed.id]?.encryptedValue).toBe(
    'opaque-typed',
  );
  expect(
    argumentsSuperseded.toolCalls.entities[typed.id]?.argumentsResolved,
  ).toBeUndefined();
  expect(resultSuperseded.toolCalls.entities[fulfilled.id]?.result).toEqual({
    status: 'fulfilled',
    value: 'remote fulfilled result',
  });
  expect(snapshotSuperseded.toolCalls.entities[rejected.id]?.result).toEqual({
    status: 'rejected',
    reason: 'remote rejected result',
  });
});

test('keeps prototype-collision tool IDs as own prepared entries', () => {
  // Arrange
  const toolCallIds = ['constructor', 'toString', '__proto__'];
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(devActions.init({ system: '', canonicalMessages: [] }));
  store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'assistant-collision',
      role: 'assistant',
    }),
  );

  // Act
  for (const toolCallId of toolCallIds) {
    store.dispatch(
      apiActions.generateMessageEvent({
        type: EventType.TOOL_CALL_START,
        toolCallId,
        toolCallName: 'lookup',
        parentMessageId: 'assistant-collision',
      }),
    );
  }
  const live = store.read((state) => state);
  store.dispatch(
    apiActions.generateMessageSuccess({
      message: {
        role: 'assistant',
        content: '',
        toolCallIds,
      },
      toolCalls: [],
    }),
  );
  const committed = store.read((state) => state);
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.REASONING_ENCRYPTED_VALUE,
      subtype: 'tool-call',
      entityId: 'constructor',
      encryptedValue: 'opaque-constructor',
    }),
  );
  store.dispatch(internalActions.generationAttemptRolledBack());
  const rolledBack = store.read((state) => state);

  // Assert
  expect(live.agUiMessages.draft[0]).toMatchObject({
    id: 'assistant-collision',
    toolCalls: toolCallIds.map((id) => expect.objectContaining({ id })),
  });
  const toolCallSources = live.messages.preparedProjection?.toolCallSources;
  expect(Object.getPrototypeOf(toolCallSources ?? {})).toBe(Object.prototype);
  expect(live.toolCalls.ids).toEqual(toolCallIds);
  expect(Object.getPrototypeOf(live.toolCalls.entities)).toBe(Object.prototype);
  expect(Object.getPrototypeOf(live.toolCalls.localProvenance)).toBe(
    Object.prototype,
  );
  for (const toolCallId of toolCallIds) {
    expect(Object.hasOwn(toolCallSources ?? {}, toolCallId)).toBe(true);
    expect(toolCallSources?.[toolCallId]?.toolCall.id).toBe(toolCallId);
    expect(Object.hasOwn(live.toolCalls.entities, toolCallId)).toBe(true);
    expect(live.toolCalls.entities[toolCallId]).toEqual({
      id: toolCallId,
      name: 'lookup',
      arguments: '',
      status: 'pending',
    });
    expect(
      Object.hasOwn(live.toolCalls.localProvenance ?? {}, toolCallId),
    ).toBe(false);
  }
  expect(committed.toolCalls.ids).toEqual(toolCallIds);
  expect(committed.toolCalls.committed.entities).toBe(
    committed.toolCalls.entities,
  );
  expect(rolledBack.toolCalls.entities).toBe(committed.toolCalls.entities);
  expect(
    rolledBack.toolCalls.entities['constructor']?.encryptedValue,
  ).toBeUndefined();
});

test('keeps newly settled local tool results through unrelated prepared events', () => {
  // Arrange
  const fulfilled: Chat.Internal.ToolCall = {
    id: 'fulfilled-a',
    name: 'lookup',
    arguments: '',
    status: 'pending',
  };
  const rejected: Chat.Internal.ToolCall = {
    id: 'rejected-a',
    name: 'unknown',
    arguments: '',
    status: 'pending',
  };
  const fulfilledResult: PromiseSettledResult<unknown> = {
    status: 'fulfilled',
    value: { temperature: 20 },
  };
  const rejectedReason = new Error('unknown tool');
  const rejectedResult: PromiseSettledResult<unknown> = {
    status: 'rejected',
    reason: rejectedReason,
  };
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(
    devActions.init({
      system: '',
      canonicalMessages: [
        {
          id: 'assistant-a',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: fulfilled.id,
              type: 'function',
              function: {
                name: fulfilled.name,
                arguments: fulfilled.arguments,
              },
            },
            {
              id: rejected.id,
              type: 'function',
              function: { name: rejected.name, arguments: rejected.arguments },
            },
          ],
        },
      ],
      localProjection: {
        messages: [
          {
            id: 'assistant-a',
            role: 'assistant',
            content: '',
            toolCallIds: [fulfilled.id, rejected.id],
          },
        ],
        toolCalls: [fulfilled, rejected],
      },
    }),
  );

  // Act
  store.dispatch(
    internalActions.toolTurnSettled({
      continuation: 'stop',
      toolCalls: [fulfilled, rejected],
      toolMessages: [
        {
          role: 'tool',
          toolCallId: fulfilled.id,
          toolName: fulfilled.name,
          content: fulfilledResult,
        },
        {
          role: 'tool',
          toolCallId: rejected.id,
          toolName: rejected.name,
          content: rejectedResult,
        },
      ],
    }),
  );
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'assistant-a',
      role: 'assistant',
      metadata: { unrelated: true },
    }),
  );
  const state = store.read((current) => current);

  // Assert
  expect(state.toolCalls.entities[fulfilled.id]).toMatchObject({
    status: 'done',
  });
  expect(state.toolCalls.entities[fulfilled.id]?.result).toBe(fulfilledResult);
  expect(state.toolCalls.entities[rejected.id]).toMatchObject({
    status: 'done',
  });
  expect(state.toolCalls.entities[rejected.id]?.result).toBe(rejectedResult);
  expect(
    (state.toolCalls.entities[rejected.id]?.result as PromiseRejectedResult)
      .reason,
  ).toBe(rejectedReason);
});

test('retains local tool values for idempotent replays until canonical sources change', () => {
  // Arrange
  const fulfilledResult: PromiseSettledResult<unknown> = {
    status: 'fulfilled',
    value: { temperature: 20 },
  };
  const rejectedReason = new Error('local rejection');
  const rejectedResult: PromiseSettledResult<unknown> = {
    status: 'rejected',
    reason: rejectedReason,
  };
  const typedArguments = { city: 'Paris' };
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(
    devActions.init({
      system: '',
      canonicalMessages: [
        {
          id: 'assistant-a',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'fulfilled-a',
              type: 'function',
              function: { name: 'lookup', arguments: '' },
            },
            {
              id: 'rejected-a',
              type: 'function',
              function: { name: 'lookup', arguments: '' },
            },
            {
              id: 'typed-a',
              type: 'function',
              function: { name: 'lookup', arguments: '' },
            },
          ],
        },
        {
          id: 'fulfilled-result-a',
          role: 'tool',
          toolCallId: 'fulfilled-a',
          content: 'remote fulfilled',
        },
        {
          id: 'rejected-result-a',
          role: 'tool',
          toolCallId: 'rejected-a',
          content: 'remote rejected',
          error: 'remote rejected',
        },
      ],
      localProjection: {
        messages: [
          {
            id: 'assistant-a',
            role: 'assistant',
            content: '',
            toolCallIds: ['fulfilled-a', 'rejected-a', 'typed-a'],
          },
        ],
        toolCalls: [
          {
            id: 'fulfilled-a',
            name: 'lookup',
            arguments: '',
            metadata: { phase: 'local', local: true },
            status: 'done',
            result: fulfilledResult,
          },
          {
            id: 'rejected-a',
            name: 'lookup',
            arguments: '',
            status: 'done',
            result: rejectedResult,
          },
          {
            id: 'typed-a',
            name: 'lookup',
            arguments: '',
            argumentsResolved: typedArguments,
            status: 'pending',
          },
        ],
      },
    }),
  );
  store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));
  store.dispatch(internalActions.generationAttemptStarted());

  // Act
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'fulfilled-a',
      toolCallName: 'lookup',
      metadata: { phase: 'canonical' },
    }),
  );
  const afterMetadata = store.read((state) => state);
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'fulfilled-a',
      toolCallName: 'lookup',
      metadata: { phase: 'canonical' },
    }),
  );
  const identicalMetadata = store.read((state) => state);
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_END,
      toolCallId: 'rejected-a',
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'typed-a',
      toolCallName: 'lookup',
      delta: '',
    }),
  );
  const replayed = store.read((state) => state);
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'fulfilled-a',
      delta: '{"city":"Rome"}',
    }),
  );
  const argumentsSuperseded = store.read((state) => state);
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'rejected-result-a',
      toolCallId: 'rejected-a',
      content: 'updated remote rejection',
      error: 'updated remote rejection',
    }),
  );
  const resultSuperseded = store.read((state) => state);
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        {
          id: 'assistant-a',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'fulfilled-a',
              type: 'function',
              function: { name: 'lookup', arguments: '{"city":"Rome"}' },
            },
            {
              id: 'rejected-a',
              type: 'function',
              function: { name: 'lookup', arguments: '' },
            },
            {
              id: 'typed-a',
              type: 'function',
              function: { name: 'lookup', arguments: '{"city":"Berlin"}' },
            },
          ],
        },
        {
          id: 'fulfilled-result-a',
          role: 'tool',
          toolCallId: 'fulfilled-a',
          content: 'remote fulfilled',
        },
        {
          id: 'rejected-result-a',
          role: 'tool',
          toolCallId: 'rejected-a',
          content: 'updated remote rejection',
          error: 'updated remote rejection',
        },
      ],
    }),
  );
  const snapshotSuperseded = store.read((state) => state);

  // Assert
  expect(replayed.toolCalls.entities['fulfilled-a']?.result).toBe(
    fulfilledResult,
  );
  expect(identicalMetadata.toolCalls).toBe(afterMetadata.toolCalls);
  expect(identicalMetadata.toolCalls.localProvenance).toBe(
    afterMetadata.toolCalls.localProvenance,
  );
  expect(identicalMetadata.toolCalls.entities['fulfilled-a']).toBe(
    afterMetadata.toolCalls.entities['fulfilled-a'],
  );
  expect(replayed.toolCalls.entities['fulfilled-a']?.metadata).toEqual({
    phase: 'canonical',
    local: true,
  });
  expect(replayed.toolCalls.entities['rejected-a']?.result).toBe(
    rejectedResult,
  );
  expect(replayed.toolCalls.entities['typed-a']?.argumentsResolved).toBe(
    typedArguments,
  );
  expect(argumentsSuperseded.toolCalls.entities['fulfilled-a']).toMatchObject({
    arguments: '{"city":"Rome"}',
    result: { status: 'fulfilled', value: 'remote fulfilled' },
  });
  expect(
    argumentsSuperseded.toolCalls.entities['fulfilled-a']?.result,
  ).not.toBe(fulfilledResult);
  expect(resultSuperseded.toolCalls.entities['rejected-a']).toMatchObject({
    result: { status: 'rejected', reason: 'updated remote rejection' },
  });
  expect(resultSuperseded.toolCalls.entities['rejected-a']?.result).not.toBe(
    rejectedResult,
  );
  expect(snapshotSuperseded.toolCalls.entities['typed-a']).toMatchObject({
    arguments: '{"city":"Berlin"}',
  });
  expect(
    snapshotSuperseded.toolCalls.entities['typed-a']?.argumentsResolved,
  ).not.toBe(typedArguments);
});

test('keeps prepared cache slices by reference for empty stable lifecycle replays', () => {
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(
    devActions.init({
      system: '',
      canonicalMessages: [],
      tools: [
        {
          name: 'lookup',
          description: '',
          schema: s.object('lookup', {}),
          handler: async () => undefined,
        },
      ],
    }),
  );
  const initialized = store.read((state) => state);
  store.dispatch(
    apiActions.generateMessageStart({
      toolsByName: initialized.tools.entities,
    }),
  );
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        {
          id: 'assistant-a',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'tool-a',
              type: 'function',
              function: { name: 'lookup', arguments: '' },
            },
          ],
        },
      ],
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'assistant-a',
      role: 'assistant',
    }),
  );
  const afterTextStart = store.read((state) => state);
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'assistant-a',
      role: 'assistant',
    }),
  );
  const replayedTextStart = store.read((state) => state);

  expect(replayedTextStart.messages).toBe(afterTextStart.messages);
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-a',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-a',
    }),
  );
  const afterToolStart = store.read((state) => state);
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-a',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-a',
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'tool-a',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-a',
      delta: '',
    }),
  );
  const replayedToolCalls = store.read((state) => state);

  expect(replayedToolCalls.messages).toBe(afterToolStart.messages);
  expect(replayedToolCalls.toolCalls).toBe(afterToolStart.toolCalls);
});

test('reconciles metadata-only prepared compact text and reasoning chunks', () => {
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(devActions.init({ system: '', canonicalMessages: [] }));
  store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        { id: 'reasoning-a', role: 'reasoning', content: 'Plan' },
        { id: 'assistant-a', role: 'assistant', content: 'first' },
        { id: 'assistant-b', role: 'assistant', content: 'second' },
      ],
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'assistant-a',
      role: 'assistant',
      metadata: { text: true },
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.REASONING_MESSAGE_CHUNK,
      messageId: 'reasoning-a',
      metadata: { reasoning: true },
    }),
  );

  expect(selectViewMessages(store.read((state) => state))[0]).toMatchObject({
    role: 'assistant',
    content: 'first',
    metadata: { text: true },
    reasoningDetails: [
      { id: 'reasoning-a', content: 'Plan', metadata: { reasoning: true } },
    ],
  });
});

test('keeps prepared structural caches equal to the canonical projection across event families', () => {
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(
    devActions.init({
      system: '',
      canonicalMessages: [],
      tools: [
        {
          name: 'lookup',
          description: '',
          schema: s.object('lookup', {}),
          handler: async () => undefined,
        },
      ],
    }),
  );
  const initialized = store.read((state) => state);
  store.dispatch(
    apiActions.generateMessageStart({
      toolsByName: initialized.tools.entities,
    }),
  );
  store.dispatch(internalActions.generationAttemptStarted());
  const events: AGUIEvent[] = [
    {
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [{ id: 'assistant-a', role: 'assistant', content: '' }],
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'assistant-a',
      role: 'assistant',
      metadata: { start: true },
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'assistant-a',
      delta: 'Answer',
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'assistant-a',
      metadata: { end: true },
    },
    {
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'assistant-a',
      role: 'assistant',
      metadata: { chunk: true },
    },
    {
      type: EventType.REASONING_MESSAGE_START,
      messageId: 'reasoning-b',
      role: 'reasoning',
    },
    {
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: 'reasoning-b',
      delta: 'Plan',
    },
    {
      type: EventType.REASONING_MESSAGE_CHUNK,
      messageId: 'reasoning-b',
      metadata: { chunk: true },
    },
    {
      type: EventType.REASONING_ENCRYPTED_VALUE,
      subtype: 'message',
      entityId: 'reasoning-b',
      encryptedValue: 'opaque-reasoning',
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'assistant-b',
      role: 'assistant',
    },
    {
      type: EventType.REASONING_MESSAGE_END,
      messageId: 'reasoning-b',
    },
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-b',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-b',
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'tool-b',
      delta: '{}',
    },
    {
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'tool-b',
      toolCallName: 'lookup',
      metadata: { chunk: true },
    },
    {
      type: EventType.REASONING_ENCRYPTED_VALUE,
      subtype: 'tool-call',
      entityId: 'tool-b',
      encryptedValue: 'opaque-tool',
    },
    { type: EventType.TOOL_CALL_END, toolCallId: 'tool-b' },
    {
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'result-b',
      toolCallId: 'tool-b',
      content: 'found',
    },
  ];

  for (const event of events) {
    store.dispatch(apiActions.generateMessageEvent(event));
    const state = store.read((current) => current);
    const canonical = projectAgUiMessages(
      state.agUiMessages.draft,
      state.tools.entities,
      state.config.responseSchema,
    );

    expect(state.messages.draft).toEqual(canonical.messages);
    expect(state.toolCalls.ids).toEqual(
      canonical.toolCalls.map((tool) => tool.id),
    );
    expect(state.toolCalls.entities).toEqual(
      Object.fromEntries(canonical.toolCalls.map((tool) => [tool.id, tool])),
    );
  }

  store.dispatch(
    apiActions.generateMessageSuccess({
      message: Chat.helpers.ɵwithInternalMessageId(
        { role: 'assistant', content: '', toolCallIds: ['tool-b'] },
        'assistant-b',
      ),
      toolCalls: [
        { id: 'tool-b', name: 'lookup', arguments: '{}', status: 'pending' },
      ],
    }),
  );
  const committed = store.read((state) => state);
  const canonical = projectAgUiMessages(
    committed.agUiMessages.committed,
    committed.tools.entities,
    committed.config.responseSchema,
  );

  expect(committed.messages.committed).toEqual(canonical.messages);
  expect(committed.toolCalls.entities).toEqual(
    Object.fromEntries(canonical.toolCalls.map((tool) => [tool.id, tool])),
  );
});

test('reconciles a tool stream to an earlier snapshotted assistant', () => {
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(
    devActions.init({
      system: '',
      canonicalMessages: [],
      tools: [
        {
          name: 'lookup',
          description: '',
          schema: s.object('lookup', {
            city: s.streaming.string('city'),
          }),
          handler: async () => undefined,
        },
      ],
    }),
  );
  const initialized = store.read((state) => state);
  store.dispatch(
    apiActions.generateMessageStart({
      toolsByName: initialized.tools.entities,
    }),
  );
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        { id: 'assistant-a', role: 'assistant', content: 'first' },
        { id: 'assistant-b', role: 'assistant', content: 'second' },
      ],
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-a',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-a',
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'tool-a',
      delta: '{"city":"Paris"}',
    }),
  );

  expect(selectViewMessages(store.read((state) => state))[0]).toMatchObject({
    role: 'assistant',
    content: 'first',
    toolCalls: [
      { status: 'pending', toolCallId: 'tool-a', args: { city: 'Paris' } },
    ],
  });
  expect(store.read((state) => state).streamingMessage.messageId).toBe(
    'assistant-a',
  );

  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'result-a',
      toolCallId: 'tool-a',
      content: 'found',
    }),
  );

  expect(selectViewMessages(store.read((state) => state))).toEqual([
    {
      role: 'assistant',
      content: 'first',
      toolCalls: [
        {
          role: 'tool',
          status: 'done',
          name: 'lookup',
          toolCallId: 'tool-a',
          args: { city: 'Paris' },
          result: { status: 'fulfilled', value: 'found' },
        },
      ],
    },
    { role: 'assistant', content: 'second', toolCalls: [] },
  ]);
  store.dispatch(
    apiActions.generateMessageSuccess({
      message: Chat.helpers.ɵwithInternalMessageId(
        { role: 'assistant', content: '', toolCallIds: ['tool-a'] },
        'assistant-a',
      ),
      toolCalls: [
        {
          id: 'tool-a',
          name: 'lookup',
          arguments: '{"city":"Paris"}',
          argumentsResolved: { city: 'Paris' },
          status: 'pending',
        },
      ],
    }),
  );

  expect(selectViewMessages(store.read((state) => state))[0]).toMatchObject({
    role: 'assistant',
    content: 'first',
    toolCalls: [
      {
        status: 'done',
        toolCallId: 'tool-a',
        args: { city: 'Paris' },
        result: { status: 'fulfilled', value: 'found' },
      },
    ],
  });
});

test('reconciles a tool stream to a new declared assistant parent', () => {
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(
    devActions.init({
      system: '',
      canonicalMessages: [],
      tools: [
        {
          name: 'lookup',
          description: '',
          schema: s.object('lookup', {}),
          handler: async () => undefined,
        },
      ],
    }),
  );
  const initialized = store.read((state) => state);
  store.dispatch(
    apiActions.generateMessageStart({
      toolsByName: initialized.tools.entities,
    }),
  );
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        { id: 'assistant-a', role: 'assistant', content: 'first' },
        { id: 'assistant-b', role: 'assistant', content: 'second' },
      ],
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-c',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-c',
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'tool-c',
      delta: '{}',
    }),
  );

  expect(selectViewMessages(store.read((state) => state))).toEqual([
    { role: 'assistant', content: 'first', toolCalls: [] },
    { role: 'assistant', content: 'second', toolCalls: [] },
    {
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          role: 'tool',
          status: 'pending',
          name: 'lookup',
          toolCallId: 'tool-c',
          args: {},
          progress: undefined,
        },
      ],
    },
  ]);
  expect(store.read((state) => state).streamingMessage.messageId).toBe(
    'assistant-c',
  );
  store.dispatch(
    apiActions.generateMessageSuccess({
      message: Chat.helpers.ɵwithInternalMessageId(
        { role: 'assistant', content: '', toolCallIds: ['tool-c'] },
        'assistant-c',
      ),
      toolCalls: [
        { id: 'tool-c', name: 'lookup', arguments: '{}', status: 'pending' },
      ],
    }),
  );

  expect(selectViewMessages(store.read((state) => state))[2]).toMatchObject({
    role: 'assistant',
    toolCalls: [{ status: 'pending', toolCallId: 'tool-c', args: {} }],
  });
});

test('finalizes earlier snapshotted tool and reasoning lifecycles on their end events', () => {
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(
    devActions.init({
      system: '',
      canonicalMessages: [],
      tools: [
        {
          name: 'lookup',
          description: '',
          schema: s.object('lookup', { city: s.streaming.string('city') }),
          handler: async () => undefined,
        },
      ],
    }),
  );
  const initialized = store.read((state) => state);
  store.dispatch(
    apiActions.generateMessageStart({
      toolsByName: initialized.tools.entities,
    }),
  );
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        { id: 'reasoning-a', role: 'reasoning', content: 'Plan' },
        {
          id: 'assistant-a',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'tool-a',
              type: 'function',
              function: { name: 'lookup', arguments: '{"city":"Paris"}' },
            },
          ],
        },
        { id: 'assistant-b', role: 'assistant', content: 'second' },
      ],
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_END,
      toolCallId: 'tool-a',
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.REASONING_MESSAGE_END,
      messageId: 'reasoning-a',
    }),
  );

  const ended = store.read((state) => state.streamingMessage);

  expect(ended.messageId).toBe('assistant-a');
  expect(ended.finalizedToolCallIds['tool-a']).toBe(true);
  expect(ended.reasoningMessageStatusById['reasoning-a']).toBe('complete');
  expect(ended.snapshotReasoningMessageIds).toEqual([]);
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.RUN_FINISHED,
      threadId: 'thread-1',
      runId: 'run-1',
    }),
  );
  expect(store.read((state) => state).streamingMessage.error).toBeUndefined();
});

test('reconciles text end metadata and encrypted values to an earlier snapshotted assistant', () => {
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(devActions.init({ system: '', canonicalMessages: [] }));
  store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        { id: 'assistant-a', role: 'assistant', content: 'first' },
        { id: 'assistant-b', role: 'assistant', content: 'second' },
      ],
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'assistant-a',
      metadata: { ended: true },
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.REASONING_ENCRYPTED_VALUE,
      subtype: 'message',
      entityId: 'assistant-a',
      encryptedValue: 'opaque-a',
    }),
  );

  const live = store.read((state) => state);

  expect(live.streamingMessage.messageId).toBe('assistant-a');
  expect(live.streamingMessage.message).toMatchObject({
    content: 'first',
    metadata: { ended: true },
    encryptedValue: 'opaque-a',
  });
  expect(selectViewMessages(live)[0]).toMatchObject({
    role: 'assistant',
    content: 'first',
    metadata: { ended: true },
    encryptedValue: 'opaque-a',
  });
  store.dispatch(
    apiActions.generateMessageSuccess({
      message: Chat.helpers.ɵwithInternalMessageId(
        { role: 'assistant', content: 'first', toolCallIds: [] },
        'assistant-a',
      ),
      toolCalls: [],
    }),
  );
  expect(selectViewMessages(store.read((state) => state))[0]).toMatchObject({
    role: 'assistant',
    content: 'first',
    metadata: { ended: true },
    encryptedValue: 'opaque-a',
  });
});

test('commits an earlier snapshotted reasoning chunk after its assistant switches live', () => {
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(devActions.init({ system: '', canonicalMessages: [] }));
  store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        { id: 'reasoning-a', role: 'reasoning', content: 'Plan' },
        { id: 'assistant-a', role: 'assistant', content: 'first' },
        { id: 'assistant-b', role: 'assistant', content: 'second' },
      ],
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.REASONING_MESSAGE_CHUNK,
      messageId: 'reasoning-a',
      delta: ' more',
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.REASONING_MESSAGE_END,
      messageId: 'reasoning-a',
    }),
  );

  expect(store.read((state) => state).streamingMessage.message).toMatchObject({
    reasoning: {
      kind: 'details',
      details: [{ id: 'reasoning-a', content: 'Plan more' }],
    },
  });
  store.dispatch(
    apiActions.generateMessageSuccess({
      message: Chat.helpers.ɵwithInternalMessageId(
        { role: 'assistant', content: 'first', toolCallIds: [] },
        'assistant-a',
      ),
      toolCalls: [],
    }),
  );

  expect(selectViewMessages(store.read((state) => state))[0]).toMatchObject({
    role: 'assistant',
    content: 'first',
    reasoningDetails: [{ id: 'reasoning-a', content: 'Plan more' }],
  });
});

test('restores committed message IDs after a snapshot rollback', () => {
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(
    devActions.init({
      system: '',
      canonicalMessages: [
        { id: 'committed-user', role: 'user', content: 'committed' },
      ],
    }),
  );
  store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        {
          id: 'assistant-reused',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'tool-reused',
              type: 'function',
              function: { name: 'lookup', arguments: '' },
            },
          ],
        },
      ],
    }),
  );
  store.dispatch(internalActions.generationAttemptRolledBack());

  const rolledBack = store.read((state) => state);
  const committedMessages = rolledBack.messages.committed;

  expect(rolledBack.messages.messages).toBe(committedMessages);
  expect(rolledBack.messages.canonicalIds.messageIds).toEqual([
    'committed-user',
  ]);
  store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'assistant-reused',
      role: 'assistant',
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-reused',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-reused',
    }),
  );

  const reused = store.read((state) => state);
  const beforeRejected = reused.messages;
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'committed-user',
      role: 'assistant',
    }),
  );

  expect(reused.messages.messages).toContainEqual(
    expect.objectContaining({ id: 'assistant-reused', role: 'assistant' }),
  );
  expect(reused.toolCalls.entities['tool-reused']).toMatchObject({
    name: 'lookup',
    status: 'pending',
  });
  expect(store.read((state) => state).messages).toBe(beforeRejected);
  expect(store.read(ɵselectAgUiMessagesProtocolError)).toBeInstanceOf(Error);
});

test('restores committed tool IDs after a snapshot rollback', () => {
  // Arrange
  const localToolCall: Chat.Internal.ToolCall = {
    id: 'tool-reused',
    name: 'lookup',
    arguments: '',
    status: 'pending',
  };
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(devActions.init({ system: '', canonicalMessages: [] }));
  store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        {
          id: 'assistant-snapshot',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: localToolCall.id,
              type: 'function',
              function: { name: localToolCall.name, arguments: '' },
            },
          ],
        },
      ],
    }),
  );
  store.dispatch(internalActions.generationAttemptRolledBack());

  // Act
  store.dispatch(
    devActions.sendMessage({
      message: { role: 'user', content: 'next' },
      canonicalMessages: [
        {
          id: 'assistant-local',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: localToolCall.id,
              type: 'function',
              function: { name: localToolCall.name, arguments: '' },
            },
          ],
        },
      ],
      localProjection: {
        messages: [
          {
            id: 'assistant-local',
            role: 'assistant',
            content: '',
            toolCallIds: [localToolCall.id],
          },
        ],
        toolCalls: [localToolCall],
      },
    }),
  );
  const state = store.read((current) => current);

  // Assert
  expect(state.toolCalls.canonicalIds.toolCallIds).toEqual([localToolCall.id]);
  expect(state.toolCalls.entities[localToolCall.id]).toBe(localToolCall);
});

test('avoids historical projection for a current assistant while hydrating another', () => {
  // Arrange
  const originalStructuredClone = globalThis.structuredClone;
  let historicalClones = 0;
  const structuredCloneSpy = jest
    .spyOn(globalThis, 'structuredClone')
    .mockImplementation((value) => {
      if (
        typeof value === 'object' &&
        value !== null &&
        'historical' in value &&
        value.historical === true
      ) {
        historicalClones += 1;
      }
      return originalStructuredClone(value);
    });
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });

  try {
    store.dispatch(
      devActions.init({
        system: '',
        canonicalMessages: [
          {
            id: 'assistant-history',
            role: 'assistant',
            content: 'history',
            metadata: { historical: true },
          },
          { id: 'assistant-current', role: 'assistant', content: '' },
        ],
      }),
    );
    store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));
    store.dispatch(internalActions.generationAttemptStarted());
    store.dispatch(
      apiActions.generateMessageEvent({
        type: EventType.TEXT_MESSAGE_START,
        messageId: 'assistant-current',
        role: 'assistant',
      }),
    );
    historicalClones = 0;

    // Act
    store.dispatch(
      apiActions.generateMessageEvent({
        type: EventType.TEXT_MESSAGE_CHUNK,
        messageId: 'assistant-current',
        role: 'assistant',
        delta: 'current',
      }),
    );
    const current = store.read((state) => state);
    const currentHistoricalClones = historicalClones;
    store.dispatch(
      apiActions.generateMessageEvent({
        type: EventType.TEXT_MESSAGE_CHUNK,
        messageId: 'assistant-next',
        role: 'assistant',
        delta: 'next',
      }),
    );
    const next = store.read((state) => state);

    // Assert
    expect(currentHistoricalClones).toBe(0);
    expect(current.streamingMessage.messageId).toBe('assistant-current');
    expect(current.streamingMessage.message?.content).toBe('current');
    expect(next.streamingMessage.messageId).toBe('assistant-next');
    expect(next.streamingMessage.message?.content).toBe('next');
  } finally {
    structuredCloneSpy.mockRestore();
  }
});

test('reprojects only the affected reasoning assistant metadata', () => {
  // Arrange
  const originalStructuredClone = globalThis.structuredClone;
  let metadataClones = 0;
  const structuredCloneSpy = jest
    .spyOn(globalThis, 'structuredClone')
    .mockImplementation((value) => {
      if (
        typeof value === 'object' &&
        value !== null &&
        'projectionMetadata' in value
      ) {
        metadataClones += 1;
      }
      return originalStructuredClone(value);
    });
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });

  try {
    store.dispatch(
      devActions.init({
        system: '',
        canonicalMessages: [
          ...Array.from({ length: 20 }, (_, index) => ({
            id: `assistant-history-${index}`,
            role: 'assistant' as const,
            content: `history ${index}`,
            metadata: { projectionMetadata: `history-${index}` },
          })),
          {
            id: 'reasoning-current',
            role: 'reasoning' as const,
            content: 'Plan',
            metadata: { projectionMetadata: 'reasoning-current' },
          },
          {
            id: 'assistant-current',
            role: 'assistant' as const,
            content: 'Answer',
            metadata: { projectionMetadata: 'assistant-current' },
          },
        ],
      }),
    );
    store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));
    store.dispatch(internalActions.generationAttemptStarted());
    store.dispatch(
      apiActions.generateMessageEvent({
        type: EventType.REASONING_MESSAGE_START,
        messageId: 'reasoning-current',
        role: 'reasoning',
      }),
    );
    metadataClones = 0;

    // Act
    store.dispatch(
      apiActions.generateMessageEvent({
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: 'reasoning-current',
        delta: ' more',
      }),
    );
    const state = store.read((current) => current);

    // Assert
    expect(metadataClones).toBe(2);
    expect(state.streamingMessage.messageId).toBe('assistant-current');
    expect(state.streamingMessage.message?.reasoning).toEqual({
      kind: 'details',
      details: [
        {
          id: 'reasoning-current',
          role: 'reasoning',
          content: 'Plan more',
          metadata: { projectionMetadata: 'reasoning-current' },
        },
      ],
    });
    expect(state.agUiMessages.activeReasoningMessageId).toBe(
      'reasoning-current',
    );
    expect(selectViewMessages(state).at(-1)).toMatchObject({
      role: 'assistant',
      content: 'Answer',
      reasoningDetails: [{ id: 'reasoning-current', content: 'Plan more' }],
    });
  } finally {
    structuredCloneSpy.mockRestore();
  }
});

test('accepts a compatible snapshotted reasoning start without resetting it', () => {
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(devActions.init({ system: '', canonicalMessages: [] }));
  store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        {
          id: 'reasoning-1',
          role: 'reasoning',
          content: 'Plan',
          encryptedValue: 'opaque',
          metadata: { initial: true },
        },
        { id: 'assistant-1', role: 'assistant', content: '' },
      ],
    }),
  );
  const snapshotted = store.read((state) => state);
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.REASONING_MESSAGE_START,
      messageId: 'reasoning-1',
      role: 'reasoning',
    }),
  );

  expect(store.read((state) => state).streamingMessage).toBe(
    snapshotted.streamingMessage,
  );

  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.REASONING_MESSAGE_START,
      messageId: 'reasoning-1',
      role: 'reasoning',
      metadata: { retry: true },
      subagentRunId: 'subagent-1',
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: 'reasoning-1',
      delta: ' more',
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.REASONING_MESSAGE_END,
      messageId: 'reasoning-1',
    }),
  );

  const state = store.read((current) => current);

  expect(state.streamingMessage.error).toBeUndefined();
  expect(state.streamingMessage.message?.reasoning).toEqual({
    kind: 'details',
    details: [
      {
        id: 'reasoning-1',
        role: 'reasoning',
        content: 'Plan more',
        encryptedValue: 'opaque',
        metadata: { initial: true, retry: true },
        subagentRunId: 'subagent-1',
      },
    ],
  });
  expect(state.streamingMessage.reasoningMessageStatusById).toEqual({
    'reasoning-1': 'complete',
  });
  expect(state.agUiMessages.draft[0]).toMatchObject({
    id: 'reasoning-1',
    content: 'Plan more',
    encryptedValue: 'opaque',
    metadata: { initial: true, retry: true },
    subagentRunId: 'subagent-1',
  });
});

type InvalidSnapshot = {
  readonly name: string;
  readonly create: () => {
    readonly messages: unknown;
    readonly accesses?: () => number;
  };
};

function createActiveSnapshotState() {
  const initialized = reduceAll(
    createState(),
    devActions.init({
      system: '',
      canonicalMessages: [{ id: 'user-1', role: 'user', content: 'hello' }],
    }),
  );
  const started = reduceAll(
    initialized,
    apiActions.generateMessageStart({ toolsByName: {} }),
  );
  const attempted = reduceAll(
    started,
    internalActions.generationAttemptStarted(),
  );
  const text = reduceAll(
    attempted,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'assistant-draft',
      role: 'assistant',
      delta: 'draft',
    }),
  );

  return reduceAll(
    text,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      parentMessageId: 'assistant-draft',
      toolCallId: 'tool-draft',
      toolCallName: 'lookup',
      delta: '{',
    }),
  );
}

function createValidStructuralSnapshot() {
  return [
    {
      id: 'tool-result-1',
      role: 'tool' as const,
      toolCallId: 'tool-1',
      content: '{"temp":20}',
      metadata: { source: { name: 'weather' } },
      future: { retained: ['tool'] },
    },
    {
      id: 'developer-1',
      role: 'developer' as const,
      content: 'Use metric units.',
      name: 'policy',
    },
    {
      id: 'system-1',
      role: 'system' as const,
      content: 'Be concise.',
      encryptedValue: 'system-secret',
    },
    { id: 'user-2', role: 'user' as const, content: 'Forecast Paris.' },
    {
      id: 'reasoning-1',
      role: 'reasoning' as const,
      content: 'Need a weather lookup.',
      encryptedValue: 'reasoning-secret',
    },
    {
      id: 'assistant-1',
      role: 'assistant' as const,
      content: 'Checking.',
      name: 'assistant',
      toolCalls: [
        {
          id: 'tool-1',
          type: 'function' as const,
          function: { name: 'lookup', arguments: '{"city":"Paris"}' },
          metadata: { origin: 'model' },
          future: { retained: true },
        },
      ],
      future: { nested: { retained: true } },
    },
    {
      id: 'activity-1',
      role: 'activity' as const,
      activityType: 'progress',
      content: { completed: 1 },
      future: { retained: ['activity'] },
    },
  ];
}

const invalidSnapshots: readonly InvalidSnapshot[] = [
  {
    name: 'a non-array snapshot root',
    create: () => ({ messages: {} }),
  },
  {
    name: 'a sparse snapshot root',
    create: () => ({ messages: new Array(1) }),
  },
  {
    name: 'an accessor-backed snapshot root',
    create: () => {
      let accesses = 0;
      const messages = new Array(1);
      Object.defineProperty(messages, 0, {
        enumerable: true,
        get: () => {
          accesses += 1;
          return { id: 'unsafe', role: 'user', content: 'unsafe' };
        },
      });
      return { messages, accesses: () => accesses };
    },
  },
  {
    name: 'a missing message ID',
    create: () => ({ messages: [{ role: 'user', content: 'missing' }] }),
  },
  {
    name: 'an empty message ID',
    create: () => ({ messages: [{ id: '', role: 'user', content: 'empty' }] }),
  },
  {
    name: 'a non-string message ID',
    create: () => ({ messages: [{ id: 1, role: 'user', content: 'number' }] }),
  },
  {
    name: 'a missing role',
    create: () => ({ messages: [{ id: 'missing-role', content: 'missing' }] }),
  },
  {
    name: 'an unknown role',
    create: () => ({
      messages: [{ id: 'unknown-role', role: 'future', content: 'future' }],
    }),
  },
  {
    name: 'a non-string role',
    create: () => ({
      messages: [{ id: 'role-number', role: 1, content: 'bad' }],
    }),
  },
  {
    name: 'invalid user content',
    create: () => ({
      messages: [{ id: 'user-invalid', role: 'user', content: 1 }],
    }),
  },
  {
    name: 'missing user content',
    create: () => ({ messages: [{ id: 'user-missing', role: 'user' }] }),
  },
  {
    name: 'invalid system content',
    create: () => ({
      messages: [{ id: 'system-invalid', role: 'system', content: 1 }],
    }),
  },
  {
    name: 'missing developer content and invalid name',
    create: () => ({
      messages: [{ id: 'developer-invalid', role: 'developer', name: 1 }],
    }),
  },
  {
    name: 'invalid assistant content',
    create: () => ({
      messages: [{ id: 'assistant-content', role: 'assistant', content: 1 }],
    }),
  },
  {
    name: 'an invalid assistant toolCalls container',
    create: () => ({
      messages: [{ id: 'assistant-calls', role: 'assistant', toolCalls: 'x' }],
    }),
  },
  {
    name: 'a sparse assistant toolCalls array',
    create: () => ({
      messages: [
        {
          id: 'assistant-sparse-calls',
          role: 'assistant',
          toolCalls: new Array(1),
        },
      ],
    }),
  },
  {
    name: 'an accessor-backed assistant tool call',
    create: () => {
      let accesses = 0;
      const toolCalls = new Array(1);
      Object.defineProperty(toolCalls, 0, {
        enumerable: true,
        get: () => {
          accesses += 1;
          return {};
        },
      });
      return {
        messages: [{ id: 'assistant-accessor', role: 'assistant', toolCalls }],
        accesses: () => accesses,
      };
    },
  },
  {
    name: 'a tool call without a nonempty ID',
    create: () => ({
      messages: [
        {
          id: 'assistant-empty-call',
          role: 'assistant',
          toolCalls: [
            {
              id: '',
              type: 'function',
              function: { name: 'lookup', arguments: '{}' },
            },
          ],
        },
      ],
    }),
  },
  {
    name: 'a tool call missing its ID and function',
    create: () => ({
      messages: [
        {
          id: 'assistant-missing-call-fields',
          role: 'assistant',
          toolCalls: [{ type: 'function' }],
        },
      ],
    }),
  },
  {
    name: 'a tool call with a non-object function',
    create: () => ({
      messages: [
        {
          id: 'assistant-nonobject-function',
          role: 'assistant',
          toolCalls: [{ id: 'call-1', type: 'function', function: null }],
        },
      ],
    }),
  },
  {
    name: 'a tool call with an invalid discriminator',
    create: () => ({
      messages: [
        {
          id: 'assistant-invalid-call',
          role: 'assistant',
          toolCalls: [
            {
              id: 'call-1',
              type: 'tool',
              function: { name: 'lookup', arguments: '{}' },
            },
          ],
        },
      ],
    }),
  },
  {
    name: 'a tool call with an empty function name',
    create: () => ({
      messages: [
        {
          id: 'assistant-invalid-call-name',
          role: 'assistant',
          toolCalls: [
            {
              id: 'call-empty-name',
              type: 'function',
              function: { name: '', arguments: '{}' },
            },
          ],
        },
      ],
    }),
  },
  {
    name: 'a tool call with a non-string function name',
    create: () => ({
      messages: [
        {
          id: 'assistant-number-call-name',
          role: 'assistant',
          toolCalls: [
            {
              id: 'call-number-name',
              type: 'function',
              function: { name: 1, arguments: '{}' },
            },
          ],
        },
      ],
    }),
  },
  {
    name: 'a tool call with non-string arguments',
    create: () => ({
      messages: [
        {
          id: 'assistant-invalid-call-arguments',
          role: 'assistant',
          toolCalls: [
            {
              id: 'call-invalid-arguments',
              type: 'function',
              function: { name: 'lookup', arguments: 1 },
            },
          ],
        },
      ],
    }),
  },
  {
    name: 'an invalid tool result core field',
    create: () => ({
      messages: [
        {
          id: 'tool-invalid',
          role: 'tool',
          toolCallId: '',
          content: 1,
          error: 1,
        },
      ],
    }),
  },
  {
    name: 'a tool result with a non-string error',
    create: () => ({
      messages: [
        {
          id: 'assistant-tool-result-error',
          role: 'assistant',
          toolCalls: [
            {
              id: 'tool-result-error',
              type: 'function',
              function: { name: 'lookup', arguments: '' },
            },
          ],
        },
        {
          id: 'tool-error',
          role: 'tool',
          toolCallId: 'tool-result-error',
          content: 'failed',
          error: 1,
        },
      ],
    }),
  },
  {
    name: 'a tool result missing its toolCallId',
    create: () => ({
      messages: [{ id: 'tool-missing-call', role: 'tool', content: 'missing' }],
    }),
  },
  {
    name: 'a tool result with an unknown tool-call reference',
    create: () => ({
      messages: [
        {
          id: 'tool-unmatched',
          role: 'tool',
          toolCallId: 'missing-call',
          content: 'missing',
        },
      ],
    }),
  },
  {
    name: 'invalid reasoning content and encrypted value',
    create: () => ({
      messages: [
        {
          id: 'reasoning-invalid',
          role: 'reasoning',
          content: 1,
          encryptedValue: 1,
        },
      ],
    }),
  },
  {
    name: 'a reasoning message with non-string encrypted value',
    create: () => ({
      messages: [
        {
          id: 'reasoning-encrypted-invalid',
          role: 'reasoning',
          content: 'valid',
          encryptedValue: 1,
        },
      ],
    }),
  },
  {
    name: 'invalid activity core fields',
    create: () => ({
      messages: [
        {
          id: 'activity-invalid',
          role: 'activity',
          activityType: 1,
          content: 'bad',
        },
      ],
    }),
  },
  {
    name: 'an activity message with non-record content',
    create: () => ({
      messages: [
        {
          id: 'activity-content-invalid',
          role: 'activity',
          activityType: 'progress',
          content: 'bad',
        },
      ],
    }),
  },
  {
    name: 'duplicate canonical message IDs',
    create: () => ({
      messages: [
        { id: 'duplicate', role: 'user', content: 'one' },
        { id: 'duplicate', role: 'assistant', content: 'two' },
      ],
    }),
  },
  {
    name: 'duplicate nested tool-call IDs',
    create: () => ({
      messages: [
        {
          id: 'assistant-one',
          role: 'assistant',
          toolCalls: [
            {
              id: 'duplicate-call',
              type: 'function',
              function: { name: 'one', arguments: '' },
            },
          ],
        },
        {
          id: 'assistant-two',
          role: 'assistant',
          toolCalls: [
            {
              id: 'duplicate-call',
              type: 'function',
              function: { name: 'two', arguments: '' },
            },
          ],
        },
      ],
    }),
  },
  {
    name: 'a message ID colliding with a tool-call ID',
    create: () => ({
      messages: [
        {
          id: 'assistant-collision',
          role: 'assistant',
          toolCalls: [
            {
              id: 'collision',
              type: 'function',
              function: { name: 'lookup', arguments: '' },
            },
          ],
        },
        {
          id: 'collision',
          role: 'tool',
          toolCallId: 'collision',
          content: 'bad',
        },
      ],
    }),
  },
];

for (const invalidSnapshot of invalidSnapshots) {
  test(`root isolates ${invalidSnapshot.name}`, () => {
    // Arrange
    const active = createActiveSnapshotState();
    const malformed = invalidSnapshot.create();

    // Act
    const next = reduceAll(
      active,
      apiActions.generateMessageEvent({
        type: EventType.MESSAGES_SNAPSHOT,
        messages: malformed.messages,
      } as unknown as AGUIEvent),
    );

    // Assert
    expect(next.agUiMessages.protocolError).toBeInstanceOf(Error);
    expect(next.agUiMessages.draft).toBe(active.agUiMessages.draft);
    expect(next.agUiMessages.committed).toBe(active.agUiMessages.committed);
    expect(next.messages).toBe(active.messages);
    expect(next.toolCalls).toBe(active.toolCalls);
    expect(next.streamingMessage).toBe(active.streamingMessage);
    if (malformed.accesses) {
      expect(malformed.accesses()).toBe(0);
    }
  });
}

test('root accepts and owns a structurally valid snapshot with every AG-UI role', () => {
  // Arrange
  const active = createActiveSnapshotState();
  const invalid = reduceAll(
    active,
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [{ id: '', role: 'user', content: 'invalid' }],
    } as unknown as AGUIEvent),
  );
  const snapshot = createValidStructuralSnapshot();

  // Act
  const next = reduceAll(
    invalid,
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: snapshot,
    }),
  );
  const sourceAssistant = snapshot[5];
  if (sourceAssistant?.role !== 'assistant') {
    throw new Error('Expected assistant snapshot fixture.');
  }
  sourceAssistant.future.nested.retained = false;

  // Assert
  expect(next.agUiMessages.protocolError).toBeUndefined();
  expect(next.agUiMessages.draft.map((message) => message.role)).toEqual([
    'tool',
    'developer',
    'system',
    'user',
    'reasoning',
    'assistant',
    'activity',
  ]);
  expect(next.agUiMessages.draft[5]).toMatchObject({
    id: 'assistant-1',
    future: { nested: { retained: true } },
  });
  expect(Object.isFrozen(next.agUiMessages.draft)).toBe(true);
  expect(Object.isFrozen(next.agUiMessages.draft[5] ?? {})).toBe(true);
  const future = Object.getOwnPropertyDescriptor(
    next.agUiMessages.draft[5] ?? {},
    'future',
  )?.value;
  expect(Object.isFrozen(future as object)).toBe(true);
  expect(next.messages).not.toBe(invalid.messages);
  expect(next.toolCalls).not.toBe(invalid.toolCalls);
  expect(next.streamingMessage).not.toBe(invalid.streamingMessage);
  expect(next.toolCalls.entities['tool-1']).toMatchObject({
    name: 'lookup',
    arguments: '{"city":"Paris"}',
    status: 'done',
    result: { status: 'fulfilled', value: '{"temp":20}' },
  });
});

test('combined state exposes the transactional agent state selectors', () => {
  const initialized = reduceAll(
    createState(),
    devActions.init({
      canonicalMessages: [],
      system: 'test',
      state: Object.freeze({ count: 1 }),
    }),
  );
  const active = reduceAll(
    initialized,
    internalActions.generationAttemptStarted(),
  );
  const nextState = reduceAll(
    active,
    apiActions.generateMessageEvent({
      type: EventType.STATE_SNAPSHOT,
      snapshot: { count: 2 },
    }),
  );

  expect(ɵselectCommittedAgentState(nextState)).toEqual({ count: 1 });
  expect(ɵselectVisibleAgentState(nextState)).toEqual({ count: 2 });
});

test('combined state exposes transactional canonical message selectors', () => {
  const initialized = reduceAll(
    createState(),
    devActions.init({
      system: 'configured',
      systemMessage: { id: 'system-1', role: 'system', content: 'configured' },
      canonicalMessages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'tool-1',
              type: 'function',
              function: { name: 'lookup', arguments: '' },
            },
          ],
        },
      ],
    }),
  );
  const active = reduceAll(
    initialized,
    internalActions.generationAttemptStarted(),
  );

  expect(ɵselectCommittedAgUiMessages(active)).toHaveLength(1);
  expect(ɵselectVisibleAgUiMessages(active)).toBe(active.agUiMessages.draft);
  expect(ɵselectEffectiveVisibleAgUiMessages(active)[0]).toMatchObject({
    id: 'system-1',
  });
  expect(ɵselectEffectiveCommittedAgUiMessages(active)[0]).toMatchObject({
    id: 'system-1',
  });
  expect(ɵselectAttemptStartToolCallIds(active)).toEqual(['tool-1']);
  expect(ɵselectAgUiMessagesProtocolError(active)).toBeUndefined();
});

test('combined root preserves snapshot assistant and tool-call baselines through matching stream deltas and success', () => {
  const initialized = reduceAll(
    createState(),
    devActions.init({
      system: '',
      canonicalMessages: [{ id: 'user-1', role: 'user', content: 'hello' }],
    }),
  );
  const active = reduceAll(
    reduceAll(
      initialized,
      apiActions.generateMessageStart({ toolsByName: {} }),
    ),
    internalActions.generationAttemptStarted(),
  );
  const snapshotted = reduceAll(
    active,
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        { id: 'user-1', role: 'user', content: 'hello' },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'snapshot',
          toolCalls: [
            {
              id: 'tool-1',
              type: 'function',
              function: { name: 'lookup', arguments: '{"query":"tea"' },
            },
          ],
        },
      ],
    }),
  );
  const streamed = reduceAll(
    snapshotted,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'assistant-1',
      role: 'assistant',
      delta: ' stream',
    }),
  );
  const withToolDelta = reduceAll(
    streamed,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'tool-1',
      toolCallName: 'lookup',
      delta: '}',
    }),
  );

  expect(selectViewMessages(withToolDelta)).toEqual([
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'snapshot stream', toolCalls: [] },
  ]);
  expect(withToolDelta.toolCalls.entities['tool-1']).toMatchObject({
    arguments: '{"query":"tea"}',
  });

  const succeeded = reduceAll(
    withToolDelta,
    apiActions.generateMessageSuccess({
      message: Chat.helpers.ɵwithInternalMessageId(
        { role: 'assistant', content: ' stream', toolCallIds: ['tool-1'] },
        'assistant-1',
      ),
      toolCalls: [
        { id: 'tool-1', name: 'lookup', arguments: '}', status: 'pending' },
      ],
    }),
  );

  expect(selectViewMessages(succeeded)).toEqual([
    { role: 'user', content: 'hello' },
    {
      role: 'assistant',
      content: 'snapshot stream',
      toolCalls: [],
    },
  ]);
  expect(
    selectViewMessages(succeeded).filter(
      (message) => message.role === 'assistant',
    ),
  ).toHaveLength(1);
  expect(succeeded.toolCalls.entities['tool-1']).toMatchObject({
    arguments: '{"query":"tea"}',
  });
});

test('settles fulfilled and rejected streamed tool results without a pending overlay', () => {
  const initialized = reduceAll(
    createState(),
    devActions.init({
      system: '',
      canonicalMessages: [],
      tools: [
        {
          name: 'lookup',
          description: '',
          schema: s.object('lookup', {}),
          handler: async () => undefined,
        },
      ],
    }),
  );
  const active = reduceAll(
    reduceAll(
      initialized,
      apiActions.generateMessageStart({
        toolsByName: initialized.tools.entities,
      }),
    ),
    internalActions.generationAttemptStarted(),
  );
  const started = reduceAll(
    active,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-1',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-1',
    }),
  );
  const fulfilled = reduceAll(
    started,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'tool-result-1',
      toolCallId: 'tool-1',
      content: 'found',
    }),
  );
  const rejected = reduceAll(
    started,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'tool-result-1',
      toolCallId: 'tool-1',
      content: 'failed',
      error: 'unavailable',
    }),
  );

  expect(fulfilled.toolCalls.entities['tool-1']).toMatchObject({
    status: 'done',
    result: { status: 'fulfilled', value: 'found' },
  });
  expect(rejected.toolCalls.entities['tool-1']).toMatchObject({
    status: 'done',
    result: { status: 'rejected', reason: 'unavailable' },
  });
  expect(fulfilled.streamingMessage.toolCalls).toEqual([]);
  expect(rejected.streamingMessage.toolCalls).toEqual([]);
  expect(selectViewMessages(fulfilled)[0]).toMatchObject({
    role: 'assistant',
    toolCalls: [{ status: 'done', result: { status: 'fulfilled' } }],
  });
  expect(selectViewMessages(rejected)[0]).toMatchObject({
    role: 'assistant',
    toolCalls: [{ status: 'done', result: { status: 'rejected' } }],
  });
});

test('retains streamed tool lifecycle and result decorations through settlement', () => {
  const initialized = reduceAll(
    createState(),
    devActions.init({
      system: '',
      canonicalMessages: [],
      tools: [
        {
          name: 'lookup',
          description: '',
          schema: s.object('lookup', {}),
          handler: async () => undefined,
        },
      ],
    }),
  );
  const active = reduceAll(
    reduceAll(
      initialized,
      apiActions.generateMessageStart({
        toolsByName: initialized.tools.entities,
      }),
    ),
    internalActions.generationAttemptStarted(),
  );
  const started = reduceAll(
    reduceAll(
      active,
      apiActions.generateMessageEvent({
        type: EventType.TEXT_MESSAGE_START,
        messageId: 'assistant-1',
        role: 'assistant',
      }),
    ),
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'fulfilled-call',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-1',
      metadata: { call: 'fulfilled' },
    }),
  );
  const retried = reduceAll(
    started,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'fulfilled-call',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-1',
      metadata: { retry: 'fulfilled' },
    }),
  );
  const withArguments = reduceAll(
    retried,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'fulfilled-call',
      delta: '{}',
    }),
  );
  const withRejectedCall = reduceAll(
    withArguments,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'rejected-call',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-1',
      metadata: { call: 'rejected' },
    }),
  );
  const encrypted = reduceAll(
    withRejectedCall,
    apiActions.generateMessageEvent({
      type: EventType.REASONING_ENCRYPTED_VALUE,
      subtype: 'tool-call',
      entityId: 'fulfilled-call',
      encryptedValue: 'fulfilled-opaque',
    }),
  );
  const decorated = reduceAll(
    encrypted,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'fulfilled-call',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-1',
      metadata: { chunk: 'fulfilled' },
    }),
  );
  const fulfilled = reduceAll(
    decorated,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'fulfilled-result',
      toolCallId: 'fulfilled-call',
      content: 'found',
      metadata: { result: 'fulfilled' },
    }),
  );
  const settled = reduceAll(
    fulfilled,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'rejected-result',
      toolCallId: 'rejected-call',
      content: 'unavailable',
      error: 'denied',
      metadata: { result: 'rejected' },
    } as unknown as Parameters<typeof apiActions.generateMessageEvent>[0]),
  );
  const fulfilledResult = settled.toolCalls.entities['fulfilled-call']?.result;
  const rejectedResult = settled.toolCalls.entities['rejected-call']?.result;

  const canonicalAssistant = settled.agUiMessages.draft.find(
    (message) => message.id === 'assistant-1',
  ) as Extract<
    (typeof settled.agUiMessages.draft)[number],
    { role: 'assistant' }
  >;

  expect(settled.streamingMessage.toolCalls).toEqual([]);
  expect(canonicalAssistant.toolCalls).toHaveLength(2);
  expect(canonicalAssistant.toolCalls?.[0]).toMatchObject({
    id: 'fulfilled-call',
    function: { name: 'lookup', arguments: '{}' },
    encryptedValue: 'fulfilled-opaque',
    metadata: {
      call: 'fulfilled',
      retry: 'fulfilled',
      chunk: 'fulfilled',
    },
  });
  expect(selectViewMessages(settled)[0]).toMatchObject({
    role: 'assistant',
    toolCalls: [
      {
        status: 'done',
        encryptedValue: 'fulfilled-opaque',
        metadata: {
          call: 'fulfilled',
          retry: 'fulfilled',
          chunk: 'fulfilled',
          result: 'fulfilled',
        },
        result: { status: 'fulfilled', value: 'found' },
      },
      {
        status: 'done',
        metadata: { call: 'rejected', result: 'rejected' },
        result: { status: 'rejected', reason: 'denied' },
      },
    ],
  });

  const committed = reduceAll(
    settled,
    apiActions.generateMessageSuccess({
      message: Chat.helpers.ɵwithInternalMessageId(
        {
          role: 'assistant',
          content: '',
          toolCallIds: ['fulfilled-call', 'rejected-call'],
        },
        'assistant-1',
      ),
      toolCalls: [
        {
          id: 'fulfilled-call',
          name: 'lookup',
          arguments: '{}',
          status: 'pending',
        },
        {
          id: 'rejected-call',
          name: 'lookup',
          arguments: '{}',
          status: 'pending',
        },
      ],
    }),
  );

  expect(selectViewMessages(committed)[0]).toMatchObject({
    role: 'assistant',
    toolCalls: [
      {
        status: 'done',
        encryptedValue: 'fulfilled-opaque',
        metadata: {
          call: 'fulfilled',
          retry: 'fulfilled',
          chunk: 'fulfilled',
          result: 'fulfilled',
        },
        result: { status: 'fulfilled', value: 'found' },
      },
      {
        status: 'done',
        metadata: { call: 'rejected', result: 'rejected' },
        result: { status: 'rejected', reason: 'denied' },
      },
    ],
  });
  expect(committed.toolCalls.entities['fulfilled-call']?.result).toBe(
    fulfilledResult,
  );
  expect(committed.toolCalls.entities['rejected-call']?.result).toBe(
    rejectedResult,
  );
});

test('retains partial streamed tool arguments in the live projection', () => {
  const initialized = reduceAll(
    createState(),
    devActions.init({
      system: '',
      canonicalMessages: [],
      tools: [
        {
          name: 'lookup',
          description: '',
          schema: s.object('lookup', {
            city: s.streaming.string('city'),
          }),
          handler: async () => undefined,
        },
      ],
    }),
  );
  const active = reduceAll(
    reduceAll(
      initialized,
      apiActions.generateMessageStart({
        toolsByName: initialized.tools.entities,
      }),
    ),
    internalActions.generationAttemptStarted(),
  );
  const streamed = reduceAll(
    reduceAll(
      active,
      apiActions.generateMessageEvent({
        type: EventType.TEXT_MESSAGE_START,
        messageId: 'assistant-1',
        role: 'assistant',
      }),
    ),
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'tool-1',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-1',
      delta: '{"city":"Par',
    }),
  );

  const view = selectViewMessages(streamed);

  expect(streamed.toolCalls.entities['tool-1']).toMatchObject({
    status: 'pending',
    arguments: '{"city":"Par',
  });
  expect(view[0]).toMatchObject({
    role: 'assistant',
    toolCalls: [{ status: 'pending', args: { city: 'Par' } }],
  });
});

test('reconciles snapshotted reasoning through matching live content and end events', () => {
  const initialized = reduceAll(
    createState(),
    devActions.init({ system: '', canonicalMessages: [] }),
  );
  const active = reduceAll(
    reduceAll(
      initialized,
      apiActions.generateMessageStart({ toolsByName: {} }),
    ),
    internalActions.generationAttemptStarted(),
  );
  const snapshotted = reduceAll(
    active,
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        { id: 'reasoning-1', role: 'reasoning', content: 'Plan' },
        { id: 'assistant-1', role: 'assistant', content: '' },
      ],
    }),
  );
  const continued = reduceAll(
    snapshotted,
    apiActions.generateMessageEvent({
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: 'reasoning-1',
      delta: ' more',
    }),
  );
  const ended = reduceAll(
    continued,
    apiActions.generateMessageEvent({
      type: EventType.REASONING_MESSAGE_END,
      messageId: 'reasoning-1',
    }),
  );

  expect(ended.agUiMessages.draft[0]).toMatchObject({
    id: 'reasoning-1',
    content: 'Plan more',
  });
  expect(ended.streamingMessage.error).toBeUndefined();
  expect(ended.streamingMessage.message?.reasoning).toEqual({
    kind: 'details',
    details: [{ id: 'reasoning-1', role: 'reasoning', content: 'Plan more' }],
  });
});

test('root supersession actions atomically discard stale canonical projection drafts', () => {
  const initialized = reduceAll(
    createState(),
    devActions.init({
      system: '',
      canonicalMessages: [{ id: 'user-1', role: 'user', content: 'first' }],
    }),
  );
  const active = reduceAll(
    reduceAll(
      initialized,
      apiActions.generateMessageStart({ toolsByName: {} }),
    ),
    internalActions.generationAttemptStarted(),
  );
  const staleAssistant = reduceAll(
    active,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'assistant-old',
      role: 'assistant',
    }),
  );
  const stale = reduceAll(
    staleAssistant,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-old',
      toolCallName: 'lookup',
    }),
  );
  const sent = reduceAll(
    stale,
    devActions.sendMessage({
      message: { role: 'user', content: 'next' },
      canonicalMessages: [{ id: 'user-2', role: 'user', content: 'next' }],
    }),
  );
  const set = reduceAll(
    stale,
    devActions.setMessages({
      messages: [],
      canonicalMessages: [{ id: 'user-3', role: 'user', content: 'set' }],
    }),
  );
  const resent = reduceAll(stale, devActions.resendMessages());
  const late = reduceAll(
    reduceAll(sent, internalActions.generationAttemptRolledBack()),
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'assistant-old',
      role: 'assistant',
      delta: 'late',
    }),
  );

  expect(sent.agUiMessages.committed.map((message) => message.id)).toEqual([
    'user-1',
    'user-2',
  ]);
  expect(
    sent.messages.messages.map((message) =>
      'id' in message ? message.id : undefined,
    ),
  ).toEqual(['user-1', 'user-2']);
  expect(sent.toolCalls.ids).toEqual([]);
  expect(sent.streamingMessage).toBeDefined();
  expect(
    selectViewMessages(sent).some((message) => message.role === 'assistant'),
  ).toBe(false);
  expect(set.agUiMessages.committed.map((message) => message.id)).toEqual([
    'user-3',
  ]);
  expect(set.messages.messages).toEqual([
    { id: 'user-3', role: 'user', content: 'set' },
  ]);
  expect(resent.agUiMessages.committed).toBe(
    initialized.agUiMessages.committed,
  );
  expect(resent.messages.messages).toBe(initialized.messages.committed);
  expect(resent.toolCalls.ids).toEqual([]);
  expect(late.agUiMessages.committed.map((message) => message.id)).toEqual([
    'user-1',
    'user-2',
  ]);
  expect(
    late.messages.messages.some(
      (message) => 'id' in message && message.id === 'assistant-old',
    ),
  ).toBe(false);
});

test('root commits snapshot-only success without appending a synthetic assistant or stale tools', () => {
  const initialized = reduceAll(
    createState(),
    devActions.init({
      system: '',
      canonicalMessages: [{ id: 'user-1', role: 'user', content: 'first' }],
    }),
  );
  const active = reduceAll(
    reduceAll(
      initialized,
      apiActions.generateMessageStart({ toolsByName: {} }),
    ),
    internalActions.generationAttemptStarted(),
  );
  const snapshotted = reduceAll(
    active,
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [{ id: 'user-2', role: 'user', content: 'replacement' }],
    }),
  );
  const completed = reduceAll(
    snapshotted,
    apiActions.generateMessageSuccess({
      message: { role: 'assistant', content: '', toolCallIds: [] },
      toolCalls: [],
    }),
  );

  expect(completed.agUiMessages.committed).toEqual([
    { id: 'user-2', role: 'user', content: 'replacement' },
  ]);
  expect(completed.messages.messages).toEqual([
    { id: 'user-2', role: 'user', content: 'replacement' },
  ]);
  expect(completed.toolCalls.ids).toEqual([]);
  expect(completed.streamingMessage).toMatchObject({
    message: null,
    attemptActive: false,
  });
});

test('root keeps local generation errors in the view projection only', () => {
  const initialized = reduceAll(
    createState(),
    devActions.init({
      system: '',
      canonicalMessages: [{ id: 'user-1', role: 'user', content: 'first' }],
    }),
  );
  const failed = reduceAll(
    reduceAll(initialized, internalActions.generationAttemptStarted()),
    apiActions.generateMessageError(new Error('transport failed')),
  );

  expect(failed.messages.messages.at(-1)).toEqual({
    role: 'error',
    content: 'transport failed',
  });
  expect(failed.agUiMessages.committed).toEqual([
    { id: 'user-1', role: 'user', content: 'first' },
  ]);
  expect(ɵselectEffectiveCommittedAgUiMessages(failed)).toEqual([
    { id: 'user-1', role: 'user', content: 'first' },
  ]);
});

test('root isolates malformed remote snapshots without reading accessors', () => {
  const initialized = reduceAll(
    createState(),
    devActions.init({
      system: '',
      canonicalMessages: [{ id: 'user-1', role: 'user', content: 'hello' }],
    }),
  );
  const activeStart = reduceAll(
    reduceAll(
      initialized,
      apiActions.generateMessageStart({ toolsByName: {} }),
    ),
    internalActions.generationAttemptStarted(),
  );
  const active = reduceAll(
    activeStart,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'assistant-draft',
      role: 'assistant',
      delta: 'draft',
    }),
  );
  const sparse = new Array(1);
  const accessor = new Array(1);
  let accesses = 0;
  Object.defineProperty(accessor, 0, {
    enumerable: true,
    get: () => {
      accesses += 1;
      return { id: 'unsafe', role: 'user', content: 'unsafe' };
    },
  });
  const malformed = [
    { type: EventType.MESSAGES_SNAPSHOT, messages: {} },
    { type: EventType.MESSAGES_SNAPSHOT, messages: sparse },
    { type: EventType.MESSAGES_SNAPSHOT, messages: accessor },
    {
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        { id: 'duplicate', role: 'user', content: 'one' },
        { id: 'duplicate', role: 'assistant', content: 'two' },
      ],
    },
  ];
  const results = malformed.map((event) =>
    reduceAll(
      active,
      apiActions.generateMessageEvent(event as unknown as AGUIEvent),
    ),
  );
  const accessorResult = results[2];
  if (!accessorResult) {
    throw new Error('Expected accessor snapshot result');
  }
  const valid = reduceAll(
    accessorResult,
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [{ id: 'user-2', role: 'user', content: 'valid' }],
    }),
  );

  for (const result of results) {
    expect(result.agUiMessages.protocolError).toBeInstanceOf(Error);
    expect(result.agUiMessages.draft).toBe(active.agUiMessages.draft);
    expect(result.messages).toBe(active.messages);
    expect(result.toolCalls).toBe(active.toolCalls);
    expect(result.streamingMessage).toBe(active.streamingMessage);
  }
  expect(accesses).toBe(0);
  expect(valid.agUiMessages.protocolError).toBeUndefined();
  expect(valid.messages.messages).toEqual([
    { id: 'user-2', role: 'user', content: 'valid' },
  ]);
});

test('root state-only success preserves canonical messages and committed tool baseline', () => {
  const canonical = [
    {
      id: 'assistant-1',
      role: 'assistant' as const,
      content: '',
      toolCalls: [
        {
          id: 'tool-1',
          type: 'function' as const,
          function: { name: 'lookup', arguments: '{}' },
        },
      ],
    },
  ];
  const initialized = reduceAll(
    createState(),
    devActions.init({ system: '', canonicalMessages: canonical }),
  );
  const active = reduceAll(
    reduceAll(
      initialized,
      apiActions.generateMessageStart({ toolsByName: {} }),
    ),
    internalActions.generationAttemptStarted(),
  );
  const completed = reduceAll(
    active,
    apiActions.generateMessageSuccess({
      message: { role: 'assistant', content: '', toolCallIds: [] },
      toolCalls: [],
    }),
  );

  expect(completed.agUiMessages.committed).toEqual(canonical);
  expect(completed.messages.messages).toBe(initialized.messages.committed);
  expect(completed.toolCalls.entities['tool-1']).toBe(
    initialized.toolCalls.committed.entities['tool-1'],
  );
  expect(completed.streamingMessage).toMatchObject({
    message: null,
    attemptActive: false,
  });
  expect(completed.agUiMessages.attemptActive).toBe(false);
  expect(completed.messages.attemptActive).toBe(false);
  expect(completed.toolCalls.attemptActive).toBe(false);
});

test('createChatRuntime accepts a developer tool named output', () => {
  const createRuntime = () =>
    createChatRuntime({
      system: 'test',
      tools: [
        {
          name: 'output',
          description: 'Return a result',
          schema: s.object('result', { value: s.string('value') }),
          handler: async () => undefined,
        },
      ],
    });

  expect(createRuntime).not.toThrow();
});

test('direct core HTTP configuration is expressed as a transport', () => {
  const runtime = createChatRuntime({ system: 'test' });

  // @ts-expect-error Direct core endpoint configuration has moved to HttpTransport.
  createChatRuntime({ system: 'test', apiUrl: '/alternate-run' });
  // @ts-expect-error Direct core HTTP middleware has moved to HttpTransport.
  runtime.updateOptions({ middleware: [(request) => request] });

  expect(runtime).toBeDefined();
});

test('RUN_STARTED updates the selected thread ID', () => {
  const state = createState();

  const nextState = reduceAll(
    state,
    apiActions.generateMessageEvent({
      type: EventType.RUN_STARTED,
      threadId: 'server-thread',
      runId: 'run-1',
    }),
  );

  expect(selectThreadId(nextState)).toBe('server-thread');
});

test('init and an explicit options update set the current thread identity', () => {
  const state = createState();
  const initializedState = reduceAll(
    state,
    devActions.init({
      canonicalMessages: [],
      system: 'test',
      threadId: 'initial-thread',
    }),
  );

  const nextState = reduceAll(
    initializedState,
    devActions.updateOptions({ threadId: 'next-thread' }),
  );

  expect(selectThreadId(initializedState)).toBe('initial-thread');
  expect(selectThreadId(nextState)).toBe('next-thread');
});

test('an options update without a threadId preserves the current identity', () => {
  const state = reduceAll(
    createState(),
    devActions.init({
      canonicalMessages: [],
      system: 'test',
      threadId: 'current-thread',
    }),
  );

  const nextState = reduceAll(
    state,
    devActions.updateOptions({ system: 'updated' }),
  );

  expect(selectThreadId(nextState)).toBe('current-thread');
});

test('an explicit undefined threadId clears the current identity', () => {
  const state = reduceAll(
    createState(),
    devActions.init({
      canonicalMessages: [],
      system: 'test',
      threadId: 'current-thread',
    }),
  );

  const nextState = reduceAll(
    state,
    devActions.updateOptions({ threadId: undefined }),
  );

  expect(selectThreadId(nextState)).toBeUndefined();
});

test('an explicit empty threadId sets the current identity', () => {
  const state = reduceAll(
    createState(),
    devActions.init({
      canonicalMessages: [],
      system: 'test',
      threadId: 'current-thread',
    }),
  );

  const nextState = reduceAll(
    state,
    devActions.updateOptions({ threadId: '' }),
  );

  expect(selectThreadId(nextState)).toBe('');
});

test('unrelated events preserve the current thread identity', () => {
  const state = reduceAll(
    createState(),
    devActions.init({
      canonicalMessages: [],
      system: 'test',
      threadId: 'current-thread',
    }),
  );

  const nextState = reduceAll(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'message-1',
      role: 'assistant',
    }),
  );

  expect(selectThreadId(nextState)).toBe('current-thread');
});

test('combined state stores only the current thread identity', () => {
  const state = createState();

  const threadState = state.thread;
  const configState = state.config;

  expect(threadState).toEqual({ threadId: undefined });
  expect(configState).not.toHaveProperty('threadId');
});

test('thread load and save API actions are absent', () => {
  const actionNames = [
    'threadLoadStart',
    'threadLoadSuccess',
    'threadLoadFailure',
    'threadSaveStart',
    'threadSaveSuccess',
    'threadSaveFailure',
  ];

  const matchingActions = actionNames.filter((name) => name in apiActions);

  expect(matchingActions).toEqual([]);
});

test('the unified error selector ignores thread persistence errors', () => {
  const state = createState();
  const stateWithPersistenceErrors = {
    ...state,
    thread: {
      ...state.thread,
      loadingThreadError: { error: 'load failed' },
      savingThreadError: { error: 'save failed' },
    },
  };

  const error = selectUnifiedError(stateWithPersistenceErrors);

  expect(error).toBeUndefined();
});

test('the running tool calls selector ignores thread persistence flags', () => {
  const state = reduceAll(
    createState(),
    apiActions.generateMessageSuccess({
      message: {
        role: 'assistant',
        content: '',
        toolCallIds: ['call-1'],
      },
      toolCalls: [
        {
          id: 'call-1',
          name: 'lookup',
          arguments: '{}',
          status: 'pending',
        },
      ],
    }),
  );
  const stateWithPersistenceFlags = {
    ...state,
    thread: {
      ...state.thread,
      isLoadingThread: true,
      isSavingThread: true,
    },
  };

  const isRunningToolCalls = selectIsRunningToolCalls(
    stateWithPersistenceFlags,
  );

  expect(isRunningToolCalls).toBe(true);
});

test('the loading selector ignores thread persistence flags', () => {
  const state = createState();
  const stateWithPersistenceFlags = {
    ...state,
    thread: {
      ...state.thread,
      isLoadingThread: true,
      isSavingThread: true,
    },
  };

  const isLoading = selectIsLoading(stateWithPersistenceFlags);

  expect(isLoading).toBe(false);
});

test('undefined non-clearable options preserve current config values', () => {
  const state = reduceAll(
    createState(),
    devActions.init({
      canonicalMessages: [],
      system: 'initial-system',
      debounce: 250,
      retries: 3,
      ui: true,
    }),
  );

  const nextState = reduceAll(
    state,
    devActions.updateOptions({
      system: undefined,
      debounce: undefined,
      retries: undefined,
      ui: undefined,
    }),
  );

  expect(nextState.config).toMatchObject({
    system: 'initial-system',
    debounce: 250,
    retries: 3,
    ui: true,
  });
});

test('an undefined transport option preserves the current transport', () => {
  const transport = {
    name: 'test-transport',
    send: async () => {
      throw new Error('not used');
    },
  };
  const state = reduceAll(
    createState(),
    devActions.init({ canonicalMessages: [], system: 'test', transport }),
  );

  const nextState = reduceAll(
    state,
    devActions.updateOptions({
      transport: undefined,
    }),
  );

  expect(nextState.config).toHaveProperty('transport', transport);
});

test('public options explicitly clear the current thread identity', () => {
  const runtime = createChatRuntime({
    system: 'test',
    threadId: 'current-thread',
  });

  runtime.updateOptions({ threadId: undefined });

  expect(runtime.threadId()).toBeUndefined();
});

test('devtools state includes only the current thread identity', () => {
  const send = jest.fn();
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      __REDUX_DEVTOOLS_EXTENSION__: {
        connect: () => ({
          error: jest.fn(),
          init: jest.fn(),
          send,
          unsubscribe: jest.fn(),
        }),
      },
    },
  });

  try {
    createChatRuntime({
      debugName: 'thread-identity-test',
      system: 'test',
      threadId: 'devtools-thread',
    });

    const projectedState = send.mock.calls.at(-1)?.[1];

    expect(projectedState).toMatchObject({ threadId: 'devtools-thread' });
    expect(projectedState).not.toHaveProperty('isLoadingThread');
    expect(projectedState).not.toHaveProperty('isSavingThread');
    expect(projectedState).not.toHaveProperty('threadLoadError');
    expect(projectedState).not.toHaveProperty('threadSaveError');
  } finally {
    if (previousWindow) {
      Object.defineProperty(globalThis, 'window', previousWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  }
});

test('runtime reuses one configured-system ID through update and empty clearing', () => {
  const send = jest.fn();
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      __REDUX_DEVTOOLS_EXTENSION__: {
        connect: () => ({
          error: jest.fn(),
          init: jest.fn(),
          send,
          unsubscribe: jest.fn(),
        }),
      },
    },
  });

  try {
    const runtime = createChatRuntime({
      debugName: 'stable-system-id-test',
      system: 'initial',
    });
    const initial = send.mock.calls.at(-1)?.[1].ɵɵinternal.agUiMessages;
    runtime.updateOptions({ system: 'updated' });
    const updated = send.mock.calls.at(-1)?.[1].ɵɵinternal.agUiMessages;
    runtime.updateOptions({ system: '' });
    const cleared = send.mock.calls.at(-1)?.[1].ɵɵinternal.agUiMessages;

    expect(initial.systemMessage).toMatchObject({
      role: 'system',
      content: 'initial',
    });
    expect(updated.systemMessage).toEqual({
      id: initial.systemMessage.id,
      role: 'system',
      content: 'updated',
    });
    expect(cleared.systemMessage).toEqual({
      id: initial.systemMessage.id,
      role: 'system',
      content: '',
    });
    expect(cleared.committed).not.toContainEqual(cleared.systemMessage);
  } finally {
    if (previousWindow) {
      Object.defineProperty(globalThis, 'window', previousWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  }
});

test('runtime falls back when Web Crypto is unavailable or lacks randomUUID', () => {
  const previousCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const send = jest.fn();
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      __REDUX_DEVTOOLS_EXTENSION__: {
        connect: () => ({
          error: jest.fn(),
          init: jest.fn(),
          send,
          unsubscribe: jest.fn(),
        }),
      },
    },
  });

  try {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: undefined,
    });
    const absent = createChatRuntime({
      debugName: 'missing-crypto',
      system: 'first',
    });
    const absentInitial = send.mock.calls.at(-1)?.[1].ɵɵinternal.agUiMessages;
    absent.updateOptions({ system: 'second' });
    const absentUpdated = send.mock.calls.at(-1)?.[1].ɵɵinternal.agUiMessages;

    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {},
    });
    const partial = createChatRuntime({
      debugName: 'partial-crypto',
      system: 'third',
    });
    const partialInitial = send.mock.calls.at(-1)?.[1].ɵɵinternal.agUiMessages;
    partial.updateOptions({ system: '' });
    const partialCleared = send.mock.calls.at(-1)?.[1].ɵɵinternal.agUiMessages;

    expect(absentInitial.systemMessage.id).toEqual(expect.any(String));
    expect(absentUpdated.systemMessage).toEqual({
      id: absentInitial.systemMessage.id,
      role: 'system',
      content: 'second',
    });
    expect(partialInitial.systemMessage.id).toEqual(expect.any(String));
    expect(partialCleared.systemMessage).toEqual({
      id: partialInitial.systemMessage.id,
      role: 'system',
      content: '',
    });
  } finally {
    if (previousCrypto) {
      Object.defineProperty(globalThis, 'crypto', previousCrypto);
    } else {
      Reflect.deleteProperty(globalThis, 'crypto');
    }
    if (previousWindow) {
      Object.defineProperty(globalThis, 'window', previousWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  }
});

test('treats a rejected canonical send preflight as an exact combined-root no-op', () => {
  const initialized = reduceAll(
    createState(),
    devActions.init({
      system: '',
      canonicalMessages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'tool-1',
              type: 'function',
              function: { name: 'lookup', arguments: '' },
            },
          ],
        },
      ],
    }),
  );
  const streaming = reduceAll(
    initialized,
    apiActions.generateMessageStart({ toolsByName: {} }),
  );
  const active = reduceAll(
    streaming,
    internalActions.generationAttemptStarted(),
  );

  const rejected = reduceAll(
    active,
    devActions.sendMessage({
      message: { role: 'user', content: 'next' },
      canonicalMessages: [{ id: 'tool-1', role: 'user', content: 'next' }],
      canonicalAppendCompatible: false,
    }),
  );

  expect(rejected.agUiMessages.committed).toBe(active.agUiMessages.committed);
  expect(rejected.agUiMessages.draft).toBe(active.agUiMessages.draft);
  expect(rejected.agUiMessages).toBe(active.agUiMessages);
  expect(rejected.agentState).toBe(active.agentState);
  expect(rejected.messages).toBe(active.messages);
  expect(rejected.toolCalls).toBe(active.toolCalls);
  expect(rejected.streamingMessage).toBe(active.streamingMessage);
  expect(rejected.status).toBe(active.status);
});

test('runtime keeps local tool-call values lossless through initialization and replacement', () => {
  // Arrange
  const send = jest.fn();
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const pendingArgs = { city: 'Paris' };
  const fulfilledValue = { temp: 20 };
  const rejectedReason = new Error('boom');
  const tools: Chat.AnyTool[] = [
    {
      name: 'forecast',
      description: 'Looks up a forecast.',
      schema: s.object('forecast arguments', { city: s.string('city') }),
      handler: async () => fulfilledValue,
    },
    {
      name: 'unknown',
      description: 'Represents an unavailable tool.',
      schema: s.object('unknown arguments', { city: s.string('city') }),
      handler: async () => undefined,
    },
  ];
  const initialMessages: Chat.Message<string, Chat.AnyTool>[] = [
    {
      role: 'assistant',
      content: 'initial',
      toolCalls: [
        {
          role: 'tool',
          status: 'pending',
          name: 'forecast',
          toolCallId: 'pending-1',
          args: pendingArgs,
        },
        {
          role: 'tool',
          status: 'done',
          name: 'forecast',
          toolCallId: 'fulfilled-1',
          args: { city: 'Paris' },
          result: { status: 'fulfilled', value: fulfilledValue },
        },
        {
          role: 'tool',
          status: 'done',
          name: 'unknown',
          toolCallId: 'rejected-1',
          args: { city: 'Paris' },
          result: { status: 'rejected', reason: rejectedReason },
        },
      ],
    },
    { role: 'error', content: 'local initialization error' },
  ];
  const replacementArgs = { city: 'Rome' };
  const replacementValue = { temp: 24 };
  const replacementReason = new Error('replacement failed');
  const sentArgs = { city: 'Berlin' };
  const replacementMessages: Chat.Message<string, Chat.AnyTool>[] = [
    {
      role: 'assistant',
      content: 'replacement',
      toolCalls: [
        {
          role: 'tool',
          status: 'pending',
          name: 'forecast',
          toolCallId: 'pending-2',
          args: replacementArgs,
        },
        {
          role: 'tool',
          status: 'done',
          name: 'forecast',
          toolCallId: 'fulfilled-2',
          args: replacementArgs,
          result: { status: 'fulfilled', value: replacementValue },
        },
        {
          role: 'tool',
          status: 'done',
          name: 'unknown',
          toolCallId: 'rejected-2',
          args: replacementArgs,
          result: { status: 'rejected', reason: replacementReason },
        },
      ],
    },
  ];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      __REDUX_DEVTOOLS_EXTENSION__: {
        connect: () => ({
          error: jest.fn(),
          init: jest.fn(),
          send,
          unsubscribe: jest.fn(),
        }),
      },
    },
  });

  try {
    // Act
    const runtime = createChatRuntime({
      debugName: 'lossless-local-projection-test',
      system: '',
      messages: initialMessages,
      tools,
    });
    const initial = send.mock.calls.at(-1)?.[1].ɵɵinternal;
    const initialView = runtime.messages();
    runtime.setMessages(replacementMessages);
    const replaced = send.mock.calls.at(-1)?.[1].ɵɵinternal;
    runtime.sendMessage({
      role: 'assistant',
      content: 'sent',
      toolCalls: [
        {
          role: 'tool',
          status: 'pending',
          name: 'forecast',
          toolCallId: 'pending-3',
          args: sentArgs,
        },
      ],
    });
    const sent = send.mock.calls.at(-1)?.[1].ɵɵinternal;

    // Assert
    expect(initial.messages.committed[0]).toMatchObject({
      id: initial.agUiMessages.committed[0]?.id,
      role: 'assistant',
      content: 'initial',
    });
    expect(initial.toolCalls.committed.entities['pending-1']).toMatchObject({
      name: 'forecast',
      argumentsResolved: pendingArgs,
      status: 'pending',
    });
    expect(initial.toolCalls.committed.entities['fulfilled-1']?.result).toEqual(
      { status: 'fulfilled', value: fulfilledValue },
    );
    expect(
      initial.toolCalls.committed.entities['fulfilled-1']?.result?.status ===
        'fulfilled' &&
        initial.toolCalls.committed.entities['fulfilled-1']?.result.value,
    ).toBe(fulfilledValue);
    expect(initial.toolCalls.committed.entities['rejected-1']?.result).toEqual({
      status: 'rejected',
      reason: rejectedReason,
    });
    expect(
      initial.toolCalls.committed.entities['rejected-1']?.result?.status ===
        'rejected' &&
        initial.toolCalls.committed.entities['rejected-1']?.result.reason,
    ).toBe(rejectedReason);
    expect(initial.agUiMessages.committed).toEqual([
      expect.objectContaining({ role: 'assistant', content: 'initial' }),
      expect.objectContaining({ role: 'tool', toolCallId: 'fulfilled-1' }),
      expect.objectContaining({
        role: 'tool',
        toolCallId: 'rejected-1',
        error: 'boom',
      }),
    ]);
    expect(initial.messages.committed).toContainEqual({
      role: 'error',
      content: 'local initialization error',
    });
    expect(initialView[0]).toMatchObject({
      role: 'assistant',
      content: 'initial',
      toolCalls: [
        expect.objectContaining({ args: pendingArgs, status: 'pending' }),
        expect.objectContaining({
          result: { status: 'fulfilled', value: fulfilledValue },
        }),
        expect.objectContaining({
          result: { status: 'rejected', reason: rejectedReason },
        }),
      ],
    });
    const initialAssistant = initialView[0];
    if (initialAssistant?.role !== 'assistant') {
      throw new Error('Expected initialized assistant projection.');
    }
    const initialFulfilled = initialAssistant.toolCalls[1];
    const initialRejected = initialAssistant.toolCalls[2];
    if (
      initialFulfilled?.status !== 'done' ||
      initialRejected?.status !== 'done'
    ) {
      throw new Error('Expected settled initialized tool calls.');
    }
    expect(initialFulfilled.result.status).toBe('fulfilled');
    if (initialFulfilled.result.status === 'fulfilled') {
      expect(initialFulfilled.result.value).toBe(fulfilledValue);
    }
    expect(initialRejected.result.status).toBe('rejected');
    if (initialRejected.result.status === 'rejected') {
      expect(initialRejected.result.reason).toBe(rejectedReason);
    }
    expect(
      initial.agUiMessages.committed.some(
        (message: { role: string }) => message.role === 'error',
      ),
    ).toBe(false);
    expect(initial.agUiMessages.committed[0]?.role).toBe('assistant');
    if (initial.agUiMessages.committed[0]?.role === 'assistant') {
      expect(initial.agUiMessages.committed[0].toolCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'pending-1',
            function: expect.objectContaining({
              arguments: '{"city":"Paris"}',
            }),
          }),
        ]),
      );
    }
    expect(replaced.messages.committed[0]).toMatchObject({
      id: replaced.agUiMessages.committed[0]?.id,
      role: 'assistant',
      content: 'replacement',
    });
    expect(replaced.toolCalls.committed.entities['pending-2']).toMatchObject({
      argumentsResolved: replacementArgs,
      status: 'pending',
    });
    expect(
      replaced.toolCalls.committed.entities['fulfilled-2']?.result?.status ===
        'fulfilled' &&
        replaced.toolCalls.committed.entities['fulfilled-2']?.result.value,
    ).toBe(replacementValue);
    expect(
      replaced.toolCalls.committed.entities['rejected-2']?.result?.status ===
        'rejected' &&
        replaced.toolCalls.committed.entities['rejected-2']?.result.reason,
    ).toBe(replacementReason);
    expect(runtime.messages()[0]).toMatchObject({
      role: 'assistant',
      content: 'replacement',
      toolCalls: [
        expect.objectContaining({ args: replacementArgs, status: 'pending' }),
        expect.objectContaining({
          result: { status: 'fulfilled', value: replacementValue },
        }),
        expect.objectContaining({
          result: { status: 'rejected', reason: replacementReason },
        }),
      ],
    });
    expect(replaced.agUiMessages.committed).toEqual([
      expect.objectContaining({ role: 'assistant', content: 'replacement' }),
      expect.objectContaining({ role: 'tool', toolCallId: 'fulfilled-2' }),
      expect.objectContaining({
        role: 'tool',
        toolCallId: 'rejected-2',
        error: 'replacement failed',
      }),
    ]);
    expect(
      replaced.agUiMessages.committed.some(
        (message: { role: string }) => message.role === 'error',
      ),
    ).toBe(false);
    expect(sent.messages.committed.at(-1)).toMatchObject({
      id: sent.agUiMessages.committed.at(-1)?.id,
      role: 'assistant',
      content: 'sent',
    });
    expect(sent.toolCalls.committed.entities['pending-3']).toMatchObject({
      name: 'forecast',
      argumentsResolved: sentArgs,
      status: 'pending',
    });
    expect(sent.agUiMessages.committed.at(-1)).toMatchObject({
      role: 'assistant',
      content: 'sent',
      toolCalls: [
        expect.objectContaining({
          id: 'pending-3',
          function: expect.objectContaining({ arguments: '{"city":"Berlin"}' }),
        }),
      ],
    });
  } finally {
    if (previousWindow) {
      Object.defineProperty(globalThis, 'window', previousWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  }
});
