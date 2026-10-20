/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventType } from '@ag-ui/core';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, useState } from 'react';
import {
  type Chat,
  createSelectionSchema,
  type Decision,
  DecisionSchemaError,
  type TransportRequest,
  ɵcompileDecision,
  ɵcreateUiKit,
} from '@hashbrownai/core';
import { HashbrownProvider } from '../hashbrown-provider';
import { exposeComponent } from '../expose-component.fn';
import { useUiChat } from './use-ui-chat';
import { type UiDecisionChat, useUiDecision } from './use-ui-decision';

type Call = { request: Decision.Request; signal: AbortSignal };

function createFakeTransport(
  respond: (request: Decision.Request) => Decision.Response | Promise<never>,
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

function wrapperFor(transport: Decision.Transport) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <HashbrownProvider decision={{ transport }}>{children}</HashbrownProvider>
    );
  };
}

const candidates = [
  { id: 'flight', description: 'One aircraft', element: <p>flight</p> },
  { id: 'airport', description: 'An airport', element: <p>airport</p> },
  { id: 'weather', description: 'The weather', element: <p>weather</p> },
];

const Flight = () => null;
const Airport = () => null;
const flight = exposeComponent(Flight, {
  name: 'Flight',
  description: 'One aircraft',
});
const airport = exposeComponent(Airport, {
  name: 'Airport',
  description: 'An airport',
});

test("useUiDecision candidates 'one' renders only the chosen element", async () => {
  const fake = createFakeTransport(() =>
    pickResponse('airport', 0.9, ['flight', 'airport', 'weather']),
  );

  const { result } = renderHook(
    () => useUiDecision({ input: 'show KSFO', candidates, select: 'one' }),
    { wrapper: wrapperFor(fake.transport) },
  );
  await waitFor(() => expect(result.current.ids).toEqual(['airport']));

  const { container } = render(<div>{result.current.ui}</div>);
  expect(container.textContent).toBe('airport');
  expect(result.current.decision.value).toEqual({ pick: 'airport' });
  expect(result.current.isLoading).toBe(false);
  expect(result.current.error).toBeUndefined();
  expect(fake.calls).toHaveLength(1);
});

test('useUiDecision candidates { max: 2 } renders in probability order', async () => {
  const fake = createFakeTransport(() =>
    multiResponse({ flight: 0.6, airport: 0.2, weather: 0.95 }),
  );

  const { result } = renderHook(
    () => useUiDecision({ input: 'storm', candidates, select: { max: 2 } }),
    { wrapper: wrapperFor(fake.transport) },
  );
  await waitFor(() => expect(result.current.ids).toHaveLength(2));

  expect(result.current.ids).toEqual(['weather', 'flight']);
  const { container } = render(<div>{result.current.ui}</div>);
  expect(container.textContent).toBe('weatherflight');
  expect(result.current.ui.map((element) => element.key)).toEqual([
    'weather',
    'flight',
  ]);
});

test('useUiDecision candidates below minConfidence renders nothing', async () => {
  const fake = createFakeTransport(() =>
    pickResponse('airport', 0.4, ['flight', 'airport', 'weather']),
  );

  const { result } = renderHook(
    () =>
      useUiDecision({
        input: 'hmm',
        candidates,
        select: 'one',
        minConfidence: 0.7,
      }),
    { wrapper: wrapperFor(fake.transport) },
  );
  await waitFor(() => expect(result.current.decision.value).not.toBeNull());

  expect(result.current.ids).toEqual([]);
  expect(result.current.ui).toEqual([]);
});

test('useUiDecision candidates mode sends no chat requests', async () => {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  const fake = createFakeTransport(() =>
    pickResponse('flight', 0.9, ['flight', 'airport', 'weather']),
  );

  try {
    const { result } = renderHook(
      () => useUiDecision({ input: 'N123', candidates, select: 'one' }),
      { wrapper: wrapperFor(fake.transport) },
    );
    await waitFor(() => expect(result.current.ids).toEqual(['flight']));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  } finally {
    vi.unstubAllGlobals();
  }

  expect(fetchMock).not.toHaveBeenCalled();
});

test('useUiDecision candidates with no candidates renders nothing', async () => {
  const fake = createFakeTransport(() =>
    pickResponse('flight', 0.9, ['flight']),
  );

  const { result } = renderHook(
    () => useUiDecision({ input: 'hello', candidates: [], select: 'one' }),
    { wrapper: wrapperFor(fake.transport) },
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  expect(result.current.ids).toEqual([]);
  expect(result.current.ui).toEqual([]);
  expect(result.current.error).toBeUndefined();
  expect(fake.calls).toHaveLength(0);
});

test('useUiDecision sends system with the input to the selection decision', async () => {
  const fake = createFakeTransport(() =>
    pickResponse('airport', 0.9, ['flight', 'airport', 'weather']),
  );

  const { result } = renderHook(
    () =>
      useUiDecision({
        input: 'show KSFO',
        system: 'You pick cards in a flight-tracking app.',
        candidates,
        select: 'one',
      }),
    { wrapper: wrapperFor(fake.transport) },
  );
  await waitFor(() => expect(result.current.ids).toEqual(['airport']));

  expect(fake.calls[0].request.state).toEqual({
    system: 'You pick cards in a flight-tracking app.',
    input: 'show KSFO',
  });
});

test("useUiDecision shuffles the selection options with optionOrder: 'shuffled'", async () => {
  const random = vi.spyOn(Math, 'random').mockReturnValue(0);
  const fake = createFakeTransport(() =>
    pickResponse('airport', 0.9, ['flight', 'airport', 'weather']),
  );

  try {
    const { result } = renderHook(
      () =>
        useUiDecision({
          input: 'show KSFO',
          optionOrder: 'shuffled',
          candidates,
          select: 'one',
        }),
      { wrapper: wrapperFor(fake.transport) },
    );
    await waitFor(() => expect(result.current.ids).toEqual(['airport']));
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

test('useUiDecision debounces the selection decision with debounceTime', async () => {
  const fake = createFakeTransport(() =>
    pickResponse('airport', 0.9, ['flight', 'airport', 'weather']),
  );

  const { result, rerender } = renderHook(
    ({ input }: { input: string }) =>
      useUiDecision({ input, debounceTime: 50, candidates, select: 'one' }),
    { wrapper: wrapperFor(fake.transport), initialProps: { input: 'show' } },
  );
  rerender({ input: 'show KSFO' });
  await waitFor(() => expect(result.current.ids).toEqual(['airport']));

  expect(fake.calls).toHaveLength(1);
  expect(fake.calls[0].request.state).toBe('show KSFO');
});

test('useUiDecision candidates asks byte-identical questions to createSelectionSchema with the same candidates', async () => {
  const fake = createFakeTransport(() =>
    pickResponse('airport', 0.9, ['flight', 'airport', 'weather']),
  );

  const { result } = renderHook(
    () => useUiDecision({ input: 'show KSFO', candidates, select: 'one' }),
    { wrapper: wrapperFor(fake.transport) },
  );
  await waitFor(() => expect(result.current.ids).toEqual(['airport']));

  const pinned = ɵcompileDecision(createSelectionSchema(candidates, 'one'));
  expect(JSON.stringify(fake.calls[0].request.questions)).toBe(
    JSON.stringify(pinned),
  );
});

// ---------------------------------------------------------------------------
// Chat mode
// ---------------------------------------------------------------------------

const Note = () => null;
const Row = () => null;
const Table = () => null;
const note = exposeComponent(Note, { name: 'Note', description: 'A note' });
const row = exposeComponent(Row, { name: 'Row', description: 'A table row' });
const table = exposeComponent(Table, {
  name: 'Table',
  description: 'A table of rows',
  children: [row],
});
const chatComponents = [
  flight,
  ɵcreateUiKit<any>({ components: [table, note] }),
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

function chatWrapper(
  decision: Decision.Transport,
  chat: ReturnType<typeof chatTransport>,
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <HashbrownProvider
        transport={{ name: 'test', send: chat.send } as never}
        decision={{ transport: decision }}
      >
        {children}
      </HashbrownProvider>
    );
  };
}

function useNarrowedChat(options: {
  select?: Decision.Select;
  system?: string;
  minConfidence?: number;
  components?: any[];
}) {
  const chat = useUiChat({
    system: 'You are the chat.',
    components: options.components ?? chatComponents,
    debounceTime: 0,
  });
  const narrowing = useUiDecision({
    chat,
    select: options.select ?? 'one',
    system: options.system,
    minConfidence: options.minConfidence,
  });
  return { chat, narrowing };
}

test('useUiDecision chat mode decides over the chat components with createSelectionSchema questions', async () => {
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
  const { result } = renderHook(() => useNarrowedChat({ select: { max: 2 } }), {
    wrapper: chatWrapper(fake.transport, chat),
  });

  act(() => result.current.narrowing.sendMessage('show UA1'));
  await waitFor(() => expect(chat.requests).toHaveLength(1));

  const pinned = ɵcompileDecision(
    createSelectionSchema(chatComponents, { max: 2 }),
  );
  expect(JSON.stringify(fake.calls[0].request.questions)).toBe(
    JSON.stringify(pinned),
  );
  expect(fake.calls[0].request.state).toBe('show UA1');
});

test('useUiDecision chat mode sends with only the chosen components plus their children', async () => {
  const fake = createFakeTransport(() => pickResponse('Table', 0.9, allNames));
  const chat = chatTransport(['hold']);
  const { result } = renderHook(() => useNarrowedChat({}), {
    wrapper: chatWrapper(fake.transport, chat),
  });

  act(() => result.current.narrowing.sendMessage('list the rows'));
  await waitFor(() => expect(chat.requests).toHaveLength(1));

  expect(offered(chat.requests[0])).toEqual(['Table', 'Row']);
  expect(chat.requests[0].input.messages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ role: 'user', content: 'list the rows' }),
    ]),
  );
  expect(result.current.narrowing.isDeciding).toBe(false);
  expect(result.current.narrowing.decision.value).toEqual({ pick: 'Table' });
  expect(result.current.narrowing.decisionError).toBeUndefined();
});

test('useUiDecision chat mode sends with every component below minConfidence', async () => {
  const fake = createFakeTransport(() => pickResponse('Table', 0.4, allNames));
  const chat = chatTransport();
  const { result } = renderHook(() => useNarrowedChat({ minConfidence: 0.7 }), {
    wrapper: chatWrapper(fake.transport, chat),
  });

  act(() => result.current.narrowing.sendMessage('hmm'));
  await waitFor(() => expect(chat.requests).toHaveLength(1));

  expect(offered(chat.requests[0])).toEqual(allNames);
  expect(result.current.narrowing.decisionError).toBeUndefined();
});

test('useUiDecision chat mode sends with every component when the decision fails', async () => {
  const failure = new Error('decision offline');
  const fake = createFakeTransport(() => Promise.reject(failure));
  const chat = chatTransport();
  const { result } = renderHook(() => useNarrowedChat({}), {
    wrapper: chatWrapper(fake.transport, chat),
  });

  act(() => result.current.narrowing.sendMessage('hmm'));
  await waitFor(() => expect(chat.requests).toHaveLength(1));

  expect(offered(chat.requests[0])).toEqual(allNames);
  expect(result.current.narrowing.decisionError).toBe(failure);
  expect(result.current.narrowing.decision.error).toBe(failure);
});

test('useUiDecision chat mode sends with every component when they break the selection limits', async () => {
  const Bad = () => null;
  const components = [
    note,
    exposeComponent(Bad, { name: 'Bad.Name', description: 'Invalid id' }),
  ];
  const fake = createFakeTransport(() => pickResponse('Note', 0.9, ['Note']));
  const chat = chatTransport();
  const { result } = renderHook(() => useNarrowedChat({ components }), {
    wrapper: chatWrapper(fake.transport, chat),
  });

  act(() => result.current.narrowing.sendMessage('hello'));
  await waitFor(() => expect(chat.requests).toHaveLength(1));

  expect(fake.calls).toHaveLength(0);
  expect(result.current.narrowing.decisionError).toBeInstanceOf(
    DecisionSchemaError,
  );
  expect(result.current.chat.components).toBe(components);
});

test('useUiDecision chat mode restores every component after the turn completes', async () => {
  const fake = createFakeTransport(() =>
    pickResponse('Airport', 0.9, allNames),
  );
  const chat = chatTransport();
  const { result } = renderHook(() => useNarrowedChat({}), {
    wrapper: chatWrapper(fake.transport, chat),
  });

  act(() => result.current.narrowing.sendMessage('show SFO'));
  await waitFor(() => expect(chat.requests).toHaveLength(1));
  await waitFor(() =>
    expect(result.current.chat.components).toBe(chatComponents),
  );
  act(() =>
    result.current.chat.sendMessage({ role: 'user', content: 'and more' }),
  );
  await waitFor(() => expect(chat.requests).toHaveLength(2));

  expect(offered(chat.requests[0])).toEqual(['Airport']);
  expect(offered(chat.requests[1])).toEqual(allNames);
});

test('useUiDecision chat mode restores every component after the turn errors', async () => {
  const fake = createFakeTransport(() =>
    pickResponse('Airport', 0.9, allNames),
  );
  const chat = chatTransport(['error']);
  const { result } = renderHook(() => useNarrowedChat({}), {
    wrapper: chatWrapper(fake.transport, chat),
  });

  act(() => result.current.narrowing.sendMessage('show SFO'));
  await waitFor(() => expect(chat.requests).toHaveLength(1));
  await waitFor(() => expect(result.current.chat.error).toBeDefined());

  await waitFor(() =>
    expect(result.current.chat.components).toBe(chatComponents),
  );
  expect(offered(chat.requests[0])).toEqual(['Airport']);
});

test('useUiDecision chat mode restores every component after the turn stops', async () => {
  const fake = createFakeTransport(() =>
    pickResponse('Airport', 0.9, allNames),
  );
  const chat = chatTransport(['hold']);
  const { result } = renderHook(() => useNarrowedChat({}), {
    wrapper: chatWrapper(fake.transport, chat),
  });
  act(() => result.current.narrowing.sendMessage('show SFO'));
  await waitFor(() => expect(chat.requests).toHaveLength(1));
  await waitFor(() => expect(result.current.chat.isLoading).toBe(true));
  expect(result.current.chat.components).not.toBe(chatComponents);

  act(() => result.current.chat.stop());

  await waitFor(() =>
    expect(result.current.chat.components).toBe(chatComponents),
  );
});

test('useUiDecision chat mode sends only the latest message when one arrives during a pending decision', async () => {
  const deferred = deferredTransport();
  const chat = chatTransport();
  const { result } = renderHook(() => useNarrowedChat({}), {
    wrapper: chatWrapper(deferred.transport, chat),
  });

  act(() => result.current.narrowing.sendMessage('first'));
  await waitFor(() => expect(deferred.calls).toHaveLength(1));
  act(() => result.current.narrowing.sendMessage('second'));
  await waitFor(() => expect(deferred.calls).toHaveLength(2));
  await act(async () => {
    deferred.resolve(pickResponse('Note', 0.9, allNames));
  });
  await waitFor(() => expect(chat.requests).toHaveLength(1));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  expect(deferred.calls[0].signal.aborted).toBe(true);
  expect(chat.requests).toHaveLength(1);
  expect(offered(chat.requests[0])).toEqual(['Note']);
  const userMessages = chat.requests[0].input.messages.filter(
    (message) => message.role === 'user',
  );
  expect(userMessages.map((message) => message.content)).toEqual(['second']);
});

test('useUiDecision chat mode sends system to the decision while the chat keeps its own', async () => {
  const fake = createFakeTransport(() =>
    pickResponse('Airport', 0.9, allNames),
  );
  const chat = chatTransport();
  const { result } = renderHook(
    () =>
      useNarrowedChat({
        system: 'A flight-tracking app. The input is a chat message.',
      }),
    { wrapper: chatWrapper(fake.transport, chat) },
  );

  act(() => result.current.narrowing.sendMessage('show SFO'));
  await waitFor(() => expect(chat.requests).toHaveLength(1));

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

test('useUiDecision chat mode narrows a chat created in a parent component', async () => {
  const fake = createFakeTransport(() =>
    pickResponse('Airport', 0.9, allNames),
  );
  const chat = chatTransport(['hold']);
  let send: (content: string) => void = () => undefined;
  function Child({ chat: uiChat }: { chat: UiDecisionChat }) {
    send = useUiDecision({ chat: uiChat, select: 'one' }).sendMessage;
    return null;
  }
  function Parent() {
    const uiChat = useUiChat({
      system: 'You are the chat.',
      components: chatComponents,
      debounceTime: 0,
    });
    return <Child chat={uiChat} />;
  }
  const Wrapper = chatWrapper(fake.transport, chat);
  render(
    <Wrapper>
      <Parent />
    </Wrapper>,
  );

  act(() => send('show SFO'));
  await waitFor(() => expect(chat.requests).toHaveLength(1));

  expect(offered(chat.requests[0])).toEqual(['Airport']);
});

test('useUiDecision chat mode throws at once while the chat has a pending interrupt', async () => {
  const fake = createFakeTransport(() =>
    pickResponse('Airport', 0.9, allNames),
  );
  const chat = chatTransport(['interrupt']);
  const { result } = renderHook(() => useNarrowedChat({}), {
    wrapper: chatWrapper(fake.transport, chat),
  });
  act(() => result.current.narrowing.sendMessage('show SFO'));
  await waitFor(() =>
    expect(result.current.chat.pendingInterrupts).toBeDefined(),
  );
  await waitFor(() =>
    expect(result.current.chat.components).toBe(chatComponents),
  );

  expect(() => result.current.narrowing.sendMessage('again')).toThrow(
    /interrupt/i,
  );
  expect(fake.calls).toHaveLength(1);
  expect(result.current.chat.components).toBe(chatComponents);
});

test('useUiDecision chat mode restores the components and sets decisionError when the send throws', async () => {
  const deferred = deferredTransport();
  const chat = chatTransport(['gated-interrupt']);
  const { result } = renderHook(() => useNarrowedChat({}), {
    wrapper: chatWrapper(deferred.transport, chat),
  });
  act(() => result.current.narrowing.sendMessage('first'));
  await waitFor(() => expect(deferred.calls).toHaveLength(1));
  await act(async () => {
    deferred.resolve(pickResponse('Airport', 0.9, allNames));
  });
  await waitFor(() => expect(chat.requests).toHaveLength(1));
  act(() => result.current.narrowing.sendMessage('second'));
  await waitFor(() => expect(deferred.calls).toHaveLength(2));

  await act(async () => {
    chat.release();
  });
  await waitFor(() =>
    expect(result.current.chat.pendingInterrupts).toBeDefined(),
  );
  await act(async () => {
    deferred.resolve(pickResponse('Note', 0.9, allNames));
  });

  await waitFor(() =>
    expect(result.current.narrowing.decisionError?.message).toMatch(
      /interrupt/i,
    ),
  );
  expect(result.current.chat.components).toBe(chatComponents);
  expect(chat.requests).toHaveLength(1);
});

function useFakeChat(onSend: (message: Chat.UserMessage) => void) {
  const [components, setComponents] = useState<any[]>(chatComponents);
  return {
    components,
    setComponents,
    isLoading: false,
    sendMessage: onSend,
  } satisfies UiDecisionChat;
}

test('useUiDecision chat mode restores the components when the chat never starts the turn', async () => {
  const fake = createFakeTransport(() =>
    pickResponse('Airport', 0.9, allNames),
  );
  const sent = vi.fn();
  const narrowedLists: unknown[] = [];
  const { result } = renderHook(
    () => {
      const chat = useFakeChat(sent);
      narrowedLists.push(chat.components);
      const narrowing = useUiDecision({ chat, select: 'one' });
      return { chat, narrowing };
    },
    { wrapper: wrapperFor(fake.transport) },
  );

  act(() => result.current.narrowing.sendMessage('show SFO'));
  await waitFor(() => expect(sent).toHaveBeenCalledTimes(1));

  await waitFor(() =>
    expect(result.current.chat.components).toBe(chatComponents),
  );
  expect(narrowedLists).toContainEqual([airport]);
});

test('useUiDecision chat mode restores the components when it unmounts mid-turn', async () => {
  const fake = createFakeTransport(() =>
    pickResponse('Airport', 0.9, allNames),
  );
  const chat = chatTransport(['hold']);
  let send: (content: string) => void = () => undefined;
  let uiChat: UiDecisionChat | undefined;
  let hideChild: () => void = () => undefined;
  function Child({ chat: current }: { chat: UiDecisionChat }) {
    send = useUiDecision({ chat: current, select: 'one' }).sendMessage;
    return null;
  }
  function Parent() {
    const [show, setShow] = useState(true);
    hideChild = () => setShow(false);
    uiChat = useUiChat({
      system: 'You are the chat.',
      components: chatComponents,
      debounceTime: 0,
    });
    return show ? <Child chat={uiChat} /> : null;
  }
  const Wrapper = chatWrapper(fake.transport, chat);
  render(
    <Wrapper>
      <Parent />
    </Wrapper>,
  );
  act(() => send('show SFO'));
  await waitFor(() => expect(chat.requests).toHaveLength(1));
  expect(uiChat?.components).not.toBe(chatComponents);

  act(() => hideChild());

  await waitFor(() => expect(uiChat?.components).toBe(chatComponents));
});

test('useUiDecision chat mode leaves components the app changed mid-turn', async () => {
  const fake = createFakeTransport(() =>
    pickResponse('Airport', 0.9, allNames),
  );
  const chat = chatTransport(['hold']);
  const { result } = renderHook(() => useNarrowedChat({}), {
    wrapper: chatWrapper(fake.transport, chat),
  });
  act(() => result.current.narrowing.sendMessage('show SFO'));
  await waitFor(() => expect(chat.requests).toHaveLength(1));
  await waitFor(() => expect(result.current.chat.isLoading).toBe(true));
  const appComponents = [note];
  act(() => result.current.chat.setComponents(appComponents));

  act(() => result.current.chat.stop());
  await waitFor(() => expect(result.current.chat.isLoading).toBe(false));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  expect(result.current.chat.components).toBe(appComponents);
});

test('useUiDecision chat mode decision.stop() still sends, with every component', async () => {
  const deferred = deferredTransport();
  const chat = chatTransport();
  const { result } = renderHook(() => useNarrowedChat({}), {
    wrapper: chatWrapper(deferred.transport, chat),
  });
  act(() => result.current.narrowing.sendMessage('show SFO'));
  await waitFor(() => expect(result.current.narrowing.isDeciding).toBe(true));

  act(() => result.current.narrowing.decision.stop());
  await waitFor(() => expect(chat.requests).toHaveLength(1));

  expect(offered(chat.requests[0])).toEqual(allNames);
  expect(result.current.narrowing.decisionError).toBeUndefined();
  expect(result.current.narrowing.isDeciding).toBe(false);
});
