import { type AGUIEvent, EventType } from '@ag-ui/core';
import { type TransportRequest } from './transport';
import { ExperimentalChromeLocalTransport } from './experimental-chrome-local-transport';

const responseSchema = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
  },
  required: ['answer'],
};

type RunInput = NonNullable<TransportRequest['input']>;

function createRequest(
  inputOverrides: Partial<RunInput> = {},
  requestOverrides: Partial<Omit<TransportRequest, 'input'>> = {},
): TransportRequest {
  const input: RunInput = {
    threadId: 'thread-1',
    runId: 'run-1',
    messages: [
      { id: 'system-1', role: 'system', content: 'You are concise.' },
      { id: 'user-1', role: 'user', content: 'Hello' },
    ],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
    hashbrown: { responseSchema },
    ...inputOverrides,
  };

  return {
    input,
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: 'request-1',
    ...requestOverrides,
  };
}

async function withLanguageModel<T>(
  languageModel: unknown,
  run: () => Promise<T>,
): Promise<T> {
  const global = globalThis as { LanguageModel?: unknown };
  const hadLanguageModel = Object.hasOwn(global, 'LanguageModel');
  const previousLanguageModel = global.LanguageModel;

  if (languageModel === undefined) {
    delete global.LanguageModel;
  } else {
    global.LanguageModel = languageModel;
  }

  try {
    return await run();
  } finally {
    if (hadLanguageModel) {
      global.LanguageModel = previousLanguageModel;
    } else {
      delete global.LanguageModel;
    }
  }
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

function createTextStream(chunks: string[]): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

function createDeferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

function createReaderStream(options: {
  read: () => Promise<ReadableStreamReadResult<string>>;
  cancel?: (reason?: unknown) => Promise<void>;
}) {
  const reader = {
    read: jest.fn(options.read),
    cancel: jest.fn(options.cancel ?? (async () => undefined)),
    releaseLock: jest.fn(),
  };
  const stream = {
    getReader: jest.fn(() => reader),
  } as unknown as ReadableStream<string>;

  return { stream, reader };
}

function createSession(stream: ReadableStream<string>) {
  return {
    prompt: jest.fn(),
    promptStreaming: jest.fn().mockResolvedValue(stream),
    destroy: jest.fn(),
  };
}

function requireDispose(response: {
  dispose?: () => void | Promise<void>;
}): () => Promise<void> {
  if (!response.dispose) {
    throw new Error('Expected response disposer');
  }

  return async () => response.dispose?.();
}

function expectNoRunError(events: AGUIEvent[]): void {
  expect(events.map((event) => event.type)).not.toContain(EventType.RUN_ERROR);
}

async function flushTasks(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function settleWithinTask<T>(promise: Promise<T>) {
  return Promise.race([
    promise.then(
      (value) => ({ status: 'fulfilled' as const, value }),
      (reason: unknown) => ({ status: 'rejected' as const, reason }),
    ),
    new Promise<{ status: 'pending' }>((resolve) => {
      setImmediate(() => resolve({ status: 'pending' }));
    }),
  ]);
}

test('throws PLATFORM_UNSUPPORTED when the Prompt API is missing', async () => {
  await withLanguageModel(undefined, async () => {
    const transport = new ExperimentalChromeLocalTransport({});

    const sendPromise = transport.send(createRequest());

    await expect(sendPromise).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
    });
  });
});

test('throws when AG-UI run input is missing', async () => {
  await withLanguageModel(undefined, async () => {
    const transport = new ExperimentalChromeLocalTransport({
      createSession: async () => createSession(createTextStream([])),
    });
    const request = {
      ...createRequest(),
      input: undefined,
    } as unknown as TransportRequest;

    const sendPromise = transport.send(request);

    await expect(sendPromise).rejects.toMatchObject({
      message: 'Missing AG-UI run input',
      retryable: false,
    });
  });
});

test('retries session creation after a cached creation rejects', async () => {
  await withLanguageModel(undefined, async () => {
    const createError = new Error('create failed');
    const session = createSession(createTextStream(['retry succeeded']));
    const create = jest
      .fn()
      .mockRejectedValueOnce(createError)
      .mockResolvedValueOnce(session);
    const transport = new ExperimentalChromeLocalTransport({
      createSession: create,
    });

    const firstSendPromise = transport.send(
      createRequest({ runId: 'run-first' }),
    );

    await expect(firstSendPromise).rejects.toBe(createError);

    const response = await transport.send(
      createRequest({ runId: 'run-second' }),
    );
    const events = await collectEvents(response.events);

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: EventType.TEXT_MESSAGE_CONTENT,
          delta: 'retry succeeded',
        }),
      ]),
    );
    expect(create).toHaveBeenCalledTimes(2);
    expect(session.destroy).toHaveBeenCalledTimes(1);
  });
});

test('emits the exact local AG-UI event sequence and identities', async () => {
  await withLanguageModel(undefined, async () => {
    const session = createSession(createTextStream(['Hello', ' world']));
    const transport = new ExperimentalChromeLocalTransport({
      createSession: async () => session,
    });
    const request = createRequest();
    const input = request.input as RunInput;

    const response = await transport.send(request);
    const events = await collectEvents(response.events);

    expect(events).toEqual([
      {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      },
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId: `${input.runId}:message`,
        role: 'assistant',
      },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: `${input.runId}:message`,
        delta: 'Hello',
      },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: `${input.runId}:message`,
        delta: ' world',
      },
      {
        type: EventType.TEXT_MESSAGE_END,
        messageId: `${input.runId}:message`,
      },
      {
        type: EventType.RUN_FINISHED,
        threadId: input.threadId,
        runId: input.runId,
      },
    ] satisfies AGUIEvent[]);
    expect(session.destroy).toHaveBeenCalledTimes(1);
  });
});

test('accepts a synchronous Prompt API stream', async () => {
  const stream = createTextStream(['synchronous']);
  const session = {
    prompt: jest.fn(),
    promptStreaming: jest.fn(() => stream),
    destroy: jest.fn(),
  };
  const languageModel = {
    create: jest.fn().mockResolvedValue(session),
  };

  await withLanguageModel(languageModel, async () => {
    const transport = new ExperimentalChromeLocalTransport({});

    const response = await transport.send(createRequest());
    const events = await collectEvents(response.events);

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: EventType.TEXT_MESSAGE_CONTENT,
          delta: 'synchronous',
        }),
      ]),
    );
    expect(session.destroy).toHaveBeenCalledTimes(1);
  });
});

test('maps system, user, and assistant AG-UI messages to Prompt API messages', async () => {
  await withLanguageModel(undefined, async () => {
    const session = createSession(createTextStream([]));
    const transport = new ExperimentalChromeLocalTransport({
      createSession: async () => session,
    });
    const request = createRequest({
      messages: [
        { id: 'system-1', role: 'system', content: 'System prompt' },
        { id: 'user-1', role: 'user', content: 'User prompt' },
        { id: 'assistant-1', role: 'assistant', content: 'Prior answer' },
      ],
    });

    const response = await transport.send(request);
    await collectEvents(response.events);

    expect(session.promptStreaming).toHaveBeenCalledWith(
      [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'User prompt' },
        { role: 'assistant', content: 'Prior answer' },
      ],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});

test('rejects AG-UI tool declarations as FEATURE_UNSUPPORTED', async () => {
  await withLanguageModel(undefined, async () => {
    const create = jest.fn(async () => createSession(createTextStream([])));
    const transport = new ExperimentalChromeLocalTransport({
      createSession: create,
    });
    const request = createRequest({
      tools: [
        {
          name: 'lookup',
          description: 'Looks up a value',
          parameters: { type: 'object', properties: {} },
        },
      ],
    });

    const sendPromise = transport.send(request);

    await expect(sendPromise).rejects.toMatchObject({
      code: 'FEATURE_UNSUPPORTED',
    });
    expect(create).not.toHaveBeenCalled();
  });
});

test('skips tool results and unsupported internal message roles', async () => {
  await withLanguageModel(undefined, async () => {
    const session = createSession(createTextStream([]));
    const transport = new ExperimentalChromeLocalTransport({
      createSession: async () => session,
    });
    const request = createRequest({
      messages: [
        { id: 'system-1', role: 'system', content: 'System prompt' },
        { id: 'developer-1', role: 'developer', content: 'Developer prompt' },
        { id: 'user-1', role: 'user', content: 'User prompt' },
        {
          id: 'activity-1',
          role: 'activity',
          activityType: 'status',
          content: { state: 'working' },
        },
        { id: 'reasoning-1', role: 'reasoning', content: 'Reasoning' },
        {
          id: 'tool-1',
          role: 'tool',
          toolCallId: 'call-1',
          content: 'Tool result',
        },
        { id: 'assistant-1', role: 'assistant', content: 'Prior answer' },
      ],
    });

    const response = await transport.send(request);
    await collectEvents(response.events);

    expect(session.promptStreaming).toHaveBeenCalledWith(
      [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'User prompt' },
        { role: 'assistant', content: 'Prior answer' },
      ],
      expect.any(Object),
    );
  });
});

test('maps the Hashbrown response schema to the Prompt API constraint', async () => {
  await withLanguageModel(undefined, async () => {
    const session = createSession(createTextStream([]));
    const transport = new ExperimentalChromeLocalTransport({
      createSession: async () => session,
    });
    const request = createRequest({ hashbrown: { responseSchema } });

    const response = await transport.send(request);
    await collectEvents(response.events);

    expect(session.promptStreaming).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ responseConstraint: responseSchema }),
    );
  });
});

test('does not add Hashbrown UI instructions to the text prompt', async () => {
  await withLanguageModel(undefined, async () => {
    const session = createSession(createTextStream([]));
    const transport = new ExperimentalChromeLocalTransport({
      createSession: async () => session,
    });
    const request = createRequest({
      hashbrown: { responseSchema, ui: true },
    });

    const response = await transport.send(request);
    await collectEvents(response.events);

    expect(session.promptStreaming).toHaveBeenCalledWith(
      [
        { role: 'system', content: 'You are concise.' },
        { role: 'user', content: 'Hello' },
      ],
      expect.any(Object),
    );
  });
});

test('preserves Chrome transport metadata', async () => {
  await withLanguageModel(undefined, async () => {
    const session = createSession(createTextStream([]));
    const transport = new ExperimentalChromeLocalTransport({
      createSession: async () => session,
    });

    const response = await transport.send(createRequest());

    try {
      expect(response.metadata).toEqual({
        source: 'chrome-prompt-api',
        status: 'available',
        promptMode: 'promptStreaming',
        outputLanguage: 'en',
      });
    } finally {
      await requireDispose(response)();
    }
  });
});

test('calls Chrome availability with the language model receiver', async () => {
  const session = createSession(createTextStream([]));
  const create = jest.fn().mockResolvedValue(session);
  const availability = jest.fn(function (this: unknown) {
    expect(this).toBe(languageModel);
    return Promise.resolve({ status: 'available' as const });
  });
  const languageModel = { availability, create };

  await withLanguageModel(languageModel, async () => {
    const transport = new ExperimentalChromeLocalTransport({});

    const response = await transport.send(createRequest());
    const events = await collectEvents(response.events);

    expect(events).toEqual(expect.any(Array));
    expect(availability).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

test.each(['resolve', 'reject'] as const)(
  'aborts while Chrome availability is pending and owns a late %s',
  async (lateSettlement) => {
    const availabilityResult = createDeferred<{ status: 'available' }>();
    const availability = jest.fn(() => availabilityResult.promise);
    const create = jest.fn(async () => createSession(createTextStream([])));
    const controller = new AbortController();

    await withLanguageModel({ availability, create }, async () => {
      const transport = new ExperimentalChromeLocalTransport({});
      const sendPromise = transport.send(
        createRequest({}, { signal: controller.signal }),
      );
      await flushTasks();

      controller.abort();

      await expect(settleWithinTask(sendPromise)).resolves.toMatchObject({
        status: 'rejected',
        reason: { code: 'PROMPT_API_ABORTED', retryable: false },
      });

      if (lateSettlement === 'resolve') {
        availabilityResult.resolve({ status: 'available' });
      } else {
        availabilityResult.reject(new Error('late availability failure'));
      }
      await flushTasks();

      expect(create).not.toHaveBeenCalled();
    });
  },
);

test('aborts while the Chrome download callback is pending', async () => {
  const downloadResult = createDeferred<void>();
  const downloadRequired = jest.fn(() => downloadResult.promise);
  const create = jest.fn(async () => createSession(createTextStream([])));
  const controller = new AbortController();
  const languageModel = {
    availability: jest.fn().mockResolvedValue({ status: 'downloading' }),
    create,
  };

  await withLanguageModel(languageModel, async () => {
    const transport = new ExperimentalChromeLocalTransport({
      events: { downloadRequired },
    });
    const sendPromise = transport.send(
      createRequest({}, { signal: controller.signal }),
    );
    await flushTasks();

    controller.abort();

    await expect(settleWithinTask(sendPromise)).resolves.toMatchObject({
      status: 'rejected',
      reason: { code: 'PROMPT_API_ABORTED', retryable: false },
    });
    downloadResult.resolve();
    await flushTasks();

    expect(downloadRequired).toHaveBeenCalledWith('downloading');
    expect(create).not.toHaveBeenCalled();
  });
});

test('does not check Chrome availability or create a session after abort', async () => {
  const availability = jest.fn().mockResolvedValue({ status: 'available' });
  const create = jest.fn(async () => createSession(createTextStream([])));
  const controller = new AbortController();
  controller.abort();

  await withLanguageModel({ availability, create }, async () => {
    const transport = new ExperimentalChromeLocalTransport({});

    const sendPromise = transport.send(
      createRequest({}, { signal: controller.signal }),
    );

    await expect(sendPromise).rejects.toMatchObject({
      code: 'PROMPT_API_ABORTED',
      retryable: false,
    });
    expect(availability).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

test('aborts pending custom session creation and destroys a late session once', async () => {
  await withLanguageModel(undefined, async () => {
    const abortController = new AbortController();
    const creation = createDeferred<ReturnType<typeof createSession>>();
    const session = createSession(createTextStream([]));
    const create = jest.fn(() => creation.promise);
    const transport = new ExperimentalChromeLocalTransport({
      createSession: create,
    });
    const sendPromise = transport.send(
      createRequest({}, { signal: abortController.signal }),
    );
    await flushTasks();

    abortController.abort('stop');
    const abortOutcome = await settleWithinTask(sendPromise);
    creation.resolve(session);
    const finalOutcome = await sendPromise.then(
      (response) => ({ status: 'fulfilled' as const, response }),
      (reason: unknown) => ({ status: 'rejected' as const, reason }),
    );
    if (finalOutcome.status === 'fulfilled') {
      await requireDispose(finalOutcome.response)();
    }
    await flushTasks();

    expect(abortOutcome).toMatchObject({
      status: 'rejected',
      reason: {
        code: 'PROMPT_API_ABORTED',
        retryable: false,
        message: 'Prompt aborted',
      },
    });
    expect(finalOutcome).toMatchObject({
      status: 'rejected',
      reason: { code: 'PROMPT_API_ABORTED' },
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(session.destroy).toHaveBeenCalledTimes(1);
  });
});

test('owns a late native session creation rejection after request abort', async () => {
  const abortController = new AbortController();
  const creation = createDeferred<ReturnType<typeof createSession>>();
  const createError = new Error('late create failed');
  const create = jest.fn(() => creation.promise);
  const sessionState = jest.fn();
  const unhandledRejections: unknown[] = [];
  const onUnhandledRejection = (reason: unknown) => {
    unhandledRejections.push(reason);
  };

  await withLanguageModel({ create }, async () => {
    const transport = new ExperimentalChromeLocalTransport({
      events: { sessionState },
    });
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      const sendPromise = transport.send(
        createRequest({}, { signal: abortController.signal }),
      );
      await flushTasks();

      abortController.abort('stop');
      const abortOutcome = await settleWithinTask(sendPromise);
      creation.reject(createError);
      const finalOutcome = await sendPromise.then(
        () => ({ status: 'fulfilled' as const }),
        (reason: unknown) => ({ status: 'rejected' as const, reason }),
      );
      await flushTasks();

      expect(abortOutcome).toMatchObject({
        status: 'rejected',
        reason: { code: 'PROMPT_API_ABORTED', retryable: false },
      });
      expect(finalOutcome).toMatchObject({
        status: 'rejected',
        reason: { code: 'PROMPT_API_ABORTED' },
      });
      expect(sessionState).toHaveBeenCalledWith('error');
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.removeListener('unhandledRejection', onUnhandledRejection);
    }
  });
});

test('transport destruction tracks teardown of a late abandoned session', async () => {
  await withLanguageModel(undefined, async () => {
    const abortController = new AbortController();
    const creation = createDeferred<ReturnType<typeof createSession>>();
    const destroyResult = createDeferred<void>();
    const destroyStarted = createDeferred<void>();
    const destroyError = new Error('late destroy failed');
    const session = {
      ...createSession(createTextStream([])),
      destroy: jest.fn(() => {
        destroyStarted.resolve();
        return destroyResult.promise;
      }),
    };
    const transport = new ExperimentalChromeLocalTransport({
      createSession: () => creation.promise,
    });
    const sendPromise = transport.send(
      createRequest({}, { signal: abortController.signal }),
    );
    await flushTasks();
    abortController.abort('stop');
    await expect(sendPromise).rejects.toMatchObject({
      code: 'PROMPT_API_ABORTED',
    });

    const transportDestroy = transport.destroy();
    const beforeCreation = await settleWithinTask(transportDestroy);
    creation.resolve(session);
    await destroyStarted.promise;
    const duringTeardown = await settleWithinTask(transportDestroy);
    destroyResult.reject(destroyError);

    expect(beforeCreation).toEqual({ status: 'pending' });
    expect(duringTeardown).toEqual({ status: 'pending' });
    await expect(transportDestroy).rejects.toBe(destroyError);
    expect(session.destroy).toHaveBeenCalledTimes(1);
  });
});

test('keeps a late session with an overlapping owner while using a replacement session', async () => {
  await withLanguageModel(undefined, async () => {
    const firstAbortController = new AbortController();
    const firstCreation = createDeferred<ReturnType<typeof createSession>>();
    const firstSession = createSession(createTextStream([]));
    const replacementSession = createSession(createTextStream([]));
    const create = jest
      .fn()
      .mockImplementationOnce(() => firstCreation.promise)
      .mockResolvedValueOnce(replacementSession);
    const transport = new ExperimentalChromeLocalTransport({
      createSession: create,
    });
    const firstSend = transport.send(
      createRequest(
        { runId: 'run-first' },
        { signal: firstAbortController.signal },
      ),
    );
    const overlappingSend = transport.send(
      createRequest({ runId: 'run-overlapping' }),
    );
    await flushTasks();

    firstAbortController.abort('stop');
    const abortOutcome = await settleWithinTask(firstSend);
    const replacementSend = transport.send(
      createRequest({ runId: 'run-replacement' }),
    );
    firstCreation.resolve(firstSession);
    const firstOutcome = await firstSend.then(
      (response) => ({ status: 'fulfilled' as const, response }),
      (reason: unknown) => ({ status: 'rejected' as const, reason }),
    );
    const overlappingResponse = await overlappingSend;
    const replacementResponse = await replacementSend;
    await flushTasks();

    expect(abortOutcome).toMatchObject({
      status: 'rejected',
      reason: { code: 'PROMPT_API_ABORTED', retryable: false },
    });
    expect(firstOutcome).toMatchObject({
      status: 'rejected',
      reason: { code: 'PROMPT_API_ABORTED' },
    });
    expect(create).toHaveBeenCalledTimes(2);
    expect(firstSession.destroy).not.toHaveBeenCalled();
    expect(replacementSession.destroy).not.toHaveBeenCalled();

    await requireDispose(replacementResponse)();
    expect(replacementSession.destroy).toHaveBeenCalledTimes(1);
    expect(firstSession.destroy).not.toHaveBeenCalled();

    await requireDispose(overlappingResponse)();
    if (firstOutcome.status === 'fulfilled') {
      await requireDispose(firstOutcome.response)();
    }
    expect(firstSession.destroy).toHaveBeenCalledTimes(1);
    expect(replacementSession.destroy).toHaveBeenCalledTimes(1);
  });
});

test('aborts before event iteration and destroys the session once', async () => {
  await withLanguageModel(undefined, async () => {
    const abortController = new AbortController();
    const session = createSession(createTextStream([]));
    const transport = new ExperimentalChromeLocalTransport({
      createSession: async () => session,
    });
    const request = createRequest({}, { signal: abortController.signal });
    const response = await transport.send(request);
    const observedEvents: AGUIEvent[] = [];

    abortController.abort('stop');
    const nextPromise = response.events[Symbol.asyncIterator]().next();

    await expect(nextPromise).rejects.toMatchObject({
      code: 'PROMPT_API_ABORTED',
    });
    expect(session.promptStreaming).not.toHaveBeenCalled();
    expect(session.destroy).toHaveBeenCalledTimes(1);
    expectNoRunError(observedEvents);
  });
});

test('aborts pending promptStreaming and destroys the session once', async () => {
  await withLanguageModel(undefined, async () => {
    const abortController = new AbortController();
    const promptResult = createDeferred<ReadableStream<string>>();
    const { stream, reader } = createReaderStream({
      read: async () => ({ done: true, value: undefined }),
    });
    const session = {
      prompt: jest.fn(),
      promptStreaming: jest.fn(() => promptResult.promise),
      destroy: jest.fn(),
    };
    const transport = new ExperimentalChromeLocalTransport({
      createSession: async () => session,
    });
    const response = await transport.send(
      createRequest({}, { signal: abortController.signal }),
    );
    const iterator = response.events[Symbol.asyncIterator]();
    const observedEvents: AGUIEvent[] = [];
    const first = await iterator.next();
    if (!first.done) {
      observedEvents.push(first.value);
    }
    const pendingNext = iterator.next();
    await Promise.resolve();

    abortController.abort('stop');

    await expect(pendingNext).rejects.toMatchObject({
      code: 'PROMPT_API_ABORTED',
    });
    expect(session.destroy).toHaveBeenCalledTimes(1);
    expectNoRunError(observedEvents);

    promptResult.resolve(stream);
    await flushTasks();

    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    expect(session.destroy).toHaveBeenCalledTimes(1);
  });
});

test('aborts a blocked stream read and destroys the session once', async () => {
  await withLanguageModel(undefined, async () => {
    const abortController = new AbortController();
    const readResult = createDeferred<ReadableStreamReadResult<string>>();
    const { stream, reader } = createReaderStream({
      read: () => readResult.promise,
    });
    const session = createSession(stream);
    const transport = new ExperimentalChromeLocalTransport({
      createSession: async () => session,
    });
    const response = await transport.send(
      createRequest({}, { signal: abortController.signal }),
    );
    const iterator = response.events[Symbol.asyncIterator]();
    const observedEvents: AGUIEvent[] = [];
    for (let index = 0; index < 2; index++) {
      const result = await iterator.next();
      if (!result.done) {
        observedEvents.push(result.value);
      }
    }
    const pendingNext = iterator.next();
    await Promise.resolve();

    abortController.abort('stop');

    await expect(pendingNext).rejects.toMatchObject({
      code: 'PROMPT_API_ABORTED',
    });
    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    expect(session.destroy).toHaveBeenCalledTimes(1);
    expectNoRunError(observedEvents);

    readResult.resolve({ done: true, value: undefined });
  });
});

test('discards chunks that resolve after abort without terminal events', async () => {
  await withLanguageModel(undefined, async () => {
    const abortController = new AbortController();
    const readResult = createDeferred<ReadableStreamReadResult<string>>();
    const { stream } = createReaderStream({ read: () => readResult.promise });
    const session = createSession(stream);
    const transport = new ExperimentalChromeLocalTransport({
      createSession: async () => session,
    });
    const response = await transport.send(
      createRequest({}, { signal: abortController.signal }),
    );
    const iterator = response.events[Symbol.asyncIterator]();
    const observedEvents: AGUIEvent[] = [];
    for (let index = 0; index < 2; index++) {
      const result = await iterator.next();
      if (!result.done) {
        observedEvents.push(result.value);
      }
    }
    const pendingNext = iterator.next();
    await Promise.resolve();

    abortController.abort('stop');
    readResult.resolve({ done: false, value: 'late chunk' });

    await expect(pendingNext).rejects.toMatchObject({
      code: 'PROMPT_API_ABORTED',
    });
    expect(observedEvents.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
    ]);
    expect(session.destroy).toHaveBeenCalledTimes(1);
    expectNoRunError(observedEvents);
  });
});

test('shares one session cleanup across repeated response disposal', async () => {
  await withLanguageModel(undefined, async () => {
    const sessionState = jest.fn();
    const session = createSession(createTextStream([]));
    const transport = new ExperimentalChromeLocalTransport({
      createSession: async () => session,
      events: { sessionState },
    });
    const response = await transport.send(createRequest());
    const dispose = requireDispose(response);
    const iterator = response.events[Symbol.asyncIterator]();
    const observedEvents: AGUIEvent[] = [];

    await Promise.all([dispose(), dispose(), dispose()]);
    const nextPromise = iterator.next();

    await expect(nextPromise).rejects.toMatchObject({
      code: 'PROMPT_API_ABORTED',
    });
    expect(session.destroy).toHaveBeenCalledTimes(1);
    expect(sessionState).toHaveBeenCalledTimes(1);
    expect(sessionState).toHaveBeenCalledWith('destroyed');
    expectNoRunError(observedEvents);
  });
});

test('preserves a session destroy failure without reporting destroyed', async () => {
  await withLanguageModel(undefined, async () => {
    const destroyError = new Error('destroy failed');
    const callbackError = new Error('callback failed');
    const session = {
      prompt: jest.fn(),
      promptStreaming: jest.fn().mockReturnValue(createTextStream([])),
      destroy: jest.fn(() => {
        throw destroyError;
      }),
    };
    const sessionState = jest.fn(() => {
      throw callbackError;
    });
    const transport = new ExperimentalChromeLocalTransport({
      createSession: async () => session,
      events: { sessionState },
    });
    const response = await transport.send(createRequest());

    const disposePromise = requireDispose(response)();

    await expect(disposePromise).rejects.toBe(destroyError);
    expect(session.destroy).toHaveBeenCalledTimes(1);
    expect(sessionState).not.toHaveBeenCalled();
  });
});

test('transport destroy awaits response disposal teardown', async () => {
  await withLanguageModel(undefined, async () => {
    const destroyResult = createDeferred<void>();
    const destroyStarted = createDeferred<void>();
    const sessionState = jest.fn();
    const session = {
      prompt: jest.fn(),
      promptStreaming: jest.fn().mockReturnValue(createTextStream([])),
      destroy: jest.fn(() => {
        destroyStarted.resolve();
        return destroyResult.promise;
      }),
    };
    const transport = new ExperimentalChromeLocalTransport({
      createSession: async () => session,
      events: { sessionState },
    });
    const response = await transport.send(createRequest());

    const disposePromise = requireDispose(response)();
    await destroyStarted.promise;
    const transportDestroyPromise = transport.destroy();
    const pendingResult = await settleWithinTask(transportDestroyPromise);

    expect(pendingResult).toEqual({ status: 'pending' });
    expect(session.destroy).toHaveBeenCalledTimes(1);
    expect(sessionState).not.toHaveBeenCalled();

    destroyResult.resolve();
    await Promise.all([disposePromise, transportDestroyPromise]);

    expect(session.destroy).toHaveBeenCalledTimes(1);
    expect(sessionState).toHaveBeenCalledTimes(1);
    expect(sessionState).toHaveBeenCalledWith('destroyed');
  });
});

test('transport destroy observes response abort teardown rejection', async () => {
  await withLanguageModel(undefined, async () => {
    const abortController = new AbortController();
    const destroyResult = createDeferred<void>();
    const destroyStarted = createDeferred<void>();
    const destroyError = new Error('destroy failed');
    const sessionState = jest.fn();
    const session = {
      prompt: jest.fn(),
      promptStreaming: jest.fn().mockReturnValue(createTextStream([])),
      destroy: jest.fn(() => {
        destroyStarted.resolve();
        return destroyResult.promise;
      }),
    };
    const transport = new ExperimentalChromeLocalTransport({
      createSession: async () => session,
      events: { sessionState },
    });
    await transport.send(createRequest({}, { signal: abortController.signal }));
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      abortController.abort('stop');
      await destroyStarted.promise;
      const transportDestroyPromise = transport.destroy();
      const pendingResult = await settleWithinTask(transportDestroyPromise);

      expect(pendingResult).toEqual({ status: 'pending' });
      expect(session.destroy).toHaveBeenCalledTimes(1);
      expect(sessionState).not.toHaveBeenCalled();

      destroyResult.reject(destroyError);

      await expect(transportDestroyPromise).rejects.toBe(destroyError);
      await flushTasks();

      expect(session.destroy).toHaveBeenCalledTimes(1);
      expect(sessionState).not.toHaveBeenCalled();
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.removeListener('unhandledRejection', onUnhandledRejection);
    }
  });
});

test('transport destroy awaits prior and replacement session teardowns', async () => {
  await withLanguageModel(undefined, async () => {
    const firstDestroyResult = createDeferred<void>();
    const firstDestroyStarted = createDeferred<void>();
    const secondDestroyResult = createDeferred<void>();
    const secondDestroyStarted = createDeferred<void>();
    const sessionState = jest.fn();
    const firstSession = {
      prompt: jest.fn(),
      promptStreaming: jest.fn().mockReturnValue(createTextStream([])),
      destroy: jest.fn(() => {
        firstDestroyStarted.resolve();
        return firstDestroyResult.promise;
      }),
    };
    const secondSession = {
      prompt: jest.fn(),
      promptStreaming: jest.fn().mockReturnValue(createTextStream([])),
      destroy: jest.fn(() => {
        secondDestroyStarted.resolve();
        return secondDestroyResult.promise;
      }),
    };
    const create = jest
      .fn()
      .mockResolvedValueOnce(firstSession)
      .mockResolvedValueOnce(secondSession);
    const transport = new ExperimentalChromeLocalTransport({
      createSession: create,
      events: { sessionState },
    });
    const firstResponse = await transport.send(
      createRequest({ runId: 'run-first' }),
    );

    const firstDisposePromise = requireDispose(firstResponse)();
    await firstDestroyStarted.promise;
    const secondResponse = await transport.send(
      createRequest({ runId: 'run-second' }),
    );
    const transportDestroyPromise = transport.destroy();
    await secondDestroyStarted.promise;
    const initialResult = await settleWithinTask(transportDestroyPromise);

    expect(initialResult).toEqual({ status: 'pending' });
    expect(firstSession.destroy).toHaveBeenCalledTimes(1);
    expect(secondSession.destroy).toHaveBeenCalledTimes(1);
    expect(sessionState).not.toHaveBeenCalled();

    secondDestroyResult.resolve();
    await Promise.resolve();
    const afterSecondResult = await settleWithinTask(transportDestroyPromise);

    expect(afterSecondResult).toEqual({ status: 'pending' });
    expect(sessionState).toHaveBeenCalledTimes(1);
    expect(sessionState).toHaveBeenCalledWith('destroyed');

    firstDestroyResult.resolve();
    await Promise.all([firstDisposePromise, transportDestroyPromise]);
    await requireDispose(secondResponse)();

    expect(create).toHaveBeenCalledTimes(2);
    expect(firstSession.destroy).toHaveBeenCalledTimes(1);
    expect(secondSession.destroy).toHaveBeenCalledTimes(1);
    expect(sessionState).toHaveBeenCalledTimes(2);
    expect(sessionState).toHaveBeenNthCalledWith(1, 'destroyed');
    expect(sessionState).toHaveBeenNthCalledWith(2, 'destroyed');
  });
});

test('transport destroy retains a prior teardown rejection after replacement', async () => {
  await withLanguageModel(undefined, async () => {
    const firstDestroyResult = createDeferred<void>();
    const firstDestroyStarted = createDeferred<void>();
    const secondDestroyResult = createDeferred<void>();
    const secondDestroyStarted = createDeferred<void>();
    const firstDestroyError = new Error('first destroy failed');
    const sessionState = jest.fn();
    const firstSession = {
      prompt: jest.fn(),
      promptStreaming: jest.fn().mockReturnValue(createTextStream([])),
      destroy: jest.fn(() => {
        firstDestroyStarted.resolve();
        return firstDestroyResult.promise;
      }),
    };
    const secondSession = {
      prompt: jest.fn(),
      promptStreaming: jest.fn().mockReturnValue(createTextStream([])),
      destroy: jest.fn(() => {
        secondDestroyStarted.resolve();
        return secondDestroyResult.promise;
      }),
    };
    const thirdSession = createSession(createTextStream([]));
    const create = jest
      .fn()
      .mockResolvedValueOnce(firstSession)
      .mockResolvedValueOnce(secondSession)
      .mockResolvedValueOnce(thirdSession);
    const transport = new ExperimentalChromeLocalTransport({
      createSession: create,
      events: { sessionState },
    });
    const firstResponse = await transport.send(
      createRequest({ runId: 'run-first' }),
    );
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      const firstDisposeOutcome = requireDispose(firstResponse)().then(
        () => ({ status: 'fulfilled' as const }),
        (reason: unknown) => ({ status: 'rejected' as const, reason }),
      );
      await firstDestroyStarted.promise;
      const secondResponse = await transport.send(
        createRequest({ runId: 'run-second' }),
      );
      const transportDestroyOutcome = transport.destroy().then(
        () => ({ status: 'fulfilled' as const }),
        (reason: unknown) => ({ status: 'rejected' as const, reason }),
      );
      await secondDestroyStarted.promise;

      secondDestroyResult.resolve();
      await Promise.resolve();
      const afterSecondResult = await settleWithinTask(transportDestroyOutcome);

      expect(afterSecondResult).toEqual({ status: 'pending' });
      expect(firstSession.destroy).toHaveBeenCalledTimes(1);
      expect(secondSession.destroy).toHaveBeenCalledTimes(1);
      expect(sessionState).toHaveBeenCalledTimes(1);
      expect(sessionState).toHaveBeenCalledWith('destroyed');

      firstDestroyResult.reject(firstDestroyError);

      await expect(transportDestroyOutcome).resolves.toEqual({
        status: 'rejected',
        reason: firstDestroyError,
      });
      await expect(firstDisposeOutcome).resolves.toEqual({
        status: 'rejected',
        reason: firstDestroyError,
      });
      await requireDispose(secondResponse)();
      await flushTasks();

      expect(sessionState).toHaveBeenCalledTimes(1);
      expect(unhandledRejections).toEqual([]);

      const thirdResponse = await transport.send(
        createRequest({ runId: 'run-third' }),
      );
      const laterDestroyPromise = transport.destroy();

      await expect(laterDestroyPromise).resolves.toBeUndefined();
      await requireDispose(thirdResponse)();

      expect(create).toHaveBeenCalledTimes(3);
      expect(thirdSession.destroy).toHaveBeenCalledTimes(1);
      expect(sessionState).toHaveBeenCalledTimes(2);
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.removeListener('unhandledRejection', onUnhandledRejection);
    }
  });
});

test('transport destroy settles replacement teardown after prior teardown rejects', async () => {
  await withLanguageModel(undefined, async () => {
    const firstDestroyResult = createDeferred<void>();
    const firstDestroyStarted = createDeferred<void>();
    const secondDestroyResult = createDeferred<void>();
    const secondDestroyStarted = createDeferred<void>();
    const firstDestroyError = new Error('first destroy failed');
    const sessionState = jest.fn();
    const firstSession = {
      prompt: jest.fn(),
      promptStreaming: jest.fn().mockReturnValue(createTextStream([])),
      destroy: jest.fn(() => {
        firstDestroyStarted.resolve();
        return firstDestroyResult.promise;
      }),
    };
    const secondSession = {
      prompt: jest.fn(),
      promptStreaming: jest.fn().mockReturnValue(createTextStream([])),
      destroy: jest.fn(() => {
        secondDestroyStarted.resolve();
        return secondDestroyResult.promise;
      }),
    };
    const create = jest
      .fn()
      .mockResolvedValueOnce(firstSession)
      .mockResolvedValueOnce(secondSession);
    const transport = new ExperimentalChromeLocalTransport({
      createSession: create,
      events: { sessionState },
    });
    const firstResponse = await transport.send(
      createRequest({ runId: 'run-first' }),
    );
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      const firstDisposeOutcome = requireDispose(firstResponse)().then(
        () => ({ status: 'fulfilled' as const }),
        (reason: unknown) => ({ status: 'rejected' as const, reason }),
      );
      await firstDestroyStarted.promise;
      const secondResponse = await transport.send(
        createRequest({ runId: 'run-second' }),
      );
      const transportDestroyOutcome = transport.destroy().then(
        () => ({ status: 'fulfilled' as const }),
        (reason: unknown) => ({ status: 'rejected' as const, reason }),
      );
      await secondDestroyStarted.promise;

      firstDestroyResult.reject(firstDestroyError);

      await expect(firstDisposeOutcome).resolves.toEqual({
        status: 'rejected',
        reason: firstDestroyError,
      });
      const afterFirstResult = await settleWithinTask(transportDestroyOutcome);
      await flushTasks();

      expect(afterFirstResult).toEqual({ status: 'pending' });
      expect(firstSession.destroy).toHaveBeenCalledTimes(1);
      expect(secondSession.destroy).toHaveBeenCalledTimes(1);
      expect(sessionState).not.toHaveBeenCalled();
      expect(unhandledRejections).toEqual([]);

      secondDestroyResult.resolve();

      await expect(transportDestroyOutcome).resolves.toEqual({
        status: 'rejected',
        reason: firstDestroyError,
      });
      await requireDispose(secondResponse)();
      await flushTasks();

      expect(firstSession.destroy).toHaveBeenCalledTimes(1);
      expect(secondSession.destroy).toHaveBeenCalledTimes(1);
      expect(sessionState).toHaveBeenCalledTimes(1);
      expect(sessionState).toHaveBeenCalledWith('destroyed');
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.removeListener('unhandledRejection', onUnhandledRejection);
    }
  });
});

test('keeps an overlapping response session alive after another response is disposed', async () => {
  await withLanguageModel(undefined, async () => {
    const session = createSession(createTextStream(['second response']));
    const create = jest.fn(async () => session);
    const transport = new ExperimentalChromeLocalTransport({
      createSession: create,
    });
    const firstResponse = await transport.send(
      createRequest({ runId: 'run-first' }),
    );
    const secondResponse = await transport.send(
      createRequest({ runId: 'run-second' }),
    );

    await requireDispose(firstResponse)();

    expect(session.destroy).not.toHaveBeenCalled();

    const events = await collectEvents(secondResponse.events);

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: EventType.TEXT_MESSAGE_CONTENT,
          delta: 'second response',
        }),
      ]),
    );
    expect(create).toHaveBeenCalledTimes(1);
    expect(session.destroy).toHaveBeenCalledTimes(1);
  });
});

test('keeps an overlapping response session alive after another response completes', async () => {
  await withLanguageModel(undefined, async () => {
    const session = createSession(createTextStream(['first response']));
    const create = jest.fn(async () => session);
    const transport = new ExperimentalChromeLocalTransport({
      createSession: create,
    });
    const firstResponse = await transport.send(
      createRequest({ runId: 'run-first' }),
    );
    const secondResponse = await transport.send(
      createRequest({ runId: 'run-second' }),
    );

    await collectEvents(firstResponse.events);

    expect(session.destroy).not.toHaveBeenCalled();

    await requireDispose(secondResponse)();

    expect(create).toHaveBeenCalledTimes(1);
    expect(session.destroy).toHaveBeenCalledTimes(1);
  });
});

test('transport destroy force-destroys an overlapping response session once', async () => {
  await withLanguageModel(undefined, async () => {
    const sessionState = jest.fn();
    const session = createSession(createTextStream([]));
    const transport = new ExperimentalChromeLocalTransport({
      createSession: async () => session,
      events: { sessionState },
    });
    const firstResponse = await transport.send(
      createRequest({ runId: 'run-first' }),
    );
    const secondResponse = await transport.send(
      createRequest({ runId: 'run-second' }),
    );

    await transport.destroy();

    expect(session.destroy).toHaveBeenCalledTimes(1);
    expect(sessionState).toHaveBeenCalledTimes(1);
    expect(sessionState).toHaveBeenCalledWith('destroyed');

    await Promise.all([
      requireDispose(firstResponse)(),
      requireDispose(secondResponse)(),
    ]);

    expect(session.destroy).toHaveBeenCalledTimes(1);
    expect(sessionState).toHaveBeenCalledTimes(1);
  });
});

test('reserves session ownership before an overlapping send awaits the session', async () => {
  await withLanguageModel(undefined, async () => {
    const secondAwaitReached = createDeferred<void>();
    const continueSecondAwait = createDeferred<void>();
    const session = createSession(createTextStream([]));
    let awaitCount = 0;
    const sessionPromise = {
      then(onFulfilled: (value: typeof session) => void) {
        awaitCount += 1;
        if (awaitCount === 1) {
          onFulfilled(session);
          return;
        }

        secondAwaitReached.resolve();
        void continueSecondAwait.promise.then(() => onFulfilled(session));
      },
      catch: jest.fn(),
    } as unknown as Promise<typeof session>;
    const create = jest.fn(() => sessionPromise);
    const transport = new ExperimentalChromeLocalTransport({
      createSession: create,
    });
    const firstResponse = await transport.send(
      createRequest({ runId: 'run-first' }),
    );

    const secondResponsePromise = transport.send(
      createRequest({ runId: 'run-second' }),
    );
    await secondAwaitReached.promise;

    const firstDisposePromise = requireDispose(firstResponse)();
    await Promise.resolve();

    expect(session.destroy).not.toHaveBeenCalled();

    continueSecondAwait.resolve();
    const secondResponse = await secondResponsePromise;
    await firstDisposePromise;
    await requireDispose(secondResponse)();

    expect(create).toHaveBeenCalledTimes(1);
    expect(session.destroy).toHaveBeenCalledTimes(1);
  });
});

test('does not let stale cleanup clear a newer session', async () => {
  await withLanguageModel(undefined, async () => {
    const firstDestroyResult = createDeferred<void>();
    const firstSession = {
      prompt: jest.fn(),
      promptStreaming: jest.fn().mockReturnValue(createTextStream([])),
      destroy: jest.fn(() => firstDestroyResult.promise),
    };
    const secondSession = createSession(createTextStream([]));
    const create = jest
      .fn()
      .mockResolvedValueOnce(firstSession)
      .mockResolvedValueOnce(secondSession);
    const transport = new ExperimentalChromeLocalTransport({
      createSession: create,
    });
    const firstResponse = await transport.send(
      createRequest({ runId: 'run-first' }),
    );

    const firstDisposePromise = requireDispose(firstResponse)();
    await Promise.resolve();
    const secondResponse = await transport.send(
      createRequest({ runId: 'run-second' }),
    );

    expect(firstSession.destroy).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(2);

    firstDestroyResult.resolve();
    await firstDisposePromise;

    const thirdResponse = await transport.send(
      createRequest({ runId: 'run-third' }),
    );

    expect(create).toHaveBeenCalledTimes(2);

    await requireDispose(secondResponse)();

    expect(secondSession.destroy).not.toHaveBeenCalled();

    await requireDispose(thirdResponse)();

    expect(firstSession.destroy).toHaveBeenCalledTimes(1);
    expect(secondSession.destroy).toHaveBeenCalledTimes(1);
  });
});

test('propagates a rejected stream read without emitting RUN_ERROR', async () => {
  await withLanguageModel(undefined, async () => {
    const readError = new Error('read failed');
    const { stream, reader } = createReaderStream({
      read: async () => Promise.reject(readError),
    });
    const session = createSession(stream);
    const transport = new ExperimentalChromeLocalTransport({
      createSession: async () => session,
    });
    const response = await transport.send(createRequest());
    const iterator = response.events[Symbol.asyncIterator]();
    const observedEvents: AGUIEvent[] = [];
    for (let index = 0; index < 2; index++) {
      const result = await iterator.next();
      if (!result.done) {
        observedEvents.push(result.value);
      }
    }

    const nextPromise = iterator.next();

    await expect(nextPromise).rejects.toBe(readError);
    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    expect(session.destroy).toHaveBeenCalledTimes(1);
    expectNoRunError(observedEvents);
  });
});
