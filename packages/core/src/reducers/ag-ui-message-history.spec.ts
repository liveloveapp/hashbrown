import { EventType, type Message } from '@ag-ui/core';
import { Chat } from '../models';
import { s } from '../schema';
import {
  applySystemMessageOverlay,
  createSystemMessage,
  lowerViewMessagesToAgUi,
  ownAgUiMessages,
  projectAgUiMessages,
  ɵownValidatedAgUiMessages,
  ɵpairViewMessagesWithAgUi,
  ɵprepareAgUiMessageEvent,
  ɵreadAgUiMessageSnapshot,
  ɵreconcileAgUiMessageProjection,
} from './ag-ui-message-history';

test('reconciles a large unchanged history without searching prior entries per source', () => {
  const messages = Array.from({ length: 256 }, (_, index) => ({
    id: `assistant-${index}`,
    role: 'assistant' as const,
    content: `answer ${index}`,
  }));
  const tools = {};
  const first = ɵreconcileAgUiMessageProjection(undefined, messages, tools);
  const find = jest.spyOn(Array.prototype, 'find');

  try {
    const second = ɵreconcileAgUiMessageProjection(first, messages, tools);

    expect(second.projection.messages).toBe(first.projection.messages);
    expect(second.projection.toolCalls).toBe(first.projection.toolCalls);
    expect(second.entries).toEqual(first.entries);
    expect(find).not.toHaveBeenCalled();
  } finally {
    find.mockRestore();
  }
});

test('owns one contiguous reasoning run before projecting its assistant', () => {
  const reasoning = Array.from({ length: 128 }, (_, index) => ({
    id: `reasoning-${index}`,
    role: 'reasoning' as const,
    content: `step ${index}`,
    metadata: { index },
  }));
  const messages = [
    ...reasoning,
    { id: 'assistant-1', role: 'assistant' as const, content: 'answer' },
  ];

  const projection = ɵreconcileAgUiMessageProjection(undefined, messages, {});
  const entry = projection.entries[0];

  expect(entry?.reasoning).toHaveLength(128);
  expect(Object.isFrozen(entry?.reasoning)).toBe(true);
  expect(entry?.reasoning[0]).toBe(reasoning[0]);
  expect(entry?.message).toMatchObject({
    role: 'assistant',
    reasoning: {
      kind: 'details',
      details: expect.any(Array),
    },
  });
  const details =
    entry?.message.role === 'assistant' &&
    entry.message.reasoning?.kind === 'details'
      ? entry.message.reasoning.details
      : [];
  expect(details[0]).toMatchObject({
    id: 'reasoning-0',
    content: 'step 0',
    metadata: { index: 0 },
  });
  expect(details[127]).toMatchObject({
    id: 'reasoning-127',
    content: 'step 127',
    metadata: { index: 127 },
  });
});

test('normalizes one snapshot into an owned immutable history for every reducer consumer', () => {
  const raw = [
    { id: 'user-1', role: 'user' as const, content: 'hello' },
    { id: 'assistant-1', role: 'assistant' as const, content: 'hi' },
  ];

  const prepared = ɵprepareAgUiMessageEvent({
    type: EventType.MESSAGES_SNAPSHOT,
    messages: raw,
  });
  const snapshot = ɵreadAgUiMessageSnapshot(
    prepared as Extract<
      import('@ag-ui/core').AGUIEvent,
      { type: EventType.MESSAGES_SNAPSHOT }
    >,
  );
  const first = raw[0];
  if (first) first.content = 'mutated';

  expect(ɵreadAgUiMessageSnapshot(prepared as never)).toBe(snapshot);
  expect(snapshot).toEqual([
    { id: 'user-1', role: 'user', content: 'hello' },
    { id: 'assistant-1', role: 'assistant', content: 'hi' },
  ]);
  expect(Object.isFrozen(snapshot)).toBe(true);
  expect(Object.isFrozen(snapshot[0])).toBe(true);
});

test('preserves existing message references when applying a system overlay', () => {
  const messages = ownAgUiMessages([
    { id: 'user-1', role: 'user', content: 'hello' },
    { id: 'assistant-1', role: 'assistant', content: 'hi' },
  ]);

  const effective = applySystemMessageOverlay(
    messages,
    createSystemMessage('system-1', 'system'),
  );

  expect(effective[1]).toBe(messages[0]);
  expect(effective[2]).toBe(messages[1]);
  expect(Object.isFrozen(effective)).toBe(true);
});

test('lowers locally created user messages with stable supplied IDs', () => {
  // Arrange
  const messages = [
    {
      role: 'user' as const,
      content: { prompt: 'What is Hashbrown?' },
    },
  ];
  const createId = jest.fn(() => 'message-1');

  // Act
  const lowered = lowerViewMessagesToAgUi(messages, { createId });

  // Assert
  expect(lowered).toEqual([
    {
      id: 'message-1',
      role: 'user',
      content: '{"prompt":"What is Hashbrown?"}',
    },
  ]);
  expect(createId).toHaveBeenCalledTimes(1);
});

test('lowers assistant turns with tool results and opaque protocol fields', () => {
  // Arrange
  const metadata = { provider: { cursor: 'initial' } };
  const allocatedIds: string[] = [];
  const ids = ['assistant-1', 'reasoning-1', 'tool-result-1', 'tool-result-2'];
  const createId = jest.fn(() => {
    const id = ids[allocatedIds.length];
    if (!id) {
      throw new Error('Unexpected ID allocation.');
    }

    allocatedIds.push(id);
    return id;
  });
  const messages: readonly Chat.AnyMessage[] = [
    {
      role: 'assistant',
      content: { answer: 'Hashbrown' },
      encryptedValue: 'assistant-opaque',
      metadata,
      reasoning: 'consider the framework',
      toolCalls: [
        {
          role: 'tool',
          status: 'done',
          name: 'search',
          toolCallId: 'call-1',
          args: { query: 'Hashbrown' },
          encryptedValue: 'call-opaque',
          metadata: { trace: 'tool-1' },
          result: { status: 'fulfilled', value: { matches: 1 } },
        },
        {
          role: 'tool',
          status: 'done',
          name: 'blocked',
          toolCallId: 'call-2',
          args: { action: 'write' },
          result: { status: 'rejected', reason: 'denied' },
        },
      ],
    },
  ];

  // Act
  const lowered = lowerViewMessagesToAgUi(messages, { createId });
  metadata.provider.cursor = 'mutated';

  // Assert
  expect(lowered).toEqual([
    {
      id: 'reasoning-1',
      role: 'reasoning',
      content: 'consider the framework',
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      content: '{"answer":"Hashbrown"}',
      encryptedValue: 'assistant-opaque',
      metadata: { provider: { cursor: 'initial' } },
      toolCalls: [
        {
          id: 'call-1',
          type: 'function',
          function: {
            name: 'search',
            arguments: '{"query":"Hashbrown"}',
          },
          encryptedValue: 'call-opaque',
          metadata: { trace: 'tool-1' },
        },
        {
          id: 'call-2',
          type: 'function',
          function: { name: 'blocked', arguments: '{"action":"write"}' },
        },
      ],
    },
    {
      id: 'tool-result-1',
      role: 'tool',
      toolCallId: 'call-1',
      content: '{"matches":1}',
    },
    {
      id: 'tool-result-2',
      role: 'tool',
      toolCallId: 'call-2',
      content: 'denied',
      error: 'denied',
    },
  ]);
  expect(allocatedIds).toEqual([
    'assistant-1',
    'reasoning-1',
    'tool-result-1',
    'tool-result-2',
  ]);
  expect(createId).toHaveBeenCalledTimes(4);
  expect(Object.isFrozen(lowered[1]?.metadata)).toBe(true);
});

test('pairs view messages with canonical IDs without shifting across reasoning or tool results', () => {
  // Arrange
  const messages: readonly Chat.AnyMessage[] = [
    { role: 'user', content: 'question' },
    {
      role: 'assistant',
      content: 'answer',
      reasoningDetails: [
        {
          id: 'reasoning-1',
          role: 'reasoning',
          content: 'considered',
        },
      ],
      toolCalls: [
        {
          role: 'tool',
          status: 'done',
          name: 'first',
          toolCallId: 'call-1',
          args: { first: true },
          result: { status: 'fulfilled', value: { one: 1 } },
        },
        {
          role: 'tool',
          status: 'done',
          name: 'second',
          toolCallId: 'call-2',
          args: { second: true },
          result: { status: 'rejected', reason: 'failed' },
        },
      ],
    },
    { role: 'error', content: 'local-only error' },
  ];
  const lowered = lowerViewMessagesToAgUi(messages, {
    createId: jest
      .fn()
      .mockReturnValueOnce('user-1')
      .mockReturnValueOnce('assistant-1')
      .mockReturnValueOnce('tool-result-1')
      .mockReturnValueOnce('tool-result-2'),
  });

  // Act
  const paired = ɵpairViewMessagesWithAgUi(messages, lowered);

  // Assert
  expect(paired.messages).toEqual([
    expect.objectContaining({
      id: 'user-1',
      role: 'user',
      content: 'question',
    }),
    expect.objectContaining({
      id: 'assistant-1',
      role: 'assistant',
      content: 'answer',
      toolCallIds: ['call-1', 'call-2'],
      reasoning: {
        kind: 'details',
        details: [
          {
            id: 'reasoning-1',
            role: 'reasoning',
            content: 'considered',
          },
        ],
      },
    }),
    { role: 'error', content: 'local-only error' },
  ]);
  expect(paired.toolCalls).toEqual([
    expect.objectContaining({
      id: 'call-1',
      argumentsResolved: { first: true },
      result: { status: 'fulfilled', value: { one: 1 } },
    }),
    expect.objectContaining({
      id: 'call-2',
      argumentsResolved: { second: true },
      result: { status: 'rejected', reason: 'failed' },
    }),
  ]);
  expect(lowered).not.toContainEqual(
    expect.objectContaining({ content: 'local-only error' }),
  );
  const assistant = messages[1];
  if (assistant?.role !== 'assistant') {
    throw new Error('Expected assistant fixture.');
  }
  expect(assistant.toolCalls[0]?.args).toEqual({ first: true });
});

test('preserves detailed reasoning identities without generating extra IDs', () => {
  // Arrange
  const createId = jest.fn(() => 'assistant-1');
  const messages: readonly Chat.AnyMessage[] = [
    {
      role: 'assistant',
      content: 'answer',
      reasoningDetails: [
        {
          id: 'reasoning-1',
          role: 'reasoning',
          content: 'first step',
          encryptedValue: 'reasoning-opaque',
          metadata: { provider: 'test' },
        },
      ],
      toolCalls: [],
    },
    { role: 'error', content: 'local-only error' },
  ];

  // Act
  const lowered = lowerViewMessagesToAgUi(messages, { createId });

  // Assert
  expect(lowered).toEqual([
    {
      id: 'reasoning-1',
      role: 'reasoning',
      content: 'first step',
      encryptedValue: 'reasoning-opaque',
      metadata: { provider: 'test' },
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      content: 'answer',
    },
  ]);
  expect(createId).toHaveBeenCalledTimes(1);
  expect(Object.keys(lowered[1] ?? {})).toEqual(['id', 'role', 'content']);
});

test('owns and freezes every canonical field without retaining untrusted prototypes', () => {
  // Arrange
  const future = { nested: ['initial'] };
  const message = Object.assign(Object.create(null), {
    id: 'user-1',
    role: 'user' as const,
    content: 'Hello',
    future,
  }) as Message;

  // Act
  const owned = ownAgUiMessages([message]);
  future.nested[0] = 'mutated';

  // Assert
  expect(owned).toEqual([
    {
      id: 'user-1',
      role: 'user',
      content: 'Hello',
      future: { nested: ['initial'] },
    },
  ]);
  expect(Object.getPrototypeOf(owned[0])).toBeNull();
  expect(Object.isFrozen(owned)).toBe(true);
  expect(Object.isFrozen(owned[0])).toBe(true);
  expect(
    Object.isFrozen((owned[0] as unknown as { future: object }).future),
  ).toBe(true);
});

test('rejects non-array canonical history roots', () => {
  // Arrange
  const roots: readonly unknown[] = [
    null,
    'not a message history',
    { id: 'user-1', role: 'user', content: 'Hello' },
  ];

  // Act
  const own = (root: unknown) => () =>
    ownAgUiMessages(root as readonly Message[]);

  // Assert
  for (const root of roots) {
    expect(own(root)).toThrow('canonical message history must be an array');
  }
});

test('rejects missing IDs and unknown roles with structural diagnostics', () => {
  // Arrange
  const missingId = [{ role: 'user', content: 'Hello' }];
  const unknownRole = [{ id: 'unknown-1', role: 'future', content: 'Hello' }];

  // Act
  const validateMissingId = () =>
    ɵownValidatedAgUiMessages(missingId as unknown as readonly Message[]);
  const validateUnknownRole = () =>
    ɵownValidatedAgUiMessages(unknownRole as unknown as readonly Message[]);

  // Assert
  expect(validateMissingId).toThrow(/message\[0\].*id/i);
  expect(validateUnknownRole).toThrow(/message\[0\].*role/i);
});

test('rejects malformed assistant tool calls with indexed diagnostics', () => {
  // Arrange
  const malformed = [
    {
      id: 'assistant-1',
      role: 'assistant',
      toolCalls: [
        {
          id: 'tool-1',
          type: 'function',
          function: { name: '', arguments: 1 },
        },
      ],
    },
  ];

  // Act
  const validate = () =>
    ɵownValidatedAgUiMessages(malformed as unknown as readonly Message[]);

  // Assert
  expect(validate).toThrow(/message\[0\].*toolCalls/i);
});

test('accepts every installed AG-UI message role and preserves unknown JSON fields', () => {
  // Arrange
  const messages = [
    {
      id: 'tool-result-1',
      role: 'tool' as const,
      toolCallId: 'tool-1',
      content: 'result',
    },
    { id: 'developer-1', role: 'developer' as const, content: 'developer' },
    { id: 'system-1', role: 'system' as const, content: 'system' },
    { id: 'user-1', role: 'user' as const, content: 'user' },
    {
      id: 'reasoning-1',
      role: 'reasoning' as const,
      content: 'reasoning',
      encryptedValue: 'opaque',
    },
    {
      id: 'assistant-1',
      role: 'assistant' as const,
      toolCalls: [
        {
          id: 'tool-1',
          type: 'function' as const,
          function: { name: 'lookup', arguments: '{}' },
        },
      ],
      future: { nested: ['initial'] },
    },
    {
      id: 'activity-1',
      role: 'activity' as const,
      activityType: 'progress',
      content: { complete: false },
    },
  ];

  // Act
  const validated = ɵownValidatedAgUiMessages(messages);
  const sourceAssistant = messages[5];
  if (sourceAssistant?.role !== 'assistant') {
    throw new Error('Expected assistant fixture.');
  }
  sourceAssistant.future.nested[0] = 'mutated';

  // Assert
  expect(validated.map((message) => message.role)).toEqual([
    'tool',
    'developer',
    'system',
    'user',
    'reasoning',
    'assistant',
    'activity',
  ]);
  expect(validated[5]).toMatchObject({ future: { nested: ['initial'] } });
  expect(Object.isFrozen(validated[5])).toBe(true);
  const future = Object.getOwnPropertyDescriptor(
    validated[5] ?? {},
    'future',
  )?.value;
  expect(Object.isFrozen(future as object)).toBe(true);
});

test('rejects canonical fields with exotic prototypes', () => {
  // Arrange
  const message = {
    id: 'user-1',
    role: 'user' as const,
    content: 'Hello',
    future: new Date(),
  } as Message;

  // Act
  const own = () => ownAgUiMessages([message]);

  // Assert
  expect(own).toThrow('only plain objects are JSON-compatible');
});

test('rejects undefined canonical fields below the message root', () => {
  // Arrange
  const topLevel = {
    id: 'user-1',
    role: 'user' as const,
    content: 'Hello',
    future: undefined,
  } as Message;
  const nested = {
    id: 'user-2',
    role: 'user' as const,
    content: 'Hello',
    future: { values: ['valid', undefined] },
  } as Message;

  // Act
  const ownTopLevel = () => ownAgUiMessages([topLevel]);
  const ownNested = () => ownAgUiMessages([nested]);

  // Assert
  expect(ownTopLevel).toThrow('undefined is not JSON-compatible');
  expect(ownNested).toThrow('undefined is not JSON-compatible');
});

test('rejects sparse and extra-property canonical history arrays', () => {
  // Arrange
  const sparseHistory = new Array<Message>(1);
  const extraHistory = [
    { id: 'user-1', role: 'user' as const, content: 'Hello' },
  ];
  Object.defineProperty(extraHistory, 'future', {
    enumerable: true,
    value: 'unsupported',
  });
  const nestedSparse = {
    id: 'user-2',
    role: 'user' as const,
    content: 'Hello',
    future: new Array(1),
  } as Message;

  // Act
  const ownSparseHistory = () => ownAgUiMessages(sparseHistory);
  const ownExtraHistory = () => ownAgUiMessages(extraHistory);
  const ownNestedSparse = () => ownAgUiMessages([nestedSparse]);

  // Assert
  expect(ownSparseHistory).toThrow('sparse arrays are not JSON-compatible');
  expect(ownExtraHistory).toThrow('non-index properties are not supported');
  expect(ownNestedSparse).toThrow('sparse arrays are not JSON-compatible');
});

test('rejects array accessors without invoking untrusted getters', () => {
  // Arrange
  let outerGetterReads = 0;
  const accessorHistory: Message[] = [];
  Object.defineProperty(accessorHistory, '0', {
    enumerable: true,
    get: () => {
      outerGetterReads += 1;
      return { id: 'user-1', role: 'user', content: 'Hello' };
    },
  });
  let nestedGetterReads = 0;
  const accessorValues: unknown[] = [];
  Object.defineProperty(accessorValues, '0', {
    enumerable: true,
    get: () => {
      nestedGetterReads += 1;
      return 'value';
    },
  });
  const nestedAccessor = {
    id: 'user-2',
    role: 'user' as const,
    content: 'Hello',
    future: accessorValues,
  } as Message;

  // Act
  const ownAccessorHistory = () => ownAgUiMessages(accessorHistory);
  const ownNestedAccessor = () => ownAgUiMessages([nestedAccessor]);

  // Assert
  expect(ownAccessorHistory).toThrow('accessors are not supported');
  expect(ownNestedAccessor).toThrow('accessors are not supported');
  expect(outerGetterReads).toBe(0);
  expect(nestedGetterReads).toBe(0);
});

test('inserts an owned system overlay without disturbing protocol order', () => {
  // Arrange
  const system = createSystemMessage('local-system', 'Be concise.');
  const messages: readonly Message[] = [
    { id: 'server-system', role: 'system', content: 'Server policy.' },
    { id: 'developer-1', role: 'developer', content: 'Use tools.' },
    { id: 'user-1', role: 'user', content: 'Hello' },
  ];

  // Act
  const overlaid = applySystemMessageOverlay(messages, system);

  // Assert
  expect(overlaid).toEqual([system, ...messages]);
  expect(overlaid).not.toBe(messages);
  expect(messages).toEqual([
    { id: 'server-system', role: 'system', content: 'Server policy.' },
    { id: 'developer-1', role: 'developer', content: 'Use tools.' },
    { id: 'user-1', role: 'user', content: 'Hello' },
  ]);
});

test('replaces an echoed system overlay in place and clears it by stable ID', () => {
  // Arrange
  const previous = createSystemMessage('local-system', 'Previous prompt.');
  const updated = createSystemMessage(previous.id, 'Updated prompt.');
  const empty = createSystemMessage(previous.id, '');
  const messages: readonly Message[] = [
    { id: 'other-system', role: 'system', content: 'Retained policy.' },
    previous,
    { id: 'developer-1', role: 'developer', content: 'Retained developer.' },
  ];

  // Act
  const overlaid = applySystemMessageOverlay(messages, updated);
  const cleared = applySystemMessageOverlay(messages, empty);

  // Assert
  expect(overlaid).toEqual([
    { id: 'other-system', role: 'system', content: 'Retained policy.' },
    updated,
    { id: 'developer-1', role: 'developer', content: 'Retained developer.' },
  ]);
  expect(overlaid.filter((message) => message.id === updated.id)).toHaveLength(
    1,
  );
  expect(cleared).toEqual([
    { id: 'other-system', role: 'system', content: 'Retained policy.' },
    { id: 'developer-1', role: 'developer', content: 'Retained developer.' },
  ]);
  expect(cleared[0]).toBe(messages[0]);
  expect(cleared[1]).toBe(messages[2]);
  expect(messages).toEqual([
    { id: 'other-system', role: 'system', content: 'Retained policy.' },
    previous,
    { id: 'developer-1', role: 'developer', content: 'Retained developer.' },
  ]);
});

test('deduplicates echoed nonempty system overlays at their first position', () => {
  // Arrange
  const overlay = createSystemMessage('local-system', 'Updated prompt.');
  const firstEcho = createSystemMessage('local-system', 'First stale prompt.');
  const duplicateEcho = createSystemMessage(
    'local-system',
    'Duplicate stale prompt.',
  );
  const otherSystem = createSystemMessage('other-system', 'Retained policy.');
  const developer: Message = {
    id: 'developer-1',
    role: 'developer',
    content: 'Retained developer.',
  };
  const user: Message = { id: 'user-1', role: 'user', content: 'Hello' };
  const messages: readonly Message[] = [
    otherSystem,
    firstEcho,
    developer,
    user,
    duplicateEcho,
  ];

  // Act
  const overlaid = applySystemMessageOverlay(messages, overlay);

  // Assert
  expect(overlaid).toEqual([otherSystem, overlay, developer, user]);
  expect(overlaid.filter((message) => message.id === overlay.id)).toHaveLength(
    1,
  );
  expect(overlaid[0]).toBe(otherSystem);
  expect(overlaid[2]).toBe(developer);
  expect(overlaid[3]).toBe(user);
  expect(messages).toEqual([
    otherSystem,
    firstEcho,
    developer,
    user,
    duplicateEcho,
  ]);
});

test('projects canonical messages into typed messages and stitched tool calls', () => {
  // Arrange
  const responseSchema = s.object('answer', { answer: s.string('answer') });
  const tool = {
    name: 'search',
    description: 'Search documents.',
    schema: s.object('search input', { query: s.string('query') }),
    handler: async () => undefined,
  };
  const messages: readonly Message[] = [
    { id: 'system-1', role: 'system', content: 'System context.' },
    { id: 'developer-1', role: 'developer', content: 'Developer context.' },
    {
      id: 'activity-1',
      role: 'activity',
      activityType: 'progress',
      content: { phase: 'searching' },
    },
    {
      id: 'user-1',
      role: 'user',
      content: 'Find documentation.',
      metadata: { source: 'web' },
      encryptedValue: 'user-opaque',
    },
    {
      id: 'reasoning-1',
      role: 'reasoning',
      content: 'I should search.',
      metadata: { provider: 'test' },
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      content: '{"answer":"Found it."}',
      encryptedValue: 'assistant-opaque',
      metadata: { model: 'test' },
      toolCalls: [
        {
          id: 'call-1',
          type: 'function',
          function: { name: 'search', arguments: '{"query":"Hashbrown"}' },
          encryptedValue: 'call-opaque',
          metadata: { trace: 'trace-1' },
        },
        {
          id: 'call-2',
          type: 'function',
          function: { name: 'search', arguments: '{"query":"denied"}' },
        },
      ],
    },
    {
      id: 'tool-1',
      role: 'tool',
      toolCallId: 'call-1',
      content: '{"matches":1}',
    },
    {
      id: 'tool-2',
      role: 'tool',
      toolCallId: 'call-2',
      content: 'denied',
      error: 'denied',
    },
  ];

  // Act
  const projection = projectAgUiMessages(
    messages,
    { search: tool },
    responseSchema,
  );

  // Assert
  expect(projection.messages).toEqual([
    {
      id: 'user-1',
      role: 'user',
      content: 'Find documentation.',
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      content: '{"answer":"Found it."}',
      contentResolved: { answer: 'Found it.' },
      encryptedValue: 'assistant-opaque',
      metadata: { model: 'test' },
      toolCallIds: ['call-1', 'call-2'],
      reasoning: {
        kind: 'details',
        details: [
          {
            id: 'reasoning-1',
            role: 'reasoning',
            content: 'I should search.',
            metadata: { provider: 'test' },
          },
        ],
      },
    },
  ]);
  expect(projection.toolCalls).toEqual([
    {
      id: 'call-1',
      name: 'search',
      arguments: '{"query":"Hashbrown"}',
      argumentsResolved: { query: 'Hashbrown' },
      encryptedValue: 'call-opaque',
      metadata: { trace: 'trace-1' },
      status: 'done',
      result: { status: 'fulfilled', value: '{"matches":1}' },
    },
    {
      id: 'call-2',
      name: 'search',
      arguments: '{"query":"denied"}',
      argumentsResolved: { query: 'denied' },
      status: 'done',
      result: { status: 'rejected', reason: 'denied' },
    },
  ]);
});

test('treats inherited registry names as unregistered tools', () => {
  // Arrange
  const messages: readonly Message[] = [
    {
      id: 'assistant-1',
      role: 'assistant',
      content: 'Calling inherited names.',
      toolCalls: ['toString', 'constructor', '__proto__'].map(
        (name, index) => ({
          id: `call-${index + 1}`,
          type: 'function' as const,
          function: { name, arguments: '{}' },
        }),
      ),
    },
  ];
  const toolsByName: Record<string, Chat.Internal.Tool> = {};

  // Act
  const project = () => projectAgUiMessages(messages, toolsByName);

  // Assert
  expect(project).not.toThrow();
  expect(project()).toMatchObject({
    toolCalls: [
      { id: 'call-1', name: 'toString', arguments: '{}', status: 'pending' },
      {
        id: 'call-2',
        name: 'constructor',
        arguments: '{}',
        status: 'pending',
      },
      {
        id: 'call-3',
        name: '__proto__',
        arguments: '{}',
        status: 'pending',
      },
    ],
  });
});

test('folds only contiguous reasoning into the next assistant projection', () => {
  // Arrange
  const messages: readonly Message[] = [
    { id: 'reasoning-1', role: 'reasoning', content: 'first' },
    { id: 'assistant-1', role: 'assistant', content: 'one' },
    { id: 'reasoning-2', role: 'reasoning', content: 'discarded by user' },
    { id: 'user-1', role: 'user', content: 'next' },
    { id: 'assistant-2', role: 'assistant', content: 'two' },
    { id: 'reasoning-3', role: 'reasoning', content: 'third' },
    { id: 'assistant-3', role: 'assistant', content: 'three' },
    { id: 'reasoning-4', role: 'reasoning', content: 'trailing' },
  ];

  // Act
  const projection = projectAgUiMessages(messages, {});

  // Assert
  expect(projection.messages).toEqual([
    {
      id: 'assistant-1',
      role: 'assistant',
      content: 'one',
      toolCallIds: [],
      reasoning: {
        kind: 'details',
        details: [{ id: 'reasoning-1', role: 'reasoning', content: 'first' }],
      },
    },
    { id: 'user-1', role: 'user', content: 'next' },
    { id: 'assistant-2', role: 'assistant', content: 'two', toolCallIds: [] },
    {
      id: 'assistant-3',
      role: 'assistant',
      content: 'three',
      toolCallIds: [],
      reasoning: {
        kind: 'details',
        details: [{ id: 'reasoning-3', role: 'reasoning', content: 'third' }],
      },
    },
  ]);
});
