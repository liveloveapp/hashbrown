import { type AGUIEvent, EventType } from '@ag-ui/core';
import type {
  AGUIMock,
  AGUIRunAgentInput,
  AGUIEvent as AimockAGUIEvent,
} from '@copilotkit/aimock/agui';
import {
  Chat,
  type ChatRuntime,
  createChatRuntime,
  createHttpTransport,
  HttpTransport,
  s,
  type StateSignal,
  type TransportRequest,
  type TransportResponse,
  ɵui,
} from '@hashbrownai/core';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AimockHandle, startAimock } from './aimock-runner';

type HashbrownRunInput = NonNullable<TransportRequest['input']>;

interface StoppableHandle {
  stop(): Promise<void>;
}

interface TestAimock<Handle extends StoppableHandle = AimockHandle> {
  readonly handle: Handle;
  stop(): Promise<void>;
}

interface ObservedResponse {
  readonly response: Response;
  readonly cancelCount: number;
  readonly eventTypes: readonly EventType[];
  readonly readCount: number;
  readonly reachedEof: boolean;
  waitForCancel(timeoutMs?: number): Promise<{
    readonly reason: unknown;
    readonly readCount: number;
  }>;
  waitForEvent(type: EventType, timeoutMs?: number): Promise<void>;
}

interface Deferred<Value> {
  readonly promise: Promise<Value>;
  resolve(value: Value): void;
}

function createFixtureFile(workDir: string): string {
  const fixturePath = join(workDir, 'providers.json');
  writeFileSync(fixturePath, JSON.stringify({ fixtures: [] }));
  return fixturePath;
}

async function startTestAimock(): Promise<TestAimock> {
  const workDir = mkdtempSync(join(tmpdir(), 'hashbrown-agui-http-'));
  const fixturePath = createFixtureFile(workDir);
  let handle: AimockHandle;
  try {
    handle = await startAimock({ fixturePath });
  } catch (error) {
    rmSync(workDir, { recursive: true, force: true });
    throw error;
  }
  return createTestAimock(handle, workDir);
}

function createTestAimock<Handle extends StoppableHandle>(
  handle: Handle,
  workDir: string,
): TestAimock<Handle> {
  let stopped = false;

  return {
    handle,
    async stop() {
      if (stopped) {
        return;
      }

      try {
        await handle.stop();
        stopped = true;
      } finally {
        rmSync(workDir, { recursive: true, force: true });
      }
    },
  };
}

function createRequest(
  input: HashbrownRunInput,
  requestId: string,
): TransportRequest {
  return {
    input,
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId,
  };
}

async function collectEvents(
  events: AsyncIterable<AGUIEvent>,
): Promise<AGUIEvent[]> {
  const collected: AGUIEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

function waitForSignal<State>(
  signal: StateSignal<State>,
  predicate: (state: State) => boolean,
  timeoutMs = 5_000,
): Promise<State> {
  const current = signal();
  if (predicate(current)) {
    return Promise.resolve(current);
  }

  return new Promise((resolve, reject) => {
    let unsubscribe: () => void = () => undefined;
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out waiting for state after ${timeoutMs}ms`));
    }, timeoutMs);

    unsubscribe = signal.subscribe((state) => {
      if (!predicate(state)) {
        return;
      }

      clearTimeout(timeout);
      unsubscribe();
      resolve(state);
    });
  });
}

async function waitForIdle(
  runtime: Pick<ChatRuntime<unknown, Chat.AnyTool>, 'isLoading'>,
): Promise<void> {
  await waitForSignal(runtime.isLoading, (value) => !value);
  await Promise.resolve();
}

async function drainRuntimeEffects(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function waitForHandshake<Value>(
  handshake: Promise<Value>,
  description: string,
  timeoutMs = 2_000,
): Promise<Value> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${description}`));
    }, timeoutMs);

    handshake.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function createDeferred<Value>(): Deferred<Value> {
  let resolvePromise: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve;
  });

  return { promise, resolve: resolvePromise };
}

function registerFixture(
  aguiMock: AGUIMock,
  predicate: (input: HashbrownRunInput) => boolean,
  events: AGUIEvent[],
): void {
  aguiMock.onPredicate(
    // Aimock 1.38 duplicates AG-UI's wire types and omits Hashbrown's extension.
    (input: AGUIRunAgentInput) => predicate(input as HashbrownRunInput),
    events as unknown as AimockAGUIEvent[],
  );
}

function registerIdentityFixture(
  aguiMock: AGUIMock,
  capturedInputs: HashbrownRunInput[],
  predicate: (input: HashbrownRunInput) => boolean,
  createEvents: (input: HashbrownRunInput, requestIndex: number) => AGUIEvent[],
  delayMs?: number,
): void {
  const events: AGUIEvent[] = [];

  aguiMock.onPredicate(
    (input: AGUIRunAgentInput) => {
      const requestInput = input as HashbrownRunInput;
      if (!predicate(requestInput)) {
        return false;
      }

      capturedInputs.push(requestInput);
      events.splice(
        0,
        events.length,
        ...createEvents(requestInput, capturedInputs.length - 1),
      );
      return true;
    },
    events as unknown as AimockAGUIEvent[],
    delayMs,
  );
}

function createTextRunEvents(
  input: HashbrownRunInput,
  messageId: string,
  chunks: string[],
  timestamp: number,
): AGUIEvent[] {
  return [
    {
      type: EventType.RUN_STARTED,
      threadId: input.threadId,
      runId: input.runId,
      timestamp,
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: 'assistant',
      timestamp: timestamp + 1,
    },
    ...chunks.map((delta, index): AGUIEvent => ({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      delta,
      timestamp: timestamp + index + 2,
    })),
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId,
      timestamp: timestamp + chunks.length + 2,
    },
    {
      type: EventType.RUN_FINISHED,
      threadId: input.threadId,
      runId: input.runId,
      timestamp: timestamp + chunks.length + 3,
    },
  ];
}

function createObservedFetch(
  observedResponses: ObservedResponse[],
  onObserved?: (response: ObservedResponse) => void,
): typeof fetch {
  return async (input, init) => {
    const response = await fetch(input, init);
    if (!response.body) {
      throw new Error('Expected an HTTP response body');
    }

    const reader = response.body.getReader();
    let cancelCount = 0;
    const eventTypes: EventType[] = [];
    let eventBuffer = '';
    let readCount = 0;
    let reachedEof = false;
    const eventWaiters: Array<{
      readonly type: EventType;
      readonly resolve: () => void;
    }> = [];
    const decoder = new TextDecoder();
    const observeEvents = (chunk: Uint8Array | undefined) => {
      eventBuffer += decoder.decode(chunk, { stream: chunk !== undefined });

      let boundary = eventBuffer.indexOf('\n\n');
      while (boundary >= 0) {
        const frame = eventBuffer.slice(0, boundary);
        eventBuffer = eventBuffer.slice(boundary + 2);
        const data = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data) {
          const parsed = JSON.parse(data) as { type?: EventType };
          if (parsed.type) {
            eventTypes.push(parsed.type);
            for (let index = eventWaiters.length - 1; index >= 0; index--) {
              const waiter = eventWaiters[index];
              if (waiter?.type === parsed.type) {
                eventWaiters.splice(index, 1);
                waiter.resolve();
              }
            }
          }
        }

        boundary = eventBuffer.indexOf('\n\n');
      }
    };
    let resolveCancellation: (value: {
      readonly reason: unknown;
      readonly readCount: number;
    }) => void = () => undefined;
    const cancellation = new Promise<{
      readonly reason: unknown;
      readonly readCount: number;
    }>((resolve) => {
      resolveCancellation = resolve;
    });
    const observation: ObservedResponse = {
      response,
      get cancelCount() {
        return cancelCount;
      },
      get eventTypes() {
        return [...eventTypes];
      },
      get readCount() {
        return readCount;
      },
      get reachedEof() {
        return reachedEof;
      },
      waitForCancel(timeoutMs) {
        return waitForHandshake(
          cancellation,
          'explicit response body cancellation',
          timeoutMs,
        );
      },
      waitForEvent(type, timeoutMs) {
        if (eventTypes.includes(type)) {
          return Promise.resolve();
        }

        const eventObserved = new Promise<void>((resolve) => {
          eventWaiters.push({ type, resolve });
        });
        return waitForHandshake(
          eventObserved,
          `${type} response event`,
          timeoutMs,
        );
      },
    };
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const result = await reader.read();
          if (result.done) {
            if (cancelCount === 0) {
              reachedEof = true;
              observeEvents(undefined);
              controller.close();
            }
            return;
          }

          readCount += 1;
          observeEvents(result.value);
          controller.enqueue(result.value);
        } catch (error) {
          if (cancelCount === 0) {
            controller.error(error);
          }
        }
      },
      async cancel(reason) {
        cancelCount += 1;
        resolveCancellation({ reason, readCount });
        await reader.cancel(reason);
      },
    });

    observedResponses.push(observation);
    onObserved?.(observation);
    return new Response(body, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
  };
}

test('test aimock cleanup removes fixtures after a stop failure and retries shutdown', async () => {
  const workDir = mkdtempSync(join(tmpdir(), 'hashbrown-agui-cleanup-'));
  const handle = {
    stop: jest
      .fn<Promise<void>, []>()
      .mockRejectedValueOnce(new Error('stop failed'))
      .mockResolvedValue(undefined),
  };
  const testAimock = createTestAimock(handle, workDir);

  await expect(testAimock.stop()).rejects.toThrow('stop failed');

  expect(existsSync(workDir)).toBe(false);

  await expect(testAimock.stop()).resolves.toBeUndefined();
  await expect(testAimock.stop()).resolves.toBeUndefined();

  expect(handle.stop).toHaveBeenCalledTimes(2);
});

test('createHttpTransport posts Hashbrown run input and collects text events over real SSE', async () => {
  const input: HashbrownRunInput = {
    threadId: 'thread-text',
    runId: 'run-text',
    messages: [
      {
        id: 'message-system',
        role: 'system',
        content: 'Answer from the documentation.',
      },
      {
        id: 'message-user',
        role: 'user',
        content: 'What is Hashbrown?',
      },
    ],
    tools: [
      {
        name: 'searchDocs',
        description: 'Search the Hashbrown documentation.',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      },
    ],
    context: [{ description: 'workspace', value: 'hashbrown' }],
    state: { locale: 'en-US' },
    forwardedProps: { traceId: 'trace-text' },
    hashbrown: {
      responseSchema: {
        type: 'object',
        properties: { answer: { type: 'string' } },
        required: ['answer'],
      },
      ui: true,
    },
  };
  const expectedEvents: AGUIEvent[] = [
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-text',
      runId: 'run-text',
      timestamp: 1_700_000_001_000,
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'message-assistant-text',
      role: 'assistant',
      timestamp: 1_700_000_001_001,
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'message-assistant-text',
      delta: 'Hashbrown renders ',
      timestamp: 1_700_000_001_002,
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'message-assistant-text',
      delta: 'generative UI.',
      timestamp: 1_700_000_001_003,
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'message-assistant-text',
      timestamp: 1_700_000_001_004,
    },
    {
      type: EventType.RUN_FINISHED,
      threadId: 'thread-text',
      runId: 'run-text',
      timestamp: 1_700_000_001_005,
    },
  ];
  const capturedInputs: HashbrownRunInput[] = [];
  let testAimock: TestAimock | undefined;
  let response: TransportResponse | undefined;

  try {
    testAimock = await startTestAimock();
    registerFixture(
      testAimock.handle.aguiMock,
      (requestInput) => {
        if (requestInput.runId !== 'run-text') {
          return false;
        }
        capturedInputs.push(requestInput);
        return true;
      },
      expectedEvents,
    );
    const transport = createHttpTransport({
      baseUrl: testAimock.handle.aguiRunUrl,
    });

    response = await transport.send(createRequest(input, 'request-text'));
    const events = await collectEvents(response.events);

    expect(capturedInputs).toEqual([input]);
    expect(events).toEqual(expectedEvents);
  } finally {
    await response?.dispose?.();
    await testAimock?.stop();
  }
});

test('createChatRuntime defaults to AG-UI POST /run', async () => {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  let testAimock: TestAimock | undefined;
  let teardown: (() => void) | undefined;
  let fetchSpy: jest.SpiedFunction<typeof fetch> | undefined;

  try {
    testAimock = await startTestAimock();
    registerIdentityFixture(
      testAimock.handle.aguiMock,
      [],
      () => true,
      (input) =>
        createTextRunEvents(
          input,
          'message-default-run',
          ['Default route.'],
          1_700_000_009_000,
        ),
    );
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input, init) => {
        return nativeFetch(
          testAimock?.handle.aguiRunUrl ?? String(input),
          init,
        );
      });
    const runtime = createChatRuntime({
      system: 'Answer briefly.',
      retries: 0,
    });
    teardown = runtime.start();

    runtime.sendMessage({ role: 'user', content: 'Use the default route.' });
    const assistant = await waitForSignal(
      runtime.lastAssistantMessage,
      (message) => message?.content === 'Default route.',
    );

    expect(assistant?.content).toBe('Default route.');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/run',
      expect.objectContaining({ method: 'POST' }),
    );
  } finally {
    teardown?.();
    fetchSpy?.mockRestore();
    await testAimock?.stop();
  }
});

test('createChatRuntime adopts a generated thread identity and reuses it on the next text run', async () => {
  const capturedInputs: HashbrownRunInput[] = [];
  let testAimock: TestAimock | undefined;
  let teardown: (() => void) | undefined;

  try {
    testAimock = await startTestAimock();
    registerIdentityFixture(
      testAimock.handle.aguiMock,
      capturedInputs,
      () => true,
      (input, requestIndex) =>
        createTextRunEvents(
          input,
          `message-text-${requestIndex + 1}`,
          requestIndex === 0 ? ['First ', 'response.'] : ['Second response.'],
          1_700_000_010_000 + requestIndex * 100,
        ),
    );
    const runtime = createChatRuntime({
      transport: createHttpTransport({
        baseUrl: testAimock.handle.aguiRunUrl,
      }),
      system: 'Answer briefly.',
      retries: 0,
    });
    teardown = runtime.start();

    await drainRuntimeEffects();

    expect(capturedInputs).toEqual([]);
    expect(runtime.threadId()).toBeUndefined();

    runtime.sendMessage({ role: 'user', content: 'First turn' });
    await waitForSignal(
      runtime.lastAssistantMessage,
      (message) => message?.content === 'First response.',
    );
    await waitForIdle(runtime);

    const generatedThreadId = capturedInputs[0]?.threadId;
    expect(generatedThreadId).toEqual(expect.any(String));
    expect(runtime.threadId()).toBe(generatedThreadId);

    runtime.sendMessage({ role: 'user', content: 'Second turn' });
    const secondResponse = await waitForSignal(
      runtime.lastAssistantMessage,
      (message) => message?.content === 'Second response.',
    );
    await waitForIdle(runtime);

    expect(secondResponse).toEqual({
      role: 'assistant',
      content: 'Second response.',
      toolCalls: [],
    });
    expect(capturedInputs).toHaveLength(2);
    expect(capturedInputs[1]?.threadId).toBe(generatedThreadId);
    expect(capturedInputs[0]?.runId).not.toBe(capturedInputs[1]?.runId);
    expect(runtime.threadId()).toBe(generatedThreadId);
    expect(runtime.error()).toBeUndefined();
  } finally {
    teardown?.();
    await testAimock?.stop();
  }
}, 10_000);

test('createChatRuntime resolves chunked structured output and sends the response schema in hashbrown metadata', async () => {
  const responseSchema = s.object('answer', {
    answer: s.streaming.string('answer text'),
    count: s.number('result count'),
  });
  const capturedInputs: HashbrownRunInput[] = [];
  const observedContent: unknown[] = [];
  let testAimock: TestAimock | undefined;
  let teardown: (() => void) | undefined;
  let unsubscribeContent: (() => void) | undefined;

  try {
    testAimock = await startTestAimock();
    registerIdentityFixture(
      testAimock.handle.aguiMock,
      capturedInputs,
      () => true,
      (input) => [
        {
          type: EventType.RUN_STARTED,
          threadId: input.threadId,
          runId: input.runId,
          timestamp: 1_700_000_011_000,
        },
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'message-structured',
          role: 'assistant',
          timestamp: 1_700_000_011_001,
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'message-structured',
          delta: '{"count":2,"answer":"det',
          timestamp: 1_700_000_011_002,
        },
        {
          type: EventType.TEXT_MESSAGE_CHUNK,
          delta: 'ermin',
          timestamp: 1_700_000_011_003,
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'message-structured',
          delta: 'istic"}',
          timestamp: 1_700_000_011_004,
        },
        {
          type: EventType.TEXT_MESSAGE_END,
          messageId: 'message-structured',
          timestamp: 1_700_000_011_005,
        },
        {
          type: EventType.RUN_FINISHED,
          threadId: input.threadId,
          runId: input.runId,
          timestamp: 1_700_000_011_006,
        },
      ],
      25,
    );
    const runtime = createChatRuntime({
      transport: createHttpTransport({
        baseUrl: testAimock.handle.aguiRunUrl,
      }),
      system: 'Return a structured answer.',
      responseSchema,
      retries: 0,
    });
    unsubscribeContent = runtime.lastAssistantMessage.subscribe((message) => {
      if (message) {
        observedContent.push(message.content);
      }
    });
    teardown = runtime.start();

    runtime.sendMessage({ role: 'user', content: 'Count the results' });
    const assistant = await waitForSignal(
      runtime.lastAssistantMessage,
      (message) =>
        message?.content?.answer === 'deterministic' &&
        message.content.count === 2,
    );
    await waitForIdle(runtime);

    expect(assistant?.content).toEqual({
      answer: 'deterministic',
      count: 2,
    });
    expect(observedContent).toContainEqual({ count: 2, answer: 'det' });
    expect(capturedInputs).toHaveLength(1);
    expect(capturedInputs[0]?.hashbrown).toEqual({
      responseSchema: s.toJsonSchema(responseSchema),
    });
    expect(capturedInputs[0]).not.toHaveProperty('responseSchema');
    expect(capturedInputs[0]).not.toHaveProperty('params');
    expect(capturedInputs[0]?.forwardedProps).toEqual({});
    expect(runtime.error()).toBeUndefined();
  } finally {
    unsubscribeContent?.();
    teardown?.();
    await testAimock?.stop();
  }
}, 10_000);

test('createChatRuntime resolves validated generative UI state and marks the request as UI', async () => {
  function StatusComponent(_props: { title: string; count: number }) {
    void _props;
    return null;
  }

  const component = {
    component: StatusComponent,
    name: 'status',
    description: 'A status summary',
    props: {
      title: s.string('status title'),
      count: s.number('status count'),
    },
    children: false,
  } as const;
  const responseSchema = s.object('UI response', {
    ui: s.streaming.array(
      'status components',
      ɵui.createComponentSchema([component]),
    ),
  });
  const capturedInputs: HashbrownRunInput[] = [];
  let testAimock: TestAimock | undefined;
  let teardown: (() => void) | undefined;

  try {
    testAimock = await startTestAimock();
    registerIdentityFixture(
      testAimock.handle.aguiMock,
      capturedInputs,
      () => true,
      (input) =>
        createTextRunEvents(
          input,
          'message-ui',
          ['{"ui":[{"status":{"props":{"title":"Re', 'ady","count":2}}}]}'],
          1_700_000_012_000,
        ),
    );
    const runtime = createChatRuntime({
      transport: createHttpTransport({
        baseUrl: testAimock.handle.aguiRunUrl,
      }),
      system: 'Return the requested UI.',
      responseSchema,
      ui: true,
      retries: 0,
    });
    teardown = runtime.start();

    runtime.sendMessage({ role: 'user', content: 'Show status' });
    const partialAssistant = await waitForSignal(
      runtime.lastAssistantMessage,
      (message) => message?.content?.ui?.length === 1,
    );
    expect(
      partialAssistant?.content?.ui[0]?.status?.props?.partialValue,
    ).toEqual({ title: 'Re' });

    await waitForIdle(runtime);
    const assistant = runtime.lastAssistantMessage();

    expect(assistant?.content).toEqual({
      ui: [
        {
          status: {
            props: {
              complete: true,
              partialValue: { title: 'Ready', count: 2 },
              value: { title: 'Ready', count: 2 },
            },
          },
        },
      ],
    });
    expect(() => responseSchema.validate(assistant?.content)).not.toThrow();
    expect(capturedInputs).toHaveLength(1);
    expect(capturedInputs[0]?.hashbrown).toEqual({
      responseSchema: s.toJsonSchema(responseSchema),
      ui: true,
    });
    expect(runtime.error()).toBeUndefined();
  } finally {
    teardown?.();
    await testAimock?.stop();
  }
}, 10_000);

test('createChatRuntime cancels a delayed SSE run after the first content without later mutations or continuation', async () => {
  const toolHandler = jest.fn(async ({ value }: { value: string }) => value);
  const tool: Chat.Tool<'delayedTool', { value: string }, string> = {
    name: 'delayedTool',
    description: 'Handle a delayed value.',
    schema: s.object('delayed value', {
      value: s.string('value'),
    }),
    handler: toolHandler,
  };
  const capturedInputs: HashbrownRunInput[] = [];
  const observedResponses: ObservedResponse[] = [];
  let testAimock: TestAimock | undefined;
  let teardown: (() => void) | undefined;

  try {
    testAimock = await startTestAimock();
    registerIdentityFixture(
      testAimock.handle.aguiMock,
      capturedInputs,
      () => true,
      (input) => [
        {
          type: EventType.RUN_STARTED,
          threadId: input.threadId,
          runId: input.runId,
          timestamp: 1_700_000_013_000,
        },
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'message-cancelled',
          role: 'assistant',
          timestamp: 1_700_000_013_001,
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'message-cancelled',
          delta: 'Accepted content.',
          timestamp: 1_700_000_013_002,
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'message-cancelled',
          delta: ' Later content.',
          timestamp: 1_700_000_013_003,
        },
        {
          type: EventType.TEXT_MESSAGE_END,
          messageId: 'message-cancelled',
          timestamp: 1_700_000_013_004,
        },
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: 'call-delayed',
          toolCallName: 'delayedTool',
          parentMessageId: 'message-cancelled',
          timestamp: 1_700_000_013_005,
        },
        {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: 'call-delayed',
          delta: '{"value":"too late"}',
          timestamp: 1_700_000_013_006,
        },
        {
          type: EventType.TOOL_CALL_END,
          toolCallId: 'call-delayed',
          timestamp: 1_700_000_013_007,
        },
        {
          type: EventType.RUN_FINISHED,
          threadId: input.threadId,
          runId: input.runId,
          timestamp: 1_700_000_013_008,
        },
      ],
      75,
    );
    const runtime = createChatRuntime({
      transport: new HttpTransport({
        baseUrl: testAimock.handle.aguiRunUrl,
        fetchImpl: createObservedFetch(observedResponses),
      }),
      system: 'Use tools only when needed.',
      tools: [tool],
      retries: 2,
    });
    teardown = runtime.start();

    runtime.sendMessage({
      role: 'user',
      content: 'Start a delayed response',
    });
    const messagesBeforeCancellation = await waitForSignal(
      runtime.messages,
      (messages) =>
        messages.some(
          (message) =>
            message.role === 'assistant' &&
            message.content === 'Accepted content.',
        ),
    );
    expect(messagesBeforeCancellation).toEqual([
      { role: 'user', content: 'Start a delayed response' },
      {
        role: 'assistant',
        content: 'Accepted content.',
        toolCalls: [],
      },
    ]);
    expect(runtime.threadId()).toBe(capturedInputs[0]?.threadId);

    runtime.stop();
    await waitForIdle(runtime);
    const messagesAfterCancellation = runtime.messages();
    expect(observedResponses).toHaveLength(1);
    const cancellationResponse = observedResponses[0];
    if (!cancellationResponse) {
      throw new Error('Expected one observed cancellation response');
    }
    const cancellation = await cancellationResponse.waitForCancel();
    await testAimock.stop();

    expect(messagesAfterCancellation).toEqual([
      { role: 'user', content: 'Start a delayed response' },
    ]);
    expect(runtime.messages()).toEqual(messagesAfterCancellation);
    expect(capturedInputs).toHaveLength(1);
    expect(cancellationResponse.cancelCount).toBe(1);
    expect(cancellationResponse.eventTypes).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
    ]);
    expect(cancellationResponse.reachedEof).toBe(false);
    expect(cancellationResponse.readCount).toBe(cancellation.readCount);
    expect(cancellation.readCount).toBeLessThan(9);
    expect(toolHandler).not.toHaveBeenCalled();
    expect(runtime.error()).toBeUndefined();
    expect(runtime.isLoading()).toBe(false);
    expect(runtime.isReceiving()).toBe(false);
    expect(runtime.isSending()).toBe(false);
    expect(runtime.isGenerating()).toBe(false);
    expect(runtime.isRunningToolCalls()).toBe(false);
  } finally {
    teardown?.();
    await testAimock?.stop();
  }
}, 10_000);

test('createChatRuntime surfaces one server run error and closes the SSE response without retrying', async () => {
  const capturedInputs: HashbrownRunInput[] = [];
  const observedResponses: ObservedResponse[] = [];
  const observedErrors: Error[] = [];
  let testAimock: TestAimock | undefined;
  let teardown: (() => void) | undefined;
  let unsubscribeError: (() => void) | undefined;

  try {
    testAimock = await startTestAimock();
    registerIdentityFixture(
      testAimock.handle.aguiMock,
      capturedInputs,
      () => true,
      (input) => [
        {
          type: EventType.RUN_STARTED,
          threadId: input.threadId,
          runId: input.runId,
          timestamp: 1_700_000_014_000,
        },
        {
          type: EventType.RUN_ERROR,
          message: 'Deterministic server failure',
          timestamp: 1_700_000_014_001,
        },
        ...createTextRunEvents(
          input,
          'message-after-error',
          ['This must not be consumed.'],
          1_700_000_014_002,
        ).slice(1),
      ],
      75,
    );
    const runtime = createChatRuntime({
      transport: new HttpTransport({
        baseUrl: testAimock.handle.aguiRunUrl,
        fetchImpl: createObservedFetch(observedResponses),
      }),
      system: 'Answer briefly.',
      retries: 2,
    });
    unsubscribeError = runtime.error.subscribe((error) => {
      if (error) {
        observedErrors.push(error);
      }
    });
    teardown = runtime.start();

    runtime.sendMessage({
      role: 'user',
      content: 'Trigger the server error',
    });
    const error = await waitForSignal(runtime.error, Boolean);
    await waitForIdle(runtime);
    expect(observedResponses).toHaveLength(1);
    const errorResponse = observedResponses[0];
    if (!errorResponse) {
      throw new Error('Expected one observed error response');
    }
    const cancellation = await errorResponse.waitForCancel();
    await testAimock.stop();

    expect(error?.message).toBe('Deterministic server failure');
    expect(observedErrors.map((value) => value.message)).toEqual([
      'Deterministic server failure',
    ]);
    expect(runtime.messages()).toEqual([
      { role: 'user', content: 'Trigger the server error' },
      { role: 'error', content: 'Deterministic server failure' },
    ]);
    expect(
      runtime.messages().filter((message) => message.role === 'error'),
    ).toHaveLength(1);
    expect(capturedInputs).toHaveLength(1);
    expect(errorResponse.response.bodyUsed).toBe(true);
    expect(errorResponse.cancelCount).toBe(1);
    expect(errorResponse.eventTypes).toEqual([
      EventType.RUN_STARTED,
      EventType.RUN_ERROR,
    ]);
    expect(errorResponse.reachedEof).toBe(false);
    expect(errorResponse.readCount).toBe(cancellation.readCount);
    expect(cancellation.readCount).toBeLessThan(7);
    expect(runtime.isLoading()).toBe(false);
    expect(runtime.isReceiving()).toBe(false);
    expect(runtime.isSending()).toBe(false);
    expect(runtime.isGenerating()).toBe(false);
    expect(runtime.isRunningToolCalls()).toBe(false);
  } finally {
    unsubscribeError?.();
    teardown?.();
    await testAimock?.stop();
  }
}, 10_000);

test('createChatRuntime executes and continues an AG-UI tool call over real SSE', async () => {
  const handlerStarted = createDeferred<void>();
  const handlerResult = createDeferred<{
    city: string;
    temperatureC: number;
    condition: string;
  }>();
  const responseObserved = createDeferred<ObservedResponse>();
  const secondRequestCaptured = createDeferred<void>();
  const trace: string[] = [];
  const toolHandler = jest.fn(async ({ city }: { city: string }) => {
    trace.push('handler-started');
    handlerStarted.resolve(undefined);

    const result = await handlerResult.promise;

    trace.push('handler-resolved');
    return { ...result, city };
  });
  const tool: Chat.Tool<
    'getWeather',
    { city: string },
    { city: string; temperatureC: number; condition: string }
  > = {
    name: 'getWeather',
    description: 'Get weather for a city.',
    schema: s.object('weather lookup', {
      city: s.string('city name'),
    }),
    handler: toolHandler,
  };
  const capturedInputs: HashbrownRunInput[] = [];
  const observedResponses: ObservedResponse[] = [];
  let testAimock: TestAimock | undefined;
  let teardown: (() => void) | undefined;

  try {
    testAimock = await startTestAimock();
    registerIdentityFixture(
      testAimock.handle.aguiMock,
      capturedInputs,
      () => true,
      (requestInput, requestIndex) => {
        if (requestIndex === 1) {
          trace.push('second-request');
          secondRequestCaptured.resolve(undefined);
        }

        return requestIndex === 0
          ? [
              {
                type: EventType.RUN_STARTED,
                threadId: requestInput.threadId,
                runId: requestInput.runId,
                timestamp: 1_700_000_002_000,
              },
              {
                type: EventType.TOOL_CALL_START,
                toolCallId: 'call-weather',
                toolCallName: 'getWeather',
                parentMessageId: `${requestInput.threadId}:message:1`,
                timestamp: 1_700_000_002_001,
              },
              {
                type: EventType.TOOL_CALL_ARGS,
                toolCallId: 'call-weather',
                delta: '{"city":"Paris"}',
                timestamp: 1_700_000_002_002,
              },
              {
                type: EventType.TOOL_CALL_END,
                toolCallId: 'call-weather',
                timestamp: 1_700_000_002_003,
              },
              {
                type: EventType.RUN_FINISHED,
                threadId: requestInput.threadId,
                runId: requestInput.runId,
                timestamp: 1_700_000_002_004,
              },
            ]
          : [
              {
                type: EventType.RUN_STARTED,
                threadId: requestInput.threadId,
                runId: requestInput.runId,
                timestamp: 1_700_000_003_000,
              },
              {
                type: EventType.TEXT_MESSAGE_START,
                messageId: 'message-weather-final',
                role: 'assistant',
                timestamp: 1_700_000_003_001,
              },
              {
                type: EventType.TEXT_MESSAGE_CONTENT,
                messageId: 'message-weather-final',
                delta: 'It is 21 C and sunny in Paris.',
                timestamp: 1_700_000_003_002,
              },
              {
                type: EventType.TEXT_MESSAGE_END,
                messageId: 'message-weather-final',
                timestamp: 1_700_000_003_003,
              },
              {
                type: EventType.RUN_FINISHED,
                threadId: requestInput.threadId,
                runId: requestInput.runId,
                timestamp: 1_700_000_003_004,
              },
            ];
      },
      75,
    );
    const runtime = createChatRuntime({
      transport: new HttpTransport({
        baseUrl: testAimock.handle.aguiRunUrl,
        fetchImpl: createObservedFetch(
          observedResponses,
          responseObserved.resolve,
        ),
      }),
      system: 'Answer weather questions with the available tool.',
      tools: [tool],
      threadId: 'thread-tool',
    });
    teardown = runtime.start();
    await Promise.resolve();

    runtime.sendMessage({
      role: 'user',
      content: 'What is the weather in Paris?',
    });

    const firstResponse = await waitForHandshake(
      responseObserved.promise,
      'first tool response',
    );
    await firstResponse.waitForEvent(EventType.TOOL_CALL_ARGS);

    trace.push('tool-args-observed');
    expect(firstResponse.eventTypes).not.toContain(EventType.TOOL_CALL_END);
    expect(toolHandler).not.toHaveBeenCalled();

    await waitForHandshake(handlerStarted.promise, 'tool handler start');

    expect(firstResponse.eventTypes).toContain(EventType.TOOL_CALL_END);
    expect(toolHandler).toHaveBeenCalledTimes(1);
    expect(capturedInputs).toHaveLength(1);
    expect(trace).toEqual(['tool-args-observed', 'handler-started']);

    handlerResult.resolve({
      city: 'Paris',
      temperatureC: 21,
      condition: 'sunny',
    });
    await waitForHandshake(
      secondRequestCaptured.promise,
      'tool continuation request',
    );

    expect(trace).toEqual([
      'tool-args-observed',
      'handler-started',
      'handler-resolved',
      'second-request',
    ]);

    const messages = await waitForSignal(runtime.messages, (value) =>
      value.some(
        (message) =>
          message.role === 'assistant' &&
          message.content === 'It is 21 C and sunny in Paris.',
      ),
    );
    await waitForIdle(runtime);

    expect(messages).toEqual([
      { role: 'user', content: 'What is the weather in Paris?' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            role: 'tool',
            status: 'done',
            name: 'getWeather',
            args: { city: 'Paris' },
            result: {
              status: 'fulfilled',
              value: {
                city: 'Paris',
                temperatureC: 21,
                condition: 'sunny',
              },
            },
            toolCallId: 'call-weather',
          },
        ],
      },
      {
        role: 'assistant',
        content: 'It is 21 C and sunny in Paris.',
        toolCalls: [],
      },
    ]);
    expect(runtime.error()).toBeUndefined();
    expect(runtime.isLoading()).toBe(false);
    expect(runtime.isReceiving()).toBe(false);
    expect(runtime.isSending()).toBe(false);
    expect(runtime.isGenerating()).toBe(false);
    expect(runtime.isRunningToolCalls()).toBe(false);
    expect(runtime.lastAssistantMessage()).toEqual(messages[2]);
    expect(toolHandler).toHaveBeenCalledTimes(1);
    expect(toolHandler).toHaveBeenCalledWith(
      { city: 'Paris' },
      expect.any(AbortSignal),
    );
    expect(capturedInputs).toHaveLength(2);
    expect(capturedInputs[0]?.threadId).toBe('thread-tool');
    expect(capturedInputs[1]?.threadId).toBe('thread-tool');
    expect(capturedInputs[0]?.runId).not.toBe(capturedInputs[1]?.runId);
    const firstRequestMessages = capturedInputs[0]?.messages;
    const continuationMessages = capturedInputs[1]?.messages;
    if (!firstRequestMessages || !continuationMessages) {
      throw new Error('Expected captured AG-UI request messages.');
    }
    const [systemMessage, userMessage] = firstRequestMessages;
    const toolResultMessage = continuationMessages[3];
    if (!systemMessage || !userMessage || toolResultMessage?.role !== 'tool') {
      throw new Error('Expected system, user, and tool result messages.');
    }
    const canonicalIds = continuationMessages.flatMap((message) => [
      message.id,
      ...(message.role === 'assistant'
        ? (message.toolCalls ?? []).map((toolCall) => toolCall.id)
        : []),
    ]);

    expect(canonicalIds.every((id) => id.length > 0)).toBe(true);
    expect(new Set(canonicalIds).size).toBe(canonicalIds.length);
    expect(continuationMessages.slice(0, firstRequestMessages.length)).toEqual(
      firstRequestMessages,
    );
    expect(firstRequestMessages).toEqual([
      {
        id: systemMessage.id,
        role: 'system',
        content: 'Answer weather questions with the available tool.',
      },
      {
        id: userMessage.id,
        role: 'user',
        content: 'What is the weather in Paris?',
      },
    ]);
    expect(continuationMessages).toEqual([
      ...firstRequestMessages,
      {
        id: 'thread-tool:message:1',
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'call-weather',
            type: 'function',
            function: {
              name: 'getWeather',
              arguments: '{"city":"Paris"}',
            },
          },
        ],
      },
      {
        id: toolResultMessage.id,
        role: 'tool',
        toolCallId: 'call-weather',
        content: '{"city":"Paris","temperatureC":21,"condition":"sunny"}',
      },
    ]);
  } finally {
    teardown?.();
    await testAimock?.stop();
  }
}, 10_000);
