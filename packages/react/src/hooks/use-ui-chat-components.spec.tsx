import { EventType } from '@ag-ui/core';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { s, type TransportRequest } from '@hashbrownai/core';
import { HashbrownProvider } from '../hashbrown-provider';
import { exposeComponent } from '../expose-component.fn';
import { useUiChat } from './use-ui-chat';

const Flight = () => null;
const Airport = () => null;
const flight = exposeComponent(Flight, {
  name: 'Flight',
  description: 'One aircraft',
  props: { callsign: s.string('Callsign') },
});
const airport = exposeComponent(Airport, {
  name: 'Airport',
  description: 'An airport',
  props: { code: s.string('Code') },
});

function answer(request: TransportRequest, messageId: string, ui: unknown) {
  const identity = {
    threadId: request.input.threadId,
    runId: request.input.runId,
  };
  return {
    events: (async function* () {
      yield { type: EventType.RUN_STARTED, ...identity };
      yield {
        type: EventType.TEXT_MESSAGE_START,
        messageId,
        role: 'assistant' as const,
      };
      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId,
        delta: JSON.stringify({ ui }),
      };
      yield { type: EventType.TEXT_MESSAGE_END, messageId };
      yield { type: EventType.RUN_FINISHED, ...identity };
    })(),
  };
}

function sentSchema(request: TransportRequest | undefined): string {
  return JSON.stringify(
    (request?.input.forwardedProps as { hashbrown?: unknown }).hashbrown,
  );
}

function wrapperFor(send: (request: TransportRequest) => unknown) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <HashbrownProvider transport={{ name: 'test', send } as never}>
        {children}
      </HashbrownProvider>
    );
  };
}

test('useUiChat exposes its current components', () => {
  const components = [flight, airport];
  const send = vi.fn();
  const { result } = renderHook(
    () => useUiChat({ system: 'Answer.', components }),
    { wrapper: wrapperFor(send) },
  );

  act(() => result.current.setComponents([airport]));

  expect(result.current.components).toEqual([airport]);
});

test('useUiChat sends the components set with setComponents on the next request', async () => {
  const send = vi.fn(async (request: TransportRequest) =>
    answer(request, 'answer-1', [{ Airport: { props: { code: 'SFO' } } }]),
  );
  const { result } = renderHook(
    () =>
      useUiChat({
        system: 'Answer.',
        components: [flight, airport],
        debounceTime: 0,
      }),
    { wrapper: wrapperFor(send) },
  );

  act(() => result.current.setComponents([airport]));
  act(() => result.current.sendMessage({ role: 'user', content: 'SFO' }));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1));

  expect(sentSchema(send.mock.calls[0]?.[0])).toContain('Airport');
  expect(sentSchema(send.mock.calls[0]?.[0])).not.toContain('Flight');
});

test('useUiChat keeps rendering earlier answers after setComponents narrows the components', async () => {
  let turn = 0;
  const send = vi.fn(async (request: TransportRequest) => {
    turn += 1;
    return turn === 1
      ? answer(request, 'answer-1', [
          { Flight: { props: { callsign: 'UA1' } } },
        ])
      : answer(request, 'answer-2', [{ Airport: { props: { code: 'SFO' } } }]);
  });
  const { result } = renderHook(
    () =>
      useUiChat({
        system: 'Answer.',
        components: [flight, airport],
        debounceTime: 0,
      }),
    { wrapper: wrapperFor(send) },
  );
  act(() => result.current.sendMessage({ role: 'user', content: 'UA1' }));
  await waitFor(() => expect(result.current.messages).toHaveLength(2));
  await waitFor(() => expect(result.current.isLoading).toBe(false));

  act(() => result.current.setComponents([airport]));
  act(() => result.current.sendMessage({ role: 'user', content: 'SFO' }));
  await waitFor(() => expect(result.current.messages).toHaveLength(4));
  await waitFor(() => expect(result.current.isLoading).toBe(false));

  const answers = result.current.messages.filter(
    (message) => message.role === 'assistant',
  );
  expect(answers.map((message) => message.ui?.[0]?.type)).toEqual([
    Flight,
    Airport,
  ]);
});
