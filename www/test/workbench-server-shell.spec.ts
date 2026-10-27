// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { getWorkbenchLesson } from '../examples/quickstart/runtime/workbench-lessons';
import { mountWorkbench } from '../examples/quickstart/runtime/workbench-view';
import type { WorkbenchServerHistoryState } from '../examples/quickstart/runtime/workbench-server-history';

test('server shell enables send only when the selected thread is actually loaded', () => {
  const store = createWorkbenchStore('history');
  store.recordHistory({ messages: [], isLoading: false });
  const server: WorkbenchServerHistoryState = {
    selectedSlot: 'Lighthouse',
    threadId: 'light',
    version: 0,
    snapshot: { id: 'light', version: 0, messages: [] },
    access: 'local-demo',
    threads: {
      'server-threads': { Lighthouse: 'light', Harbor: 'harbor' },
      'public-endpoint': { Lighthouse: 'other', Harbor: 'else' },
    },
    foreignThreadId: 'foreign',
    operations: [],
    busy: false,
    error: null,
  };
  store.recordServerHistory(server, 'loaded');
  const host = document.createElement('div');
  const shell = mountWorkbench(host, store, {
    framework: 'React',
    lesson: getWorkbenchLesson('?lesson=server-threads'),
    send: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  });

  expect(host.querySelector<HTMLButtonElement>('[data-send]')?.disabled).toBe(
    false,
  );
  store.recordServerHistory(
    { ...server, selectedSlot: 'Harbor' },
    'select-server-thread',
  );

  expect(host.querySelector<HTMLButtonElement>('[data-send]')?.disabled).toBe(
    true,
  );
  expect(
    host.querySelector('[role=tab][aria-selected=true]')?.textContent,
  ).toBe('Server');
  shell.dispose();
});
