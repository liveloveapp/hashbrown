import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, StrictMode } from 'react';
import { type Decision, s } from '@hashbrownai/core';
import { HashbrownProvider } from '../hashbrown-provider';
import { useDecision } from './use-decision';

const schema = s.object('Decision', {
  intent: s.enumeration('Intent', ['filter', 'chat']),
});

const choice = { confidence: 0.9, probabilities: { filter: 0.9, chat: 0.1 } };

function responseFor(intent: string): Decision.Response {
  return {
    kind: 'hashbrown.decision',
    version: 1,
    value: { intent },
    meta: { intent: choice },
  };
}

type Call = { request: Decision.Request; signal: AbortSignal };

function createFakeTransport(intent = 'filter') {
  const calls: Call[] = [];
  const transport: Decision.Transport = async (request, signal) => {
    calls.push({ request, signal });
    return responseFor(intent);
  };
  return { calls, transport };
}

function wrapperFor(transport: Decision.Transport) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <HashbrownProvider decision={{ transport }}>{children}</HashbrownProvider>
    );
  };
}

test('useDecision returns a typed value and meta', async () => {
  // Arrange
  const fake = createFakeTransport();

  // Act
  const { result } = renderHook(
    () => useDecision({ schema, input: 'show open items' }),
    { wrapper: wrapperFor(fake.transport) },
  );
  await waitFor(() => expect(result.current.value).not.toBeNull());

  // Assert
  expect(result.current.value?.intent).toBe('filter');
  expect(result.current.meta?.intent.confidence).toBe(0.9);
  expect(result.current.isLoading).toBe(false);
  expect(result.current.error).toBeUndefined();
});

test("useDecision uses the provider's decision transport and the hook override wins", async () => {
  // Arrange
  const provider = createFakeTransport('filter');
  const override = createFakeTransport('chat');

  // Act
  const { result } = renderHook(
    () =>
      useDecision({ schema, input: 'hello', transport: override.transport }),
    { wrapper: wrapperFor(provider.transport) },
  );
  await waitFor(() => expect(result.current.value).not.toBeNull());

  // Assert
  expect(provider.calls).toHaveLength(0);
  expect(override.calls).toHaveLength(1);
  expect(result.current.value?.intent).toBe('chat');
});

test('useDecision default transport posts to /api/decide with provider middleware', async () => {
  // Arrange
  const fetchMock = vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify(responseFor('filter')), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const middleware = [
    (request: RequestInit): RequestInit => ({
      ...request,
      headers: { ...(request.headers as object), 'x-test': 'yes' },
    }),
  ];

  // Act
  let result: { current: { value: unknown } } | undefined;
  try {
    result = renderHook(() => useDecision({ schema, input: 'hello' }), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <HashbrownProvider middleware={middleware}>
          {children}
        </HashbrownProvider>
      ),
    }).result;
    await waitFor(() => expect(result?.current.value).not.toBeNull());
  } finally {
    vi.unstubAllGlobals();
  }

  // Assert
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('/api/decide');
  expect(new Headers(init?.headers).get('x-test')).toBe('yes');
});

test('useDecision re-decides on input change and treats null input as idle', async () => {
  // Arrange
  const fake = createFakeTransport();
  const { result, rerender } = renderHook(
    ({ input }: { input: string | null | undefined }) =>
      useDecision({ schema, input }),
    {
      initialProps: { input: 'one' as string | null | undefined },
      wrapper: wrapperFor(fake.transport),
    },
  );
  await waitFor(() => expect(result.current.value).not.toBeNull());

  // Act
  rerender({ input: 'two' });
  await waitFor(() => expect(fake.calls).toHaveLength(2));

  // Assert
  expect(fake.calls[1].request.state).toBe('two');

  // Act
  rerender({ input: undefined });

  // Assert
  await waitFor(() => expect(result.current.value).toBeNull());
  expect(result.current.isLoading).toBe(false);
  expect(fake.calls).toHaveLength(2);
});

test('useDecision aborts on unmount mid-request and never updates', async () => {
  // Arrange
  let signal: AbortSignal | undefined;
  let resolve: (response: Decision.Response) => void = () => undefined;
  const transport: Decision.Transport = (_request, sig) => {
    signal = sig;
    return new Promise<Decision.Response>((r) => {
      resolve = r;
    });
  };
  const errorSpy = vi
    .spyOn(console, 'error')
    .mockImplementation(() => undefined);
  const { result, unmount } = renderHook(
    () => useDecision({ schema, input: 'hello' }),
    { wrapper: wrapperFor(transport) },
  );
  await waitFor(() => expect(result.current.isLoading).toBe(true));
  const before = result.current;

  // Act
  unmount();
  resolve(responseFor('filter'));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  // Assert
  expect(signal?.aborted).toBe(true);
  expect(result.current).toBe(before);
  expect(errorSpy).not.toHaveBeenCalled();
  errorSpy.mockRestore();
});

test('useDecision works under StrictMode double mounting', async () => {
  // Arrange
  const fake = createFakeTransport();

  // Act
  const { result } = renderHook(() => useDecision({ schema, input: 'hello' }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <StrictMode>
        <HashbrownProvider decision={{ transport: fake.transport }}>
          {children}
        </HashbrownProvider>
      </StrictMode>
    ),
  });
  await waitFor(() => expect(result.current.value).not.toBeNull());

  // Assert
  expect(result.current.value?.intent).toBe('filter');
});

test('useDecision reload resends and stop aborts', async () => {
  // Arrange
  const fake = createFakeTransport();
  const { result } = renderHook(() => useDecision({ schema, input: 'hello' }), {
    wrapper: wrapperFor(fake.transport),
  });
  await waitFor(() => expect(result.current.value).not.toBeNull());

  // Act
  let reloaded = false;
  act(() => {
    reloaded = result.current.reload();
  });
  await waitFor(() => expect(fake.calls).toHaveLength(2));

  // Assert
  expect(reloaded).toBe(true);
  expect(typeof result.current.stop).toBe('function');
});

test('useDecision with an inline transport decides exactly once per input', async () => {
  // Arrange
  const calls: Decision.Request[] = [];

  // Act
  const { result } = renderHook(
    () =>
      useDecision({
        schema,
        input: 'hello',
        transport: async (request) => {
          calls.push(request);
          return responseFor('filter');
        },
      }),
    { wrapper: wrapperFor(createFakeTransport().transport) },
  );
  await waitFor(() => expect(result.current.value).not.toBeNull());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });

  // Assert
  expect(calls).toHaveLength(1);
});

test('useDecision keeps its value when a provider with inline middleware re-renders', async () => {
  // Arrange
  const fetchMock = vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify(responseFor('filter')), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  try {
    const { result, rerender } = renderHook(
      () => useDecision({ schema, input: 'hello' }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <HashbrownProvider middleware={[(request) => request]}>
            {children}
          </HashbrownProvider>
        ),
      },
    );
    await waitFor(() => expect(result.current.value).not.toBeNull());

    // Act
    rerender();
    rerender();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // Assert
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.value?.intent).toBe('filter');
  } finally {
    vi.unstubAllGlobals();
  }
});

test('useDecision recreates the runtime and re-decides when system changes', async () => {
  // Arrange
  const fake = createFakeTransport();
  const { result, rerender } = renderHook(
    ({ system }: { system: string }) =>
      useDecision({ schema, input: 'hello', system }),
    { initialProps: { system: 'a' }, wrapper: wrapperFor(fake.transport) },
  );
  await waitFor(() => expect(result.current.value).not.toBeNull());

  // Act
  rerender({ system: 'b' });
  await waitFor(() => expect(fake.calls).toHaveLength(2));

  // Assert
  expect(fake.calls[0].request.state).toEqual({ system: 'a', input: 'hello' });
  expect(fake.calls[1].request.state).toEqual({ system: 'b', input: 'hello' });
});
