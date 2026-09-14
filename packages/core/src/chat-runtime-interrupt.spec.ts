import { s } from './schema';
import { type AGUIEvent, EventType } from '@ag-ui/core';
import { createChatRuntime } from './chat-runtime';
import type { PendingInterruptBatch, ResumeOptions } from './models/interrupt';
import type { TransportRequest } from './transport';

type InterruptRuntime = ReturnType<typeof createChatRuntime> & {
  pendingInterrupts: () => PendingInterruptBatch | undefined;
  isResuming: () => boolean;
  resume: (options: ResumeOptions) => void;
};

function requireBatch(runtime: {
  pendingInterrupts: () => PendingInterruptBatch | undefined;
}): PendingInterruptBatch {
  const batch = runtime.pendingInterrupts();
  if (!batch) throw new Error('Expected a pending batch');
  return batch;
}

async function idle(runtime: { isLoading: () => boolean }) {
  for (let i = 0; i < 100; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (!runtime.isLoading()) return;
  }
  throw new Error('Runtime did not settle');
}

function interrupted(request: TransportRequest): AsyncIterable<AGUIEvent> {
  const identity = {
    threadId: request.input.threadId,
    runId: request.input.runId,
  };
  return (async function* () {
    yield { type: EventType.RUN_STARTED, ...identity };
    yield { type: EventType.STATE_SNAPSHOT, snapshot: { count: 2 } };
    yield {
      type: EventType.RUN_FINISHED,
      ...identity,
      outcome: {
        type: 'interrupt',
        interrupts: [{ id: 'approval', reason: 'approval' }],
      },
    };
  })();
}

test('publishes an immutable interrupt checkpoint and claims captured state synchronously', async () => {
  const requests: TransportRequest[] = [];
  const runtime = createChatRuntime({
    system: 'test',
    debounce: 0,
    state: { count: 1 },
    messages: [{ role: 'user', content: 'go' }],
    transport: {
      name: 'test',
      send: async (request) => {
        requests.push(request);
        return { events: interrupted(request) };
      },
    },
  }) as InterruptRuntime;
  const cleanup = runtime.start();
  await idle(runtime);

  expect(typeof runtime.pendingInterrupts).toBe('function');
  const batch = requireBatch(runtime);
  expect(batch?.interrupts).toEqual([{ id: 'approval', reason: 'approval' }]);
  expect(Object.isFrozen(batch)).toBe(true);
  expect(runtime.state()).toEqual({ count: 2 });
  expect(runtime.isResuming()).toBe(false);
  expect(() => runtime.sendMessage({ role: 'user', content: 'again' })).toThrow(
    /interrupt/i,
  );
  expect(() => runtime.resume({ batchId: batch.id, entries: [] })).toThrow(
    /responses/i,
  );
  runtime.setState({ count: 3 });
  runtime.resume({
    batchId: batch.id,
    entries: [{ interruptId: 'approval', status: 'resolved', payload: true }],
  });
  expect(runtime.pendingInterrupts()).toBe(batch);
  expect(runtime.isResuming()).toBe(true);
  expect(runtime.isLoading()).toBe(true);
  expect(() => runtime.resume({ batchId: batch.id, entries: [] })).toThrow(
    /claimed/i,
  );
  expect(() => runtime.setState({ count: 4 })).toThrow();
  await idle(runtime);

  expect(requests).toHaveLength(2);
  expect(requests[1].input.state).toEqual({ count: 3 });
  expect(requests[1].input.resume).toEqual([
    { interruptId: 'approval', status: 'resolved', payload: true },
  ]);
  expect(runtime.pendingInterrupts()?.id).not.toBe(batch?.id);
  expect(runtime.isResuming()).toBe(false);
  cleanup();
});

test('pauses partial structured output without finalizing or running local calls', async () => {
  const handler = jest.fn(async () => 'done');
  const runtime = createChatRuntime({
    system: 'test',
    debounce: 0,
    responseSchema: s.object('result', { answer: s.string('answer') }),
    tools: [
      {
        name: 'save',
        description: 'save',
        schema: s.object('args', {}),
        handler,
      },
    ],
    messages: [{ role: 'user', content: 'go' }],
    transport: {
      name: 'test',
      send: async (request) => ({
        events: (async function* () {
          const identity = {
            threadId: request.input.threadId,
            runId: request.input.runId,
          };
          yield { type: EventType.RUN_STARTED, ...identity };
          yield {
            type: EventType.TEXT_MESSAGE_START,
            messageId: 'partial',
            role: 'assistant',
          };
          yield {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: 'partial',
            delta: '{"answer":"Need approval"',
          };
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId: 'old',
            toolCallName: 'save',
            parentMessageId: 'partial',
          };
          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: 'old',
            delta: '{}',
          };
          yield {
            type: EventType.RUN_FINISHED,
            ...identity,
            outcome: {
              type: 'interrupt',
              interrupts: [{ id: 'approval', reason: 'approval' }],
            },
          };
        })(),
      }),
    },
  });
  const cleanup = runtime.start();
  await idle(runtime);

  expect(runtime.pendingInterrupts()).toBeDefined();
  expect(runtime.error()).toBeUndefined();
  expect(handler).not.toHaveBeenCalled();
  expect(runtime.isLoading()).toBe(false);
  cleanup();
});

test('post-ack failure consumes ownership and requires a different thread', async () => {
  let calls = 0;
  const runtime = createChatRuntime({
    system: 'test',
    debounce: 0,
    retries: 2,
    threadId: 'original',
    state: { count: 1 },
    messages: [{ role: 'user', content: 'go' }],
    transport: {
      name: 'test',
      send: async (request) => {
        calls++;
        return {
          events:
            calls === 1
              ? interrupted(request)
              : (async function* () {
                  yield {
                    type: EventType.RUN_STARTED,
                    threadId: request.input.threadId,
                    runId: request.input.runId,
                  };
                  yield {
                    type: EventType.STATE_SNAPSHOT,
                    snapshot: { count: 99 },
                  };
                  throw new Error('failed after ack');
                })(),
        };
      },
    },
  });
  const cleanup = runtime.start();
  await idle(runtime);
  const batch = requireBatch(runtime);
  runtime.resume({
    batchId: batch.id,
    entries: [{ interruptId: 'approval', status: 'cancelled' }],
  });
  await idle(runtime);

  expect(calls).toBe(2);
  expect(runtime.pendingInterrupts()).toBeUndefined();
  expect(runtime.state()).toEqual({ count: 2 });
  expect(runtime.error()?.message).toBe('failed after ack');
  expect(() => runtime.resendMessages()).toThrow(/new thread/i);
  runtime.updateOptions({ threadId: 'original' });
  expect(() => runtime.setMessages([])).toThrow(/new thread/i);
  runtime.updateOptions({ threadId: 'replacement' });
  expect(() => runtime.setMessages([])).not.toThrow();
  cleanup();
});

test('an atomic interrupt subscriber can edit state and immediately resume', async () => {
  let calls = 0;
  const requests: TransportRequest[] = [];
  const runtime = createChatRuntime({
    system: 'test',
    debounce: 0,
    state: { count: 1 },
    messages: [{ role: 'user', content: 'go' }],
    transport: {
      name: 'test',
      send: async (request) => {
        calls++;
        requests.push(request);
        return {
          events:
            calls === 1
              ? interrupted(request)
              : (async function* () {
                  const identity = {
                    threadId: request.input.threadId,
                    runId: request.input.runId,
                  };
                  yield { type: EventType.RUN_STARTED, ...identity };
                  yield { type: EventType.RUN_FINISHED, ...identity };
                })(),
        };
      },
    },
  });
  let subscriberError: unknown;
  const off = runtime.pendingInterrupts.subscribe((batch) => {
    if (!batch) return;
    try {
      expect(runtime.isLoading()).toBe(false);
      runtime.setState({ count: 7 });
      runtime.resume({
        batchId: batch.id,
        entries: [{ interruptId: 'approval', status: 'resolved' }],
      });
      expect(runtime.isResuming()).toBe(true);
      expect(runtime.isLoading()).toBe(true);
      expect(() => runtime.resume({ batchId: batch.id, entries: [] })).toThrow(
        /claimed/i,
      );
      expect(() => runtime.setState({ count: 8 })).toThrow();
    } catch (error) {
      subscriberError = error;
    }
  });
  const cleanup = runtime.start();
  await idle(runtime);

  expect(subscriberError).toBeUndefined();
  expect(requests).toHaveLength(2);
  expect(requests[1].input.state).toEqual({ count: 7 });
  off();
  cleanup();
});

test('stop before sending releases the same batch synchronously', async () => {
  let calls = 0;
  const runtime = createChatRuntime({
    system: 'test',
    debounce: 0,
    messages: [{ role: 'user', content: 'go' }],
    transport: {
      name: 'test',
      send: async (request) => {
        calls++;
        return { events: interrupted(request) };
      },
    },
  });
  const cleanup = runtime.start();
  await idle(runtime);
  const batch = requireBatch(runtime);
  runtime.updateOptions({ debounce: 50 });
  runtime.resume({
    batchId: batch.id,
    entries: [{ interruptId: 'approval', status: 'cancelled' }],
  });

  let subscriberError: unknown;
  const off = runtime.isResuming.subscribe((resuming) => {
    if (resuming) return;
    try {
      runtime.setState({ changed: true });
    } catch (error) {
      subscriberError = error;
    }
  });
  runtime.stop();

  expect(subscriberError).toBeUndefined();
  off();
  expect(runtime.pendingInterrupts()).toBe(batch);
  expect(runtime.isResuming()).toBe(false);
  expect(runtime.isLoading()).toBe(false);
  expect(() => runtime.setState({ changed: true })).not.toThrow();
  await idle(runtime);
  expect(calls).toBe(1);
  cleanup();
});

test('pre-start failure releases the claim and allows an immediate new resume from an error subscriber', async () => {
  let calls = 0;
  const runtime = createChatRuntime({
    system: 'test',
    debounce: 0,
    retries: 0,
    messages: [{ role: 'user', content: 'go' }],
    transport: {
      name: 'test',
      send: async (request) => {
        calls++;
        if (calls === 2) throw new Error('before ack');
        return { events: interrupted(request) };
      },
    },
  });
  const cleanup = runtime.start();
  await idle(runtime);
  const batch = requireBatch(runtime);
  let subscriberError: unknown;
  const off = runtime.error.subscribe((error) => {
    if (!error) return;
    try {
      expect(runtime.isResuming()).toBe(false);
      runtime.setState({ editedAfterFailure: true });
      runtime.resume({
        batchId: batch.id,
        entries: [{ interruptId: 'approval', status: 'cancelled' }],
      });
    } catch (error) {
      subscriberError = error;
    }
  });

  runtime.resume({
    batchId: batch.id,
    entries: [{ interruptId: 'approval', status: 'cancelled' }],
  });
  await idle(runtime);

  expect(subscriberError).toBeUndefined();
  expect(calls).toBe(3);
  expect(runtime.error()).toBeUndefined();
  expect(runtime.pendingInterrupts()?.id).not.toBe(batch.id);
  off();
  cleanup();
});

test('expiry during transport factory resolution prevents sending and retains the batch', async () => {
  const runtime = createChatRuntime({
    system: 'test',
    debounce: 0,
    messages: [{ role: 'user', content: 'go' }],
    transport: {
      name: 'test',
      send: async (request) => ({
        events: (async function* () {
          const identity = {
            threadId: request.input.threadId,
            runId: request.input.runId,
          };
          yield { type: EventType.RUN_STARTED, ...identity };
          yield {
            type: EventType.RUN_FINISHED,
            ...identity,
            outcome: {
              type: 'interrupt',
              interrupts: [
                {
                  id: 'approval',
                  reason: 'approval',
                  expiresAt: new Date(Date.now() + 60000).toISOString(),
                },
              ],
            },
          };
        })(),
      }),
    },
  });
  const cleanup = runtime.start();
  await idle(runtime);
  const batch = requireBatch(runtime);
  const send = jest.fn();
  const now = jest.spyOn(Date, 'now');
  runtime.updateOptions({
    transport: () => {
      now.mockReturnValue(Date.parse(batch.interrupts[0].expiresAt ?? '') + 1);
      return { name: 'test', send };
    },
  });

  runtime.resume({
    batchId: batch.id,
    entries: [{ interruptId: 'approval', status: 'cancelled' }],
  });
  await idle(runtime);

  expect(send).not.toHaveBeenCalled();
  expect(runtime.pendingInterrupts()).toBe(batch);
  expect(runtime.isResuming()).toBe(false);
  expect(runtime.error()?.message).toMatch(/expired/i);
  now.mockRestore();
  cleanup();
});

test('resumed execution correlates historical results and only executes new calls through followups', async () => {
  const requests: TransportRequest[] = [];
  let resolveTool!: (value: string) => void;
  const handler = jest.fn(
    () =>
      new Promise<string>((resolve) => {
        resolveTool = resolve;
      }),
  );
  const runtime = createChatRuntime({
    system: 'test',
    debounce: 0,
    tools: [
      {
        name: 'save',
        description: 'save',
        schema: s.object('args', {}),
        handler,
      },
    ],
    messages: [{ role: 'user', content: 'go' }],
    transport: {
      name: 'test',
      send: async (request) => {
        requests.push(request);
        const round = requests.length;
        return {
          events: (async function* () {
            const identity = {
              threadId: request.input.threadId,
              runId: request.input.runId,
            };
            yield { type: EventType.RUN_STARTED, ...identity };
            if (round === 2)
              yield {
                type: EventType.TOOL_CALL_RESULT,
                messageId: 'server-result',
                toolCallId: 'old',
                content: 'approved',
                role: 'tool',
              };
            if (round < 3) {
              const id = round === 1 ? 'old' : 'new';
              yield {
                type: EventType.TOOL_CALL_START,
                toolCallId: id,
                toolCallName: 'save',
                parentMessageId: `assistant-${round}`,
              };
              yield {
                type: EventType.TOOL_CALL_ARGS,
                toolCallId: id,
                delta: '{}',
              };
              yield { type: EventType.TOOL_CALL_END, toolCallId: id };
            }
            yield {
              type: EventType.RUN_FINISHED,
              ...identity,
              ...(round === 1
                ? {
                    outcome: {
                      type: 'interrupt' as const,
                      interrupts: [{ id: 'approval', reason: 'approval' }],
                    },
                  }
                : {}),
            };
          })(),
        };
      },
    },
  });
  const cleanup = runtime.start();
  await idle(runtime);
  expect(handler).not.toHaveBeenCalled();
  const batch = requireBatch(runtime);
  runtime.resume({
    batchId: batch.id,
    entries: [{ interruptId: 'approval', status: 'resolved' }],
  });
  for (let i = 0; i < 100 && !resolveTool; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));

  expect(handler).toHaveBeenCalledTimes(1);
  expect(runtime.isResuming()).toBe(true);
  expect(runtime.isLoading()).toBe(true);
  resolveTool('saved');
  await idle(runtime);

  expect(requests).toHaveLength(3);
  expect(requests[2].input.resume).toBeUndefined();
  expect(requests[2].input.messages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        role: 'tool',
        toolCallId: 'old',
        content: 'approved',
      }),
      expect.objectContaining({
        role: 'tool',
        toolCallId: 'new',
        content: 'saved',
      }),
    ]),
  );
  expect(handler).toHaveBeenCalledTimes(1);
  expect(runtime.isResuming()).toBe(false);
  cleanup();
});

test('a failed followup before its own acknowledgement requires recovery', async () => {
  let calls = 0;
  const runtime = createChatRuntime({
    system: 'test',
    debounce: 0,
    retries: 0,
    tools: [
      {
        name: 'save',
        description: 'save',
        schema: s.object('args', {}),
        handler: async () => 'saved',
      },
    ],
    messages: [{ role: 'user', content: 'go' }],
    transport: {
      name: 'test',
      send: async (request) => {
        calls++;
        if (calls === 3) throw new Error('followup before ack');
        if (calls === 1) return { events: interrupted(request) };
        return {
          events: (async function* () {
            const identity = {
              threadId: request.input.threadId,
              runId: request.input.runId,
            };
            yield { type: EventType.RUN_STARTED, ...identity };
            yield {
              type: EventType.STATE_SNAPSHOT,
              snapshot: { committed: true },
            };
            yield {
              type: EventType.TOOL_CALL_START,
              toolCallId: 'new',
              toolCallName: 'save',
              parentMessageId: 'new-assistant',
            };
            yield {
              type: EventType.TOOL_CALL_ARGS,
              toolCallId: 'new',
              delta: '{}',
            };
            yield { type: EventType.TOOL_CALL_END, toolCallId: 'new' };
            yield { type: EventType.RUN_FINISHED, ...identity };
          })(),
        };
      },
    },
  });
  const cleanup = runtime.start();
  await idle(runtime);
  runtime.resume({
    batchId: requireBatch(runtime).id,
    entries: [{ interruptId: 'approval', status: 'resolved' }],
  });

  await idle(runtime);

  expect(calls).toBe(3);
  expect(runtime.state()).toEqual({ committed: true });
  expect(runtime.error()?.message).toBe('followup before ack');
  expect(runtime.pendingInterrupts()).toBeUndefined();
  expect(runtime.isResuming()).toBe(false);
  expect(() => runtime.resendMessages()).toThrow(/new thread/i);
  cleanup();
});

test('message supersession after resume acknowledgement ends resumed ownership without recovery', async () => {
  let calls = 0;
  let resumeStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    resumeStarted = resolve;
  });
  const runtime = createChatRuntime({
    system: 'test',
    debounce: 0,
    messages: [{ role: 'user', content: 'go' }],
    transport: {
      name: 'test',
      send: async (request) => {
        calls++;
        if (calls !== 2) return { events: interrupted(request) };
        return {
          events: (async function* () {
            yield {
              type: EventType.RUN_STARTED,
              threadId: request.input.threadId,
              runId: request.input.runId,
            };
            resumeStarted();
            await new Promise<void>((resolve) =>
              request.signal.addEventListener('abort', () => resolve(), {
                once: true,
              }),
            );
          })(),
        };
      },
    },
  });
  const cleanup = runtime.start();
  await idle(runtime);
  runtime.resume({
    batchId: requireBatch(runtime).id,
    entries: [{ interruptId: 'approval', status: 'resolved' }],
  });
  await started;

  runtime.setMessages([]);
  await idle(runtime);

  expect(runtime.isResuming()).toBe(false);
  expect(() => runtime.setMessages([])).not.toThrow();
  cleanup();
});

test('an interrupt subscriber can synchronously retire the thread and replace messages', async () => {
  const runtime = createChatRuntime({
    system: 'test',
    threadId: 'old',
    debounce: 0,
    messages: [{ role: 'user', content: 'go' }],
    transport: {
      name: 'test',
      send: async (request) => ({ events: interrupted(request) }),
    },
  });
  let subscriberError: unknown;
  const off = runtime.pendingInterrupts.subscribe((batch) => {
    if (!batch) return;
    try {
      runtime.updateOptions({ threadId: 'replacement' });
      runtime.setMessages([]);
    } catch (error) {
      subscriberError = error;
    }
  });
  const cleanup = runtime.start();

  await idle(runtime);

  expect(subscriberError).toBeUndefined();
  expect(runtime.threadId()).toBe('replacement');
  expect(runtime.pendingInterrupts()).toBeUndefined();
  expect(runtime.messages()).toEqual([]);
  off();
  cleanup();
});

test('completion scheduling distinguishes successful resume settlement from a released claim', async () => {
  const module = await import('./chat-runtime');
  const accessor = (
    module as typeof module & {
      ɵgetRuntimeSchedulingState: (runtime: object) => () => {
        threadEpoch: number;
        successfulResumes: number;
        recoveryRequired: boolean;
      };
    }
  ).ɵgetRuntimeSchedulingState;
  const runtime = createChatRuntime({ system: 'test' });

  expect(typeof accessor).toBe('function');
  const scheduling = accessor(runtime);
  expect(scheduling()).toBe(scheduling());
  expect(scheduling()).toMatchObject({
    threadEpoch: 0,
    successfulResumes: 0,
    recoveryRequired: false,
  });
  runtime.updateOptions({ threadId: 'new' });

  expect(scheduling().threadEpoch).toBe(1);
  expect(scheduling().successfulResumes).toBe(0);
});

test('pre-start retries reuse owned answers and the captured checkpoint', async () => {
  const requests: TransportRequest[] = [];
  const payload = { answer: 'yes' };
  const runtime = createChatRuntime({
    system: 'original',
    state: { count: 1 },
    retries: 1,
    debounce: 0,
    messages: [{ role: 'user', content: 'go' }],
    transport: {
      name: 'test',
      send: async (request) => {
        requests.push(request);
        if (requests.length === 2) throw new Error('retry before ack');
        return { events: interrupted(request) };
      },
    },
  });
  const cleanup = runtime.start();
  await idle(runtime);
  const batch = requireBatch(runtime);
  runtime.setState({ count: 5 });
  const options = {
    batchId: batch.id,
    entries: [
      { interruptId: 'approval', status: 'resolved' as const, payload },
    ],
  };

  runtime.resume(options);
  payload.answer = 'mutated';
  runtime.updateOptions({ system: 'changed after claim' });
  await idle(runtime);

  expect(requests).toHaveLength(3);
  expect(requests[1].input.messages).toEqual(requests[2].input.messages);
  expect(requests[2].input.messages[0]).toMatchObject({
    role: 'system',
    content: 'original',
  });
  expect(requests[1].input.state).toEqual({ count: 5 });
  expect(requests[2].input.state).toEqual({ count: 5 });
  expect(requests[2].input.resume).toEqual([
    { interruptId: 'approval', status: 'resolved', payload: { answer: 'yes' } },
  ]);
  cleanup();
});

test('stopping after acknowledgement keeps ownership consumed and requires recovery', async () => {
  let calls = 0;
  let signalStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  const runtime = createChatRuntime({
    system: 'test',
    debounce: 0,
    messages: [{ role: 'user', content: 'go' }],
    transport: {
      name: 'test',
      send: async (request) => {
        calls++;
        if (calls === 1) return { events: interrupted(request) };
        return {
          events: (async function* () {
            yield {
              type: EventType.RUN_STARTED,
              threadId: request.input.threadId,
              runId: request.input.runId,
            };
            signalStarted();
            await new Promise<void>((resolve) =>
              request.signal.addEventListener('abort', () => resolve(), {
                once: true,
              }),
            );
          })(),
        };
      },
    },
  });
  const cleanup = runtime.start();
  await idle(runtime);
  runtime.resume({
    batchId: requireBatch(runtime).id,
    entries: [{ interruptId: 'approval', status: 'cancelled' }],
  });
  await started;

  runtime.stop();
  await idle(runtime);

  expect(runtime.pendingInterrupts()).toBeUndefined();
  expect(runtime.isResuming()).toBe(false);
  expect(runtime.state()).toEqual({ count: 2 });
  expect(() => runtime.sendMessage({ role: 'user', content: 'again' })).toThrow(
    /new thread/i,
  );
  cleanup();
});

test('every terminal subscriber sees the checkpoint, batch, and idle flags together', async () => {
  const runtime = createChatRuntime({
    system: 'test',
    debounce: 0,
    state: { count: 1 },
    messages: [{ role: 'user', content: 'go' }],
    transport: {
      name: 'test',
      send: async (request) => ({
        events: (async function* () {
          const identity = {
            threadId: request.input.threadId,
            runId: request.input.runId,
          };
          yield { type: EventType.RUN_STARTED, ...identity };
          yield { type: EventType.STATE_SNAPSHOT, snapshot: { count: 2 } };
          yield {
            type: EventType.TEXT_MESSAGE_START,
            messageId: 'checkpoint',
            role: 'assistant',
          };
          yield {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: 'checkpoint',
            delta: 'Approval needed',
          };
          yield {
            type: EventType.RUN_FINISHED,
            ...identity,
            outcome: {
              type: 'interrupt',
              interrupts: [{ id: 'approval', reason: 'approval' }],
            },
          };
        })(),
      }),
    },
  });
  const snapshots: Array<{
    source: string;
    loading: boolean;
    pending: boolean;
    count: number | undefined;
    output: unknown;
    resuming: boolean;
    tools: boolean;
  }> = [];
  const record = (source: string) =>
    snapshots.push({
      source,
      loading: runtime.isLoading(),
      pending: runtime.pendingInterrupts() !== undefined,
      count: runtime.state()?.count,
      output: runtime.lastAssistantMessage()?.content,
      resuming: runtime.isResuming(),
      tools: runtime.isRunningToolCalls(),
    });
  const cleanups = [
    runtime.state.subscribe(() => record('state')),
    runtime.messages.subscribe(() => record('messages')),
    runtime.isLoading.subscribe(() => record('loading')),
    runtime.pendingInterrupts.subscribe(() => record('interrupts')),
    runtime.isResuming.subscribe(() => record('resuming')),
  ];
  const cleanup = runtime.start();

  await idle(runtime);

  const terminal = snapshots.filter(
    (snapshot) => !snapshot.loading && snapshot.count === 2,
  );
  expect(terminal.length).toBeGreaterThan(0);
  expect(
    terminal.every(
      (snapshot) =>
        snapshot.pending &&
        !snapshot.resuming &&
        !snapshot.tools &&
        snapshot.output === 'Approval needed',
    ),
  ).toBe(true);
  expect(
    snapshots
      .filter((snapshot) => snapshot.pending)
      .every(
        (snapshot) =>
          !snapshot.loading &&
          snapshot.count === 2 &&
          snapshot.output === 'Approval needed',
      ),
  ).toBe(true);
  cleanups.forEach((off) => off());
  cleanup();
});

test('stop at an acknowledged model boundary requires recovery until whole interaction settlement', async () => {
  let calls = 0;
  const runtime = createChatRuntime({
    system: 'test',
    debounce: 0,
    messages: [{ role: 'user', content: 'go' }],
    transport: {
      name: 'test',
      send: async (request) => {
        calls++;
        if (calls === 1) return { events: interrupted(request) };
        return {
          events: (async function* () {
            const identity = {
              threadId: request.input.threadId,
              runId: request.input.runId,
            };
            yield { type: EventType.RUN_STARTED, ...identity };
            yield { type: EventType.RUN_FINISHED, ...identity };
          })(),
        };
      },
    },
  });
  const cleanup = runtime.start();
  await idle(runtime);
  let received = false;
  let stopError: unknown;
  const off = runtime.isReceiving.subscribe((receiving) => {
    received ||= receiving;
    if (received && !receiving && runtime.isResuming()) {
      try {
        runtime.stop();
      } catch (error) {
        stopError = error;
      }
    }
  });

  runtime.resume({
    batchId: requireBatch(runtime).id,
    entries: [{ interruptId: 'approval', status: 'resolved' }],
  });
  await idle(runtime);

  expect(stopError).toBeUndefined();
  expect(() => runtime.resendMessages()).toThrow(/new thread/i);
  off();
  cleanup();
});

test.each([
  {
    label: 'malformed interrupted output',
    content: '{!invalid',
    interrupt: true,
  },
  {
    label: 'malformed ordinary output',
    content: '{!invalid',
    interrupt: false,
  },
  {
    label: 'incomplete ordinary output',
    content: '{"answer":"ok',
    interrupt: false,
  },
])(
  'resumed $label fails the interaction without publishing success or another batch',
  async ({ content, interrupt }) => {
    const { ɵgetRuntimeSchedulingState } = await import('./chat-runtime');
    let calls = 0;
    const runtime = createChatRuntime({
      system: 'test',
      debounce: 0,
      retries: 2,
      state: { count: 1 },
      responseSchema: s.object('result', {
        answer: s.string('answer'),
        count: s.number('count'),
      }),
      messages: [{ role: 'user', content: 'go' }],
      transport: {
        name: 'test',
        send: async (request) => {
          calls++;
          if (calls === 1) return { events: interrupted(request) };
          return {
            events: (async function* () {
              const identity = {
                threadId: request.input.threadId,
                runId: request.input.runId,
              };
              yield { type: EventType.RUN_STARTED, ...identity };
              yield { type: EventType.STATE_SNAPSHOT, snapshot: { count: 99 } };
              yield {
                type: EventType.TEXT_MESSAGE_START,
                messageId: 'invalid',
                role: 'assistant',
              };
              yield {
                type: EventType.TEXT_MESSAGE_CONTENT,
                messageId: 'invalid',
                delta: content,
              };
              yield {
                type: EventType.RUN_FINISHED,
                ...identity,
                ...(interrupt
                  ? {
                      outcome: {
                        type: 'interrupt' as const,
                        interrupts: [{ id: 'again', reason: 'approval' }],
                      },
                    }
                  : {}),
              };
            })(),
          };
        },
      },
    });
    const cleanup = runtime.start();
    await idle(runtime);
    const checkpoint = runtime.messages();
    const scheduling = ɵgetRuntimeSchedulingState(runtime);

    runtime.resume({
      batchId: requireBatch(runtime).id,
      entries: [{ interruptId: 'approval', status: 'resolved' }],
    });
    for (let i = 0; i < 10; i++)
      await new Promise((resolve) => setTimeout(resolve, 0));

    expect(runtime.isLoading()).toBe(false);
    expect(runtime.isResuming()).toBe(false);
    expect(runtime.pendingInterrupts()).toBeUndefined();
    expect(runtime.state()).toEqual({ count: 2 });
    expect(
      runtime.messages().filter((message) => message.role !== 'error'),
    ).toEqual(checkpoint);
    expect(runtime.error()).toBeInstanceOf(Error);
    expect(scheduling()).toMatchObject({
      recoveryRequired: true,
      successfulResumes: 0,
    });
    expect(calls).toBe(2);
    expect(() =>
      runtime.sendMessage({ role: 'user', content: 'again' }),
    ).toThrow(/new thread/i);
    cleanup();
  },
);

test('thread retirement preserves committed history and rejects cancellation and late tool results', async () => {
  const requests: TransportRequest[] = [];
  let toolInvocations = 0;
  let resolvePending!: (value: string) => void;
  let pendingSignal: AbortSignal | undefined;
  const runtime = createChatRuntime({
    system: 'test',
    debounce: 0,
    threadId: 'old',
    state: { count: 1 },
    messages: [{ role: 'user', content: 'go' }],
    tools: [
      {
        name: 'work',
        description: 'work',
        schema: s.object('args', {}),
        handler: async (_input, signal) => {
          toolInvocations++;
          if (toolInvocations === 1) return 'completed before pause';
          pendingSignal = signal;
          return new Promise<string>((resolve) => {
            resolvePending = resolve;
          });
        },
      },
    ],
    transport: {
      name: 'test',
      send: async (request) => {
        requests.push(request);
        const round = requests.length;
        if (round === 2) return { events: interrupted(request) };
        return {
          events: (async function* () {
            const identity = {
              threadId: request.input.threadId,
              runId: request.input.runId,
            };
            yield { type: EventType.RUN_STARTED, ...identity };
            if (round === 1 || round === 3) {
              const id = round === 1 ? 'completed' : 'pending';
              yield {
                type: EventType.TOOL_CALL_START,
                toolCallId: id,
                toolCallName: 'work',
                parentMessageId: `assistant-${round}`,
              };
              yield {
                type: EventType.TOOL_CALL_ARGS,
                toolCallId: id,
                delta: '{}',
              };
              yield { type: EventType.TOOL_CALL_END, toolCallId: id };
            }
            yield { type: EventType.RUN_FINISHED, ...identity };
          })(),
        };
      },
    },
  });
  const cleanup = runtime.start();
  await idle(runtime);
  runtime.resume({
    batchId: requireBatch(runtime).id,
    entries: [{ interruptId: 'approval', status: 'resolved' }],
  });
  for (let i = 0; i < 100 && !resolvePending; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
  expect(resolvePending).toBeDefined();
  const checkpoint = runtime.messages();
  const checkpointState = runtime.state();

  runtime.updateOptions({ threadId: 'replacement' });

  expect(pendingSignal?.aborted).toBe(true);
  expect(runtime.messages()).toEqual(checkpoint);
  expect(runtime.state()).toBe(checkpointState);
  expect(runtime.isResuming()).toBe(false);
  runtime.sendMessage({ role: 'user', content: 'new workflow' });
  await idle(runtime);
  expect(requests).toHaveLength(4);
  const nextHistory = requests[3].input.messages;
  expect(nextHistory).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        role: 'tool',
        toolCallId: 'completed',
        content: 'completed before pause',
      }),
    ]),
  );
  expect(
    nextHistory.some(
      (message) => message.role === 'tool' && message.toolCallId === 'pending',
    ),
  ).toBe(false);
  const replacementMessages = runtime.messages();
  resolvePending('late result');
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(runtime.messages()).toEqual(replacementMessages);
  expect(runtime.state()).toBe(checkpointState);
  expect(requests).toHaveLength(4);
  cleanup();
});

test('thread epoch subscribers observe the new identity and schedule latest input exactly once', async () => {
  const { ɵgetRuntimeSchedulingState } = await import('./chat-runtime');
  const requests: TransportRequest[] = [];
  const runtime = createChatRuntime({
    system: 'test',
    debounce: 0,
    threadId: 'old',
    state: { count: 1 },
    messages: [{ role: 'user', content: 'initial input' }],
    transport: {
      name: 'test',
      send: async (request) => {
        requests.push(request);
        if (requests.length === 1) return { events: interrupted(request) };
        return {
          events: (async function* () {
            const identity = {
              threadId: request.input.threadId,
              runId: request.input.runId,
            };
            yield { type: EventType.RUN_STARTED, ...identity };
            yield { type: EventType.RUN_FINISHED, ...identity };
          })(),
        };
      },
    },
  });
  const cleanup = runtime.start();
  await idle(runtime);
  const checkpoint = runtime.messages();
  const scheduling = ɵgetRuntimeSchedulingState(runtime);
  let previousEpoch = scheduling().threadEpoch;
  const observations: Array<{
    threadId: string | undefined;
    messages: unknown;
    state: unknown;
  }> = [];
  const off = scheduling.subscribe((current) => {
    if (current.threadEpoch === previousEpoch) return;
    previousEpoch = current.threadEpoch;
    observations.push({
      threadId: runtime.threadId(),
      messages: runtime.messages(),
      state: runtime.state(),
    });
    runtime.setMessages([{ role: 'user', content: 'latest input' }]);
  });

  runtime.updateOptions({ threadId: 'replacement' });
  await idle(runtime);

  expect(observations).toEqual([
    { threadId: 'replacement', messages: checkpoint, state: { count: 2 } },
  ]);
  expect(requests).toHaveLength(2);
  expect(requests[1].input.threadId).toBe('replacement');
  expect(requests[1].input.messages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ role: 'user', content: 'latest input' }),
    ]),
  );
  expect(runtime.threadId()).toBe('replacement');
  off();
  cleanup();
});

test('facade message preflight enforces runtime ownership using the unchanged resume command', async () => {
  const api = await import('./chat-runtime');
  const assertAllowed = (
    api as unknown as {
      ɵassertRuntimeMessageSchedulingAllowed?: (runtime: {
        resume: (options: ResumeOptions) => void;
      }) => void;
    }
  ).ɵassertRuntimeMessageSchedulingAllowed;
  const runtime = createChatRuntime({
    system: 'test',
    debounce: 0,
    messages: [{ role: 'user', content: 'go' }],
    transport: {
      name: 'test',
      send: async (request) => ({ events: interrupted(request) }),
    },
  });
  const cleanup = runtime.start();
  await idle(runtime);

  expect(typeof assertAllowed).toBe('function');
  if (!assertAllowed) throw new Error('Expected runtime preflight');
  expect(() => assertAllowed({ resume: runtime.resume })).toThrow(/interrupt/i);
  runtime.updateOptions({ threadId: 'fresh' });
  expect(() => assertAllowed({ resume: runtime.resume })).not.toThrow();
  cleanup();
});
