import { renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { HashbrownProvider } from '../hashbrown-provider';
import { useChat } from './use-chat';

const createChatRuntimeMock = vi.hoisted(() => vi.fn());
const createHttpTransportMock = vi.hoisted(() => vi.fn());

vi.mock('@hashbrownai/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hashbrownai/core')>();

  return {
    ...actual,
    createHttpTransport: createHttpTransportMock,
    createChatRuntime: createChatRuntimeMock,
  };
});

test('useChat initializes with the provided message history', () => {
  const messages = [
    {
      role: 'user' as const,
      content: 'Summarize the previous order.',
    },
  ];
  createChatRuntimeMock.mockReset();
  createChatRuntimeMock.mockImplementation((init) =>
    createRuntimeStub({ messages: init.messages ?? [] }),
  );

  const { result } = renderHook(
    () =>
      useChat({
        system: 'You are a helpful assistant.',
        messages,
      }),
    { wrapper: ProviderWrapper },
  );

  expect(result.current.messages).toEqual(messages);
});

test('HashbrownProvider lowers URL and middleware into a lazy HTTP transport', () => {
  const middleware = [vi.fn((request: RequestInit) => request)];
  const transport = { name: 'provider-http', send: vi.fn() };
  createHttpTransportMock.mockReset();
  createHttpTransportMock.mockReturnValue(transport);
  createChatRuntimeMock.mockReset();
  createChatRuntimeMock.mockReturnValue(createRuntimeStub({ messages: [] }));

  renderHook(() => useChat({ system: 'test' }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <HashbrownProvider url="/provider-run" middleware={middleware}>
        {children}
      </HashbrownProvider>
    ),
  });

  const init = createChatRuntimeMock.mock.calls[0]?.[0];
  expect(init).not.toHaveProperty('apiUrl');
  expect(init).not.toHaveProperty('middleware');
  expect(init.transport).toEqual(expect.any(Function));
  expect(init.transport()).toBe(transport);
  expect(createHttpTransportMock).toHaveBeenCalledWith({
    baseUrl: '/provider-run',
    middleware,
  });
});

test('useChat transport overrides provider HTTP configuration', () => {
  const transport = { name: 'hook-transport', send: vi.fn() };
  createHttpTransportMock.mockReset();
  createChatRuntimeMock.mockReset();
  createChatRuntimeMock.mockReturnValue(createRuntimeStub({ messages: [] }));

  renderHook(() => useChat({ system: 'test', transport }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <HashbrownProvider url="/provider-run">{children}</HashbrownProvider>
    ),
  });

  expect(createChatRuntimeMock.mock.calls[0]?.[0].transport).toBe(transport);
  expect(createHttpTransportMock).not.toHaveBeenCalled();
});

test('useChat preserves thread identity property presence on updates', () => {
  const runtime = createRuntimeStub({ messages: [] });
  createChatRuntimeMock.mockReset();
  createChatRuntimeMock.mockReturnValue(runtime);
  type HookProps = {
    system: string;
    threadId?: string | undefined;
  };

  const { result, rerender } = renderHook(
    ({ system, ...threadOptions }: HookProps) =>
      useChat({
        system,
        ...threadOptions,
      }),
    {
      initialProps: {
        system: 'You are a helpful assistant.',
      } as HookProps,
      wrapper: ProviderWrapper,
    },
  );

  expect(result.current).not.toHaveProperty('isLoadingThread');
  expect(result.current).not.toHaveProperty('isSavingThread');
  expect(result.current).not.toHaveProperty('threadLoadError');
  expect(result.current).not.toHaveProperty('threadSaveError');
  expect(result.current).not.toHaveProperty('threadId');
  runtime.updateOptions.mockClear();

  rerender({ system: 'You are a concise assistant.' });

  const omittedUpdate = runtime.updateOptions.mock.calls.at(-1)?.[0];
  expect(omittedUpdate).toBeDefined();
  expect(Object.hasOwn(omittedUpdate, 'threadId')).toBe(false);

  rerender({
    system: 'You are a concise assistant.',
    threadId: undefined,
  });

  const clearedUpdate = runtime.updateOptions.mock.calls.at(-1)?.[0];
  expect(Object.hasOwn(clearedUpdate, 'threadId')).toBe(true);
  expect(clearedUpdate).toMatchObject({ threadId: undefined });

  rerender({
    system: 'You are a concise assistant.',
    threadId: 'thread-changed',
  });

  expect(runtime.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({ threadId: 'thread-changed' }),
  );

  rerender({ system: 'You are a concise assistant.', threadId: '' });

  expect(runtime.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({ threadId: '' }),
  );
});

function ProviderWrapper({ children }: { children: ReactNode }) {
  return <HashbrownProvider url="/chat">{children}</HashbrownProvider>;
}

function createRuntimeStub({ messages }: { messages: unknown[] }) {
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
    start: vi.fn(() => vi.fn()),
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
