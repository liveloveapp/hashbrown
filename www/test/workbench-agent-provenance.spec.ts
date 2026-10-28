// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { getWorkbenchLesson } from '../examples/quickstart/runtime/workbench-lessons';
import { mountWorkbench } from '../examples/quickstart/runtime/workbench-view';

test('an unavailable agent classifier does not claim a live model produced the application fallback', () => {
  const store = createWorkbenchStore('history');
  store.recordHistory({ messages: [], isLoading: false });
  store.send('Outline the demo');
  store.record('source', { source: 'provider' });
  store.record('event', {
    type: 'CUSTOM',
    name: 'workbench.agent-decision',
    value: {
      value: null,
      meta: null,
      handler: 'clarify',
      fallback: 'unavailable',
    },
  });
  const host = document.createElement('div');
  const shell = mountWorkbench(host, store, {
    framework: 'React',
    lesson: getWorkbenchLesson('?lesson=agent-decisions'),
    send: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  });

  expect(host.querySelector('[data-source]')?.textContent).toBe(
    'Classifier unavailable',
  );

  shell.dispose();
});
