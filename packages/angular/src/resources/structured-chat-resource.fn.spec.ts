import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { s } from '@hashbrownai/core';
import { provideHashbrown } from '../providers/provide-hashbrown.fn';
import { structuredChatResource } from './structured-chat-resource.fn';

const createChatRuntimeMock = vi.hoisted(() => vi.fn());

vi.mock('@hashbrownai/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hashbrownai/core')>();

  return {
    ...actual,
    createChatRuntime: createChatRuntimeMock,
  };
});

test('structuredChatResource updates runtime options when option signals change', () => {
  createChatRuntimeMock.mockReset();
  const apiUrl = signal('/structured-a');
  const system = signal('System A');
  const threadId = signal<string | undefined>('thread-a');
  const runtime = createRuntimeStub({ messages: [] });
  createChatRuntimeMock.mockReturnValue(runtime);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  const resource = TestBed.runInInjectionContext(() =>
    structuredChatResource({
      apiUrl,
      system,
      threadId,
      schema: s.object('risk summary', {
        risk: s.string('Risk level'),
      }),
    }),
  );

  expect(createChatRuntimeMock).toHaveBeenCalledWith(
    expect.objectContaining({
      system: 'System A',
      threadId: 'thread-a',
      transport: expect.any(Function),
    }),
  );
  expect(resource).not.toHaveProperty('isLoadingThread');
  expect(resource).not.toHaveProperty('isSavingThread');
  expect(resource).not.toHaveProperty('threadLoadError');
  expect(resource).not.toHaveProperty('threadSaveError');
  expect(resource).not.toHaveProperty('threadId');

  apiUrl.set('/structured-b');
  system.set('System B');
  threadId.set('thread-b');
  TestBed.flushEffects();

  expect(runtime.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({
      system: 'System B',
      threadId: 'thread-b',
      transport: expect.any(Function),
    }),
  );

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

test('structuredChatResource preserves an empty apiUrl option', () => {
  createChatRuntimeMock.mockReset();
  const apiUrl = signal('');
  const runtime = createRuntimeStub({ messages: [] });
  createChatRuntimeMock.mockReturnValue(runtime);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    structuredChatResource({
      apiUrl,
      system: 'System A',
      schema: s.object('risk summary', {
        risk: s.string('Risk level'),
      }),
    }),
  );

  expect(createChatRuntimeMock).toHaveBeenCalledWith(
    expect.objectContaining({
      transport: expect.any(Function),
    }),
  );

  apiUrl.set('/structured-b');
  TestBed.flushEffects();

  expect(runtime.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({
      transport: expect.any(Function),
    }),
  );

  apiUrl.set('');
  TestBed.flushEffects();

  expect(runtime.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({
      transport: expect.any(Function),
    }),
  );
});

test('structuredChatResource preserves an empty threadId option', () => {
  createChatRuntimeMock.mockReset();
  const threadId = signal<string | undefined>('');
  const runtime = createRuntimeStub({ messages: [] });
  createChatRuntimeMock.mockReturnValue(runtime);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    structuredChatResource({
      system: 'System A',
      threadId,
      schema: s.object('risk summary', {
        risk: s.string('Risk level'),
      }),
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

test('structuredChatResource preserves a literal empty threadId option', () => {
  createChatRuntimeMock.mockReset();
  const runtime = createRuntimeStub({ messages: [] });
  createChatRuntimeMock.mockReturnValue(runtime);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    structuredChatResource({
      system: 'System A',
      threadId: '',
      schema: s.object('risk summary', {
        risk: s.string('Risk level'),
      }),
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

test('structuredChatResource omits threadId from runtime updates when not provided', () => {
  createChatRuntimeMock.mockReset();
  const system = signal('System A');
  const runtime = createRuntimeStub({ messages: [] });
  createChatRuntimeMock.mockReturnValue(runtime);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    structuredChatResource({
      system,
      schema: s.object('risk summary', {
        risk: s.string('Risk level'),
      }),
    }),
  );

  system.set('System B');
  TestBed.flushEffects();
  const lastOptions = getLastUpdateOptions(runtime);

  expect(Object.prototype.hasOwnProperty.call(lastOptions, 'threadId')).toBe(
    false,
  );
});

test('structuredChatResource exposes a terminal error when retries are disabled', () => {
  createChatRuntimeMock.mockReset();
  const failure = new Error('Invalid request');
  const runtime = createRuntimeStub({
    messages: [],
    error: failure,
    exhaustedRetries: false,
  });
  createChatRuntimeMock.mockReturnValue(runtime);
  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  const resource = TestBed.runInInjectionContext(() =>
    structuredChatResource({
      system: 'System A',
      schema: s.object('risk summary', {
        risk: s.string('Risk level'),
      }),
      retries: 0,
    }),
  );

  expect(createChatRuntimeMock).toHaveBeenCalledWith(
    expect.objectContaining({ retries: 0 }),
  );
  expect(resource.error()).toBe(failure);
  expect(resource.status()).toBe('error');
  expect(resource.snapshot()).toEqual({ status: 'error', error: failure });
  expect(() => resource.value()).toThrow(failure);
});

test('structuredChatResource reload removes the last assistant response without mutating history', () => {
  createChatRuntimeMock.mockReset();
  const messages = [
    { role: 'user' as const, content: 'Summarize this' },
    {
      role: 'assistant' as const,
      content: { risk: 'low' },
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
    structuredChatResource({
      system: 'System A',
      schema: s.object('risk summary', {
        risk: s.string('Risk level'),
      }),
    }),
  );

  const reloaded = resource.reload();

  expect(reloaded).toBe(true);
  expect(runtime.setMessages).toHaveBeenCalledTimes(1);
  expect(runtime.setMessages).toHaveBeenCalledWith([messages[0]]);
  expect(messages).toEqual(originalMessages);
});

test('structuredChatResource reload returns false when messages are empty', () => {
  createChatRuntimeMock.mockReset();
  const runtime = createRuntimeStub({ messages: [] });
  createChatRuntimeMock.mockReturnValue(runtime);
  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });
  const resource = TestBed.runInInjectionContext(() =>
    structuredChatResource({
      system: 'System A',
      schema: s.object('risk summary', {
        risk: s.string('Risk level'),
      }),
    }),
  );

  const reloaded = resource.reload();

  expect(reloaded).toBe(false);
  expect(runtime.setMessages).not.toHaveBeenCalled();
});

test('structuredChatResource forwards initial state and exposes runtime state', () => {
  createChatRuntimeMock.mockReset();
  const stateSignal = createSignal<{ portfolioId: string } | undefined>({
    portfolioId: 'alpha',
  });
  const runtime = createRuntimeStub({ messages: [], state: stateSignal });
  createChatRuntimeMock.mockReturnValue(runtime);
  const initialState = { portfolioId: 'alpha' };
  const system = signal('System A');

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  const resource = TestBed.runInInjectionContext(() =>
    structuredChatResource({
      system,
      schema: s.object('risk summary', { risk: s.string('Risk level') }),
      state: initialState,
    }),
  );
  stateSignal.set({ portfolioId: 'beta' });
  resource.setState({ portfolioId: 'gamma' });
  system.set('System B');
  TestBed.flushEffects();

  expect(createChatRuntimeMock.mock.calls[0]?.[0].state).toBe(initialState);
  expect(resource.state()).toEqual({ portfolioId: 'beta' });
  expect(runtime.setState).toHaveBeenCalledWith({ portfolioId: 'gamma' });
  expect(
    runtime.updateOptions.mock.calls.every(
      ([updatedOptions]) => !Object.hasOwn(updatedOptions, 'state'),
    ),
  ).toBe(true);
});

function createRuntimeStub({
  messages,
  error,
  exhaustedRetries = false,
  state = createSignal<unknown>(undefined),
}: {
  messages: unknown[];
  error?: Error;
  exhaustedRetries?: boolean;
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
    isLoading: createSignal(false),
    exhaustedRetries: createSignal(exhaustedRetries),
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
