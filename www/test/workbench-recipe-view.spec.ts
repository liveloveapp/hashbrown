import { expect, test } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import {
  canUseWorkbenchRecipe,
  wasWorkbenchPredictionAccepted,
  wasWorkbenchPredictionDismissed,
  workbenchRecipeInspection,
} from '../examples/quickstart/runtime/workbench-recipe-view';

test('enables only the current successful recipe at its captured application revision', () => {
  const store = createWorkbenchStore('predictions');
  const request = store.send('Suggest actions');
  store.recordRecipe(
    {
      kind: 'predictions',
      contextId: request.id,
      suggestions: [
        { actionId: 'record', reason: 'The outline is ready' },
        { actionId: 'clarify', reason: 'Check the scope' },
      ],
    },
    request.id,
  );
  const id = store.getSnapshot().frame?.messages.at(-1)?.id ?? '';

  expect(canUseWorkbenchRecipe(store.getSnapshot(), id)).toBe(false);
  store.settle('complete', 'stop');
  expect(canUseWorkbenchRecipe(store.getSnapshot(), id)).toBe(true);
  store.acceptPrediction('record');

  expect(canUseWorkbenchRecipe(store.getSnapshot(), id)).toBe(false);
  store.seek(0);
  expect(canUseWorkbenchRecipe(store.getSnapshot(), id)).toBe(false);
});

test('keeps rejected low-confidence UI decisions visible without enabling an application write', () => {
  const store = createWorkbenchStore('selection');
  const request = store.send('Choose a view');
  store.recordRecipe(
    { kind: 'selection', selected: [], confidence: 0.2 },
    request.id,
  );
  store.settle('complete', 'stop');
  const id = store.getSnapshot().frame?.messages.at(-1)?.id ?? '';

  const view = workbenchRecipeInspection(
    store.getSnapshot(),
    'selection',
    'JSON',
  );

  expect(canUseWorkbenchRecipe(store.getSnapshot(), id)).toBe(false);
  expect(view?.detail).toMatchObject({
    selected: [],
    confidence: 0.2,
    minimumConfidence: 0.75,
  });
});

test('shows raw Markdown and the actual selected citation without changing application state', () => {
  const store = createWorkbenchStore('text');
  const request = store.send('Explain the plan');
  store.record('event', {
    type: 'TEXT_MESSAGE_CONTENT',
    delta: '## Plan\nRead more[^1].',
  });
  store.recordRecipe(
    { kind: 'text', markdown: '## Plan\nRead more[^1].' },
    request.id,
  );
  store.settle('complete', 'stop');
  const id = store.getSnapshot().frame?.messages.at(-1)?.id ?? '';
  store.inspectCitation(
    { id: '1', number: 1, url: 'https://hashbrown.dev' },
    id,
  );

  const view = workbenchRecipeInspection(
    store.getSnapshot(),
    'text',
    'Markdown',
  );

  expect(view?.value).toBe('## Plan\nRead more[^1].');
  expect(view?.detailHeading).toBe('Selected reference');
  expect(view?.detail).toMatchObject({ id: '1', url: 'https://hashbrown.dev' });
  expect(store.getSnapshot().application.revision).toBe(0);
});

test('retains a dismissed suggestion in its original turn without leaking future dismissal into replay', () => {
  const store = createWorkbenchStore('predictions');
  const first = store.send('Suggest');
  store.recordRecipe(
    {
      kind: 'predictions',
      contextId: first.id,
      suggestions: [{ actionId: 'clarify', reason: 'Check the scope' }],
    },
    first.id,
  );
  store.settle('complete', 'stop');
  const firstId = store.getSnapshot().frame?.messages.at(-1)?.id ?? '';
  const beforeDismiss = store.getSnapshot().events.length - 1;
  store.dismissPrediction('clarify');
  const second = store.send('Suggest again');
  store.recordRecipe(
    { kind: 'predictions', contextId: second.id, suggestions: [] },
    second.id,
  );
  store.settle('complete', 'stop');

  expect(
    wasWorkbenchPredictionDismissed(store.getSnapshot(), firstId, 'clarify'),
  ).toBe(true);
  store.seek(beforeDismiss);

  expect(
    wasWorkbenchPredictionDismissed(store.getSnapshot(), firstId, 'clarify'),
  ).toBe(false);
});

test('labels acceptance on its original proposal rather than every earlier suggestion with the same action ID', () => {
  const store = createWorkbenchStore('predictions');
  const first = store.send('Suggest');
  store.recordRecipe(
    {
      kind: 'predictions',
      contextId: first.id,
      suggestions: [{ actionId: 'record', reason: 'Ready' }],
    },
    first.id,
  );
  store.settle('complete', 'stop');
  const firstId = store.getSnapshot().frame?.messages.at(-1)?.id ?? '';
  store.dismissPrediction('record');
  const second = store.send('Suggest again');
  store.recordRecipe(
    {
      kind: 'predictions',
      contextId: second.id,
      suggestions: [{ actionId: 'record', reason: 'Ready again' }],
    },
    second.id,
  );
  store.settle('complete', 'stop');
  const secondId = store.getSnapshot().frame?.messages.at(-1)?.id ?? '';
  const beforeAccept = store.getSnapshot().events.length - 1;
  store.acceptPrediction('record');

  expect(
    wasWorkbenchPredictionAccepted(store.getSnapshot(), firstId, 'record'),
  ).toBe(false);
  expect(
    wasWorkbenchPredictionAccepted(store.getSnapshot(), secondId, 'record'),
  ).toBe(true);
  expect(
    wasWorkbenchPredictionDismissed(store.getSnapshot(), firstId, 'record'),
  ).toBe(true);
  store.seek(beforeAccept);

  expect(
    wasWorkbenchPredictionAccepted(store.getSnapshot(), secondId, 'record'),
  ).toBe(false);
});
