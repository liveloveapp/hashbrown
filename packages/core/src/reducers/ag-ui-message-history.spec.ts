import type { Message } from '@ag-ui/core';
import { Chat } from '../models';
import { s } from '../schema';
import {
  applySystemMessageOverlay,
  createSystemMessage,
  lowerViewMessagesToAgUi,
  ownAgUiMessages,
  projectAgUiMessages,
} from './ag-ui-message-history';

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
