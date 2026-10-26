// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { createWorkbenchLayoutStore } from '../examples/quickstart/runtime/workbench-layout';
import { mountWorkbench } from '../examples/quickstart/runtime/workbench-view';

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

function mountShell(layout = createWorkbenchLayoutStore(fakeStorage())) {
  const host = document.createElement('div');
  document.body.append(host);
  const store = createWorkbenchStore();
  const shell = mountWorkbench(
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
    { layout },
  );
  return { host, store, shell, layout };
}

test('renders New conversation first and four expanded sections by default', () => {
  const { host, shell } = mountShell();

  const firstButton = host.querySelector('.wb-nav button');
  const sections = [...host.querySelectorAll<HTMLElement>('[data-section]')];
  const headings = [...host.querySelectorAll('.wb-nav-heading')];

  expect(firstButton?.getAttribute('aria-label')).toBe('New conversation');
  expect(sections.map((section) => section.dataset.section)).toEqual([
    'conversations',
    'concepts',
    'production',
    'recipes',
  ]);
  expect(headings).toHaveLength(4);
  expect(
    headings.every(
      (heading) => heading.getAttribute('aria-expanded') === 'true',
    ),
  ).toBe(true);
  expect(
    host.querySelector('a[aria-current=page]')?.getAttribute('href'),
  ).toMatch(/lesson=tools$/);
  expect(host.querySelector('.wb-nav [aria-pressed=true]')?.textContent).toBe(
    'Two-step plan',
  );
  shell.dispose();
});

test('folds a section and persists it', () => {
  const { host, shell, layout } = mountShell();
  const heading = host.querySelector<HTMLButtonElement>(
    '[data-section=recipes] .wb-nav-heading',
  );

  heading?.click();

  const folded = host.querySelector<HTMLButtonElement>(
    '[data-section=recipes] .wb-nav-heading',
  );
  const list = document.getElementById(
    folded?.getAttribute('aria-controls') ?? '',
  );
  expect(list?.hasAttribute('inert')).toBe(true);
  expect(list?.hasAttribute('data-collapsed')).toBe(true);
  expect(folded?.getAttribute('aria-expanded')).toBe('false');
  expect(layout.get().collapsed).toEqual(['recipes']);
  shell.dispose();
});

test('collapses to an icon rail that keeps accessible names', () => {
  const { host, shell } = mountShell(createWorkbenchLayoutStore(fakeStorage()));
  host
    .querySelector<HTMLButtonElement>('[data-section=recipes] .wb-nav-heading')
    ?.click();

  host.querySelector<HTMLButtonElement>('.wb-rail-toggle')?.click();

  const toggle = host.querySelector('.wb-rail-toggle');
  const named = [
    ...host.querySelectorAll('.wb-lessons a'),
    host.querySelector('.wb-cta'),
  ];
  expect(host.querySelector('.wb')?.classList.contains('wb-rail')).toBe(true);
  expect(toggle?.getAttribute('aria-label')).toBe('Expand sidebar');
  expect(toggle?.getAttribute('aria-expanded')).toBe('false');
  expect(named.length).toBeGreaterThan(1);
  expect(named.every((node) => !!node?.getAttribute('aria-label'))).toBe(true);
  expect(host.querySelectorAll('.wb-nav [inert]')).toHaveLength(0);
  shell.dispose();
});

test('shares rail state across retained instances', () => {
  const layout = createWorkbenchLayoutStore(fakeStorage());
  const first = mountShell(layout);
  const second = mountShell(layout);

  first.host.querySelector<HTMLButtonElement>('.wb-rail-toggle')?.click();

  expect(second.host.querySelector('.wb')?.classList.contains('wb-rail')).toBe(
    true,
  );
  first.shell.dispose();
  second.shell.dispose();
});

test('stops following the layout store after dispose', () => {
  const layout = createWorkbenchLayoutStore(fakeStorage());
  const { host, shell } = mountShell(layout);
  const root = host.querySelector('.wb');
  shell.dispose();

  layout.set({ rail: true });

  expect(root?.classList.contains('wb-rail')).toBe(false);
});

test('keeps sidebar elements across store updates', () => {
  const { host, store, shell } = mountShell();
  const cta = host.querySelector('.wb-cta');

  store.send('Plan');
  store.record('tool', { name: 'readContext', result: null });

  expect(host.querySelector('.wb-cta')).toBe(cta);
  expect(cta?.isConnected).toBe(true);
  shell.dispose();
});

test('uses unique heading list ids per mounted instance', () => {
  const first = mountShell();
  const second = mountShell();

  const ids = [first.host, second.host].flatMap((host) =>
    [...host.querySelectorAll('.wb-nav-heading')].map((heading) =>
      heading.getAttribute('aria-controls'),
    ),
  );

  expect(new Set(ids).size).toBe(8);
  first.shell.dispose();
  second.shell.dispose();
});

test('keeps keyboard focus on the activated heading and rail toggle', () => {
  const { host, shell } = mountShell();
  const heading = host.querySelector<HTMLButtonElement>(
    '[data-section=concepts] .wb-nav-heading',
  );
  heading?.focus();

  heading?.click();
  const focusedHeading = document.activeElement;
  host.querySelector<HTMLButtonElement>('.wb-rail-toggle')?.focus();
  host.querySelector<HTMLButtonElement>('.wb-rail-toggle')?.click();
  const focusedToggle = document.activeElement;

  expect(
    focusedHeading?.closest('[data-section]')?.getAttribute('data-section'),
  ).toBe('concepts');
  expect(focusedHeading?.classList.contains('wb-nav-heading')).toBe(true);
  expect(focusedToggle?.classList.contains('wb-rail-toggle')).toBe(true);
  expect(focusedToggle?.isConnected).toBe(true);
  shell.dispose();
});

test('keeps focus on a conversation after navigation re-renders', () => {
  const { host, shell } = mountShell();
  const navigation = {
    currentId: 'one',
    conversations: [
      { id: 'one', label: 'Two-step plan' },
      { id: 'two', label: 'Conversation 2' },
    ],
    select: vi.fn(),
    create: vi.fn(),
  };
  shell.navigation(navigation);
  host
    .querySelector<HTMLButtonElement>('[aria-label="Conversation 2"]')
    ?.focus();

  shell.navigation({ ...navigation, currentId: 'two' });

  expect(document.activeElement?.getAttribute('aria-label')).toBe(
    'Conversation 2',
  );
  expect(document.activeElement?.getAttribute('aria-pressed')).toBe('true');
  shell.dispose();
});

test('does not steal focus when the sidebar rebuilds while focus is elsewhere', () => {
  const { host, shell, layout } = mountShell();
  const prompt = host.querySelector('textarea');
  prompt?.focus();

  layout.set({ rail: true });

  expect(document.activeElement).toBe(prompt);
  shell.dispose();
});

test('labels each section by a heading button inside an h2', () => {
  const { host, shell } = mountShell();

  const sections = [...host.querySelectorAll('section.wb-nav-group')];

  expect(
    sections.every((section) => {
      const heading = document.getElementById(
        section.getAttribute('aria-labelledby') ?? '',
      );
      return (
        heading?.classList.contains('wb-nav-heading') &&
        heading.parentElement?.tagName === 'H2' &&
        section.contains(heading)
      );
    }),
  ).toBe(true);
  shell.dispose();
});

test('steps, clamps and resets the split from the keyboard', () => {
  const { host, shell, layout } = mountShell();
  const separator = host.querySelector<HTMLElement>('[role=separator]');
  const grid = host.querySelector<HTMLElement>('.wb-layout');
  const press = (key: string) =>
    separator?.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );

  separator?.focus();
  press('ArrowRight');
  press('ArrowRight');

  expect(separator?.getAttribute('aria-valuenow')).toBe('52');
  expect(layout.get().split).toBe(52);
  expect(grid?.style.getPropertyValue('--wb-split')).toBe('52');
  expect(grid?.style.getPropertyValue('--wb-chat')).toBe('52fr');
  expect(grid?.style.getPropertyValue('--wb-inspector')).toBe('48fr');

  press('Home');
  expect(layout.get().split).toBe(44);

  press('ArrowLeft');
  separator?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  expect(layout.get().split).toBe(44);
  expect(separator?.getAttribute('aria-valuenow')).toBe('44');
  shell.dispose();
});

test('drags the split relative to chat and inspector', () => {
  const { host, shell, layout } = mountShell();
  const separator = host.querySelector<HTMLElement>('[role=separator]');
  const rect = (left: number, right: number) =>
    ({ left, right, width: right - left }) as DOMRect;
  const chat = host.querySelector<HTMLElement>('.wb-layout > :nth-child(2)');
  const inspector = host.querySelector<HTMLElement>(
    '.wb-layout > :nth-child(4)',
  );
  vi.spyOn(chat as HTMLElement, 'getBoundingClientRect').mockReturnValue(
    rect(0, 600),
  );
  vi.spyOn(inspector as HTMLElement, 'getBoundingClientRect').mockReturnValue(
    rect(600, 1000),
  );
  const capture = vi.fn();
  (separator as HTMLElement).setPointerCapture = capture;
  const fire = (type: string, clientX: number) =>
    separator?.dispatchEvent(new MouseEvent(type, { clientX, bubbles: true }));

  fire('pointerdown', 500);
  fire('pointermove', 700);
  const middle = layout.get().split;
  const dragging = separator?.classList.contains('wb-dragging');
  fire('pointermove', 900);
  const clamped = layout.get().split;
  fire('pointerup', 900);
  fire('pointermove', 300);

  expect(capture).toHaveBeenCalled();
  expect(middle).toBe(70);
  expect(dragging).toBe(true);
  expect(clamped).toBe(75);
  expect(layout.get().split).toBe(75);
  expect(separator?.classList.contains('wb-dragging')).toBe(false);
  shell.dispose();
});

test('keeps the handle across store updates', () => {
  const { host, store, shell } = mountShell();
  const before = host.querySelector('[role=separator]');

  store.record('tool', { name: 'readContext', result: null });

  expect(host.querySelector('[role=separator]')).toBe(before);
  expect(before?.querySelectorAll('.wb-grip polyline')).toHaveLength(2);
  shell.dispose();
});
