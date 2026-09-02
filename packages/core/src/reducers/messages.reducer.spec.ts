import { EventType } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
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
