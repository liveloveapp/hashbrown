/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventType } from '@ag-ui/core';
import {
  Injector,
  type Provider,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  createSelectionSchema,
  type Decision,
  DecisionSchemaError,
  type TransportRequest,
  ɵcompileDecision,
} from '@hashbrownai/core';
import { vi } from 'vitest';
import { provideHashbrown } from '../providers';
import { createUiKit } from '../utils/ui-kit.fn';
import { uiChatResource } from './ui-chat-resource.fn';
import { uiDecisionResource } from './ui-decision-resource.fn';

type Call = { request: Decision.Request; signal: AbortSignal };

function createFakeTransport(
  respond: (request: Decision.Request) => Decision.Response,
) {
  const calls: Call[] = [];
  const transport: Decision.Transport = async (request, signal) => {
    calls.push({ request, signal });
    return respond(request);
  };
  return { calls, transport };
}

function deferredTransport() {
  const calls: Call[] = [];
  let resolve: (response: Decision.Response) => void = () => undefined;
  const transport: Decision.Transport = (request, signal) => {
    calls.push({ request, signal });
    return new Promise((r) => {
      resolve = r;
    });
  };
  return { calls, transport, resolve: (r: Decision.Response) => resolve(r) };
}

function pickResponse(
  pick: string,
  confidence: number,
  ids: string[],
): Decision.Response {
  return {
    kind: 'hashbrown.decision',
    version: 1,
    value: { pick },
    meta: {
      pick: {
        confidence,
        probabilities: Object.fromEntries(
          ids.map((id) => [id, id === pick ? confidence : 1 - confidence]),
        ),
      },
    },
  };
}

function multiResponse(
  probabilities: Record<string, number>,
): Decision.Response {
  return {
    kind: 'hashbrown.decision',
    version: 1,
    value: Object.fromEntries(
      Object.entries(probabilities).map(([id, p]) => [id, p >= 0.5]),
    ),
    meta: Object.fromEntries(
      Object.entries(probabilities).map(([id, p]) => [id, { probability: p }]),
    ),
  };
}

async function settle() {
  for (let i = 0; i < 5; i++) {
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  TestBed.tick();
}

function configure(transport: Decision.Transport, providers: Provider[] = []) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideHashbrown({ decision: { transport } }), ...providers],
  });
}

class FlightCard {}
class AirportCard {}
class WeatherCard {}

const candidates = [
  { id: 'flight', description: 'One aircraft', component: FlightCard },
  { id: 'airport', description: 'An airport', component: AirportCard },
  { id: 'weather', description: 'The weather', component: WeatherCard },
];

const flight = {
  component: FlightCard,
  name: 'Flight',
  description: 'One aircraft',
};
const airport = {
  component: AirportCard,
  name: 'Airport',
  description: 'An airport',
};

class NoteCard {}
class RowCard {}
class TableCard {}
const note = { component: NoteCard, name: 'Note', description: 'A note' };
const row = { component: RowCard, name: 'Row', description: 'A table row' };
const table = {
  component: TableCard,
  name: 'Table',
  description: 'A table of rows',
  children: [row],
};

test("uiDecisionResource candidates 'one' chooses only the picked candidate", async () => {
  const fake = createFakeTransport(() =>
    pickResponse('airport', 0.9, ['flight', 'airport', 'weather']),
  );
  configure(fake.transport);

  const ref = TestBed.runInInjectionContext(() =>
    uiDecisionResource({
      input: signal('show KSFO'),
      candidates,
      select: 'one',
    }),
  );
  await settle();

  expect(ref.ids()).toEqual(['airport']);
  expect(ref.chosen().map((candidate) => candidate.component)).toEqual([
    AirportCard,
  ]);
  expect(ref.decision.value()).toEqual({ pick: 'airport' });
  expect(ref.isLoading()).toBe(false);
  expect(ref.error()).toBeUndefined();
  expect(fake.calls).toHaveLength(1);
});

test('uiDecisionResource candidates read signal inputs reactively without a new request', async () => {
  const fake = createFakeTransport(() =>
    pickResponse('flight', 0.9, ['flight', 'airport']),
  );
  configure(fake.transport);
  const flightInputs = signal<Record<string, unknown>>({ tail: 'N123' });
  const ref = TestBed.runInInjectionContext(() =>
    uiDecisionResource({
      input: signal('N123'),
      candidates: [
        {
          id: 'flight',
          description: 'One aircraft',
          component: FlightCard,
          inputs: flightInputs,
        },
        {
          id: 'airport',
          description: 'An airport',
          component: AirportCard,
          inputs: { code: 'KSFO' },
        },
      ],
      select: 'one',
    }),
  );
  await settle();
  const before = ref.chosen().map((candidate) => candidate.inputs);

  flightInputs.set({ tail: 'N456' });
  await settle();

  expect(before).toEqual([{ tail: 'N123' }]);
  expect(ref.chosen().map((candidate) => candidate.inputs)).toEqual([
    { tail: 'N456' },
  ]);
  expect(fake.calls).toHaveLength(1);
});

test('uiDecisionResource candidates { max: 2 } chooses in probability order', async () => {
  const fake = createFakeTransport(() =>
    multiResponse({ flight: 0.6, airport: 0.2, weather: 0.95 }),
  );
  configure(fake.transport);

  const ref = TestBed.runInInjectionContext(() =>
    uiDecisionResource({
      input: signal('storm'),
      candidates,
      select: { max: 2 },
    }),
  );
  await settle();

  expect(ref.ids()).toEqual(['weather', 'flight']);
  expect(ref.chosen().map((candidate) => candidate.id)).toEqual([
    'weather',
    'flight',
  ]);
});

test('uiDecisionResource candidates below minConfidence chooses nothing', async () => {
  const fake = createFakeTransport(() =>
    pickResponse('airport', 0.4, ['flight', 'airport', 'weather']),
  );
  configure(fake.transport);

  const ref = TestBed.runInInjectionContext(() =>
    uiDecisionResource({
      input: signal('hmm'),
      candidates,
      select: 'one',
      minConfidence: 0.7,
    }),
  );
  await settle();

  expect(ref.decision.value()).not.toBeNull();
  expect(ref.ids()).toEqual([]);
  expect(ref.chosen()).toEqual([]);
});

test('uiDecisionResource candidates with no candidates chooses nothing without a request', async () => {
  const fake = createFakeTransport(() =>
    pickResponse('flight', 0.9, ['flight']),
  );
  configure(fake.transport);

  const ref = TestBed.runInInjectionContext(() =>
    uiDecisionResource({
      input: signal('hello'),
      candidates: [],
      select: 'one',
    }),
  );
  await settle();

  expect(ref.ids()).toEqual([]);
  expect(ref.chosen()).toEqual([]);
  expect(ref.error()).toBeUndefined();
  expect(fake.calls).toHaveLength(0);
});

test('uiDecisionResource sends system with the input to the selection decision', async () => {
  const fake = createFakeTransport(() =>
    pickResponse('airport', 0.9, ['flight', 'airport', 'weather']),
  );
  configure(fake.transport);

  const ref = TestBed.runInInjectionContext(() =>
    uiDecisionResource({
      input: signal('show KSFO'),
      system: 'You pick cards in a flight-tracking app.',
      candidates,
      select: 'one',
    }),
  );
  await settle();

  expect(ref.ids()).toEqual(['airport']);
  expect(fake.calls[0].request.state).toEqual({
    system: 'You pick cards in a flight-tracking app.',
    input: 'show KSFO',
  });
});

test("uiDecisionResource shuffles the selection options with optionOrder: 'shuffled'", async () => {
  const random = vi.spyOn(Math, 'random').mockReturnValue(0);
  const fake = createFakeTransport(() =>
    pickResponse('airport', 0.9, ['flight', 'airport', 'weather']),
  );
  configure(fake.transport);

  try {
    TestBed.runInInjectionContext(() =>
      uiDecisionResource({
        input: signal('show KSFO'),
        optionOrder: 'shuffled',
        candidates,
        select: 'one',
      }),
    );
    await settle();
  } finally {
    random.mockRestore();
  }

  const question = fake.calls[0].request.questions['pick'] as {
    options: Record<string, string | null>;
  };
  expect(Object.keys(question.options)).toEqual([
    'airport',
    'weather',
    'flight',
  ]);
});

test('uiDecisionResource debounces the selection decision with debounce', async () => {
  const fake = createFakeTransport(() =>
    pickResponse('airport', 0.9, ['flight', 'airport', 'weather']),
  );
  configure(fake.transport);
  const input = signal('show');

  const ref = TestBed.runInInjectionContext(() =>
    uiDecisionResource({ input, debounce: 50, candidates, select: 'one' }),
  );
  TestBed.tick();
  vi.useFakeTimers();
  try {
    input.set('show KSFO');
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(60);
  } finally {
    vi.useRealTimers();
  }
  await settle();

  expect(ref.ids()).toEqual(['airport']);
  expect(fake.calls).toHaveLength(1);
  expect(fake.calls[0].request.state).toBe('show KSFO');
});

test('uiDecisionResource candidates asks byte-identical questions to createSelectionSchema with the same candidates', async () => {
  const fake = createFakeTransport(() =>
    pickResponse('airport', 0.9, ['flight', 'airport', 'weather']),
  );
  configure(fake.transport);

  TestBed.runInInjectionContext(() =>
    uiDecisionResource({
      input: signal('show KSFO'),
      candidates,
      select: 'one',
    }),
  );
  await settle();

  const pinned = ɵcompileDecision(createSelectionSchema(candidates, 'one'));
  expect(fake.calls).toHaveLength(1);
  expect(JSON.stringify(fake.calls[0].request.questions)).toBe(
    JSON.stringify(pinned),
  );
});

// ---------------------------------------------------------------------------
// Chat mode
// ---------------------------------------------------------------------------

const chatComponents = [
  flight,
  createUiKit({ components: [table, note] }),
  airport,
];
const allNames = ['Flight', 'Table', 'Row', 'Note', 'Airport'];

type ChatTurn = 'answer' | 'error' | 'hold' | 'interrupt' | 'gated-interrupt';

function chatTransport(turns: ChatTurn[] = []) {
  const requests: TransportRequest[] = [];
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const send = vi.fn(async (request: TransportRequest) => {
    const turn = turns[requests.length] ?? 'answer';
    requests.push(request);
    const identity = {
      threadId: request.input.threadId,
      runId: request.input.runId,
    };
    const messageId = `answer-${requests.length}`;
    return {
      events: (async function* () {
        yield { type: EventType.RUN_STARTED, ...identity };
        if (turn === 'hold') {
          await new Promise(() => undefined);
        }
        if (turn === 'gated-interrupt') {
          await gate;
        }
        if (turn === 'interrupt' || turn === 'gated-interrupt') {
          yield {
            type: EventType.RUN_FINISHED,
            ...identity,
            outcome: {
              type: 'interrupt' as const,
              interrupts: [{ id: 'approve', reason: 'approval' }],
            },
          };
          return;
        }
        if (turn === 'error') {
          yield { type: EventType.RUN_ERROR, message: 'model failed' };
          return;
        }
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: 'assistant' as const,
        };
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: JSON.stringify({ ui: [] }),
        };
        yield { type: EventType.TEXT_MESSAGE_END, messageId };
        yield { type: EventType.RUN_FINISHED, ...identity };
      })(),
    };
  });
  return { requests, send, release: () => release() };
}

function offered(request: TransportRequest | undefined): string[] {
  const schema = JSON.stringify(
    (request?.input.forwardedProps as { hashbrown?: unknown }).hashbrown,
  );
  return allNames.filter((name) => schema.includes(`"${name}"`));
}

function configureChat(
  decision: Decision.Transport,
  chat: ReturnType<typeof chatTransport>,
) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHashbrown({
        transport: { name: 'test', send: chat.send } as never,
        decision: { transport: decision },
      }),
    ],
  });
}

function narrowedChat(options: {
  select?: Decision.Select;
  system?: string;
  minConfidence?: number;
  components?: any[];
}) {
  return TestBed.runInInjectionContext(() => {
    const chat = uiChatResource({
      system: 'You are the chat.',
      components: options.components ?? chatComponents,
      debounce: 0,
    });
    const narrowing = uiDecisionResource({
      chat,
      select: options.select ?? 'one',
      system: options.system,
      minConfidence: options.minConfidence,
    });
    return { chat, narrowing };
  });
}

test('uiDecisionResource chat mode decides over the chat components with createSelectionSchema questions', async () => {
  const fake = createFakeTransport(() =>
    multiResponse({
      Flight: 0.9,
      Table: 0.1,
      Row: 0.1,
      Note: 0.1,
      Airport: 0.1,
    }),
  );
  const chat = chatTransport();
  configureChat(fake.transport, chat);
  const { narrowing } = narrowedChat({ select: { max: 2 } });

  narrowing.sendMessage('show UA1');
  await settle();

  const pinned = ɵcompileDecision(
    createSelectionSchema(chatComponents, { max: 2 }),
  );
  expect(JSON.stringify(fake.calls[0].request.questions)).toBe(
    JSON.stringify(pinned),
  );
  expect(fake.calls[0].request.state).toBe('show UA1');
  expect(chat.requests).toHaveLength(1);
});

test('uiDecisionResource chat mode sends with only the chosen components plus their children', async () => {
  const fake = createFakeTransport(() => pickResponse('Table', 0.9, allNames));
  const chat = chatTransport(['hold']);
  configureChat(fake.transport, chat);
  const { narrowing } = narrowedChat({});

  narrowing.sendMessage('list the rows');
  await settle();

  expect(chat.requests).toHaveLength(1);
  expect(offered(chat.requests[0])).toEqual(['Table', 'Row']);
  expect(chat.requests[0].input.messages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ role: 'user', content: 'list the rows' }),
    ]),
  );
  expect(narrowing.isDeciding()).toBe(false);
  expect(narrowing.decision.value()).toEqual({ pick: 'Table' });
  expect(narrowing.decisionError()).toBeUndefined();
});

test('uiDecisionResource chat mode sends with every component below minConfidence', async () => {
  const fake = createFakeTransport(() => pickResponse('Table', 0.4, allNames));
  const chat = chatTransport();
  configureChat(fake.transport, chat);
  const { narrowing } = narrowedChat({ minConfidence: 0.7 });

  narrowing.sendMessage('hmm');
  await settle();

  expect(offered(chat.requests[0])).toEqual(allNames);
  expect(narrowing.decisionError()).toBeUndefined();
});

test('uiDecisionResource chat mode sends with every component when the decision fails', async () => {
  const failure = new Error('decision offline');
  const fake = createFakeTransport(() => {
    throw failure;
  });
  const chat = chatTransport();
  configureChat(fake.transport, chat);
  const { narrowing } = narrowedChat({});

  narrowing.sendMessage('hmm');
  await settle();

  expect(offered(chat.requests[0])).toEqual(allNames);
  expect(narrowing.decisionError()).toBe(failure);
  expect(narrowing.decision.error()).toBe(failure);
});

test('uiDecisionResource chat mode sends with every component when they break the selection limits', async () => {
  class BadCard {}
  const components = [
    note,
    { component: BadCard, name: 'Bad.Name', description: 'Invalid id' },
  ];
  const fake = createFakeTransport(() => pickResponse('Note', 0.9, ['Note']));
  const chat = chatTransport();
  configureChat(fake.transport, chat);
  const { chat: uiChat, narrowing } = narrowedChat({ components });

  narrowing.sendMessage('hello');
  await settle();

  expect(chat.requests).toHaveLength(1);
  expect(fake.calls).toHaveLength(0);
  expect(narrowing.decisionError()).toBeInstanceOf(DecisionSchemaError);
  expect(uiChat.components()).toBe(components);
});

test('uiDecisionResource chat mode restores every component after the turn completes', async () => {
  const fake = createFakeTransport(() =>
    pickResponse('Airport', 0.9, allNames),
  );
  const chat = chatTransport();
  configureChat(fake.transport, chat);
  const { chat: uiChat, narrowing } = narrowedChat({});

  narrowing.sendMessage('show SFO');
  await settle();
  const restored = uiChat.components();
  uiChat.sendMessage({ role: 'user', content: 'and more' });
  await settle();

  expect(restored).toBe(chatComponents);
  expect(offered(chat.requests[0])).toEqual(['Airport']);
  expect(offered(chat.requests[1])).toEqual(allNames);
});

test('uiDecisionResource chat mode restores every component after the turn errors', async () => {
  const fake = createFakeTransport(() =>
    pickResponse('Airport', 0.9, allNames),
  );
  const chat = chatTransport(['error']);
  configureChat(fake.transport, chat);
  const { chat: uiChat, narrowing } = narrowedChat({});

  narrowing.sendMessage('show SFO');
  await settle();

  expect(uiChat.error()).toBeDefined();
  expect(uiChat.components()).toBe(chatComponents);
  expect(offered(chat.requests[0])).toEqual(['Airport']);
});

test('uiDecisionResource chat mode restores every component after the turn stops', async () => {
  const fake = createFakeTransport(() =>
    pickResponse('Airport', 0.9, allNames),
  );
  const chat = chatTransport(['hold']);
  configureChat(fake.transport, chat);
  const { chat: uiChat, narrowing } = narrowedChat({});
  narrowing.sendMessage('show SFO');
  await settle();
  const narrowed = uiChat.components();

  uiChat.stop();
  await settle();

  expect(narrowed).not.toBe(chatComponents);
  expect(uiChat.components()).toBe(chatComponents);
});

test('uiDecisionResource chat mode sends only the latest message when one arrives during a pending decision', async () => {
  const deferred = deferredTransport();
  const chat = chatTransport();
  configureChat(deferred.transport, chat);
  const { narrowing } = narrowedChat({});

  narrowing.sendMessage('first');
  await settle();
  narrowing.sendMessage('second');
  await settle();
  deferred.resolve(pickResponse('Note', 0.9, allNames));
  await settle();

  expect(deferred.calls).toHaveLength(2);
  expect(deferred.calls[0].signal.aborted).toBe(true);
  expect(chat.requests).toHaveLength(1);
  expect(offered(chat.requests[0])).toEqual(['Note']);
  const userMessages = chat.requests[0].input.messages.filter(
    (message) => message.role === 'user',
  );
  expect(userMessages.map((message) => message.content)).toEqual(['second']);
});

test('uiDecisionResource chat mode sends system to the decision while the chat keeps its own', async () => {
  const fake = createFakeTransport(() =>
    pickResponse('Airport', 0.9, allNames),
  );
  const chat = chatTransport();
  configureChat(fake.transport, chat);
  const { narrowing } = narrowedChat({
    system: 'A flight-tracking app. The input is a chat message.',
  });

  narrowing.sendMessage('show SFO');
  await settle();

  expect(fake.calls[0].request.state).toEqual({
    system: 'A flight-tracking app. The input is a chat message.',
    input: 'show SFO',
  });
  const systemMessages = chat.requests[0].input.messages.filter(
    (message) => message.role === 'system',
  );
  expect(systemMessages.map((message) => message.content)).toEqual([
    'You are the chat.',
  ]);
});

test('uiDecisionResource chat mode throws at once while the chat has a pending interrupt', async () => {
  const fake = createFakeTransport(() =>
    pickResponse('Airport', 0.9, allNames),
  );
  const chat = chatTransport(['interrupt']);
  configureChat(fake.transport, chat);
  const { chat: uiChat, narrowing } = narrowedChat({});
  narrowing.sendMessage('show SFO');
  await settle();
  expect(uiChat.pendingInterrupts()).toBeDefined();

  expect(() => narrowing.sendMessage('again')).toThrow(/interrupt/i);
  expect(fake.calls).toHaveLength(1);
  expect(uiChat.components()).toBe(chatComponents);
});

test('uiDecisionResource chat mode restores the components and sets decisionError when the send throws', async () => {
  const deferred = deferredTransport();
  const chat = chatTransport(['gated-interrupt']);
  configureChat(deferred.transport, chat);
  const { chat: uiChat, narrowing } = narrowedChat({});
  narrowing.sendMessage('first');
  await settle();
  deferred.resolve(pickResponse('Airport', 0.9, allNames));
  await settle();
  narrowing.sendMessage('second');
  await settle();

  chat.release();
  await settle();
  deferred.resolve(pickResponse('Note', 0.9, allNames));
  await settle();

  expect(uiChat.pendingInterrupts()).toBeDefined();
  expect(narrowing.decisionError()?.message).toMatch(/interrupt/i);
  expect(uiChat.components()).toBe(chatComponents);
  expect(chat.requests).toHaveLength(1);
});

test('uiDecisionResource chat mode restores the components when the chat never starts the turn', async () => {
  const fake = createFakeTransport(() =>
    pickResponse('Airport', 0.9, allNames),
  );
  configureChat(fake.transport, chatTransport());
  const components = signal<any[]>(chatComponents);
  const sent = vi.fn();
  const fakeChat = {
    components: components.asReadonly(),
    isLoading: signal(false).asReadonly(),
    setComponents: (next: any[]) => components.set(next),
    sendMessage: sent,
  };
  const narrowing = TestBed.runInInjectionContext(() =>
    uiDecisionResource({ chat: fakeChat, select: 'one' }),
  );

  narrowing.sendMessage('show SFO');
  await settle();

  expect(sent).toHaveBeenCalledTimes(1);
  expect(components()).toBe(chatComponents);
});

test('uiDecisionResource chat mode restores the components when it is destroyed mid-turn', async () => {
  const fake = createFakeTransport(() =>
    pickResponse('Airport', 0.9, allNames),
  );
  const chat = chatTransport(['hold']);
  configureChat(fake.transport, chat);
  const uiChat = TestBed.runInInjectionContext(() =>
    uiChatResource({
      system: 'You are the chat.',
      components: chatComponents,
      debounce: 0,
    }),
  );
  const child = Injector.create({
    providers: [],
    parent: TestBed.inject(Injector),
  });
  const narrowing = runInInjectionContext(child, () =>
    uiDecisionResource({ chat: uiChat, select: 'one' }),
  );
  narrowing.sendMessage('show SFO');
  await settle();
  expect(uiChat.components()).not.toBe(chatComponents);

  child.destroy();

  expect(uiChat.components()).toBe(chatComponents);
});

test('uiDecisionResource chat mode leaves components the app changed mid-turn', async () => {
  const fake = createFakeTransport(() =>
    pickResponse('Airport', 0.9, allNames),
  );
  const chat = chatTransport(['hold']);
  configureChat(fake.transport, chat);
  const { chat: uiChat, narrowing } = narrowedChat({});
  narrowing.sendMessage('show SFO');
  await settle();
  const appComponents = [note];
  uiChat.setComponents(appComponents);

  uiChat.stop();
  await settle();

  expect(uiChat.components()).toBe(appComponents);
});

test('uiDecisionResource chat mode decision.stop() still sends, with every component', async () => {
  const deferred = deferredTransport();
  const chat = chatTransport();
  configureChat(deferred.transport, chat);
  const { narrowing } = narrowedChat({});
  narrowing.sendMessage('show SFO');
  await settle();
  expect(narrowing.isDeciding()).toBe(true);

  narrowing.decision.stop();
  await settle();

  expect(chat.requests).toHaveLength(1);
  expect(offered(chat.requests[0])).toEqual(allNames);
  expect(narrowing.decisionError()).toBeUndefined();
  expect(narrowing.isDeciding()).toBe(false);
});
