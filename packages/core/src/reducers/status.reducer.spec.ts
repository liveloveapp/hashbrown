import { EventType } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import { Chat } from '../models';
import {
  reducers as rootReducers,
  selectIsRunningToolCalls,
  selectUnifiedError,
} from './index';
import { initialStatusState, reducer } from './status.reducer';

const initAction = { type: '@@init' } as const;

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
