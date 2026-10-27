import { type AGUIEvent, EventType, type RunAgentInput } from '@ag-ui/core';
import { expect, test } from 'vitest';
import { pinWorkbenchInput } from '../examples/quickstart/server/workbench-app';

const input = {
  threadId: 'workflow-thread',
  runId: 'workflow-run',
  state: { planTitle: 'My plan', status: 'idle' },
  messages: [{ id: 'user-1', role: 'user', content: 'Explain the plan.' }],
  tools: [],
  context: [],
  forwardedProps: {},
} satisfies RunAgentInput;

test('pins a workflow to plain text, closed state and no tools', () => {
  const result = pinWorkbenchInput(input, 'shared-state');

  expect(result.tools).toEqual([]);
  expect(result.forwardedProps).toEqual({ hashbrown: { ui: false } });
  expect(() =>
    pinWorkbenchInput(
      { ...input, state: { ...input.state, extra: true } },
      'shared-state',
    ),
  ).toThrow(/state/i);
});

import { createWorkbenchWorkflowStream } from '../examples/quickstart/server/workbench-workflows';

function provider(reason = 'stop', calls: RunAgentInput[] = []) {
  return async function* (request: RunAgentInput): AsyncIterable<AGUIEvent> {
    calls.push(request);
    yield {
      type: EventType.RUN_STARTED,
      threadId: request.threadId,
      runId: request.runId,
    };
    yield {
      type: EventType.TEXT_MESSAGE_START,
      messageId: `answer-${request.runId}`,
      role: 'assistant',
    };
    yield {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: `answer-${request.runId}`,
      delta: 'Actual model words.',
    };
    yield {
      type: EventType.TEXT_MESSAGE_END,
      messageId: `answer-${request.runId}`,
    };
    yield {
      type: EventType.RUN_FINISHED,
      threadId: request.threadId,
      runId: request.runId,
      metadata: { hashbrown: { finishReason: reason } },
    };
  };
}
async function collect(stream: AsyncIterable<AGUIEvent>) {
  const events: AGUIEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

test('owns one lifecycle, explicitly maps state to model context and emits real progress', async () => {
  const calls: RunAgentInput[] = [];
  const agent = createWorkbenchWorkflowStream({
    delegate: provider('stop', calls),
  });

  const events = await collect(
    agent(input, new AbortController().signal, 'activities'),
  );

  expect(events.filter((event) => event.type === 'RUN_STARTED')).toHaveLength(
    1,
  );
  expect(events.filter((event) => event.type === 'RUN_FINISHED')).toHaveLength(
    1,
  );
  expect(calls[0].messages[0]).toMatchObject({
    role: 'system',
    content: expect.stringContaining('My plan'),
  });
  expect(events.find((event) => event.type === 'STATE_SNAPSHOT')).toMatchObject(
    { snapshot: { planTitle: 'My plan', status: 'draft' } },
  );
  expect(
    events.find((event) => event.type === 'ACTIVITY_SNAPSHOT'),
  ).toMatchObject({
    activityType: 'plan-progress',
    content: { stage: 'context-checked' },
  });
  expect(events.find((event) => event.type === 'ACTIVITY_DELTA')).toBeDefined();
});

test('unsuccessful provider completion cannot mark state ready or create approvals', async () => {
  const agent = createWorkbenchWorkflowStream({ delegate: provider('length') });

  const events = await collect(
    agent(input, new AbortController().signal, 'interrupts'),
  );

  expect(events.some((event) => event.type === 'RUN_ERROR')).toBe(true);
  expect(events.some((event) => event.type === 'STATE_DELTA')).toBe(false);
  expect(events.find((event) => event.type === 'CUSTOM')).toMatchObject({
    name: 'workbench.workflow-outcome',
    value: { finishReason: 'length' },
  });
  expect(events.some((event) => event.type === 'RUN_FINISHED')).toBe(false);
});

test('claims complete server-owned approvals before provider await and rejects all duplicates', async () => {
  const calls: RunAgentInput[] = [];
  const agent = createWorkbenchWorkflowStream({
    delegate: provider('stop', calls),
  });
  const events = await collect(
    agent(input, new AbortController().signal, 'interrupts'),
  );
  const finished = events.find((event) => event.type === 'RUN_FINISHED');

  expect(finished).toMatchObject({
    outcome: { type: 'interrupt', interrupts: expect.any(Array) },
  });
  if (
    finished?.type !== 'RUN_FINISHED' ||
    finished.outcome?.type !== 'interrupt'
  )
    return;
  const resume = finished.outcome.interrupts.map((entry) => ({
    interruptId: entry.id,
    status: 'resolved' as const,
    payload: { approved: true },
  }));
  const request = { ...input, runId: 'resumed', resume };
  const continuation = await collect(
    agent(request, new AbortController().signal, 'interrupts'),
  );

  expect(continuation.at(-1)).toMatchObject({
    type: 'RUN_FINISHED',
    outcome: { type: 'success' },
  });
  expect(calls).toHaveLength(2);
  expect(calls[1].resume).toBeUndefined();
  expect(
    calls[1].messages.filter((entry) => entry.role === 'user'),
  ).toHaveLength(1);
  await expect(
    collect(agent(request, new AbortController().signal, 'interrupts')),
  ).rejects.toThrow(/consumed|pending/i);
  await expect(
    collect(
      agent(
        {
          ...request,
          resume: resume.map((entry) => ({
            ...entry,
            payload: { approved: false },
          })),
        },
        new AbortController().signal,
        'interrupts',
      ),
    ),
  ).rejects.toThrow(/consumed|pending/i);
  expect(calls).toHaveLength(2);
});

test('rejects incomplete, malformed, foreign and expired approvals without provider work', async () => {
  let time = 100;
  const calls: RunAgentInput[] = [];
  const agent = createWorkbenchWorkflowStream({
    delegate: provider('stop', calls),
    now: () => time,
    ttlMs: 100,
  });
  const events = await collect(
    agent(input, new AbortController().signal, 'interrupts'),
  );
  const terminal = events.at(-1);
  expect(terminal).toMatchObject({ outcome: { type: 'interrupt' } });
  if (
    terminal?.type !== 'RUN_FINISHED' ||
    terminal.outcome?.type !== 'interrupt'
  )
    return;
  const entries = terminal.outcome.interrupts.map(({ id }) => ({
    interruptId: id,
    status: 'resolved' as const,
    payload: { approved: true },
  }));

  await expect(
    collect(
      agent(
        { ...input, resume: entries.slice(0, 1) },
        new AbortController().signal,
        'interrupts',
      ),
    ),
  ).rejects.toThrow(/every approval/);
  await expect(
    collect(
      agent(
        {
          ...input,
          resume: entries.map((entry) => ({
            ...entry,
            payload: { approved: 'true' },
          })),
        },
        new AbortController().signal,
        'interrupts',
      ),
    ),
  ).rejects.toThrow(/valid boolean/);
  await expect(
    collect(
      agent(
        { ...input, threadId: 'foreign', resume: entries },
        new AbortController().signal,
        'interrupts',
      ),
    ),
  ).rejects.toThrow(/pending/);
  await expect(
    collect(agent(input, new AbortController().signal, 'interrupts')),
  ).rejects.toThrow(/pending/);
  time = 200;
  await expect(
    collect(
      agent(
        { ...input, resume: entries },
        new AbortController().signal,
        'interrupts',
      ),
    ),
  ).rejects.toThrow(/pending/);
  expect(calls).toHaveLength(1);
});

test('denial and cancellation consume decisions without protected provider work', async () => {
  for (const cancelled of [false, true]) {
    const calls: RunAgentInput[] = [];
    const agent = createWorkbenchWorkflowStream({
      delegate: provider('stop', calls),
    });
    const events = await collect(
      agent(input, new AbortController().signal, 'interrupts'),
    );
    const terminal = events.at(-1);
    if (
      terminal?.type !== 'RUN_FINISHED' ||
      terminal.outcome?.type !== 'interrupt'
    )
      throw new Error('Expected pause');
    const resume = terminal.outcome.interrupts.map(({ id }) =>
      cancelled
        ? { interruptId: id, status: 'cancelled' as const }
        : {
            interruptId: id,
            status: 'resolved' as const,
            payload: { approved: false },
          },
    );

    const continuation = await collect(
      agent({ ...input, resume }, new AbortController().signal, 'interrupts'),
    );

    expect(calls).toHaveLength(1);
    expect(continuation.some((event) => event.type === 'STATE_DELTA')).toBe(
      false,
    );
    expect(continuation.at(-1)).toMatchObject({ outcome: { type: 'success' } });
    await expect(
      collect(
        agent({ ...input, resume }, new AbortController().signal, 'interrupts'),
      ),
    ).rejects.toThrow(/consumed/);
  }
});

test('missing or mismatched terminal and every non-stop reason roll back instead of approving', async () => {
  for (const reason of [
    'length',
    'refusal',
    'content_filter',
    'other',
    'tool_calls',
    'unknown',
  ]) {
    const agent = createWorkbenchWorkflowStream({ delegate: provider(reason) });

    const events = await collect(
      agent(input, new AbortController().signal, 'interrupts'),
    );

    expect(events.at(-1)).toMatchObject({ type: 'RUN_ERROR' });
    expect(
      events.some(
        (event) =>
          event.type === 'RUN_FINISHED' || event.type === 'STATE_DELTA',
      ),
    ).toBe(false);
  }
  for (const missing of [true, false]) {
    const delegate = async function* (): AsyncIterable<AGUIEvent> {
      if (!missing)
        yield {
          type: EventType.RUN_FINISHED,
          threadId: 'wrong',
          runId: 'wrong',
          metadata: { hashbrown: { finishReason: 'stop' } },
        };
    };
    const agent = createWorkbenchWorkflowStream({ delegate });

    const events = await collect(
      agent(input, new AbortController().signal, 'shared-state'),
    );

    expect(events.at(-1)).toMatchObject({ type: 'RUN_ERROR' });
  }
});

test('cancellation closes and aborts the delegated iterator without state commit or approvals', async () => {
  const controller = new AbortController();
  let disposed = false;
  let delegatedSignal: AbortSignal | undefined;
  const agent = createWorkbenchWorkflowStream({
    delegate: async function* (_input, signal) {
      delegatedSignal = signal;
      try {
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'answer',
          delta: 'Unmodified',
        };
        controller.abort();
      } finally {
        disposed = true;
      }
    },
  });

  const events = await collect(agent(input, controller.signal, 'interrupts'));

  expect(disposed).toBe(true);
  expect(delegatedSignal?.aborted).toBe(true);
  expect(
    events.some(
      (event) => event.type === 'RUN_FINISHED' || event.type === 'STATE_DELTA',
    ),
  ).toBe(false);
});

test('bounds pending and consumed records and prunes them at expiry', async () => {
  let time = 100;
  const agent = createWorkbenchWorkflowStream({
    delegate: provider(),
    now: () => time,
    ttlMs: 100,
    maxRecords: 1,
  });
  await collect(agent(input, new AbortController().signal, 'interrupts'));

  const blocked = await collect(
    agent(
      { ...input, threadId: 'second' },
      new AbortController().signal,
      'interrupts',
    ),
  );
  time = 200;
  const allowed = await collect(
    agent(
      { ...input, threadId: 'second' },
      new AbortController().signal,
      'interrupts',
    ),
  );

  expect(blocked.at(-1)).toMatchObject({ type: 'RUN_ERROR' });
  expect(allowed.at(-1)).toMatchObject({ outcome: { type: 'interrupt' } });
});

import { createChatRuntime, type TransportRequest } from '@hashbrownai/core';
import { workbenchWorkflowInitialState } from '../examples/quickstart/runtime/workbench-workflows';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { createWorkbenchTransport } from '../examples/quickstart/runtime/workbench-transport';

async function idle(runtime: { isLoading: () => boolean }) {
  for (let i = 0; i < 100; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (!runtime.isLoading()) return;
  }
  throw new Error('Runtime did not settle');
}

test('actual SDK pauses and resumes in the same turn and transport captures synchronous resume dispatch', async () => {
  const requests: TransportRequest[] = [];
  const store = createWorkbenchStore('workflow');
  const agent = createWorkbenchWorkflowStream({ delegate: provider() });
  const runtime = createChatRuntime({
    system: 'demo',
    state: workbenchWorkflowInitialState,
    debounce: 0,
    retries: 0,
    transport: createWorkbenchTransport(store, {
      name: 'agent',
      send: async (request) => {
        requests.push(request);
        return { events: agent(request.input, request.signal, 'interrupts') };
      },
    }),
  });
  const cleanup = runtime.start();
  const user = store.send('Explain');
  runtime.sendMessage(user);
  expect(() => runtime.setState(workbenchWorkflowInitialState)).toThrow(
    /generation/,
  );
  await idle(runtime);
  const batch = runtime.pendingInterrupts();
  expect(batch?.interrupts).toHaveLength(2);
  if (!batch) throw new Error('Expected real pending batch');
  store.recordWorkflow({
    state: runtime.state(),
    messages: runtime.messages(),
    pendingInterrupts: batch,
    isLoading: runtime.isLoading(),
    isResuming: runtime.isResuming(),
  });
  expect(store.beginResume(batch.id)).toBe(true);

  runtime.resume({
    batchId: batch.id,
    entries: batch.interrupts.map(({ id }) => ({
      interruptId: id,
      status: 'resolved',
      payload: { approved: true },
    })),
  });
  await idle(runtime);

  expect(runtime.error()).toBeUndefined();
  expect(runtime.pendingInterrupts()).toBeUndefined();
  expect(requests).toHaveLength(2);
  expect(requests[1].input.resume).toHaveLength(2);
  expect(JSON.stringify(requests[1].input)).not.toContain(batch.id);
  expect(
    requests[1].input.messages.filter((message) => message.role === 'user'),
  ).toHaveLength(1);
  expect(
    store.getSnapshot().events.filter((frame) => frame.kind === 'request'),
  ).toHaveLength(2);
  expect(runtime.state()?.status).toBe('ready');
  cleanup();
});

test('actual SDK rolls state back when the provider ends without stop', async () => {
  const agent = createWorkbenchWorkflowStream({ delegate: provider('length') });
  const runtime = createChatRuntime({
    system: 'demo',
    state: workbenchWorkflowInitialState,
    messages: [{ role: 'user', content: 'Explain' }],
    debounce: 0,
    retries: 0,
    transport: {
      name: 'agent',
      send: async (request) => ({
        events: agent(request.input, request.signal, 'shared-state'),
      }),
    },
  });
  const cleanup = runtime.start();

  await idle(runtime);

  expect(runtime.error()).toBeDefined();
  expect(runtime.state()).toEqual(workbenchWorkflowInitialState);
  expect(runtime.pendingInterrupts()).toBeUndefined();
  cleanup();
});

test('concurrent identical approval submissions perform provider work once', async () => {
  const calls: RunAgentInput[] = [];
  const agent = createWorkbenchWorkflowStream({
    delegate: provider('stop', calls),
  });
  const events = await collect(
    agent(input, new AbortController().signal, 'interrupts'),
  );
  const terminal = events.at(-1);
  if (
    terminal?.type !== 'RUN_FINISHED' ||
    terminal.outcome?.type !== 'interrupt'
  )
    throw new Error('Expected pause');
  const request = {
    ...input,
    resume: terminal.outcome.interrupts.map(({ id }) => ({
      interruptId: id,
      status: 'resolved' as const,
      payload: { approved: true },
    })),
  };

  const results = await Promise.allSettled([
    collect(agent(request, new AbortController().signal, 'interrupts')),
    collect(agent(request, new AbortController().signal, 'interrupts')),
  ]);

  expect(results.map((result) => result.status).sort()).toEqual([
    'fulfilled',
    'rejected',
  ]);
  expect(calls).toHaveLength(2);
});

test('actual SDK activity messages retain their links and update by stable id', async () => {
  const agent = createWorkbenchWorkflowStream({ delegate: provider() });
  const runtime = createChatRuntime({
    system: 'demo',
    state: workbenchWorkflowInitialState,
    debounce: 0,
    retries: 0,
    transport: {
      name: 'agent',
      send: async (request) => ({
        events: agent(request.input, request.signal, 'activities'),
      }),
    },
  });
  const cleanup = runtime.start();
  runtime.sendMessage({ role: 'user', content: 'Explain' });
  await idle(runtime);
  const first = runtime
    .messages()
    .filter((message) => message.role === 'activity');
  runtime.sendMessage({ role: 'user', content: 'Explain briefly' });

  await idle(runtime);

  const activities = runtime
    .messages()
    .filter((message) => message.role === 'activity');
  expect(first).toHaveLength(1);
  expect(activities).toHaveLength(2);
  expect(activities[0]).toMatchObject({
    id: first[0].id,
    content: { stage: 'reply-complete' },
    links: { runId: expect.any(String) },
  });
  expect(activities[1].id).not.toBe(first[0].id);
  cleanup();
});

test('reserves an initial thread before its first yield and releases it when the iterator closes', async () => {
  const calls: RunAgentInput[] = [];
  const agent = createWorkbenchWorkflowStream({
    delegate: provider('stop', calls),
  });
  const first = agent(input, new AbortController().signal, 'interrupts')[
    Symbol.asyncIterator
  ]();
  await first.next();

  await expect(
    collect(agent(input, new AbortController().signal, 'interrupts')),
  ).rejects.toThrow(/active|running/i);
  expect(calls).toHaveLength(0);
  await first.return?.();
  const retry = await collect(
    agent(input, new AbortController().signal, 'interrupts'),
  );

  expect(retry.at(-1)).toMatchObject({ outcome: { type: 'interrupt' } });
  expect(calls).toHaveLength(1);
});

test('rejects ordinary sends while an approved resume owns the active thread', async () => {
  const calls: RunAgentInput[] = [];
  const agent = createWorkbenchWorkflowStream({
    delegate: provider('stop', calls),
  });
  const paused = (
    await collect(agent(input, new AbortController().signal, 'interrupts'))
  ).at(-1);
  if (paused?.type !== 'RUN_FINISHED' || paused.outcome?.type !== 'interrupt')
    throw new Error('Expected pause');
  const resume = paused.outcome.interrupts.map(({ id }) => ({
    interruptId: id,
    status: 'resolved' as const,
    payload: { approved: true },
  }));
  const continuation = agent(
    { ...input, resume },
    new AbortController().signal,
    'interrupts',
  )[Symbol.asyncIterator]();
  await continuation.next();

  await expect(
    collect(agent(input, new AbortController().signal, 'interrupts')),
  ).rejects.toThrow(/active|running/i);
  expect(calls).toHaveLength(1);
  await continuation.return?.();
});

test('abort at the final state patch creates no invisible approval and releases the thread', async () => {
  const agent = createWorkbenchWorkflowStream({ delegate: provider() });
  const controller = new AbortController();
  const events: AGUIEvent[] = [];

  for await (const event of agent(input, controller.signal, 'interrupts')) {
    events.push(event);
    if (event.type === 'STATE_DELTA') controller.abort();
  }
  const retry = await collect(
    agent(input, new AbortController().signal, 'interrupts'),
  );

  expect(events.some((event) => event.type === 'RUN_FINISHED')).toBe(false);
  expect(retry.at(-1)).toMatchObject({ outcome: { type: 'interrupt' } });
});
