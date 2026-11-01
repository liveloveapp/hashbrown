import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  type ConversationSnapshot,
  createChatRuntime,
  HttpTransport,
  s,
  type Transport,
  type TransportRequest,
  type TransportResponse,
} from '@hashbrownai/core';
import {
  type CandidateDeadlineRecord,
  createCandidateDeadlineTransport,
} from '../candidate-consumer/templates/deadline-transport';

type PublicTransportEvent =
  TransportResponse['events'] extends AsyncIterable<infer Value>
    ? Value
    : never;

/** Owns one explicit asynchronous test boundary without an unhandled rejection. */
function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Deferred not initialized');
  };
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve: (value: T) => resolve(value) };
}

/** Bounds infrastructure waits; this safety error is never transport deadline evidence. */
async function within<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('Test infrastructure safety bound exceeded')),
          2000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Creates an actual public transport request whose input identity must survive wrapping. */
function request(signal = new AbortController().signal): TransportRequest {
  return {
    input: {
      threadId: 'deadline-thread',
      runId: 'deadline-run',
      messages: [],
      tools: [],
      context: [],
      state: {},
      forwardedProps: {},
    },
    signal,
    attempt: 2,
    maxAttempts: 4,
    requestId: 'deadline-request',
  };
}

/** Supplies empty completed events for focused wrapper lifecycle tests only. */
function completedResponse(
  dispose?: TransportResponse['dispose'],
): TransportResponse {
  return {
    events: {
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ done: true as const, value: undefined }),
      }),
    },
    dispose,
  };
}

/** Lets the public runtime's existing effect scheduler settle without private APIs. */
async function settle() {
  for (let index = 0; index < 10; index++)
    await new Promise((resolve) => setTimeout(resolve, 0));
}

test('candidate deadline wrapper preserves the same input and every request field while composing only signal', async () => {
  const captured: TransportRequest[] = [];
  const original = Object.freeze({
    ...request(),
    fixtureExtension: { unchanged: true },
  });
  const originalInput = JSON.stringify(original.input);
  const delegate: Transport = {
    name: 'identity-delegate',
    send: async (value) => {
      captured.push(value);
      return completedResponse();
    },
  };
  const transport = createCandidateDeadlineTransport({
    delegate,
    deadlineMs: 100,
  });

  const response = await transport.send(original);
  await response.events[Symbol.asyncIterator]().next();
  await response.dispose?.();

  expect(captured).toHaveLength(1);
  expect(captured[0].input).toBe(original.input);
  expect(captured[0].signal).not.toBe(original.signal);
  expect({ ...captured[0], signal: original.signal }).toEqual(original);
  expect(JSON.stringify(original.input)).toBe(originalInput);
  expect(original.signal.aborted).toBe(false);
});

test('candidate deadline wrapper forwards a later caller abort and its exact reason during send', async () => {
  const entered = deferred<TransportRequest>();
  const caller = new AbortController();
  const reason = new Error('actual caller cancellation');
  const records: CandidateDeadlineRecord[] = [];
  const delegate: Transport = {
    name: 'abort-during-send',
    send: (value) => {
      entered.resolve(value);
      return new Promise((_resolve, reject) => {
        value.signal.addEventListener(
          'abort',
          () => reject(value.signal.reason),
          { once: true },
        );
      });
    },
  };
  const transport = createCandidateDeadlineTransport({
    delegate,
    deadlineMs: 100,
    observe: (record) => records.push(record),
  });
  const pending = transport.send(request(caller.signal));
  const rejected = expect(pending).rejects.toBe(reason);
  const forwarded = await within(entered.promise);

  caller.abort(reason);
  await within(rejected);
  await new Promise((resolve) => setTimeout(resolve, 140));

  expect(forwarded.signal.aborted).toBe(true);
  expect(forwarded.signal.reason).toBe(reason);
  expect(records.filter((record) => record.kind === 'deadline')).toEqual([]);
});

test('candidate deadline wrapper retains its finite deadline after send while a delegate iterator stalls and awaits disposal', async () => {
  const timedOut = deferred<void>();
  const disposing = deferred<void>();
  const releaseDispose = deferred<void>();
  const captured: TransportRequest[] = [];
  let disposed = false;
  let finished = false;
  const delegate: Transport = {
    name: 'stalled-events',
    send: async (value) => {
      captured.push(value);
      return {
        events: {
          [Symbol.asyncIterator]: () => ({
            next: () =>
              new Promise<IteratorResult<PublicTransportEvent>>(
                () => undefined,
              ),
          }),
        },
        dispose: async () => {
          disposing.resolve();
          await releaseDispose.promise;
          disposed = true;
        },
      };
    },
  };
  const transport = createCandidateDeadlineTransport({
    delegate,
    deadlineMs: 40,
    observe: (record) => {
      if (record.kind === 'deadline') timedOut.resolve();
    },
  });
  const response = await transport.send(request());
  const next = response.events[Symbol.asyncIterator]()
    .next()
    .finally(() => {
      finished = true;
    });
  const rejection = expect(next).rejects.toMatchObject({
    name: 'TimeoutError',
  });

  try {
    await within(timedOut.promise);
    await within(disposing.promise);

    expect(captured[0].signal.aborted).toBe(true);
    expect(captured[0].signal.reason).toMatchObject({ name: 'TimeoutError' });
    expect(disposed).toBe(false);
    expect(finished).toBe(false);
  } finally {
    releaseDispose.resolve();
    await response.dispose?.();
  }

  await within(rejection);
  expect(disposed).toBe(true);
});

test('candidate deadline wrapper retains later caller cancellation through a stalled returned event iterator', async () => {
  const caller = new AbortController();
  const reason = new Error('actual caller stopped the returned stream');
  const captured: TransportRequest[] = [];
  const dispose = jest.fn(async () => undefined);
  const delegate: Transport = {
    name: 'caller-stream-cancellation',
    send: async (value) => {
      captured.push(value);
      return {
        events: {
          [Symbol.asyncIterator]: () => ({
            next: () =>
              new Promise<IteratorResult<PublicTransportEvent>>(
                () => undefined,
              ),
          }),
        },
        dispose,
      };
    },
  };
  const response = await createCandidateDeadlineTransport({
    delegate,
    deadlineMs: 1000,
  }).send(request(caller.signal));
  const pending = response.events[Symbol.asyncIterator]().next();
  const rejected = expect(pending).rejects.toBe(reason);

  caller.abort(reason);
  await within(rejected);

  expect(captured[0].signal.reason).toBe(reason);
  expect(dispose).toHaveBeenCalledTimes(1);
  await response.dispose?.();
});

test('candidate deadline cancels an actual public HttpTransport after a real ACK while the HTTP body remains stalled', async () => {
  let requests = 0;
  const closed = deferred<void>();
  const observed: AbortSignal[] = [];
  const records: CandidateDeadlineRecord[] = [];
  const server = createServer(async (incoming, response) => {
    for await (const chunk of incoming) void chunk;
    requests++;
    response.once('close', () => closed.resolve());
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write(
      'data: {"type":"RUN_STARTED","threadId":"deadline-thread","runId":"deadline-run"}\n\n',
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const transport = createCandidateDeadlineTransport({
    delegate: new HttpTransport({
      baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/run`,
      fetchImpl: (url, init) => {
        if (init?.signal) observed.push(init.signal);
        return fetch(url, init);
      },
    }),
    deadlineMs: 200,
    observe: (record) => records.push(record),
  });
  let response: TransportResponse | undefined;
  const startedAt = performance.now();

  try {
    response = await transport.send(request());
    const iterator = response.events[Symbol.asyncIterator]();
    const acknowledgement = await within(iterator.next());
    const pending = iterator.next();

    expect(acknowledgement).toMatchObject({
      done: false,
      value: { type: 'RUN_STARTED' },
    });
    await expect(within(pending)).rejects.toMatchObject({
      name: 'TimeoutError',
    });
    await within(closed.promise);

    expect(requests).toBe(1);
    expect(observed).toHaveLength(1);
    expect(observed[0].aborted).toBe(true);
    expect(observed[0].reason).toMatchObject({ name: 'TimeoutError' });
    expect(records.filter((record) => record.kind === 'deadline')).toHaveLength(
      1,
    );
    expect(records.filter((record) => record.kind === 'started')).toHaveLength(
      1,
    );
    expect(
      records.every((record) => record.requestId === 'deadline-request'),
    ).toBe(true);
    expect(
      records.every(
        (record, index) =>
          Number.isFinite(record.monotonicMs) &&
          (index === 0 || record.monotonicMs >= records[index - 1].monotonicMs),
      ),
    ).toBe(true);
    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(190);
  } finally {
    await response?.dispose?.();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('candidate deadline preserves an already aborted caller reason without starting actual HTTP', async () => {
  const caller = new AbortController();
  const reason = new Error('cancelled before send');
  caller.abort(reason);
  let calls = 0;
  const records: CandidateDeadlineRecord[] = [];
  const transport = createCandidateDeadlineTransport({
    delegate: new HttpTransport({
      fetchImpl: async () => {
        calls++;
        throw new Error('fetch must not start');
      },
    }),
    deadlineMs: 40,
    observe: (record) => records.push(record),
  });

  await expect(transport.send(request(caller.signal))).rejects.toBe(reason);
  await new Promise((resolve) => setTimeout(resolve, 80));

  expect(calls).toBe(0);
  expect(records.filter((record) => record.kind === 'deadline')).toEqual([]);
});

test('candidate deadline completion awaits delegate disposal and removes caller listeners and timer', async () => {
  const caller = new AbortController();
  const removed = jest.spyOn(caller.signal, 'removeEventListener');
  const started = deferred<void>();
  const release = deferred<void>();
  const records: CandidateDeadlineRecord[] = [];
  let complete = false;
  const dispose = jest.fn(async () => {
    started.resolve();
    await release.promise;
  });
  const delegate: Transport = {
    name: 'complete',
    send: async () => completedResponse(dispose),
  };
  const response = await createCandidateDeadlineTransport({
    delegate,
    deadlineMs: 100,
    observe: (record) => records.push(record),
  }).send(request(caller.signal));
  const completion = response.events[Symbol.asyncIterator]()
    .next()
    .then((value) => {
      complete = true;
      return value;
    });

  try {
    await within(started.promise);

    expect(complete).toBe(false);
  } finally {
    release.resolve();
  }
  await expect(within(completion)).resolves.toMatchObject({ done: true });
  caller.abort(new Error('late caller cancellation'));
  await new Promise((resolve) => setTimeout(resolve, 140));

  expect(dispose).toHaveBeenCalledTimes(1);
  expect(removed.mock.calls.some(([type]) => type === 'abort')).toBe(true);
  expect(
    records.filter(
      (record) => record.kind === 'deadline' || record.kind === 'aborted',
    ),
  ).toEqual([]);
  removed.mockRestore();
});

test('candidate deadline stream errors retain the original error and await delegate disposal', async () => {
  const original = new Error('actual delegate stream failure');
  const started = deferred<void>();
  const release = deferred<void>();
  const dispose = jest.fn(async () => {
    started.resolve();
    await release.promise;
  });
  const records: CandidateDeadlineRecord[] = [];
  let rejected = false;
  const delegate: Transport = {
    name: 'failing-events',
    send: async () => ({
      events: {
        [Symbol.asyncIterator]: () => ({
          next: async () => {
            throw original;
          },
        }),
      },
      dispose,
    }),
  };
  const response = await createCandidateDeadlineTransport({
    delegate,
    deadlineMs: 100,
    observe: (record) => records.push(record),
  }).send(request());
  const failure = response.events[Symbol.asyncIterator]()
    .next()
    .catch((error: unknown) => {
      rejected = true;
      throw error;
    });
  const assertion = expect(failure).rejects.toBe(original);

  try {
    await within(started.promise);

    expect(rejected).toBe(false);
  } finally {
    release.resolve();
  }
  await within(assertion);
  await new Promise((resolve) => setTimeout(resolve, 140));

  expect(dispose).toHaveBeenCalledTimes(1);
  expect(records.filter((record) => record.kind === 'deadline')).toEqual([]);
});

test('candidate deadline explicit disposal awaits its delegate once and prevents later timeout or caller signals', async () => {
  const caller = new AbortController();
  const entered = deferred<void>();
  const release = deferred<void>();
  const records: CandidateDeadlineRecord[] = [];
  const dispose = jest.fn(async () => {
    entered.resolve();
    await release.promise;
  });
  const delegate: Transport = {
    name: 'explicit-dispose',
    send: async () => completedResponse(dispose),
  };
  const response = await createCandidateDeadlineTransport({
    delegate,
    deadlineMs: 100,
    observe: (record) => records.push(record),
  }).send(request(caller.signal));
  if (!response.dispose) throw new Error('Owned response disposal required');
  let finished = false;
  const first = Promise.resolve(response.dispose()).then(() => {
    finished = true;
  });
  const second = Promise.resolve(response.dispose());

  try {
    await within(entered.promise);

    expect(finished).toBe(false);
  } finally {
    release.resolve();
  }
  await within(Promise.all([first, second]));
  caller.abort(new Error('late abort after disposal'));
  await new Promise((resolve) => setTimeout(resolve, 140));

  expect(dispose).toHaveBeenCalledTimes(1);
  expect(
    records.filter(
      (record) => record.kind === 'deadline' || record.kind === 'aborted',
    ),
  ).toEqual([]);
});

test('candidate deadline wrapper preserves real cold runtime one-attempt HTTP policy without accessing private request markers', async () => {
  let calls = 0;
  const bodies: string[] = [];
  const server = createServer(async (incoming, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
    calls++;
    bodies.push(Buffer.concat(chunks).toString('utf8'));
    response
      .writeHead(500, { 'Retry-After': '0' })
      .end('Actual ambiguous upstream failure');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const shouldRetry = jest.fn(() => true);
  const handler = jest.fn(async () => 'must not replay');
  const runtime = createChatRuntime({
    system: 'trusted',
    debounce: 0,
    retries: 2,
    tools: [
      {
        name: 'save',
        description: 'save',
        schema: s.object('args', { value: s.number('value') }),
        handler,
      },
    ],
    transport: createCandidateDeadlineTransport({
      delegate: new HttpTransport({
        baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/run`,
        retry: { maxRetries: 2, maxElapsedMs: 1000, delayMs: 0, shouldRetry },
      }),
      deadlineMs: 1000,
    }),
  });
  const snapshot: ConversationSnapshot = {
    threadId: 'retained-deadline-thread',
    configuredSystemMessageId: 'original-system',
    messages: [
      { id: 'original-system', role: 'system', content: 'trusted' },
      { id: 'original-user', role: 'user', content: 'save this' },
      {
        id: 'original-assistant',
        role: 'assistant',
        toolCalls: [
          {
            id: 'browser-call',
            type: 'function',
            function: { name: 'save', arguments: '{"value":7}' },
          },
        ],
      },
    ],
    pendingBrowserRecovery: {
      protocolVersion: 1,
      serverRevision: 27,
      callIds: ['browser-call'],
    },
  };
  let cleanup: (() => void) | undefined;
  let waitingForFailure = true;
  try {
    await settle();
    runtime.restoreConversation(snapshot, {
      expectedRevision: runtime.recovery().revision,
    });
    const batch = runtime.pendingConversationRecovery();
    if (!batch) throw new Error('Actual restored pending batch required');
    const options = {
      batchId: batch.id,
      outcomes: [
        { toolCallId: 'browser-call', status: 'unavailable' as const },
      ],
    };
    cleanup = runtime.start();
    await settle();

    runtime.resumeConversationRecovery(options);
    await within(
      (async () => {
        while (waitingForFailure && !runtime.recovery().required)
          await new Promise((resolve) => setTimeout(resolve, 5));
        if (!runtime.recovery().required)
          throw new Error('Recovery-required state was not observed');
      })(),
    );

    expect(calls).toBe(1);
    expect(shouldRetry).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(
      JSON.parse(bodies[0]).forwardedProps.hashbrown.recovery.serverRevision,
    ).toBe(27);
    expect(() => runtime.resumeConversationRecovery(options)).toThrow();
    cleanup();
    cleanup = runtime.start();
    await settle();
    expect(calls).toBe(1);
  } finally {
    waitingForFailure = false;
    cleanup?.();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('candidate deadline wrapper rejects invalid finite-deadline policy before delegation', () => {
  const send = jest.fn(async () => completedResponse());
  const delegate: Transport = { name: 'invalid-policy', send };

  for (const deadlineMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])
    expect(() =>
      createCandidateDeadlineTransport({ delegate, deadlineMs }),
    ).toThrow();

  expect(send).not.toHaveBeenCalled();
});

test('candidate deadline observations retain the actual composed abort reason and distinguish deadline from caller source', async () => {
  const observed: {
    source: 'deadline' | 'caller';
    signal: AbortSignal;
    records: CandidateDeadlineRecord[];
    abortAtRecord: { aborted: boolean; reason: unknown }[];
    reason: { name: string; message: string };
  }[] = [];

  for (const source of ['deadline', 'caller'] as const) {
    const entered = deferred<TransportRequest>();
    const caller = new AbortController();
    const callerReason = new Error('owned actual caller reason');
    const records: CandidateDeadlineRecord[] = [];
    const captured: TransportRequest[] = [];
    const abortAtRecord: { aborted: boolean; reason: unknown }[] = [];
    const delegate: Transport = {
      name: `observed-${source}-abort`,
      send: (value) => {
        captured.push(value);
        entered.resolve(value);
        return new Promise((_resolve, reject) => {
          value.signal.addEventListener(
            'abort',
            () => reject(value.signal.reason),
            { once: true },
          );
        });
      },
    };
    const transport = createCandidateDeadlineTransport({
      delegate,
      deadlineMs: source === 'deadline' ? 40 : 1000,
      observe: (entry) => {
        records.push(entry);
        if (entry.kind === (source === 'deadline' ? 'deadline' : 'aborted')) {
          const signal = captured[0]?.signal;
          abortAtRecord.push({
            aborted: signal?.aborted ?? false,
            reason: signal?.reason,
          });
        }
      },
    });
    const pending = transport.send(request(caller.signal));
    const rejection =
      source === 'deadline'
        ? expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })
        : expect(pending).rejects.toBe(callerReason);
    const forwarded = await within(entered.promise);

    if (source === 'caller') caller.abort(callerReason);
    await within(rejection);

    expect(forwarded.signal.aborted).toBe(true);
    if (source === 'caller') expect(forwarded.signal.reason).toBe(callerReason);
    else
      expect(forwarded.signal.reason).toMatchObject({
        name: 'TimeoutError',
        message: 'Candidate transport deadline exceeded',
      });
    observed.push({
      source,
      signal: forwarded.signal,
      records,
      abortAtRecord,
      reason:
        source === 'deadline'
          ? {
              name: 'TimeoutError',
              message: 'Candidate transport deadline exceeded',
            }
          : { name: 'Error', message: callerReason.message },
    });
  }

  for (const observation of observed) {
    expect(observation.signal.aborted).toBe(true);
    expect(observation.records).toContainEqual(
      expect.objectContaining({
        kind: observation.source === 'deadline' ? 'deadline' : 'aborted',
        requestId: 'deadline-request',
        abortSource: observation.source,
        abortReason: observation.reason,
      }),
    );
    expect(observation.abortAtRecord).toEqual([
      { aborted: true, reason: observation.signal.reason },
    ]);
  }
});
