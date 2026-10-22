import { type AGUIEvent, EventType } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import { Chat } from '../models';
import { s } from '../schema';
import { createStore } from '../utils/micro-ngrx';
import { reducers, ɵprepareRootAction } from './index';
import { reducer, selectPendingToolCalls } from './tool-calls.reducer';

test('includes a developer tool named output in pending tool calls', () => {
  const toolCall: Chat.Internal.ToolCall = {
    id: 'tool-call-output',
    name: 'output',
    arguments: '{}',
    status: 'pending',
  };
  const state = reducer(
    undefined,
    apiActions.generateMessageSuccess({
      message: {
        role: 'assistant',
        content: '',
        toolCallIds: [toolCall.id],
      },
      toolCalls: [toolCall],
    }),
  );

  const pendingToolCalls = selectPendingToolCalls(state);

  expect(pendingToolCalls).toEqual([toolCall]);
});

test('records tool results for a stopped tool turn', () => {
  const toolCall: Chat.Internal.ToolCall = {
    id: 'tool-call-1',
    name: 'lookup',
    arguments: '{}',
    status: 'pending',
  };
  const pendingState = reducer(
    undefined,
    apiActions.generateMessageSuccess({
      message: {
        role: 'assistant',
        content: '',
        toolCallIds: [toolCall.id],
      },
      toolCalls: [toolCall],
    }),
  );
  const cancellation = new Error('Tool execution cancelled');
  cancellation.name = 'AbortError';

  const settledState = reducer(
    pendingState,
    internalActions.toolTurnSettled({
      generationId: 'generation-1',
      toolTurnId: 'tool-turn-1',
      continuation: 'stop',
      toolCalls: [toolCall],
      toolMessages: [
        {
          role: 'tool',
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          content: { status: 'rejected', reason: cancellation },
        },
      ],
      canonicalMessages: [],
    }),
  );

  expect(settledState.entities[toolCall.id]).toEqual({
    ...toolCall,
    status: 'done',
    result: { status: 'rejected', reason: cancellation },
  });
});

test('does not settle a replacement tool call with the same id', () => {
  const original: Chat.Internal.ToolCall = {
    id: 'tool-call-1',
    name: 'lookup',
    arguments: '{"turn":"original"}',
    status: 'pending',
  };
  const replacement: Chat.Internal.ToolCall = {
    ...original,
    arguments: '{"turn":"replacement"}',
  };
  const replacementState = reducer(
    undefined,
    apiActions.generateMessageSuccess({
      message: {
        role: 'assistant',
        content: '',
        toolCallIds: [replacement.id],
      },
      toolCalls: [replacement],
    }),
  );

  const settledState = reducer(
    replacementState,
    internalActions.toolTurnSettled({
      generationId: 'generation-1',
      toolTurnId: 'tool-turn-1',
      continuation: 'stop',
      toolCalls: [original],
      toolMessages: [
        {
          role: 'tool',
          toolCallId: original.id,
          toolName: original.name,
          content: {
            status: 'rejected',
            reason: new Error('Tool execution cancelled'),
          },
        },
      ],
      canonicalMessages: [],
    }),
  );

  expect(settledState.entities[replacement.id]).toBe(replacement);
});

test('keeps lifecycle tool calls in the draft, commits them, and replaces snapshot entities', () => {
  const initialized = reducer(
    undefined,
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
    }),
  );
  const updated = reducer(
    started,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'tool-1',
      delta: '{"q":1}',
    }),
  );
  const committed = reducer(
    updated,
    apiActions.generateMessageSuccess({
      message: { role: 'assistant', content: '', toolCallIds: ['tool-1'] },
      toolCalls: [],
    }),
  );
  const snapshotted = reducer(
    reducer(committed, internalActions.generationAttemptStarted()),
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [],
    }),
  );

  expect(updated.draft.entities['tool-1']).toMatchObject({
    arguments: '{"q":1}',
    status: 'pending',
  });
  expect(committed.entities['tool-1']).toMatchObject({ id: 'tool-1' });
  expect(snapshotted.ids).toEqual([]);
  expect(snapshotted.entities['tool-1']).toBeUndefined();
});

test('merges success tool decorations without replacing a canonical settled result', () => {
  const initialized = reducer(
    undefined,
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
    }),
  );
  const settled = reducer(
    started,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'result-1',
      toolCallId: 'tool-1',
      content: 'canonical result',
    }),
  );
  const successTool: Chat.Internal.ToolCall = {
    id: 'tool-1',
    name: 'lookup',
    arguments: '{"city":"Paris"}',
    argumentsResolved: { city: 'Paris' },
    encryptedValue: 'continuation',
    metadata: { source: 'accumulator' },
    status: 'pending',
  };

  const committed = reducer(
    settled,
    apiActions.generateMessageSuccess({
      message: { role: 'assistant', content: '', toolCallIds: ['tool-1'] },
      toolCalls: [successTool],
    }),
  );

  expect(committed.entities['tool-1']).toEqual({
    ...successTool,
    status: 'done',
    result: { status: 'fulfilled', value: 'canonical result' },
  });
});

test('active transaction commits the exact successful tool snapshot for guarded settlement', () => {
  const argumentsResolved = { city: 'Paris' };
  const successfulToolCall: Chat.Internal.ToolCall = {
    id: 'tool-1',
    name: 'lookup',
    arguments: '{"city":"Paris"}',
    argumentsResolved,
    status: 'pending',
  };
  const initialized = reducer(
    undefined,
    devActions.init({
      system: '',
      canonicalMessages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: successfulToolCall.id,
              type: 'function',
              function: {
                name: successfulToolCall.name,
                arguments: successfulToolCall.arguments,
              },
            },
          ],
        },
      ],
      localProjection: {
        messages: [
          {
            id: 'assistant-1',
            role: 'assistant',
            content: '',
            toolCallIds: [successfulToolCall.id],
          },
        ],
        toolCalls: [{ ...successfulToolCall }],
      },
    }),
  );
  const active = reducer(
    initialized,
    internalActions.generationAttemptStarted(),
  );

  const committed = reducer(
    active,
    apiActions.generateMessageSuccess({
      message: {
        role: 'assistant',
        content: '',
        toolCallIds: [successfulToolCall.id],
      },
      toolCalls: [successfulToolCall],
    }),
  );
  const settled = reducer(
    committed,
    internalActions.toolTurnSettled({
      generationId: 'generation-1',
      toolTurnId: 'tool-turn-1',
      continuation: 'stop',
      toolCalls: [successfulToolCall],
      toolMessages: [
        {
          role: 'tool',
          toolCallId: successfulToolCall.id,
          toolName: successfulToolCall.name,
          content: { status: 'fulfilled', value: 'sunny' },
        },
      ],
      canonicalMessages: [],
    }),
  );

  expect(committed.entities[successfulToolCall.id]).toBe(successfulToolCall);
  expect(settled.entities[successfulToolCall.id]).toMatchObject({
    status: 'done',
    result: { status: 'fulfilled', value: 'sunny' },
  });
});

test('keeps an idempotently started tool call active for an ID-less chunk', () => {
  const toolCall: Chat.Internal.ToolCall = {
    id: 'tool-1',
    name: 'lookup',
    arguments: '',
    status: 'pending',
  };
  const initialized = reducer(
    undefined,
    devActions.init({
      system: '',
      canonicalMessages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: toolCall.id,
              type: 'function',
              function: { name: toolCall.name, arguments: toolCall.arguments },
            },
          ],
        },
      ],
      localProjection: {
        messages: [
          {
            id: 'assistant-1',
            role: 'assistant',
            content: '',
            toolCallIds: ['tool-1'],
          },
        ],
        toolCalls: [toolCall],
      },
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
      toolCallId: toolCall.id,
      toolCallName: toolCall.name,
    }),
  );

  const continued = reducer(
    started,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      delta: '{"city":"Paris"}',
    }),
  );

  expect(continued.ids).toEqual(['tool-1']);
  expect(continued.entities['tool-1']).toMatchObject({
    arguments: '{"city":"Paris"}',
    status: 'pending',
  });
  expect(continued.activeToolCallId).toBe('tool-1');
});

test('preserves references for metadata-free stable tool-call replays', () => {
  const toolCall: Chat.Internal.ToolCall = {
    id: 'tool-1',
    name: 'lookup',
    arguments: '',
    status: 'pending',
  };
  const initialized = reducer(
    undefined,
    devActions.init({
      system: '',
      canonicalMessages: [],
      localProjection: { messages: [], toolCalls: [toolCall] },
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
      toolCallId: toolCall.id,
      toolCallName: toolCall.name,
    }),
  );
  const replayedStart = reducer(
    started,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: toolCall.id,
      toolCallName: toolCall.name,
    }),
  );
  const replayedChunk = reducer(
    started,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: toolCall.id,
      toolCallName: toolCall.name,
      delta: '',
    }),
  );

  expect(replayedStart).toBe(started);
  expect(replayedStart.draft).toBe(started.draft);
  expect(replayedStart.entities['tool-1']).toBe(started.entities['tool-1']);
  expect(replayedStart.activeToolCallId).toBe('tool-1');
  expect(replayedStart.activeToolCallName).toBe('lookup');
  expect(replayedChunk).toBe(started);
  expect(replayedChunk.draft).toBe(started.draft);
  expect(replayedChunk.entities['tool-1']).toBe(started.entities['tool-1']);
  expect(replayedChunk.activeToolCallId).toBe('tool-1');
  expect(replayedChunk.activeToolCallName).toBe('lookup');
});

test('settles canonical tool results in a draft and rollback restores committed status', () => {
  const canonical = [
    {
      id: 'assistant-1',
      role: 'assistant' as const,
      content: '',
      toolCalls: [
        {
          id: 'tool-1',
          type: 'function' as const,
          function: { name: 'lookup', arguments: '{}' },
        },
      ],
    },
  ];
  const initialized = reducer(
    undefined,
    devActions.init({ system: '', canonicalMessages: canonical }),
  );
  const active = reducer(
    initialized,
    internalActions.generationAttemptStarted(),
  );
  const settled = reducer(
    active,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'result-1',
      toolCallId: 'tool-1',
      content: 'value',
    }),
  );
  const rolledBack = reducer(
    settled,
    internalActions.generationAttemptRolledBack(),
  );

  expect(settled.entities['tool-1']).toMatchObject({
    status: 'done',
    result: { status: 'fulfilled', value: 'value' },
  });
  expect(rolledBack.entities['tool-1']).toMatchObject({ status: 'pending' });
});

test('stores rejected canonical tool results and commits the settled draft on success', () => {
  const canonical = [
    {
      id: 'assistant-1',
      role: 'assistant' as const,
      content: '',
      toolCalls: [
        {
          id: 'tool-1',
          type: 'function' as const,
          function: { name: 'lookup', arguments: '{}' },
        },
      ],
    },
  ];
  const initialized = reducer(
    undefined,
    devActions.init({ system: '', canonicalMessages: canonical }),
  );
  const active = reducer(
    initialized,
    internalActions.generationAttemptStarted(),
  );
  const rejected = reducer(
    active,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'result-1',
      toolCallId: 'tool-1',
      content: 'failed',
      error: 'failed',
    } as unknown as Parameters<typeof apiActions.generateMessageEvent>[0]),
  );
  const committed = reducer(
    rejected,
    apiActions.generateMessageSuccess({
      message: { role: 'assistant', content: '', toolCallIds: ['tool-1'] },
      toolCalls: [],
    }),
  );

  expect(rejected.entities['tool-1']).toMatchObject({
    status: 'done',
    result: { status: 'rejected', reason: 'failed' },
  });
  expect(committed.entities['tool-1']).toMatchObject({
    status: 'done',
    result: { status: 'rejected', reason: 'failed' },
  });
});

test('preserves fulfilled and rejected local tool settlement values outside an attempt', () => {
  const fulfilled: Chat.Internal.ToolCall = {
    id: 'fulfilled',
    name: 'lookup',
    arguments: '{}',
    status: 'pending',
  };
  const rejected: Chat.Internal.ToolCall = {
    id: 'rejected',
    name: 'lookup',
    arguments: '{}',
    status: 'pending',
  };
  const initial = reducer(
    undefined,
    apiActions.generateMessageSuccess({
      message: {
        role: 'assistant',
        content: '',
        toolCallIds: [fulfilled.id, rejected.id],
      },
      toolCalls: [fulfilled, rejected],
    }),
  );
  const reason = new Error('nope');
  const settled = reducer(
    initial,
    internalActions.toolTurnSettled({
      generationId: 'generation-1',
      toolTurnId: 'tool-turn-1',
      continuation: 'stop',
      toolCalls: [fulfilled, rejected],
      toolMessages: [
        {
          role: 'tool',
          toolCallId: fulfilled.id,
          toolName: fulfilled.name,
          content: { status: 'fulfilled', value: { answer: 1 } },
        },
        {
          role: 'tool',
          toolCallId: rejected.id,
          toolName: rejected.name,
          content: { status: 'rejected', reason },
        },
      ],
      canonicalMessages: [],
    }),
  );

  expect(settled.committed.entities[fulfilled.id]?.result).toEqual({
    status: 'fulfilled',
    value: { answer: 1 },
  });
  expect(settled.committed.entities[rejected.id]?.result).toEqual({
    status: 'rejected',
    reason,
  });
  expect(
    (settled.committed.entities[rejected.id]?.result as PromiseRejectedResult)
      .reason,
  ).toBe(reason);
});

test('separates send set and resend tool-cache supersession semantics', () => {
  const knownTool: Chat.Internal.Tool = {
    name: 'lookup',
    description: '',
    schema: s.object('arguments', { city: s.string('city') }),
    handler: async () => undefined,
  };
  const committedHistory = [
    {
      id: 'assistant-1',
      role: 'assistant' as const,
      content: '',
      toolCalls: [
        {
          id: 'tool-old',
          type: 'function' as const,
          function: { name: 'lookup', arguments: '{"city":"Paris"}' },
        },
      ],
    },
  ];
  const initialized = reducer(
    undefined,
    devActions.setMessages({
      messages: [],
      canonicalMessages: committedHistory,
      toolsByName: { lookup: knownTool },
    }),
  );
  const stale = reducer(
    reducer(initialized, internalActions.generationAttemptStarted()),
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool-stale',
      toolCallName: 'lookup',
    }),
  );
  const sent = reducer(
    stale,
    devActions.sendMessage({
      message: { role: 'user', content: 'next' },
      canonicalMessages: [],
    }),
  );
  const replaced = reducer(
    stale,
    devActions.setMessages({
      messages: [],
      canonicalMessages: [
        {
          id: 'assistant-2',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'tool-new',
              type: 'function',
              function: { name: 'lookup', arguments: '{"city":"Rome"}' },
            },
          ],
        },
      ],
      toolsByName: { lookup: knownTool },
    }),
  );
  const resent = reducer(stale, devActions.resendMessages());

  expect(sent.ids).toEqual(['tool-old']);
  expect(sent.entities['tool-old']?.argumentsResolved).toEqual({
    city: 'Paris',
  });
  expect(sent.entities['tool-stale']).toBeUndefined();
  expect(replaced.ids).toEqual(['tool-new']);
  expect(replaced.entities['tool-new']?.argumentsResolved).toEqual({
    city: 'Rome',
  });
  expect(replaced.entities['tool-old']).toBeUndefined();
  expect(resent.entities).toBe(initialized.committed.entities);
});

test('creates and commits a pending tool projection from compact chunks alone', () => {
  const initialized = reducer(
    undefined,
    devActions.init({ system: '', canonicalMessages: [] }),
  );
  const active = reducer(
    initialized,
    internalActions.generationAttemptStarted(),
  );
  const first = reducer(
    active,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'tool-1',
      toolCallName: 'lookup',
      delta: '{',
    }),
  );
  const continued = reducer(
    first,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      delta: '}',
    }),
  );
  const ended = reducer(
    continued,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_END,
      toolCallId: 'tool-1',
    }),
  );
  const committed = reducer(
    ended,
    apiActions.generateMessageSuccess({
      message: { role: 'assistant', content: '', toolCallIds: ['tool-1'] },
      toolCalls: [],
    }),
  );

  expect(continued.draft.entities['tool-1']).toEqual({
    id: 'tool-1',
    name: 'lookup',
    arguments: '{}',
    status: 'pending',
  });
  expect(ended.activeToolCallId).toBeUndefined();
  expect(ended.draft.entities['tool-1']).toEqual({
    ...continued.draft.entities['tool-1'],
    argumentsComplete: true,
  });
  expect(committed.entities['tool-1']).toEqual(ended.draft.entities['tool-1']);
});

test('TOOL_CALL_END records that the arguments are complete, once', () => {
  const initialized = reducer(
    undefined,
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
      toolCallId: 'call-render',
      toolCallName: 'render',
    }),
  );
  const streamed = reducer(
    started,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'call-render',
      delta: '{"text":"hi"}',
    }),
  );

  const ended = reducer(
    streamed,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_END,
      toolCallId: 'call-render',
    }),
  );
  const endedAgain = reducer(
    ended,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_END,
      toolCallId: 'call-render',
    }),
  );

  expect(
    streamed.draft.entities['call-render']?.argumentsComplete,
  ).toBeUndefined();
  expect(ended.draft.entities['call-render']).toEqual({
    id: 'call-render',
    name: 'render',
    arguments: '{"text":"hi"}',
    status: 'pending',
    argumentsComplete: true,
  });
  expect(endedAgain).toBe(ended);
});

test('ignores unknown tool args and end events without changing an active tool correlation', () => {
  const initialized = reducer(
    undefined,
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
      toolCallId: 'tool-active',
      toolCallName: 'lookup',
    }),
  );

  const unknownArgs = reducer(
    started,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'tool-unknown',
      delta: '{',
    }),
  );
  const unknownEnd = reducer(
    unknownArgs,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_END,
      toolCallId: 'tool-unknown',
    }),
  );

  expect(unknownArgs).toBe(started);
  expect(unknownEnd).toBe(started);
  expect(unknownEnd.entities['tool-unknown']).toBeUndefined();
  expect(unknownEnd.activeToolCallId).toBe('tool-active');
  expect(unknownEnd.activeToolCallName).toBe('lookup');
});

test('ignores an unknown compact tool chunk without borrowing another active name', () => {
  const initialized = reducer(
    undefined,
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
      toolCallId: 'tool-active',
      toolCallName: 'lookup',
    }),
  );

  const unknown = reducer(
    started,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_CHUNK,
      toolCallId: 'tool-unknown',
      delta: '{',
    }),
  );

  expect(unknown).toBe(started);
  expect(unknown.entities['tool-unknown']).toBeUndefined();
  expect(unknown.activeToolCallId).toBe('tool-active');
  expect(unknown.activeToolCallName).toBe('lookup');
});

test('keeps projection tool names canonical when compact chunks or success decorations conflict', () => {
  const initialized = reducer(
    undefined,
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
  const succeeded = reducer(
    active,
    apiActions.generateMessageSuccess({
      message: { role: 'assistant', content: '', toolCallIds: ['tool-1'] },
      toolCalls: [
        { id: 'tool-1', name: 'different', arguments: '{}', status: 'pending' },
      ],
    }),
  );

  expect(conflicted).toBe(active);
  expect(succeeded.entities['tool-1']?.name).toBe('lookup');
});

function createRootStore() {
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(devActions.init({ system: '', canonicalMessages: [] }));
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));
  return store;
}

function dispatchEvents(
  store: ReturnType<typeof createRootStore>,
  events: readonly AGUIEvent[],
) {
  for (const event of events) {
    store.dispatch(apiActions.generateMessageEvent(event));
  }
}

function readRootStep(
  store: ReturnType<typeof createRootStore>,
  toolCallId: string,
): unknown {
  return store.read(
    (state) => state.toolCalls.entities[toolCallId]?.metadata?.['b4.step'],
  );
}

test('a failed step survives a later fulfilled TOOL_CALL_RESULT step', () => {
  const store = createRootStore();
  dispatchEvents(store, [
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'c1',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-1',
    },
    {
      type: EventType.CUSTOM,
      name: 'b4.step',
      value: {
        toolCallId: 'c1',
        status: 'failed',
        error: { message: 'Timed out' },
      },
    },
  ]);

  dispatchEvents(store, [
    {
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'result-1',
      toolCallId: 'c1',
      content: 'ok',
      metadata: { 'b4.step': { v: 1, kind: 'server', status: 'completed' } },
    } as AGUIEvent,
  ]);

  expect(readRootStep(store, 'c1')).toMatchObject({
    status: 'failed',
    error: { message: 'Timed out' },
  });
});

test('a RESULT step beats the call step', () => {
  const canonical = [
    {
      id: 'assistant-1',
      role: 'assistant' as const,
      content: '',
      toolCalls: [
        {
          id: 'c1',
          type: 'function' as const,
          function: { name: 'lookup', arguments: '{}' },
        },
      ],
    },
  ];
  const initialized = reducer(
    undefined,
    devActions.init({ system: '', canonicalMessages: canonical }),
  );
  const active = reducer(
    initialized,
    internalActions.generationAttemptStarted(),
  );
  const resulted = reducer(
    active,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'result-1',
      toolCallId: 'c1',
      content: 'done',
      metadata: { 'b4.step': { v: 1, kind: 'server', status: 'denied' } },
    } as AGUIEvent),
  );

  const ended = reducer(
    resulted,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_END,
      toolCallId: 'c1',
      metadata: { 'b4.step': { v: 1, kind: 'server', status: 'completed' } },
    } as AGUIEvent),
  );

  expect(ended.entities['c1']?.metadata?.['b4.step']).toMatchObject({
    status: 'denied',
  });
});

test('a RESULT with no step completes a running step and clears its label', () => {
  const store = createRootStore();
  dispatchEvents(store, [
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'c1',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-1',
      metadata: {
        'b4.step': {
          v: 1,
          kind: 'server',
          status: 'running',
          label: 'Fetching',
        },
      },
    } as AGUIEvent,
  ]);

  dispatchEvents(store, [
    {
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'result-1',
      toolCallId: 'c1',
      content: 'ok',
    },
  ]);

  expect(readRootStep(store, 'c1')).toEqual({
    v: 1,
    kind: 'server',
    status: 'completed',
  });
});

test('a RESULT with an error and no step fails a running step', () => {
  const resultEvent = {
    type: EventType.TOOL_CALL_RESULT,
    messageId: 'result-1',
    toolCallId: 'c1',
    content: 'Rate limited',
    error: 'Rate limited',
  } as AGUIEvent;
  const store = createRootStore();
  dispatchEvents(store, [
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'c1',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-1',
      metadata: {
        'b4.step': {
          v: 1,
          kind: 'server',
          status: 'running',
          label: 'Fetching',
        },
      },
    } as AGUIEvent,
  ]);
  const initialized = reducer(
    undefined,
    devActions.init({
      system: '',
      canonicalMessages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'c1',
              type: 'function',
              function: { name: 'lookup', arguments: '{}' },
              metadata: {
                'b4.step': { v: 1, kind: 'server', status: 'running' },
              },
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

  dispatchEvents(store, [resultEvent]);
  const standalone = reducer(
    active,
    apiActions.generateMessageEvent(resultEvent),
  );

  const failed = {
    v: 1,
    kind: 'server',
    status: 'failed',
    error: { message: 'Rate limited' },
  };
  expect(readRootStep(store, 'c1')).toEqual(failed);
  expect(standalone.entities['c1']?.metadata?.['b4.step']).toEqual(failed);
});

test('a step on TOOL_CALL_START metadata takes the START timestamp as startedAt', () => {
  // Arrange
  const initialized = reducer(undefined, { type: '@@init' } as never);
  const active = reducer(
    initialized,
    internalActions.generationAttemptStarted(),
  );
  const step = { v: 1, kind: 'provider', status: 'running' };

  // Act
  const stamped = reducer(
    active,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'a',
      toolCallName: 'web_search',
      timestamp: 1234,
      metadata: { 'b4.step': step },
    } as AGUIEvent),
  );
  const kept = reducer(
    stamped,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'b',
      toolCallName: 'web_search',
      timestamp: 1234,
      metadata: { 'b4.step': { ...step, startedAt: 99 } },
    } as AGUIEvent),
  );
  const stepless = reducer(
    kept,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'c',
      toolCallName: 'web_search',
      timestamp: 1234,
    }),
  );
  const untimed = reducer(
    stepless,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'd',
      toolCallName: 'web_search',
      metadata: { 'b4.step': step },
    } as AGUIEvent),
  );

  // Assert
  expect(stamped.draft.entities['a']?.metadata?.['b4.step']).toEqual({
    ...step,
    startedAt: 1234,
  });
  expect(kept.draft.entities['b']?.metadata?.['b4.step']).toEqual({
    ...step,
    startedAt: 99,
  });
  expect(stepless.draft.entities['c']).not.toHaveProperty('metadata');
  expect(untimed.draft.entities['d']?.metadata?.['b4.step']).toEqual(step);
  expect(untimed.draft.entities['d']).not.toHaveProperty('arrivedAt');
});

test('the root store stamps a step from its START or CUSTOM timestamp only when it has no startedAt', () => {
  // Arrange
  const store = createRootStore();

  // Act
  dispatchEvents(store, [
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'c1',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-1',
      timestamp: 1000,
      metadata: { 'b4.step': { v: 1, kind: 'server', status: 'running' } },
    } as AGUIEvent,
    {
      type: EventType.CUSTOM,
      name: 'b4.step',
      value: { toolCallId: 'c1', status: 'completed' },
      timestamp: 3000,
    },
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'c2',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-1',
      timestamp: 1000,
    },
    {
      type: EventType.CUSTOM,
      name: 'b4.step',
      value: { toolCallId: 'c2', status: 'running', startedAt: 1200 },
      timestamp: 1500,
    },
  ]);

  // Assert
  expect(readRootStep(store, 'c1')).toEqual(
    expect.objectContaining({ status: 'completed', startedAt: 1000 }),
  );
  expect(readRootStep(store, 'c2')).toEqual(
    expect.objectContaining({ status: 'running', startedAt: 1200 }),
  );
});

test('a TOOL_CALL_START for a cancelled step reopens it as running', () => {
  const store = createRootStore();
  const cancelled = {
    v: 1,
    kind: 'server',
    status: 'cancelled',
    label: 'Waiting',
    settledAt: 99,
  };
  dispatchEvents(store, [
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'c1',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-1',
      metadata: { 'b4.step': cancelled },
    } as AGUIEvent,
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'c1',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-1',
    } as AGUIEvent,
  ]);

  const step = readRootStep(store, 'c1');

  expect(step).toMatchObject({ status: 'running' });
  expect(step).not.toHaveProperty('label');
  expect(step).not.toHaveProperty('settledAt');
});

test('a failed step after a RESULT completed the step replaces its label and sources', () => {
  const store = createRootStore();
  dispatchEvents(store, [
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'c1',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-1',
      metadata: {
        'b4.step': {
          v: 1,
          kind: 'server',
          status: 'running',
          label: 'Searching',
          icon: 'search',
          sources: [{ id: 's1', kind: 'url', title: 'A' }],
        },
      },
    } as AGUIEvent,
    { type: EventType.TOOL_CALL_END, toolCallId: 'c1' } as AGUIEvent,
    {
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'result-1',
      toolCallId: 'c1',
      content: 'ok',
    },
    {
      type: EventType.CUSTOM,
      name: 'b4.step',
      value: {
        toolCallId: 'c1',
        status: 'failed',
        label: 'Search failed',
        icon: 'alert',
      },
    } as AGUIEvent,
  ]);

  const step = readRootStep(store, 'c1');

  expect(step).toMatchObject({
    status: 'failed',
    label: 'Search failed',
    icon: 'alert',
  });
  expect(step).not.toHaveProperty('sources');
});

function frameOnlyResultEvents(error?: string): AGUIEvent[] {
  return [
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'c1',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-1',
    },
    { type: EventType.TOOL_CALL_END, toolCallId: 'c1' },
    {
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'result-1',
      toolCallId: 'c1',
      content: error ?? 'ok',
      ...(error === undefined ? {} : { error }),
    } as AGUIEvent,
  ];
}

function applyDraftEvents(events: readonly AGUIEvent[]) {
  const initialized = reducer(undefined, { type: '@@init' } as never);
  const active = reducer(
    initialized,
    internalActions.generationAttemptStarted(),
  );
  return events.reduce(
    (state, event) => reducer(state, apiActions.generateMessageEvent(event)),
    active,
  );
}

test('a running step after a frame-only RESULT stays completed on the draft and root paths', () => {
  // Arrange
  const store = createRootStore();
  const late: AGUIEvent[] = [
    {
      type: EventType.TOOL_CALL_END,
      toolCallId: 'c1',
      metadata: {
        'b4.step': { v: 1, status: 'running', label: 'Fetching' },
      },
    } as AGUIEvent,
  ];

  // Act
  const draft = applyDraftEvents([...frameOnlyResultEvents(), ...late]);
  dispatchEvents(store, [
    ...frameOnlyResultEvents(),
    {
      type: EventType.CUSTOM,
      name: 'b4.step',
      value: { v: 1, toolCallId: 'c1', status: 'running', label: 'Fetching' },
      timestamp: 1500,
    } as AGUIEvent,
  ]);

  // Assert
  const completed = { v: 1, kind: 'server', status: 'completed' };
  expect(draft.entities['c1']?.metadata?.['b4.step']).toEqual(completed);
  expect(readRootStep(store, 'c1')).toEqual(completed);
});

test('a denied step after a frame-only RESULT is denied on the draft and root paths', () => {
  // Arrange
  const store = createRootStore();

  // Act
  const draft = applyDraftEvents([
    ...frameOnlyResultEvents(),
    {
      type: EventType.TOOL_CALL_END,
      toolCallId: 'c1',
      metadata: { 'b4.step': { v: 1, status: 'denied' } },
    } as AGUIEvent,
  ]);
  dispatchEvents(store, [
    ...frameOnlyResultEvents(),
    {
      type: EventType.CUSTOM,
      name: 'b4.step',
      value: { v: 1, toolCallId: 'c1', status: 'denied' },
    } as AGUIEvent,
  ]);

  // Assert
  const denied = { v: 1, kind: 'server', status: 'denied' };
  expect(draft.entities['c1']?.metadata?.['b4.step']).toEqual(denied);
  expect(readRootStep(store, 'c1')).toEqual(denied);
});

test('a step after a frame-only RESULT with an error stays failed on the draft path', () => {
  // Arrange
  const late: AGUIEvent = {
    type: EventType.TOOL_CALL_END,
    toolCallId: 'c1',
    metadata: { 'b4.step': { v: 1, status: 'completed', label: 'Done' } },
  } as AGUIEvent;

  // Act
  const draft = applyDraftEvents([
    ...frameOnlyResultEvents('Rate limited'),
    late,
  ]);

  // Assert
  expect(draft.entities['c1']?.metadata?.['b4.step']).toEqual({
    v: 1,
    kind: 'server',
    status: 'failed',
    error: { message: 'Rate limited' },
  });
});

test('a RESULT error fails a step a call already completed on the draft and root paths', () => {
  // Arrange
  const store = createRootStore();
  const events: AGUIEvent[] = [
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'c1',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-1',
      metadata: {
        'b4.step': {
          v: 1,
          kind: 'server',
          status: 'completed',
          label: 'Looked up',
          icon: 'search',
        },
      },
    } as AGUIEvent,
    { type: EventType.TOOL_CALL_END, toolCallId: 'c1' },
    {
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'result-1',
      toolCallId: 'c1',
      content: 'Rate limited',
      error: 'Rate limited',
    } as AGUIEvent,
  ];

  // Act
  const draft = applyDraftEvents(events);
  dispatchEvents(store, events);

  // Assert
  const failed = {
    v: 1,
    kind: 'server',
    status: 'failed',
    icon: 'search',
    error: { message: 'Rate limited' },
  };
  expect(draft.entities['c1']?.metadata?.['b4.step']).toEqual(failed);
  expect(readRootStep(store, 'c1')).toEqual(failed);
});

test('a late CUSTOM step keeps the RESULT step label in the root store', () => {
  // Arrange
  const store = createRootStore();

  // Act
  dispatchEvents(store, [
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'c1',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-1',
    },
    {
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'result-1',
      toolCallId: 'c1',
      content: 'ok',
      metadata: { 'b4.step': { v: 1, status: 'completed', label: 'A' } },
    } as AGUIEvent,
    {
      type: EventType.CUSTOM,
      name: 'b4.step',
      value: { v: 1, toolCallId: 'c1', status: 'completed', label: 'B' },
    } as AGUIEvent,
  ]);

  // Assert
  expect(readRootStep(store, 'c1')).toEqual(
    expect.objectContaining({ status: 'completed', label: 'A' }),
  );
});

test('a late provider step after a frame-only RESULT keeps the server kind on the draft and root paths', () => {
  // Arrange
  const store = createRootStore();
  const value = { v: 1, status: 'completed', kind: 'provider' };

  // Act
  const draft = applyDraftEvents([
    ...frameOnlyResultEvents(),
    {
      type: EventType.TOOL_CALL_END,
      toolCallId: 'c1',
      metadata: { 'b4.step': value },
    } as AGUIEvent,
  ]);
  dispatchEvents(store, [
    ...frameOnlyResultEvents(),
    {
      type: EventType.CUSTOM,
      name: 'b4.step',
      value: { ...value, toolCallId: 'c1' },
    } as AGUIEvent,
  ]);

  // Assert
  const completed = { v: 1, kind: 'server', status: 'completed' };
  expect(draft.entities['c1']?.metadata?.['b4.step']).toEqual(completed);
  expect(readRootStep(store, 'c1')).toEqual(completed);
});

test('an empty RESULT error string completes a running step on the draft and root paths', () => {
  // Arrange
  const store = createRootStore();
  const events: AGUIEvent[] = [
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'c1',
      toolCallName: 'lookup',
      parentMessageId: 'assistant-1',
      metadata: { 'b4.step': { v: 1, status: 'running', label: 'Busy' } },
    } as AGUIEvent,
    {
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'result-1',
      toolCallId: 'c1',
      content: 'ok',
      error: '',
    } as AGUIEvent,
  ];

  // Act
  const draft = applyDraftEvents(events);
  dispatchEvents(store, events);

  // Assert
  const completed = { v: 1, kind: 'server', status: 'completed' };
  expect(draft.entities['c1']?.metadata?.['b4.step']).toEqual(completed);
  expect(readRootStep(store, 'c1')).toEqual(completed);
});

test('a step after a local result rejected with an Error fails with its message on the draft path', () => {
  // Arrange
  const toolCall: Chat.Internal.ToolCall = {
    id: 'c1',
    name: 'lookup',
    arguments: '{}',
    status: 'done',
    result: { status: 'rejected', reason: new Error('Rate limited') },
  };
  const initialized = reducer(
    undefined,
    devActions.init({
      system: '',
      canonicalMessages: [],
      localProjection: { messages: [], toolCalls: [toolCall] },
    }),
  );
  const active = reducer(
    initialized,
    internalActions.generationAttemptStarted(),
  );

  // Act
  const next = reducer(
    active,
    apiActions.generateMessageEvent({
      type: EventType.TOOL_CALL_END,
      toolCallId: 'c1',
      metadata: { 'b4.step': { v: 1, status: 'completed' } },
    } as AGUIEvent),
  );

  // Assert
  expect(next.entities['c1']?.metadata?.['b4.step']).toEqual({
    v: 1,
    kind: 'server',
    status: 'failed',
    error: { message: 'Rate limited' },
  });
});
