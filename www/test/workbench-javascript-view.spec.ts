// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { getWorkbenchLesson } from '../examples/quickstart/runtime/workbench-lessons';
import { mountWorkbench } from '../examples/quickstart/runtime/workbench-view';

test('runtime inspection names real execution and exposes code without a model contract', () => {
  const host = document.createElement('div');
  const store = createWorkbenchStore('text');
  const shell = mountWorkbench(host, store, {
    framework: 'React',
    lesson: getWorkbenchLesson('?lesson=javascript-runtime'),
    managedChat: true,
    send: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  });

  const tabs = [...host.querySelectorAll('[role=tab]')].map(
    (el) => el.textContent,
  );

  expect(tabs).toContain('Code');
  expect(tabs).toContain('Runtime');
  expect(host.querySelector('[data-source]')?.textContent).toBe(
    'Real QuickJS · no model',
  );
  expect(host.textContent).toContain('QuickJS execution');
  expect(host.textContent).not.toContain('Waiting for model output');
  expect(host.querySelector('textarea')?.value).toContain('readPlan');
  shell.dispose();
});
