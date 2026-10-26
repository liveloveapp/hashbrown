import { expect, test } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { workbenchMilestones } from '../examples/quickstart/runtime/workbench-timeline';

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
    'Tool result',
    'Parsed output',
    'Complete',
    'Plan accepted',
    'Prompt',
    'Error',
  ]);
  expect(milestones.at(-1)?.turn).toBe(2);
});
