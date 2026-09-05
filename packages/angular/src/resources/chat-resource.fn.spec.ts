import { inject, InjectionToken, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHashbrown } from '../providers/provide-hashbrown.fn';
import { chatResource } from './chat-resource.fn';

const createChatRuntimeMock = vi.hoisted(() => vi.fn());
const createHttpTransportMock = vi.hoisted(() => vi.fn());
const middlewareContextToken = new InjectionToken<string>(
  'middleware context test',
);

vi.mock('@hashbrownai/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hashbrownai/core')>();

  return {
    ...actual,
    createHttpTransport: createHttpTransportMock,
    createChatRuntime: createChatRuntimeMock,
  };
});

test('chatResource initializes with the provided message history', () => {
  createChatRuntimeMock.mockReset();
  createChatRuntimeMock.mockImplementation((init) =>
    createRuntimeStub({ messages: init.messages ?? [] }),
  );
  const messages = [
    {
      role: 'user' as const,
      content: 'Summarize the previous order.',
    },
  ];

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  const chat = TestBed.runInInjectionContext(() =>
    chatResource({
      system: 'You are a helpful assistant.',
      messages,
    }),
  );

  expect(chat.value()).toEqual(messages);
});

test('chatResource lowers provider HTTP options into a lazy transport', () => {
  const middleware = vi.fn((request: RequestInit) => {
    expect(inject(middlewareContextToken)).toBe('injection-context');
    return request;
  });
  const transport = { name: 'angular-http', send: vi.fn() };
  createHttpTransportMock.mockReset();
  createHttpTransportMock.mockReturnValue(transport);
  createChatRuntimeMock.mockReset();
  createChatRuntimeMock.mockReturnValue(createRuntimeStub({ messages: [] }));

  TestBed.configureTestingModule({
    providers: [
      { provide: middlewareContextToken, useValue: 'injection-context' },
      provideHashbrown({ baseUrl: '/angular-run', middleware: [middleware] }),
    ],
  });

  TestBed.runInInjectionContext(() => chatResource({ system: 'test' }));

  const init = createChatRuntimeMock.mock.calls[0]?.[0];
  expect(init).not.toHaveProperty('apiUrl');
  expect(init).not.toHaveProperty('middleware');
  expect(init.transport).toEqual(expect.any(Function));
  expect(init.transport()).toBe(transport);
  expect(createHttpTransportMock).toHaveBeenCalledWith({
    baseUrl: '/angular-run',
    middleware: [expect.any(Function)],
  });
  const wrappedMiddleware = createHttpTransportMock.mock.calls[0]?.[0]
    .middleware[0] as (request: RequestInit) => RequestInit;
  const request = { headers: { Authorization: 'Bearer test' } };

  expect(wrappedMiddleware(request)).toBe(request);
  expect(middleware).toHaveBeenCalledWith(request);
});

test('chatResource transport overrides provider HTTP configuration', () => {
  const providerTransport = { name: 'provider-transport', send: vi.fn() };
  const resourceTransport = { name: 'resource-transport', send: vi.fn() };
  createHttpTransportMock.mockReset();
  createChatRuntimeMock.mockReset();
  createChatRuntimeMock.mockReturnValue(createRuntimeStub({ messages: [] }));

  TestBed.configureTestingModule({
    providers: [
      provideHashbrown({
        baseUrl: '/angular-run',
        transport: providerTransport,
      }),
    ],
  });

  TestBed.runInInjectionContext(() =>
    chatResource({ system: 'test', transport: resourceTransport }),
  );

  expect(createChatRuntimeMock.mock.calls[0]?.[0].transport).toBe(
    resourceTransport,
  );
  expect(createHttpTransportMock).not.toHaveBeenCalled();
});

test('chatResource allows replacing message history', () => {
  createChatRuntimeMock.mockReset();
  createChatRuntimeMock.mockImplementation((init) =>
    createRuntimeStub({ messages: init.messages ?? [] }),
  );
  const initialMessages = [
    {
      role: 'user' as const,
      content: 'Summarize the previous order.',
    },
  ];
  const nextMessages = [
    {
      role: 'user' as const,
      content: 'Keep only this follow-up.',
    },
  ];

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  const chat = TestBed.runInInjectionContext(() =>
    chatResource({
      system: 'You are a helpful assistant.',
      messages: initialMessages,
    }),
  );

  chat.setMessages(nextMessages);

  expect(chat.value()).toEqual(nextMessages);
});

test('chatResource forwards initial state and exposes runtime state updates', () => {
  createChatRuntimeMock.mockReset();
  const stateSignal = createSignal<{ count: number } | undefined>({ count: 1 });
  const runtime = createRuntimeStub({ messages: [], state: stateSignal });
  createChatRuntimeMock.mockReturnValue(runtime);
  const initialState = { count: 1 };

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  const resource = TestBed.runInInjectionContext(() =>
    chatResource({ system: 'System A', state: initialState }),
  );
  stateSignal.set({ count: 2 });
  resource.setState({ count: 3 });

  expect(createChatRuntimeMock.mock.calls[0]?.[0].state).toBe(initialState);
  expect(resource.state()).toEqual({ count: 2 });
  expect(runtime.setState).toHaveBeenCalledWith({ count: 3 });
});

test('chatResource does not resend state when reactive options change', () => {
  createChatRuntimeMock.mockReset();
  const system = signal('System A');
  const initialState = { count: 1 };
  const runtime = createRuntimeStub({ messages: [] });
  createChatRuntimeMock.mockReturnValue(runtime);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    chatResource({ system, state: initialState }),
  );
  system.set('System B');
  TestBed.flushEffects();

  expect(createChatRuntimeMock).toHaveBeenCalledTimes(1);
  expect(getLastUpdateOptions(runtime)).not.toHaveProperty('state');
  expect(runtime.setState).not.toHaveBeenCalled();
});

test('chatResource updates runtime options when option signals change', () => {
  createChatRuntimeMock.mockReset();
  const transport = resetHttpTransportMock();
  const apiUrl = signal('/chat-a');
  const system = signal('System A');
  const threadId = signal<string | undefined>('thread-a');
  const runtime = createRuntimeStub({ messages: [] });
  createChatRuntimeMock.mockReturnValue(runtime);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  const resource = TestBed.runInInjectionContext(() =>
    chatResource({
      apiUrl,
      system,
      threadId,
    }),
  );

  const initialOptions = createChatRuntimeMock.mock.calls[0]?.[0];
  expect(initialOptions).toMatchObject({
    system: 'System A',
    threadId: 'thread-a',
    transport: expect.any(Function),
  });
  expect(initialOptions).not.toHaveProperty('apiUrl');
  expect(resolveTransportOption(initialOptions.transport)).toBe(transport);
  expect(createHttpTransportMock).toHaveBeenLastCalledWith({
    baseUrl: '/chat-a',
    middleware: undefined,
  });
  expect(resource).not.toHaveProperty('isLoadingThread');
  expect(resource).not.toHaveProperty('isSavingThread');
  expect(resource).not.toHaveProperty('threadLoadError');
  expect(resource).not.toHaveProperty('threadSaveError');
  expect(resource).not.toHaveProperty('threadId');

  apiUrl.set('/chat-b');
  system.set('System B');
  threadId.set('thread-b');
  TestBed.flushEffects();

  const updatedOptions = runtime.updateOptions.mock.calls.at(-1)?.[0];
  expect(updatedOptions).toMatchObject({
    system: 'System B',
    threadId: 'thread-b',
    transport: expect.any(Function),
  });
  expect(updatedOptions).not.toHaveProperty('apiUrl');
  expect(resolveTransportOption(updatedOptions.transport)).toBe(transport);
  expect(createHttpTransportMock).toHaveBeenLastCalledWith({
    baseUrl: '/chat-b',
    middleware: undefined,
  });

  threadId.set(undefined);
  TestBed.flushEffects();

  expect(runtime.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({
      threadId: undefined,
    }),
  );

  threadId.set('');
  TestBed.flushEffects();

  expect(runtime.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({
      threadId: '',
    }),
  );
});

test('chatResource preserves an empty apiUrl option', () => {
  createChatRuntimeMock.mockReset();
  const transport = resetHttpTransportMock();
  const apiUrl = signal('');
  const runtime = createRuntimeStub({ messages: [] });
  createChatRuntimeMock.mockReturnValue(runtime);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    chatResource({
      apiUrl,
      system: 'System A',
    }),
  );

  const initialTransport = createChatRuntimeMock.mock.calls[0]?.[0].transport;
  expect(resolveTransportOption(initialTransport)).toBe(transport);
  expect(createHttpTransportMock).toHaveBeenLastCalledWith({
    baseUrl: '',
    middleware: undefined,
  });

  apiUrl.set('/chat-b');
  TestBed.flushEffects();

  const updatedTransport =
    runtime.updateOptions.mock.calls.at(-1)?.[0].transport;
  expect(resolveTransportOption(updatedTransport)).toBe(transport);
  expect(createHttpTransportMock).toHaveBeenLastCalledWith({
    baseUrl: '/chat-b',
    middleware: undefined,
  });

  apiUrl.set('');
  TestBed.flushEffects();

  const clearedTransport =
    runtime.updateOptions.mock.calls.at(-1)?.[0].transport;
  expect(resolveTransportOption(clearedTransport)).toBe(transport);
  expect(createHttpTransportMock).toHaveBeenLastCalledWith({
    baseUrl: '',
    middleware: undefined,
  });
});

test('chatResource preserves a literal empty apiUrl option', () => {
  createChatRuntimeMock.mockReset();
  const transport = resetHttpTransportMock();
  const runtime = createRuntimeStub({ messages: [] });
  createChatRuntimeMock.mockReturnValue(runtime);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    chatResource({
      apiUrl: '',
      system: 'System A',
    }),
  );

  const initialTransport = createChatRuntimeMock.mock.calls[0]?.[0].transport;
  expect(resolveTransportOption(initialTransport)).toBe(transport);
  expect(createHttpTransportMock).toHaveBeenLastCalledWith({
    baseUrl: '',
    middleware: undefined,
  });

  TestBed.flushEffects();

  const updatedTransport =
    runtime.updateOptions.mock.calls.at(-1)?.[0].transport;
  expect(resolveTransportOption(updatedTransport)).toBe(transport);
  expect(createHttpTransportMock).toHaveBeenLastCalledWith({
    baseUrl: '',
    middleware: undefined,
  });
});

test('chatResource preserves an empty threadId option', () => {
  createChatRuntimeMock.mockReset();
  const threadId = signal<string | undefined>('');
  const runtime = createRuntimeStub({ messages: [] });
  createChatRuntimeMock.mockReturnValue(runtime);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    chatResource({
      system: 'System A',
      threadId,
    }),
  );

  expect(createChatRuntimeMock).toHaveBeenCalledWith(
    expect.objectContaining({
      threadId: '',
    }),
  );

  threadId.set('thread-b');
  TestBed.flushEffects();

  expect(runtime.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({
      threadId: 'thread-b',
    }),
  );

  threadId.set('');
  TestBed.flushEffects();

  expect(runtime.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({
      threadId: '',
    }),
  );
});

test('chatResource preserves a literal empty threadId option', () => {
  createChatRuntimeMock.mockReset();
  const runtime = createRuntimeStub({ messages: [] });
  createChatRuntimeMock.mockReturnValue(runtime);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    chatResource({
      system: 'System A',
      threadId: '',
    }),
  );

  expect(createChatRuntimeMock).toHaveBeenCalledWith(
    expect.objectContaining({
      threadId: '',
    }),
  );

  TestBed.flushEffects();

  expect(runtime.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({
      threadId: '',
    }),
  );
});

test('chatResource omits threadId from runtime updates when not provided', () => {
  createChatRuntimeMock.mockReset();
  const system = signal('System A');
  const runtime = createRuntimeStub({ messages: [] });
  createChatRuntimeMock.mockReturnValue(runtime);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    chatResource({
      system,
    }),
  );

  system.set('System B');
  TestBed.flushEffects();
  const lastOptions = getLastUpdateOptions(runtime);

  expect(Object.prototype.hasOwnProperty.call(lastOptions, 'threadId')).toBe(
    false,
  );
});

test('chatResource throws from value and snapshots a terminal error', () => {
  createChatRuntimeMock.mockReset();
  const failure = new Error('Chat request failed');
  const runtime = createRuntimeStub({ messages: [], error: failure });
  createChatRuntimeMock.mockReturnValue(runtime);
  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  const resource = TestBed.runInInjectionContext(() =>
    chatResource({
      system: 'System A',
    }),
  );

  expect(resource.status()).toBe('error');
  expect(resource.snapshot()).toEqual({ status: 'error', error: failure });
  expect(() => resource.value()).toThrow(failure);
});

test('chatResource keeps stale messages readable while loading with an error', () => {
  createChatRuntimeMock.mockReset();
  const messages = [
    {
      role: 'assistant' as const,
      content: 'Stale response',
      toolCalls: [],
    },
  ];
  const runtime = createRuntimeStub({
    messages,
    error: new Error('Stale error'),
    isLoading: true,
  });
  createChatRuntimeMock.mockReturnValue(runtime);
  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  const resource = TestBed.runInInjectionContext(() =>
    chatResource({
      system: 'System A',
    }),
  );

  expect(resource.status()).toBe('loading');
  expect(resource.value()).toEqual(messages);
  expect(resource.snapshot()).toEqual({ status: 'loading', value: messages });
});

test('chatResource reload removes the last assistant response without mutating history', () => {
  createChatRuntimeMock.mockReset();
  const messages = [
    { role: 'user' as const, content: 'Summarize this' },
    {
      role: 'assistant' as const,
      content: 'Completed response',
      toolCalls: [],
    },
  ];
  const originalMessages = structuredClone(messages);
  const runtime = createRuntimeStub({ messages });
  createChatRuntimeMock.mockReturnValue(runtime);
  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });
  const resource = TestBed.runInInjectionContext(() =>
    chatResource({
      system: 'System A',
    }),
  );

  const reloaded = resource.reload();

  expect(reloaded).toBe(true);
  expect(runtime.setMessages).toHaveBeenCalledTimes(1);
  expect(runtime.setMessages).toHaveBeenCalledWith([messages[0]]);
  expect(messages).toEqual(originalMessages);
});

test('chatResource reload returns false when messages are empty', () => {
  createChatRuntimeMock.mockReset();
  const runtime = createRuntimeStub({ messages: [] });
  createChatRuntimeMock.mockReturnValue(runtime);
  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });
  const resource = TestBed.runInInjectionContext(() =>
    chatResource({
      system: 'System A',
    }),
  );

  const reloaded = resource.reload();

  expect(reloaded).toBe(false);
  expect(runtime.setMessages).not.toHaveBeenCalled();
});

function resetHttpTransportMock() {
  const transport = { name: 'angular-http', send: vi.fn() };
  createHttpTransportMock.mockReset();
  createHttpTransportMock.mockReturnValue(transport);

  return transport;
}

function resolveTransportOption(value: unknown) {
  expect(value).toEqual(expect.any(Function));

  return (value as () => unknown)();
}

function createRuntimeStub({
  messages,
  error,
  isLoading = false,
  state = createSignal<unknown>(undefined),
}: {
  messages: unknown[];
  error?: Error;
  isLoading?: boolean;
  state?: ReturnType<typeof createSignal<unknown>>;
}) {
  const messagesSignal = createSignal(messages);

  return {
    state,
    messages: messagesSignal,
    isReceiving: createSignal(false),
    isSending: createSignal(false),
    isGenerating: createSignal(false),
    isRunningToolCalls: createSignal(false),
    isLoading: createSignal(isLoading),
    exhaustedRetries: createSignal(false),
    error: createSignal(error),
    sendingError: createSignal(undefined),
    generatingError: createSignal(undefined),
    lastAssistantMessage: createSignal(undefined),
    isLoadingThread: createSignal(false),
    isSavingThread: createSignal(false),
    threadLoadError: createSignal(undefined),
    threadSaveError: createSignal(undefined),
    start: vi.fn(() => vi.fn()),
    updateOptions: vi.fn(),
    sendMessage: vi.fn(),
    resendMessages: vi.fn(),
    stop: vi.fn(),
    setMessages: vi.fn((nextMessages) => messagesSignal.set(nextMessages)),
    setState: vi.fn(),
  } as never;
}

function getLastUpdateOptions(runtime: {
  updateOptions: { mock: { calls: [Record<string, unknown>][] } };
}) {
  const calls = runtime.updateOptions.mock.calls;

  return calls[calls.length - 1]?.[0];
}

function createSignal<T>(initialValue: T) {
  let value = initialValue;
  const subscribers = new Set<(newValue: T) => void>();
  const signal = (() => value) as {
    (): T;
    set(newValue: T): void;
    subscribe(onChange: (newValue: T) => void): () => void;
  };
  signal.set = (newValue) => {
    value = newValue;
    subscribers.forEach((onChange) => onChange(newValue));
  };
  signal.subscribe = vi.fn((onChange) => {
    subscribers.add(onChange);

    return () => subscribers.delete(onChange);
  });

  return signal;
}
