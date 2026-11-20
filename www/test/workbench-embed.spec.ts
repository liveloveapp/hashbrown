// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { getWorkbenchEmbedMode } from '../examples/quickstart/runtime/workbench-embed';
import { createWorkbenchLayoutStore } from '../examples/quickstart/runtime/workbench-layout';
import {
  mountWorkbench,
  type WorkbenchMountOptions,
} from '../examples/quickstart/runtime/workbench-view';

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

function mountEmbedded(options: WorkbenchMountOptions) {
  const storage = fakeStorage();
  const store = createWorkbenchStore();
  const host = document.createElement('div');
  document.body.append(host);
  mountWorkbench(
    host,
    store,
    {
      framework: 'React',
      lesson: {
        id: 'tools',
        title: 'Tools',
        format: 'ui',
        inspector: 'Requests',
      },
      send: vi.fn(),
      stop: vi.fn(),
      reset: vi.fn(),
    },
    { layout: createWorkbenchLayoutStore(storage), ...options },
  );
  return { host, storage, store };
}

test('getWorkbenchEmbedMode accepts replay and live only', () => {
  const modes = [
    '?embed=replay',
    '?lesson=tools&embed=live',
    '?embed=other',
    '?embed=',
    '',
  ].map(getWorkbenchEmbedMode);

  expect(modes).toEqual(['replay', 'live', null, null, null]);
});

test('embedded mounts render chat, inspector and player without the sidebar', () => {
  const { host } = mountEmbedded({ embed: 'live' });

  const root = host.querySelector('.wb');

  expect(host.querySelector('.wb-lessons')).toBeNull();
  expect(host.querySelector('.wb-nav')).toBeNull();
  expect(root?.classList.contains('wb-embed')).toBe(true);
  expect(root?.getAttribute('data-embed')).toBe('live');
  expect(host.querySelector('.wb-chat')).not.toBeNull();
  expect(host.querySelector('.wb-inspector')).not.toBeNull();
  expect(host.querySelector('.wb-player')).not.toBeNull();
});

test('embedded mounts ignore the sidebar shortcut and never write the layout', () => {
  const { host, storage } = mountEmbedded({ embed: 'live' });

  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true }),
  );

  expect(storage.map.size).toBe(0);
  expect(host.querySelector('.wb-rail')).toBeNull();
});

test('non-embedded mounts toggle the rail with the same shortcut', () => {
  const { host, storage } = mountEmbedded({ embed: null });

  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true }),
  );

  expect(storage.map.size).toBe(1);
  expect(host.querySelector('.wb-rail')).not.toBeNull();
});

test('embedded splits resize in memory without touching storage', () => {
  const { host, storage } = mountEmbedded({ embed: 'live' });
  const handle = host.querySelector<HTMLElement>('.wb-split');
  const layout = host.querySelector<HTMLElement>('.wb-layout');

  handle?.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
  );

  expect(layout?.style.getPropertyValue('--wb-chat')).toBe('48fr');
  expect(storage.map.size).toBe(0);
});

test('embedded replay hides the composer until a capture loads', () => {
  const { host } = mountEmbedded({ embed: 'replay' });

  const composer = host.querySelector<HTMLElement>('.wb-composer');

  expect(composer?.hidden).toBe(true);
  expect(host.textContent).toContain('Waiting for recording');
});

test('non-embedded mounts keep the sidebar and composer', () => {
  const { host } = mountEmbedded({ embed: null });

  expect(host.querySelector('.wb-nav')).not.toBeNull();
  expect(host.querySelector('.wb-embed')).toBeNull();
  expect(host.querySelector<HTMLElement>('.wb-composer')?.hidden).toBe(false);
});

function visibleText(node: Element): string {
  if (node.classList.contains('wb-visually-hidden')) return '';
  return Array.from(node.childNodes)
    .map((child) =>
      child.nodeType === Node.TEXT_NODE
        ? (child.textContent ?? '')
        : visibleText(child as Element),
    )
    .join('');
}

test('the header keeps only the logo and framework', () => {
  const { host } = mountEmbedded({});

  const header = host.querySelector('.wb-header')!;

  expect(visibleText(header)).toBe('HashbrownReact');
  expect(
    header
      .querySelector('[data-source]')!
      .classList.contains('wb-visually-hidden'),
  ).toBe(true);
});

test('the chat head shows the lesson title and hides the status visually', () => {
  const { host } = mountEmbedded({});

  const head = host.querySelector('.wb-chat .wb-panel-head')!;

  expect(head.querySelector('h1')!.textContent).toBe('Tools');
  expect(
    head
      .querySelector('[role=status]')!
      .classList.contains('wb-visually-hidden'),
  ).toBe(true);
});

test('the prompt is named by a hidden label and a placeholder', () => {
  const { host } = mountEmbedded({});

  const prompt = host.querySelector('textarea')!;

  expect(prompt.labels![0].classList.contains('wb-visually-hidden')).toBe(true);
  expect(prompt.placeholder).toBe('Ask a follow-up');
});

test('Stop shows only while a run is going', () => {
  const { host, store } = mountEmbedded({});
  const stop = () =>
    Array.from(host.querySelectorAll('button')).find(
      (item) => item.textContent === 'Stop',
    )!;

  const idle = stop().hidden;
  store.send('Plan a demo');
  const running = stop().hidden;

  expect([idle, running]).toEqual([true, false]);
});

test('an embed hides the header and the chat head visually', () => {
  const { host } = mountEmbedded({ embed: 'replay' });

  const head = host.querySelector('.wb-chat .wb-panel-head')!;

  expect(
    host.querySelector('.wb-header')!.classList.contains('wb-visually-hidden'),
  ).toBe(true);
  expect(head.classList.contains('wb-visually-hidden')).toBe(true);
});
