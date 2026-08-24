import { type AGUIEvent, EventType } from '@ag-ui/core';
import type {
  AGUIMock,
  AGUIRunAgentInput,
  AGUIEvent as AimockAGUIEvent,
} from '@copilotkit/aimock/agui';
import {
  Chat,
  createHttpTransport,
  fryHashbrown,
  type Hashbrown,
  HttpTransport,
  s,
  type StateSignal,
  type TransportRequest,
  type TransportResponse,
  ɵui,
} from '@hashbrownai/core';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AimockHandle, startAimock } from './aimock-runner';

type HashbrownRunInput = NonNullable<TransportRequest['input']>;

interface TestAimock {
  readonly handle: AimockHandle;
  stop(): Promise<void>;
}

interface ObservedResponse {
  readonly response: Response;
  readonly bodyClosed: Promise<void>;
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
  let stopped = false;

  return {
    handle,
    async stop() {
      if (stopped) {
        return;
      }

      stopped = true;
      await handle.stop();
      rmSync(workDir, { recursive: true, force: true });
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
  hashbrown: Pick<Hashbrown<unknown, Chat.AnyTool>, 'isLoading'>,
): Promise<void> {
  await waitForSignal(hashbrown.isLoading, (value) => !value);
  await Promise.resolve();
}

async function drainHashbrownEffects(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
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
): typeof fetch {
  return async (input, init) => {
    const response = await fetch(input, init);
    if (!response.body) {
      throw new Error('Expected an HTTP response body');
    }

    const reader = response.body.getReader();
    const bodyClosed = reader.closed.then(
      () => undefined,
      () => undefined,
    );
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const result = await reader.read();
          if (result.done) {
            controller.close();
            return;
          }

          controller.enqueue(result.value);
        } catch (error) {
          controller.error(error);
        }
      },
      async cancel(reason) {
        await reader.cancel(reason);
      },
    });

    observedResponses.push({ response, bodyClosed });
    return new Response(body, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
  };
}

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

test('fryHashbrown adopts a generated thread identity and reuses it on the next text run', async () => {
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
    const hashbrown = fryHashbrown({
      model: {
        name: 'aimock-text-model',
        transport: createHttpTransport({
          baseUrl: testAimock.handle.aguiRunUrl,
        }),
      },
      system: 'Answer briefly.',
      retries: 0,
    });
    teardown = hashbrown.sizzle();

    await drainHashbrownEffects();

    expect(capturedInputs).toEqual([]);
    expect(hashbrown.threadId()).toBeUndefined();

    hashbrown.sendMessage({ role: 'user', content: 'First turn' });
    await waitForSignal(
      hashbrown.lastAssistantMessage,
      (message) => message?.content === 'First response.',
    );
    await waitForIdle(hashbrown);

    const generatedThreadId = capturedInputs[0]?.threadId;
    expect(generatedThreadId).toEqual(expect.any(String));
    expect(hashbrown.threadId()).toBe(generatedThreadId);

    hashbrown.sendMessage({ role: 'user', content: 'Second turn' });
    const secondResponse = await waitForSignal(
      hashbrown.lastAssistantMessage,
      (message) => message?.content === 'Second response.',
    );
    await waitForIdle(hashbrown);

    expect(secondResponse).toEqual({
      role: 'assistant',
      content: 'Second response.',
      toolCalls: [],
    });
    expect(capturedInputs).toHaveLength(2);
    expect(capturedInputs[1]?.threadId).toBe(generatedThreadId);
    expect(capturedInputs[0]?.runId).not.toBe(capturedInputs[1]?.runId);
    expect(hashbrown.threadId()).toBe(generatedThreadId);
    expect(hashbrown.error()).toBeUndefined();
  } finally {
    teardown?.();
    await testAimock?.stop();
  }
}, 10_000);

test('fryHashbrown resolves chunked structured output and sends the response schema in hashbrown metadata', async () => {
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
    const hashbrown = fryHashbrown({
      model: {
        name: 'aimock-structured-model',
        transport: createHttpTransport({
          baseUrl: testAimock.handle.aguiRunUrl,
        }),
        capabilities: { structured: true },
      },
      system: 'Return a structured answer.',
      responseSchema,
      retries: 0,
    });
    unsubscribeContent = hashbrown.lastAssistantMessage.subscribe((message) => {
      if (message) {
        observedContent.push(message.content);
      }
    });
    teardown = hashbrown.sizzle();

    hashbrown.sendMessage({ role: 'user', content: 'Count the results' });
    const assistant = await waitForSignal(
      hashbrown.lastAssistantMessage,
      (message) =>
        message?.content?.answer === 'deterministic' &&
        message.content.count === 2,
    );
    await waitForIdle(hashbrown);

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
    expect(hashbrown.error()).toBeUndefined();
  } finally {
    unsubscribeContent?.();
    teardown?.();
    await testAimock?.stop();
  }
}, 10_000);

test('fryHashbrown resolves validated generative UI state and marks the request as UI', async () => {
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
    const hashbrown = fryHashbrown({
      model: {
        name: 'aimock-ui-model',
        transport: createHttpTransport({
          baseUrl: testAimock.handle.aguiRunUrl,
        }),
        capabilities: { structured: true, ui: true },
      },
      system: 'Return the requested UI.',
      responseSchema,
      ui: true,
      retries: 0,
    });
    teardown = hashbrown.sizzle();

    hashbrown.sendMessage({ role: 'user', content: 'Show status' });
    const partialAssistant = await waitForSignal(
      hashbrown.lastAssistantMessage,
      (message) => message?.content?.ui?.length === 1,
    );
    expect(
      partialAssistant?.content?.ui[0]?.status?.props?.partialValue,
    ).toEqual({ title: 'Re' });

    await waitForIdle(hashbrown);
    const assistant = hashbrown.lastAssistantMessage();

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
    expect(hashbrown.error()).toBeUndefined();
  } finally {
    teardown?.();
    await testAimock?.stop();
  }
}, 10_000);

test('fryHashbrown cancels a delayed SSE run after the first content without later mutations or continuation', async () => {
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
    const hashbrown = fryHashbrown({
      model: {
        name: 'aimock-cancellation-model',
        transport: new HttpTransport({
          baseUrl: testAimock.handle.aguiRunUrl,
          fetchImpl: createObservedFetch(observedResponses),
        }),
        capabilities: { tools: true },
      },
      system: 'Use tools only when needed.',
      tools: [tool],
      retries: 2,
    });
    teardown = hashbrown.sizzle();

    hashbrown.sendMessage({
      role: 'user',
      content: 'Start a delayed response',
    });
    const messagesBeforeCancellation = await waitForSignal(
      hashbrown.messages,
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
    expect(hashbrown.threadId()).toBe(capturedInputs[0]?.threadId);

    hashbrown.stop();
    await waitForIdle(hashbrown);
    const messagesAfterCancellation = hashbrown.messages();
    expect(observedResponses).toHaveLength(1);
    const cancellationResponse = observedResponses[0];
    if (!cancellationResponse) {
      throw new Error('Expected one observed cancellation response');
    }
    await cancellationResponse.bodyClosed;
    await testAimock.stop();

    expect(messagesAfterCancellation).toEqual([
      { role: 'user', content: 'Start a delayed response' },
    ]);
    expect(hashbrown.messages()).toEqual(messagesAfterCancellation);
    expect(capturedInputs).toHaveLength(1);
    expect(toolHandler).not.toHaveBeenCalled();
    expect(hashbrown.error()).toBeUndefined();
    expect(hashbrown.isLoading()).toBe(false);
    expect(hashbrown.isReceiving()).toBe(false);
    expect(hashbrown.isSending()).toBe(false);
    expect(hashbrown.isGenerating()).toBe(false);
    expect(hashbrown.isRunningToolCalls()).toBe(false);
  } finally {
    teardown?.();
    await testAimock?.stop();
  }
}, 10_000);

test('fryHashbrown surfaces one server run error and closes the SSE response without retrying', async () => {
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
    const hashbrown = fryHashbrown({
      model: {
        name: 'aimock-error-model',
        transport: new HttpTransport({
          baseUrl: testAimock.handle.aguiRunUrl,
          fetchImpl: createObservedFetch(observedResponses),
        }),
      },
      system: 'Answer briefly.',
      retries: 2,
    });
    unsubscribeError = hashbrown.error.subscribe((error) => {
      if (error) {
        observedErrors.push(error);
      }
    });
    teardown = hashbrown.sizzle();

    hashbrown.sendMessage({
      role: 'user',
      content: 'Trigger the server error',
    });
    const error = await waitForSignal(hashbrown.error, Boolean);
    await waitForIdle(hashbrown);
    expect(observedResponses).toHaveLength(1);
    const errorResponse = observedResponses[0];
    if (!errorResponse) {
      throw new Error('Expected one observed error response');
    }
    await errorResponse.bodyClosed;
    await testAimock.stop();

    expect(error?.message).toBe('Deterministic server failure');
    expect(observedErrors.map((value) => value.message)).toEqual([
      'Deterministic server failure',
    ]);
    expect(hashbrown.messages()).toEqual([
      { role: 'user', content: 'Trigger the server error' },
      { role: 'error', content: 'Deterministic server failure' },
    ]);
    expect(
      hashbrown.messages().filter((message) => message.role === 'error'),
    ).toHaveLength(1);
    expect(capturedInputs).toHaveLength(1);
    expect(observedResponses[0]?.response.bodyUsed).toBe(true);
    expect(hashbrown.isLoading()).toBe(false);
    expect(hashbrown.isReceiving()).toBe(false);
    expect(hashbrown.isSending()).toBe(false);
    expect(hashbrown.isGenerating()).toBe(false);
    expect(hashbrown.isRunningToolCalls()).toBe(false);
  } finally {
    unsubscribeError?.();
    teardown?.();
    await testAimock?.stop();
  }
}, 10_000);

test('fryHashbrown executes and continues an AG-UI tool call over real SSE', async () => {
  const toolHandler = jest.fn(async ({ city }: { city: string }) => ({
    city,
    temperatureC: 21,
    condition: 'sunny',
  }));
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
  let testAimock: TestAimock | undefined;
  let teardown: (() => void) | undefined;

  try {
    testAimock = await startTestAimock();
    registerIdentityFixture(
      testAimock.handle.aguiMock,
      capturedInputs,
      () => true,
      (requestInput, requestIndex) =>
        requestIndex === 0
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
            ],
    );
    const hashbrown = fryHashbrown({
      model: {
        name: 'aimock-tool-model',
        transport: createHttpTransport({
          baseUrl: testAimock.handle.aguiRunUrl,
        }),
        capabilities: { tools: true },
      },
      system: 'Answer weather questions with the available tool.',
      tools: [tool],
      threadId: 'thread-tool',
    });
    teardown = hashbrown.sizzle();
    await Promise.resolve();

    hashbrown.sendMessage({
      role: 'user',
      content: 'What is the weather in Paris?',
    });
    const messages = await waitForSignal(hashbrown.messages, (value) =>
      value.some(
        (message) =>
          message.role === 'assistant' &&
          message.content === 'It is 21 C and sunny in Paris.',
      ),
    );
    await waitForIdle(hashbrown);

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
    expect(hashbrown.error()).toBeUndefined();
    expect(hashbrown.isLoading()).toBe(false);
    expect(hashbrown.isReceiving()).toBe(false);
    expect(hashbrown.isSending()).toBe(false);
    expect(hashbrown.isGenerating()).toBe(false);
    expect(hashbrown.isRunningToolCalls()).toBe(false);
    expect(hashbrown.lastAssistantMessage()).toEqual(messages[2]);
    expect(toolHandler).toHaveBeenCalledTimes(1);
    expect(toolHandler).toHaveBeenCalledWith(
      { city: 'Paris' },
      expect.any(AbortSignal),
    );
    expect(capturedInputs).toHaveLength(2);
    expect(capturedInputs[0]?.threadId).toBe('thread-tool');
    expect(capturedInputs[1]?.threadId).toBe('thread-tool');
    expect(capturedInputs[0]?.runId).not.toBe(capturedInputs[1]?.runId);
    expect(capturedInputs[0]?.messages).toEqual([
      {
        id: 'thread-tool:system',
        role: 'system',
        content: 'Answer weather questions with the available tool.',
      },
      {
        id: 'thread-tool:message:0',
        role: 'user',
        content: 'What is the weather in Paris?',
      },
    ]);
    const firstRequestMessages = capturedInputs[0]?.messages;
    expect(firstRequestMessages).toBeDefined();
    expect(capturedInputs[1]?.messages).toEqual([
      ...(firstRequestMessages ?? []),
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
        id: 'call-weather',
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
