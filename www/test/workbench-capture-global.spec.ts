// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import type { WorkbenchCapture } from '../examples/quickstart/runtime/workbench-capture';
import { createWorkbenchLayoutStore } from '../examples/quickstart/runtime/workbench-layout';
import { mountWorkbench } from '../examples/quickstart/runtime/workbench-view';

type CaptureHost = {
  hashbrownWorkbench?: { capture: (recordedAt: string) => WorkbenchCapture };
};

function mount(prompt: string) {
  const host = document.createElement('div');
  document.body.append(host);
  const store = createWorkbenchStore();
  store.send(prompt);
  const mounted = mountWorkbench(
    host,
    store,
    {
      framework: 'Angular',
      lesson: { id: 'tools', title: 'Tools', format: 'ui', inspector: 'JSON' },
      send: vi.fn(),
      stop: vi.fn(),
      reset: vi.fn(),
    },
    {
      layout: createWorkbenchLayoutStore({
        getItem: () => null,
        setItem: () => undefined,
      }),
    },
  );
  return { host, mounted };
}

test('a mounted workbench exposes its capture until disposed', () => {
  const { mounted } = mount('Plan');

  const capture = (globalThis as CaptureHost).hashbrownWorkbench?.capture(
    '2026-10-28T00:00:00.000Z',
  );
  mounted.dispose();

  expect(capture).toMatchObject({
    lesson: 'tools',
    framework: 'angular',
    commit: null,
    recordedAt: '2026-10-28T00:00:00.000Z',
  });
  expect(capture?.events.length).toBeGreaterThan(0);
  expect((globalThis as CaptureHost).hashbrownWorkbench).toBeUndefined();
});

test('retained conversations capture the visible workbench', () => {
  const first = mount('First');
  const second = mount('Second');
  second.host.hidden = true;

  const capture = (globalThis as CaptureHost).hashbrownWorkbench?.capture(
    '2026-10-28T00:00:00.000Z',
  );
  second.mounted.dispose();
  first.mounted.dispose();

  expect(capture?.events[0].messages[0].content).toBe('First');
});
