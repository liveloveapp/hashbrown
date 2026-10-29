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
  const host = document.createElement('div');
  document.body.append(host);
  mountWorkbench(
    host,
    createWorkbenchStore(),
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
  return { host, storage };
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
