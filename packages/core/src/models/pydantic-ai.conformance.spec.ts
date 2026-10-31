import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type AGUIEvent, type Message } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import {
  reducers,
  selectViewMessages,
  ɵprepareRootAction,
  ɵselectCommittedAgUiMessages,
} from '../reducers';
import { createCanonicalRunAgentInput } from '../transport/hashbrown-run-agent-input';
import { createStore } from '../utils/micro-ngrx';

const evidence = resolve(
  __dirname,
  '../../../../tools/conformance/agent-frameworks/python/evidence',
);

/** Parse retained producer bytes without replacing envelope identities or payloads. */
function eventsFor(scenario: string): AGUIEvent[] {
  return readFileSync(resolve(evidence, `${scenario}.sse`), 'utf8')
    .split(/\r?\n\r?\n/)
    .filter((frame) => frame.startsWith('data:'))
    .map((frame) => JSON.parse(frame.slice(5).trim()) as AGUIEvent);
}

/** Use the real prepared store and public projection, as the production consumer does. */
function consume(events: AGUIEvent[]) {
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(devActions.init({ system: '', canonicalMessages: [] }));
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));
  for (const event of events) {
    store.dispatch(apiActions.generateMessageEvent(event));
    expect(
      store.read((state) => state.agUiMessages.protocolError),
    ).toBeUndefined();
  }
  return store;
}

test('real Pydantic streaming text reaches the prepared store unchanged', () => {
  const events = eventsFor('streaming');
  const before = JSON.stringify(events);

  const store = consume(events);

  expect(
    store
      .read(selectViewMessages)
      .filter((message) => message.role === 'assistant')
      .map((message) => message.content)
      .join(''),
  ).toBe('Pydantic streaming answer.');
  expect(JSON.stringify(events)).toBe(before);
});

test('real Pydantic server tool survives canonical commit, JSON restore and next-run serialization', () => {
  const events = eventsFor('server-tool');
  const store = consume(events);
  const original = store.read(selectViewMessages);

  store.dispatch(
    apiActions.generateMessageSuccess({
      message: { role: 'assistant', content: '', toolCallIds: [] },
      toolCalls: [],
    }),
  );
  const messages = JSON.parse(
    JSON.stringify(store.read(ɵselectCommittedAgUiMessages)),
  ) as Message[];
  const restored = consume([
    { type: 'MESSAGES_SNAPSHOT', messages } as AGUIEvent,
  ]);
  const request = createCanonicalRunAgentInput({
    threadId: 'pydantic-next',
    runId: 'pydantic-next-run',
    messages,
    state: undefined,
    tools: [],
  });

  expect(restored.read(selectViewMessages)).toEqual(original);
  const calls = original.flatMap((message) =>
    message.role === 'assistant' ? (message.serverToolCalls ?? []) : [],
  );
  expect(calls).toHaveLength(1);
  expect(calls[0].status).toBe('complete');
  expect(calls[0].result).toEqual({
    status: 'fulfilled',
    value: expect.any(String),
  });
  expect(
    request.messages.some(
      (message) =>
        message.role === 'tool' && message.toolCallId === calls[0].toolCallId,
    ),
  ).toBe(true);
  expect(calls[0].metadata?.['b4.step']).toBeUndefined();
});

for (const scenario of ['failure', 'cancel-default', 'cancel-v1']) {
  test(`Pydantic ${scenario} preserves native result and opaque outcome without inferring tool status`, () => {
    const events = eventsFor(scenario);

    const store = consume(events);
    const calls = store
      .read(selectViewMessages)
      .flatMap((message) =>
        message.role === 'assistant' ? (message.serverToolCalls ?? []) : [],
      );

    expect(calls).toHaveLength(1);
    expect(calls[0].status).toBe('complete');
    expect(calls[0].result).toEqual({
      status: 'fulfilled',
      value: expect.any(String),
    });
    expect(calls[0].outcome).not.toBe('failure');
    expect(calls[0].outcome).not.toBe('cancelled');
    expect(calls[0].metadata?.['b4.step']).toBeUndefined();
    const terminal = events.at(-1) as AGUIEvent & {
      outcome?: { type: string };
    };
    expect(terminal.type).toBe(
      scenario === 'failure' ? 'RUN_ERROR' : 'RUN_FINISHED',
    );
    expect(terminal.outcome?.type).toBe(
      scenario === 'cancel-v1' ? 'cancelled' : undefined,
    );
  });
}

test('Pydantic client continuation consumes actual next-request history through the prepared store', () => {
  const request = JSON.parse(
    readFileSync(resolve(evidence, 'client-continuation.request.json'), 'utf8'),
  ) as { messages: Message[] };
  const events = eventsFor('client-continuation');

  const store = consume([
    { type: 'MESSAGES_SNAPSHOT', messages: request.messages } as AGUIEvent,
    ...events,
  ]);
  const projected = store.read(selectViewMessages);

  expect(
    projected.some(
      (message) =>
        message.role === 'assistant' &&
        message.content === 'Tool result: controlled-client-result:London',
    ),
  ).toBe(true);
  expect(
    request.messages.some(
      (message) =>
        message.role === 'tool' &&
        message.content === 'controlled-client-result:London',
    ),
  ).toBe(true);
});

test('Pydantic same-name rejection remains a run error without fabricated tool execution', () => {
  const events = eventsFor('server-same-name');

  const store = consume(events);

  expect(events.map((event) => event.type)).toEqual([
    'RUN_STARTED',
    'RUN_ERROR',
  ]);
  expect(
    store
      .read(selectViewMessages)
      .flatMap((message) =>
        message.role === 'assistant' ? (message.serverToolCalls ?? []) : [],
      ),
  ).toEqual([]);
});
