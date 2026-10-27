import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type AGUIEvent,
  EventType,
  type Message,
  type RunAgentInput,
} from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import {
  reducers,
  selectViewMessages,
  ɵprepareRootAction,
  ɵselectCommittedAgUiMessages,
} from '../reducers';
import { createCanonicalRunAgentInput } from '../transport/hashbrown-run-agent-input';
import { createStore } from '../utils/micro-ngrx';

const fixture = JSON.parse(
  readFileSync(
    join(__dirname, 'fixtures/langgraph-tool-step-events.json'),
    'utf8',
  ),
) as {
  events: AGUIEvent[];
  persisted: {
    tool_call_id: string;
    status: string;
    additional_kwargs: { b4_step: Record<string, unknown> };
  }[];
  snapshot: { messages: Message[] };
};
const user: Message = {
  id: 'user',
  role: 'user',
  content: 'Look up a record.',
};
const assistant: Message = {
  id: 'assistant-1',
  role: 'assistant',
  content: '',
  toolCalls: fixture.events.flatMap((event) =>
    event.type === EventType.TOOL_CALL_START
      ? [
          {
            id: event.toolCallId,
            type: 'function' as const,
            function: { name: event.toolCallName, arguments: '{}' },
          },
        ]
      : [],
  ),
};

/** Create the real root store with server tools and canonical message ownership. */
function rootStore(messages: Message[] = [user]) {
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(devActions.init({ system: '', canonicalMessages: messages }));
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));
  return store;
}

/** Read the public assistant projection, including streaming argument finality. */
function calls(store: ReturnType<typeof rootStore>) {
  return store
    .read(selectViewMessages)
    .flatMap((message) =>
      message.role === 'assistant' ? (message.serverToolCalls ?? []) : [],
    );
}

/** Serialize the committed canonical transcript as the next real transport input. */
function wireMessages(messages: readonly Message[]) {
  return (
    JSON.parse(
      JSON.stringify(
        createCanonicalRunAgentInput({
          threadId: 'thread',
          runId: 'next',
          messages: [...messages],
          state: undefined,
          tools: [],
        }),
      ),
    ) as RunAgentInput
  ).messages;
}

/** Restore a transport snapshot through the normal root action preparation. */
function restore(messages: Message[]) {
  const store = rootStore([]);
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: wireMessages(messages),
    }),
  );
  return store;
}

test('holds actual LangGraph CUSTOM steps until late START and preserves settled server outcomes', () => {
  const store = rootStore();
  const custom = fixture.events.filter(
    (event) => event.type === EventType.CUSTOM,
  );
  const standard = fixture.events.filter(
    (event) => event.type !== EventType.CUSTOM,
  );

  for (const event of custom)
    store.dispatch(apiActions.generateMessageEvent(event));
  const held = calls(store);
  for (const event of standard)
    store.dispatch(apiActions.generateMessageEvent(event));
  const live = calls(store);
  store.dispatch(
    apiActions.generateMessageSuccess({
      message: { role: 'assistant', content: '', toolCallIds: [] },
      toolCalls: [],
    }),
  );
  const committed = store.read(ɵselectCommittedAgUiMessages);
  const restored = restore([...wireMessages(committed)]);

  expect(held).toEqual([]);
  expect(live).toEqual([
    expect.objectContaining({
      toolCallId: 'call-success',
      name: 'lookup',
      status: 'complete',
      outcome: 'success',
      label: 'Found result',
      args: {},
      sources: [
        {
          id: 'source-1',
          kind: 'url',
          title: 'Example',
          href: 'https://example.com',
        },
      ],
      timing: { startedAt: 1700000000000, settledAt: 1700000000000 },
    }),
    expect.objectContaining({
      toolCallId: 'call-failure',
      name: 'broken',
      status: 'complete',
      outcome: 'failure',
      args: {},
      error: { message: 'upstream offline', code: 'OFFLINE' },
      timing: { startedAt: 1700000000000, settledAt: 1700000000000 },
    }),
  ]);
  expect(
    committed.find((message) => message.role === 'assistant'),
  ).toMatchObject({
    toolCalls: expect.arrayContaining([
      expect.objectContaining({
        id: 'call-failure',
        metadata: {
          'b4.step': expect.objectContaining({
            status: 'failed',
            error: { message: 'upstream offline', code: 'OFFLINE' },
          }),
        },
      }),
    ]),
  });
  expect(calls(restored)).toEqual(live);
  expect(
    restored.read((state) => state.agUiMessages.protocolError),
  ).toBeUndefined();
});

test('shows actual running helper output before settlement once the bridge announces START', () => {
  const store = rootStore();
  const start = fixture.events.find(
    (event) => event.type === EventType.TOOL_CALL_START,
  );
  const running = fixture.events[0];
  if (!start)
    throw new Error('The producer fixture must announce a tool call.');

  store.dispatch(apiActions.generateMessageEvent(running));
  const held = calls(store);
  store.dispatch(apiActions.generateMessageEvent(start));
  const announced = calls(store);

  expect(held).toEqual([]);
  expect(announced).toEqual([
    expect.objectContaining({
      toolCallId: 'call-success',
      status: 'inProgress',
      label: 'Looking up',
      timing: { startedAt: 1700000000000 },
    }),
  ]);
  expect(announced[0].outcome).toBeUndefined();
});

test('restores the producer checkpoint projection with readable failure and original assistant ownership', () => {
  const messages = [user, assistant, ...fixture.snapshot.messages];

  const store = restore(messages);
  const restored = calls(store);

  expect(
    wireMessages(store.read((state) => state.agUiMessages.draft)).find(
      (message) =>
        message.role === 'tool' && message.toolCallId === 'call-failure',
    ),
  ).toMatchObject({
    error: 'upstream offline',
    metadata: {
      'b4.step': {
        status: 'failed',
        error: { message: 'upstream offline', code: 'OFFLINE' },
      },
    },
  });
  expect(fixture.snapshot.messages[1]).toMatchObject({
    error: 'upstream offline',
    metadata: {
      'b4.step': {
        status: 'failed',
        error: { message: 'upstream offline', code: 'OFFLINE' },
      },
    },
  });
  expect(fixture.persisted[1]).toMatchObject({
    tool_call_id: 'call-failure',
    status: 'error',
    additional_kwargs: {
      b4_step: {
        status: 'failed',
        error: { message: 'upstream offline', code: 'OFFLINE' },
      },
    },
  });
  expect(
    fixture.persisted.every(
      (message) => !('toolCallId' in message.additional_kwargs.b4_step),
    ),
  ).toBe(true);
  expect(
    restored.map(({ toolCallId, outcome, label, sources, error, timing }) => ({
      toolCallId,
      outcome,
      label,
      sources,
      error,
      timing,
    })),
  ).toEqual([
    expect.objectContaining({
      toolCallId: 'call-success',
      outcome: 'success',
      label: 'Found result',
      sources: [
        {
          id: 'source-1',
          kind: 'url',
          title: 'Example',
          href: 'https://example.com',
        },
      ],
      timing: { startedAt: 1700000000000, settledAt: 1700000000000 },
    }),
    expect.objectContaining({
      toolCallId: 'call-failure',
      outcome: 'failure',
      error: { message: 'upstream offline', code: 'OFFLINE' },
      timing: { startedAt: 1700000000000, settledAt: 1700000000000 },
    }),
  ]);
  expect(
    store
      .read(selectViewMessages)
      .find((message) => message.role === 'assistant')?.id,
  ).toBe('assistant-1');
  expect(
    store.read((state) => state.agUiMessages.protocolError),
  ).toBeUndefined();
});
