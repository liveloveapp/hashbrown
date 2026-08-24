import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ModelInput } from '@hashbrownai/core';
import { provideHashbrown } from '../providers/provide-hashbrown.fn';
import { completionResource } from './completion-resource.fn';

const fryHashbrownMock = vi.hoisted(() => vi.fn());

vi.mock('@hashbrownai/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hashbrownai/core')>();

  return {
    ...actual,
    fryHashbrown: fryHashbrownMock,
  };
});

test('completionResource updates runtime options when option signals change', () => {
  fryHashbrownMock.mockReset();
  const model = signal('gpt-4.1');
  const apiUrl = signal('/completion-a');
  const system = signal('System A');
  const threadId = signal<string | undefined>('thread-a');
  const input = signal('Summarize this');
  const hashbrown = createHashbrownStub({ messages: [] });
  fryHashbrownMock.mockReturnValue(hashbrown);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  const resource = TestBed.runInInjectionContext(() =>
    completionResource({
      model,
      apiUrl,
      system,
      input,
      threadId,
    }),
  );

  expect(fryHashbrownMock).toHaveBeenCalledWith(
    expect.objectContaining({
      model: 'gpt-4.1',
      apiUrl: '/completion-a',
      system: 'System A',
      threadId: 'thread-a',
    }),
  );
  expect(resource).not.toHaveProperty('isLoadingThread');
  expect(resource).not.toHaveProperty('isSavingThread');
  expect(resource).not.toHaveProperty('threadLoadError');
  expect(resource).not.toHaveProperty('threadSaveError');
  expect(resource).not.toHaveProperty('threadId');

  model.set('gpt-4.2');
  apiUrl.set('/completion-b');
  system.set('System B');
  threadId.set('thread-b');
  TestBed.flushEffects();

  expect(hashbrown.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({
      model: 'gpt-4.2',
      apiUrl: '/completion-b',
      system: 'System B',
      threadId: 'thread-b',
    }),
  );

  threadId.set(undefined);
  TestBed.flushEffects();

  expect(hashbrown.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({
      threadId: undefined,
    }),
  );

  threadId.set('');
  TestBed.flushEffects();

  expect(hashbrown.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({
      threadId: '',
    }),
  );
});

test('completionResource accepts fallback model input signals', () => {
  fryHashbrownMock.mockReset();
  const model = signal<ModelInput>(['gpt-4.1', 'gpt-4.1-mini']);
  const input = signal('Summarize this');
  const hashbrown = createHashbrownStub({ messages: [] });
  fryHashbrownMock.mockReturnValue(hashbrown);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    completionResource({
      model,
      system: 'System A',
      input,
    }),
  );

  expect(fryHashbrownMock).toHaveBeenCalledWith(
    expect.objectContaining({
      model: ['gpt-4.1', 'gpt-4.1-mini'],
    }),
  );

  model.set(['gpt-4.2', 'gpt-4.2-mini']);
  TestBed.flushEffects();

  expect(hashbrown.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({
      model: ['gpt-4.2', 'gpt-4.2-mini'],
    }),
  );
});

test('completionResource preserves direct model factory options', () => {
  fryHashbrownMock.mockReset();
  const model = vi.fn(() => ({
    name: 'test-model',
    transport: vi.fn(),
  })) as unknown as ModelInput;
  const system = signal('System A');
  const input = signal('Summarize this');
  const hashbrown = createHashbrownStub({ messages: [] });
  fryHashbrownMock.mockReturnValue(hashbrown);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    completionResource({
      model,
      system,
      input,
    }),
  );

  expect(fryHashbrownMock.mock.calls[0]?.[0].model).toBe(model);
  expect(model).not.toHaveBeenCalled();

  system.set('System B');
  TestBed.flushEffects();
  const lastOptions = getLastUpdateOptions(hashbrown);

  expect(lastOptions?.model).toBe(model);
  expect(model).not.toHaveBeenCalled();
});

test('completionResource preserves an empty apiUrl option', () => {
  fryHashbrownMock.mockReset();
  const apiUrl = signal('');
  const input = signal('Summarize this');
  const hashbrown = createHashbrownStub({ messages: [] });
  fryHashbrownMock.mockReturnValue(hashbrown);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    completionResource({
      model: 'gpt-4.1',
      apiUrl,
      system: 'System A',
      input,
    }),
  );

  expect(fryHashbrownMock).toHaveBeenCalledWith(
    expect.objectContaining({
      apiUrl: '',
    }),
  );

  apiUrl.set('/completion-b');
  TestBed.flushEffects();

  expect(hashbrown.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({
      apiUrl: '/completion-b',
    }),
  );

  apiUrl.set('');
  TestBed.flushEffects();

  expect(hashbrown.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({
      apiUrl: '',
    }),
  );
});

test('completionResource preserves an empty threadId option', () => {
  fryHashbrownMock.mockReset();
  const input = signal('Summarize this');
  const threadId = signal<string | undefined>('');
  const hashbrown = createHashbrownStub({ messages: [] });
  fryHashbrownMock.mockReturnValue(hashbrown);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    completionResource({
      model: 'gpt-4.1',
      system: 'System A',
      input,
      threadId,
    }),
  );

  expect(fryHashbrownMock).toHaveBeenCalledWith(
    expect.objectContaining({
      threadId: '',
    }),
  );

  threadId.set('thread-b');
  TestBed.flushEffects();

  expect(hashbrown.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({
      threadId: 'thread-b',
    }),
  );

  threadId.set('');
  TestBed.flushEffects();

  expect(hashbrown.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({
      threadId: '',
    }),
  );
});

test('completionResource preserves a literal empty threadId option', () => {
  fryHashbrownMock.mockReset();
  const input = signal('Summarize this');
  const hashbrown = createHashbrownStub({ messages: [] });
  fryHashbrownMock.mockReturnValue(hashbrown);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    completionResource({
      model: 'gpt-4.1',
      system: 'System A',
      input,
      threadId: '',
    }),
  );

  expect(fryHashbrownMock).toHaveBeenCalledWith(
    expect.objectContaining({
      threadId: '',
    }),
  );

  TestBed.flushEffects();

  expect(hashbrown.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({
      threadId: '',
    }),
  );
});

test('completionResource omits threadId from runtime updates when not provided', () => {
  fryHashbrownMock.mockReset();
  const model = signal('gpt-4.1');
  const input = signal('Summarize this');
  const hashbrown = createHashbrownStub({ messages: [] });
  fryHashbrownMock.mockReturnValue(hashbrown);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    completionResource({
      model,
      system: 'System A',
      input,
    }),
  );

  model.set('gpt-4.2');
  TestBed.flushEffects();
  const lastOptions = getLastUpdateOptions(hashbrown);

  expect(lastOptions).toEqual(
    expect.objectContaining({
      model: 'gpt-4.2',
    }),
  );
  expect(Object.prototype.hasOwnProperty.call(lastOptions, 'threadId')).toBe(
    false,
  );
});

test('completionResource exposes a resolved snapshot after a successful completion', () => {
  fryHashbrownMock.mockReset();
  const hashbrown = createHashbrownStub({
    messages: [{ role: 'assistant', content: 'Completed response' }],
  });
  fryHashbrownMock.mockReturnValue(hashbrown);
  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  const resource = TestBed.runInInjectionContext(() =>
    completionResource({
      model: 'gpt-4.1',
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
  fryHashbrownMock.mockReset();
  const hashbrown = createHashbrownStub({
    messages: [{ role: 'assistant', content: '' }],
  });
  fryHashbrownMock.mockReturnValue(hashbrown);
  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  const resource = TestBed.runInInjectionContext(() =>
    completionResource({
      model: 'gpt-4.1',
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
  fryHashbrownMock.mockReset();
  const failure = new Error('Request cannot be retried');
  const hashbrown = createHashbrownStub({
    messages: [],
    error: failure,
    exhaustedRetries: false,
  });
  fryHashbrownMock.mockReturnValue(hashbrown);
  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  const resource = TestBed.runInInjectionContext(() =>
    completionResource({
      model: 'gpt-4.1',
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
  fryHashbrownMock.mockReset();
  const messages = [
    { role: 'user' as const, content: 'Summarize this' },
    { role: 'assistant' as const, content: 'Completed response' },
  ];
  const originalMessages = structuredClone(messages);
  const hashbrown = createHashbrownStub({ messages });
  fryHashbrownMock.mockReturnValue(hashbrown);
  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });
  const resource = TestBed.runInInjectionContext(() =>
    completionResource({
      model: 'gpt-4.1',
      system: 'System A',
      input: signal('Summarize this'),
    }),
  );
  hashbrown.setMessages.mockClear();

  const reloaded = resource.reload();

  expect(reloaded).toBe(true);
  expect(hashbrown.setMessages).toHaveBeenCalledTimes(1);
  expect(hashbrown.setMessages).toHaveBeenCalledWith([messages[0]]);
  expect(hashbrown.resendMessages).not.toHaveBeenCalled();
  expect(messages).toEqual(originalMessages);
});

test('completionResource retries a failed completion with user-only history', () => {
  fryHashbrownMock.mockReset();
  const hashbrown = createHashbrownStub({
    messages: [{ role: 'user', content: 'Summarize this' }],
    error: new Error('Request failed'),
  });
  fryHashbrownMock.mockReturnValue(hashbrown);
  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });
  const resource = TestBed.runInInjectionContext(() =>
    completionResource({
      model: 'gpt-4.1',
      system: 'System A',
      input: signal('Summarize this'),
    }),
  );
  hashbrown.setMessages.mockClear();

  const reloaded = resource.reload();

  expect(reloaded).toBe(true);
  expect(hashbrown.resendMessages).toHaveBeenCalledTimes(1);
  expect(hashbrown.setMessages).not.toHaveBeenCalled();
});

test('completionResource reload returns false when there is no request', () => {
  fryHashbrownMock.mockReset();
  const hashbrown = createHashbrownStub({ messages: [] });
  fryHashbrownMock.mockReturnValue(hashbrown);
  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });
  const resource = TestBed.runInInjectionContext(() =>
    completionResource({
      model: 'gpt-4.1',
      system: 'System A',
      input: signal<string | null>(null),
    }),
  );
  hashbrown.setMessages.mockClear();

  const reloaded = resource.reload();

  expect(reloaded).toBe(false);
  expect(hashbrown.setMessages).not.toHaveBeenCalled();
  expect(hashbrown.resendMessages).not.toHaveBeenCalled();
});

test('completionResource reload does not resend an already-answered history', () => {
  fryHashbrownMock.mockReset();
  const hashbrown = createHashbrownStub({
    messages: [
      { role: 'user', content: 'Summarize this' },
      { role: 'assistant', content: 'Completed response' },
      { role: 'error', content: 'Follow-up operation failed' },
    ],
    error: new Error('Follow-up operation failed'),
  });
  fryHashbrownMock.mockReturnValue(hashbrown);
  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });
  const resource = TestBed.runInInjectionContext(() =>
    completionResource({
      model: 'gpt-4.1',
      system: 'System A',
      input: signal('Summarize this'),
    }),
  );
  hashbrown.setMessages.mockClear();

  const reloaded = resource.reload();

  expect(reloaded).toBe(false);
  expect(hashbrown.setMessages).not.toHaveBeenCalled();
  expect(hashbrown.resendMessages).not.toHaveBeenCalled();
});

function createHashbrownStub({
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
    sizzle: vi.fn(() => vi.fn()),
    updateOptions: vi.fn(),
    sendMessage: vi.fn(),
    resendMessages: vi.fn(),
    stop: vi.fn(),
    setMessages: vi.fn((nextMessages) => messagesSignal.set(nextMessages)),
  } as never;
}

function getLastUpdateOptions(hashbrown: {
  updateOptions: { mock: { calls: [Record<string, unknown>][] } };
}) {
  const calls = hashbrown.updateOptions.mock.calls;

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
