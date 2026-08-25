import { EventType } from '@ag-ui/core';
import { apiActions, devActions } from '../actions';
import { fryHashbrown } from '../hashbrown';
import { Chat } from '../models';
import { s } from '../schema';
import {
  reducers,
  selectIsLoading,
  selectIsRunningToolCalls,
  selectThreadId,
  selectUnifiedError,
  selectViewMessages,
} from './index';

const initAction = { type: '@@init' } as const;

function createState() {
  return {
    config: reducers.config(undefined, initAction),
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
    messages: reducers.messages(state.messages, action),
    status: reducers.status(state.status, action),
    streamingMessage: reducers.streamingMessage(state.streamingMessage, action),
    toolCalls: reducers.toolCalls(state.toolCalls, action),
    tools: reducers.tools(state.tools, action),
    thread: reducers.thread(state.thread, action),
  };
}

test('selectViewMessages uses output tool arguments in emulated mode', () => {
  const responseSchema = s.object('output', { text: s.string('text') });

  let state = createState();

  state = reduceAll(
    state,
    devActions.init({
      model: 'test-model',
      system: 'test',
      responseSchema,
      emulateStructuredOutput: true,
    }),
  );

  const outputToolCall: Chat.Internal.ToolCall = {
    id: 'call-output',
    name: 'output',
    arguments: '{"text":"hello"}',
    argumentsResolved: { text: 'hello' },
    status: 'pending',
  };

  const assistantMessage: Chat.Internal.AssistantMessage = {
    role: 'assistant',
    content: '',
    toolCallIds: [outputToolCall.id],
  };

  state = reduceAll(
    state,
    apiActions.generateMessageSuccess({
      message: assistantMessage,
      toolCalls: [outputToolCall],
    }),
  );

  const messages = selectViewMessages(state);
  const assistant = messages.find((message) => message.role === 'assistant');

  expect(assistant?.content).toEqual({ text: 'hello' });
});

test('selectViewMessages uses streaming output tool arguments', () => {
  const responseSchema = s.object('output', {
    text: s.streaming.string('text'),
  });
  const toolsByName: Record<string, Chat.Internal.Tool> = {
    output: {
      name: 'output',
      description: '',
      schema: responseSchema,
      handler: async () => undefined,
    },
  };

  let state = createState();

  state = reduceAll(
    state,
    devActions.init({
      model: 'test-model',
      system: 'test',
      responseSchema,
      emulateStructuredOutput: true,
    }),
  );

  state = reduceAll(
    state,
    apiActions.generateMessageStart({
      responseSchema,
      emulateStructuredOutput: true,
      toolsByName,
    }),
  );

  state = reduceAll(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'call-output',
      toolCallName: 'output',
      parentMessageId: 'message-1',
    }),
  );

  state = reduceAll(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'call-output',
      delta: '{"text":"he',
    }),
  );

  state = reduceAll(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'call-output',
      delta: 'llo"}',
    }),
  );

  const messages = selectViewMessages(state);
  const assistant = messages.find((message) => message.role === 'assistant');

  expect(assistant?.content).toEqual({ text: 'hello' });
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
      model: 'test-model',
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
      model: 'test-model',
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
      model: 'test-model',
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
      model: 'test-model',
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
      model: 'test-model',
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
      model: 'initial-model',
      system: 'initial-system',
      debounce: 250,
      emulateStructuredOutput: true,
      retries: 3,
      ui: true,
    }),
  );

  const nextState = reduceAll(
    state,
    devActions.updateOptions({
      model: undefined,
      system: undefined,
      debounce: undefined,
      emulateStructuredOutput: undefined,
      retries: undefined,
      ui: undefined,
    }),
  );

  expect(nextState.config).toMatchObject({
    model: 'initial-model',
    system: 'initial-system',
    debounce: 250,
    emulateStructuredOutput: true,
    retries: 3,
    ui: true,
  });
});

test('undefined clearable options clear current config values', () => {
  const middleware: Chat.Middleware = (request) => request;
  const transport = {
    name: 'test-transport',
    send: async () => {
      throw new Error('not used');
    },
  };
  const state = reduceAll(
    createState(),
    devActions.init({
      apiUrl: 'https://example.test',
      model: 'test-model',
      system: 'test',
      middleware: [middleware],
      structuredOutput: { mode: 'json' },
      transport,
    }),
  );

  const nextState = reduceAll(
    state,
    devActions.updateOptions({
      apiUrl: undefined,
      middleware: undefined,
      structuredOutput: undefined,
      transport: undefined,
    }),
  );

  expect(nextState.config).toHaveProperty('apiUrl', undefined);
  expect(nextState.config).toHaveProperty('middleware', undefined);
  expect(nextState.config).toHaveProperty('structuredOutput', undefined);
  expect(nextState.config).toHaveProperty('transport', undefined);
});

test('public options explicitly clear the current thread identity', () => {
  const hashbrown = fryHashbrown({
    model: 'test-model',
    system: 'test',
    threadId: 'current-thread',
  });

  hashbrown.updateOptions({ threadId: undefined });

  expect(hashbrown.threadId()).toBeUndefined();
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
    fryHashbrown({
      debugName: 'thread-identity-test',
      model: 'test-model',
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
