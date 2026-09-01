import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHashbrown } from '../providers/provide-hashbrown.fn';
import { completionResource } from './completion-resource.fn';

const createChatRuntimeMock = vi.hoisted(() => vi.fn());

vi.mock('@hashbrownai/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hashbrownai/core')>();

  return {
    ...actual,
    createChatRuntime: createChatRuntimeMock,
  };
});

test('completionResource updates runtime options when option signals change', () => {
  createChatRuntimeMock.mockReset();
  const apiUrl = signal('/completion-a');
  const system = signal('System A');
  const threadId = signal<string | undefined>('thread-a');
  const input = signal('Summarize this');
  const runtime = createRuntimeStub({ messages: [] });
  createChatRuntimeMock.mockReturnValue(runtime);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  const resource = TestBed.runInInjectionContext(() =>
    completionResource({
      apiUrl,
      system,
      input,
      threadId,
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

  apiUrl.set('/completion-b');
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

test('completionResource preserves an empty apiUrl option', () => {
  createChatRuntimeMock.mockReset();
  const apiUrl = signal('');
  const input = signal('Summarize this');
  const runtime = createRuntimeStub({ messages: [] });
  createChatRuntimeMock.mockReturnValue(runtime);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    completionResource({
      apiUrl,
      system: 'System A',
      input,
    }),
  );

  expect(createChatRuntimeMock).toHaveBeenCalledWith(
    expect.objectContaining({
      transport: expect.any(Function),
    }),
  );

  apiUrl.set('/completion-b');
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

test('completionResource preserves an empty threadId option', () => {
  createChatRuntimeMock.mockReset();
  const input = signal('Summarize this');
  const threadId = signal<string | undefined>('');
  const runtime = createRuntimeStub({ messages: [] });
  createChatRuntimeMock.mockReturnValue(runtime);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    completionResource({
      system: 'System A',
      input,
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

test('completionResource preserves a literal empty threadId option', () => {
  createChatRuntimeMock.mockReset();
  const input = signal('Summarize this');
  const runtime = createRuntimeStub({ messages: [] });
  createChatRuntimeMock.mockReturnValue(runtime);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    completionResource({
      system: 'System A',
      input,
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

test('completionResource omits threadId from runtime updates when not provided', () => {
  createChatRuntimeMock.mockReset();
  const system = signal('System A');
  const input = signal('Summarize this');
  const runtime = createRuntimeStub({ messages: [] });
  createChatRuntimeMock.mockReturnValue(runtime);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    completionResource({
      system,
      input,
    }),
  );

  system.set('System B');
  TestBed.flushEffects();
  const lastOptions = getLastUpdateOptions(runtime);

  expect(Object.prototype.hasOwnProperty.call(lastOptions, 'threadId')).toBe(
    false,
  );
});

test('completionResource exposes a resolved snapshot after a successful completion', () => {
  createChatRuntimeMock.mockReset();
  const runtime = createRuntimeStub({
    messages: [{ role: 'assistant', content: 'Completed response' }],
  });
  createChatRuntimeMock.mockReturnValue(runtime);
  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  const resource = TestBed.runInInjectionContext(() =>
    completionResource({
      system: 'System A',
      input: signal('Summarize this'),
    }),
  );

  expect(resource.value()).toBe('Completed response');
  expect(resource.status()).toBe('resolved');
  expect(resource.error()).toBeUndefined();
  expect(resource.snapshot()).toEqual({
    status: 'resolved',
    value: 'Completed response',
  });
});

test('completionResource retains a successful empty string', () => {
  createChatRuntimeMock.mockReset();
  const runtime = createRuntimeStub({
    messages: [{ role: 'assistant', content: '' }],
  });
  createChatRuntimeMock.mockReturnValue(runtime);
  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  const resource = TestBed.runInInjectionContext(() =>
    completionResource({
      system: 'System A',
      input: signal('Summarize this'),
    }),
  );

  expect(resource.value()).toBe('');
  expect(resource.status()).toBe('resolved');
  expect(resource.hasValue()).toBe(true);
  expect(resource.snapshot()).toEqual({ status: 'resolved', value: '' });
});

test('completionResource exposes a non-retryable terminal error', () => {
  createChatRuntimeMock.mockReset();
  const failure = new Error('Request cannot be retried');
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
    completionResource({
      system: 'System A',
      input: signal('Summarize this'),
    }),
  );

  expect(resource.error()).toBe(failure);
  expect(resource.status()).toBe('error');
  expect(resource.snapshot()).toEqual({ status: 'error', error: failure });
  expect(() => resource.value()).toThrow(failure);
});

test('completionResource reloads a resolved completion without mutating message history', () => {
  createChatRuntimeMock.mockReset();
  const messages = [
    { role: 'user' as const, content: 'Summarize this' },
    { role: 'assistant' as const, content: 'Completed response' },
  ];
  const originalMessages = structuredClone(messages);
  const runtime = createRuntimeStub({ messages });
  createChatRuntimeMock.mockReturnValue(runtime);
  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });
  const resource = TestBed.runInInjectionContext(() =>
    completionResource({
      system: 'System A',
      input: signal('Summarize this'),
    }),
  );
  runtime.setMessages.mockClear();

  const reloaded = resource.reload();

  expect(reloaded).toBe(true);
  expect(runtime.setMessages).toHaveBeenCalledTimes(1);
  expect(runtime.setMessages).toHaveBeenCalledWith([messages[0]]);
  expect(runtime.resendMessages).not.toHaveBeenCalled();
  expect(messages).toEqual(originalMessages);
});

test('completionResource retries a failed completion with user-only history', () => {
  createChatRuntimeMock.mockReset();
  const runtime = createRuntimeStub({
    messages: [{ role: 'user', content: 'Summarize this' }],
    error: new Error('Request failed'),
  });
  createChatRuntimeMock.mockReturnValue(runtime);
  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });
  const resource = TestBed.runInInjectionContext(() =>
    completionResource({
      system: 'System A',
      input: signal('Summarize this'),
    }),
  );
  runtime.setMessages.mockClear();

  const reloaded = resource.reload();

  expect(reloaded).toBe(true);
  expect(runtime.resendMessages).toHaveBeenCalledTimes(1);
  expect(runtime.setMessages).not.toHaveBeenCalled();
});

test('completionResource reload returns false when there is no request', () => {
  createChatRuntimeMock.mockReset();
  const runtime = createRuntimeStub({ messages: [] });
  createChatRuntimeMock.mockReturnValue(runtime);
  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });
  const resource = TestBed.runInInjectionContext(() =>
    completionResource({
      system: 'System A',
      input: signal<string | null>(null),
    }),
  );
  runtime.setMessages.mockClear();

  const reloaded = resource.reload();

  expect(reloaded).toBe(false);
  expect(runtime.setMessages).not.toHaveBeenCalled();
  expect(runtime.resendMessages).not.toHaveBeenCalled();
});

test('completionResource reload does not resend an already-answered history', () => {
  createChatRuntimeMock.mockReset();
  const runtime = createRuntimeStub({
    messages: [
      { role: 'user', content: 'Summarize this' },
      { role: 'assistant', content: 'Completed response' },
      { role: 'error', content: 'Follow-up operation failed' },
    ],
    error: new Error('Follow-up operation failed'),
  });
  createChatRuntimeMock.mockReturnValue(runtime);
  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });
  const resource = TestBed.runInInjectionContext(() =>
    completionResource({
      system: 'System A',
      input: signal('Summarize this'),
    }),
  );
  runtime.setMessages.mockClear();

  const reloaded = resource.reload();

  expect(reloaded).toBe(false);
  expect(runtime.setMessages).not.toHaveBeenCalled();
  expect(runtime.resendMessages).not.toHaveBeenCalled();
});

function createRuntimeStub({
  messages,
  error,
  exhaustedRetries = false,
}: {
  messages: unknown[];
  error?: Error;
  exhaustedRetries?: boolean;
}) {
  const messagesSignal = createSignal(messages);

  return {
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
