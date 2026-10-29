import { type AGUIEvent, EventType, type Message } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import { s } from '../schema';
import type { PendingInterruptBatch } from '../models/interrupt';
import { createStore } from '../utils/micro-ngrx';
import {
  reducers,
  selectStreamingMessageError,
  selectViewMessages,
  ɵprepareRootAction,
  ɵselectSubagents,
} from './index';

function subject(history: readonly Message[] = []) {
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(devActions.init({ system: '', canonicalMessages: history }));
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));
  return store;
}
function emit(store: ReturnType<typeof subject>, event: AGUIEvent) {
  store.dispatch(apiActions.generateMessageEvent(Object.freeze(event)));
}

test('root correlates chunks in independent owner lanes and rejects an ambiguous transaction', () => {
  const store = subject();
  emit(store, {
    type: EventType.TEXT_MESSAGE_CHUNK,
    messageId: 'a',
    subagentRunId: 'a',
    delta: 'A',
  });
  emit(store, {
    type: EventType.TEXT_MESSAGE_CHUNK,
    messageId: 'b',
    subagentRunId: 'b',
    delta: 'B',
  });
  emit(store, {
    type: EventType.TEXT_MESSAGE_CHUNK,
    subagentRunId: 'a',
    delta: '!',
  });
  const before = store.read((state) => state);

  emit(store, { type: EventType.TEXT_MESSAGE_CHUNK, delta: '?' });
  const after = store.read((state) => state);

  expect(before.agUiMessages.draft.map((message) => message.content)).toEqual([
    'A!',
    'B',
  ]);
  expect(after.agUiMessages.protocolError).toBeInstanceOf(Error);
  expect(after.agUiMessages.draft).toBe(before.agUiMessages.draft);
  expect(after.streamingMessage).toBe(before.streamingMessage);
  expect(after.messages).toBe(before.messages);
});

test('root validates child lifecycle through a live snapshot and rolls speculative records back', () => {
  const store = subject();
  emit(store, {
    type: EventType.SUBAGENT_STARTED,
    subagentRunId: 'a',
    name: 'A',
  });
  emit(store, { type: EventType.MESSAGES_SNAPSHOT, messages: [] });
  emit(store, { type: EventType.SUBAGENT_FINISHED, subagentRunId: 'a' });

  const state = store.read((state) => state.agUiMessages);
  store.dispatch(internalActions.generationAttemptRolledBack());
  const rolledBack = store.read((state) => state.agUiMessages);

  expect(state.subagents?.records[0]?.status).toBe('complete');
  expect(Object.isFrozen(state.subagents?.records)).toBe(true);
  expect(rolledBack.subagents?.records).toEqual([]);
});

test('root links native activities in their owner lane and synthesizes owned assistant parents', () => {
  const store = subject([{ id: 'old', role: 'assistant', content: 'old' }]);
  emit(store, {
    type: EventType.TEXT_MESSAGE_START,
    messageId: 'a',
    subagentRunId: 'a',
  });
  emit(store, {
    type: EventType.TEXT_MESSAGE_START,
    messageId: 'b',
    subagentRunId: 'b',
  });
  emit(store, {
    type: EventType.ACTIVITY_SNAPSHOT,
    messageId: 'activity',
    activityType: 'progress',
    content: {},
    subagentRunId: 'a',
  });
  emit(store, {
    type: EventType.TOOL_CALL_START,
    toolCallId: 't',
    toolCallName: 'search',
    subagentRunId: 'child',
  });

  const messages = store.read((state) => state.agUiMessages.draft);
  const activity = messages.find((message) => message.id === 'activity');
  const assistant = messages.find((message) => message.id === 'assistant-t');

  expect(activity).toMatchObject({
    hashbrownLinks: { assistantMessageId: 'a' },
  });
  expect(assistant).toMatchObject({ subagentRunId: 'child' });
  expect(
    assistant?.role === 'assistant' && assistant.toolCalls?.[0],
  ).not.toHaveProperty('subagentRunId');
});

test('root keeps partial structured output for both assistants across foreground switches', () => {
  const store = subject();
  const schema = s.object('answer', { value: s.streaming.string('value') });
  store.dispatch(devActions.updateOptions({ responseSchema: schema }));
  store.dispatch(
    apiActions.generateMessageStart({
      toolsByName: {},
      responseSchema: schema,
    }),
  );
  emit(store, {
    type: EventType.TEXT_MESSAGE_START,
    messageId: 'a',
    subagentRunId: 'a',
  });
  emit(store, {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'a',
    delta: '{"value":"hel',
  });
  emit(store, {
    type: EventType.TEXT_MESSAGE_START,
    messageId: 'b',
    subagentRunId: 'b',
  });
  emit(store, {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'b',
    delta: '{"value":"wor',
  });

  emit(store, {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'a',
    delta: 'lo',
  });
  const messages = store.read(selectViewMessages);

  expect(
    messages
      .filter((message) => message.role === 'assistant')
      .map((message) => message.content),
  ).toEqual([{ value: 'hello' }, { value: 'wor' }]);
});

function restoredWaiting() {
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  const batch = Object.freeze({
    id: 'batch',
    interrupts: Object.freeze([
      { id: 'i', reason: 'approval', subagentRunId: 'a' },
    ]),
  });
  store.dispatch(
    devActions.restoreConversation({
      expectedRevision: store.read((state) => state.recovery.revision),
      threadId: 'thread',
      canonicalMessages: [
        { id: 'a-message', role: 'assistant', content: '', subagentRunId: 'a' },
      ],
      state: undefined,
      toolsByName: {},
      batch,
    }),
  );
  return { store, batch };
}
function claimResume(
  store: ReturnType<typeof subject>,
  batch: PendingInterruptBatch,
  claimId = 'claim',
  status: 'resolved' | 'cancelled' = 'resolved',
) {
  store.dispatch(
    devActions.resume({
      claimId,
      batch,
      options: {
        batchId: batch.id,
        entries: [
          {
            interruptId: 'i',
            status,
            ...(status === 'resolved' ? { payload: true } : {}),
          },
        ],
      },
      checkpoint: {
        messages: [],
        state: undefined,
        responseSchema: undefined,
        requestResponseSchema: undefined,
        debounce: 0,
        retries: 0,
        internalTools: [],
        toolsByName: {},
        uiRequested: false,
        transportProvider: undefined,
      },
    }),
  );
  store.dispatch(
    internalActions.logicalGenerationStarted({ generationId: claimId }),
  );
  store.dispatch(internalActions.generationAttemptStarted());
}

test.each(['failed', 'cancelled'] as const)(
  'resume acknowledgement commits answered wait before %s continuation rollback',
  (outcome) => {
    const { store, batch } = restoredWaiting();
    claimResume(store, batch);
    emit(store, {
      type: EventType.RUN_STARTED,
      threadId: 'thread',
      runId: 'continuation',
    });

    store.dispatch(
      internalActions.resumeAcknowledged({
        generationId: 'claim',
        claimId: 'claim',
      }),
    );
    store.dispatch(internalActions.generationAttemptRolledBack());
    store.dispatch(
      internalActions.resumeSettled({ generationId: 'claim', outcome }),
    );
    const records = store.read((state) => state.agUiMessages.subagents.records);

    expect(records).toMatchObject([
      { subagentRunId: 'a', status: 'unknown', interruptIds: [] },
    ]);
  },
);

test('pre-ack failure and stale acknowledgement retain restored awaiting owner', () => {
  const { store, batch } = restoredWaiting();
  claimResume(store, batch);

  store.dispatch(
    internalActions.resumeAcknowledged({
      generationId: 'stale',
      claimId: 'stale',
    }),
  );
  store.dispatch(internalActions.generationAttemptRolledBack());
  store.dispatch(
    internalActions.resumeSettled({ generationId: 'claim', outcome: 'failed' }),
  );
  const records = store.read((state) => state.agUiMessages.subagents.records);

  expect(records).toMatchObject([
    { subagentRunId: 'a', status: 'awaiting', interruptIds: ['i'] },
  ]);
});

test('new unparented call in a fresh attempt does not reuse a historical assistant', () => {
  const store = subject([
    { id: 'historical', role: 'assistant', content: 'prior' },
  ]);

  emit(store, {
    type: EventType.TOOL_CALL_START,
    toolCallId: 'new-call',
    toolCallName: 'search',
  });
  const history = store.read((state) => state.agUiMessages.draft);

  expect(history).toHaveLength(2);
  expect(history[1]).toMatchObject({
    id: 'assistant-new-call',
    toolCalls: [{ id: 'new-call' }],
  });
});

test('restored reasoning rejects explicit owner changes atomically', () => {
  const store = subject([
    { id: 'r', role: 'reasoning', content: 'reason' },
    { id: 'a', role: 'assistant', content: 'answer' },
  ]);
  const before = store.read((state) => state);

  emit(store, {
    type: EventType.REASONING_MESSAGE_START,
    role: 'reasoning',
    messageId: 'r',
    subagentRunId: 'child',
    metadata: { changed: true },
  });
  const after = store.read((state) => state);

  expect(after.agUiMessages.protocolError).toBeInstanceOf(Error);
  expect(after.agUiMessages.draft).toBe(before.agUiMessages.draft);
  expect(after.messages).toBe(before.messages);
  expect(after.agUiMessages.subagents).toBe(before.agUiMessages.subagents);
});

test('unassigned child reasoning waits for its own assistant instead of the foreground parent', () => {
  const store = subject();
  emit(store, { type: EventType.TEXT_MESSAGE_START, messageId: 'parent' });
  emit(store, {
    type: EventType.REASONING_MESSAGE_CHUNK,
    messageId: 'r',
    subagentRunId: 'child',
    delta: 'thinking',
  });
  const before = store.read(selectViewMessages);

  emit(store, {
    type: EventType.TEXT_MESSAGE_START,
    messageId: 'child',
    subagentRunId: 'child',
  });
  const after = store.read(selectViewMessages);

  expect(before[0]).not.toHaveProperty('reasoning');
  expect(
    after.find(
      (message) =>
        message.role === 'assistant' && message.subagentRunId === 'child',
    ),
  ).toMatchObject({ reasoning: 'thinking' });
});

test('nonforeground native answer metadata survives unrelated custom reconciliation', () => {
  const store = subject();
  emit(store, {
    type: EventType.TEXT_MESSAGE_CHUNK,
    messageId: 'a',
    subagentRunId: 'a',
    delta: 'A',
  });
  emit(store, {
    type: EventType.TEXT_MESSAGE_CHUNK,
    messageId: 'b',
    subagentRunId: 'b',
    delta: 'B',
  });
  const metadata = Object.freeze({
    'b4.answer': Object.freeze({
      v: 1,
      citations: [{ sourceId: 'source' }],
      sources: [
        {
          id: 'source',
          kind: 'url',
          title: 'Source',
          href: 'https://example.com',
        },
      ],
    }),
  });

  emit(store, { type: EventType.TEXT_MESSAGE_END, messageId: 'a', metadata });
  emit(store, { type: EventType.CUSTOM, name: 'unrelated', value: {} });
  const view = store.read(selectViewMessages);

  expect(view[0]).toMatchObject({
    content: 'A',
    citations: [{ sourceId: 'source' }],
    sources: [{ id: 'source' }],
  });
  expect(view[1]).toMatchObject({ content: 'B' });
});

test('run completion validates every explicit structured parser including a nonforeground sibling', () => {
  const store = subject();
  const schema = s.object('answer', { value: s.string('value') });
  store.dispatch(
    apiActions.generateMessageStart({
      toolsByName: {},
      responseSchema: schema,
    }),
  );
  emit(store, {
    type: EventType.TEXT_MESSAGE_START,
    messageId: 'bad',
    subagentRunId: 'bad',
  });
  emit(store, {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'bad',
    delta: '{"value":',
  });
  emit(store, {
    type: EventType.TEXT_MESSAGE_START,
    messageId: 'good',
    subagentRunId: 'good',
  });
  emit(store, {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'good',
    delta: '{"value":"ok"}',
  });

  emit(store, {
    type: EventType.RUN_FINISHED,
    threadId: 'thread',
    runId: 'run',
  });
  const error = store.read(selectStreamingMessageError);

  expect(error).toBeInstanceOf(Error);
});

test('history and thread replacement clear lifecycle facts while reseeding native owners', () => {
  const store = subject();
  emit(store, {
    type: EventType.SUBAGENT_STARTED,
    subagentRunId: 'a',
    name: 'A',
  });
  emit(store, {
    type: EventType.TEXT_MESSAGE_CHUNK,
    messageId: 'a',
    subagentRunId: 'a',
    delta: 'A',
  });
  emit(store, { type: EventType.SUBAGENT_FINISHED, subagentRunId: 'a' });
  store.dispatch(apiActions.generateMessageSuccess({ toolCalls: [] }));
  const complete = store.read(ɵselectSubagents);

  store.dispatch(devActions.updateOptions({ threadId: 'new-thread' }));
  const reset = store.read(ɵselectSubagents);
  store.dispatch(
    devActions.setMessages({ messages: [], canonicalMessages: [] }),
  );

  expect(complete[0]).toMatchObject({ name: 'A', status: 'complete' });
  expect(reset).toEqual([
    { subagentRunId: 'a', status: 'unknown', interruptIds: [] },
  ]);
  expect(store.read(ɵselectSubagents)).toEqual([]);
});

test('retains two partial tool argument parsers while assistants interleave', () => {
  const store = subject();
  const tool = {
    name: 'search',
    description: '',
    schema: s.object('args', { query: s.streaming.string('query') }),
    handler: async () => undefined,
  };
  store.dispatch(
    devActions.init({ system: '', canonicalMessages: [], tools: [tool] }),
  );
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageStart({ toolsByName: { search: tool } }),
  );
  emit(store, {
    type: EventType.TOOL_CALL_START,
    toolCallId: 'ta',
    toolCallName: 'search',
    subagentRunId: 'a',
  });
  emit(store, {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: 'ta',
    delta: '{"query":"hel',
  });
  emit(store, {
    type: EventType.TOOL_CALL_START,
    toolCallId: 'tb',
    toolCallName: 'search',
    subagentRunId: 'b',
  });
  emit(store, {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: 'tb',
    delta: '{"query":"wor',
  });

  emit(store, {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: 'ta',
    delta: 'lo',
  });
  const messages = store.read(selectViewMessages);
  const calls = messages.flatMap((message) =>
    message.role === 'assistant' ? (message.toolCalls ?? []) : [],
  );

  expect(calls).toMatchObject([
    { toolCallId: 'ta', args: { query: 'hello' } },
    { toolCallId: 'tb', args: { query: 'wor' } },
  ]);
});

test('first untagged tool chunk resolves its parent owner before closing pending lanes', () => {
  const store = subject();
  emit(store, {
    type: EventType.TEXT_MESSAGE_CHUNK,
    messageId: 'parent',
    delta: 'parent',
  });
  emit(store, {
    type: EventType.TEXT_MESSAGE_CHUNK,
    messageId: 'child',
    subagentRunId: 'child',
    delta: 'child',
  });

  emit(store, {
    type: EventType.TOOL_CALL_CHUNK,
    toolCallId: 't',
    toolCallName: 'search',
    parentMessageId: 'child',
    delta: '{}',
  });
  const intermediate = store.read((state) => state.agUiMessages);
  emit(store, { type: EventType.TEXT_MESSAGE_CHUNK, delta: '!' });
  const history = store.read((state) => state.agUiMessages.draft);

  expect(intermediate.draftFinishedTextMessageIds).toContain('child');
  expect(intermediate.draftFinishedTextMessageIds).not.toContain('parent');
  expect(history[0].content).toBe('parent!');
  expect(history[1]).toMatchObject({
    subagentRunId: 'child',
    toolCalls: [{ id: 't' }],
  });
});

test('results keep independent parent attribution when their requester belongs to a child', () => {
  const store = subject();
  emit(store, {
    type: EventType.TOOL_CALL_START,
    toolCallId: 't',
    toolCallName: 'search',
    subagentRunId: '',
  });

  emit(store, {
    type: EventType.TOOL_CALL_RESULT,
    toolCallId: 't',
    messageId: 'result',
    content: 'done',
  });
  const history = store.read((state) => state.agUiMessages.draft);
  const view = store.read(selectViewMessages);

  expect(history.find((message) => message.id === 'result')).not.toHaveProperty(
    'subagentRunId',
  );
  expect(view[0]).toMatchObject({
    subagentRunId: '',
    serverToolCalls: [{ subagentRunId: '' }],
  });
  expect(
    view[0].role === 'assistant' && view[0].serverToolCalls?.[0],
  ).not.toHaveProperty('resultSubagentRunId');
});

test('owner-local steps reject foreign finishes and attributed state remains run scoped', () => {
  const store = subject();
  emit(store, {
    type: EventType.STATE_SNAPSHOT,
    snapshot: { value: 1 },
    subagentRunId: 'a',
  });
  emit(store, {
    type: EventType.STEP_STARTED,
    stepName: 'search',
    subagentRunId: 'a',
  });
  emit(store, {
    type: EventType.STEP_STARTED,
    stepName: 'search',
    subagentRunId: '',
  });
  const before = store.read((state) => state);

  emit(store, { type: EventType.STEP_FINISHED, stepName: 'search' });
  const rejected = store.read((state) => state);
  emit(store, {
    type: EventType.STEP_FINISHED,
    stepName: 'search',
    subagentRunId: 'a',
  });

  expect(rejected.agUiMessages.protocolError).toBeInstanceOf(Error);
  expect(rejected.agentState).toBe(before.agentState);
  expect(rejected.agUiMessages.subagents).toBe(before.agUiMessages.subagents);
  expect(store.read((state) => state.agentState.draft)).toEqual({ value: 1 });
});

function liveWaiting(extraUnanswered = false) {
  const store = subject();
  store.dispatch(
    internalActions.logicalGenerationStarted({ generationId: 'original' }),
  );
  store.dispatch(
    internalActions.generationAttemptClaimed({
      generationId: 'original',
      attemptId: 'attempt',
    }),
  );
  emit(store, {
    type: EventType.RUN_STARTED,
    threadId: 'thread',
    runId: 'original-run',
  });
  emit(store, {
    type: EventType.SUBAGENT_STARTED,
    subagentRunId: 'ancestor',
    name: 'Ancestor',
  });
  emit(store, {
    type: EventType.SUBAGENT_STARTED,
    subagentRunId: 'a',
    name: 'A',
    parentSubagentRunId: 'ancestor',
  });
  emit(store, {
    type: EventType.SUBAGENT_FINISHED,
    subagentRunId: 'a',
    outcome: { type: 'suspended', interruptIds: ['i'] },
  });
  if (extraUnanswered) {
    emit(store, {
      type: EventType.SUBAGENT_STARTED,
      subagentRunId: 'b',
      name: 'B',
      parentSubagentRunId: 'ancestor',
    });
    emit(store, {
      type: EventType.SUBAGENT_FINISHED,
      subagentRunId: 'b',
      outcome: { type: 'suspended', interruptIds: ['j'] },
    });
  }
  emit(store, {
    type: EventType.SUBAGENT_FINISHED,
    subagentRunId: 'ancestor',
    outcome: {
      type: 'suspended',
      ...(extraUnanswered ? { interruptIds: ['i', 'j'] } : {}),
    },
  });
  const batch = {
    id: 'batch',
    interrupts: [{ id: 'i', reason: 'approval', subagentRunId: 'a' }],
  };
  store.dispatch(
    internalActions.interruptsPublished({
      generationId: 'original',
      attemptId: 'attempt',
      batch,
    }),
  );
  store.dispatch(apiActions.generateMessageSuccess({ toolCalls: [] }));
  store.dispatch(
    internalActions.logicalGenerationSettled({ generationId: 'original' }),
  );
  return { store, batch };
}

test.each(['a', 'new-id'])(
  'acknowledged continuation %s does not leave the answered invocation waiting',
  (id) => {
    const { store, batch } = liveWaiting();
    claimResume(store, batch);
    emit(store, {
      type: EventType.RUN_STARTED,
      threadId: 'thread',
      runId: 'next',
    });

    store.dispatch(
      internalActions.resumeAcknowledged({
        generationId: 'claim',
        claimId: 'claim',
      }),
    );
    emit(store, {
      type: EventType.SUBAGENT_STARTED,
      subagentRunId: id,
      name: 'Continuation',
    });
    const records = store.read(ɵselectSubagents);
    store.dispatch(internalActions.generationAttemptRolledBack());

    expect(records.find((record) => record.subagentRunId === 'a')?.status).toBe(
      id === 'a' ? 'running' : 'unknown',
    );
    expect(
      records.find((record) => record.subagentRunId === 'ancestor')?.status,
    ).toBe('unknown');
    expect(
      store
        .read(ɵselectSubagents)
        .every((record) => record.status !== 'awaiting'),
    ).toBe(true);
  },
);

test('resume leaves a suspended ancestor awaiting its other known unanswered descendant', () => {
  const { store, batch } = liveWaiting(true);
  claimResume(store, batch);

  store.dispatch(
    internalActions.resumeAcknowledged({
      generationId: 'claim',
      claimId: 'claim',
    }),
  );
  const records = store.read(ɵselectSubagents);

  expect(records.find((record) => record.subagentRunId === 'a')?.status).toBe(
    'unknown',
  );
  expect(
    records.find((record) => record.subagentRunId === 'ancestor')?.status,
  ).toBe('awaiting');
  expect(records.find((record) => record.subagentRunId === 'b')?.status).toBe(
    'awaiting',
  );
});

test('superseding send discards speculative rows while preserving committed rows and new native owners', () => {
  const store = subject();
  emit(store, {
    type: EventType.SUBAGENT_STARTED,
    subagentRunId: 'committed',
    name: 'Committed',
  });
  emit(store, {
    type: EventType.SUBAGENT_FINISHED,
    subagentRunId: 'committed',
  });
  store.dispatch(apiActions.generateMessageSuccess({ toolCalls: [] }));
  const committed = store.read(ɵselectSubagents)[0];
  store.dispatch(internalActions.generationAttemptStarted());
  emit(store, {
    type: EventType.SUBAGENT_STARTED,
    subagentRunId: 'ghost',
    name: 'Ghost',
  });

  store.dispatch(
    devActions.sendMessage({
      message: { role: 'user', content: 'next' },
      canonicalMessages: [
        {
          id: 'user-next',
          role: 'user',
          content: 'next',
          subagentRunId: 'new-owner',
        },
      ],
    }),
  );
  const records = store.read(ɵselectSubagents);

  expect(records.map((record) => record.subagentRunId)).toEqual([
    'committed',
    'new-owner',
  ]);
  expect(records[0]).toBe(committed);
  expect(records[1].status).toBe('unknown');
});

test.each(['unknown', 'complete', 'failed'] as const)(
  'live interrupt publication associates attribution-only owner without overriding %s lifecycle',
  (status) => {
    const store = subject();
    store.dispatch(
      internalActions.logicalGenerationStarted({ generationId: 'original' }),
    );
    store.dispatch(
      internalActions.generationAttemptClaimed({
        generationId: 'original',
        attemptId: 'attempt',
      }),
    );
    if (status !== 'unknown') {
      emit(store, {
        type: EventType.SUBAGENT_STARTED,
        subagentRunId: 'a',
        name: 'A',
      });
      emit(
        store,
        status === 'complete'
          ? { type: EventType.SUBAGENT_FINISHED, subagentRunId: 'a' }
          : {
              type: EventType.SUBAGENT_ERROR,
              subagentRunId: 'a',
              message: 'failed',
            },
      );
    }
    const batch = {
      id: 'batch',
      interrupts: [{ id: 'i', reason: 'approval', subagentRunId: 'a' }],
    };
    emit(store, {
      type: EventType.RUN_FINISHED,
      threadId: 'thread',
      runId: 'original',
      outcome: { type: 'interrupt', interrupts: batch.interrupts },
    });

    store.dispatch(
      internalActions.interruptsPublished({
        generationId: 'original',
        attemptId: 'attempt',
        batch,
      }),
    );
    store.dispatch(apiActions.generateMessageSuccess({ toolCalls: [] }));
    const waiting = store.read(ɵselectSubagents);
    claimResume(store, batch);
    store.dispatch(
      internalActions.resumeAcknowledged({
        generationId: 'claim',
        claimId: 'claim',
      }),
    );

    expect(waiting[0]?.status).toBe(status === 'unknown' ? 'awaiting' : status);
    expect(store.read(ɵselectSubagents)[0]?.status).toBe(status);
  },
);

test('activities preserve latest same-owner tool arrival across a newer assistant', () => {
  const store = subject([
    {
      id: 'old-child',
      role: 'assistant',
      content: '',
      subagentRunId: 'child',
      toolCalls: [
        {
          id: 'old-tool',
          type: 'function',
          function: { name: 'search', arguments: '{}' },
        },
      ],
    },
    { id: 'new-child', role: 'assistant', content: '', subagentRunId: 'child' },
    { id: 'parent', role: 'assistant', content: '' },
  ]);

  emit(store, {
    type: EventType.ACTIVITY_SNAPSHOT,
    messageId: 'activity',
    activityType: 'progress',
    content: {},
    subagentRunId: 'child',
  });
  const activity = store.read((state) =>
    state.agUiMessages.draft.find((message) => message.id === 'activity'),
  );

  expect(activity).toMatchObject({
    hashbrownLinks: { assistantMessageId: 'new-child', toolCallId: 'old-tool' },
  });
});

test('stale resume batch and its later acknowledgement cannot resolve the owned waiting batch', () => {
  const { store, batch } = restoredWaiting();
  const before = store.read(ɵselectSubagents);

  claimResume(store, { ...batch, id: 'stale-batch' }, 'stale-claim');
  store.dispatch(
    internalActions.resumeAcknowledged({
      generationId: 'stale-claim',
      claimId: 'stale-claim',
    }),
  );

  expect(store.read(ɵselectSubagents)).toBe(before);
  expect(store.read((state) => state.interrupts.pending)).toBe(batch);
});

test('successive acknowledgements shrink ancestor wait associations until its final descendant answers', () => {
  const { store, batch } = liveWaiting(true);
  claimResume(store, batch);
  store.dispatch(
    internalActions.resumeAcknowledged({
      generationId: 'claim',
      claimId: 'claim',
    }),
  );
  const first = store.read(ɵselectSubagents);
  store.dispatch(internalActions.generationAttemptRolledBack());
  store.dispatch(
    internalActions.generationAttemptClaimed({
      generationId: 'claim',
      attemptId: 'next-attempt',
    }),
  );
  const secondBatch = {
    id: 'second-batch',
    interrupts: [{ id: 'j', reason: 'approval', subagentRunId: 'b' }],
  };
  store.dispatch(
    internalActions.interruptsPublished({
      generationId: 'claim',
      attemptId: 'next-attempt',
      batch: secondBatch,
    }),
  );
  store.dispatch(
    internalActions.resumeSettled({
      generationId: 'claim',
      outcome: 'success',
    }),
  );

  const options = {
    batchId: secondBatch.id,
    entries: [{ interruptId: 'j', status: 'resolved' as const }],
  };
  store.dispatch(
    devActions.resume({
      claimId: 'second-claim',
      batch: secondBatch,
      options,
      checkpoint: {
        messages: [],
        state: undefined,
        responseSchema: undefined,
        requestResponseSchema: undefined,
        debounce: 0,
        retries: 0,
        internalTools: [],
        toolsByName: {},
        uiRequested: false,
        transportProvider: undefined,
      },
    }),
  );
  store.dispatch(
    internalActions.logicalGenerationStarted({ generationId: 'second-claim' }),
  );
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    internalActions.resumeAcknowledged({
      generationId: 'second-claim',
      claimId: 'second-claim',
    }),
  );
  const second = store.read(ɵselectSubagents);

  expect(
    first.find((record) => record.subagentRunId === 'ancestor'),
  ).toMatchObject({ status: 'awaiting', interruptIds: ['j'] });
  expect(
    second.find((record) => record.subagentRunId === 'ancestor'),
  ).toMatchObject({ status: 'unknown', interruptIds: [] });
});

test.each([undefined, 'child', 'other'])(
  'activity history barriers respect a user owned by %s',
  (userOwner) => {
    const store = subject([
      { id: 'old', role: 'assistant', content: '', subagentRunId: 'child' },
      {
        id: 'user',
        role: 'user',
        content: 'next',
        ...(userOwner === undefined ? {} : { subagentRunId: userOwner }),
      },
    ]);

    emit(store, {
      type: EventType.ACTIVITY_SNAPSHOT,
      messageId: 'activity',
      activityType: 'progress',
      content: {},
      subagentRunId: 'child',
    });
    const activity = store.read((state) =>
      state.agUiMessages.draft.find((message) => message.id === 'activity'),
    ) as unknown as { hashbrownLinks: { assistantMessageId?: string } };

    expect(activity.hashbrownLinks.assistantMessageId).toBe(
      userOwner === 'other' ? 'old' : undefined,
    );
  },
);

test('response schema changes invalidate sibling streaming values before another transport event', () => {
  const store = subject();
  const schema = s.object('answer', { value: s.streaming.string('value') });
  store.dispatch(devActions.updateOptions({ responseSchema: schema }));
  store.dispatch(
    apiActions.generateMessageStart({
      toolsByName: {},
      responseSchema: schema,
    }),
  );
  emit(store, {
    type: EventType.TEXT_MESSAGE_START,
    messageId: 'a',
    subagentRunId: 'a',
  });
  emit(store, {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'a',
    delta: '{"value":"partial',
  });
  const before = store.read(selectViewMessages);

  store.dispatch(
    devActions.updateOptions({
      responseSchema: s.object('different', { count: s.number('count') }),
    }),
  );
  const after = store.read(selectViewMessages);

  expect(before[0]).toMatchObject({ content: { value: 'partial' } });
  expect(after[0]).toMatchObject({ content: '{"value":"partial' });
});

test('tool schema changes invalidate cached partial arguments before another transport event', () => {
  const store = subject();
  const tool = {
    name: 'search',
    description: '',
    schema: s.object('args', { query: s.streaming.string('query') }),
    handler: async () => undefined,
  };
  store.dispatch(
    devActions.init({ system: '', canonicalMessages: [], tools: [tool] }),
  );
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageStart({ toolsByName: { search: tool } }),
  );
  emit(store, {
    type: EventType.TOOL_CALL_START,
    toolCallId: 't',
    toolCallName: 'search',
  });
  emit(store, {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: 't',
    delta: '{"query":"partial',
  });
  const before = store.read(selectViewMessages);

  store.dispatch(
    devActions.updateOptions({
      tools: [
        {
          ...tool,
          schema: s.object('different', { count: s.number('count') }),
        },
      ],
    }),
  );
  const after = store.read(selectViewMessages);

  expect(before[0]).toMatchObject({
    toolCalls: [{ args: { query: 'partial' } }],
  });
  expect(after[0]).not.toMatchObject({
    toolCalls: [{ args: { query: 'partial' } }],
  });
});

test('a cloned same-token resume batch cannot substitute the current interrupt ownership', () => {
  const { store, batch } = restoredWaiting();
  const before = store.read(ɵselectSubagents);

  claimResume(
    store,
    {
      ...batch,
      interrupts: [{ id: 'i', reason: 'approval', subagentRunId: 'a' }],
    },
    'fake-claim',
  );
  store.dispatch(
    internalActions.resumeAcknowledged({
      generationId: 'fake-claim',
      claimId: 'fake-claim',
    }),
  );

  expect(store.read(ɵselectSubagents)).toBe(before);
});

test('subagent failure changes only its row and cannot settle the requesting tool', () => {
  const store = subject();
  emit(store, {
    type: EventType.TOOL_CALL_START,
    toolCallId: 'requester',
    toolCallName: 'search',
  });
  emit(store, {
    type: EventType.SUBAGENT_STARTED,
    subagentRunId: 'child',
    name: 'Child',
    parentToolCallId: 'requester',
  });
  const before = store.read((state) => state.agUiMessages.draft);

  emit(store, {
    type: EventType.SUBAGENT_ERROR,
    subagentRunId: 'child',
    message: 'child failed',
  });
  const after = store.read((state) => state.agUiMessages.draft);

  expect(store.read(ɵselectSubagents)[0]).toMatchObject({
    status: 'failed',
    error: { message: 'child failed' },
  });
  expect(after).toBe(before);
  expect(after.some((message) => message.role === 'tool')).toBe(false);
});

test('run finish rejects unclosed children without changing other root slices', () => {
  const store = subject();
  emit(store, {
    type: EventType.SUBAGENT_STARTED,
    subagentRunId: 'child',
    name: 'Child',
  });
  const before = store.read((state) => state);

  emit(store, {
    type: EventType.RUN_FINISHED,
    threadId: 'thread',
    runId: 'run',
  });
  const after = store.read((state) => state);

  expect(after.agUiMessages.protocolError).toBeInstanceOf(Error);
  expect(after.agentState).toBe(before.agentState);
  expect(after.status).toBe(before.status);
  expect(after.streamingMessage).toBe(before.streamingMessage);
  expect(after.agUiMessages.subagents).toBe(before.agUiMessages.subagents);
});

test('stored record arrays are frozen and sibling updates preserve unchanged row identity', () => {
  const store = subject();
  emit(store, {
    type: EventType.SUBAGENT_STARTED,
    subagentRunId: 'a',
    name: 'A',
  });
  emit(store, {
    type: EventType.SUBAGENT_STARTED,
    subagentRunId: 'b',
    name: 'B',
  });
  const before = store.read(ɵselectSubagents);

  emit(store, {
    type: EventType.SUBAGENT_FINISHED,
    subagentRunId: 'b',
    result: { nested: { value: true } },
  });
  const after = store.read(ɵselectSubagents);

  expect(Object.isFrozen(after)).toBe(true);
  expect(Object.isFrozen(after[1].result)).toBe(true);
  expect(after[0]).toBe(before[0]);
  expect(before[1].status).toBe('running');
});

test('repeated unrelated events preserve parser leaves and never nest aggregate caches', () => {
  const store = subject();
  const schema = s.object('answer', { value: s.streaming.string('value') });
  store.dispatch(devActions.updateOptions({ responseSchema: schema }));
  store.dispatch(
    apiActions.generateMessageStart({
      toolsByName: {},
      responseSchema: schema,
    }),
  );
  emit(store, {
    type: EventType.TEXT_MESSAGE_START,
    messageId: 'a',
    subagentRunId: 'a',
  });
  emit(store, {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'a',
    delta: '{"value":"partial',
  });
  const before = store.read((state) => state.streamingMessage);

  for (let index = 0; index < 5; index++) {
    emit(store, { type: EventType.RAW, event: { index } });
    emit(store, { type: EventType.CUSTOM, name: 'unrelated', value: index });
  }
  const after = store.read((state) => state.streamingMessage);

  expect(after).toBe(before);
  expect(after.message).toBe(before.message);
  expect(after.outputParserState).toBe(before.outputParserState);
  expect(after.accumulators?.get('a')).not.toHaveProperty('accumulators');
});

test('cancelled interrupt entries commit cancelled display state without inventing tool outcomes', () => {
  const { store, batch } = restoredWaiting();
  claimResume(store, batch, 'claim', 'cancelled');
  const history = store.read((state) => state.agUiMessages.committed);

  store.dispatch(
    internalActions.resumeAcknowledged({
      generationId: 'claim',
      claimId: 'claim',
    }),
  );
  store.dispatch(internalActions.generationAttemptRolledBack());

  expect(store.read(ɵselectSubagents)[0]).toMatchObject({
    status: 'cancelled',
    interruptIds: [],
  });
  expect(store.read((state) => state.agUiMessages.committed)).toBe(history);
});

test('implicit reasoning ends do not feed a future assistant first structured chunk twice', () => {
  const store = subject();
  const schema = s.object('answer', { value: s.streaming.string('value') });
  store.dispatch(devActions.updateOptions({ responseSchema: schema }));
  store.dispatch(
    apiActions.generateMessageStart({
      toolsByName: {},
      responseSchema: schema,
    }),
  );
  emit(store, {
    type: EventType.TEXT_MESSAGE_CHUNK,
    messageId: 'parent',
    delta: '{"value":"parent',
  });
  emit(store, {
    type: EventType.REASONING_MESSAGE_CHUNK,
    messageId: 'ra',
    subagentRunId: 'a',
    delta: 'Think A',
  });
  emit(store, {
    type: EventType.REASONING_MESSAGE_CHUNK,
    messageId: 'rb',
    subagentRunId: 'b',
    delta: 'Think B',
  });
  emit(store, {
    type: EventType.TEXT_MESSAGE_CHUNK,
    messageId: 'a',
    subagentRunId: 'a',
    delta: '{"value":"A',
  });
  emit(store, {
    type: EventType.TEXT_MESSAGE_CHUNK,
    messageId: 'b',
    subagentRunId: 'b',
    delta: '{"value":"B',
  });

  emit(store, {
    type: EventType.TEXT_MESSAGE_CHUNK,
    subagentRunId: 'a',
    delta: '!',
  });
  emit(store, { type: EventType.TEXT_MESSAGE_CHUNK, delta: '!' });
  const messages = store.read(selectViewMessages);

  expect(store.read(selectStreamingMessageError)).toBeUndefined();
  expect(
    store.read(
      (state) =>
        state.streamingMessage.accumulators?.get('a')
          ?.reasoningMessageStatusById['ra'],
    ),
  ).toBe('complete');
  expect(
    store.read(
      (state) =>
        state.streamingMessage.accumulators?.get('b')
          ?.reasoningMessageStatusById['rb'],
    ),
  ).toBe('complete');
  expect(messages).toMatchObject([
    { content: { value: 'parent!' } },
    { subagentRunId: 'a', content: { value: 'A!' }, reasoning: 'Think A' },
    { subagentRunId: 'b', content: { value: 'B' }, reasoning: 'Think B' },
  ]);
});

test('removing a registered tool invalidates its cached schema arguments before server rendering', () => {
  const store = subject();
  const tool = {
    name: 'search',
    description: '',
    schema: s.object('args', { query: s.streaming.string('query') }),
    handler: async () => undefined,
  };
  store.dispatch(
    devActions.init({ system: '', canonicalMessages: [], tools: [tool] }),
  );
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageStart({ toolsByName: { search: tool } }),
  );
  emit(store, {
    type: EventType.TOOL_CALL_START,
    toolCallId: 't',
    toolCallName: 'search',
  });
  emit(store, {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: 't',
    delta: '{"query":"partial',
  });
  const before = store.read(selectViewMessages);

  store.dispatch(
    devActions.updateOptions({
      tools: [
        {
          name: 'different',
          description: '',
          schema: s.object('other', {}),
          handler: async () => undefined,
        },
      ],
    }),
  );
  const after = store.read(selectViewMessages);

  expect(before[0]).toMatchObject({
    toolCalls: [{ args: { query: 'partial' } }],
  });
  expect(
    after[0].role === 'assistant' && after[0].serverToolCalls?.[0],
  ).not.toMatchObject({ args: { query: 'partial' } });
});

test('never-registered server tools retain raw parsed arguments when both schema configurations are absent', () => {
  const store = subject();
  emit(store, {
    type: EventType.TOOL_CALL_START,
    toolCallId: 't',
    toolCallName: 'server-search',
  });

  emit(store, {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: 't',
    delta: '{"query":"partial',
  });
  const view = store.read(selectViewMessages);

  expect(view[0]).toMatchObject({
    serverToolCalls: [{ toolCallId: 't', args: { query: 'partial' } }],
  });
});

test.each(['removed', 'changed'] as const)(
  'provider calls retain raw partial arguments when a same-named client registration is %s',
  (change) => {
    const store = subject();
    const tool = {
      name: 'search',
      description: '',
      schema: s.object('client args', { count: s.number('count') }),
      handler: async () => undefined,
    };
    store.dispatch(
      devActions.init({ system: '', canonicalMessages: [], tools: [tool] }),
    );
    store.dispatch(internalActions.generationAttemptStarted());
    store.dispatch(
      apiActions.generateMessageStart({ toolsByName: { search: tool } }),
    );
    emit(store, {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'provider',
      toolCallName: 'search',
      metadata: { 'b4.step': { v: 1, kind: 'provider' } },
    });
    emit(store, {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'provider',
      delta: '{"query":"partial',
    });
    const before = store.read(selectViewMessages);

    store.dispatch(
      devActions.updateOptions({
        tools: [
          {
            name: change === 'removed' ? 'different' : 'search',
            description: '',
            schema: s.object('other', {}),
            handler: async () => undefined,
          },
        ],
      }),
    );
    const after = store.read(selectViewMessages);

    expect(before[0]).toMatchObject({
      serverToolCalls: [{ args: { query: 'partial' } }],
    });
    expect(after[0]).toMatchObject({
      serverToolCalls: [{ args: { query: 'partial' } }],
    });
  },
);

test.each([EventType.RAW, EventType.CUSTOM] as const)(
  '%s preserves an unchanged partial tool parser, leaf and wrapper',
  (type) => {
    const store = subject();
    const tool = {
      name: 'search',
      description: '',
      schema: s.object('args', { query: s.streaming.string('query') }),
      handler: async () => undefined,
    };
    store.dispatch(
      devActions.init({ system: '', canonicalMessages: [], tools: [tool] }),
    );
    store.dispatch(internalActions.generationAttemptStarted());
    store.dispatch(
      apiActions.generateMessageStart({ toolsByName: { search: tool } }),
    );
    emit(store, {
      type: EventType.TOOL_CALL_START,
      toolCallId: 't',
      toolCallName: 'search',
      subagentRunId: 'a',
    });
    emit(store, {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 't',
      delta: '{"query":"partial',
    });
    const before = store.read((state) => state.streamingMessage);
    const leaf = before.accumulators?.get('assistant-t');

    emit(
      store,
      type === EventType.RAW
        ? { type, event: {} }
        : { type, name: 'unrelated', value: {} },
    );
    const after = store.read((state) => state.streamingMessage);

    expect(after).toBe(before);
    expect(after.accumulators?.get('assistant-t')).toBe(leaf);
    expect(after.toolCalls[0]).toBe(before.toolCalls[0]);
    expect(after.toolCalls[0].argumentsResolved).toBe(
      before.toolCalls[0].argumentsResolved,
    );
    expect(after.toolParserStateById['t']).toBe(
      before.toolParserStateById['t'],
    );
  },
);

test('partial tool reference reuse still accepts canonical metadata and independently attributed settlement', () => {
  const store = subject();
  const tool = {
    name: 'search',
    description: '',
    schema: s.object('args', { query: s.streaming.string('query') }),
    handler: async () => undefined,
  };
  store.dispatch(
    devActions.init({ system: '', canonicalMessages: [], tools: [tool] }),
  );
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageStart({ toolsByName: { search: tool } }),
  );
  emit(store, {
    type: EventType.TOOL_CALL_START,
    toolCallId: 't',
    toolCallName: 'search',
    subagentRunId: 'a',
  });
  emit(store, {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: 't',
    delta: '{"query":"partial',
  });
  const before = store.read((state) => state.streamingMessage.toolCalls[0]);

  emit(store, {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: 't',
    delta: '',
    metadata: { phase: 'canonical' },
  });
  const updated = store.read((state) => state.streamingMessage.toolCalls[0]);
  emit(store, {
    type: EventType.TOOL_CALL_RESULT,
    toolCallId: 't',
    messageId: 'result',
    content: 'done',
    subagentRunId: 'result-owner',
  });
  const settled = store.read((state) => state.streamingMessage.toolCalls[0]);

  expect(updated).not.toBe(before);
  expect(updated.argumentsResolved).toBe(before.argumentsResolved);
  expect(updated).toMatchObject({
    metadata: { phase: 'canonical' },
    subagentRunId: 'a',
  });
  expect(settled).not.toBe(updated);
  expect(settled).toMatchObject({
    status: 'done',
    subagentRunId: 'a',
    resultSubagentRunId: 'result-owner',
    result: { status: 'fulfilled', value: 'done' },
  });
});
