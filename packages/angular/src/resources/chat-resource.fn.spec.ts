import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ModelInput } from '@hashbrownai/core';
import { provideHashbrown } from '../providers/provide-hashbrown.fn';
import { chatResource } from './chat-resource.fn';

const fryHashbrownMock = vi.hoisted(() => vi.fn());

vi.mock('@hashbrownai/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hashbrownai/core')>();

  return {
    ...actual,
    fryHashbrown: fryHashbrownMock,
  };
});

test('chatResource initializes with the provided message history', () => {
  fryHashbrownMock.mockReset();
  fryHashbrownMock.mockImplementation((init) =>
    createHashbrownStub({ messages: init.messages ?? [] }),
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
      model: 'gpt-4.1',
      system: 'You are a helpful assistant.',
      messages,
    }),
  );

  expect(chat.value()).toEqual(messages);
});

test('chatResource allows replacing message history', () => {
  fryHashbrownMock.mockReset();
  fryHashbrownMock.mockImplementation((init) =>
    createHashbrownStub({ messages: init.messages ?? [] }),
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
      model: 'gpt-4.1',
      system: 'You are a helpful assistant.',
      messages: initialMessages,
    }),
  );

  chat.setMessages(nextMessages);

  expect(chat.value()).toEqual(nextMessages);
});

test('chatResource updates runtime options when option signals change', () => {
  fryHashbrownMock.mockReset();
  const model = signal<ModelInput>('gpt-4.1');
  const apiUrl = signal('/chat-a');
  const system = signal('System A');
  const threadId = signal<string | undefined>('thread-a');
  const hashbrown = createHashbrownStub({ messages: [] });
  fryHashbrownMock.mockReturnValue(hashbrown);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    chatResource({
      model,
      apiUrl,
      system,
      threadId,
    }),
  );

  expect(fryHashbrownMock).toHaveBeenCalledWith(
    expect.objectContaining({
      model: 'gpt-4.1',
      apiUrl: '/chat-a',
      system: 'System A',
      threadId: 'thread-a',
    }),
  );

  model.set('gpt-4.2');
  apiUrl.set('/chat-b');
  system.set('System B');
  threadId.set('thread-b');
  TestBed.flushEffects();

  expect(hashbrown.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({
      model: 'gpt-4.2',
      apiUrl: '/chat-b',
      system: 'System B',
      threadId: 'thread-b',
    }),
  );
});

test('chatResource preserves an empty apiUrl option', () => {
  fryHashbrownMock.mockReset();
  const apiUrl = signal('');
  const hashbrown = createHashbrownStub({ messages: [] });
  fryHashbrownMock.mockReturnValue(hashbrown);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    chatResource({
      model: 'gpt-4.1',
      apiUrl,
      system: 'System A',
    }),
  );

  expect(fryHashbrownMock).toHaveBeenCalledWith(
    expect.objectContaining({
      apiUrl: '',
    }),
  );

  apiUrl.set('/chat-b');
  TestBed.flushEffects();

  expect(hashbrown.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({
      apiUrl: '/chat-b',
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

test('chatResource preserves a literal empty apiUrl option', () => {
  fryHashbrownMock.mockReset();
  const hashbrown = createHashbrownStub({ messages: [] });
  fryHashbrownMock.mockReturnValue(hashbrown);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    chatResource({
      model: 'gpt-4.1',
      apiUrl: '',
      system: 'System A',
    }),
  );

  expect(fryHashbrownMock).toHaveBeenCalledWith(
    expect.objectContaining({
      apiUrl: '',
    }),
  );

  TestBed.flushEffects();

  expect(hashbrown.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({
      apiUrl: '',
    }),
  );
});

test('chatResource preserves an empty threadId option', () => {
  fryHashbrownMock.mockReset();
  const threadId = signal<string | undefined>('');
  const hashbrown = createHashbrownStub({ messages: [] });
  fryHashbrownMock.mockReturnValue(hashbrown);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    chatResource({
      model: 'gpt-4.1',
      system: 'System A',
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

test('chatResource preserves a literal empty threadId option', () => {
  fryHashbrownMock.mockReset();
  const hashbrown = createHashbrownStub({ messages: [] });
  fryHashbrownMock.mockReturnValue(hashbrown);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    chatResource({
      model: 'gpt-4.1',
      system: 'System A',
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

test('chatResource omits threadId from runtime updates when not provided', () => {
  fryHashbrownMock.mockReset();
  const model = signal<ModelInput>('gpt-4.1');
  const hashbrown = createHashbrownStub({ messages: [] });
  fryHashbrownMock.mockReturnValue(hashbrown);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    chatResource({
      model,
      system: 'System A',
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

function createHashbrownStub({ messages }: { messages: unknown[] }) {
  const messagesSignal = createSignal(messages);

  return {
    messages: messagesSignal,
    isReceiving: createSignal(false),
    isSending: createSignal(false),
    isGenerating: createSignal(false),
    isRunningToolCalls: createSignal(false),
    isLoading: createSignal(false),
    exhaustedRetries: createSignal(false),
    error: createSignal(undefined),
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
