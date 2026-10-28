// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { mountWorkbenchServerControls } from '../examples/quickstart/runtime/workbench-server-controls';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { createWorkbenchServerHistory } from '../examples/quickstart/runtime/workbench-server-history';
import { observeHistory } from '../examples/quickstart/runtime/workbench-history-client';

test('server controls guard anonymous writes and retain explicit denial actions', () => {
  const store = createWorkbenchStore('history');
  const observation = { messages: [], isLoading: false };
  observeHistory(store, observation);
  const fetch = vi.fn();
  const controller = createWorkbenchServerHistory({
    store,
    lesson: 'server-threads',
    observation: () => observation,
    active: () => true,
    replace: vi.fn(),
    fetch,
  });
  const host = document.createElement('div');

  const controls = mountWorkbenchServerControls(host, store, controller);
  const button = (text: string) => {
    const result = [...host.querySelectorAll('button')].find(
      (node) => node.textContent === text,
    );
    if (!result) throw new Error(`Missing ${text}`);
    return result;
  };

  expect(button('Start local session').disabled).toBe(false);
  expect(button('Save server text').disabled).toBe(true);
  expect(button('Load server thread').disabled).toBe(true);
  expect(button('Try anonymous request').disabled).toBe(false);
  expect(host.querySelector('select')?.getAttribute('aria-label')).toBe(
    'Server thread',
  );
  expect(host.textContent).toContain('Local demo only');
  controls.dispose();
  controller.dispose();
});

test('replay before the first server capture never displays current live session data', async () => {
  const store = createWorkbenchStore('history');
  const observation = { messages: [], isLoading: false };
  observeHistory(store, observation);
  const index = store.getSnapshot().events.length - 1;
  const controller = createWorkbenchServerHistory({
    store,
    lesson: 'server-threads',
    observation: () => observation,
    active: () => true,
    replace: vi.fn(),
    fetch: vi.fn(async () =>
      Response.json({
        access: 'local-demo',
        threads: {
          'server-threads': {
            Lighthouse: 'private-current-id',
            Harbor: 'harbor',
          },
          'public-endpoint': { Lighthouse: 'access', Harbor: 'access-harbor' },
        },
        foreignThreadId: 'foreign',
      }),
    ),
  });
  const host = document.createElement('div');
  const controls = mountWorkbenchServerControls(host, store, controller);
  await controller.startSession();

  store.seek(index);

  expect(host.textContent).toContain('unknown');
  expect(host.textContent).not.toContain('local-demo');
  expect(
    [...host.querySelectorAll('button')].every((button) => button.disabled),
  ).toBe(true);
  controls.dispose();
  controller.dispose();
});
