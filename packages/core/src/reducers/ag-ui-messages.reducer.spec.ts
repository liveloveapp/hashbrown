import { EventType } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import {
  initialAgUiMessagesState,
  reducer,
  ɵselectEffectiveVisibleAgUiMessages,
  ɵselectVisibleAgUiMessages,
} from './ag-ui-messages.reducer';

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

test('keeps snapshot activity and unknown metadata frozen outside the configured system overlay', () => {
  const event = {
    type: EventType.MESSAGES_SNAPSHOT,
    messages: [
      { id: 'system-1', role: 'system', content: 'remote' },
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

  expect(state.draft).toEqual([
    {
      id: 'activity-1',
      role: 'activity',
      activityType: 'progress',
      content: { count: 1 },
      metadata: { arbitrary: { value: true } },
    },
  ]);
  expect(Object.isFrozen(state.draft[0])).toBe(true);
  expect(ɵselectEffectiveVisibleAgUiMessages(state)[0]).toEqual({
    id: 'system-1',
    role: 'system',
    content: 'local',
  });
});
