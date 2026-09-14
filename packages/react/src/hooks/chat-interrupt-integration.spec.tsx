import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { type AGUIEvent, EventType } from '@ag-ui/core';
import {
  type PendingInterruptBatch,
  type ResumeOptions,
  s,
  type Transport,
  type TransportRequest,
} from '@hashbrownai/core';
import { HashbrownProvider } from '../hashbrown-provider';
import { useChat } from './use-chat';
import { useStructuredChat } from './use-structured-chat';
import { useUiChat } from './use-ui-chat';

/** Requires an actionable batch without hiding missing facade state. */
function requireBatch(
  batch: PendingInterruptBatch | undefined,
): PendingInterruptBatch {
  if (!batch) throw new Error('Expected a pending batch');
  return batch;
}

const schema = s.object('result', { answer: s.string('answer') });
const families = [
  { name: 'text', use: useChat },
  {
    name: 'structured',
    use: (options: Omit<Parameters<typeof useChat>[0], 'messages'>) =>
      useStructuredChat({ ...options, schema }),
  },
  {
    name: 'UI',
    use: (options: Omit<Parameters<typeof useChat>[0], 'messages'>) =>
      useUiChat({ ...options, components: [] }),
  },
];
function wrapper({ children }: { children: ReactNode }) {
  return <HashbrownProvider url="/chat">{children}</HashbrownProvider>;
}

/** Holds one transport boundary until explicitly released by a test. */
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

/** Creates a real runtime transport with controllable resume boundaries. */
function controlledTransport(fail = false) {
  const requests: TransportRequest[] = [];
  const started = gate();
  const terminal = gate();
  const transport: Transport = {
    name: 'interrupt-test',
    send: async (request) => {
      requests.push(request);
      const index = requests.length;
      const identity = {
        threadId: request.input.threadId,
        runId: request.input.runId,
      };
      return {
        events: (async function* (): AsyncGenerator<AGUIEvent> {
          if (index === 2) await started.promise;
          yield { type: EventType.RUN_STARTED, ...identity };
          if (index === 2) await terminal.promise;
          if (index === 2 && fail) {
            yield { type: EventType.RUN_ERROR, message: 'resumed failure' };
            return;
          }
          yield {
            type: EventType.RUN_FINISHED,
            ...identity,
            ...(index === 1
              ? {
                  outcome: {
                    type: 'interrupt' as const,
                    interrupts: [
                      { id: 'approve', reason: 'approval' },
                      { id: 'address', reason: 'input' },
                    ],
                  },
                }
              : {}),
          };
        })(),
      };
    },
  };
  return { transport, requests, started, terminal };
}

const entries: ResumeOptions['entries'] = [
  { interruptId: 'address', status: 'cancelled' },
  { interruptId: 'approve', status: 'resolved', payload: true },
];

test.each(families)(
  '$name chat exposes the entire claimed batch through resumed settlement',
  async (family) => {
    const control = controlledTransport();
    const { result, unmount } = renderHook(
      () =>
        family.use({
          system: 'test',
          transport: control.transport,
          debounceTime: 0,
        }),
      { wrapper },
    );

    act(() => result.current.sendMessage({ role: 'user', content: 'go' }));
    await waitFor(() => expect(control.requests).toHaveLength(1));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current).toHaveProperty('pendingInterrupts');
    const batch = requireBatch(result.current.pendingInterrupts);
    expect(batch.interrupts.map((item) => item.id)).toEqual([
      'approve',
      'address',
    ]);
    expect(result.current.isResuming).toBe(false);
    expect(result.current.lastAssistantMessage).toBeUndefined();
    expect(() => result.current.reload()).toThrow(/interrupt/i);
    expect(() =>
      result.current.sendMessage({ role: 'user', content: 'blocked' }),
    ).toThrow(/interrupt/i);
    expect(() => result.current.setMessages([])).toThrow(/interrupt/i);
    expect(() =>
      result.current.resume({ batchId: batch.id, entries: [] }),
    ).toThrow();
    act(() => result.current.resume({ batchId: batch.id, entries }));
    expect(result.current.pendingInterrupts).toBe(batch);
    expect(result.current.isResuming).toBe(true);
    expect(() => result.current.reload()).toThrow(/interrupt/i);
    if ('resendMessages' in result.current) {
      const { resendMessages } = result.current;
      expect(() => resendMessages()).toThrow(/interrupt/i);
    }
    expect(() => result.current.resume({ batchId: batch.id, entries })).toThrow(
      /claimed/i,
    );
    await waitFor(() => expect(control.requests).toHaveLength(2));
    expect(control.requests[1].input.resume).toEqual(entries);
    await act(async () => control.started.release());
    await waitFor(() =>
      expect(result.current.pendingInterrupts).toBeUndefined(),
    );
    expect(result.current.isResuming).toBe(true);
    expect(() => result.current.reload()).not.toThrow();
    expect(() =>
      result.current.resume({ batchId: batch.id, entries }),
    ).toThrow();
    await act(async () => control.terminal.release());
    await waitFor(() => expect(result.current.isResuming).toBe(false));
    expect(result.current.error).toBeUndefined();
    unmount();
  },
);

test.each(families)(
  '$name chat preserves undefined thread options during unrelated updates and retires on explicit thread clearing',
  async (family) => {
    const control = controlledTransport();
    const { result, rerender, unmount } = renderHook(
      (props: { system: string; threadId?: string }) =>
        family.use({ ...props, transport: control.transport, debounceTime: 0 }),
      {
        wrapper,
        initialProps: { system: 'test', threadId: undefined } as {
          system: string;
          threadId?: string;
        },
      },
    );

    act(() => result.current.sendMessage({ role: 'user', content: 'go' }));
    await waitFor(() => expect(control.requests).toHaveLength(1));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current).toHaveProperty('pendingInterrupts');
    const batch = requireBatch(result.current.pendingInterrupts);
    rerender({ system: 'updated', threadId: undefined });
    expect(result.current.pendingInterrupts).toBe(batch);
    rerender({
      system: 'updated',
      threadId: control.requests[0].input.threadId,
    });
    expect(result.current.pendingInterrupts).toBe(batch);
    rerender({ system: 'updated' });
    expect(result.current.pendingInterrupts).toBe(batch);
    rerender({ system: 'updated', threadId: undefined });
    expect(result.current.pendingInterrupts).toBeUndefined();
    expect(() =>
      result.current.resume({ batchId: batch.id, entries }),
    ).toThrow();
    unmount();
  },
);

test.each(families)(
  '$name chat rejects recovery reload without assistant output and permits a fresh thread',
  async (family) => {
    const control = controlledTransport(true);
    const { result, rerender, unmount } = renderHook(
      ({ threadId }) =>
        family.use({
          system: 'test',
          threadId,
          transport: control.transport,
          debounceTime: 0,
        }),
      { wrapper, initialProps: { threadId: 'original' } },
    );
    act(() => result.current.sendMessage({ role: 'user', content: 'go' }));
    await waitFor(() => expect(control.requests).toHaveLength(1));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toHaveProperty('pendingInterrupts');
    act(() =>
      result.current.resume({
        batchId: requireBatch(result.current.pendingInterrupts).id,
        entries,
      }),
    );
    await act(async () => {
      control.started.release();
      control.terminal.release();
    });
    await waitFor(() => expect(result.current.error).toBeDefined());

    expect(() => result.current.reload()).toThrow(/new thread/i);
    expect(() => result.current.setMessages([])).toThrow(/new thread/i);
    expect(() =>
      result.current.sendMessage({ role: 'user', content: 'blocked' }),
    ).toThrow(/new thread/i);
    rerender({ threadId: 'fresh' });
    act(() =>
      result.current.sendMessage({ role: 'user', content: 'recovered' }),
    );
    await waitFor(() => expect(control.requests).toHaveLength(3));
    expect(control.requests[2].input.threadId).toBe('fresh');
    expect(control.requests[2].input.resume).toBeUndefined();
    unmount();
  },
);

test('UI chat interruption projections are readonly public values', () => {
  type Result = ReturnType<typeof useUiChat>;

  expectTypeOf<
    Pick<Result, 'pendingInterrupts' | 'isResuming'>
  >().toEqualTypeOf<{
    readonly pendingInterrupts: PendingInterruptBatch | undefined;
    readonly isResuming: boolean;
  }>();
});
