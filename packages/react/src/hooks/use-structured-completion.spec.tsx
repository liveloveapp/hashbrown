import { EventType } from '@ag-ui/core';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { s, type TransportRequest } from '@hashbrownai/core';
import { HashbrownProvider } from '../hashbrown-provider';
import { useStructuredCompletion } from './use-structured-completion';

test('useStructuredCompletion exposes runtime-owned shared agent state', () => {
  // Arrange
  const initialState = { accountId: 'account-1' };

  const { result, rerender } = renderHook(
    ({ state }: { state: { accountId: string } }) =>
      useStructuredCompletion({
        input: null,
        system: 'Summarize the account.',
        schema: s.object('summary', { value: s.string('value') }),
        state,
      }),
    {
      initialProps: { state: initialState },
      wrapper: ProviderWrapper,
    },
  );

  // Act
  rerender({ state: { accountId: 'account-2' } });

  // Assert
  expect(result.current.state).toEqual(initialState);

  // Act
  act(() => result.current.setState({ accountId: 'account-3' }));

  // Assert
  expect(result.current.state).toEqual({ accountId: 'account-3' });
});

test('useStructuredCompletion retains the configured system message in runtime requests', async () => {
  // Arrange
  const send = vi.fn(async (request: TransportRequest) => ({
    events: successfulEvents(request),
  }));

  // Act
  renderHook(
    () =>
      useStructuredCompletion({
        input: 'Summarize this account.',
        system: 'Return a concise account summary.',
        schema: s.object('summary', { value: s.string('value') }),
        debounceTime: 0,
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <HashbrownProvider transport={{ name: 'test', send }}>
          {children}
        </HashbrownProvider>
      ),
    },
  );

  await waitFor(() => expect(send).toHaveBeenCalledTimes(1));

  // Assert
  expect(send.mock.calls[0]?.[0].input.messages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        role: 'system',
        content: 'Return a concise account summary.',
      }),
      expect.objectContaining({
        role: 'user',
        content: 'Summarize this account.',
      }),
    ]),
  );
});

function ProviderWrapper({ children }: { children: ReactNode }) {
  return <HashbrownProvider url="/chat">{children}</HashbrownProvider>;
}

function successfulEvents(request: TransportRequest) {
  return (async function* () {
    yield {
      type: EventType.RUN_STARTED,
      threadId: request.input.threadId,
      runId: request.input.runId,
    };
    yield {
      type: EventType.RUN_FINISHED,
      threadId: request.input.threadId,
      runId: request.input.runId,
    };
  })();
}
