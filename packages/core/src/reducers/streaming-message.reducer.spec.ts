import { EventType } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import { Chat } from '../models';
import { s } from '../schema';
import {
  initialState,
  reducer,
  selectRawStreamingMessage,
  selectRawStreamingToolCalls,
  selectStreamingMessage,
  selectStreamingMessageError,
  selectStreamingToolCallEntities,
} from './streaming-message.reducer';

function startState(
  responseSchema?: s.SchemaOutput,
  toolsByName: Record<string, Chat.Internal.Tool> = {},
) {
  return reducer(
    initialState,
    apiActions.generateMessageStart({ responseSchema, toolsByName }),
  );
}

test('adapts generation start into the accumulator state shape', () => {
  const responseSchema = s.object('output', {
    answer: s.streaming.string('answer'),
  });
  const toolsByName: Record<string, Chat.Internal.Tool> = {};

  const state = startState(responseSchema, toolsByName);

  expect(state).toEqual({
    ...initialState,
    attemptActive: true,
    configSnapshot: {
      responseSchema,
      toolsByName,
    },
  });
  expect(state.diagnostics).toEqual([]);
});

test('adapts representative AG-UI events into a streaming message', () => {
  const toolsByName: Record<string, Chat.Internal.Tool> = {
    weather: {
      name: 'weather',
      description: '',
      schema: s.object('arguments', {
        city: s.streaming.string('city'),
      }),
      handler: async () => undefined,
    },
  };
  let state = startState(undefined, toolsByName);

  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'message-1',
      role: 'assistant',
      delta: 'Answer',
    }),
  );
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'call-weather',
      toolCallName: 'weather',
      parentMessageId: 'message-1',
      delta: '{"city":"Paris"}',
    }),
  );

  expect(state.message).toEqual({
    role: 'assistant',
    content: 'Answer',
    toolCallIds: ['call-weather'],
  });
  expect(state.toolCalls[0]).toEqual(
    expect.objectContaining({
      id: 'call-weather',
      argumentsResolved: { city: 'Paris' },
    }),
  );
});

test('emits each newly accumulated trailing-content diagnostic once', () => {
  const consoleWarn = jest
    .spyOn(console, 'warn')
    .mockImplementation(() => undefined);
  const responseSchema = s.object('output', {
    value: s.number('value'),
  });

  try {
    let state = startState(responseSchema);
    state = reducer(
      state,
      apiActions.generateMessageEvent({
        type: EventType.TEXT_MESSAGE_START,
        messageId: 'message-1',
        role: 'assistant',
      }),
    );
    state = reducer(
      state,
      apiActions.generateMessageEvent({
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'message-1',
        delta: '{"value":1}\n{"value":2}',
      }),
    );
    const finishAction = apiActions.generateMessageEvent({
      type: EventType.RUN_FINISHED,
      threadId: 'thread-1',
      runId: 'run-1',
    });

    state = reducer(state, finishAction);
    state = reducer(state, finishAction);

    expect(state.diagnostics).toHaveLength(1);
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(consoleWarn).toHaveBeenCalledWith(
      'Hashbrown received extra data after a valid JSON value. The first value was used, but the extra data was ignored.',
      {
        parsedData: { value: 1 },
        extraData: '{"value":2}',
        tips: [
          'Add examples of exactly one valid JSON object to your prompt.',
          'Ask the model not to emit multiple JSON values or split a response across JSON objects.',
          'If the response is too long, ask the model to summarize while keeping one valid JSON object.',
        ],
      },
    );
  } finally {
    consoleWarn.mockRestore();
  }
});

test('projects raw and composed selector values without changing identities', () => {
  let state = startState();
  state = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'call-1',
      toolCallName: 'search',
      parentMessageId: 'message-1',
    }),
  );
  const rawMessage = selectRawStreamingMessage(state);
  const rawToolCalls = selectRawStreamingToolCalls(state);

  const message = selectStreamingMessage(state);
  const entities = selectStreamingToolCallEntities(state);

  expect(rawMessage).toEqual({
    id: 'message-1',
    role: 'assistant',
    content: '',
    toolCallIds: ['call-1'],
  });
  expect(rawToolCalls).toBe(state.toolCalls);
  expect(selectStreamingMessageError(state)).toBeUndefined();
  expect(message).toEqual({
    id: 'message-1',
    role: 'assistant',
    content: '',
    toolCallIds: ['call-1'],
  });
  expect(entities).toEqual({ 'call-1': state.toolCalls[0] });
});

test('preserves selector projections for errors and an empty message', () => {
  const state = reducer(
    startState(),
    apiActions.generateMessageEvent({
      type: EventType.RUN_ERROR,
      message: 'provider failed',
      code: 'provider_error',
    }),
  );

  expect(selectRawStreamingMessage(state)).toBeNull();
  expect(selectStreamingMessage(state)).toBeNull();
  expect(selectStreamingMessageError(state)).toEqual(
    new Error('provider failed'),
  );
});

test('resets every accumulator field for all terminal adapter actions', () => {
  const state = reducer(
    startState(),
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'message-1',
      role: 'assistant',
      delta: 'partial',
    }),
  );
  const actions = [
    apiActions.generateMessageSuccess({
      message: {
        role: 'assistant',
        content: 'done',
        toolCallIds: [],
      },
      toolCalls: [],
    }),
    apiActions.generateMessageError(new Error('failed')),
    internalActions.generationSilentlyRetired(),
    devActions.stopMessageGeneration(false),
  ];

  const results = actions.map((action) => reducer(state, action));

  expect(results.every((result) => result === initialState)).toBe(true);
});

test('ignores lifecycle events outside an attempt and resets on rollback settlement', () => {
  const outside = reducer(
    initialState,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'assistant-1',
      role: 'assistant',
      delta: 'ignored',
    }),
  );
  const active = reducer(
    startState(),
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'assistant-1',
      role: 'assistant',
      delta: 'draft',
    }),
  );
  const rolledBack = reducer(
    active,
    internalActions.generationAttemptRolledBack(),
  );
  const settled = reducer(active, internalActions.logicalGenerationSettled());

  expect(outside).toBe(initialState);
  expect(rolledBack).toBe(initialState);
  expect(settled).toBe(initialState);
});

test('clears a pre-snapshot accumulator and rebuilds only the replacement assistant', () => {
  const started = startState();
  const first = reducer(
    started,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'assistant-a',
      role: 'assistant',
      delta: 'old',
    }),
  );
  const snapshotted = reducer(
    first,
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [{ id: 'assistant-b', role: 'assistant', content: 'snapshot' }],
    }),
  );
  const rebuilt = reducer(
    snapshotted,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'assistant-b',
      role: 'assistant',
      delta: ' stream',
    }),
  );
  const superseded = reducer(rebuilt, devActions.resendMessages());
  const late = reducer(
    superseded,
    apiActions.generateMessageEvent({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: 'assistant-b',
      role: 'assistant',
      delta: ' late',
    }),
  );

  expect(selectStreamingMessage(first)).toMatchObject({ id: 'assistant-a' });
  expect(selectStreamingMessage(snapshotted)).toMatchObject({
    id: 'assistant-b',
    content: 'snapshot',
  });
  expect(selectStreamingMessage(rebuilt)).toMatchObject({
    id: 'assistant-b',
    content: 'snapshot stream',
  });
  expect(late).toBe(initialState);
});

test('continues parsing partial snapshot tool arguments with later chunks', () => {
  const toolsByName: Record<string, Chat.Internal.Tool> = {
    weather: {
      name: 'weather',
      description: '',
      schema: s.object('arguments', {
        city: s.streaming.string('city'),
      }),
      handler: async () => undefined,
    },
  };
  const started = startState(undefined, toolsByName);
  const snapshotted = reducer(
    started,
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'tool-1',
              type: 'function',
              function: { name: 'weather', arguments: '{"city":' },
            },
          ],
        },
      ],
    }),
  );

  const continued = reducer(
    snapshotted,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'tool-1',
      delta: '"Paris"}',
    }),
  );

  expect(continued.error).toBeUndefined();
  expect(continued.toolCalls[0]?.argumentsResolved).toEqual({ city: 'Paris' });
});

test('keeps only the selected assistant tool calls after a multi-assistant snapshot', () => {
  const started = startState();

  const snapshotted = reducer(
    started,
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'first',
          toolCalls: [
            {
              id: 'tool-1',
              type: 'function',
              function: { name: 'first', arguments: '{}' },
            },
          ],
        },
        {
          id: 'assistant-2',
          role: 'assistant',
          content: 'last',
          toolCalls: [
            {
              id: 'tool-2',
              type: 'function',
              function: { name: 'last', arguments: '{}' },
            },
          ],
        },
      ],
    }),
  );

  expect(selectStreamingMessage(snapshotted)?.toolCallIds).toEqual(['tool-2']);
  expect(
    selectRawStreamingToolCalls(snapshotted).map((tool) => tool.id),
  ).toEqual(['tool-2']);
});

test('continues and ends a snapshotted reasoning message by stable ID', () => {
  const started = startState();
  const snapshotted = reducer(
    started,
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        { id: 'reasoning-1', role: 'reasoning', content: 'Plan' },
        { id: 'assistant-1', role: 'assistant', content: '' },
      ],
    }),
  );
  const continued = reducer(
    snapshotted,
    apiActions.generateMessageEvent({
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: 'reasoning-1',
      delta: ' more',
    }),
  );
  const ended = reducer(
    continued,
    apiActions.generateMessageEvent({
      type: EventType.REASONING_MESSAGE_END,
      messageId: 'reasoning-1',
    }),
  );

  expect(ended.error).toBeUndefined();
  expect(ended.message?.reasoning).toEqual({
    kind: 'details',
    details: [{ id: 'reasoning-1', role: 'reasoning', content: 'Plan more' }],
  });
  expect(ended.reasoningMessageStatusById).toEqual({
    'reasoning-1': 'complete',
  });
});
