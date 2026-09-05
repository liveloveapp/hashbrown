import { type AGUIEvent, EventType } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import {
  applyCanonicalMessageEvent,
  initialAgUiMessagesState,
  reducer,
  ɵselectAgUiMessagesProtocolError,
  ɵselectAttemptStartToolCallIds,
  ɵselectCommittedAgUiMessages,
  ɵselectEffectiveCommittedAgUiMessages,
  ɵselectEffectiveVisibleAgUiMessages,
  ɵselectVisibleAgUiMessages,
} from './ag-ui-messages.reducer';

test('shares unrelated canonical messages when a text delta changes one message', () => {
  const initialized = reducer(
    initialAgUiMessagesState,
    devActions.init({
      system: '',
      canonicalMessages: [
        { id: 'user-1', role: 'user', content: 'hello' },
        { id: 'assistant-1', role: 'assistant', content: 'before' },
        { id: 'developer-1', role: 'developer', content: 'policy' },
      ],
    }),
  );

  const next = applyCanonicalMessageEvent(initialized.committed, {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'assistant-1',
    delta: ' after',
  });

  expect(next).not.toBe(initialized.committed);
  expect(next[0]).toBe(initialized.committed[0]);
  expect(next[1]).not.toBe(initialized.committed[1]);
  expect(next[2]).toBe(initialized.committed[2]);
  expect(next[1]).toMatchObject({ content: 'before after' });
  expect(Object.isFrozen(next)).toBe(true);
  expect(Object.isFrozen(next[1])).toBe(true);
});

test('shares unchanged tool-call paths when a tool args delta changes one call', () => {
  const initialized = reducer(
    initialAgUiMessagesState,
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
              function: { name: 'first', arguments: '' },
            },
            {
              id: 'tool-2',
              type: 'function',
              function: { name: 'second', arguments: '' },
            },
          ],
        },
        { id: 'assistant-2', role: 'assistant', content: 'other' },
      ],
    }),
  );
  const firstAssistant = initialized.committed[0] as Extract<
    (typeof initialized.committed)[number],
    { role: 'assistant' }
  >;

  const next = applyCanonicalMessageEvent(initialized.committed, {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: 'tool-1',
    delta: '{"city":"Paris"}',
  });
  const nextAssistant = next[0] as Extract<
    (typeof next)[number],
    { role: 'assistant' }
  >;

  expect(next[0]).not.toBe(firstAssistant);
  expect(nextAssistant.toolCalls?.[0]).not.toBe(firstAssistant.toolCalls?.[0]);
  expect(nextAssistant.toolCalls?.[0]?.function).not.toBe(
    firstAssistant.toolCalls?.[0]?.function,
  );
  expect(nextAssistant.toolCalls?.[1]).toBe(firstAssistant.toolCalls?.[1]);
  expect(next[1]).toBe(initialized.committed[1]);
  expect(nextAssistant.toolCalls?.[0]?.function.arguments).toBe(
    '{"city":"Paris"}',
  );
  expect(Object.isFrozen(nextAssistant.toolCalls)).toBe(true);
});

test('shares unrelated messages for encrypted and tool-result updates', () => {
  const initialized = reducer(
    initialAgUiMessagesState,
    devActions.init({
      system: '',
      canonicalMessages: [
        { id: 'reasoning-1', role: 'reasoning', content: 'think' },
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
  const encrypted = applyCanonicalMessageEvent(initialized.committed, {
    type: EventType.REASONING_ENCRYPTED_VALUE,
    subtype: 'message',
    entityId: 'reasoning-1',
    encryptedValue: 'opaque',
  });

  const result = applyCanonicalMessageEvent(encrypted, {
    type: EventType.TOOL_CALL_RESULT,
    messageId: 'tool-result-1',
    toolCallId: 'tool-1',
    content: 'done',
  });

  expect(encrypted[0]).not.toBe(initialized.committed[0]);
  expect(encrypted[1]).toBe(initialized.committed[1]);
  expect(result[0]).toBe(encrypted[0]);
  expect(result[1]).toBe(encrypted[1]);
  expect(result[2]).toMatchObject({ id: 'tool-result-1', content: 'done' });
  expect(Object.isFrozen(result[2])).toBe(true);
});

test('keeps a stable configured system overlay outside canonical history', () => {
  const initialized = reducer(
    initialAgUiMessagesState,
    devActions.init({
      system: 'first',
      canonicalMessages: [{ id: 'user-1', role: 'user', content: 'hello' }],
      systemMessage: { id: 'system-1', role: 'system', content: 'first' },
    }),
  );
  const updated = reducer(
    initialized,
    devActions.updateOptions({
      system: 'second',
      systemMessage: { id: 'system-1', role: 'system', content: 'second' },
    }),
  );

  expect(initialized.committed).toEqual([
    { id: 'user-1', role: 'user', content: 'hello' },
  ]);
  expect(ɵselectEffectiveVisibleAgUiMessages(updated)).toEqual([
    { id: 'system-1', role: 'system', content: 'second' },
    { id: 'user-1', role: 'user', content: 'hello' },
  ]);
});

test('continues an idempotently started tool call with an ID-less chunk', () => {
  const initialized = reducer(
    initialAgUiMessagesState,
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
  const active = reducer(
    initialized,
    internalActions.generationAttemptStarted(),
  );
  const started = reducer(
    active,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-1',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-1',
    }),
  );

  const continued = reducer(
    started,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      delta: '{"city":"Paris"}',
    }),
  );

  expect(continued.draft).toEqual([
    {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: 'tool-1',
          type: 'function',
          function: { name: 'lookup', arguments: '{"city":"Paris"}' },
        },
      ],
    },
  ]);
  expect(continued.activeToolCallId).toBe('tool-1');
});

test('merges metadata from an idempotent tool start and compact chunk', () => {
  const initialized = reducer(
    initialAgUiMessagesState,
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
              function: { name: 'lookup', arguments: '{}' },
              encryptedValue: 'opaque',
              metadata: { initial: true },
            },
          ],
        },
        {
          id: 'tool-result-1',
          role: 'tool',
          toolCallId: 'tool-1',
          content: 'found',
        },
      ],
    }),
  );
  const active = reducer(
    initialized,
    internalActions.generationAttemptStarted(),
  );
  const retried = reducer(
    active,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-1',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-1',
      metadata: { retry: true },
    }),
  );
  const decorated = reducer(
    retried,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'tool-1',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-1',
      metadata: { chunk: true },
    }),
  );

  const assistant = decorated.draft[0] as Extract<
    (typeof decorated.draft)[number],
    { role: 'assistant' }
  >;

  expect(retried.draft).not.toBe(active.draft);
  expect(retried.draft[1]).toBe(active.draft[1]);
  expect(decorated.draft).not.toBe(retried.draft);
  expect(decorated.draft[1]).toBe(retried.draft[1]);
  expect(assistant.toolCalls).toHaveLength(1);
  expect(assistant.toolCalls?.[0]).toMatchObject({
    id: 'tool-1',
    function: { name: 'lookup', arguments: '{}' },
    encryptedValue: 'opaque',
    metadata: { initial: true, retry: true, chunk: true },
  });
  expect(decorated.protocolError).toBeUndefined();
});

test('ignores unknown end events without synthesizing canonical messages', () => {
  const initialized = reducer(
    initialAgUiMessagesState,
    devActions.init({ system: '', canonicalMessages: [] }),
  );
  const active = reducer(
    initialized,
    internalActions.generationAttemptStarted(),
  );
  const textEnded = reducer(
    active,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'missing-text',
    }),
  );
  const reasoningEnded = reducer(
    textEnded,
    apiActions.generateMessageEvent({
      type: EventType.REASONING_MESSAGE_END,
      messageId: 'missing-reasoning',
    }),
  );

  const toolEnded = reducer(
    reasoningEnded,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_END,
      toolCallId: 'missing-tool',
    }),
  );

  expect(textEnded.draft).toBe(active.draft);
  expect(reasoningEnded.draft).toBe(active.draft);
  expect(toolEnded.draft).toBe(active.draft);
  expect(toolEnded.protocolError).toBeUndefined();
});

test('ignores late unknown end events after a snapshot resets lifecycle correlation', () => {
  const initialized = reducer(
    initialAgUiMessagesState,
    devActions.init({ system: '', canonicalMessages: [] }),
  );
  const active = reducer(
    initialized,
    internalActions.generationAttemptStarted(),
  );
  const snapshotted = reducer(
    active,
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [{ id: 'user-1', role: 'user', content: 'hello' }],
    }),
  );

  const ended = reducer(
    snapshotted,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_END,
      toolCallId: 'late-tool',
    }),
  );

  expect(ended.draft).toBe(snapshotted.draft);
  expect(ended.activeToolCallId).toBeUndefined();
  expect(ended.protocolError).toBeUndefined();
});

test('rejects a send fragment that collides with committed canonical IDs', () => {
  const initialized = reducer(
    initialAgUiMessagesState,
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

  const rejected = reducer(
    initialized,
    devActions.sendMessage({
      message: { role: 'user', content: 'next' },
      canonicalMessages: [{ id: 'tool-1', role: 'user', content: 'next' }],
    }),
  );

  expect(rejected.committed).toBe(initialized.committed);
  expect(rejected.draft).toBe(initialized.draft);
  expect(rejected.protocolError).toBeInstanceOf(Error);
});

test('rejects appended tool and message IDs that collide with committed history', () => {
  const initialized = reducer(
    initialAgUiMessagesState,
    devActions.init({
      system: '',
      canonicalMessages: [{ id: 'user-1', role: 'user', content: 'hello' }],
    }),
  );
  const toolCollision = reducer(
    initialized,
    devActions.sendMessage({
      message: { role: 'assistant', content: '', toolCalls: [] },
      canonicalMessages: [
        {
          id: 'assistant-2',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'user-1',
              type: 'function',
              function: { name: 'lookup', arguments: '' },
            },
          ],
        },
      ],
    }),
  );
  const duplicateMessage = reducer(
    initialized,
    devActions.sendMessage({
      message: { role: 'user', content: 'again' },
      canonicalMessages: [{ id: 'user-1', role: 'user', content: 'again' }],
    }),
  );

  expect(toolCollision.committed).toBe(initialized.committed);
  expect(toolCollision.protocolError).toBeInstanceOf(Error);
  expect(duplicateMessage.committed).toBe(initialized.committed);
  expect(duplicateMessage.protocolError).toBeInstanceOf(Error);
});

test('commits an atomically replaced snapshot only on successful generation', () => {
  const initialized = reducer(
    initialAgUiMessagesState,
    devActions.init({
      system: '',
      canonicalMessages: [{ id: 'user-1', role: 'user', content: 'hello' }],
    }),
  );
  const active = reducer(
    initialized,
    internalActions.generationAttemptStarted(),
  );
  const snapshotted = reducer(
    active,
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        { id: 'user-1', role: 'user', content: 'hello' },
        { id: 'assistant-1', role: 'assistant', content: 'hi' },
      ],
    }),
  );
  const committed = reducer(
    snapshotted,
    apiActions.generateMessageSuccess({
      message: { role: 'assistant', content: 'hi', toolCallIds: [] },
      toolCalls: [],
    }),
  );

  expect(ɵselectVisibleAgUiMessages(snapshotted)).toEqual([
    { id: 'user-1', role: 'user', content: 'hello' },
    { id: 'assistant-1', role: 'assistant', content: 'hi' },
  ]);
  expect(committed.committed).toEqual(snapshotted.draft);
  expect(committed.attemptActive).toBe(false);
});

test('correlates text reasoning and tool chunks without optional IDs', () => {
  let state = reducer(
    initialAgUiMessagesState,
    devActions.init({ system: '', canonicalMessages: [] }),
  );
  state = reducer(state, internalActions.generationAttemptStarted());
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'assistant-1',
      role: 'assistant',
    }),
  );
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      delta: 'hello',
    }),
  );
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.REASONING_MESSAGE_START,
      messageId: 'reasoning-1',
      role: 'reasoning',
    }),
  );
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.REASONING_MESSAGE_CHUNK,
      delta: 'think',
    }),
  );
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-1',
      toolCallName: 'lookup',
    }),
  );
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      delta: '{"q":1}',
    }),
  );

  expect(state.draft).toEqual([
    {
      id: 'assistant-1',
      role: 'assistant',
      content: 'hello',
      toolCalls: [
        {
          id: 'tool-1',
          type: 'function',
          function: { name: 'lookup', arguments: '{"q":1}' },
        },
      ],
    },
    { id: 'reasoning-1', role: 'reasoning', content: 'think' },
  ]);
});

test('continues an active tool call when a chunk only supplies its ID', () => {
  let state = reducer(
    initialAgUiMessagesState,
    devActions.init({ system: '', canonicalMessages: [] }),
  );
  state = reducer(state, internalActions.generationAttemptStarted());
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'assistant-1',
      role: 'assistant',
    }),
  );
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-1',
      toolCallName: 'lookup',
    }),
  );

  const next = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'tool-1',
      delta: '{"query":"tea"}',
    }),
  );

  expect(next.draft[0]).toMatchObject({
    id: 'assistant-1',
    toolCalls: [
      {
        id: 'tool-1',
        function: { name: 'lookup', arguments: '{"query":"tea"}' },
      },
    ],
  });
});

test('ignores an unknown explicit nameless tool chunk without changing correlation', () => {
  let state = reducer(
    initialAgUiMessagesState,
    devActions.init({ system: '', canonicalMessages: [] }),
  );
  state = reducer(state, internalActions.generationAttemptStarted());
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'assistant-1',
      role: 'assistant',
    }),
  );
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-active',
      toolCallName: 'lookup',
    }),
  );

  const ignored = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'tool-unknown',
      delta: '{',
    }),
  );

  expect(ignored).toBe(state);
});

test('rejects a tool call whose explicit parent is its own ID', () => {
  const initialized = reducer(
    initialAgUiMessagesState,
    devActions.init({ system: '', canonicalMessages: [] }),
  );
  const active = reducer(
    initialized,
    internalActions.generationAttemptStarted(),
  );

  const rejected = reducer(
    active,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-1',
      toolCallName: 'lookup',
      parentMessageId: 'tool-1',
    }),
  );

  expect(rejected.draft).toBe(active.draft);
  expect(rejected.protocolError).toBeInstanceOf(Error);
});

test('rejects a tool call replay with a different explicit parent', () => {
  const initialized = reducer(
    initialAgUiMessagesState,
    devActions.init({ system: '', canonicalMessages: [] }),
  );
  const active = reducer(
    initialized,
    internalActions.generationAttemptStarted(),
  );
  const started = reducer(
    active,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-1',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-1',
    }),
  );

  const rejected = reducer(
    started,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-1',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-2',
    }),
  );

  expect(rejected.draft).toBe(started.draft);
  expect(rejected.protocolError).toBeInstanceOf(Error);
});

test('rejects a compact tool chunk that changes an existing tool name', () => {
  const initialized = reducer(
    initialAgUiMessagesState,
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
              function: { name: 'lookup', arguments: '{' },
            },
          ],
        },
      ],
    }),
  );
  const active = reducer(
    initialized,
    internalActions.generationAttemptStarted(),
  );

  const conflicted = reducer(
    active,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'tool-1',
      toolCallName: 'different',
      delta: '}',
    }),
  );

  expect(conflicted.draft).toBe(active.draft);
  expect(conflicted.protocolError).toBeInstanceOf(Error);
});

test('retains a draft reference and records a protocol error on message and tool ID collisions', () => {
  let state = reducer(
    initialAgUiMessagesState,
    devActions.init({
      system: '',
      canonicalMessages: [{ id: 'user-1', role: 'user', content: 'hi' }],
    }),
  );
  state = reducer(state, internalActions.generationAttemptStarted());
  const before = state.draft;
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'user-1',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-1',
    }),
  );

  expect(state.draft).toBe(before);
  expect(state.protocolError).toBeInstanceOf(Error);
});

test('rejects synthesized assistant parents that collide with an existing tool-call ID', () => {
  const initialized = reducer(
    initialAgUiMessagesState,
    devActions.init({
      system: '',
      canonicalMessages: [
        {
          id: 'assistant-existing',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'assistant-tool-new',
              type: 'function',
              function: { name: 'existing', arguments: '' },
            },
          ],
        },
      ],
    }),
  );
  const active = reducer(
    initialized,
    internalActions.generationAttemptStarted(),
  );

  const collided = reducer(
    active,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-new',
      toolCallName: 'lookup',
    }),
  );

  expect(collided.draft).toBe(active.draft);
  expect(collided.protocolError).toBeInstanceOf(Error);
});

test('retains synchronized system echoes and replaces them in place in the effective history', () => {
  const event = {
    type: EventType.MESSAGES_SNAPSHOT,
    messages: [
      { id: 'user-1', role: 'user', content: 'hello' },
      { id: 'system-1', role: 'system', content: 'remote' },
      { id: 'developer-1', role: 'developer', content: 'rules' },
      {
        id: 'activity-1',
        role: 'activity',
        activityType: 'progress',
        content: { count: 1 },
        metadata: { arbitrary: { value: true } },
      },
    ],
  } as const;
  let state = reducer(
    initialAgUiMessagesState,
    devActions.init({
      system: 'local',
      systemMessage: { id: 'system-1', role: 'system', content: 'local' },
      canonicalMessages: [],
    }),
  );
  state = reducer(state, internalActions.generationAttemptStarted());
  state = reducer(state, apiActions.generateMessageEvent(event as never));
  const committed = reducer(
    state,
    apiActions.generateMessageSuccess({
      message: { role: 'assistant', content: '', toolCallIds: [] },
      toolCalls: [],
    }),
  );
  const appended = reducer(
    committed,
    devActions.sendMessage({
      message: { role: 'user', content: 'next' },
      canonicalMessages: [{ id: 'user-2', role: 'user', content: 'next' }],
    }),
  );

  expect(state.draft).toEqual([
    { id: 'user-1', role: 'user', content: 'hello' },
    { id: 'system-1', role: 'system', content: 'remote' },
    { id: 'developer-1', role: 'developer', content: 'rules' },
    {
      id: 'activity-1',
      role: 'activity',
      activityType: 'progress',
      content: { count: 1 },
      metadata: { arbitrary: { value: true } },
    },
  ]);
  expect(Object.isFrozen(state.draft[3])).toBe(true);
  expect(ɵselectEffectiveVisibleAgUiMessages(state)).toEqual([
    { id: 'user-1', role: 'user', content: 'hello' },
    { id: 'system-1', role: 'system', content: 'local' },
    { id: 'developer-1', role: 'developer', content: 'rules' },
    {
      id: 'activity-1',
      role: 'activity',
      activityType: 'progress',
      content: { count: 1 },
      metadata: { arbitrary: { value: true } },
    },
  ]);
  expect(appended.committed).toEqual(
    expect.arrayContaining([
      { id: 'system-1', role: 'system', content: 'remote' },
      { id: 'user-2', role: 'user', content: 'next' },
    ]),
  );
});

test('updates and clears only the configured system overlay in place', () => {
  const initialized = reducer(
    initialAgUiMessagesState,
    devActions.init({
      system: 'first',
      systemMessage: { id: 'configured', role: 'system', content: 'first' },
      canonicalMessages: [
        { id: 'configured', role: 'system', content: 'echoed first' },
        { id: 'remote-system', role: 'system', content: 'remote' },
        { id: 'developer-1', role: 'developer', content: 'rules' },
      ],
    }),
  );
  const updated = reducer(
    initialized,
    devActions.updateOptions({
      system: 'second',
      systemMessage: { id: 'configured', role: 'system', content: 'second' },
    }),
  );
  const cleared = reducer(
    updated,
    devActions.updateOptions({ system: '', systemMessage: undefined }),
  );

  expect(ɵselectEffectiveVisibleAgUiMessages(updated)).toEqual([
    { id: 'configured', role: 'system', content: 'second' },
    { id: 'remote-system', role: 'system', content: 'remote' },
    { id: 'developer-1', role: 'developer', content: 'rules' },
  ]);
  expect(cleared.committed).toEqual([
    { id: 'remote-system', role: 'system', content: 'remote' },
    { id: 'developer-1', role: 'developer', content: 'rules' },
  ]);
});

test('keeps the configured overlay outside set histories and active transactions', () => {
  const initialized = reducer(
    initialAgUiMessagesState,
    devActions.init({
      system: 'one',
      systemMessage: { id: 'configured', role: 'system', content: 'one' },
      canonicalMessages: [{ id: 'user-1', role: 'user', content: 'first' }],
    }),
  );
  const active = reducer(
    initialized,
    internalActions.generationAttemptStarted(),
  );
  const updated = reducer(
    active,
    devActions.updateOptions({
      system: 'two',
      systemMessage: { id: 'configured', role: 'system', content: 'two' },
    }),
  );
  const replaced = reducer(
    updated,
    devActions.setMessages({
      messages: [],
      canonicalMessages: [{ id: 'user-2', role: 'user', content: 'next' }],
    }),
  );
  const repeated = reducer(
    replaced,
    devActions.setMessages({
      messages: [],
      canonicalMessages: replaced.committed,
    }),
  );

  expect(ɵselectEffectiveVisibleAgUiMessages(repeated)).toEqual([
    { id: 'configured', role: 'system', content: 'two' },
    { id: 'user-2', role: 'user', content: 'next' },
  ]);
  expect(
    reducer(updated, internalActions.generationAttemptRolledBack())
      .systemMessage,
  ).toEqual({ id: 'configured', role: 'system', content: 'two' });
  expect(
    repeated.committed.filter((message) => message.id === 'configured'),
  ).toHaveLength(0);
});

test('commits, rolls back, retries, and terminates canonical transactions', () => {
  const initialized = reducer(
    initialAgUiMessagesState,
    devActions.init({
      system: '',
      canonicalMessages: [{ id: 'user-1', role: 'user', content: 'hi' }],
    }),
  );
  const errored = { ...initialized, protocolError: new Error('old') };
  const begun = reducer(errored, internalActions.generationAttemptStarted());
  const draft = reducer(
    begun,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'assistant-1',
      role: 'assistant',
      delta: 'hello',
    }),
  );
  const rolledBack = reducer(
    draft,
    internalActions.generationAttemptRolledBack(),
  );
  const retried = reducer(
    rolledBack,
    internalActions.generationAttemptStarted(),
  );
  const stopped = reducer(retried, devActions.stopMessageGeneration(true));
  const retired = reducer(
    reducer(retried, internalActions.generationAttemptStarted()),
    internalActions.generationSilentlyRetired(),
  );
  const failed = reducer(
    reducer(retried, internalActions.generationAttemptStarted()),
    apiActions.generateMessageError(new Error('failed')),
  );

  expect(begun.draft).toBe(begun.committed);
  expect(ɵselectVisibleAgUiMessages(draft)).toHaveLength(2);
  expect(begun.protocolError).toBeUndefined();
  expect(rolledBack).toMatchObject({
    committed: initialized.committed,
    attemptActive: false,
  });
  expect(retried.draft).toBe(retried.committed);
  expect([stopped, retired, failed]).toEqual(
    expect.arrayContaining([expect.objectContaining({ attemptActive: false })]),
  );
});

test('superseding local canonical actions abandon a draft and reject late transport events', () => {
  const initialized = reducer(
    initialAgUiMessagesState,
    devActions.init({
      system: '',
      canonicalMessages: [{ id: 'user-1', role: 'user', content: 'first' }],
    }),
  );
  const active = reducer(
    initialized,
    internalActions.generationAttemptStarted(),
  );
  const drafted = reducer(
    active,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'assistant-old',
      role: 'assistant',
      delta: 'old',
    }),
  );
  const sent = reducer(
    drafted,
    devActions.sendMessage({
      message: { role: 'user', content: 'second' },
      canonicalMessages: [{ id: 'user-2', role: 'user', content: 'second' }],
    }),
  );
  const late = reducer(
    reducer(sent, internalActions.generationAttemptRolledBack()),
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'assistant-old',
      role: 'assistant',
      delta: ' late',
    }),
  );
  const set = reducer(
    drafted,
    devActions.setMessages({
      messages: [],
      canonicalMessages: [{ id: 'user-3', role: 'user', content: 'replaced' }],
    }),
  );
  const resent = reducer(drafted, devActions.resendMessages());

  expect(sent.committed.map((message) => message.id)).toEqual([
    'user-1',
    'user-2',
  ]);
  expect(late).toBe(sent);
  expect(set.committed).toEqual([
    { id: 'user-3', role: 'user', content: 'replaced' },
  ]);
  expect(resent.committed).toBe(initialized.committed);
  expect(resent.attemptActive).toBe(false);
});

test('owns a complete snapshot without mutating input and retains every canonical role', () => {
  const activityMetadata = { nested: { stable: true } };
  const snapshot = [
    { id: 'user-1', role: 'user' as const, content: 'user' },
    {
      id: 'assistant-1',
      role: 'assistant' as const,
      content: 'assistant',
      toolCalls: [
        {
          id: 'tool-1',
          type: 'function' as const,
          function: { name: 'lookup', arguments: '{"q":1}' },
        },
      ],
    },
    { id: 'system-remote', role: 'system' as const, content: 'system' },
    { id: 'developer-1', role: 'developer' as const, content: 'developer' },
    {
      id: 'tool-result-1',
      role: 'tool' as const,
      toolCallId: 'tool-1',
      content: 'result',
    },
    {
      id: 'reasoning-1',
      role: 'reasoning' as const,
      content: 'reasoning',
      encryptedValue: 'secret',
    },
    {
      id: 'activity-1',
      role: 'activity' as const,
      activityType: 'progress',
      content: { count: 1 },
      metadata: activityMetadata,
      custom: 'value',
    },
  ];
  let state = reducer(
    initialAgUiMessagesState,
    devActions.init({
      system: 'configured',
      systemMessage: {
        id: 'configured',
        role: 'system',
        content: 'configured',
      },
      canonicalMessages: [],
    }),
  );
  state = reducer(state, internalActions.generationAttemptStarted());
  const next = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: snapshot,
    }),
  );
  activityMetadata.nested.stable = false;

  expect(next.draft).toHaveLength(7);
  expect(next.draft.map((message) => message.role)).toEqual([
    'user',
    'assistant',
    'system',
    'developer',
    'tool',
    'reasoning',
    'activity',
  ]);
  expect(next.draft[6]?.metadata?.['nested']).toEqual({ stable: true });
  expect(Object.isFrozen(next.draft[6])).toBe(true);
  expect(ɵselectEffectiveVisibleAgUiMessages(next)[0]).toEqual({
    id: 'configured',
    role: 'system',
    content: 'configured',
  });
});

test('captures immutable committed tool IDs and recalculates them on a retry', () => {
  const initialized = reducer(
    initialAgUiMessagesState,
    devActions.init({
      system: '',
      canonicalMessages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'tool-a',
              type: 'function',
              function: { name: 'a', arguments: '' },
            },
            {
              id: 'tool-b',
              type: 'function',
              function: { name: 'b', arguments: '' },
            },
          ],
        },
      ],
    }),
  );
  const begun = reducer(
    initialized,
    internalActions.generationAttemptStarted(),
  );
  const snapshotted = reducer(
    begun,
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        ...begun.draft,
        {
          id: 'assistant-2',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'tool-c',
              type: 'function',
              function: { name: 'c', arguments: '' },
            },
          ],
        },
      ],
    }),
  );
  const retried = reducer(
    reducer(
      snapshotted,
      apiActions.generateMessageSuccess({
        message: { role: 'assistant', content: '', toolCallIds: [] },
        toolCalls: [],
      }),
    ),
    internalActions.generationAttemptStarted(),
  );

  expect(ɵselectAttemptStartToolCallIds(begun)).toEqual(['tool-a', 'tool-b']);
  expect(Object.isFrozen(ɵselectAttemptStartToolCallIds(begun))).toBe(true);
  expect(ɵselectAttemptStartToolCallIds(snapshotted)).toEqual([
    'tool-a',
    'tool-b',
  ]);
  expect(ɵselectAttemptStartToolCallIds(retried)).toEqual([
    'tool-a',
    'tool-b',
    'tool-c',
  ]);
});

test('merges text and reasoning lifecycle fields without mutating the event or prior state', () => {
  let state = reducer(
    initialAgUiMessagesState,
    devActions.init({ system: '', canonicalMessages: [] }),
  );
  state = reducer(state, internalActions.generationAttemptStarted());
  const textStart = {
    type: EventType.TEXT_MESSAGE_START,
    messageId: 'assistant-1',
    role: 'assistant' as const,
    metadata: { source: 'wire' },
  } satisfies AGUIEvent;
  const started = reducer(state, apiActions.generateMessageEvent(textStart));
  const content = reducer(
    started,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'assistant-1',
      delta: 'hello',
    }),
  );
  const reasoning = reducer(
    content,
    apiActions.generateMessageEvent({
      type: EventType.REASONING_MESSAGE_START,
      messageId: 'reasoning-1',
      role: 'reasoning',
    }),
  );
  const encrypted = reducer(
    reasoning,
    apiActions.generateMessageEvent({
      type: EventType.REASONING_ENCRYPTED_VALUE,
      subtype: 'message',
      entityId: 'reasoning-1',
      encryptedValue: 'ciphertext',
    }),
  );
  const finished = reducer(
    encrypted,
    apiActions.generateMessageEvent({
      type: EventType.REASONING_MESSAGE_END,
      messageId: 'reasoning-1',
    }),
  );

  expect(textStart.metadata).toEqual({ source: 'wire' });
  expect(started.draft).not.toBe(state.draft);
  expect(content.draft[0]).toMatchObject({
    id: 'assistant-1',
    content: 'hello',
    metadata: { source: 'wire' },
  });
  expect(finished.draft[1]).toMatchObject({
    id: 'reasoning-1',
    role: 'reasoning',
    encryptedValue: 'ciphertext',
  });
  expect(finished.activeReasoningMessageId).toBeUndefined();
});

test('attaches parentless tool calls to an active assistant and stores matching results', () => {
  let state = reducer(
    initialAgUiMessagesState,
    devActions.init({ system: '', canonicalMessages: [] }),
  );
  state = reducer(state, internalActions.generationAttemptStarted());
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'assistant-1',
      role: 'assistant',
    }),
  );
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-1',
      toolCallName: 'lookup',
    }),
  );
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'tool-1',
      delta: '{"q":1}',
    }),
  );
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'tool-result-1',
      toolCallId: 'tool-1',
      content: 'found',
    }),
  );

  expect(state.draft).toHaveLength(2);
  expect(state.draft[0]).toMatchObject({
    id: 'assistant-1',
    toolCalls: [
      { id: 'tool-1', function: { name: 'lookup', arguments: '{"q":1}' } },
    ],
  });
  expect(state.draft[1]).toEqual({
    id: 'tool-result-1',
    role: 'tool',
    toolCallId: 'tool-1',
    content: 'found',
  });
});

test('records compatibility errors while preserving the exact valid draft', () => {
  let state = reducer(
    initialAgUiMessagesState,
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
  state = reducer(state, internalActions.generationAttemptStarted());
  const before = state.draft;
  const messageToolCollision = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'tool-1',
      role: 'assistant',
      delta: 'bad',
    }),
  );
  const incompatibleRole = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'assistant-1',
      role: 'user',
    }),
  );
  const resultRetarget = reducer(
    reducer(
      state,
      apiActions.generateMessageEvent({
        type: EventType.TOOL_CALL_RESULT,
        messageId: 'result-1',
        toolCallId: 'tool-1',
        content: 'ok',
      }),
    ),
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'result-1',
      toolCallId: 'different',
      content: 'bad',
    }),
  );

  expect(messageToolCollision.draft).toBe(before);
  expect(incompatibleRole.draft).toBe(before);
  expect(resultRetarget.protocolError).toBeInstanceOf(Error);
  expect(ɵselectAgUiMessagesProtocolError(messageToolCollision)).toBeInstanceOf(
    Error,
  );
});

test('keeps activity deltas as reference-preserving no-ops and exposes canonical selectors', () => {
  const initialized = reducer(
    initialAgUiMessagesState,
    devActions.init({
      system: 'system',
      systemMessage: { id: 'system-1', role: 'system', content: 'system' },
      canonicalMessages: [{ id: 'user-1', role: 'user', content: 'hello' }],
    }),
  );
  const active = reducer(
    initialized,
    internalActions.generationAttemptStarted(),
  );
  const snapshotNoop = reducer(
    active,
    apiActions.generateMessageEvent({
      type: EventType.ACTIVITY_SNAPSHOT,
      messageId: 'activity-1',
      activityType: 'progress',
      content: {},
      replace: true,
    }),
  );
  const deltaNoop = reducer(
    active,
    apiActions.generateMessageEvent({
      type: EventType.ACTIVITY_DELTA,
      messageId: 'activity-1',
      activityType: 'progress',
      patch: [],
    }),
  );

  expect(snapshotNoop).toBe(active);
  expect(deltaNoop).toBe(active);
  expect(ɵselectCommittedAgUiMessages(active)).toEqual([
    { id: 'user-1', role: 'user', content: 'hello' },
  ]);
  expect(ɵselectEffectiveCommittedAgUiMessages(active)[0]).toEqual({
    id: 'system-1',
    role: 'system',
    content: 'system',
  });
});

test('rejects malformed snapshot roots and arrays without reading untrusted accessors', () => {
  const initialized = reducer(
    initialAgUiMessagesState,
    devActions.init({
      system: '',
      canonicalMessages: [{ id: 'user-1', role: 'user', content: 'hello' }],
    }),
  );
  const active = reducer(
    initialized,
    internalActions.generationAttemptStarted(),
  );
  const sparse = new Array(1) as unknown as readonly never[];
  const accessor = new Array(1) as unknown as readonly never[];
  let accesses = 0;
  Object.defineProperty(accessor, 0, {
    configurable: true,
    enumerable: true,
    get: () => {
      accesses += 1;
      return { id: 'unsafe', role: 'user', content: 'unsafe' };
    },
  });
  const malformedRoot = reducer(
    active,
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: {} as unknown as readonly never[],
    } as unknown as AGUIEvent),
  );
  const sparseResult = reducer(
    active,
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: sparse,
    } as unknown as AGUIEvent),
  );
  const accessorResult = reducer(
    active,
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: accessor,
    } as unknown as AGUIEvent),
  );

  expect(malformedRoot.draft).toBe(active.draft);
  expect(sparseResult.draft).toBe(active.draft);
  expect(accessorResult.draft).toBe(active.draft);
  expect(malformedRoot.committed).toBe(initialized.committed);
  expect([malformedRoot, sparseResult, accessorResult]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ protocolError: expect.any(Error) }),
    ]),
  );
  expect(accesses).toBe(0);
});

test('logical settlement rolls an active draft back and cannot undo supersession', () => {
  const initialized = reducer(
    initialAgUiMessagesState,
    devActions.init({
      system: '',
      canonicalMessages: [{ id: 'user-1', role: 'user', content: 'first' }],
    }),
  );
  const active = reducer(
    initialized,
    internalActions.generationAttemptStarted(),
  );
  const drafted = reducer(
    active,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'assistant-1',
      role: 'assistant',
      delta: 'draft',
    }),
  );
  const settled = reducer(
    drafted,
    internalActions.logicalGenerationSettled({ generationId: 'generation-1' }),
  );
  const superseded = reducer(
    drafted,
    devActions.sendMessage({
      message: { role: 'user', content: 'second' },
      canonicalMessages: [{ id: 'user-2', role: 'user', content: 'second' }],
    }),
  );
  const staleSettlement = reducer(
    superseded,
    internalActions.logicalGenerationSettled({ generationId: 'generation-1' }),
  );

  expect(settled.committed).toBe(initialized.committed);
  expect(settled.draft).toBe(initialized.committed);
  expect(settled.attemptActive).toBe(false);
  expect(settled.protocolError).toBeUndefined();
  expect(staleSettlement).toBe(superseded);
  expect(staleSettlement.committed.map((message) => message.id)).toEqual([
    'user-1',
    'user-2',
  ]);
});

test('establishes compact text reasoning and tool correlation from first chunks', () => {
  let state = reducer(
    initialAgUiMessagesState,
    devActions.init({ system: '', canonicalMessages: [] }),
  );
  state = reducer(state, internalActions.generationAttemptStarted());
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'assistant-1',
      delta: 'text',
    }),
  );
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      delta: ' more',
    }),
  );
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.REASONING_MESSAGE_CHUNK,
      messageId: 'reasoning-1',
      delta: 'think',
    }),
  );
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.REASONING_MESSAGE_CHUNK,
      delta: ' more',
    }),
  );
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'tool-1',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-1',
      delta: '{',
    }),
  );
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      delta: '}',
    }),
  );

  expect(state.draft).toMatchObject([
    {
      id: 'assistant-1',
      content: 'text more',
      toolCalls: [
        { id: 'tool-1', function: { name: 'lookup', arguments: '{}' } },
      ],
    },
    { id: 'reasoning-1', content: 'think more' },
  ]);
  expect(state.activeTextMessageId).toBe('assistant-1');
  expect(state.activeReasoningMessageId).toBe('reasoning-1');
  expect(state.activeToolCallId).toBe('tool-1');
});

test('attaches a parentless compact tool chunk to the active role-less assistant', () => {
  let state = reducer(
    initialAgUiMessagesState,
    devActions.init({ system: '', canonicalMessages: [] }),
  );
  state = reducer(state, internalActions.generationAttemptStarted());
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'assistant-1',
      delta: 'hi',
    }),
  );
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'tool-1',
      toolCallName: 'lookup',
      delta: '{"q":',
    }),
  );
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      delta: '1}',
    }),
  );

  expect(state.draft).toEqual([
    {
      id: 'assistant-1',
      role: 'assistant',
      content: 'hi',
      toolCalls: [
        {
          id: 'tool-1',
          type: 'function',
          function: { name: 'lookup', arguments: '{"q":1}' },
        },
      ],
    },
  ]);
  expect(
    state.draft.find((message) => message.id === 'assistant-tool-1'),
  ).toBeUndefined();
});

test('uses an existing non-active tool call name for an identified compact chunk', () => {
  let state = reducer(
    initialAgUiMessagesState,
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
  state = reducer(state, internalActions.generationAttemptStarted());
  const next = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'tool-1',
      delta: '{"q":1}',
    }),
  );

  expect(next.draft[0]).toMatchObject({
    toolCalls: [
      { id: 'tool-1', function: { name: 'lookup', arguments: '{"q":1}' } },
    ],
  });
  expect(next.activeToolCallName).toBe('lookup');
});

test('clears compact lifecycle correlation after a snapshot replacement', () => {
  let state = reducer(
    initialAgUiMessagesState,
    devActions.init({ system: '', canonicalMessages: [] }),
  );
  state = reducer(state, internalActions.generationAttemptStarted());
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'assistant-old',
      role: 'assistant',
      delta: 'old',
    }),
  );
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.REASONING_MESSAGE_CHUNK,
      messageId: 'reasoning-old',
      delta: 'old',
    }),
  );
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'tool-old',
      toolCallName: 'old',
      parentMessageId: 'assistant-old',
      delta: '{}',
    }),
  );
  const snapshotted = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        { id: 'assistant-new', role: 'assistant', content: 'snapshot' },
      ],
    }),
  );
  const idless = reducer(
    snapshotted,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      delta: ' late',
    }),
  );
  const fresh = reducer(
    idless,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'assistant-new',
      role: 'assistant',
      delta: ' fresh',
    }),
  );

  expect(snapshotted.activeTextMessageId).toBeUndefined();
  expect(snapshotted.activeReasoningMessageId).toBeUndefined();
  expect(snapshotted.activeToolCallId).toBeUndefined();
  expect(idless.draft).toBe(snapshotted.draft);
  expect(fresh.draft).toEqual([
    { id: 'assistant-new', role: 'assistant', content: 'snapshot fresh' },
  ]);
});

test('preserves text content through end and ignores later idless chunks', () => {
  let state = reducer(
    initialAgUiMessagesState,
    devActions.init({ system: '', canonicalMessages: [] }),
  );
  state = reducer(state, internalActions.generationAttemptStarted());
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'assistant-1',
      role: 'assistant',
    }),
  );
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'assistant-1',
      delta: 'content',
    }),
  );
  const ended = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'assistant-1',
    }),
  );
  const late = reducer(
    ended,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      delta: ' late',
    }),
  );

  expect(ended.draft).toEqual([
    { id: 'assistant-1', role: 'assistant', content: 'content' },
  ]);
  expect(ended.activeTextMessageId).toBeUndefined();
  expect(late.draft).toBe(ended.draft);
});

test('preserves reasoning content and tool args through their end events', () => {
  let state = reducer(
    initialAgUiMessagesState,
    devActions.init({ system: '', canonicalMessages: [] }),
  );
  state = reducer(state, internalActions.generationAttemptStarted());
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.REASONING_MESSAGE_START,
      messageId: 'reasoning-1',
      role: 'reasoning',
    }),
  );
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: 'reasoning-1',
      delta: 'think',
    }),
  );
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.REASONING_MESSAGE_END,
      messageId: 'reasoning-1',
    }),
  );
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-1',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-1',
    }),
  );
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'tool-1',
      delta: '{}',
    }),
  );
  const ended = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_END,
      toolCallId: 'tool-1',
    }),
  );
  const late = reducer(
    ended,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      delta: ' late',
    }),
  );

  expect(ended.draft).toMatchObject([
    { id: 'reasoning-1', content: 'think' },
    {
      id: 'assistant-1',
      toolCalls: [
        { id: 'tool-1', function: { name: 'lookup', arguments: '{}' } },
      ],
    },
  ]);
  expect(ended.activeReasoningMessageId).toBeUndefined();
  expect(ended.activeToolCallId).toBeUndefined();
  expect(late.draft).toBe(ended.draft);
});

test('clears configured echoes with the empty system sentinel', () => {
  const stableId = 'system-stable';
  const initialized = reducer(
    initialAgUiMessagesState,
    devActions.init({
      system: 'configured',
      systemMessage: { id: stableId, role: 'system', content: 'configured' },
      canonicalMessages: [
        { id: stableId, role: 'system', content: 'echoed' },
        { id: 'system-other', role: 'system', content: 'other' },
        { id: 'developer-1', role: 'developer', content: 'developer' },
      ],
    }),
  );
  const cleared = reducer(
    initialized,
    devActions.updateOptions({
      system: '',
      systemMessage: { id: stableId, role: 'system', content: '' },
    }),
  );

  expect(cleared.committed).toEqual([
    { id: 'system-other', role: 'system', content: 'other' },
    { id: 'developer-1', role: 'developer', content: 'developer' },
  ]);
  expect(ɵselectEffectiveVisibleAgUiMessages(cleared)).toEqual(
    cleared.committed,
  );
});

test('user stop waits for the owned attempt rollback', () => {
  const initialized = reducer(
    initialAgUiMessagesState,
    devActions.init({
      system: 'system',
      systemMessage: { id: 'system-1', role: 'system', content: 'system' },
      canonicalMessages: [{ id: 'user-1', role: 'user', content: 'hello' }],
    }),
  );
  const drafted = reducer(
    reducer(initialized, internalActions.generationAttemptStarted()),
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'assistant-1',
      role: 'assistant',
      delta: 'draft',
    }),
  );
  const stopped = reducer(drafted, devActions.stopMessageGeneration(true));
  const rolledBack = reducer(
    stopped,
    internalActions.generationAttemptRolledBack(),
  );

  expect(stopped).toBe(drafted);
  expect(rolledBack).toMatchObject({
    attemptActive: false,
    committed: initialized.committed,
    draft: initialized.committed,
    protocolError: undefined,
    activeTextMessageId: undefined,
    systemMessage: initialized.systemMessage,
  });
});

test('silent retirement rolls an active canonical draft back to committed authority', () => {
  const initialized = reducer(
    initialAgUiMessagesState,
    devActions.init({
      system: '',
      canonicalMessages: [{ id: 'user-1', role: 'user', content: 'hello' }],
    }),
  );
  const drafted = reducer(
    reducer(initialized, internalActions.generationAttemptStarted()),
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'assistant-1',
      role: 'assistant',
      delta: 'draft',
    }),
  );
  const retired = reducer(drafted, internalActions.generationSilentlyRetired());

  expect(retired).toMatchObject({
    attemptActive: false,
    committed: initialized.committed,
    draft: initialized.committed,
    protocolError: undefined,
    activeTextMessageId: undefined,
  });
});

test('terminal generation error rolls an active canonical draft back to committed authority', () => {
  const initialized = reducer(
    initialAgUiMessagesState,
    devActions.init({
      system: '',
      canonicalMessages: [{ id: 'user-1', role: 'user', content: 'hello' }],
    }),
  );
  const drafted = reducer(
    reducer(initialized, internalActions.generationAttemptStarted()),
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'assistant-1',
      role: 'assistant',
      delta: 'draft',
    }),
  );
  const failed = reducer(
    drafted,
    apiActions.generateMessageError(new Error('failed')),
  );

  expect(failed).toMatchObject({
    attemptActive: false,
    committed: initialized.committed,
    draft: initialized.committed,
    protocolError: undefined,
    activeTextMessageId: undefined,
  });
});
