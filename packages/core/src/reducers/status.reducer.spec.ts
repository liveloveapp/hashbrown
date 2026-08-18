import { EventType } from '@ag-ui/core';
import { apiActions } from '../actions';
import { initialStatusState, reducer } from './status.reducer';

test('marks generation active from an AG-UI run start event', () => {
  const state = {
    ...initialStatusState,
    isSending: true,
    generatingError: new Error('previous failure'),
  };

  const next = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.RUN_STARTED,
      threadId: 'thread-1',
      runId: 'run-1',
    }),
  );

  expect(next).toEqual({
    ...state,
    isSending: false,
    isReceiving: true,
    isGenerating: true,
    generatingError: undefined,
  });
});

test('marks generation active from AG-UI chunk events', () => {
  const state = {
    ...initialStatusState,
    isReceiving: false,
    isGenerating: false,
  };

  const next = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'message-1',
      delta: 'hello',
    }),
  );

  expect(next).toEqual({
    ...state,
    isReceiving: true,
    isGenerating: true,
  });
});

test('ignores AG-UI events unrelated to generation status', () => {
  const state = initialStatusState;

  const next = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.STATE_SNAPSHOT,
      snapshot: { ignored: true },
    }),
  );

  expect(next).toBe(state);
});
