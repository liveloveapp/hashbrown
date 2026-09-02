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
