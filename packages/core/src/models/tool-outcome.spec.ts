import { mergeToolMetadata } from './tool-metadata';
import { reducer as toolCallsReducer } from '../reducers/tool-calls.reducer';
import {
  getServerToolCallLabel,
  groupServerToolCalls,
} from './server-tool-call-display';
import { type AGUIEvent, EventType, type Message } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import {
  reducers,
  selectViewMessages,
  ɵprepareRootAction,
  ɵselectCommittedAgUiMessages,
} from '../reducers';
import { createStore } from '../utils/micro-ngrx';
import { mergeToolOutcomeMetadata, readToolOutcome } from './tool-outcome';

const metadata = (outcome: string, error?: { message: string }) => ({
  'hashbrown.tool': { v: 1, outcome, ...(error ? { error } : {}) },
});

test('validates neutral terminal outcomes without interpreting result prose', () => {
  const values = [
    undefined,
    null,
    [],
    { v: 2, outcome: 'failure' },
    { v: 1, outcome: 'unknown' },
    { v: 1, outcome: 'success', error: 'malformed' },
    { v: 1, outcome: 'denied', error: { message: 42 } },
    { v: 1, outcome: 'failure', error: { message: '' } },
  ];

  const invalid = values.map((value) =>
    readToolOutcome({ 'hashbrown.tool': value }),
  );

  expect(invalid).toEqual(values.map(() => undefined));
  expect(
    readToolOutcome(metadata('failure', { message: 'actual failure' })),
  ).toEqual({ v: 1, outcome: 'failure', error: { message: 'actual failure' } });
});

test('preserves bad settlements against a later success and never mutates metadata', () => {
  for (const outcome of ['failure', 'denied', 'cancelled']) {
    const first = {
      ...metadata(
        outcome,
        outcome === 'failure' ? { message: 'failed' } : undefined,
      ),
      unrelated: { kept: true },
    };
    const before = JSON.stringify(first);

    const merged = mergeToolOutcomeMetadata(first, metadata('success'));

    expect(readToolOutcome(merged)?.outcome).toBe(outcome);
    expect(merged?.['unrelated']).toEqual({ kept: true });
    expect(JSON.stringify(first)).toBe(before);
  }
});

/** Feed the same prepared root-store boundary as production consumers. */
function consume(events: AGUIEvent[]) {
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(devActions.init({ system: '', canonicalMessages: [] }));
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));
  events.forEach((event) =>
    store.dispatch(apiActions.generateMessageEvent(event)),
  );
  return store;
}

for (const outcome of [
  'failure',
  'denied',
  'cancelled',
  'success',
  'interrupted',
  'retried',
]) {
  test(`generic ${outcome} survives the prepared store and canonical restore without B4 metadata`, () => {
    const extra = metadata(
      outcome,
      outcome === 'failure' ? { message: 'native tool failed' } : undefined,
    );
    const events: AGUIEvent[] = [
      { type: EventType.RUN_STARTED, threadId: 'thread', runId: 'run' },
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: 'call',
        toolCallName: 'serverTool',
        parentMessageId: 'assistant',
      },
      { type: EventType.TOOL_CALL_ARGS, toolCallId: 'call', delta: '{}' },
      { type: EventType.TOOL_CALL_END, toolCallId: 'call' },
      {
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: 'call',
        messageId: 'result',
        content: 'native result',
        metadata: extra,
      },
      { type: EventType.RUN_FINISHED, threadId: 'thread', runId: 'run' },
    ];

    const store = consume(events);
    store.dispatch(
      apiActions.generateMessageSuccess({
        message: { role: 'assistant', content: '', toolCallIds: [] },
        toolCalls: [],
      }),
    );
    const canonical = JSON.parse(
      JSON.stringify(store.read(ɵselectCommittedAgUiMessages)),
    ) as Message[];
    const restored = consume([
      { type: EventType.MESSAGES_SNAPSHOT, messages: canonical },
    ]);
    const projected = restored
      .read(selectViewMessages)
      .flatMap((message) =>
        message.role === 'assistant' ? (message.serverToolCalls ?? []) : [],
      );

    expect(
      store.read((state) => state.agUiMessages.protocolError),
    ).toBeUndefined();
    expect(projected[0]?.status).toBe('complete');
    expect(projected[0]?.outcome).toBe(outcome);
    expect(projected[0]?.error).toEqual(
      outcome === 'failure' ? { message: 'native tool failed' } : undefined,
    );
    expect(JSON.stringify(canonical)).not.toContain('b4.');
    expect(projected[0]?.metadata?.['hashbrown.tool']).toEqual(
      extra['hashbrown.tool'],
    );
  });
}

for (const first of ['failure', 'denied', 'cancelled'])
  test(`a later success cannot erase ${first} or create vendor metadata`, () => {
    const events: AGUIEvent[] = [
      { type: EventType.RUN_STARTED, threadId: 'thread', runId: 'run' },
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: 'call',
        toolCallName: 'serverTool',
        parentMessageId: 'assistant',
      },
      { type: EventType.TOOL_CALL_END, toolCallId: 'call' },
      {
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: 'call',
        messageId: 'result',
        content: 'settled',
        metadata: metadata(
          first,
          first === 'failure' ? { message: 'native failure' } : undefined,
        ),
      },
      {
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: 'call',
        messageId: 'result',
        content: 'late',
        metadata: metadata('success'),
      },
    ];

    const store = consume(events);
    const projected = store
      .read(selectViewMessages)
      .flatMap((message) =>
        message.role === 'assistant' ? (message.serverToolCalls ?? []) : [],
      );

    expect(projected[0]?.outcome).toBe(first);
    store.dispatch(
      apiActions.generateMessageSuccess({
        message: { role: 'assistant', content: '', toolCallIds: [] },
        toolCalls: [],
      }),
    );
    expect(
      JSON.stringify(store.read(ɵselectCommittedAgUiMessages)),
    ).not.toContain('b4.');
  });

test('interrupted and retried outcomes remain visible and never group as successes', () => {
  const calls = ['interrupted', 'retried'].map((outcome) => ({
    toolCallId: outcome,
    name: 'work',
    status: 'complete' as const,
    args: null,
    outcome: outcome as 'interrupted' | 'retried',
  }));

  const labels = calls.map((call) => getServerToolCallLabel(call));
  const groups = groupServerToolCalls(calls);

  expect(labels).toEqual(['Interrupted work', 'Retry requested for work']);
  expect(groups).toEqual(calls);
});

test('direct and prepared result paths preserve a prior frame error across neutral success', () => {
  const events: AGUIEvent[] = [
    { type: EventType.RUN_STARTED, threadId: 'thread', runId: 'run' },
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'call',
      toolCallName: 'serverTool',
      parentMessageId: 'assistant',
    },
    { type: EventType.TOOL_CALL_END, toolCallId: 'call' },
    {
      type: EventType.TOOL_CALL_RESULT,
      toolCallId: 'call',
      messageId: 'result',
      content: 'failed',
      error: 'frame failure',
    } as AGUIEvent,
    {
      type: EventType.TOOL_CALL_RESULT,
      toolCallId: 'call',
      messageId: 'result',
      content: 'late',
      metadata: metadata('success'),
    },
  ];
  let direct = toolCallsReducer(
    undefined,
    internalActions.generationAttemptStarted(),
  );

  for (const event of events)
    direct = toolCallsReducer(direct, apiActions.generateMessageEvent(event));
  const prepared = consume(events).read(
    (state) => state.toolCalls.entities['call'],
  );

  expect(direct.entities['call'].result).toEqual({
    status: 'rejected',
    reason: 'frame failure',
  });
  expect(prepared?.result).toEqual(direct.entities['call'].result);
});

test('absent metadata writes preserve existing metadata identity', () => {
  const existing = metadata('denied');

  const result = mergeToolMetadata(existing, undefined, 'call', 'call');

  expect(result).toBe(existing);
});
