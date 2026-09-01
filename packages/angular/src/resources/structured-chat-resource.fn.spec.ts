import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { s } from '@hashbrownai/core';
import type { ModelInput } from '@hashbrownai/core';
import { provideHashbrown } from '../providers/provide-hashbrown.fn';
import { structuredChatResource } from './structured-chat-resource.fn';

const fryHashbrownMock = vi.hoisted(() => vi.fn());

vi.mock('@hashbrownai/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hashbrownai/core')>();

  return {
    ...actual,
    fryHashbrown: fryHashbrownMock,
  };
});

test('structuredChatResource updates runtime options when option signals change', () => {
  fryHashbrownMock.mockReset();
  const model = signal<ModelInput>('gpt-4.1');
  const apiUrl = signal('/structured-a');
  const system = signal('System A');
  const threadId = signal<string | undefined>('thread-a');
  const hashbrown = createHashbrownStub({ messages: [] });
  fryHashbrownMock.mockReturnValue(hashbrown);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  const resource = TestBed.runInInjectionContext(() =>
    structuredChatResource({
      model,
      apiUrl,
      system,
      threadId,
      schema: s.object('risk summary', {
        risk: s.string('Risk level'),
      }),
    }),
  );

  expect(fryHashbrownMock).toHaveBeenCalledWith(
    expect.objectContaining({
      model: 'gpt-4.1',
      apiUrl: '/structured-a',
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
  apiUrl.set('/structured-b');
  system.set('System B');
  threadId.set('thread-b');
  TestBed.flushEffects();

  expect(hashbrown.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({
      model: 'gpt-4.2',
      apiUrl: '/structured-b',
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

test('structuredChatResource preserves direct model factory options', () => {
  fryHashbrownMock.mockReset();
  const model = vi.fn(() => ({
    name: 'test-model',
    transport: vi.fn(),
  })) as unknown as ModelInput;
  const system = signal('System A');
  const hashbrown = createHashbrownStub({ messages: [] });
  fryHashbrownMock.mockReturnValue(hashbrown);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    structuredChatResource({
      model,
      system,
      schema: s.object('risk summary', {
        risk: s.string('Risk level'),
      }),
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

test('structuredChatResource preserves an empty apiUrl option', () => {
  fryHashbrownMock.mockReset();
  const apiUrl = signal('');
  const hashbrown = createHashbrownStub({ messages: [] });
  fryHashbrownMock.mockReturnValue(hashbrown);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    structuredChatResource({
      model: 'gpt-4.1',
      apiUrl,
      system: 'System A',
      schema: s.object('risk summary', {
        risk: s.string('Risk level'),
      }),
    }),
  );

  expect(fryHashbrownMock).toHaveBeenCalledWith(
    expect.objectContaining({
      apiUrl: '',
    }),
  );

  apiUrl.set('/structured-b');
  TestBed.flushEffects();

  expect(hashbrown.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({
      apiUrl: '/structured-b',
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

test('structuredChatResource preserves an empty threadId option', () => {
  fryHashbrownMock.mockReset();
  const threadId = signal<string | undefined>('');
  const hashbrown = createHashbrownStub({ messages: [] });
  fryHashbrownMock.mockReturnValue(hashbrown);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    structuredChatResource({
      model: 'gpt-4.1',
      system: 'System A',
      threadId,
      schema: s.object('risk summary', {
        risk: s.string('Risk level'),
      }),
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

test('structuredChatResource preserves a literal empty threadId option', () => {
  fryHashbrownMock.mockReset();
  const hashbrown = createHashbrownStub({ messages: [] });
  fryHashbrownMock.mockReturnValue(hashbrown);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    structuredChatResource({
      model: 'gpt-4.1',
      system: 'System A',
      threadId: '',
      schema: s.object('risk summary', {
        risk: s.string('Risk level'),
      }),
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

test('structuredChatResource omits threadId from runtime updates when not provided', () => {
  fryHashbrownMock.mockReset();
  const model = signal<ModelInput>('gpt-4.1');
  const hashbrown = createHashbrownStub({ messages: [] });
  fryHashbrownMock.mockReturnValue(hashbrown);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    structuredChatResource({
      model,
      system: 'System A',
      schema: s.object('risk summary', {
        risk: s.string('Risk level'),
      }),
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

test('structuredChatResource exposes a terminal error when retries are disabled', () => {
  fryHashbrownMock.mockReset();
  const failure = new Error('Invalid request');
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
    structuredChatResource({
      model: 'gpt-4.1',
      system: 'System A',
      schema: s.object('risk summary', {
        risk: s.string('Risk level'),
      }),
      retries: 0,
    }),
  );

  expect(fryHashbrownMock).toHaveBeenCalledWith(
    expect.objectContaining({ retries: 0 }),
  );
  expect(resource.error()).toBe(failure);
  expect(resource.status()).toBe('error');
  expect(resource.snapshot()).toEqual({ status: 'error', error: failure });
  expect(() => resource.value()).toThrow(failure);
});

test('structuredChatResource reload removes the last assistant response without mutating history', () => {
  fryHashbrownMock.mockReset();
  const messages = [
    { role: 'user' as const, content: 'Summarize this' },
    {
      role: 'assistant' as const,
      content: { risk: 'low' },
      toolCalls: [],
    },
  ];
  const originalMessages = structuredClone(messages);
  const hashbrown = createHashbrownStub({ messages });
  fryHashbrownMock.mockReturnValue(hashbrown);
  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });
  const resource = TestBed.runInInjectionContext(() =>
    structuredChatResource({
      model: 'gpt-4.1',
      system: 'System A',
      schema: s.object('risk summary', {
        risk: s.string('Risk level'),
      }),
    }),
  );

  const reloaded = resource.reload();

  expect(reloaded).toBe(true);
  expect(hashbrown.setMessages).toHaveBeenCalledTimes(1);
  expect(hashbrown.setMessages).toHaveBeenCalledWith([messages[0]]);
  expect(messages).toEqual(originalMessages);
});

test('structuredChatResource reload returns false when messages are empty', () => {
  fryHashbrownMock.mockReset();
  const hashbrown = createHashbrownStub({ messages: [] });
  fryHashbrownMock.mockReturnValue(hashbrown);
  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });
  const resource = TestBed.runInInjectionContext(() =>
    structuredChatResource({
      model: 'gpt-4.1',
      system: 'System A',
      schema: s.object('risk summary', {
        risk: s.string('Risk level'),
      }),
    }),
  );

  const reloaded = resource.reload();

  expect(reloaded).toBe(false);
  expect(hashbrown.setMessages).not.toHaveBeenCalled();
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
