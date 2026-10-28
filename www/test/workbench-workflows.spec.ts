import { expect, test } from 'vitest';
import { workbenchLessons } from '../examples/quickstart/runtime/workbench-lessons';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';

test('registers the three chat workflow lessons and preserves the default', () => {
  const lessons = workbenchLessons;

  expect(
    lessons
      .filter(({ format, host }) => format === 'workflow' && !host)
      .map(({ id, format, protocol }) => ({ id, format, protocol })),
  ).toEqual([
    { id: 'shared-state', format: 'workflow', protocol: 'chat' },
    { id: 'activities', format: 'workflow', protocol: 'chat' },
    { id: 'interrupts', format: 'workflow', protocol: 'chat' },
  ]);
  expect(lessons[0].id).toBe('generative-ui');
});

test('captures immutable actual workflow observations and resumes without a new message', () => {
  const store = createWorkbenchStore('workflow');
  const user = store.send('Explain the plan.');
  const observation = {
    state: { planTitle: 'Demo', status: 'draft' },
    messages: [user],
    pendingInterrupts: {
      id: 'local-batch',
      interrupts: [
        { id: 'server-a', reason: 'approval' },
        { id: 'server-b', reason: 'approval' },
      ],
    },
    isLoading: false,
    isResuming: false,
  };

  expect(typeof store.recordWorkflow).toBe('function');
  store.recordWorkflow(observation);
  const paused = store.getSnapshot().frame;
  observation.state.planTitle = 'Mutated';

  expect(paused?.workflow?.state?.planTitle).toBe('Demo');
  expect(paused?.workflow?.pendingInterrupts?.id).toBe('local-batch');
  expect(store.getSnapshot().status).toBe('paused');
  expect(() => store.send('Blocked')).toThrow();
  expect(store.beginResume('stale-batch')).toBe(false);
  expect(store.beginResume('local-batch')).toBe(true);
  expect(store.beginResume('local-batch')).toBe(false);
  expect(store.getSnapshot().turn).toBe(1);
  expect(
    store
      .getSnapshot()
      .frame?.messages.filter((entry) => entry.role === 'user'),
  ).toHaveLength(1);
  store.failResume();
  expect(store.getSnapshot().status).toBe('paused');
  expect(store.getSnapshot().frame?.workflow?.pendingInterrupts?.id).toBe(
    'local-batch',
  );
  store.seek(0);
  expect(store.beginResume('local-batch')).toBe(false);
});

import { workbenchMilestones } from '../examples/quickstart/runtime/workbench-timeline';
import { normalizeWorkbenchWorkflowObservation } from '../examples/quickstart/runtime/workbench-workflows';

test('normalizes only closed state and validated activity cards without changing SDK history', () => {
  const observation = normalizeWorkbenchWorkflowObservation({
    state: { planTitle: 'Title', status: 'ready', unexpected: true },
    messages: [
      {
        id: 'activity',
        role: 'activity',
        activityType: 'plan-progress',
        content: { stage: 'context-checked', label: 'Context checked' },
        hashbrownLinks: { runId: 'run-1' },
      },
      {
        id: 'unsafe',
        role: 'activity',
        activityType: 'plan-progress',
        content: { html: '<script>' },
      },
    ],
    isLoading: false,
    isResuming: false,
  });

  expect(observation.state).toBeNull();
  expect(observation.messages).toHaveLength(2);
  expect(observation.activities).toHaveLength(1);
  expect(observation.activities[0].hashbrownLinks).toEqual({ runId: 'run-1' });
  expect(Object.isFrozen(observation.activities[0])).toBe(true);
});

test('labels workflow milestones with real state and resume intent', () => {
  const store = createWorkbenchStore('workflow');
  const user = store.send('Explain');
  store.recordWorkflow({
    state: { planTitle: 'Title', status: 'draft' },
    messages: [user],
    pendingInterrupts: {
      id: 'local',
      interrupts: [
        { id: 'a', reason: 'approval' },
        { id: 'b', reason: 'approval' },
      ],
    },
    isLoading: false,
    isResuming: false,
  });
  store.beginResume('local');

  expect(
    workbenchMilestones(store.getSnapshot().events, 'workflow').map(
      (entry) => entry.label,
    ),
  ).toContain('Resume requested');
});

test('ignores a stale SDK turn and does not let an unclaimed observation undo resume intent', () => {
  const store = createWorkbenchStore('workflow');
  const user = store.send('Explain');
  const observation = {
    state: { planTitle: 'Title', status: 'ready' },
    messages: [user],
    pendingInterrupts: {
      id: 'batch',
      interrupts: [
        { id: 'a', reason: 'approval' },
        { id: 'b', reason: 'approval' },
      ],
    },
    isLoading: false,
    isResuming: false,
  };
  store.recordWorkflow(observation);
  store.beginResume('batch');

  store.recordWorkflow({
    ...observation,
    state: { planTitle: 'Edited', status: 'ready' },
  });

  expect(store.getSnapshot().status).toBe('loading');
  expect(
    store.recordWorkflow({
      ...observation,
      messages: [{ ...user, id: 'stale' }],
    }),
  ).toBe(false);
  store.failResume();
  expect(store.getSnapshot().status).toBe('paused');
});

test('captures local idle edits and terminal rollback after transport has settled the capture', () => {
  const store = createWorkbenchStore('workflow');
  const idle = {
    state: { planTitle: 'Locally edited', status: 'idle' },
    messages: [],
    isLoading: false,
    isResuming: false,
  };
  expect(store.recordWorkflow(idle)).toBe(true);
  expect(store.getSnapshot().turn).toBe(0);
  expect(store.getSnapshot().events).toHaveLength(1);
  const user = store.send('Explain');
  store.recordWorkflow({
    ...idle,
    messages: [user],
    state: { planTitle: 'Locally edited', status: 'draft' },
    isLoading: true,
  });
  store.settle('error');

  store.recordWorkflow({
    ...idle,
    messages: [user],
    error: new Error('Provider failed'),
    recoveryRequired: true,
  });

  expect(store.getSnapshot().frame?.workflow).toMatchObject({
    state: idle.state,
    error: 'Provider failed',
    recoveryRequired: true,
  });
  expect(store.getSnapshot().status).toBe('error');
  expect(store.getSnapshot().application.revision).toBe(0);
});
