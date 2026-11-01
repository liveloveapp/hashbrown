import { inject, InjectionToken, signal, type Signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
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
  chatResource,
  type ChatResourceOptions,
  type ChatResourceRef,
  completionResource,
  type CompletionResourceOptions,
  type CompletionResourceRef,
  provideHashbrown,
  structuredChatResource,
  type StructuredChatResourceRef,
  structuredCompletionResource,
  type StructuredCompletionResourceRef,
  uiChatResource,
  type UiChatResourceRef,
  uiCompletionResource,
  type UiCompletionResourceRef,
} from '../public_api';
import { structuredCompletionResourceWithMessage } from './structured-completion-resource-with-message.fn';

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
  ChatResourceOptions<Chat.AnyTool, { count: number }>,
  'messages'
> & { input?: Signal<string | undefined> };
const families = [
  { name: 'chat', create: (options: Options) => chatResource(options) },
  {
    name: 'structured chat',
    create: (options: Options) =>
      structuredChatResource({ ...options, schema }),
  },
  {
    name: 'completion',
    create: (options: Options) =>
      completionResource({
        ...options,
        input: options.input ?? signal<string | undefined>(undefined),
      }),
  },
  {
    name: 'structured completion',
    create: (options: Options) =>
      structuredCompletionResource({
        ...options,
        schema,
        input: options.input ?? signal<string | undefined>(undefined),
      }),
  },
  {
    name: 'with-message completion',
    create: (options: Options) =>
      structuredCompletionResourceWithMessage({
        ...options,
        schema,
        input: options.input ?? signal<string | undefined>(undefined),
      }).ref,
  },
  {
    name: 'UI chat',
    create: (options: Options) =>
      uiChatResource({ ...options, components: [] }),
  },
  {
    name: 'UI completion',
    create: (options: Options) =>
      uiCompletionResource({
        ...options,
        input: options.input ?? signal<string | undefined>(undefined),
        components: [],
      }),
  },
];

interface RecoveryContract {
  readonly pendingConversationRecovery: Signal<
    PendingConversationRecovery | undefined
  >;
  resumeConversationRecovery(options: ResumeConversationRecoveryOptions): void;
}
type RecoveryProjection<Result extends RecoveryContract> = Pick<
  Result,
  keyof RecoveryContract
>;

test('all seven Angular results expose the exact public browser recovery contract', () => {
  expectTypeOf<
    RecoveryProjection<ChatResourceRef<Chat.AnyTool>>
  >().toEqualTypeOf<RecoveryContract>();
  expectTypeOf<
    RecoveryProjection<StructuredChatResourceRef<unknown, Chat.AnyTool>>
  >().toEqualTypeOf<RecoveryContract>();
  expectTypeOf<
    RecoveryProjection<CompletionResourceRef>
  >().toEqualTypeOf<RecoveryContract>();
  expectTypeOf<
    RecoveryProjection<StructuredCompletionResourceRef<unknown>>
  >().toEqualTypeOf<RecoveryContract>();
  expectTypeOf<
    RecoveryProjection<
      ReturnType<typeof structuredCompletionResourceWithMessage>['ref']
    >
  >().toEqualTypeOf<RecoveryContract>();
  expectTypeOf<
    RecoveryProjection<UiChatResourceRef<Chat.AnyTool>>
  >().toEqualTypeOf<RecoveryContract>();
  expectTypeOf<
    RecoveryProjection<UiCompletionResourceRef<Chat.AnyTool>>
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
      TestBed.configureTestingModule({
        providers: [provideHashbrown({ baseUrl: '/chat' })],
      });
      const resource = TestBed.runInInjectionContext(() =>
        family.create({
          system: 'trusted',
          state: { count: 0 },
          tools,
          transport: control.transport,
          debounce: 0,
        }),
      );
      TestBed.tick();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      TestBed.tick();
      await vi.waitFor(() => expect(resource.isLoading()).toBe(false));
      expect(control.requests).toHaveLength(0);
      const configuration = resource.getRecoveryConfiguration();
      const resume = resource.resume;
      const resumeRecovery = resource.resumeConversationRecovery;
      const scheduling = ɵgetRuntimeSchedulingState(resource);

      try {
        resource.restoreConversation(retained, {
          expectedRevision: resource.recovery().revision,
        });
        TestBed.tick();
        const pending = requirePending(resource.pendingConversationRecovery());
        TestBed.tick();

        expect(pending).toEqual({
          id: expect.any(String),
          serverRevision: 27,
          toolCalls: [
            { id: 'browser-one', name: 'save', arguments: { value: 7 } },
            { id: 'browser-two', name: 'save', arguments: { value: 8 } },
          ],
          interrupts: retained.interrupts ?? [],
        });
        expect(resource.pendingConversationRecovery()).toBe(pending);
        expect(resource.resume).toBe(resume);
        expect(resource.resumeConversationRecovery).toBe(resumeRecovery);
        expect(ɵgetRuntimeSchedulingState(resource)).toBe(scheduling);
        expect(scheduling().pending).toBe(true);
        expect(resource.state()).toEqual({ count: 2 });
        expect(resource.getRecoveryConfiguration()).toEqual(configuration);
        expect(control.requests).toHaveLength(0);
        expect(handler).not.toHaveBeenCalled();
        const options = settlement(pending, mixed);
        resource.resumeConversationRecovery(options);
        expect(() => resource.resumeConversationRecovery(options)).toThrow();
        await vi.waitFor(() => expect(control.requests).toHaveLength(1));

        expectRequest(control.requests[0], retained, configuration, options);
        control.release();
        await vi.waitFor(() => expect(resource.isResuming()).toBe(false));
        TestBed.tick();
        expect(resource.pendingConversationRecovery()).toBeUndefined();
        expect(resource.recovery().required).toBe(false);
        expect(resource.error()).toBeUndefined();
        expect(JSON.stringify(retained)).toBe(original);
        expect(handler).not.toHaveBeenCalled();
        expect(control.requests).toHaveLength(1);
      } finally {
        control.release();
        TestBed.resetTestingModule();
      }
    },
  );
}

test.each(families)(
  '$name retains the pending recovery configuration through a real harmless default-transport options update and recreation',
  async (family) => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected browser recovery request'));
    const handler = vi.fn(async () => 'must not replay');
    const tools = [
      {
        name: 'save',
        description: 'save',
        schema: s.object('args', { value: s.number('value') }),
        handler,
      },
    ];
    const system = signal('trusted', { equal: () => false });
    const retained = snapshot(true);
    TestBed.configureTestingModule({
      providers: [provideHashbrown({ baseUrl: '/chat' })],
    });
    const resource = TestBed.runInInjectionContext(() =>
      family.create({ system, tools, state: { count: 0 } }),
    );
    TestBed.tick();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    TestBed.tick();
    await vi.waitFor(() => expect(resource.isLoading()).toBe(false));

    try {
      resource.restoreConversation(retained, {
        expectedRevision: resource.recovery().revision,
      });
      TestBed.tick();
      const pending = requirePending(resource.pendingConversationRecovery());
      const resume = resource.resume;
      const command = resource.resumeConversationRecovery;
      const configuration = resource.getRecoveryConfiguration();
      system.set('trusted');
      expect(() => TestBed.tick()).not.toThrow();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      TestBed.tick();

      expect(resource.pendingConversationRecovery()).toBe(pending);
      expect(resource.getRecoveryConfiguration()).toEqual(configuration);
      expect(resource.resume).toBe(resume);
      expect(resource.resumeConversationRecovery).toBe(command);
      expect(ɵgetRuntimeSchedulingState(resource)().pending).toBe(true);
      expect(fetch).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideHashbrown({ baseUrl: '/chat' })],
      });
      const recreated = TestBed.runInInjectionContext(() =>
        family.create({ system, tools, state: { count: 0 } }),
      );
      TestBed.tick();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      TestBed.tick();
      await vi.waitFor(() => expect(recreated.isLoading()).toBe(false));
      recreated.restoreConversation(retained, {
        expectedRevision: recreated.recovery().revision,
      });
      TestBed.tick();

      expect(
        requirePending(recreated.pendingConversationRecovery()).id,
      ).not.toBe(pending.id);
      expect(() =>
        recreated.resumeConversationRecovery(settlement(pending, true)),
      ).toThrow();
      expect(fetch).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    } finally {
      TestBed.resetTestingModule();
      fetch.mockRestore();
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
    const input = signal<string | undefined>(undefined);
    TestBed.configureTestingModule({
      providers: [provideHashbrown({ baseUrl: '/chat' })],
    });
    const resource = TestBed.runInInjectionContext(() =>
      family.create({
        input,
        system: 'trusted',
        tools,
        transport: control.transport,
        state: { count: 0 },
        debounce: 0,
      }),
    );
    TestBed.tick();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    TestBed.tick();
    await vi.waitFor(() => expect(resource.isLoading()).toBe(false));

    try {
      resource.restoreConversation(retained, {
        expectedRevision: resource.recovery().revision,
      });
      TestBed.tick();
      const pending = requirePending(resource.pendingConversationRecovery());
      input.set('B');
      TestBed.tick();
      expect(control.requests).toHaveLength(0);
      resource.resumeConversationRecovery(settlement(pending, false));
      await vi.waitFor(() => expect(control.requests).toHaveLength(1));
      await vi.waitFor(() =>
        expect(resource.pendingConversationRecovery()).toBeUndefined(),
      );
      input.set('C');
      TestBed.tick();

      expect(resource.isResuming()).toBe(true);
      expect(control.requests).toHaveLength(1);
      control.release();
      await vi.waitFor(() => {
        TestBed.tick();
        expect(control.requests).toHaveLength(2);
      });
      await vi.waitFor(() => expect(resource.isLoading()).toBe(false));

      expect(control.requests[1].input.messages).toEqual(
        expect.arrayContaining([
          { id: expect.any(String), role: 'user', content: 'C' },
        ]),
      );
      expect(control.requests[1].input.forwardedProps).toEqual(
        resource.getRecoveryConfiguration().forwardedProps,
      );
      expect(control.requests[1].input.resume).toBeUndefined();
      expect(handler).not.toHaveBeenCalled();
      expect(control.requests).toHaveLength(2);
    } finally {
      control.release();
      TestBed.resetTestingModule();
    }
  },
);

test('text completion invokes a fresh browser tool in its injection context with the original arguments and AbortSignal', async () => {
  const dependency = new InjectionToken<string>('completion tool dependency');
  const requests: TransportRequest[] = [];
  const observations: {
    args: { value: number };
    signal: AbortSignal;
    dependency: string;
  }[] = [];
  const handler = vi.fn(
    async (args: { value: number }, abortSignal: AbortSignal) => {
      const value = inject(dependency);
      observations.push({ args, signal: abortSignal, dependency: value });
      return `${value}:${args.value}`;
    },
  );
  const transport: Transport = {
    name: 'fresh-completion-tool',
    send: async (request) => {
      requests.push(request);
      const first = requests.length === 1;
      const identity = {
        threadId: request.input.threadId,
        runId: request.input.runId,
      };
      return {
        events: (async function* (): AsyncGenerator<AGUIEvent> {
          yield { type: EventType.RUN_STARTED, ...identity };
          if (first) {
            yield {
              type: EventType.TOOL_CALL_START,
              toolCallId: 'fresh-call',
              toolCallName: 'save',
              parentMessageId: 'fresh-assistant',
            };
            yield {
              type: EventType.TOOL_CALL_ARGS,
              toolCallId: 'fresh-call',
              delta: '{"value":7}',
            };
            yield { type: EventType.TOOL_CALL_END, toolCallId: 'fresh-call' };
          }
          yield { type: EventType.RUN_FINISHED, ...identity };
        })(),
      };
    },
  };
  const options: CompletionResourceOptions<string, { count: number }> = {
    system: 'trusted',
    state: { count: 0 },
    input: signal('run a fresh tool'),
    transport,
    tools: [
      {
        name: 'save',
        description: 'save',
        schema: s.object('args', { value: s.number('value') }),
        handler,
      },
    ],
  };
  TestBed.configureTestingModule({
    providers: [
      provideHashbrown({ baseUrl: '/chat' }),
      { provide: dependency, useValue: 'injected' },
    ],
  });
  const resource = TestBed.runInInjectionContext(() =>
    completionResource<string, { count: number }>(options),
  );

  try {
    TestBed.tick();
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    await vi.waitFor(() => expect(resource.isLoading()).toBe(false));

    expect(observations).toHaveLength(1);
    expect(observations[0].args).toEqual({ value: 7 });
    expect(observations[0].dependency).toBe('injected');
    expect(observations[0].signal).toBeInstanceOf(AbortSignal);
    expect(handler.mock.calls[0][1]).toBe(observations[0].signal);
    expect(requests[1].input.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'tool',
          toolCallId: 'fresh-call',
          content: 'injected:7',
        }),
      ]),
    );
    expect(resource.state()).toEqual({ count: 0 });
  } finally {
    TestBed.resetTestingModule();
  }
});

test.each(families)(
  '$name preserves a same-value URL, rejects a changed URL while pending and permits an explicit fresh thread',
  async (family) => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected browser recovery request'));
    const handler = vi.fn(async () => 'must not replay');
    const tools = [
      {
        name: 'save',
        description: 'save',
        schema: s.object('args', { value: s.number('value') }),
        handler,
      },
    ];
    const apiUrl = signal('/chat', { equal: () => false });
    const threadId = signal<string | undefined>(undefined);
    TestBed.configureTestingModule({
      providers: [provideHashbrown({ baseUrl: '/chat' })],
    });
    const resource = TestBed.runInInjectionContext(() =>
      family.create({
        system: 'trusted',
        tools,
        apiUrl,
        threadId,
        state: { count: 0 },
      }),
    );
    TestBed.tick();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    TestBed.tick();
    await vi.waitFor(() => expect(resource.isLoading()).toBe(false));

    try {
      resource.restoreConversation(snapshot(false), {
        expectedRevision: resource.recovery().revision,
      });
      TestBed.tick();
      const pending = requirePending(resource.pendingConversationRecovery());
      apiUrl.set('/chat');
      expect(() => TestBed.tick()).not.toThrow();
      expect(resource.pendingConversationRecovery()).toBe(pending);
      apiUrl.set('/changed');
      expect(() => TestBed.tick()).toThrow(/configuration|recovery/i);

      expect(resource.pendingConversationRecovery()).toBe(pending);
      expect(handler).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      threadId.set('fresh-thread');
      expect(() => TestBed.tick()).not.toThrow();
      expect(resource.pendingConversationRecovery()).toBeUndefined();
      expect(resource.recovery().required).toBe(false);
      expect(() =>
        resource.resumeConversationRecovery(settlement(pending, false)),
      ).toThrow();
      expect(handler).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      TestBed.resetTestingModule();
      fetch.mockRestore();
    }
  },
);
