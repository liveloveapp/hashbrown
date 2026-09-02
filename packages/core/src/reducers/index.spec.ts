import { type AGUIEvent, EventType } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import { createChatRuntime } from '../chat-runtime';
import { s } from '../schema';
import {
  reducers,
  selectIsLoading,
  selectIsRunningToolCalls,
  selectThreadId,
  selectUnifiedError,
  selectViewMessages,
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

test('combined view replaces a snapshotted assistant with matching streaming ID', () => {
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
        { id: 'assistant-1', role: 'assistant', content: 'snapshot' },
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

  expect(selectViewMessages(streamed)).toEqual([
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: ' stream', toolCalls: [] },
  ]);
  expect(
    selectViewMessages(streamed).filter(
      (message) => message.role === 'assistant',
    ),
  ).toHaveLength(1);
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
