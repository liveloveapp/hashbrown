import { expect, test } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import * as forms from '../examples/quickstart/runtime/workbench-workflow-form';
import { workbenchWorkflowInitialState } from '../examples/quickstart/runtime/workbench-workflows';

const pending = {
  id: 'original',
  interrupts: [
    { id: 'one', reason: 'approval' },
    { id: 'two', reason: 'approval' },
  ],
};
function paused() {
  const store = createWorkbenchStore('workflow');
  const user = store.send('Explain');
  store.recordWorkflow({
    state: workbenchWorkflowInitialState,
    messages: [user],
    pendingInterrupts: pending,
    isLoading: false,
    isResuming: false,
  });
  return store;
}
test('approval submission requires all original answers and claims the batch only once', () => {
  const store = paused();
  const snapshot = store.getSnapshot();

  expect(
    forms.workflowResumeOptions(snapshot, 'original', { one: 'approve' }),
  ).toBeNull();
  const result = forms.workflowResumeOptions(snapshot, 'original', {
    one: 'approve',
    two: 'decline',
  });

  expect(result).toEqual({
    batchId: 'original',
    entries: [
      { interruptId: 'one', status: 'resolved', payload: { approved: true } },
      { interruptId: 'two', status: 'resolved', payload: { approved: false } },
    ],
  });
  expect(store.beginResume('original')).toBe(true);
  expect(
    forms.workflowResumeOptions(store.getSnapshot(), 'original', {
      one: 'approve',
      two: 'approve',
    }),
  ).toBeNull();
  store.failResume();
  expect(
    forms.workflowResumeOptions(store.getSnapshot(), 'original', {}, true)
      ?.entries,
  ).toEqual([
    { interruptId: 'one', status: 'cancelled' },
    { interruptId: 'two', status: 'cancelled' },
  ]);
});
test('application drafts read only as of the selected immutable frame', () => {
  const store = paused();
  store.record('form', {
    type: 'approval-draft',
    batchId: 'original',
    answers: { one: 'approve' },
  });
  const earlier = store.getSnapshot().events.length;
  store.record('form', {
    type: 'approval-draft',
    batchId: 'original',
    answers: { one: 'approve', two: 'decline' },
  });

  store.seek(earlier - 1);

  expect(forms.readWorkflowForm(store.getSnapshot()).answers).toEqual({
    one: 'approve',
  });
  expect(
    forms.workflowResumeOptions(store.getSnapshot(), 'original', {
      one: 'approve',
      two: 'approve',
    }),
  ).toBeNull();
  expect(forms.canEditWorkflowState(store.getSnapshot())).toBe(false);
});
test('shared state writes lock synchronously during a turn and recovery blocks approval', () => {
  const store = createWorkbenchStore('workflow');

  expect(forms.canEditWorkflowState(store.getSnapshot())).toBe(true);
  const user = store.send('Explain');
  expect(forms.canEditWorkflowState(store.getSnapshot())).toBe(false);
  store.recordWorkflow({
    state: workbenchWorkflowInitialState,
    messages: [user],
    pendingInterrupts: pending,
    isLoading: false,
    isResuming: false,
    recoveryRequired: true,
  });

  expect(
    forms.workflowResumeOptions(store.getSnapshot(), 'original', {
      one: 'approve',
      two: 'approve',
    }),
  ).toBeNull();
});
