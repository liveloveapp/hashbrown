import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { currentAuthoringAssistant } from '../examples/quickstart/runtime/workbench-authoring-controls';

test('current assistant selection rejects the previous turn after a new send', () => {
  const store = createWorkbenchStore('history', { authoringMode: 'parser' });
  const first = store.send('Create a plan');
  const messages = [
    first,
    { id: 'answer-1', role: 'assistant', content: '{"title":"First"}' },
  ];

  expect(currentAuthoringAssistant(store.getSnapshot(), messages)?.id).toBe(
    'answer-1',
  );
  store.settle('complete');
  store.send('Replace the plan');

  expect(currentAuthoringAssistant(store.getSnapshot(), messages)).toBeNull();
});

test('both authoring clients use actual framework text resources and parser APIs', () => {
  const react = readFileSync(
    'www/examples/quickstart/react/src/AuthoringWorkbench.tsx',
    'utf8',
  );
  const angular = readFileSync(
    'www/examples/quickstart/angular/src/app/authoring-workbench.ts',
    'utf8',
  );

  expect(react).toContain('useChat(');
  expect(react).toContain('useJsonParser(');
  expect(react).toContain('useTool(');
  expect(angular).toContain('chatResource(');
  expect(angular).toContain('injectJsonParser(');
  expect(angular).toContain('createTool(');
  for (const source of [react, angular]) {
    expect(source).toContain('observeHistory(');
    expect(source).toContain('observeAuthoring(');
    expect(source).toContain('mountAuthoringControls(');
    expect(source).toContain('managedChat: true');
    expect(source).toContain("lesson.id === 'natural-forms'");
  }
});
