import { type ReasoningMessage } from '@ag-ui/core';
import { Chat } from './index';
import { s } from '../schema';
import {
  type AnyTool,
  type AssistantMessage as ViewAssistantMessage,
  type AssistantMessageInput as ViewAssistantMessageInput,
} from './view.models';
import {
  toApiMessagesFromInternal,
  toInternalMessagesFromApi,
  toInternalMessagesFromView,
  toInternalToolCallsFromApiMessages,
  toInternalToolCallsFromView,
  toViewMessagesFromInternal,
  ɵwithInternalMessageId,
} from './internal_helpers';

test('attaches canonical IDs to a fresh internal projection', () => {
  // Arrange
  const message: Chat.Internal.UserMessage = {
    role: 'user',
    content: 'Hello',
  };

  // Act
  const identified = ɵwithInternalMessageId(message, 'user-1');

  // Assert
  expect(identified).toEqual({ id: 'user-1', role: 'user', content: 'Hello' });
  expect(identified).not.toBe(message);
  expect(message).toEqual({ role: 'user', content: 'Hello' });
});

test('view messages expose the canonical id of user and assistant messages', () => {
  // Arrange
  const user: Chat.Internal.UserMessage = {
    id: 'user-1',
    role: 'user',
    content: 'Hello',
  };
  const assistant: Chat.Internal.AssistantMessage = {
    id: 'assistant-1',
    role: 'assistant',
    content: 'Hi',
    toolCallIds: [],
  };
  const error: Chat.Internal.ErrorMessage = {
    id: 'error-1',
    role: 'error',
    content: 'Failed',
  };

  // Act
  const [userView] = toViewMessagesFromInternal(user, {}, []);
  const [assistantView] = toViewMessagesFromInternal(assistant, {}, []);
  const [errorView] = toViewMessagesFromInternal(error, {}, []);

  // Assert
  expect(userView).toEqual({ id: 'user-1', role: 'user', content: 'Hello' });
  expect(assistantView).toMatchObject({ id: 'assistant-1', role: 'assistant' });
  expect(errorView).toEqual({ role: 'error', content: 'Failed' });
});

function viewAssistant(
  reasoning?: string,
  reasoningDetails?: readonly Readonly<ReasoningMessage>[],
): ViewAssistantMessageInput<string, AnyTool> {
  return {
    role: 'assistant',
    content: 'answer',
    toolCalls: [],
    ...(reasoning !== undefined ? { reasoning } : {}),
    ...(reasoningDetails !== undefined ? { reasoningDetails } : {}),
  };
}

test('hydrates visible reasoning from details and isolates nested metadata', () => {
  // Arrange
  const metadata = { nested: { value: 'original' } };
  const message = viewAssistant('stale display reasoning', [
    {
      id: 'r-1',
      role: 'reasoning',
      content: 'step one',
      metadata,
    },
    {
      id: 'r-2',
      role: 'reasoning',
      content: '',
      encryptedValue: 'opaque',
    },
    {
      id: 'r-3',
      role: 'reasoning',
      content: 'step two',
    },
  ]);

  // Act
  const [internal] = toInternalMessagesFromView(message);
  metadata.nested.value = 'mutated';
  const [view] = toViewMessagesFromInternal(internal, {}, []);

  // Assert
  expect(view).toEqual(
    viewAssistant('step one\n\nstep two', [
      {
        id: 'r-1',
        role: 'reasoning',
        content: 'step one',
        metadata: { nested: { value: 'original' } },
      },
      {
        id: 'r-2',
        role: 'reasoning',
        content: '',
        encryptedValue: 'opaque',
      },
      {
        id: 'r-3',
        role: 'reasoning',
        content: 'step two',
      },
    ]),
  );
});

test('preserves display-only empty reasoning as an own property', () => {
  // Arrange
  const message = viewAssistant('');

  // Act
  const [internal] = toInternalMessagesFromView(message);
  const [view] = toViewMessagesFromInternal(internal, {}, []);

  // Assert
  expect(view).toEqual(viewAssistant(''));
  expect(Object.hasOwn(view, 'reasoning')).toBe(true);
  expect((view as ViewAssistantMessage<string, AnyTool>).reasoning).toBe('');
  expect(view).not.toHaveProperty('reasoningDetails');
});

test('round-trips complete ordered reasoning details through API messages', () => {
  // Arrange
  const details: readonly Readonly<ReasoningMessage>[] = [
    {
      id: 'r-1',
      role: 'reasoning',
      content: 'step one',
      encryptedValue: 'opaque',
      subagentRunId: 'subagent-1',
      metadata: {
        continuation: {
          cursor: 'cursor-1',
          checkpoints: [
            { token: 'checkpoint-1' },
            { token: 'checkpoint-2', state: { complete: false } },
          ],
        },
      },
    },
  ];
  const message = viewAssistant('stale display reasoning', details);
  const [internal] = toInternalMessagesFromView(message);

  // Act
  const [api] = toApiMessagesFromInternal(internal, []);
  const [roundTrippedInternal] = toInternalMessagesFromApi(api);
  const [view] = toViewMessagesFromInternal(roundTrippedInternal, {}, []);

  // Assert
  expect(view).toEqual(viewAssistant('step one', details));
});

test('preserves all-opaque reasoning details without visible reasoning', () => {
  // Arrange
  const details: readonly Readonly<ReasoningMessage>[] = [
    {
      id: 'r-1',
      role: 'reasoning',
      content: '',
      encryptedValue: 'opaque-1',
    },
    {
      id: 'r-2',
      role: 'reasoning',
      content: '',
      encryptedValue: 'opaque-2',
      subagentRunId: 'subagent-2',
    },
  ];
  const message = viewAssistant('stale display reasoning', details);

  // Act
  const [internal] = toInternalMessagesFromView(message);
  const [view] = toViewMessagesFromInternal(internal, {}, []);

  // Assert
  expect(view).toEqual(viewAssistant(undefined, details));
  expect(view).not.toHaveProperty('reasoning');
});

test('prefers empty reasoning details over stale display reasoning', () => {
  // Arrange
  const message = viewAssistant('stale display reasoning', []);

  // Act
  const [internal] = toInternalMessagesFromView(message);
  const [view] = toViewMessagesFromInternal(internal, {}, []);

  // Assert
  expect(view).toEqual(viewAssistant(undefined, []));
  expect(view).not.toHaveProperty('reasoning');
});

test('isolates reasoning details at view, API, and internal boundaries', () => {
  // Arrange
  const message = viewAssistant(undefined, [
    {
      id: 'r-1',
      role: 'reasoning',
      content: 'step one',
      metadata: { nested: { value: 'original' } },
    },
  ]);
  const [internal] = toInternalMessagesFromView(message);
  const [api] = toApiMessagesFromInternal(internal, []);
  const [view] = toViewMessagesFromInternal(internal, {}, []);

  // Act
  const viewDetail = message.reasoningDetails?.[0];
  const apiDetail =
    api.role === 'assistant' ? api.reasoningDetails?.[0] : undefined;
  const viewMetadata = viewDetail?.metadata?.['nested'] as { value: string };
  const apiMetadata = apiDetail?.metadata?.['nested'] as { value: string };
  viewMetadata.value = 'view mutation';
  apiMetadata.value = 'API mutation';
  const [rehydratedInternal] = toInternalMessagesFromApi(api);
  apiMetadata.value = 'second API mutation';
  const [rehydratedView] = toViewMessagesFromInternal(
    rehydratedInternal,
    {},
    [],
  );

  // Assert
  expect(view).toEqual(
    viewAssistant('step one', [
      {
        id: 'r-1',
        role: 'reasoning',
        content: 'step one',
        metadata: { nested: { value: 'original' } },
      },
    ]),
  );
  expect(rehydratedView).toEqual(
    viewAssistant('step one', [
      {
        id: 'r-1',
        role: 'reasoning',
        content: 'step one',
        metadata: { nested: { value: 'API mutation' } },
      },
    ]),
  );
});

test('omits reasoning fields when they are absent', () => {
  // Arrange
  const message = viewAssistant();

  // Act
  const [internal] = toInternalMessagesFromView(message);
  const [api] = toApiMessagesFromInternal(internal, []);
  const [view] = toViewMessagesFromInternal(internal, {}, []);

  // Assert
  expect(api).not.toHaveProperty('reasoning');
  expect(api).not.toHaveProperty('reasoningDetails');
  expect(view).not.toHaveProperty('reasoning');
  expect(view).not.toHaveProperty('reasoningDetails');
});

test('round-trips assistant and tool-call encrypted values through API messages', () => {
  // Arrange
  const message: Chat.Internal.AssistantMessage = {
    role: 'assistant',
    content: '',
    encryptedValue: 'assistant-opaque',
    toolCallIds: ['call-1'],
  };
  const toolCall: Chat.Internal.ToolCall = {
    id: 'call-1',
    name: 'search',
    arguments: '{"query":"hashbrown"}',
    argumentsResolved: { query: 'hashbrown' },
    encryptedValue: 'tool-opaque',
    status: 'done',
    result: { status: 'fulfilled', value: { matches: 1 } },
  };

  // Act
  const apiMessages = toApiMessagesFromInternal(message, [toolCall]);
  const apiAssistant = apiMessages[0];
  if (apiAssistant?.role !== 'assistant') {
    throw new Error('Expected an API assistant message.');
  }
  const [roundTrippedMessage] = toInternalMessagesFromApi(apiAssistant);
  const [roundTrippedToolCall] =
    toInternalToolCallsFromApiMessages(apiMessages);

  // Assert
  expect(apiAssistant.encryptedValue).toBe('assistant-opaque');
  expect(apiAssistant.toolCalls?.[0]?.encryptedValue).toBe('tool-opaque');
  expect(roundTrippedMessage).toMatchObject({
    role: 'assistant',
    encryptedValue: 'assistant-opaque',
  });
  expect(roundTrippedToolCall).toMatchObject({
    id: 'call-1',
    encryptedValue: 'tool-opaque',
    status: 'done',
  });
});

test('round-trips assistant and tool-call encrypted values through view messages', () => {
  // Arrange
  const message: Chat.Internal.AssistantMessage = {
    role: 'assistant',
    content: '',
    encryptedValue: 'assistant-opaque',
    toolCallIds: ['call-pending', 'call-done'],
  };
  const pendingToolCall: Chat.Internal.ToolCall = {
    id: 'call-pending',
    name: 'search',
    arguments: '{"query":"hashbrown"}',
    argumentsResolved: { query: 'hashbrown' },
    encryptedValue: 'pending-tool-opaque',
    status: 'pending',
  };
  const doneToolCall: Chat.Internal.ToolCall = {
    id: 'call-done',
    name: 'search',
    arguments: '{"query":"ag-ui"}',
    argumentsResolved: { query: 'ag-ui' },
    encryptedValue: 'done-tool-opaque',
    status: 'done',
    result: { status: 'fulfilled', value: { matches: 1 } },
  };
  const tool: Chat.AnyTool = {
    name: 'search',
    description: 'Search records.',
    schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
    handler: async () => undefined,
  };

  // Act
  const [view] = toViewMessagesFromInternal(
    message,
    {
      'call-pending': pendingToolCall,
      'call-done': doneToolCall,
    },
    [tool],
  );
  if (view?.role !== 'assistant') {
    throw new Error('Expected a view assistant message.');
  }
  const [roundTrippedMessage] = toInternalMessagesFromView(view);
  const [roundTrippedPendingToolCall, roundTrippedDoneToolCall] =
    toInternalToolCallsFromView([view]);

  // Assert
  expect(view.encryptedValue).toBe('assistant-opaque');
  expect(view.toolCalls[0]?.encryptedValue).toBe('pending-tool-opaque');
  expect(view.toolCalls[1]?.encryptedValue).toBe('done-tool-opaque');
  expect(roundTrippedMessage).toMatchObject({
    role: 'assistant',
    encryptedValue: 'assistant-opaque',
  });
  expect(roundTrippedPendingToolCall).toMatchObject({
    id: 'call-pending',
    encryptedValue: 'pending-tool-opaque',
    status: 'pending',
  });
  expect(roundTrippedDoneToolCall).toMatchObject({
    id: 'call-done',
    encryptedValue: 'done-tool-opaque',
    status: 'done',
  });
});

test('omits assistant and tool-call encrypted values when absent', () => {
  // Arrange
  const message: Chat.Internal.AssistantMessage = {
    role: 'assistant',
    content: '',
    toolCallIds: ['call-1'],
  };
  const toolCall: Chat.Internal.ToolCall = {
    id: 'call-1',
    name: 'search',
    arguments: '{}',
    status: 'pending',
  };

  // Act
  const [api] = toApiMessagesFromInternal(message, [toolCall]);

  // Assert
  expect(api).not.toHaveProperty('encryptedValue');
  expect(api?.role === 'assistant' && api.toolCalls?.[0]).not.toHaveProperty(
    'encryptedValue',
  );
});

test('preserves and isolates assistant and tool-call metadata through API messages', () => {
  // Arrange
  const assistantMetadata = { google: { runId: 'run-1' } };
  const toolMetadata = { google: { steps: [{ index: 1 }] } };
  const message = {
    role: 'assistant',
    content: '',
    toolCallIds: ['call-1'],
    metadata: assistantMetadata,
  } as Chat.Internal.AssistantMessage & {
    metadata: Record<string, unknown>;
  };
  const toolCall: Chat.Internal.ToolCall = {
    id: 'call-1',
    name: 'search',
    arguments: '{}',
    status: 'pending',
    metadata: toolMetadata,
  };

  // Act
  const [api] = toApiMessagesFromInternal(message, [toolCall]);
  if (api?.role !== 'assistant') {
    throw new Error('Expected an API assistant message.');
  }
  const apiAssistant = api as Chat.Api.AssistantMessage & {
    metadata?: Record<string, unknown>;
  };
  const [sourceToolStep] = toolMetadata.google.steps;
  if (!sourceToolStep) {
    throw new Error('Expected source tool metadata step.');
  }
  assistantMetadata.google.runId = 'source mutation';
  sourceToolStep.index = 99;
  const [roundTrippedMessage] = toInternalMessagesFromApi(apiAssistant);
  const [roundTrippedToolCall] = toInternalToolCallsFromApiMessages([api]);
  const apiGoogle = apiAssistant.metadata?.['google'] as {
    runId: string;
  };
  const apiToolGoogle = apiAssistant.toolCalls?.[0]?.metadata?.['google'] as {
    steps: { index: number }[];
  };
  if (apiGoogle) {
    apiGoogle.runId = 'API mutation';
  }
  if (apiToolGoogle) {
    const [apiToolStep] = apiToolGoogle.steps;
    if (!apiToolStep) {
      throw new Error('Expected API tool metadata step.');
    }
    apiToolStep.index = 100;
  }

  // Assert
  expect(roundTrippedMessage).toMatchObject({
    role: 'assistant',
    metadata: { google: { runId: 'run-1' } },
  });
  expect(roundTrippedToolCall).toMatchObject({
    id: 'call-1',
    metadata: { google: { steps: [{ index: 1 }] } },
  });
});

test('preserves and isolates assistant and tool-call metadata through view messages', () => {
  // Arrange
  const assistantMetadata = { google: { runId: 'run-1' } };
  const pendingMetadata = { google: { steps: [{ index: 1 }] } };
  const doneMetadata = { google: { steps: [{ index: 2 }] } };
  const message = {
    role: 'assistant',
    content: '',
    toolCallIds: ['call-pending', 'call-done'],
    metadata: assistantMetadata,
  } as Chat.Internal.AssistantMessage & {
    metadata: Record<string, unknown>;
  };
  const pendingToolCall: Chat.Internal.ToolCall = {
    id: 'call-pending',
    name: 'search',
    arguments: '{}',
    argumentsResolved: {},
    status: 'pending',
    metadata: pendingMetadata,
  };
  const doneToolCall: Chat.Internal.ToolCall = {
    id: 'call-done',
    name: 'search',
    arguments: '{}',
    argumentsResolved: {},
    status: 'done',
    result: { status: 'fulfilled', value: 'done' },
    metadata: doneMetadata,
  };
  const tool: Chat.AnyTool = {
    name: 'search',
    description: 'Search records.',
    schema: { type: 'object', properties: {} },
    handler: async () => undefined,
  };

  // Act
  const [view] = toViewMessagesFromInternal(
    message,
    {
      'call-pending': pendingToolCall,
      'call-done': doneToolCall,
    },
    [tool],
  );
  if (view?.role !== 'assistant') {
    throw new Error('Expected a view assistant message.');
  }
  const viewAssistantMessage = view as typeof view & {
    metadata?: Record<string, unknown>;
  };
  const viewToolCalls = viewAssistantMessage.toolCalls as Array<
    (typeof viewAssistantMessage.toolCalls)[number] & {
      metadata?: Record<string, unknown>;
    }
  >;
  const [sourcePendingStep] = pendingMetadata.google.steps;
  const [sourceDoneStep] = doneMetadata.google.steps;
  if (!sourcePendingStep || !sourceDoneStep) {
    throw new Error('Expected source view metadata steps.');
  }
  assistantMetadata.google.runId = 'source mutation';
  sourcePendingStep.index = 99;
  sourceDoneStep.index = 100;
  const [roundTrippedMessage] =
    toInternalMessagesFromView(viewAssistantMessage);
  const [roundTrippedPending, roundTrippedDone] = toInternalToolCallsFromView([
    viewAssistantMessage,
  ]);
  const viewGoogle = viewAssistantMessage.metadata?.['google'] as {
    runId: string;
  };
  const viewPendingGoogle = viewToolCalls[0]?.metadata?.['google'] as {
    steps: { index: number }[];
  };
  const viewDoneGoogle = viewToolCalls[1]?.metadata?.['google'] as {
    steps: { index: number }[];
  };
  if (viewGoogle) {
    viewGoogle.runId = 'view mutation';
  }
  if (viewPendingGoogle) {
    const [viewPendingStep] = viewPendingGoogle.steps;
    if (!viewPendingStep) {
      throw new Error('Expected pending view metadata step.');
    }
    viewPendingStep.index = 101;
  }
  if (viewDoneGoogle) {
    const [viewDoneStep] = viewDoneGoogle.steps;
    if (!viewDoneStep) {
      throw new Error('Expected done view metadata step.');
    }
    viewDoneStep.index = 102;
  }

  // Assert
  expect(roundTrippedMessage).toMatchObject({
    role: 'assistant',
    metadata: { google: { runId: 'run-1' } },
  });
  expect(roundTrippedPending).toMatchObject({
    id: 'call-pending',
    metadata: { google: { steps: [{ index: 1 }] } },
  });
  expect(roundTrippedDone).toMatchObject({
    id: 'call-done',
    metadata: { google: { steps: [{ index: 2 }] } },
  });
});

test('omits assistant and tool-call metadata when absent', () => {
  // Arrange
  const message: Chat.Internal.AssistantMessage = {
    role: 'assistant',
    content: '',
    toolCallIds: ['call-1'],
  };
  const toolCall: Chat.Internal.ToolCall = {
    id: 'call-1',
    name: 'search',
    arguments: '{}',
    status: 'pending',
  };

  // Act
  const [api] = toApiMessagesFromInternal(message, [toolCall]);
  if (api?.role !== 'assistant') {
    throw new Error('Expected an API assistant message.');
  }

  // Assert
  expect(api).not.toHaveProperty('metadata');
  expect(api.toolCalls?.[0]).not.toHaveProperty('metadata');
});

test('preserves a developer tool call named output', () => {
  const message: Chat.Api.AssistantMessage = {
    role: 'assistant',
    content: '',
    toolCalls: [
      {
        id: 'call-output',
        index: 0,
        type: 'function',
        function: {
          name: 'output',
          arguments: '{"value":"result"}',
        },
      },
    ],
  };

  const toolCalls = toInternalToolCallsFromApiMessages([message]);
  const [internalMessage] = toInternalMessagesFromApi(message);

  expect(toolCalls).toEqual([
    {
      id: 'call-output',
      name: 'output',
      arguments: '{"value":"result"}',
      argumentsResolved: undefined,
      status: 'pending',
    },
  ]);
  expect(internalMessage).toEqual({
    role: 'assistant',
    content: '',
    contentResolved: undefined,
    toolCallIds: ['call-output'],
  });
});

test('includes a developer tool named output in API history', () => {
  const message: Chat.Internal.AssistantMessage = {
    role: 'assistant',
    content: '',
    toolCallIds: ['call-output'],
  };
  const toolCall: Chat.Internal.ToolCall = {
    id: 'call-output',
    name: 'output',
    arguments: '{"value":"result"}',
    argumentsResolved: { value: 'result' },
    status: 'pending',
  };

  const [apiMessage] = toApiMessagesFromInternal(message, [toolCall]);

  expect(apiMessage).toEqual({
    role: 'assistant',
    content: '',
    toolCalls: [
      {
        id: 'call-output',
        index: 0,
        type: 'function',
        function: {
          name: 'output',
          arguments: '{"value":"result"}',
        },
      },
    ],
  });
});

function internalAssistantWithCalls(
  toolCallIds: string[],
): Chat.Internal.AssistantMessage {
  return { role: 'assistant', content: '', toolCallIds };
}

const lookupTool: AnyTool = {
  name: 'lookup',
  description: '',
  schema: s.object('arguments', { q: s.string('q') }),
  handler: async () => undefined,
};

test('projects an unregistered pending tool call to serverToolCalls with its partial arguments', () => {
  // Arrange
  const message = internalAssistantWithCalls(['call-render']);
  const toolCalls: Record<string, Chat.Internal.ToolCall> = {
    'call-render': {
      id: 'call-render',
      name: 'render',
      arguments: '{"text":"Cedar',
      argumentsResolved: { text: 'Cedar' },
      status: 'pending',
    },
  };

  // Act
  const [view] = toViewMessagesFromInternal(message, toolCalls, [lookupTool]);

  // Assert
  expect(view).toEqual(
    expect.objectContaining({
      role: 'assistant',
      toolCalls: [],
      serverToolCalls: [
        {
          toolCallId: 'call-render',
          name: 'render',
          status: 'inProgress',
          args: { text: 'Cedar' },
        },
      ],
    }),
  );
});

test('projects a completed unregistered tool call as executing, then complete with its result', () => {
  // Arrange
  const message = internalAssistantWithCalls(['call-render']);
  const executing: Record<string, Chat.Internal.ToolCall> = {
    'call-render': {
      id: 'call-render',
      name: 'render',
      arguments: '{"text":"hi"}',
      argumentsResolved: { text: 'hi' },
      argumentsComplete: true,
      status: 'pending',
      progress: 0.5,
    },
  };
  const complete: Record<string, Chat.Internal.ToolCall> = {
    'call-render': {
      ...executing['call-render'],
      status: 'done',
      result: { status: 'fulfilled', value: '{"rendered":true}' },
      metadata: { trace: 'abc' },
    },
  };

  // Act
  const [executingView] = toViewMessagesFromInternal(message, executing, []);
  const [completeView] = toViewMessagesFromInternal(message, complete, []);

  // Assert
  expect(
    (executingView as ViewAssistantMessage<string, AnyTool>).serverToolCalls,
  ).toEqual([
    {
      toolCallId: 'call-render',
      name: 'render',
      status: 'executing',
      args: { text: 'hi' },
      progress: 0.5,
    },
  ]);
  expect(
    (completeView as ViewAssistantMessage<string, AnyTool>).serverToolCalls,
  ).toEqual([
    {
      toolCallId: 'call-render',
      name: 'render',
      status: 'complete',
      args: { text: 'hi' },
      result: { status: 'fulfilled', value: '{"rendered":true}' },
      progress: 0.5,
      metadata: { trace: 'abc' },
    },
  ]);
});

test('keeps registered tool calls in toolCalls and omits serverToolCalls when there are none', () => {
  // Arrange
  const message = internalAssistantWithCalls(['call-lookup']);
  const toolCalls: Record<string, Chat.Internal.ToolCall> = {
    'call-lookup': {
      id: 'call-lookup',
      name: 'lookup',
      arguments: '{"q":"x"}',
      argumentsResolved: { q: 'x' },
      status: 'pending',
    },
  };

  // Act
  const [view] = toViewMessagesFromInternal(message, toolCalls, [lookupTool]);

  // Assert
  expect((view as ViewAssistantMessage<string, AnyTool>).toolCalls).toEqual([
    expect.objectContaining({ name: 'lookup', status: 'pending' }),
  ]);
  expect(view).not.toHaveProperty('serverToolCalls');
});

test('an unregistered call with no parsed arguments yet exposes null args', () => {
  // Arrange
  const message = internalAssistantWithCalls(['call-render']);
  const toolCalls: Record<string, Chat.Internal.ToolCall> = {
    'call-render': {
      id: 'call-render',
      name: 'render',
      arguments: '{"te',
      status: 'pending',
    },
  };

  // Act
  const [view] = toViewMessagesFromInternal(message, toolCalls, []);

  // Assert
  expect(
    (view as ViewAssistantMessage<string, AnyTool>).serverToolCalls,
  ).toEqual([
    {
      toolCallId: 'call-render',
      name: 'render',
      status: 'inProgress',
      args: null,
    },
  ]);
});

test('view and internal conversions keep activity messages and API conversion drops them', () => {
  // Arrange
  const view: Chat.ActivityMessage = {
    role: 'activity',
    id: 'activity-1',
    activityType: 'plan',
    content: { steps: ['search', 'answer'] },
    metadata: { source: 'agent' },
    links: {
      runId: 'run-1',
      assistantMessageId: 'assistant-1',
      toolCallId: 'call-1',
      subagentRunId: 'subagent-1',
    },
  };

  // Act
  const internal = toInternalMessagesFromView(view);
  const roundTripped = internal.flatMap((message) =>
    toViewMessagesFromInternal(message, {}, []),
  );
  const api = internal.flatMap((message) =>
    toApiMessagesFromInternal(message, []),
  );

  // Assert
  expect(internal).toEqual([view]);
  expect(roundTripped).toEqual([view]);
  expect(api).toEqual([]);
});

function stepCall(
  step: Record<string, unknown>,
  extra: Partial<Chat.Internal.ToolCall> = {},
): Record<string, Chat.Internal.ToolCall> {
  return {
    'call-ws': {
      id: 'call-ws',
      name: 'web_search',
      arguments: '{"q":"x"}',
      argumentsResolved: { q: 'x' },
      argumentsComplete: true,
      status: 'pending',
      metadata: { 'b4.step': { v: 1, kind: 'server', ...step } },
      ...extra,
    },
  };
}

function serverCallsOf(
  toolCalls: Record<string, Chat.Internal.ToolCall>,
  tools: AnyTool[] = [],
) {
  const [view] = toViewMessagesFromInternal(
    internalAssistantWithCalls(['call-ws']),
    toolCalls,
    tools,
  );
  return (view as ViewAssistantMessage<string, AnyTool>).serverToolCalls;
}

test('a completed step gives outcome success with label and sources', () => {
  // Arrange
  const sources = [
    { id: 's1', kind: 'url', title: 'A', href: 'https://a.test' },
  ];
  const toolCalls = stepCall(
    {
      kind: 'provider',
      builtin: 'web_search',
      status: 'completed',
      label: "Searched 'x' · 1 source",
      icon: 'search',
      queries: ['x'],
      sources,
      startedAt: 100,
      settledAt: 250,
      parentToolCallId: 'parent',
    },
    {
      status: 'done',
      result: { status: 'fulfilled', value: 'ok' },
      arrivedAt: 90,
    },
  );

  // Act
  const [call] = serverCallsOf(toolCalls) ?? [];

  // Assert
  expect(call).toEqual(
    expect.objectContaining({
      status: 'complete',
      outcome: 'success',
      label: "Searched 'x' · 1 source",
      icon: 'search',
      kind: 'provider',
      builtin: 'web_search',
      queries: ['x'],
      sources,
      parentToolCallId: 'parent',
      timing: { startedAt: 100, settledAt: 250 },
      result: { status: 'fulfilled', value: 'ok' },
    }),
  );
});

test('timing falls back to the arrival time and is omitted when nothing is known', () => {
  // Arrange
  const running = stepCall({ status: 'running' }, { arrivedAt: 77 });
  const unknown = stepCall({ status: 'running' });

  // Act
  const [withArrival] = serverCallsOf(running) ?? [];
  const [without] = serverCallsOf(unknown) ?? [];

  // Assert
  expect(withArrival.timing).toEqual({ startedAt: 77 });
  expect(withArrival).not.toHaveProperty('outcome');
  expect(without).not.toHaveProperty('timing');
});

test('a failed step completes the call with a rejected result', () => {
  // Arrange
  const toolCalls = stepCall({
    status: 'failed',
    error: { message: 'boom' },
  });

  // Act
  const [call] = serverCallsOf(toolCalls) ?? [];

  // Assert
  expect(call.status).toBe('complete');
  expect(call.outcome).toBe('failure');
  expect(call.error).toEqual({ message: 'boom' });
  expect(call.result).toEqual({
    status: 'rejected',
    reason: { message: 'boom' },
  });
});

test('a later successful result never un-fails a failed step', () => {
  // Arrange
  const toolCalls = stepCall(
    { status: 'failed', error: { message: 'boom' } },
    { status: 'done', result: { status: 'fulfilled', value: 'late' } },
  );

  // Act
  const [call] = serverCallsOf(toolCalls) ?? [];

  // Assert
  expect(call.outcome).toBe('failure');
  expect(call.result).toEqual({
    status: 'rejected',
    reason: { message: 'boom' },
  });
});

test('a denied step without a result completes with no result', () => {
  // Arrange
  const toolCalls = stepCall({ status: 'denied' });

  // Act
  const [call] = serverCallsOf(toolCalls) ?? [];

  // Assert
  expect(call.status).toBe('complete');
  expect(call.outcome).toBe('denied');
  expect(call).not.toHaveProperty('result');
});

test('a cancelled step without a result completes with no result', () => {
  // Arrange
  const toolCalls = stepCall({ status: 'cancelled' });

  // Act
  const [call] = serverCallsOf(toolCalls) ?? [];

  // Assert
  expect(call.status).toBe('complete');
  expect(call.outcome).toBe('cancelled');
  expect(call).not.toHaveProperty('result');
});

test('a provider step is server-run even when a client tool shares its name', () => {
  // Arrange
  const clientTool: AnyTool = {
    name: 'web_search',
    description: '',
    schema: s.object('arguments', { q: s.string('q') }),
    handler: async () => undefined,
  };
  const provider = stepCall({ kind: 'provider', status: 'running' });
  const server = stepCall({ kind: 'server', status: 'running' });

  // Act
  const providerCalls = serverCallsOf(provider, [clientTool]);
  const serverCalls = serverCallsOf(server, [clientTool]);

  // Assert
  expect(providerCalls).toHaveLength(1);
  expect(serverCalls).toBeUndefined();
  const [view] = toViewMessagesFromInternal(
    internalAssistantWithCalls(['call-ws']),
    provider,
    [clientTool],
  );
  expect((view as ViewAssistantMessage<string, AnyTool>).toolCalls).toEqual([]);
});

test('hydrating a provider call does not resolve its arguments against a client schema', () => {
  // Arrange
  const clientTool = {
    name: 'web_search',
    description: '',
    schema: s.object('arguments', { q: s.string('q') }),
    handler: async () => undefined,
  };
  const apiMessages: Chat.Api.Message[] = [
    {
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: 'call-ws',
          index: 0,
          type: 'function',
          function: { name: 'web_search', arguments: '{"other":1}' },
          metadata: {
            'b4.step': { v: 1, kind: 'provider', status: 'running' },
          },
        },
      ],
    },
  ];

  // Act
  const calls = toInternalToolCallsFromApiMessages(apiMessages, {
    web_search: clientTool,
  });

  // Assert
  expect(calls[0].argumentsResolved).toEqual({ other: 1 });
});

test('the ag-ui-langgraph error sentinel reads as a failure', () => {
  // Arrange
  const toolCalls: Record<string, Chat.Internal.ToolCall> = {
    'call-ws': {
      id: 'call-ws',
      name: 'render',
      arguments: '{}',
      argumentsComplete: true,
      status: 'done',
      result: { status: 'rejected', reason: 'error' },
    },
  };

  // Act
  const [call] = serverCallsOf(toolCalls) ?? [];

  // Assert
  expect(call.outcome).toBe('failure');
  expect(call.error).toEqual({ message: 'error' });
  expect(call.status).toBe('complete');
});

test('any error string on a call without a step reads as a failure', () => {
  // Arrange
  const toolCalls: Record<string, Chat.Internal.ToolCall> = {
    'call-ws': {
      id: 'call-ws',
      name: 'render',
      arguments: '{}',
      argumentsComplete: true,
      status: 'done',
      result: { status: 'rejected', reason: 'Rate limited' },
    },
  };

  // Act
  const [call] = serverCallsOf(toolCalls) ?? [];

  // Assert
  expect(call.outcome).toBe('failure');
  expect(call.error).toEqual({ message: 'Rate limited' });
  expect(call.result).toEqual({ status: 'rejected', reason: 'Rate limited' });
  expect(call.status).toBe('complete');
});

test('an empty error string on a call without a step gives no outcome', () => {
  // Arrange
  const toolCalls: Record<string, Chat.Internal.ToolCall> = {
    'call-ws': {
      id: 'call-ws',
      name: 'render',
      arguments: '{}',
      argumentsComplete: true,
      status: 'done',
      result: { status: 'rejected', reason: '' },
    },
  };

  // Act
  const [call] = serverCallsOf(toolCalls) ?? [];

  // Assert
  expect(call).not.toHaveProperty('outcome');
  expect(call).not.toHaveProperty('error');
  expect(call.result).toEqual({ status: 'rejected', reason: '' });
});

test('calls without a step keep todays fields only', () => {
  // Arrange
  const toolCalls: Record<string, Chat.Internal.ToolCall> = {
    'call-ws': {
      id: 'call-ws',
      name: 'render',
      arguments: '{"a":1}',
      argumentsResolved: { a: 1 },
      argumentsComplete: true,
      status: 'pending',
      arrivedAt: 5,
    },
  };

  // Act
  const calls = serverCallsOf(toolCalls);

  // Assert
  expect(calls).toEqual([
    {
      toolCallId: 'call-ws',
      name: 'render',
      status: 'executing',
      args: { a: 1 },
    },
  ]);
});

test('lowering a call that carries arrivedAt leaves the key out of the API messages', () => {
  // Arrange
  const message = internalAssistantWithCalls(['call-ws']);
  const toolCalls: Chat.Internal.ToolCall[] = [
    {
      id: 'call-ws',
      name: 'lookup',
      arguments: '{"q":"x"}',
      argumentsResolved: { q: 'x' },
      status: 'done',
      result: { status: 'fulfilled', value: 'ok' },
      arrivedAt: 1234,
    },
  ];

  // Act
  const api = toApiMessagesFromInternal(message, toolCalls);

  // Assert
  expect(JSON.stringify(api)).not.toContain('arrivedAt');
});

test('assistant messages expose b4.answer citations and call-less sources', () => {
  // Arrange
  const message: Chat.Internal.AssistantMessage = {
    id: 'assistant-1',
    role: 'assistant',
    content: 'Answer',
    toolCallIds: [],
    metadata: {
      'b4.answer': {
        v: 1,
        citations: [{ sourceId: 's1', quote: 'cited text', block: 0 }],
        sources: [
          { id: 's1', kind: 'url', title: 'Site', href: 'https://a.b' },
        ],
        attribution: [
          {
            provider: 'google',
            kind: 'search-suggestions',
            html: '<div/>',
            mustRender: true,
          },
        ],
      },
    },
  };
  const plain: Chat.Internal.AssistantMessage = {
    id: 'assistant-2',
    role: 'assistant',
    content: 'Plain',
    toolCallIds: [],
  };

  // Act
  const [view] = toViewMessagesFromInternal(message, {}, []);
  const [plainView] = toViewMessagesFromInternal(plain, {}, []);

  // Assert
  expect(view).toMatchObject({
    citations: [{ sourceId: 's1', quote: 'cited text', block: 0 }],
    sources: [{ id: 's1', kind: 'url', title: 'Site', href: 'https://a.b' }],
    attribution: [
      {
        provider: 'google',
        kind: 'search-suggestions',
        html: '<div/>',
        mustRender: true,
      },
    ],
  });
  expect(plainView).not.toHaveProperty('citations');
  expect(plainView).not.toHaveProperty('sources');
  expect(plainView).not.toHaveProperty('attribution');
});
