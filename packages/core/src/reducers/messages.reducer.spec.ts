import { EventType } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import { Chat } from '../models';
import { reducer } from './messages.reducer';
import {
  initialState as initialStreamingState,
  selectStreamingMessage,
  reducer as streamingReducer,
} from './streaming-message.reducer';

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

test('commits the real accumulator success payload without duplicating its canonical assistant', () => {
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
  const streamed = reducer(
    active,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'assistant-1',
      role: 'assistant',
    }),
  );
  const withContent = reducer(
    streamed,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'assistant-1',
      delta: 'done',
    }),
  );
  const accumulator = streamingReducer(
    streamingReducer(
      initialStreamingState,
      apiActions.generateMessageStart({ toolsByName: {} }),
    ),
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'assistant-1',
      role: 'assistant',
      delta: 'done',
    }),
  );
  const payload = selectStreamingMessage(accumulator);
  if (!payload) {
    throw new Error('Expected a streaming assistant payload');
  }

  const committed = reducer(
    withContent,
    apiActions.generateMessageSuccess({ message: payload, toolCalls: [] }),
  );

  expect(payload).toMatchObject({ id: 'assistant-1', content: 'done' });
  expect(
    committed.messages.filter((message) => message.role === 'assistant'),
  ).toEqual([
    { id: 'assistant-1', role: 'assistant', content: 'done', toolCallIds: [] },
  ]);
});
