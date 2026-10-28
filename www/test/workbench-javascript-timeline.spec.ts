import { expect, test } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { workbenchMilestones } from '../examples/quickstart/runtime/workbench-timeline';

test('runtime milestones expose execution, host calls and actual results', () => {
  const store = createWorkbenchStore('text');
  const user = store.send('Estimate the plan');
  const observation = {
    runId: user.id,
    code: '30',
    status: 'running',
    calls: [],
  };
  store.recordJavaScript(observation, user.id);
  store.recordJavaScript(
    { ...observation, calls: [{ name: 'readPlan', args: { revision: 0 } }] },
    user.id,
  );
  store.recordJavaScript(
    { ...observation, status: 'complete', outcome: { result: 30 } },
    user.id,
  );

  const labels = workbenchMilestones(store.getSnapshot().events, 'text').map(
    (item) => item.label,
  );

  expect(labels).toContain('QuickJS started');
  expect(labels).toContain('Host call observed');
  expect(labels).toContain('QuickJS result');
});
