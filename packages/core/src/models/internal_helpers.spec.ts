import { type ReasoningMessage } from '@ag-ui/core';
import { Chat } from './index';
import {
  type AnyTool,
  type AssistantMessage as ViewAssistantMessage,
} from './view.models';
import {
  toApiMessagesFromInternal,
  toInternalMessagesFromApi,
  toInternalMessagesFromView,
  toInternalToolCallsFromApiMessages,
  toInternalToolCallsFromView,
  toViewMessagesFromInternal,
} from './internal_helpers';

function viewAssistant(
  reasoning?: string,
  reasoningDetails?: readonly Readonly<ReasoningMessage>[],
): ViewAssistantMessage<string, AnyTool> {
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
