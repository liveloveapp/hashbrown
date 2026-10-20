import { EventType, type Message } from '@ag-ui/core';
import {
  applyActivityDelta,
  applyActivitySnapshot,
  readActivityLinks,
} from './ag-ui-activity';

const user: Message = Object.freeze({
  id: 'user-1',
  role: 'user',
  content: 'hello',
});

function seed(
  overrides: { readonly subagentRunId?: string } = {},
): readonly Readonly<Message>[] {
  return applyActivitySnapshot(
    Object.freeze([user]),
    {
      type: EventType.ACTIVITY_SNAPSHOT,
      messageId: 'activity-1',
      activityType: 'plan',
      content: { steps: ['a'] },
      metadata: { source: 'agent' },
      ...overrides,
    },
    { runId: 'run-1', assistantMessageId: 'assistant-1', toolCallId: 'tool-1' },
  );
}

test('a snapshot with a new id appends an activity message with links', () => {
  const messages = Object.freeze([user]);

  const next = applyActivitySnapshot(
    messages,
    {
      type: EventType.ACTIVITY_SNAPSHOT,
      messageId: 'activity-1',
      activityType: 'plan',
      content: { steps: ['a'] },
      subagentRunId: 'sub-1',
    },
    { runId: 'run-1', assistantMessageId: 'assistant-1', toolCallId: 'tool-1' },
  );

  expect(next).toHaveLength(2);
  expect(next[0]).toBe(user);
  expect(next[1]).toEqual({
    id: 'activity-1',
    role: 'activity',
    activityType: 'plan',
    content: { steps: ['a'] },
    subagentRunId: 'sub-1',
    hashbrownLinks: {
      runId: 'run-1',
      assistantMessageId: 'assistant-1',
      toolCallId: 'tool-1',
      subagentRunId: 'sub-1',
    },
  });
  expect(readActivityLinks(next[1])).toEqual({
    runId: 'run-1',
    assistantMessageId: 'assistant-1',
    toolCallId: 'tool-1',
    subagentRunId: 'sub-1',
  });
  expect(readActivityLinks(user)).toBeUndefined();
  expect(Object.isFrozen(next)).toBe(true);
  expect(Object.isFrozen(next[1])).toBe(true);
});

test('a snapshot without replace overwrites content in place and keeps links', () => {
  const messages = Object.freeze([
    ...seed(),
    Object.freeze({ id: 'user-2', role: 'user', content: 'later' } as Message),
  ]);

  const next = applyActivitySnapshot(
    messages,
    {
      type: EventType.ACTIVITY_SNAPSHOT,
      messageId: 'activity-1',
      activityType: 'progress',
      content: { percent: 50 },
      metadata: { step: 2 },
    },
    { runId: 'run-2', assistantMessageId: 'assistant-2', toolCallId: 'tool-2' },
  );

  expect(next.map((message) => message.id)).toEqual([
    'user-1',
    'activity-1',
    'user-2',
  ]);
  expect(next[1]).toEqual({
    id: 'activity-1',
    role: 'activity',
    activityType: 'progress',
    content: { percent: 50 },
    metadata: { source: 'agent', step: 2 },
    hashbrownLinks: {
      runId: 'run-1',
      assistantMessageId: 'assistant-1',
      toolCallId: 'tool-1',
    },
  });
});

test('replace: false keeps content and merges metadata only', () => {
  const messages = seed();

  const next = applyActivitySnapshot(
    messages,
    {
      type: EventType.ACTIVITY_SNAPSHOT,
      messageId: 'activity-1',
      activityType: 'other',
      content: { steps: ['ignored'] },
      replace: false,
      metadata: { step: 2 },
    },
    {},
  );
  const unchanged = applyActivitySnapshot(
    messages,
    {
      type: EventType.ACTIVITY_SNAPSHOT,
      messageId: 'activity-1',
      activityType: 'other',
      content: { steps: ['ignored'] },
      replace: false,
    },
    {},
  );

  expect(next[1]).toMatchObject({
    activityType: 'plan',
    content: { steps: ['a'] },
    metadata: { source: 'agent', step: 2 },
  });
  expect((next[1] as { content: unknown }).content).toBe(
    (messages[1] as { content: unknown }).content,
  );
  expect(unchanged).toBe(messages);
});

test('a replacing snapshot may change subagentRunId', () => {
  const messages = seed({ subagentRunId: 'sub-1' });

  const changed = applyActivitySnapshot(
    messages,
    {
      type: EventType.ACTIVITY_SNAPSHOT,
      messageId: 'activity-1',
      activityType: 'plan',
      content: { steps: ['b'] },
      subagentRunId: 'sub-2',
    },
    {},
  );
  const cleared = applyActivitySnapshot(
    changed,
    {
      type: EventType.ACTIVITY_SNAPSHOT,
      messageId: 'activity-1',
      activityType: 'plan',
      content: { steps: ['c'] },
      replace: true,
    },
    {},
  );

  expect(changed[1]).toMatchObject({ subagentRunId: 'sub-2' });
  expect(readActivityLinks(changed[1])).toEqual({
    runId: 'run-1',
    assistantMessageId: 'assistant-1',
    toolCallId: 'tool-1',
    subagentRunId: 'sub-2',
  });
  expect(cleared[1]).not.toHaveProperty('subagentRunId');
  expect(readActivityLinks(cleared[1])).toEqual({
    runId: 'run-1',
    assistantMessageId: 'assistant-1',
    toolCallId: 'tool-1',
  });
});

test('a delta applies an RFC 6902 patch copy-on-write and freezes the result', () => {
  const messages = seed();
  const before = messages[1] as unknown as {
    readonly content: { readonly steps: readonly string[] };
  };

  const result = applyActivityDelta(messages, {
    type: EventType.ACTIVITY_DELTA,
    messageId: 'activity-1',
    activityType: 'plan',
    patch: [
      { op: 'add', path: '/steps/-', value: 'b' },
      { op: 'add', path: '/done', value: false },
    ],
    metadata: { step: 2 },
  });

  expect(result.dropped).toBeUndefined();
  expect(result.messages[0]).toBe(user);
  expect(result.messages[1]).toEqual({
    id: 'activity-1',
    role: 'activity',
    activityType: 'plan',
    content: { steps: ['a', 'b'], done: false },
    metadata: { source: 'agent', step: 2 },
    hashbrownLinks: {
      runId: 'run-1',
      assistantMessageId: 'assistant-1',
      toolCallId: 'tool-1',
    },
  });
  expect(before.content).toEqual({ steps: ['a'] });
  expect(Object.isFrozen(result.messages)).toBe(true);
  expect(Object.isFrozen(result.messages[1])).toBe(true);
  expect(
    Object.isFrozen(
      (result.messages[1] as unknown as { content: { steps: unknown } }).content
        .steps,
    ),
  ).toBe(true);
});

test('a delta for an unknown id is dropped', () => {
  const messages = seed();

  const unknown = applyActivityDelta(messages, {
    type: EventType.ACTIVITY_DELTA,
    messageId: 'missing',
    activityType: 'plan',
    patch: [{ op: 'add', path: '/x', value: 1 }],
  });
  const notActivity = applyActivityDelta(messages, {
    type: EventType.ACTIVITY_DELTA,
    messageId: 'user-1',
    activityType: 'plan',
    patch: [{ op: 'add', path: '/x', value: 1 }],
  });

  expect(unknown.messages).toBe(messages);
  expect(unknown.dropped).toEqual(expect.stringContaining('missing'));
  expect(notActivity.messages).toBe(messages);
  expect(notActivity.dropped).toEqual(expect.stringContaining('user-1'));
});

test('a delta whose patch fails is dropped but keeps valid metadata', () => {
  const messages = seed();

  const withMetadata = applyActivityDelta(messages, {
    type: EventType.ACTIVITY_DELTA,
    messageId: 'activity-1',
    activityType: 'plan',
    patch: [
      { op: 'add', path: '/steps/-', value: 'b' },
      { op: 'replace', path: '/missing', value: 1 },
    ],
    metadata: { step: 2 },
  });
  const withoutMetadata = applyActivityDelta(messages, {
    type: EventType.ACTIVITY_DELTA,
    messageId: 'activity-1',
    activityType: 'plan',
    patch: [{ op: 'remove', path: '/missing' }],
  });
  const replacedRoot = applyActivityDelta(messages, {
    type: EventType.ACTIVITY_DELTA,
    messageId: 'activity-1',
    activityType: 'plan',
    patch: [{ op: 'replace', path: '', value: ['not', 'an', 'object'] }],
  });

  expect(withMetadata.dropped).toEqual(expect.stringContaining('activity-1'));
  expect(withMetadata.messages[1]).toMatchObject({
    content: { steps: ['a'] },
    metadata: { source: 'agent', step: 2 },
  });
  expect(withoutMetadata.dropped).toEqual(
    expect.stringContaining('activity-1'),
  );
  expect(withoutMetadata.messages).toBe(messages);
  expect(replacedRoot.dropped).toEqual(expect.stringContaining('activity-1'));
  expect(replacedRoot.messages).toBe(messages);
});

test('activity content is deep-frozen', () => {
  const content = { nested: { list: [{ value: 1 }] } };

  const next = applyActivitySnapshot(
    Object.freeze([]),
    {
      type: EventType.ACTIVITY_SNAPSHOT,
      messageId: 'activity-1',
      activityType: 'plan',
      content,
    },
    {},
  );
  content.nested.list[0].value = 2;
  const owned = (
    next[0] as unknown as {
      content: { nested: { list: { value: number }[] } };
    }
  ).content;

  expect(owned.nested.list[0].value).toBe(1);
  expect(Object.isFrozen(owned)).toBe(true);
  expect(Object.isFrozen(owned.nested)).toBe(true);
  expect(Object.isFrozen(owned.nested.list)).toBe(true);
  expect(Object.isFrozen(owned.nested.list[0])).toBe(true);
  expect(Object.isFrozen(readActivityLinks(next[0]))).toBe(true);
});

test('a snapshot cannot take over a non-activity message or tool call id', () => {
  const messages = Object.freeze([
    user,
    Object.freeze({
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: 'tool-1',
          type: 'function',
          function: { name: 'lookup', arguments: '{}' },
        },
      ],
    } as Message),
  ]);

  const takeOverMessage = () =>
    applyActivitySnapshot(
      messages,
      {
        type: EventType.ACTIVITY_SNAPSHOT,
        messageId: 'user-1',
        activityType: 'plan',
        content: {},
      },
      {},
    );
  const takeOverToolCall = () =>
    applyActivitySnapshot(
      messages,
      {
        type: EventType.ACTIVITY_SNAPSHOT,
        messageId: 'tool-1',
        activityType: 'plan',
        content: {},
      },
      {},
    );

  expect(takeOverMessage).toThrow(/user-1/);
  expect(takeOverToolCall).toThrow(/tool-1/);
});
