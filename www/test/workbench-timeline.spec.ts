import { expect, test } from 'vitest';
import {
  createWorkbenchStore,
  type WorkbenchEvent,
} from '../examples/quickstart/runtime/workbench';
import {
  findWorkbenchMilestone,
  withWorkbenchMilestoneIds,
  workbenchMilestones,
} from '../examples/quickstart/runtime/workbench-timeline';

test('groups stream chunks into milestones while retaining their exact captured indices', () => {
  const store = createWorkbenchStore();
  store.send('Plan a demo');
  store.record('request', { requestId: 'r1' });
  store.record('source', { source: 'test-fixture' });
  store.record('event', { type: 'TEXT_MESSAGE_CONTENT', delta: '{' });
  store.record('event', { type: 'TEXT_MESSAGE_CONTENT', delta: '"ui":' });
  store.parsed({
    ui: [{ SummaryCard: { props: { title: 'Demo', steps: [] } } }],
  });
  store.record('event', { type: 'TEXT_MESSAGE_CONTENT', delta: '[]}' });
  store.parsed({
    ui: [
      {
        SummaryCard: { props: { title: 'Demo', steps: ['Outline', 'Record'] } },
      },
    ],
  });
  store.settle('complete', 'stop');
  const events = store.getSnapshot().events;

  const milestones = workbenchMilestones(events);

  expect(milestones.map((item) => item.index)).toEqual([0, 1, 3, 7, 8]);
  expect(milestones.map((item) => item.label)).toEqual([
    'Prompt',
    'Request',
    'Streaming JSON',
    'Parsed output',
    'Complete',
  ]);
  expect(events).toHaveLength(9);
});

test('keeps tool results, acceptance and failed turns visible without hiding raw frames', () => {
  const store = createWorkbenchStore();
  store.send('Plan');
  store.record('tool', { name: 'readContext', result: { revision: 0 } });
  store.parsed({
    ui: [
      {
        SummaryCard: { props: { title: 'Demo', steps: ['Outline', 'Record'] } },
      },
    ],
  });
  store.settle('complete', 'stop');
  store.accept({ title: 'Demo', steps: ['Outline', 'Record'] });
  store.send('Shorter');
  store.settle('error');

  const milestones = workbenchMilestones(store.getSnapshot().events);

  expect(milestones.map((item) => item.label)).toEqual([
    'Prompt',
    'Tool readContext',
    'Parsed output',
    'Complete',
    'Plan accepted',
    'Prompt',
    'Error',
  ]);
  expect(milestones.at(-1)?.turn).toBe(2);
});

test('keeps failed HTTP responses as milestones while successful status frames remain raw', () => {
  const store = createWorkbenchStore();
  store.send('Plan');
  store.record('response', { status: 200 });
  store.record('response', { status: 403 });
  store.settle('error');

  const labels = workbenchMilestones(store.getSnapshot().events).map(
    (item) => item.label,
  );

  expect(labels).toEqual(['Prompt', 'HTTP 403', 'Error']);
});

test('keeps one failure milestone while retaining the detailed error frames', () => {
  const store = createWorkbenchStore();
  store.send('Plan');
  store.record('error', { message: 'Request failed' });
  store.settle('error');
  const events = store.getSnapshot().events;

  const failures = workbenchMilestones(events).filter(
    (item) => item.label === 'Error',
  );

  expect(events.filter((event) => event.kind === 'error')).toHaveLength(2);
  expect(failures).toHaveLength(1);
  expect(failures[0].index).toBe(events.length - 1);
});

test('labels Markdown chunks and citation interactions without presenting them as JSON or writes', () => {
  const store = createWorkbenchStore('text');
  const user = store.send('Explain the plan');
  store.record('event', { type: 'TEXT_MESSAGE_CONTENT', delta: '## Plan' });
  store.recordRecipe({ kind: 'text', markdown: '## Plan' }, user.id);
  store.settle('complete', 'stop');
  const origin = store.getSnapshot().frame?.messages.at(-1)?.id ?? '';
  store.inspectCitation(
    { id: '1', number: 1, url: 'https://hashbrown.dev' },
    origin,
  );

  const labels = workbenchMilestones(store.getSnapshot().events, 'text').map(
    (item) => item.label,
  );

  expect(labels).toContain('Streaming text');
  expect(labels).toContain('Reference selected');
  expect(labels).not.toContain('Streaming JSON');
  expect(labels).not.toContain('Suggestion applied');
});

test('groups repeated Markdown parser observations into one final parser milestone', () => {
  const store = createWorkbenchStore('text');
  const user = store.send('Explain');
  store.recordRecipe({ kind: 'text', markdown: '## Plan' }, user.id);
  store.recordRecipe(
    { kind: 'text', markdown: '## Plan\nExplain the steps.' },
    user.id,
  );
  store.settle('complete', 'stop');
  const events = store.getSnapshot().events;

  const parsed = workbenchMilestones(events, 'text').filter(
    (item) => item.label === 'Parsed text',
  );

  expect(events.filter((event) => event.kind === 'parsed')).toHaveLength(2);
  expect(parsed).toHaveLength(1);
  expect(parsed[0].index).toBe(events.length - 2);
});

test('keeps effective provider policy as a distinct captured milestone', () => {
  const store = createWorkbenchStore('text');
  store.send('Explain the plan');
  store.record('event', {
    type: 'CUSTOM',
    name: 'workbench.system-instructions',
    value: { origin: 'OpenAI adapter mapping', policy: 'Public policy' },
  });

  const milestones = workbenchMilestones(store.getSnapshot().events, 'text');

  expect(milestones.at(-1)).toMatchObject({
    index: 1,
    label: 'Policy observed',
  });
});

function twoTurnToolsRun() {
  const store = createWorkbenchStore();
  store.send('Plan');
  store.record('tool', { name: 'readContext', result: { revision: 0 } });
  store.parsed({
    ui: [
      {
        SummaryCard: { props: { title: 'Demo', steps: ['Outline', 'Record'] } },
      },
    ],
  });
  store.settle('complete', 'stop');
  store.accept({ title: 'Demo', steps: ['Outline', 'Record'] });
  store.send('Shorter');
  store.record('tool', { name: 'readContext', result: { revision: 1 } });
  store.settle('complete', 'stop');
  return store.getSnapshot().events;
}

test('milestones carry readable ids unique within a capture', () => {
  const events = twoTurnToolsRun();

  const ids = workbenchMilestones(events).map((item) => item.id);

  expect(ids).toEqual(
    expect.arrayContaining([
      'prompt-1',
      'tool-readcontext-1',
      'plan-accepted-1',
      'prompt-2',
      'tool-readcontext-2',
    ]),
  );
  expect(new Set(ids).size).toBe(ids.length);
});

test('suffixes later same-turn duplicates', () => {
  const items = withWorkbenchMilestoneIds([
    { index: 0, turn: 1, label: 'Streaming JSON' },
    { index: 1, turn: 1, label: 'Streaming JSON' },
    { index: 2, turn: 1, label: 'Streaming JSON' },
  ]);

  expect(items.map((item) => item.id)).toEqual([
    'streaming-json-1',
    'streaming-json-1-2',
    'streaming-json-1-3',
  ]);
});

test('findWorkbenchMilestone returns the milestone by id and null for unknown ids', () => {
  const events = twoTurnToolsRun();

  const found = findWorkbenchMilestone(events, 'prompt-2');
  const missing = findWorkbenchMilestone(events, 'nope-9');

  expect(found?.label).toBe('Prompt');
  expect(found?.turn).toBe(2);
  expect(missing).toBeNull();
});

test('names tool milestones after the tool and falls back without a name', () => {
  const store = createWorkbenchStore();
  store.send('Plan');
  store.record('tool', { name: 'readContext', result: { revision: 0 } });
  store.record('tool', { result: { revision: 1 } });
  store.record('tool', { name: 'readContext', result: { revision: 2 } });

  const milestones = workbenchMilestones(store.getSnapshot().events);

  expect(milestones.map((item) => item.id)).toEqual([
    'prompt-1',
    'tool-readcontext-1',
    'tool-result-1',
    'tool-readcontext-1-2',
  ]);
});

function historyAction(
  base: WorkbenchEvent,
  turn: number,
  action: string | null,
): WorkbenchEvent {
  return {
    ...base,
    kind: 'history-app',
    turn,
    history: { app: { action } },
  } as unknown as WorkbenchEvent;
}

test('collapses repeated history actions to the first of each label per turn', () => {
  const store = createWorkbenchStore();
  store.send('Plan');
  const prompt = store.getSnapshot().events[0];
  const events = [
    historyAction(prompt, 0, null),
    historyAction(prompt, 0, null),
    historyAction(prompt, 0, 'load'),
    historyAction(prompt, 0, 'load'),
    historyAction(prompt, 1, 'load'),
    historyAction(prompt, 1, 'save'),
    historyAction(prompt, 1, 'load'),
  ];

  const milestones = workbenchMilestones(events, 'history');

  expect(milestones.map(({ id, index }) => ({ id, index }))).toEqual([
    { id: 'text-action-0', index: 0 },
    { id: 'text-load-0', index: 2 },
    { id: 'text-load-1', index: 4 },
    { id: 'text-save-1', index: 5 },
  ]);
});
