import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type AGUIEvent, EventType, type Message } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import {
  reducers,
  selectViewMessages,
  ɵprepareRootAction,
  ɵselectCommittedAgUiMessages,
  ɵselectVisibleAgentState,
} from '../reducers';
import { createCanonicalRunAgentInput } from '../transport/hashbrown-run-agent-input';
import { createStore } from '../utils/micro-ngrx';

const directory = resolve(__dirname, 'fixtures/pydantic-recipe');
/** Read only retained actual producer artifacts. */
function read(scenario: string, extension: string) {
  return JSON.parse(
    readFileSync(resolve(directory, `${scenario}.${extension}.json`), 'utf8'),
  );
}
/** Consume real SSE through the production prepared store. */
function consume(events: AGUIEvent[], canonicalMessages: Message[] = []) {
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(devActions.init({ system: '', canonicalMessages }));
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

for (const [scenario, outcome] of [
  ['server-tool', 'success'],
  ['failure', 'failure'],
  ['cancel-default', 'cancelled'],
  ['cancel-v1', 'cancelled'],
  ['approval-approve', 'success'],
  ['approval-deny', 'denied'],
]) {
  test(`installed Pydantic recipe ${scenario} survives actual wire, canonical restore and next request`, () => {
    const events = read(scenario, 'events') as AGUIEvent[];
    const request = read(scenario, 'request');
    const store = consume(events, request.messages);

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
    const next = createCanonicalRunAgentInput({
      threadId: request.threadId,
      runId: 'next',
      messages: canonical,
      state: undefined,
      tools: [],
    });
    const calls = restored
      .read(selectViewMessages)
      .flatMap((message) =>
        message.role === 'assistant' ? (message.serverToolCalls ?? []) : [],
      );

    expect(calls.at(-1)?.outcome).toBe(outcome);
    expect(calls.at(-1)?.status).toBe('complete');
    expect(JSON.stringify(next)).not.toContain('b4.');
    expect(
      next.messages.filter((message) => message.role === 'tool').at(-1)
        ?.metadata?.['hashbrown.tool'],
    ).toMatchObject({ v: 1, outcome });
    expect(restored.read(selectViewMessages)).toEqual(
      store.read(selectViewMessages),
    );
  });
}

test('native producer dump_messages denial restores as denial rather than canonical error failure', () => {
  const execution = read('approval-deny', 'execution');
  const messages = execution.wireHistory as Message[];

  const store = consume([{ type: EventType.MESSAGES_SNAPSHOT, messages }]);
  const calls = store
    .read(selectViewMessages)
    .flatMap((message) =>
      message.role === 'assistant' ? (message.serverToolCalls ?? []) : [],
    );

  expect(calls.at(-1)?.outcome).toBe('denied');
  expect(calls.at(-1)?.error).toBeUndefined();
  expect(JSON.stringify(messages)).not.toContain('b4.');
});

test('real native standard activity and state progress passes through the generic consumer', () => {
  const events = read('protocol', 'events') as AGUIEvent[];

  const store = consume(events);
  const messages = store.read(selectViewMessages);

  expect(messages.find((message) => message.role === 'activity')).toMatchObject(
    { activityType: 'progress', content: { progress: 1 } },
  );
  expect(JSON.stringify(messages)).not.toContain('b4.');
  expect(store.read(ɵselectVisibleAgentState)).toEqual({ progress: 1 });
});

test('actual overlapping producer threads remain isolated in separate prepared consumers', () => {
  const a = consume(read('isolation-a', 'events'));
  const b = consume(read('isolation-b', 'events'));

  const first = JSON.stringify(a.read(selectViewMessages));
  const second = JSON.stringify(b.read(selectViewMessages));

  expect(first).toContain('capture-isolation-a-server');
  expect(first).not.toContain('capture-isolation-b');
  expect(second).toContain('capture-isolation-b-server');
  expect(second).not.toContain('capture-isolation-a');
});
