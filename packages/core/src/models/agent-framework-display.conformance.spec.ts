import { readdirSync, readFileSync } from 'node:fs';
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

type FrameworkFixture = {
  framework: string;
  profile: string;
  versions: Record<string, string>;
  events: AGUIEvent[];
  expected: {
    calls: { name: string; args: unknown; result?: string }[];
    text?: string;
  };
};

/** Freeze a JSON capture recursively so replay cannot mutate producer evidence. */
function freezeJson<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
  return value;
}

const fixtureDirectory = join(__dirname, 'fixtures/agent-frameworks');
const fixtureFiles = readdirSync(fixtureDirectory)
  .filter((filename) => filename.endsWith('.json'))
  .sort();

/** Create the prepared root store used by the real AG-UI consumer. */
function rootStore(messages: Message[] = []) {
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(
    devActions.init({ system: '', canonicalMessages: freezeJson(messages) }),
  );
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));
  return store;
}

/** Read server calls from the public view without depending on internal entities. */
function serverCalls(store: ReturnType<typeof rootStore>) {
  return store
    .read(selectViewMessages)
    .flatMap((message) =>
      message.role === 'assistant' ? (message.serverToolCalls ?? []) : [],
    );
}

/** Serialize canonical history using the same next-run input as the transport. */
function nextRunInput(messages: readonly Message[]): RunAgentInput {
  return JSON.parse(
    JSON.stringify(
      createCanonicalRunAgentInput({
        threadId: 'framework-consumer-thread',
        runId: 'framework-consumer-next-run',
        messages: [...messages],
        state: undefined,
        tools: [],
      }),
    ),
  ) as RunAgentInput;
}

test('has captured real framework evidence to replay', () => {
  expect(fixtureFiles.length).toBeGreaterThan(0);
});

for (const filename of fixtureFiles) {
  const fixture = freezeJson(
    JSON.parse(
      readFileSync(join(fixtureDirectory, filename), 'utf8'),
    ) as FrameworkFixture,
  );

  test(`preserves ${fixture.framework} ${fixture.profile} server display through commit, JSON restore and next-run input`, () => {
    const originalCapture = JSON.stringify(fixture);
    const store = rootStore([
      { id: 'framework-consumer-user', role: 'user', content: 'Run the tool.' },
    ]);
    const starts = fixture.events.filter(
      (event) => event.type === EventType.TOOL_CALL_START,
    );

    for (const event of fixture.events) {
      store.dispatch(apiActions.generateMessageEvent(event));
      expect(
        store.read((state) => state.agUiMessages.protocolError),
      ).toBeUndefined();
    }
    const liveMessages = store.read(selectViewMessages);
    const liveCalls = serverCalls(store);
    store.dispatch(
      apiActions.generateMessageSuccess({
        message: { role: 'assistant', content: '', toolCallIds: [] },
        toolCalls: [],
      }),
    );
    const committed = store.read(ɵselectCommittedAgUiMessages);
    const wire = nextRunInput(freezeJson(committed));
    const restored = rootStore();
    restored.dispatch(
      apiActions.generateMessageEvent(
        freezeJson({
          type: EventType.MESSAGES_SNAPSHOT,
          messages: wire.messages,
        }),
      ),
    );
    restored.dispatch(
      apiActions.generateMessageSuccess({
        message: { role: 'assistant', content: '', toolCallIds: [] },
        toolCalls: [],
      }),
    );
    const nextWire = nextRunInput(restored.read(ɵselectCommittedAgUiMessages));

    expect(fixture.framework).not.toBe('');
    expect(fixture.profile).not.toBe('');
    expect(Object.keys(fixture.versions).length).toBeGreaterThan(0);
    expect(fixture.expected.calls.length).toBeGreaterThan(0);
    expect(starts).toHaveLength(fixture.expected.calls.length);
    expect(new Set(starts.map((event) => event.toolCallId)).size).toBe(
      starts.length,
    );
    expect(liveCalls.map(({ name, args }) => ({ name, args }))).toEqual(
      fixture.expected.calls.map(({ name, args }) => ({ name, args })),
    );
    expect(liveCalls.map((call) => call.toolCallId)).toEqual(
      starts.map((event) => event.toolCallId),
    );
    for (const [index, expected] of fixture.expected.calls.entries()) {
      const call = liveCalls[index];
      if (expected.result !== undefined) {
        expect(call.status).toBe('complete');
        expect(call.result).toEqual({
          status: 'fulfilled',
          value: expected.result,
        });
        expect(
          wire.messages.find(
            (message) =>
              message.role === 'tool' && message.toolCallId === call.toolCallId,
          ),
        ).toMatchObject({ content: expected.result });
      }
      expect(call.label).toBeUndefined();
      expect(call.icon).toBeUndefined();
      expect(call.sources).toBeUndefined();
      expect(call.builtin).toBeUndefined();
      expect(call.queries).toBeUndefined();
      expect(call.metadata?.['b4.step']).toBeUndefined();
    }
    if (fixture.expected.text !== undefined) {
      expect(
        liveMessages
          .filter((message) => message.role === 'assistant')
          .map((message) => message.content)
          .join(''),
      ).toBe(fixture.expected.text);
    }
    expect(serverCalls(store)).toEqual(liveCalls);
    expect(serverCalls(restored)).toEqual(liveCalls);
    expect(
      restored
        .read(selectViewMessages)
        .flatMap((message) =>
          message.role === 'assistant' ? message.toolCalls : [],
        ),
    ).toEqual([]);
    expect(nextWire.messages).toEqual(wire.messages);
    expect(
      store.read((state) => state.agUiMessages.protocolError),
    ).toBeUndefined();
    expect(
      restored.read((state) => state.agUiMessages.protocolError),
    ).toBeUndefined();
    expect(JSON.stringify(fixture)).toBe(originalCapture);
  });
}
