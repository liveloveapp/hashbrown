import { EventType } from '@ag-ui/core';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { TransportRequest } from '@hashbrownai/core';
import { HashbrownProvider } from '../hashbrown-provider';
import { useCompletion } from './use-completion';

test('useCompletion exposes runtime-owned shared agent state', () => {
  // Arrange
  const initialState = { documentId: 'document-1' };

  const { result, rerender } = renderHook(
    ({ state }: { state: { documentId: string } }) =>
      useCompletion({
        input: null,
        system: 'Complete the document.',
        state,
      }),
    {
      initialProps: { state: initialState },
      wrapper: ProviderWrapper,
    },
  );

  // Act
  rerender({ state: { documentId: 'document-2' } });

  // Assert
  expect(result.current.state).toEqual(initialState);

  // Act
  act(() => result.current.setState({ documentId: 'document-3' }));

  // Assert
  expect(result.current.state).toEqual({ documentId: 'document-3' });
});

test('useCompletion retains the configured system message in runtime requests', async () => {
  // Arrange
  const send = vi.fn(async (request: TransportRequest) => ({
    events: successfulEvents(request),
  }));

  // Act
  renderHook(
    () =>
      useCompletion({
        input: 'Finish this sentence.',
        system: 'Write concise completions.',
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
        content: 'Write concise completions.',
      }),
      expect.objectContaining({
        role: 'user',
        content: 'Finish this sentence.',
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
