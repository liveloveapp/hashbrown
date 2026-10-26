import { expect, test } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { workbenchApplicationInput } from '../examples/quickstart/runtime/workbench-recipe-input';

test('copies the application into detached JSON input including accepted actions', () => {
  const store = createWorkbenchStore('predictions');
  const message = store.send('Suggest');
  store.recordRecipe(
    {
      kind: 'predictions',
      contextId: message.id,
      suggestions: [{ actionId: 'record', reason: 'Ready' }],
    },
    message.id,
  );
  store.settle('complete', 'stop');
  store.acceptPrediction('record');
  const application = store.getSnapshot().application;

  const result = workbenchApplicationInput(application);
  result.plan?.steps.push('Local mutation');
  result.acceptedActions.push('review');

  expect(application.plan?.steps).toHaveLength(2);
  expect(application.acceptedActions).toEqual(['record']);
  expect(result.revision).toBe(1);
});

test('reads only actual finite pick confidence from the SDK decision metadata', async () => {
  const { workbenchSelectionConfidence } =
    await import('../examples/quickstart/runtime/workbench-recipe-input');
  const complete = {
    pick: { confidence: 0.9, probabilities: { summary: 0.9, steps: 0.1 } },
  };

  expect(workbenchSelectionConfidence(complete)).toBe(0.9);
  expect(
    workbenchSelectionConfidence({ pick: { confidence: Infinity } }),
  ).toBeNull();
  expect(
    workbenchSelectionConfidence({ pick: { confidence: '0.9' } }),
  ).toBeNull();
  expect(workbenchSelectionConfidence(null)).toBeNull();
});
