import { TestBed } from '@angular/core/testing';
import { s } from '@hashbrownai/core';
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

test('structuredChatResource passes structured output options to Hashbrown', () => {
  fryHashbrownMock.mockReset();
  fryHashbrownMock.mockImplementation((init) =>
    createHashbrownStub({ messages: init.messages ?? [] }),
  );

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    structuredChatResource({
      model: 'gpt-4.1',
      system: 'You are a portfolio analyst.',
      schema: s.object('risk summary', {
        risk: s.string('Risk level'),
      }),
      structuredOutput: { mode: 'json' },
    }),
  );

  expect(fryHashbrownMock).toHaveBeenCalledWith(
    expect.objectContaining({
      structuredOutput: { mode: 'json' },
    }),
  );
});

function createHashbrownStub({ messages }: { messages: unknown[] }) {
  return {
    messages: createSignal(messages),
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
    setMessages: vi.fn(),
  } as never;
}

function createSignal<T>(value: T) {
  const signal = (() => value) as {
    (): T;
    subscribe(onChange: (newValue: T) => void): () => void;
  };
  signal.subscribe = vi.fn(() => () => undefined);

  return signal;
}
