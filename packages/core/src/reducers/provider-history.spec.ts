import { type AGUIEvent, EventType, type Message } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import { createStore } from '../utils/micro-ngrx';
import { createCanonicalRunAgentInput } from '../transport/hashbrown-run-agent-input';
import { applyCanonicalMessageEvent } from './ag-ui-messages.reducer';
import {
  reducers,
  ɵprepareRootAction,
  ɵselectCommittedAgUiMessages,
} from './index';

const key = 'hashbrown.provider-history';
const marker = {
  anthropic: { responseId: 'response-1' },
  unrelated: { kept: true },
};
const envelope = (ownerMessageId = 'owner') => ({
  v: 1,
  provider: 'anthropic',
  ownerMessageId,
  responseId: 'response-1',
  complete: true,
  payload: { content: [{ type: 'opaque', value: 'signature' }] },
});
const footer = (value: unknown = envelope()): AGUIEvent => ({
  type: EventType.CUSTOM,
  name: key,
  value,
});
const call = {
  id: 'call',
  type: 'function' as const,
  function: { name: 'search', arguments: '{}' },
  metadata: marker,
};

for (const message of [
  { id: 'owner', role: 'assistant', content: 'answer', metadata: marker },
  { id: 'owner', role: 'assistant', toolCalls: [call] },
  {
    id: 'owner',
    role: 'tool',
    toolCallId: 'call',
    content: 'result',
    metadata: marker,
  },
  { id: 'owner', role: 'reasoning', content: 'thinking', metadata: marker },
] satisfies Message[]) {
  test(`folds the footer onto its ${message.role} owner ${'toolCalls' in message ? 'through invocation identity' : 'through message identity'}`, () => {
    const messages = [message];
    const input = envelope();
    const before = structuredClone(messages);

    const result = applyCanonicalMessageEvent(messages, footer(input));
    input.payload.content[0].value = 'changed';

    expect(result[0]).toEqual({
      ...message,
      metadata: { ...message.metadata, [key]: envelope() },
    });
    expect(messages).toEqual(before);
    expect(Object.isFrozen(result[0]?.metadata?.[key])).toBe(true);
  });
}

test.each([
  { id: 'owner', role: 'user', content: 'hello', metadata: marker },
  {
    id: 'owner',
    role: 'activity',
    activityType: 'progress',
    content: {},
    metadata: marker,
  },
  {
    id: 'owner',
    role: 'assistant',
    content: 'foreign',
    metadata: { anthropic: { responseId: 'other' } },
  },
  { id: 'owner', role: 'assistant', content: 'unmarked' },
] satisfies Message[])(
  'ignores a footer for an ineligible or mismatched owner %#',
  (message) => {
    const messages = [message];

    const result = applyCanonicalMessageEvent(messages, footer());

    expect(result).toBe(messages);
  },
);

test.each([
  envelope('missing'),
  { ...envelope(), v: 2 },
  { ...envelope(), payload: [] },
])('ignores missing targets and malformed footers %#', (value) => {
  const messages: Message[] = [
    { id: 'owner', role: 'assistant', content: 'hello', metadata: marker },
  ];

  const result = applyCanonicalMessageEvent(messages, footer(value));

  expect(result).toBe(messages);
});

test('duplicate structurally equal footers are no-ops regardless of key order', () => {
  const messages: Message[] = [
    { id: 'owner', role: 'assistant', content: 'hello', metadata: marker },
  ];
  const first = applyCanonicalMessageEvent(messages, footer());
  const reordered = {
    payload: envelope().payload,
    complete: true,
    responseId: 'response-1',
    ownerMessageId: 'owner',
    provider: 'anthropic',
    v: 1,
  };

  const repeated = applyCanonicalMessageEvent(first, footer(reordered));

  expect(repeated).toBe(first);
});

test('rejects conflicting valid footers transactionally in the real root store', () => {
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(
    devActions.init({
      system: '',
      canonicalMessages: [
        { id: 'owner', role: 'assistant', content: 'hello', metadata: marker },
      ],
    }),
  );
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));
  store.dispatch(apiActions.generateMessageEvent(footer()));
  const before = store.read((state) => state);

  store.dispatch(
    apiActions.generateMessageEvent(footer({ ...envelope(), complete: false })),
  );
  const result = store.read((state) => state);

  expect(before.agUiMessages.draft[0]?.metadata?.[key]).toEqual(envelope());
  expect(result.agUiMessages.protocolError).toBeInstanceOf(Error);
  expect(result.agUiMessages.draft).toBe(before.agUiMessages.draft);
  expect(result.messages).toBe(before.messages);
  expect(result.streamingMessage).toBe(before.streamingMessage);
  expect(result.toolCalls).toBe(before.toolCalls);
});

test('retains a live footer through real-store success, snapshots and the next wire request', () => {
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(devActions.init({ system: '', canonicalMessages: [] }));
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));
  const events: AGUIEvent[] = [
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'owner',
      role: 'assistant',
      metadata: marker,
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'owner',
      delta: 'hello',
    },
    { type: EventType.TEXT_MESSAGE_END, messageId: 'owner' },
    footer(),
  ];
  for (const event of events)
    store.dispatch(apiActions.generateMessageEvent(event));

  store.dispatch(
    apiActions.generateMessageSuccess({
      message: { role: 'assistant', content: 'hello', toolCallIds: [] },
      toolCalls: [],
    }),
  );
  const committed = store.read(ɵselectCommittedAgUiMessages);
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: JSON.parse(JSON.stringify(committed)),
    }),
  );
  const restored = store.read((state) => state.agUiMessages.draft);
  const wire = JSON.parse(
    JSON.stringify(
      createCanonicalRunAgentInput({
        threadId: 'thread',
        runId: 'next',
        messages: restored,
        state: undefined,
        tools: [],
      }),
    ),
  );

  expect(committed[0]?.metadata?.[key]).toEqual(envelope());
  expect(restored[0]?.metadata?.[key]).toEqual(envelope());
  expect(wire.messages[0].metadata[key]).toEqual(envelope());
  expect(committed[0]?.content).toBe('hello');
});

test('does not attach an older invocation response footer to a differently marked assistant', () => {
  const messages: Message[] = [
    {
      id: 'owner',
      role: 'assistant',
      toolCalls: [call],
      metadata: { anthropic: { responseId: 'later-response' } },
    },
  ];

  const result = applyCanonicalMessageEvent(messages, footer());

  expect(result).toBe(messages);
});

for (const scenario of [
  {
    name: 'tool-only assistant',
    initial: [] as Message[],
    events: [
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: 'call',
        toolCallName: 'search',
        parentMessageId: 'owner',
        metadata: marker,
      },
      { type: EventType.TOOL_CALL_ARGS, toolCallId: 'call', delta: '{}' },
      { type: EventType.TOOL_CALL_END, toolCallId: 'call' },
    ] satisfies AGUIEvent[],
  },
  {
    name: 'result-only tool message',
    initial: [
      { id: 'older', role: 'assistant', toolCalls: [call] },
    ] satisfies Message[],
    events: [
      {
        type: EventType.TOOL_CALL_RESULT,
        messageId: 'owner',
        toolCallId: 'call',
        content: 'native result',
        metadata: marker,
      },
    ] satisfies AGUIEvent[],
  },
  {
    name: 'reasoning-only message',
    initial: [] as Message[],
    events: [
      {
        type: EventType.REASONING_MESSAGE_START,
        messageId: 'owner',
        role: 'reasoning',
        metadata: marker,
      },
      {
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: 'owner',
        delta: 'thinking',
      },
      { type: EventType.REASONING_MESSAGE_END, messageId: 'owner' },
    ] satisfies AGUIEvent[],
  },
]) {
  test(`retains a live ${scenario.name} footer through root-store success and wire serialization`, () => {
    const store = createStore({
      reducers,
      effects: [],
      prepareAction: ɵprepareRootAction,
    });
    store.dispatch(
      devActions.init({ system: '', canonicalMessages: scenario.initial }),
    );
    store.dispatch(internalActions.generationAttemptStarted());
    store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));
    for (const event of scenario.events)
      store.dispatch(apiActions.generateMessageEvent(event));
    const before = store.read((state) => state);

    store.dispatch(apiActions.generateMessageEvent(footer()));
    const folded = store.read((state) => state);
    store.dispatch(
      apiActions.generateMessageSuccess({
        message: { role: 'assistant', content: '', toolCallIds: [] },
        toolCalls: [],
      }),
    );
    const committed = store.read(ɵselectCommittedAgUiMessages);
    const wire = JSON.parse(
      JSON.stringify(
        createCanonicalRunAgentInput({
          threadId: 'thread',
          runId: 'next',
          messages: committed,
          state: undefined,
          tools: [],
        }),
      ),
    );

    expect(folded.agUiMessages.protocolError).toBeUndefined();
    expect(folded.status).toEqual(before.status);
    expect(
      folded.agUiMessages.draft.map((message) => ({
        ...message,
        metadata: undefined,
      })),
    ).toEqual(
      before.agUiMessages.draft.map((message) => ({
        ...message,
        metadata: undefined,
      })),
    );
    expect(
      committed.find((message) => message.id === 'owner')?.metadata?.[key],
    ).toEqual(envelope());
    expect(
      wire.messages.find((message: Message) => message.id === 'owner').metadata[
        key
      ],
    ).toEqual(envelope());
    expect(
      committed.filter(
        (message) =>
          message.role === 'assistant' &&
          message.content === '' &&
          !message.toolCalls?.length,
      ),
    ).toHaveLength(0);
  });
}

test('rejects a second envelope owner for the same provider response', () => {
  const messages: Message[] = [
    { id: 'first', role: 'assistant', content: 'answer', metadata: marker },
    { id: 'owner', role: 'reasoning', content: 'thinking', metadata: marker },
  ];
  const first = applyCanonicalMessageEvent(messages, footer(envelope('first')));

  expect(() => applyCanonicalMessageEvent(first, footer())).toThrow(
    'Conflicting provider history',
  );
  expect(first[1]?.metadata?.[key]).toBeUndefined();
  expect(first[0]?.metadata?.[key]).toEqual(envelope('first'));
});

test('does not accept inherited provider response identity', () => {
  const metadata = Object.create(marker) as Record<string, unknown>;
  const messages: Message[] = [
    { id: 'owner', role: 'assistant', content: 'answer', metadata },
  ];

  const result = applyCanonicalMessageEvent(messages, footer());

  expect(result).toBe(messages);
});
