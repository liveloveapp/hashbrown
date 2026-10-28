// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { getWorkbenchLesson } from '../examples/quickstart/runtime/workbench-lessons';
import { getWorkbenchUiPrompts } from '../examples/quickstart/runtime/workbench-ui-kits';
import { mountWorkbench } from '../examples/quickstart/runtime/workbench-view';

test.each(['ui-kits', 'ui-chatbot'] as const)(
  '%s opens actual kit inspection and its own prompts',
  (lesson) => {
    const host = document.createElement('div');
    const store = createWorkbenchStore('ui', { uiLesson: lesson });
    store.recordUiKit({ registryMap: new Map(), serializedSchema: '{}' });
    const shell = mountWorkbench(host, store, {
      framework: 'React',
      lesson: getWorkbenchLesson(`?lesson=${lesson}`),
      send: vi.fn(),
      stop: vi.fn(),
      reset: vi.fn(),
    });

    const tabs = [...host.querySelectorAll('[role=tab]')].map(
      (el) => el.textContent,
    );

    expect(tabs).toContain('Kit');
    expect(tabs).toContain('Schema');
    expect(host.textContent).toContain(
      'SDK component observations and application-owned state.',
    );
    expect(host.querySelector('textarea')?.value).toBe(
      getWorkbenchUiPrompts(lesson)[0],
    );
    expect(host.querySelector('.wb-player')).not.toBeNull();
    expect(host.querySelectorAll('.wb-nav a')).toHaveLength(29);
    shell.dispose();
  },
);
