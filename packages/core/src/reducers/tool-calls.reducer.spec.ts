import { EventType } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import { Chat } from '../models';
import { s } from '../schema';
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
  expect(committed.entities['tool-1']).toEqual(
    continued.draft.entities['tool-1'],
  );
});
