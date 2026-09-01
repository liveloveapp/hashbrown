import { act, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { s } from '@hashbrownai/core';
import { HashbrownProvider } from '../hashbrown-provider';
import { useStructuredChat } from './use-structured-chat';

const fryHashbrownMock = vi.hoisted(() => vi.fn());

vi.mock('@hashbrownai/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hashbrownai/core')>();

  return {
    ...actual,
    fryHashbrown: fryHashbrownMock,
  };
});

test('useStructuredChat initializes with the provided message history', () => {
  const messages = [
    {
      role: 'user' as const,
      content: 'What is the current portfolio risk?',
    },
  ];
  fryHashbrownMock.mockReset();
  fryHashbrownMock.mockImplementation((init) =>
    createHashbrownStub({ messages: init.messages ?? [] }),
  );

  const { result } = renderHook(
    () =>
      useStructuredChat({
        model: 'gpt-4.1',
        system: 'You are a portfolio analyst.',
        schema: s.object('risk summary', {
          risk: s.string('Risk level'),
        }),
        messages,
      }),
    { wrapper: ProviderWrapper },
  );

  expect(result.current.messages).toEqual(messages);
});

test('useStructuredChat preserves thread identity property presence on updates', () => {
  const hashbrown = createHashbrownStub({ messages: [] });
  fryHashbrownMock.mockReset();
  fryHashbrownMock.mockReturnValue(hashbrown);
  type HookProps = {
    system: string;
    threadId?: string | undefined;
  };

  const { result, rerender } = renderHook(
    ({ system, ...threadOptions }: HookProps) =>
      useStructuredChat({
        model: 'gpt-4.1',
        system,
        schema: s.object('risk summary', {
          risk: s.string('Risk level'),
        }),
        ...threadOptions,
      }),
    {
      initialProps: {
        system: 'You are a portfolio analyst.',
      } as HookProps,
      wrapper: ProviderWrapper,
    },
  );

  expect(result.current).not.toHaveProperty('isLoadingThread');
  expect(result.current).not.toHaveProperty('isSavingThread');
  expect(result.current).not.toHaveProperty('threadLoadError');
  expect(result.current).not.toHaveProperty('threadSaveError');
  expect(result.current).not.toHaveProperty('threadId');
  hashbrown.updateOptions.mockClear();

  rerender({ system: 'You are a concise portfolio analyst.' });

  const omittedUpdate = hashbrown.updateOptions.mock.calls.at(-1)?.[0];
  expect(omittedUpdate).toBeDefined();
  expect(Object.hasOwn(omittedUpdate, 'threadId')).toBe(false);

  rerender({
    system: 'You are a concise portfolio analyst.',
    threadId: undefined,
  });

  const clearedUpdate = hashbrown.updateOptions.mock.calls.at(-1)?.[0];
  expect(Object.hasOwn(clearedUpdate, 'threadId')).toBe(true);
  expect(clearedUpdate).toMatchObject({ threadId: undefined });

  rerender({
    system: 'You are a concise portfolio analyst.',
    threadId: 'thread-changed',
  });

  expect(hashbrown.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({ threadId: 'thread-changed' }),
  );

  rerender({ system: 'You are a concise portfolio analyst.', threadId: '' });

  expect(hashbrown.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({ threadId: '' }),
  );
});

function ProviderWrapper({ children }: { children: ReactNode }) {
  return <HashbrownProvider url="/chat">{children}</HashbrownProvider>;
}

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
