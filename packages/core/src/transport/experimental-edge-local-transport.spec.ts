import { type AGUIEvent, EventType } from '@ag-ui/core';
import { type TransportRequest } from './transport';
import { ExperimentalEdgeLocalTransport } from './experimental-edge-local-transport';

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

test('throws when AG-UI run input is missing', async () => {
  await withLanguageModel(undefined, async () => {
    const transport = new ExperimentalEdgeLocalTransport({});
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

test('throws PLATFORM_UNSUPPORTED when the Prompt API is missing', async () => {
  await withLanguageModel(undefined, async () => {
    const transport = new ExperimentalEdgeLocalTransport({});

    const sendPromise = transport.send(createRequest());

    await expect(sendPromise).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
    });
  });
});

test('emits the exact local AG-UI event sequence and identities', async () => {
  const session = createSession(createTextStream(['Edge hello', ' world']));
  const languageModel = { create: jest.fn().mockResolvedValue(session) };

  await withLanguageModel(languageModel, async () => {
    const transport = new ExperimentalEdgeLocalTransport({});
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
        delta: 'Edge hello',
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
  const languageModel = { create: jest.fn().mockResolvedValue(session) };

  await withLanguageModel(languageModel, async () => {
    const transport = new ExperimentalEdgeLocalTransport({});

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

test('moves system messages to initialPrompts and streams user and assistant messages', async () => {
  const session = createSession(createTextStream([]));
  const create = jest.fn().mockResolvedValue(session);
  const languageModel = { create };

  await withLanguageModel(languageModel, async () => {
    const transport = new ExperimentalEdgeLocalTransport({});
    const request = createRequest({
      messages: [
        { id: 'system-1', role: 'system', content: 'System prompt' },
        { id: 'user-1', role: 'user', content: 'User prompt' },
        { id: 'assistant-1', role: 'assistant', content: 'Prior answer' },
        {
          id: 'tool-1',
          role: 'tool',
          toolCallId: 'call-1',
          content: 'Tool result',
        },
      ],
    });

    const response = await transport.send(request);
    await collectEvents(response.events);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        initialPrompts: [{ role: 'system', content: 'System prompt' }],
        signal: request.signal,
      }),
    );
    expect(session.promptStreaming).toHaveBeenCalledWith(
      [
        { role: 'user', content: 'User prompt' },
        { role: 'assistant', content: 'Prior answer' },
      ],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});

test('maps the Hashbrown response schema to the Prompt API constraint', async () => {
  const session = createSession(createTextStream([]));
  const languageModel = { create: jest.fn().mockResolvedValue(session) };

  await withLanguageModel(languageModel, async () => {
    const transport = new ExperimentalEdgeLocalTransport({});
    const request = createRequest({ hashbrown: { responseSchema } });

    const response = await transport.send(request);
    await collectEvents(response.events);

    expect(session.promptStreaming).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ responseConstraint: responseSchema }),
    );
  });
});

test('rejects AG-UI tool declarations as FEATURE_UNSUPPORTED', async () => {
  const create = jest.fn();
  const languageModel = { create };

  await withLanguageModel(languageModel, async () => {
    const transport = new ExperimentalEdgeLocalTransport({});
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

test('preserves Edge availability, download, progress, and monitor callbacks', async () => {
  const session = createSession(createTextStream([]));
  const userMonitor = jest.fn();
  const monitorTarget = {
    addEventListener: jest.fn(
      (
        _type: 'downloadprogress',
        listener: (event: { loaded: number; total: number }) => void,
      ) => listener({ loaded: 50, total: 100 }),
    ),
  };
  const create = jest.fn(
    async (options?: { monitor?: (monitor: unknown) => void }) => {
      options?.monitor?.(monitorTarget);
      return session;
    },
  );
  const availability = jest.fn().mockResolvedValue({ status: 'downloading' });
  const languageModel = { availability, create };
  const onAvailability = jest.fn();
  const onDownloadRequired = jest.fn();
  const onDownloadProgress = jest.fn();

  await withLanguageModel(languageModel, async () => {
    const transport = new ExperimentalEdgeLocalTransport({
      transformRequest: (request) => ({
        messages:
          request.input?.messages
            .filter(
              (message) =>
                message.role === 'user' || message.role === 'assistant',
            )
            .map((message) => ({
              role: message.role as 'user' | 'assistant',
              content: String(message.content),
            })) ?? [],
        sessionOptions: { monitor: userMonitor },
      }),
      events: {
        availability: onAvailability,
        downloadRequired: onDownloadRequired,
        downloadProgress: onDownloadProgress,
      },
    });

    const response = await transport.send(createRequest());
    await collectEvents(response.events);

    expect(availability).toHaveBeenCalledWith({ monitor: userMonitor });
    expect(onAvailability).toHaveBeenCalledWith('downloading');
    expect(onDownloadRequired).toHaveBeenCalledWith('downloading');
    expect(userMonitor).toHaveBeenCalledWith(monitorTarget);
    expect(onDownloadProgress).toHaveBeenCalledWith(50);
  });
});

test('preserves Edge transport metadata', async () => {
  const session = createSession(createTextStream([]));
  const languageModel = {
    availability: jest.fn().mockResolvedValue('available'),
    create: jest.fn().mockResolvedValue(session),
  };

  await withLanguageModel(languageModel, async () => {
    const transport = new ExperimentalEdgeLocalTransport({});
    const response = await transport.send(createRequest());

    try {
      expect(response.metadata).toEqual({
        source: 'edge-prompt-api',
        status: 'available',
        promptMode: 'promptStreaming',
        usedResponseConstraint: true,
        omitResponseConstraintInput: undefined,
        stableSession: true,
      });
    } finally {
      await requireDispose(response)();
    }
  });
});

test('calls Edge availability with the language model receiver', async () => {
  const session = createSession(createTextStream([]));
  const create = jest.fn().mockResolvedValue(session);
  const availability = jest.fn(function (this: unknown) {
    expect(this).toBe(languageModel);
    return Promise.resolve('available' as const);
  });
  const languageModel = { availability, create };

  await withLanguageModel(languageModel, async () => {
    const transport = new ExperimentalEdgeLocalTransport({});

    const response = await transport.send(createRequest());
    const events = await collectEvents(response.events);

    expect(events).toEqual(expect.any(Array));
    expect(availability).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

test.each(['resolve', 'reject'] as const)(
  'aborts while Edge availability is pending and owns a late %s',
  async (lateSettlement) => {
    const availabilityResult = createDeferred<'available'>();
    const availability = jest.fn(() => availabilityResult.promise);
    const create = jest.fn(async () => createSession(createTextStream([])));
    const controller = new AbortController();

    await withLanguageModel({ availability, create }, async () => {
      const transport = new ExperimentalEdgeLocalTransport({});
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
        availabilityResult.resolve('available');
      } else {
        availabilityResult.reject(new Error('late availability failure'));
      }
      await flushTasks();

      expect(create).not.toHaveBeenCalled();
    });
  },
);

test('aborts while the Edge download callback is pending', async () => {
  const downloadResult = createDeferred<void>();
  const downloadRequired = jest.fn(() => downloadResult.promise);
  const create = jest.fn(async () => createSession(createTextStream([])));
  const controller = new AbortController();
  const languageModel = {
    availability: jest.fn().mockResolvedValue('downloadable'),
    create,
  };

  await withLanguageModel(languageModel, async () => {
    const transport = new ExperimentalEdgeLocalTransport({
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

    expect(downloadRequired).toHaveBeenCalledWith('downloadable');
    expect(create).not.toHaveBeenCalled();
  });
});

test('does not check Edge availability or create a session after abort', async () => {
  const availability = jest.fn().mockResolvedValue('available');
  const create = jest.fn(async () => createSession(createTextStream([])));
  const controller = new AbortController();
  controller.abort();

  await withLanguageModel({ availability, create }, async () => {
    const transport = new ExperimentalEdgeLocalTransport({});

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

test('retries session creation after a cached creation rejects', async () => {
  const createError = new Error('create failed');
  const session = createSession(createTextStream(['retry succeeded']));
  const create = jest
    .fn()
    .mockRejectedValueOnce(createError)
    .mockResolvedValueOnce(session);
  const languageModel = { create };

  await withLanguageModel(languageModel, async () => {
    const transport = new ExperimentalEdgeLocalTransport({});

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

test('aborts pending custom session creation and destroys a late session once', async () => {
  const abortController = new AbortController();
  const creation = createDeferred<ReturnType<typeof createSession>>();
  const session = createSession(createTextStream([]));
  const createSessionOption = jest.fn(() => creation.promise);

  await withLanguageModel({ create: jest.fn() }, async () => {
    const transport = new ExperimentalEdgeLocalTransport({
      createSession: createSessionOption,
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
    expect(createSessionOption).toHaveBeenCalledTimes(1);
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
    const transport = new ExperimentalEdgeLocalTransport({
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

  await withLanguageModel({ create: jest.fn() }, async () => {
    const transport = new ExperimentalEdgeLocalTransport({
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
  const firstAbortController = new AbortController();
  const firstCreation = createDeferred<ReturnType<typeof createSession>>();
  const firstSession = createSession(createTextStream([]));
  const replacementSession = createSession(createTextStream([]));
  const createSessionOption = jest
    .fn()
    .mockImplementationOnce(() => firstCreation.promise)
    .mockResolvedValueOnce(replacementSession);

  await withLanguageModel({ create: jest.fn() }, async () => {
    const transport = new ExperimentalEdgeLocalTransport({
      createSession: createSessionOption,
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
    expect(createSessionOption).toHaveBeenCalledTimes(2);
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
  const abortController = new AbortController();
  const session = createSession(createTextStream([]));
  const languageModel = { create: jest.fn().mockResolvedValue(session) };

  await withLanguageModel(languageModel, async () => {
    const transport = new ExperimentalEdgeLocalTransport({});
    const response = await transport.send(
      createRequest({}, { signal: abortController.signal }),
    );
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

test('aborts pending stream creation and destroys the session once', async () => {
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
  const languageModel = { create: jest.fn().mockResolvedValue(session) };

  await withLanguageModel(languageModel, async () => {
    const transport = new ExperimentalEdgeLocalTransport({});
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

    abortController.abort('stop');

    await expect(pendingNext).rejects.toMatchObject({
      code: 'PROMPT_API_ABORTED',
    });
    expect(session.destroy).toHaveBeenCalledTimes(1);

    promptResult.resolve(stream);
    await flushTasks();

    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    expect(session.destroy).toHaveBeenCalledTimes(1);
    expectNoRunError(observedEvents);
  });
});

test('aborts a blocked stream read and destroys the session once', async () => {
  const abortController = new AbortController();
  const readResult = createDeferred<ReadableStreamReadResult<string>>();
  const { stream, reader } = createReaderStream({
    read: () => readResult.promise,
  });
  const session = createSession(stream);
  const languageModel = { create: jest.fn().mockResolvedValue(session) };

  await withLanguageModel(languageModel, async () => {
    const transport = new ExperimentalEdgeLocalTransport({});
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

    abortController.abort('stop');

    await expect(pendingNext).rejects.toMatchObject({
      code: 'PROMPT_API_ABORTED',
    });
    readResult.resolve({ done: true, value: undefined });
    await flushTasks();

    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    expect(session.destroy).toHaveBeenCalledTimes(1);
    expectNoRunError(observedEvents);
  });
});

test('discards chunks that resolve after abort without terminal events', async () => {
  const abortController = new AbortController();
  const readResult = createDeferred<ReadableStreamReadResult<string>>();
  const { stream, reader } = createReaderStream({
    read: () => readResult.promise,
  });
  const session = createSession(stream);
  const languageModel = { create: jest.fn().mockResolvedValue(session) };

  await withLanguageModel(languageModel, async () => {
    const transport = new ExperimentalEdgeLocalTransport({});
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

    abortController.abort('stop');
    readResult.resolve({ done: false, value: 'late chunk' });

    await expect(pendingNext).rejects.toMatchObject({
      code: 'PROMPT_API_ABORTED',
    });

    expect(observedEvents.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
    ]);
    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(session.destroy).toHaveBeenCalledTimes(1);
    expectNoRunError(observedEvents);
  });
});

test('shares one session cleanup across repeated response disposal', async () => {
  const sessionState = jest.fn();
  const session = createSession(createTextStream([]));
  const languageModel = { create: jest.fn().mockResolvedValue(session) };

  await withLanguageModel(languageModel, async () => {
    const transport = new ExperimentalEdgeLocalTransport({
      events: { sessionState },
    });
    const response = await transport.send(createRequest());
    const dispose = requireDispose(response);

    await Promise.all([dispose(), dispose(), dispose()]);

    expect(session.destroy).toHaveBeenCalledTimes(1);
    expect(sessionState).toHaveBeenCalledTimes(2);
    expect(sessionState).toHaveBeenNthCalledWith(1, 'created');
    expect(sessionState).toHaveBeenNthCalledWith(2, 'destroyed');
  });
});

test('transport destruction and response disposal destroy the session once', async () => {
  const sessionState = jest.fn();
  const session = createSession(createTextStream([]));
  const languageModel = { create: jest.fn().mockResolvedValue(session) };

  await withLanguageModel(languageModel, async () => {
    const transport = new ExperimentalEdgeLocalTransport({
      events: { sessionState },
    });
    const response = await transport.send(createRequest());

    await Promise.all([transport.destroy(), requireDispose(response)()]);
    await transport.destroy();

    expect(session.destroy).toHaveBeenCalledTimes(1);
    expect(sessionState).toHaveBeenCalledTimes(2);
    expect(sessionState).toHaveBeenNthCalledWith(1, 'created');
    expect(sessionState).toHaveBeenNthCalledWith(2, 'destroyed');
  });
});

test('keeps an overlapping response session alive until its final owner cleans up', async () => {
  const session = createSession(createTextStream(['second response']));
  const create = jest.fn().mockResolvedValue(session);
  const languageModel = { create };

  await withLanguageModel(languageModel, async () => {
    const transport = new ExperimentalEdgeLocalTransport({});
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

test('propagates a rejected stream read without emitting RUN_ERROR', async () => {
  const readError = new Error('read failed');
  const { stream, reader } = createReaderStream({
    read: async () => Promise.reject(readError),
  });
  const session = createSession(stream);
  const languageModel = { create: jest.fn().mockResolvedValue(session) };

  await withLanguageModel(languageModel, async () => {
    const transport = new ExperimentalEdgeLocalTransport({});
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
