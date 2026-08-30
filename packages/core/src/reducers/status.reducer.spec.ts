import { type AGUIEvent, EventType } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import { Chat } from '../models';
import { createStore } from '../utils/micro-ngrx';
import {
  reducers as rootReducers,
  selectIsLoading,
  selectIsRunningToolCalls,
  selectMessagesState,
  selectStatusState,
  selectStreamingMessageState,
  selectToolCallsState,
  selectUnifiedError,
} from './index';
import { initialState as initialStreamingMessageState } from './streaming-message.reducer';
import { initialStatusState, reducer } from './status.reducer';

const initAction = { type: '@@init' } as const;
const generationSilentlyRetiredAction =
  internalActions.generationSilentlyRetired();

function createRootState() {
  return {
    config: rootReducers.config(undefined, initAction),
    messages: rootReducers.messages(undefined, initAction),
    status: rootReducers.status(undefined, initAction),
    streamingMessage: rootReducers.streamingMessage(undefined, initAction),
    toolCalls: rootReducers.toolCalls(undefined, initAction),
    tools: rootReducers.tools(undefined, initAction),
    thread: rootReducers.thread(undefined, initAction),
  };
}

function createRootStore() {
  return createStore({ reducers: rootReducers, effects: [] });
}

function reduceRoot(
  state: ReturnType<typeof createRootState>,
  action: { type: string },
) {
  return {
    config: rootReducers.config(state.config, action),
    messages: rootReducers.messages(state.messages, action),
    status: rootReducers.status(state.status, action),
    streamingMessage: rootReducers.streamingMessage(
      state.streamingMessage,
      action,
    ),
    toolCalls: rootReducers.toolCalls(state.toolCalls, action),
    tools: rootReducers.tools(state.tools, action),
    thread: rootReducers.thread(state.thread, action),
  };
}

test('marks generation active from an AG-UI run start event', () => {
  const state = {
    ...initialStatusState,
    isSending: true,
    generatingError: new Error('previous failure'),
  };

  const next = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.RUN_STARTED,
      threadId: 'thread-1',
      runId: 'run-1',
    }),
  );

  expect(next).toEqual({
    ...state,
    isSending: false,
    isReceiving: true,
    isGenerating: true,
    generatingError: undefined,
  });
});

test('marks generation active from AG-UI chunk events', () => {
  const state = {
    ...initialStatusState,
    isReceiving: false,
    isGenerating: false,
  };

  const next = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'message-1',
      delta: 'hello',
    }),
  );

  expect(next).toEqual({
    ...state,
    isReceiving: true,
    isGenerating: true,
  });
});

test('marks generation active from every AG-UI reasoning lifecycle event', () => {
  const state = {
    ...initialStatusState,
    isReceiving: false,
    isGenerating: false,
  };
  const events: AGUIEvent[] = [
    {
      type: EventType.REASONING_START,
      messageId: 'reasoning-group-1',
    },
    {
      type: EventType.REASONING_MESSAGE_START,
      messageId: 'reasoning-1',
      role: 'reasoning' as const,
    },
    {
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: 'reasoning-1',
      delta: 'Analysis',
    },
    {
      type: EventType.REASONING_ENCRYPTED_VALUE,
      subtype: 'message' as const,
      entityId: 'reasoning-1',
      encryptedValue: 'opaque',
    },
    {
      type: EventType.REASONING_MESSAGE_END,
      messageId: 'reasoning-1',
    },
    {
      type: EventType.REASONING_END,
      messageId: 'reasoning-group-1',
    },
  ];

  const nextStates = events.map((event) =>
    reducer(state, apiActions.generateMessageEvent(event)),
  );

  for (const next of nextStates) {
    expect(next).toEqual({
      ...state,
      isReceiving: true,
      isGenerating: true,
    });
  }
});

test('ignores AG-UI events unrelated to generation status', () => {
  const state = initialStatusState;

  const next = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.STATE_SNAPSHOT,
      snapshot: { ignored: true },
    }),
  );

  expect(next).toBe(state);
});

test('marks a continuing tool settlement as sending', () => {
  const next = reducer(
    initialStatusState,
    internalActions.toolTurnSettled({
      toolCalls: [],
      toolMessages: [],
      continuation: 'continue',
    }),
  );

  expect(next.isSending).toBe(true);
});

test('keeps a stopped tool settlement idle', () => {
  const next = reducer(
    initialStatusState,
    internalActions.toolTurnSettled({
      toolCalls: [],
      toolMessages: [],
      continuation: 'stop',
    }),
  );

  expect(next.isSending).toBe(false);
});

test('preserves a superseding user turn sending state', () => {
  const next = reducer(
    { ...initialStatusState, isSending: true },
    internalActions.toolTurnSettled({
      toolCalls: [],
      toolMessages: [],
      continuation: 'stop',
    }),
  );

  expect(next.isSending).toBe(true);
});

test('silent retirement returns a pending generation to idle', () => {
  const store = createRootStore();
  store.dispatch(
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );
  const status = store.read(selectStatusState);
  const wasLoading = store.read(selectIsLoading);
  const committedMessages = store.read(selectMessagesState);
  const committedToolCalls = store.read(selectToolCallsState);

  store.dispatch(generationSilentlyRetiredAction);

  expect(status.isSending).toBe(true);
  expect(wasLoading).toBe(true);
  expect(store.read(selectStatusState)).toEqual({
    ...status,
    isSending: false,
    isReceiving: false,
    isGenerating: false,
  });
  expect(store.read(selectIsLoading)).toBe(false);
  expect(store.read(selectMessagesState)).toBe(committedMessages);
  expect(store.read(selectToolCallsState)).toBe(committedToolCalls);
});

test('silent retirement clears active streaming state without changing committed state', () => {
  const store = createRootStore();
  store.dispatch(
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );
  store.dispatch(
    apiActions.generateMessageStart({
      emulateStructuredOutput: false,
      toolsByName: {},
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.RUN_STARTED,
      threadId: 'thread-1',
      runId: 'run-1',
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'message-1',
      role: 'assistant',
      delta: 'partial',
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'call-1',
      toolCallName: 'lookup',
      parentMessageId: 'message-1',
      delta: '{"query":"par',
    }),
  );
  const status = store.read(selectStatusState);
  const wasLoading = store.read(selectIsLoading);
  const streamingMessage = store.read(selectStreamingMessageState);
  const committedMessages = store.read(selectMessagesState);
  const committedToolCalls = store.read(selectToolCallsState);

  store.dispatch(generationSilentlyRetiredAction);

  expect(status).toMatchObject({
    isSending: false,
    isReceiving: true,
    isGenerating: true,
  });
  expect(wasLoading).toBe(true);
  expect(streamingMessage.message?.content).toBe('partial');
  expect(streamingMessage.toolCalls).toHaveLength(1);
  expect(store.read(selectStatusState)).toEqual({
    ...status,
    isSending: false,
    isReceiving: false,
    isGenerating: false,
  });
  expect(store.read(selectIsLoading)).toBe(false);
  expect(store.read(selectStreamingMessageState)).toBe(
    initialStreamingMessageState,
  );
  expect(store.read(selectMessagesState)).toBe(committedMessages);
  expect(store.read(selectToolCallsState)).toBe(committedToolCalls);
});

test('clears prestart errors when a retry starts and succeeds', () => {
  const prestartError = new Error('request failed before start');
  let state = reducer(
    initialStatusState,
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );
  state = reducer(state, apiActions.generateMessageError(prestartError));

  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.RUN_STARTED,
      threadId: 'thread-1',
      runId: 'run-2',
    }),
  );

  expect(state).toMatchObject({
    isSending: false,
    isReceiving: true,
    isGenerating: true,
    sendingError: undefined,
    generatingError: undefined,
    error: undefined,
  });

  state = reducer(
    state,
    apiActions.generateMessageSuccess({
      message: { role: 'assistant', content: 'Hello', toolCallIds: [] },
      toolCalls: [],
    }),
  );

  expect(state.sendingError).toBeUndefined();
});

test('clears an active-run server error when a retry starts', () => {
  const serverError = new Error('server failed');
  let state = reducer(
    initialStatusState,
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.RUN_STARTED,
      threadId: 'thread-1',
      runId: 'run-1',
    }),
  );
  state = reducer(state, apiActions.generateMessageError(serverError));

  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.RUN_STARTED,
      threadId: 'thread-1',
      runId: 'run-2',
    }),
  );

  expect(state).toMatchObject({
    isSending: false,
    isReceiving: true,
    isGenerating: true,
    sendingError: undefined,
    generatingError: undefined,
    error: undefined,
  });
});

test('retry success clears unified error and enables pending tool calls', () => {
  const toolCall: Chat.Internal.ToolCall = {
    id: 'call-1',
    name: 'lookup',
    arguments: '{}',
    status: 'pending',
  };
  let state = createRootState();
  state = reduceRoot(
    state,
    devActions.sendMessage({ message: { role: 'user', content: 'Hi' } }),
  );
  state = reduceRoot(
    state,
    apiActions.generateMessageError(new Error('request failed before start')),
  );
  state = reduceRoot(
    state,
    apiActions.generateMessageEvent({
      type: EventType.RUN_STARTED,
      threadId: 'thread-1',
      runId: 'run-2',
    }),
  );

  state = reduceRoot(
    state,
    apiActions.generateMessageSuccess({
      message: {
        role: 'assistant',
        content: '',
        toolCallIds: [toolCall.id],
      },
      toolCalls: [toolCall],
    }),
  );

  expect(selectUnifiedError(state)).toBeUndefined();
  expect(selectIsRunningToolCalls(state)).toBe(true);
});
