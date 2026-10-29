import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { type AGUIEvent, EventType } from '@ag-ui/core';
import {
  type ConversationRestoreOptions,
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
                      {
                        id: 'approve',
                        reason: 'approval',
                        subagentRunId: 'waiting-child',
                      },
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
    expect(result.current.subagents).toEqual([
      expect.objectContaining({
        subagentRunId: 'waiting-child',
        status: 'awaiting',
      }),
    ]);
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

test.each(families)(
  '$name chat restores canonical history without sending',
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
    await waitFor(() => expect(result.current.pendingInterrupts).toBeDefined());
    const input = control.requests[0].input;
    expect(result.current.getRecoveryConfiguration().system).toBe('test');
    const batch = requireBatch(result.current.pendingInterrupts);

    act(() =>
      result.current.restoreConversation(
        {
          threadId: input.threadId,
          messages: input.messages,
          configuredSystemMessageId: input.messages[0].id,
        },
        { expectedRevision: result.current.recovery.revision },
      ),
    );
    await act(async () => undefined);

    expect(result.current.pendingInterrupts).toBeUndefined();
    expect(result.current.recovery.required).toBe(false);
    expect(control.requests).toHaveLength(1);
    expect(() =>
      result.current.resume({ batchId: batch.id, entries }),
    ).toThrow();
    unmount();
  },
);

test.each(families)(
  '$name chat forwards public diagnostic recovery options',
  async (family) => {
    const control = controlledTransport();
    const { result, unmount } = renderHook(
      () => family.use({ system: '', transport: control.transport }),
      { wrapper },
    );
    const options: ConversationRestoreOptions = {
      expectedRevision: result.current.recovery.revision,
      structuredHistory: 'preserve-diagnostics',
    };

    act(() =>
      result.current.restoreConversation(
        {
          threadId: 'cold',
          messages: [
            {
              id: 'invalid',
              role: 'assistant',
              content: '<b>ordinary historical text</b>',
            },
          ],
        },
        options,
      ),
    );
    await act(async () => undefined);

    expect(control.requests).toHaveLength(0);
    expect(result.current.recovery.diagnostics?.[0].content).toBe(
      family.name === 'text' ? undefined : '<b>ordinary historical text</b>',
    );
    expect(result.current.messages).toHaveLength(
      family.name === 'text' ? 1 : 0,
    );
    unmount();
  },
);

test.each(
  families.flatMap((family) =>
    ['complete', 'failed'].map((status) => ({ ...family, status })),
  ),
)(
  '$name chat subscribes to frozen native subagents ($status)',
  async (family) => {
    const terminal = gate();
    const transport: Transport = {
      name: 'subagents',
      send: async (request) => ({
        events: (async function* (): AsyncGenerator<AGUIEvent> {
          const identity = {
            threadId: request.input.threadId,
            runId: request.input.runId,
          };
          yield { type: EventType.RUN_STARTED, ...identity };
          yield {
            type: EventType.SUBAGENT_STARTED,
            subagentRunId: 'child',
            name: 'Research',
          };
          await terminal.promise;
          yield family.status === 'failed'
            ? {
                type: EventType.SUBAGENT_ERROR,
                subagentRunId: 'child',
                message: 'child failed',
              }
            : {
                type: EventType.SUBAGENT_FINISHED,
                subagentRunId: 'child',
                result: { found: true },
              };
          yield { type: EventType.RUN_FINISHED, ...identity };
        })(),
      }),
    };
    const { result, rerender, unmount } = renderHook(
      ({ threadId }) =>
        family.use({ system: '', threadId, transport, debounceTime: 0 }),
      { wrapper, initialProps: { threadId: 'original' } },
    );

    try {
      expect(result.current.subagents).toEqual([]);
      act(() => result.current.sendMessage({ role: 'user', content: 'go' }));
      await waitFor(() =>
        expect(result.current.subagents[0]?.status).toBe('running'),
      );
      expect(Object.isFrozen(result.current.subagents)).toBe(true);
      const running = result.current.subagents[0];
      await act(async () => terminal.release());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.subagents[0]).toMatchObject({
        status: family.status,
        ...(family.status === 'failed'
          ? { error: { message: 'child failed' } }
          : { result: { found: true } }),
      });
      expect(running.status).toBe('running');
      const settled = result.current.subagents;
      rerender({ threadId: 'original' });
      expect(result.current.subagents).toBe(settled);
      rerender({ threadId: 'fresh' });
      await waitFor(() => expect(result.current.subagents).toEqual([]));
    } finally {
      terminal.release();
      unmount();
    }
  },
);

test.each(families)(
  '$name chat restores native owners as unknown and retains explicit waits',
  async (family) => {
    const control = controlledTransport();
    const { result, unmount } = renderHook(
      () => family.use({ system: '', transport: control.transport }),
      { wrapper },
    );
    const messages = [
      {
        id: 'assistant',
        role: 'assistant' as const,
        subagentRunId: '',
        toolCalls: [
          {
            id: 'call',
            type: 'function' as const,
            function: { name: 'lookup', arguments: '{}' },
          },
        ],
      },
      {
        id: 'result',
        role: 'tool' as const,
        toolCallId: 'call',
        content: 'found',
        subagentRunId: 'executor',
      },
    ];

    try {
      act(() =>
        result.current.restoreConversation(
          { threadId: 'restored', messages },
          { expectedRevision: result.current.recovery.revision },
        ),
      );
      await act(async () => undefined);

      expect(result.current.subagents).toEqual([
        { subagentRunId: '', status: 'unknown', interruptIds: [] },
        { subagentRunId: 'executor', status: 'unknown', interruptIds: [] },
      ]);
      const call = result.current.messages.find(
        (message) => message.role === 'assistant',
      );
      expect(call).toMatchObject({
        subagentRunId: '',
        serverToolCalls: [
          expect.objectContaining({
            subagentRunId: '',
            resultSubagentRunId: 'executor',
            result: { status: 'fulfilled', value: 'found' },
          }),
        ],
      });
      act(() =>
        result.current.restoreConversation(
          {
            threadId: 'waiting',
            messages,
            interrupts: [
              { id: 'approval', reason: 'approval', subagentRunId: '' },
            ],
          },
          { expectedRevision: result.current.recovery.revision },
        ),
      );
      await act(async () => undefined);
      expect(result.current.subagents[0]).toMatchObject({
        subagentRunId: '',
        status: 'awaiting',
        interruptIds: ['approval'],
      });
      expect(control.requests).toHaveLength(0);
    } finally {
      unmount();
    }
  },
);
