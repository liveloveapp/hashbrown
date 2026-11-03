import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, StrictMode } from 'react';
import { type AGUIEvent, EventType } from '@ag-ui/core';
import {
  type Chat,
  type ConversationRecoveryConfiguration,
  type ConversationSnapshot,
  type PendingConversationRecovery,
  type ResumeConversationRecoveryOptions,
  s,
  type Transport,
  type TransportRequest,
  ɵgetRuntimeSchedulingState,
} from '@hashbrownai/core';
import {
  HashbrownProvider,
  type UiChatResult,
  useChat,
  type UseChatOptions,
  type UseChatResult,
  useCompletion,
  type UseCompletionResult,
  useStructuredChat,
  type UseStructuredChatResult,
  useStructuredCompletion,
  type UseStructuredCompletionResult,
  useUiChat,
  useUiCompletion,
  type UseUiCompletionResult,
} from '../public-api';
import { useStructuredCompletionWithMessage } from './use-structured-completion-with-message';

const schema = s.object('result', { answer: s.string('answer') });
const unavailableResult =
  '{"hashbrownRecovery":{"version":1,"status":"result-unavailable","effect":"unknown","message":"The browser result is unavailable after recovery. The operation may already have occurred. No retry was performed."}}';

/** Creates the authoritative browser-only or mixed canonical recovery data. */
function snapshot(mixed: boolean): ConversationSnapshot<{ count: number }> {
  return {
    threadId: 'retained-thread',
    configuredSystemMessageId: 'original-system',
    state: { count: 2 },
    messages: [
      { id: 'original-system', role: 'system', content: 'trusted' },
      { id: 'original-user', role: 'user', content: 'save this' },
      {
        id: 'original-assistant',
        role: 'assistant',
        toolCalls: [
          {
            id: 'browser-one',
            type: 'function',
            function: { name: 'save', arguments: '{"value":7}' },
          },
          ...(mixed
            ? [
                {
                  id: 'protected-call',
                  type: 'function' as const,
                  function: { name: 'charge', arguments: '{"amount":2}' },
                },
              ]
            : []),
          {
            id: 'browser-two',
            type: 'function',
            function: { name: 'save', arguments: '{"value":8}' },
          },
        ],
      },
    ],
    pendingBrowserRecovery: {
      protocolVersion: 1,
      serverRevision: 27,
      callIds: ['browser-two', 'browser-one'],
    },
    ...(mixed
      ? {
          interrupts: [
            {
              id: 'protected-request',
              reason: 'approval',
              toolCallId: 'protected-call',
            },
          ],
        }
      : {}),
  };
}

/** Requires the actual facade projection without hiding missing forwarding. */
function requirePending(pending: PendingConversationRecovery | undefined) {
  if (!pending) throw new Error('Expected pending browser recovery');
  return pending;
}

/** Records actual canonical requests and holds the admitted continuation. */
function controlledTransport(mixed: boolean) {
  const requests: TransportRequest[] = [];
  let release!: () => void;
  const terminal = new Promise<void>((resolve) => {
    release = resolve;
  });
  const transport: Transport = {
    name: 'browser-recovery-facade',
    send: async (request) => {
      requests.push(request);
      const identity = {
        threadId: request.input.threadId,
        runId: request.input.runId,
      };
      return {
        events: (async function* (): AsyncGenerator<AGUIEvent> {
          yield { type: EventType.RUN_STARTED, ...identity };
          await terminal;
          if (mixed) {
            yield {
              type: EventType.TOOL_CALL_RESULT,
              messageId: 'protected-result',
              toolCallId: 'protected-call',
              content: 'charged',
              role: 'tool',
            };
          }
          yield { type: EventType.RUN_FINISHED, ...identity };
        })(),
      };
    },
  };
  return { transport, requests, release };
}

/** Compares the complete emitted input, retaining each family's schema/UI extensions. */
function expectRequest(
  request: TransportRequest,
  retained: ConversationSnapshot<{ count: number }>,
  configuration: ConversationRecoveryConfiguration,
  options: ResumeConversationRecoveryOptions,
) {
  const hashbrown = configuration.forwardedProps['hashbrown'];
  const originalExtension =
    typeof hashbrown === 'object' && hashbrown !== null ? hashbrown : {};
  const results = [
    {
      id: expect.any(String),
      role: 'tool',
      toolCallId: 'browser-one',
      content: '{"saved":true}',
    },
    {
      id: expect.any(String),
      role: 'tool',
      toolCallId: 'browser-two',
      content: unavailableResult,
    },
  ];

  expect(request.input).toEqual({
    threadId: retained.threadId,
    runId: request.requestId,
    messages: [...retained.messages, ...results],
    state: retained.state,
    tools: configuration.tools,
    context: [],
    forwardedProps: {
      ...configuration.forwardedProps,
      hashbrown: {
        ...originalExtension,
        recovery: {
          version: 1,
          serverRevision: 27,
          outcomes: [
            { toolCallId: 'browser-one', status: 'result' },
            { toolCallId: 'browser-two', status: 'unavailable' },
          ],
        },
      },
    },
    ...(options.entries ? { resume: options.entries } : {}),
  });
  expect(request.requestId.trim()).not.toBe('');
  const ids = request.input.messages.map((message) => message.id);
  expect(new Set(ids).size).toBe(ids.length);
}

/** Builds complete explicit settlement in reverse browser order to check canonical ordering. */
function settlement(
  pending: PendingConversationRecovery,
  mixed: boolean,
): ResumeConversationRecoveryOptions {
  return {
    batchId: pending.id,
    outcomes: [
      { toolCallId: 'browser-two', status: 'unavailable' },
      { toolCallId: 'browser-one', status: 'result', value: { saved: true } },
    ],
    ...(mixed
      ? {
          entries: [
            {
              interruptId: 'protected-request',
              status: 'resolved',
              payload: true,
            },
          ],
        }
      : {}),
  };
}

type Options = Omit<
  UseChatOptions<Chat.AnyTool, { count: number }>,
  'messages'
> & { input?: string };
const families = [
  { name: 'chat', use: (options: Options) => useChat(options) },
  {
    name: 'structured chat',
    use: (options: Options) => useStructuredChat({ ...options, schema }),
  },
  {
    name: 'completion',
    use: (options: Options) =>
      useCompletion({ ...options, input: options.input ?? '' }),
  },
  {
    name: 'structured completion',
    use: (options: Options) =>
      useStructuredCompletion({
        ...options,
        schema,
        input: options.input ?? '',
      }),
  },
  {
    name: 'with-message completion',
    use: (options: Options) =>
      useStructuredCompletionWithMessage({
        ...options,
        schema,
        input: options.input ?? '',
      }).result,
  },
  {
    name: 'UI chat',
    use: (options: Options) => useUiChat({ ...options, components: [] }),
  },
  {
    name: 'UI completion',
    use: (options: Options) =>
      useUiCompletion({
        ...options,
        input: options.input ?? '',
        components: [],
      }),
  },
];

/** Supplies the public provider for real hook runtimes. */
function wrapper({ children }: { children: ReactNode }) {
  return <HashbrownProvider url="/chat">{children}</HashbrownProvider>;
}

interface RecoveryContract {
  readonly pendingConversationRecovery: PendingConversationRecovery | undefined;
  resumeConversationRecovery(options: ResumeConversationRecoveryOptions): void;
}
type RecoveryProjection<Result extends RecoveryContract> = Pick<
  Result,
  keyof RecoveryContract
>;

test('all seven React results expose the exact public browser recovery contract', () => {
  expectTypeOf<
    RecoveryProjection<UseChatResult<Chat.AnyTool>>
  >().toEqualTypeOf<RecoveryContract>();
  expectTypeOf<
    RecoveryProjection<UseStructuredChatResult<unknown, Chat.AnyTool>>
  >().toEqualTypeOf<RecoveryContract>();
  expectTypeOf<
    RecoveryProjection<UseCompletionResult>
  >().toEqualTypeOf<RecoveryContract>();
  expectTypeOf<
    RecoveryProjection<UseStructuredCompletionResult<unknown>>
  >().toEqualTypeOf<RecoveryContract>();
  expectTypeOf<
    RecoveryProjection<
      ReturnType<typeof useStructuredCompletionWithMessage>['result']
    >
  >().toEqualTypeOf<RecoveryContract>();
  expectTypeOf<
    RecoveryProjection<UiChatResult<Chat.AnyTool>>
  >().toEqualTypeOf<RecoveryContract>();
  expectTypeOf<
    RecoveryProjection<UseUiCompletionResult<Chat.AnyTool>>
  >().toEqualTypeOf<RecoveryContract>();
});

for (const mixed of [false, true]) {
  test.each(families)(
    `$name restores inertly and explicitly settles one exact browser recovery request: mixed=${mixed}`,
    async (family) => {
      const control = controlledTransport(mixed);
      const handler = vi.fn(async () => 'must not replay');
      const tools = [
        {
          name: 'save',
          description: 'save',
          schema: s.object('args', { value: s.number('value') }),
          handler,
        },
      ];
      const retained = snapshot(mixed);
      const original = JSON.stringify(retained);
      const { result, rerender, unmount } = renderHook(
        () =>
          family.use({
            system: 'trusted',
            state: { count: 0 },
            tools,
            transport: control.transport,
            debounceTime: 0,
            retries: 0,
          }),
        { wrapper },
      );
      const configuration = result.current.getRecoveryConfiguration();
      const resume = result.current.resume;
      const resumeRecovery = result.current.resumeConversationRecovery;
      const scheduling = ɵgetRuntimeSchedulingState(result.current);

      try {
        act(() =>
          result.current.restoreConversation(retained, {
            expectedRevision: result.current.recovery.revision,
          }),
        );
        await act(async () => undefined);
        const pending = requirePending(
          result.current.pendingConversationRecovery,
        );
        rerender();
        await act(async () => undefined);

        expect(pending).toEqual({
          id: expect.any(String),
          serverRevision: 27,
          toolCalls: [
            { id: 'browser-one', name: 'save', arguments: { value: 7 } },
            { id: 'browser-two', name: 'save', arguments: { value: 8 } },
          ],
          interrupts: retained.interrupts ?? [],
        });
        expect(result.current.pendingConversationRecovery).toBe(pending);
        expect(result.current.resume).toBe(resume);
        expect(result.current.resumeConversationRecovery).toBe(resumeRecovery);
        expect(ɵgetRuntimeSchedulingState(result.current)).toBe(scheduling);
        expect(scheduling().pending).toBe(true);
        expect(result.current.state).toEqual({ count: 2 });
        expect(result.current.getRecoveryConfiguration()).toEqual(
          configuration,
        );
        expect(control.requests).toHaveLength(0);
        expect(handler).not.toHaveBeenCalled();
        const options = settlement(pending, mixed);
        act(() => result.current.resumeConversationRecovery(options));
        expect(() =>
          result.current.resumeConversationRecovery(options),
        ).toThrow();
        await waitFor(() => expect(control.requests).toHaveLength(1));

        expectRequest(control.requests[0], retained, configuration, options);
        await act(async () => control.release());
        await waitFor(() => expect(result.current.isResuming).toBe(false));
        expect(result.current.pendingConversationRecovery).toBeUndefined();
        expect(result.current.recovery.required).toBe(false);
        expect(result.current.error).toBeUndefined();
        expect(JSON.stringify(retained)).toBe(original);
        expect(handler).not.toHaveBeenCalled();
        expect(control.requests).toHaveLength(1);
      } finally {
        control.release();
        unmount();
      }
    },
  );
}

/** Supplies strict effect startup/cleanup for real hook runtimes. */
function strictWrapper({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <HashbrownProvider url="/chat">{children}</HashbrownProvider>
    </StrictMode>
  );
}

test.each(families)(
  '$name restores inertly through strict subscriptions, cleanup and a freshly restored remount',
  async (family) => {
    const control = controlledTransport(true);
    const handler = vi.fn(async () => 'must not replay');
    const tools = [
      {
        name: 'save',
        description: 'save',
        schema: s.object('args', { value: s.number('value') }),
        handler,
      },
    ];
    const retained = snapshot(true);
    const useSubject = () =>
      family.use({
        system: 'trusted',
        tools,
        transport: control.transport,
        state: { count: 0 },
      });
    const first = renderHook(useSubject, { wrapper: strictWrapper });
    let unmount = first.unmount;

    try {
      act(() =>
        first.result.current.restoreConversation(retained, {
          expectedRevision: first.result.current.recovery.revision,
        }),
      );
      await act(async () => undefined);
      const pending = requirePending(
        first.result.current.pendingConversationRecovery,
      );
      const command = first.result.current.resumeConversationRecovery;
      first.rerender();
      await act(async () => undefined);

      expect(first.result.current.pendingConversationRecovery).toBe(pending);
      expect(first.result.current.resumeConversationRecovery).toBe(command);
      expect(ɵgetRuntimeSchedulingState(first.result.current)().pending).toBe(
        true,
      );
      expect(control.requests).toHaveLength(0);
      first.unmount();
      const second = renderHook(useSubject, { wrapper: strictWrapper });
      unmount = second.unmount;
      act(() =>
        second.result.current.restoreConversation(retained, {
          expectedRevision: second.result.current.recovery.revision,
        }),
      );
      await act(async () => undefined);

      expect(
        requirePending(second.result.current.pendingConversationRecovery).id,
      ).not.toBe(pending.id);
      expect(() =>
        second.result.current.resumeConversationRecovery(
          settlement(pending, true),
        ),
      ).toThrow();
      expect(handler).not.toHaveBeenCalled();
      expect(control.requests).toHaveLength(0);
    } finally {
      control.release();
      unmount();
    }
  },
);

const completionFamilies = families.filter((family) =>
  family.name.includes('completion'),
);

test.each(completionFamilies)(
  '$name defers changed input until the explicit cold continuation fully settles',
  async (family) => {
    const control = controlledTransport(false);
    const handler = vi.fn(async () => 'must not replay');
    const tools = [
      {
        name: 'save',
        description: 'save',
        schema: s.object('args', { value: s.number('value') }),
        handler,
      },
    ];
    const retained = snapshot(false);
    const { result, rerender, unmount } = renderHook(
      ({ input }) =>
        family.use({
          input,
          system: 'trusted',
          tools,
          transport: control.transport,
          state: { count: 0 },
          debounceTime: 0,
        }),
      { wrapper, initialProps: { input: '' } },
    );

    try {
      act(() =>
        result.current.restoreConversation(retained, {
          expectedRevision: result.current.recovery.revision,
        }),
      );
      await act(async () => undefined);
      const pending = requirePending(
        result.current.pendingConversationRecovery,
      );
      rerender({ input: 'B' });
      await act(async () => undefined);
      expect(control.requests).toHaveLength(0);
      act(() =>
        result.current.resumeConversationRecovery(settlement(pending, false)),
      );
      await waitFor(() => expect(control.requests).toHaveLength(1));
      await waitFor(() =>
        expect(result.current.pendingConversationRecovery).toBeUndefined(),
      );
      rerender({ input: 'C' });
      await act(async () => undefined);

      expect(result.current.isResuming).toBe(true);
      expect(control.requests).toHaveLength(1);
      await act(async () => control.release());
      await waitFor(() => expect(control.requests).toHaveLength(2));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(control.requests[1].input.messages).toEqual(
        expect.arrayContaining([
          { id: expect.any(String), role: 'user', content: 'C' },
        ]),
      );
      expect(control.requests[1].input.forwardedProps).toEqual(
        result.current.getRecoveryConfiguration().forwardedProps,
      );
      expect(control.requests[1].input.resume).toBeUndefined();
      expect(handler).not.toHaveBeenCalled();
      expect(control.requests).toHaveLength(2);
    } finally {
      control.release();
      unmount();
    }
  },
);
