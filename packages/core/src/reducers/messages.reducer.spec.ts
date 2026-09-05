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

test('preserves local error order and identity across a reordered snapshot', () => {
  // Arrange
  const errorA: Chat.Internal.ErrorMessage = {
    role: 'error',
    content: 'error A',
  };
  const errorB: Chat.Internal.ErrorMessage = {
    role: 'error',
    content: 'error B',
  };
  const initialized = reducer(
    undefined,
    devActions.init({
      system: '',
      canonicalMessages: [
        { id: 'user-a', role: 'user', content: 'A' },
        { id: 'user-b', role: 'user', content: 'B' },
      ],
      localProjection: {
        messages: [
          { id: 'user-a', role: 'user', content: 'A' },
          errorA,
          { id: 'user-b', role: 'user', content: 'B' },
          errorB,
        ],
        toolCalls: [],
      },
    }),
  );
  const active = reducer(
    initialized,
    internalActions.generationAttemptStarted(),
  );

  // Act
  const snapshotted = reducer(
    active,
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        { id: 'user-b', role: 'user', content: 'remote B' },
        { id: 'user-a', role: 'user', content: 'remote A' },
      ],
    }),
  );

  // Assert
  expect(snapshotted.messages).toEqual([
    { id: 'user-b', role: 'user', content: 'remote B' },
    errorA,
    { id: 'user-a', role: 'user', content: 'remote A' },
    errorB,
  ]);
  expect(snapshotted.messages[1]).toBe(errorA);
  expect(snapshotted.messages[3]).toBe(errorB);
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

test('keeps a snapshotted assistant baseline when its lifecycle start is replayed', () => {
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
        { id: 'assistant-1', role: 'assistant', content: 'snapshot' },
      ],
    }),
  );
  const restarted = reducer(
    snapshotted,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'assistant-1',
      role: 'assistant',
    }),
  );
  const streamed = reducer(
    restarted,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'assistant-1',
      delta: ' stream',
    }),
  );
  const committed = reducer(
    streamed,
    apiActions.generateMessageSuccess({
      message: Chat.helpers.ɵwithInternalMessageId(
        { role: 'assistant', content: ' stream', toolCallIds: [] },
        'assistant-1',
      ),
      toolCalls: [],
    }),
  );

  expect(restarted.messages).toEqual(snapshotted.messages);
  expect(streamed.messages[1]).toMatchObject({ content: 'snapshot stream' });
  expect(committed.committed[1]).toMatchObject({
    content: 'snapshot stream',
  });
});

test('projects lifecycle text by role and ignores assistant starts rejected by canonical history', () => {
  const initialized = reducer(
    undefined,
    devActions.init({ system: '', canonicalMessages: [] }),
  );
  const active = reducer(
    initialized,
    internalActions.generationAttemptStarted(),
  );
  const userStarted = reducer(
    active,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'user-1',
      role: 'user',
    }),
  );
  const userContent = reducer(
    userStarted,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'user-1',
      delta: 'hello',
    }),
  );
  const systemStarted = reducer(
    userContent,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'system-1',
      role: 'system',
    }),
  );
  const systemContent = reducer(
    systemStarted,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'system-1',
      delta: 'hidden',
    }),
  );
  const developerStarted = reducer(
    systemContent,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'developer-1',
      role: 'developer',
    }),
  );
  const developerContent = reducer(
    developerStarted,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'developer-1',
      delta: 'hidden',
    }),
  );
  const snapshotted = reducer(
    developerContent,
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [{ id: 'system-2', role: 'system', content: 'hidden' }],
    }),
  );
  const incompatibleAssistant = reducer(
    snapshotted,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'system-2',
      role: 'assistant',
    }),
  );

  expect(userContent.messages).toEqual([
    { id: 'user-1', role: 'user', content: 'hello' },
  ]);
  expect(systemContent.messages).toBe(userContent.messages);
  expect(developerContent.messages).toBe(userContent.messages);
  expect(incompatibleAssistant).toBe(snapshotted);
});

test('projects an explicit compact user chunk as a user message', () => {
  const initialized = reducer(
    undefined,
    devActions.init({ system: '', canonicalMessages: [] }),
  );
  const active = reducer(
    initialized,
    internalActions.generationAttemptStarted(),
  );

  const projected = reducer(
    active,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'user-1',
      role: 'user',
      delta: 'hello',
    }),
  );

  expect(projected.messages).toEqual([
    { id: 'user-1', role: 'user', content: 'hello' },
  ]);
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

test('commits an active canonical draft without an assistant message', () => {
  const initialized = reducer(
    undefined,
    devActions.init({
      system: '',
      canonicalMessages: [{ id: 'user-1', role: 'user', content: 'before' }],
    }),
  );
  const started = reducer(
    initialized,
    internalActions.generationAttemptStarted(),
  );
  const snapshotted = reducer(
    started,
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [{ id: 'user-2', role: 'user', content: 'after' }],
    }),
  );

  const committed = reducer(
    snapshotted,
    apiActions.generateMessageSuccess({ toolCalls: [] }),
  );

  expect(committed.messages).toEqual([
    { id: 'user-2', role: 'user', content: 'after' },
  ]);
  expect(committed.attemptActive).toBe(false);
});
