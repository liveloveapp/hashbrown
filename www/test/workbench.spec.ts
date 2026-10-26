import { expect, test } from 'vitest';
import {
  createWorkbenchStore,
  workbenchStructuredProps,
} from '../examples/quickstart/runtime/workbench';

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
    'structured-output',
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
