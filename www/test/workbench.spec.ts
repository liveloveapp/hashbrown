import { expect, test } from 'vitest';
import {
  createWorkbenchStore,
  workbenchStructuredProps,
} from '../examples/quickstart/runtime/workbench';
import { createWorkbenchCapture } from '../examples/quickstart/runtime/workbench-capture';

function recordedCapture() {
  const source = createWorkbenchStore();
  source.send('Make a plan');
  source.record('event', { type: 'TEXT_MESSAGE_START', messageId: 'a' });
  source.record('event', {
    type: 'TEXT_MESSAGE_CONTENT',
    messageId: 'a',
    delta: '{"ui":[',
  });
  source.parsed({
    ui: [
      { SummaryCard: { props: { title: 'Plan', steps: ['First', 'Second'] } } },
    ],
  });
  source.settle('complete', 'stop');
  return createWorkbenchCapture(source.getSnapshot(), {
    lesson: 'ui-kits',
    framework: 'react',
    recordedAt: '2026-10-28T00:00:00.000Z',
  });
}

test('seeking reconstructs captured JSON and state without changing live application state', () => {
  const store = createWorkbenchStore();
  store.send('Make a plan');
  store.record('event', {
    type: 'TEXT_MESSAGE_CONTENT',
    messageId: 'answer',
    delta: '{"ui":[',
  });
  const partial = store.getSnapshot().events.length - 1;
  store.parsed({
    ui: [
      { SummaryCard: { props: { title: 'Plan', steps: ['First', 'Second'] } } },
    ],
  });
  store.settle('complete', 'stop');
  store.accept({ title: 'Plan', steps: ['First', 'Second'] });

  store.seek(partial);

  expect(store.getSnapshot().frame?.json).toBe('{"ui":[');
  expect(store.getSnapshot().frame?.application.revision).toBe(0);
  expect(store.getSnapshot().application.revision).toBe(1);
  expect(store.accept({ title: 'Plan', steps: ['First', 'Second'] })).toBe(
    false,
  );
});

test('a failed, cancelled, incomplete or stale proposal cannot be accepted', () => {
  for (const status of ['error', 'cancelled', 'loading', 'complete'] as const) {
    const store = createWorkbenchStore();
    store.send('Plan');
    store.parsed({
      ui: [{ SummaryCard: { props: { title: 'Plan', steps: ['First'] } } }],
    });
    if (status !== 'loading')
      store.settle(status, status === 'complete' ? 'length' : undefined);

    expect(store.accept({ title: 'Plan', steps: ['First'] })).toBe(false);
  }
});

test('acceptance validates current props and only advances the live revision once', () => {
  const store = createWorkbenchStore();
  const proposal = { title: 'Plan', steps: ['First', 'Second'] };
  store.send('Plan');
  store.parsed({ ui: [{ SummaryCard: { props: proposal } }] });
  store.settle('complete', 'stop');

  expect(store.accept({ ...proposal, title: 'Different plan' })).toBe(false);
  expect(store.accept(proposal)).toBe(true);
  expect(store.accept(proposal)).toBe(false);
  proposal.steps.push('Mutated externally');
  expect(store.getSnapshot().application.plan?.steps).toEqual([
    'First',
    'Second',
  ]);
});

test('continuations accumulate independently per response and replay cannot submit a prompt', () => {
  const store = createWorkbenchStore();
  store.send('Plan');
  store.record('request', { input: { runId: 'first' } }, 'request-1');
  store.record('event', {
    type: 'TEXT_MESSAGE_CONTENT',
    messageId: 'first',
    delta: 'one',
  });
  store.record('request', { input: { runId: 'continuation' } }, 'request-2');
  store.record('event', {
    type: 'TEXT_MESSAGE_CONTENT',
    messageId: 'second',
    delta: 'two',
  });
  store.settle('complete', 'stop');

  store.seek(0);

  expect(() => store.send('Another prompt')).toThrow();
  store.live();
  expect(store.getSnapshot().frame?.json).toBe('two');
  expect(
    store.getSnapshot().events.filter((e) => e.kind === 'request'),
  ).toHaveLength(2);
});

test('clear creates an independent trace and rejects late events from an older capture', () => {
  const store = createWorkbenchStore();
  store.send('Old thread');
  store.clear();

  store.record('event', {
    type: 'TEXT_MESSAGE_CONTENT',
    messageId: 'old',
    delta: 'late',
  });

  expect(store.getSnapshot().events).toEqual([]);
  expect(store.getSnapshot().application.revision).toBe(0);
});

test('trailing raw chunks preserve the last SDK-parsed card through completion', () => {
  const store = createWorkbenchStore();
  const props = { title: 'Plan', steps: ['First', 'Second'] };
  store.send('Plan');
  store.record('event', {
    type: 'TEXT_MESSAGE_CONTENT',
    messageId: 'answer',
    delta: '{"ui":[',
  });
  store.parsed({ ui: [{ SummaryCard: { props } }] });

  store.record('event', {
    type: 'TEXT_MESSAGE_CONTENT',
    messageId: 'answer',
    delta: ']}',
  });
  store.parsed({ ui: [{ SummaryCard: { props } }] });
  store.settle('complete', 'stop');

  expect(
    store
      .getSnapshot()
      .frame?.messages.find((message) => message.id === 'answer')?.props,
  ).toEqual(props);
});

test('accepts the same validated props independent of framework children and key order', () => {
  const store = createWorkbenchStore();
  const props = { title: 'Plan', steps: ['First', 'Second'] };
  store.send('Plan');
  store.parsed({ ui: [{ SummaryCard: { props } }] });
  store.settle('complete', 'stop');

  const frameworkProps = {
    steps: props.steps,
    title: props.title,
    children: [],
  };

  expect(store.accept(frameworkProps)).toBe(true);
});

test('captures normalized SDK partial props and only accepts a complete SDK value', () => {
  const store = createWorkbenchStore();
  const value = { title: 'Plan', steps: ['First', 'Second'] };
  store.send('Plan');

  store.parsed({
    ui: [{ SummaryCard: { props: { complete: false, partialValue: value } } }],
  });

  expect(store.getSnapshot().frame?.props).toEqual(value);
  store.parsed({
    ui: [
      {
        SummaryCard: { props: { complete: true, partialValue: value, value } },
      },
    ],
  });
  store.settle('complete', 'stop');
  expect(store.accept(value)).toBe(true);
});

test('structured captures accept plain typed plans and reject UI wrappers', () => {
  const plan = { title: 'Plan', steps: ['Outline', 'Record'] };
  const store = createWorkbenchStore('structured');
  store.send('Plan');
  store.parsed({ ui: [{ SummaryCard: { props: plan } }] });
  store.settle('complete', 'stop');

  expect(store.accept(plan)).toBe(false);

  store.send('Plan again');
  store.parsed(plan);
  store.settle('complete', 'stop');

  expect(store.accept(plan)).toBe(true);
});

test('structured captures reject malformed and cancelled proposals and preserve inert replay', () => {
  const store = createWorkbenchStore('structured');
  const plan = { title: 'Plan', steps: ['Outline', 'Record'] };
  store.send('Plan');
  store.parsed({ ...plan, ui: [] });
  store.settle('complete', 'stop');

  expect(store.accept(plan)).toBe(false);

  store.send('Try again');
  store.parsed(plan);
  store.settle('cancelled');

  expect(store.accept(plan)).toBe(false);

  store.send('Once more');
  store.parsed(plan);
  store.settle('complete', 'stop');
  store.seek(0);

  expect(store.accept(plan)).toBe(false);

  store.live();

  expect(store.accept(plan)).toBe(true);
  expect(store.accept(plan)).toBe(false);
});

test('lesson queries resolve only allowlisted metadata and safe endpoints', async () => {
  const { getWorkbenchLesson, workbenchLessons } =
    await import('../examples/quickstart/runtime/workbench-lessons');

  expect(getWorkbenchLesson('?lesson=tools')).toMatchObject({
    id: 'tools',
    format: 'ui',
    inspector: 'Requests',
    endpoint: '/api/workbench/tools',
  });
  expect(getWorkbenchLesson('?lesson=structured-output')).toMatchObject({
    format: 'structured',
    inspector: 'JSON',
  });
  expect(getWorkbenchLesson('?lesson=https://untrusted.example')).toBe(
    workbenchLessons[0],
  );
  expect(getWorkbenchLesson('')).toBe(workbenchLessons[0]);
  expect(workbenchLessons.map((lesson) => lesson.id)).toEqual([
    'generative-ui',
    'tools',
    'javascript-runtime',
    'local-models',
    'structured-output',
    'streaming',
    'schemas',
    'decisions',
    'debugging',
    'request-transformation',
    'prose',
    'predictions',
    'ui-selection',
    'first-plan',
    'conversation',
    'system-instructions',
    'ui-kits',
    'ui-chatbot',
    'shared-state',
    'activities',
    'interrupts',
    'server-threads',
    'public-endpoint',
    'message-history',
    'save-text-conversations',
    'agent-decisions',
    'json-parser',
    'natural-forms',
    'production-recovery',
  ]);
});

test('structured proposals require a successful completed current run', () => {
  const store = createWorkbenchStore('structured');
  const plan = { title: 'Plan', steps: ['Outline', 'Record'] };
  store.send('Plan');
  store.parsed(plan);

  expect(store.accept(plan)).toBe(false);

  store.settle('complete', 'length');

  expect(store.accept(plan)).toBe(false);

  store.send('Try again');
  store.parsed({ title: 'Plan', steps: ['Only one'] });
  store.settle('complete', 'stop');

  expect(store.accept({ title: 'Plan', steps: ['Only one'] })).toBe(false);
  expect(store.getSnapshot().application.revision).toBe(0);
});

test('tool-only structured assistant messages do not produce captured or renderable cards', () => {
  const store = createWorkbenchStore('structured');
  store.send('Plan');

  expect(workbenchStructuredProps(undefined)).toBeNull();
  expect(workbenchStructuredProps({})).toBeNull();
  expect(
    workbenchStructuredProps({ title: undefined, steps: undefined }),
  ).toBeNull();
  store.parsed({});

  expect(store.getSnapshot().frame?.props).toBeNull();
  expect(
    store
      .getSnapshot()
      .frame?.messages.filter((message) => message.role === 'assistant'),
  ).toHaveLength(0);
  expect(workbenchStructuredProps({ title: 'Plan' })).toEqual({
    title: 'Plan',
  });
  expect(workbenchStructuredProps({ steps: ['Outline'] })).toEqual({
    steps: ['Outline'],
  });
});

test('decision suggestions require a current complete response and explicit use', () => {
  const store = createWorkbenchStore('decision');
  const message = store.send('The outline is complete. What should I do next?');

  store.recordDecision({ nextAction: 'record', confidence: 0.9 }, message.id);
  expect(store.applyDecision()).toBe(false);
  store.settle('complete', 'stop');

  expect(store.getSnapshot().application.nextAction).toBe(null);
  expect(store.applyDecision()).toBe(true);
  expect(store.getSnapshot().application.nextAction).toBe('record');
  expect(store.applyDecision()).toBe(false);
});

test('decision confidence, cancellation and request identity prevent application writes', () => {
  for (const confidence of [0.5, NaN, 2]) {
    const store = createWorkbenchStore('decision');
    const message = store.send('Next?');

    store.recordDecision({ nextAction: 'record', confidence }, message.id);
    store.settle('complete', 'stop');

    expect(store.applyDecision()).toBe(false);
  }
  const store = createWorkbenchStore('decision');
  const first = store.send('Next?');
  store.settle('cancelled');
  store.send('Next again?');

  store.recordDecision({ nextAction: 'record', confidence: 0.9 }, first.id);
  store.settle('complete', 'stop');

  expect(store.applyDecision()).toBe(false);
});

test('SDK errors settle only the captured user turn represented by healthy framework history', async () => {
  const { isCurrentWorkbenchError } =
    await import('../examples/quickstart/runtime/workbench');
  const store = createWorkbenchStore();
  const old = store.send('First');
  store.settle('error');
  const current = store.send('Retry');

  expect(isCurrentWorkbenchError(store.getSnapshot(), [old])).toBe(false);
  expect(isCurrentWorkbenchError(store.getSnapshot(), [old, current])).toBe(
    true,
  );
  const previousError = new Error('Previous denial');
  expect(
    isCurrentWorkbenchError(
      store.getSnapshot(),
      [old, current],
      previousError,
      previousError,
    ),
  ).toBe(false);
  expect(
    isCurrentWorkbenchError(
      store.getSnapshot(),
      [old, current],
      new Error('Current schema failure'),
      previousError,
    ),
  ).toBe(true);
  store.settle('error');
  expect(isCurrentWorkbenchError(store.getSnapshot(), [old, current])).toBe(
    false,
  );
});

test('load replays captured events read-only from the first event', () => {
  const capture = recordedCapture();
  const store = createWorkbenchStore();

  store.load(capture.events);
  const loaded = store.getSnapshot();
  store.seek(3);
  const sought = store.getSnapshot().cursor;
  const sent = store.send('x');
  store.record('user', { content: 'x' });
  const afterWrites = store.getSnapshot().events.length;
  store.live();

  expect(loaded.cursor).toBe(0);
  expect(loaded.readOnly).toBe(true);
  expect(loaded.status).toBe('complete');
  expect(sought).toBe(3);
  expect(sent).toEqual({ id: expect.any(String), role: 'user', content: 'x' });
  expect(loaded.turn).toBe(capture.events.at(-1)?.turn);
  expect(afterWrites).toBe(capture.events.length);
  expect(store.getSnapshot().cursor).toBe(capture.events.length - 1);
  expect(Object.isFrozen(store.getSnapshot().events[0])).toBe(true);
});

test('load refuses while a live run is loading', () => {
  const capture = recordedCapture();
  const store = createWorkbenchStore();
  store.send('Make a plan');

  store.load(capture.events);

  expect(store.getSnapshot().status).toBe('loading');
  expect(store.getSnapshot().readOnly).toBe(false);
  expect(store.getSnapshot().cursor).toBeNull();
});

test('a read-only store stays seekable and reloadable when the capture ends loading', () => {
  const capture = recordedCapture();
  const events = capture.events.map((event, index, all) =>
    index === all.length - 1 ? { ...event, status: 'loading' as const } : event,
  );
  const store = createWorkbenchStore();

  store.load(events);
  store.seek(2);
  const cursor = store.getSnapshot().cursor;
  store.load(capture.events);

  expect(cursor).toBe(2);
  expect(store.getSnapshot().cursor).toBe(0);
  expect(store.getSnapshot().status).toBe('complete');
});

test('a read-only snapshot always has a cursor after load, seek and live', () => {
  const capture = recordedCapture();
  const store = createWorkbenchStore();

  store.load(capture.events);
  const loaded = store.getSnapshot();
  store.seek(2);
  const sought = store.getSnapshot();
  store.live();
  const live = store.getSnapshot();

  expect(
    [loaded, sought, live].map(({ readOnly, cursor }) => ({
      readOnly,
      cursor,
    })),
  ).toEqual([
    { readOnly: true, cursor: 0 },
    { readOnly: true, cursor: 2 },
    { readOnly: true, cursor: capture.events.length - 1 },
  ]);
});
