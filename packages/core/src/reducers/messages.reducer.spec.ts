import { EventType } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import { Chat } from '../models';
import { reducer } from './messages.reducer';

test('replaces the visible projection from a canonical messages snapshot', () => {
  const initialized = reducer(
    undefined,
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

  expect(snapshotted.messages).toEqual([
    { id: 'user-1', role: 'user', content: 'hello' },
    { id: 'assistant-1', role: 'assistant', content: 'hi', toolCallIds: [] },
  ]);
});

test('reconciles a streamed snapshot assistant by canonical ID and rolls draft output back', () => {
  const initialized = reducer(
    undefined,
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
        { id: 'assistant-1', role: 'assistant', content: 'first' },
      ],
    }),
  );
  const streamed = reducer(
    snapshotted,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'assistant-1',
      delta: ' second',
    }),
  );
  const rolledBack = reducer(
    streamed,
    internalActions.generationAttemptRolledBack(),
  );

  expect(streamed.messages).toEqual([
    { id: 'user-1', role: 'user', content: 'hello' },
    {
      id: 'assistant-1',
      role: 'assistant',
      content: 'first second',
      toolCallIds: [],
    },
  ]);
  expect(
    streamed.messages.filter((message) => message.role === 'assistant'),
  ).toHaveLength(1);
  expect(rolledBack.messages).toBe(initialized.committed);
});

test('commits an identified success assistant once and ignores output-free success', () => {
  const initialized = reducer(
    undefined,
    devActions.init({
      system: '',
      canonicalMessages: [{ id: 'user-1', role: 'user', content: 'hello' }],
    }),
  );
  const active = reducer(
    initialized,
    internalActions.generationAttemptStarted(),
  );
  const assistant = Chat.helpers.ɵwithInternalMessageId(
    { role: 'assistant' as const, content: 'done', toolCallIds: [] },
    'assistant-1',
  );
  const committed = reducer(
    active,
    apiActions.generateMessageSuccess({ message: assistant, toolCalls: [] }),
  );
  const emptyRun = reducer(
    reducer(initialized, internalActions.generationAttemptStarted()),
    apiActions.generateMessageSuccess({
      message: { role: 'assistant', content: '', toolCallIds: [] },
      toolCalls: [],
    }),
  );

  expect(committed.messages).toEqual([
    { id: 'user-1', role: 'user', content: 'hello' },
    assistant,
  ]);
  expect(
    committed.messages.filter((message) => message.role === 'assistant'),
  ).toHaveLength(1);
  expect(emptyRun.messages).toBe(initialized.committed);
});
