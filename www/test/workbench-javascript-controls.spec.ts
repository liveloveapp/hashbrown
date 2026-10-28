// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import {
  createWorkbenchJavaScriptSession,
  mountWorkbenchJavaScriptSession,
} from '../examples/quickstart/runtime/workbench-javascript-session';

test('projects captured historical code, text and results and keeps replay controls inert', async () => {
  const host = document.createElement('div');
  const store = createWorkbenchStore('text');
  const execute = vi.fn(async (code: string) => ({ result: code }));
  const session = createWorkbenchJavaScriptSession({
    store,
    active: () => true,
    execute,
  });
  const controls = mountWorkbenchJavaScriptSession(host, store, session);
  await session.run('30');
  const historical = store.getSnapshot().events.length - 1;
  await session.run('20');

  store.seek(historical);
  host.querySelector<HTMLButtonElement>('[data-runtime-run]')?.click();

  expect(
    host.querySelector<HTMLTextAreaElement>('[data-runtime-code]')?.value,
  ).toBe('30');
  expect(host.querySelector('[data-runtime-output]')?.textContent).toContain(
    '30',
  );
  expect(
    host.querySelector('[data-runtime-messages]')?.textContent,
  ).not.toContain('20');
  expect(
    host.querySelector<HTMLButtonElement>('[data-runtime-run]')?.disabled,
  ).toBe(true);
  expect(execute).toHaveBeenCalledTimes(2);
  store.live();
  expect(
    host.querySelector<HTMLTextAreaElement>('[data-runtime-code]')?.value,
  ).toBe('20');
  expect(
    host.querySelector<HTMLButtonElement>('[data-runtime-run]')?.disabled,
  ).toBe(false);
  controls.dispose();
  session.dispose();
});

test('renders untrusted runtime output as text and refreshes inactive controls without frame writes', async () => {
  const host = document.createElement('div');
  const store = createWorkbenchStore('text');
  let active = true;
  const session = createWorkbenchJavaScriptSession({
    store,
    active: () => active,
    execute: async () => '<img src=x onerror="throw 42">',
  });
  const controls = mountWorkbenchJavaScriptSession(host, store, session);
  await session.run('"<img>"');
  const count = store.getSnapshot().events.length;

  active = false;
  controls.update();

  expect(host.querySelector('img')).toBeNull();
  expect(host.querySelector('[data-runtime-output]')?.textContent).toContain(
    '<img',
  );
  expect(
    host.querySelector<HTMLTextAreaElement>('[data-runtime-code]')?.disabled,
  ).toBe(true);
  expect(store.getSnapshot().events).toHaveLength(count);
  controls.dispose();
  session.dispose();
});
