// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { createWorkbenchLayoutStore } from '../examples/quickstart/runtime/workbench-layout';
import { mountWorkbench } from '../examples/quickstart/runtime/workbench-view';

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    map,
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

test('renders New conversation first and five expanded sections by default', () => {
  const { host, shell } = mountShell();

  const firstButton = host.querySelector('.wb-nav button');
  const sections = [...host.querySelectorAll<HTMLElement>('[data-section]')];
  const headings = [...host.querySelectorAll('.wb-nav-heading')];

  expect(firstButton?.getAttribute('aria-label')).toBe('New conversation');
  expect(sections.map((section) => section.dataset.section)).toEqual([
    'conversations',
    'start',
    'concepts',
    'production',
    'recipes',
  ]);
  expect(headings).toHaveLength(5);
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

  expect(new Set(ids).size).toBe(10);
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
  expect(separator?.getAttribute('aria-valuetext')).toBe(
    'Chat 52%, inspector 48%',
  );
  expect(layout.get().split).toBe(52);
  expect(grid?.style.getPropertyValue('--wb-split')).toBe('');
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
  const focused = document.activeElement;
  fire('pointermove', 700);
  const middle = layout.get().split;
  const dragging = separator?.classList.contains('wb-dragging');
  fire('pointermove', 900);
  const clamped = layout.get().split;
  fire('pointerup', 900);
  fire('pointermove', 300);

  expect(capture).toHaveBeenCalled();
  expect(focused).toBe(separator);
  expect(middle).toBe(70);
  expect(dragging).toBe(true);
  expect(clamped).toBe(75);
  expect(layout.get().split).toBe(75);
  expect(separator?.classList.contains('wb-dragging')).toBe(false);
  shell.dispose();
});

test('persists the split once when a drag ends', () => {
  const storage = fakeStorage();
  const setItem = vi.spyOn(storage, 'setItem');
  const { host, shell } = mountShell(createWorkbenchLayoutStore(storage));
  const separator = host.querySelector<HTMLElement>('[role=separator]');
  const rect = (left: number, right: number) =>
    ({ left, right, width: right - left }) as DOMRect;
  vi.spyOn(
    host.querySelector('.wb-chat') as HTMLElement,
    'getBoundingClientRect',
  ).mockReturnValue(rect(0, 600));
  vi.spyOn(
    host.querySelector('.wb-inspector') as HTMLElement,
    'getBoundingClientRect',
  ).mockReturnValue(rect(600, 1000));
  const fire = (type: string, clientX: number) =>
    separator?.dispatchEvent(new MouseEvent(type, { clientX, bubbles: true }));

  fire('pointerdown', 500);
  fire('pointermove', 550);
  fire('pointermove', 600);
  const writesWhileDragging = setItem.mock.calls.length;
  fire('pointerup', 600);

  expect(writesWhileDragging).toBe(0);
  expect(setItem).toHaveBeenCalledTimes(1);
  expect(
    JSON.parse(storage.map.get('hashbrown.workbench.layout') as string).split,
  ).toBe(60);
  shell.dispose();
});

test('ignores pointer moves from a different pointer during a drag', () => {
  const { host, shell, layout } = mountShell();
  const separator = host.querySelector<HTMLElement>('[role=separator]');
  const rect = (left: number, right: number) =>
    ({ left, right, width: right - left }) as DOMRect;
  vi.spyOn(
    host.querySelector('.wb-chat') as HTMLElement,
    'getBoundingClientRect',
  ).mockReturnValue(rect(0, 600));
  vi.spyOn(
    host.querySelector('.wb-inspector') as HTMLElement,
    'getBoundingClientRect',
  ).mockReturnValue(rect(600, 1000));
  const fire = (type: string, clientX: number, pointerId: number) =>
    separator?.dispatchEvent(
      Object.assign(new MouseEvent(type, { clientX, bubbles: true }), {
        pointerId,
      }),
    );

  fire('pointerdown', 500, 1);
  fire('pointermove', 300, 2);
  fire('pointerup', 300, 2);
  const afterOtherPointer = layout.get().split;
  const stillDragging = separator?.classList.contains('wb-dragging');
  fire('pointermove', 600, 1);
  fire('pointerup', 600, 1);

  expect(afterOtherPointer).toBe(44);
  expect(stillDragging).toBe(true);
  expect(layout.get().split).toBe(60);
  expect(separator?.classList.contains('wb-dragging')).toBe(false);
  shell.dispose();
});

test('ends a split drag when pointer capture is lost', () => {
  const { host, shell, layout } = mountShell();
  const separator = host.querySelector<HTMLElement>('[role=separator]');
  const chat = host.querySelector('.wb-chat');
  const inspector = host.querySelector('.wb-inspector');
  const rect = (left: number, right: number) =>
    ({ left, right, width: right - left }) as DOMRect;
  vi.spyOn(chat as HTMLElement, 'getBoundingClientRect').mockReturnValue(
    rect(0, 600),
  );
  vi.spyOn(inspector as HTMLElement, 'getBoundingClientRect').mockReturnValue(
    rect(600, 1000),
  );
  const fire = (type: string, clientX: number) =>
    separator?.dispatchEvent(new MouseEvent(type, { clientX, bubbles: true }));

  fire('pointerdown', 500);
  fire('pointermove', 600);
  fire('lostpointercapture', 600);
  fire('pointermove', 300);

  expect(layout.get().split).toBe(60);
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

function recordTwoTurns(store: ReturnType<typeof createWorkbenchStore>) {
  store.send('Plan');
  store.record('tool', { name: 'readContext', result: null });
  store.settle('complete', 'stop');
  const secondTurnStart = store.getSnapshot().events.length;
  store.send('Shorter');
  store.record('tool', { name: 'readContext', result: null });
  store.settle('complete', 'stop');
  return secondTurnStart;
}

function playerButton(host: HTMLElement, label: string) {
  const result = host.querySelector<HTMLButtonElement>(
    `.wb-player button[aria-label="${label}"]`,
  );
  if (!result) throw new Error(`Missing ${label} button`);
  return result;
}

function press(
  target: EventTarget,
  key: string,
  init: KeyboardEventInit = {},
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

test('jumps turns and cycles speed from the player', () => {
  const { host, store, shell } = mountShell();
  const secondTurnStart = recordTwoTurns(store);
  const speed = host.querySelector<HTMLButtonElement>('.wb-player .wb-speed');

  playerButton(host, 'Previous turn').click();
  const afterFirstPrevious = store.getSnapshot().cursor;
  playerButton(host, 'Previous turn').click();
  const afterSecondPrevious = store.getSnapshot().cursor;
  playerButton(host, 'Next turn').click();
  const afterNext = store.getSnapshot().cursor;
  const value = () => speed?.querySelector('.wb-speed-value')?.textContent;
  const speeds = [value()];
  speed?.click();
  speeds.push(value());
  speed?.click();
  speeds.push(value());

  expect(secondTurnStart).toBeGreaterThan(0);
  expect(afterFirstPrevious).toBe(secondTurnStart);
  expect(afterSecondPrevious).toBe(0);
  expect(afterNext).toBe(secondTurnStart);
  expect(speed?.hasAttribute('aria-label')).toBe(false);
  expect(speed?.textContent).toBe('Playback speed ½×');
  expect(speed?.querySelector('.wb-visually-hidden')?.textContent).toBe(
    'Playback speed ',
  );
  expect(speeds).toEqual(['1×', '2×', '½×']);
  expect(host.querySelectorAll('.wb-scrubber .wb-segment')).toHaveLength(2);
  expect(host.querySelector('select')).toBeNull();
  shell.dispose();
});

test('shows LIVE at the head and Return to live in replay', () => {
  const { host, store, shell } = mountShell();
  recordTwoTurns(store);
  const live = host.querySelector<HTMLButtonElement>('.wb-player .wb-live');
  const atHead = {
    disabled: live?.disabled,
    marked: live?.hasAttribute('data-live'),
    text: live?.textContent?.trim(),
    dot: !!live?.querySelector('.wb-live-dot'),
  };

  playerButton(host, 'Previous event').click();
  const inReplay = {
    disabled: live?.disabled,
    marked: live?.hasAttribute('data-live'),
    text: live?.textContent?.trim(),
  };
  live?.click();

  expect(live?.getAttribute('aria-label')).toBe('Return to live');
  expect(atHead).toEqual({
    disabled: true,
    marked: true,
    text: 'LIVE',
    dot: true,
  });
  expect(inReplay).toEqual({
    disabled: false,
    marked: false,
    text: 'Return to live',
  });
  expect(store.getSnapshot().cursor).toBeNull();
  shell.dispose();
});

test('toggles the play label and icon and reports playback time', () => {
  vi.useFakeTimers();
  const { host, store, shell } = mountShell();
  recordTwoTurns(store);
  const play = playerButton(host, 'Play');
  const time = host.querySelector('.wb-player .wb-time');

  play.click();
  const playing = {
    label: play.getAttribute('aria-label'),
    playing: play.classList.contains('wb-play'),
    text: play.textContent?.trim(),
    icon: !!play.querySelector('svg'),
  };
  shell.pause();

  expect(playing).toEqual({
    label: 'Pause',
    playing: true,
    text: '',
    icon: true,
  });
  expect(play.getAttribute('aria-label')).toBe('Play');
  expect(time?.textContent).toMatch(/^\d+\.\d{2} s \/ \d+\.\d{2} s$/);
  shell.dispose();
  vi.useRealTimers();
});

test('marks the selection strip live at the newest event only', () => {
  const { host, store, shell } = mountShell();
  recordTwoTurns(store);
  const strip = () => host.querySelector('.wb-selection')?.textContent ?? '';

  const atHead = strip();
  store.seek(0);
  const inReplay = strip();

  expect(atHead).toMatch(/event (\d+)\/\1 · live/);
  expect(inReplay).not.toContain('live');
  shell.dispose();
});

test('labels the inspector panel by its selected tab', () => {
  const { host, shell } = mountShell();
  const panel = host.querySelector('[role=tabpanel]');
  const selected = () =>
    host.querySelector<HTMLElement>('[role=tab][aria-selected=true]');

  const initial = panel?.getAttribute('aria-labelledby');
  const initialTab = selected()?.id;
  [...host.querySelectorAll<HTMLButtonElement>('[role=tab]')]
    .find((tab) => tab.textContent === 'State')
    ?.click();

  expect(initialTab).toBeTruthy();
  expect(initial).toBe(initialTab);
  expect(panel?.getAttribute('aria-labelledby')).toBe(selected()?.id);
  expect(selected()?.textContent).toBe('State');
  expect(
    new Set([...host.querySelectorAll('[role=tab]')].map((tab) => tab.id)).size,
  ).toBe(host.querySelectorAll('[role=tab]').length);
  shell.dispose();
});

test('positions ticks and the flag on the scrubber', () => {
  const { host, store, shell } = mountShell();
  const empty = host.querySelector('.wb-player .wb-time')?.textContent;
  recordTwoTurns(store);

  playerButton(host, 'Previous turn').click();

  const ticks = [
    ...host.querySelectorAll<HTMLButtonElement>(
      '.wb-scrubber .wb-events button',
    ),
  ];
  const flag = host.querySelector<HTMLElement>('.wb-scrubber .wb-flag');
  const pressed = ticks.find(
    (tick) => tick.getAttribute('aria-pressed') === 'true',
  );
  const segments = [
    ...host.querySelectorAll<HTMLElement>('.wb-scrubber .wb-segment'),
  ];
  expect(empty).toBe('No captured events');
  expect(ticks.every((tick) => tick.style.left.endsWith('%'))).toBe(true);
  expect(flag?.getAttribute('aria-hidden')).toBe('true');
  expect(flag?.textContent).toBe(pressed?.textContent);
  expect(flag?.style.left).toBe('60%');
  expect(flag?.hasAttribute('data-anchor')).toBe(false);
  expect(
    segments.map((segment) => segment.style.getPropertyValue('--wb-fill')),
  ).toEqual(['100%', '0%']);
  expect(segments[1]?.textContent).toContain('Turn 2');
  shell.dispose();
});

test('marks only the tick under the playhead so its mark yields to the thumb', () => {
  const { host, store, shell } = mountShell();
  store.send('Plan');
  store.record('parsed', { title: 'Pl' });
  store.record('parsed', { title: 'Plan' });
  store.settle('complete', 'stop');
  const atPlayhead = () =>
    [
      ...host.querySelectorAll<HTMLButtonElement>(
        '.wb-scrubber .wb-events button[data-at-playhead]',
      ),
    ].map((tick) => tick.dataset.index);

  const tickIndexes = [
    ...host.querySelectorAll<HTMLButtonElement>(
      '.wb-scrubber .wb-events button',
    ),
  ].map((tick) => Number(tick.dataset.index));
  const gap = store
    .getSnapshot()
    .events.findIndex((_, index) => !tickIndexes.includes(index));

  store.seek(tickIndexes[0] ?? 0);
  const onTick = atPlayhead();
  store.seek(gap);
  const betweenTicks = atPlayhead();

  expect(gap).toBeGreaterThan(-1);
  expect(onTick).toEqual([String(tickIndexes[0])]);
  expect(betweenTicks).toEqual([]);
  shell.dispose();
});

test('fills played portions of each turn up to the playhead', () => {
  const { host, store, shell } = mountShell();
  recordTwoTurns(store);
  const fills = () =>
    [...host.querySelectorAll<HTMLElement>('.wb-scrubber .wb-segment')].map(
      (segment) => segment.style.getPropertyValue('--wb-fill'),
    );

  store.seek(1);
  const early = fills();
  store.seek(4);
  const late = fills();

  expect(early).toEqual(['50%', '0%']);
  expect(late).toEqual(['100%', '50%']);
  expect(
    host.querySelector('.wb-scrubber .wb-segment[data-played]'),
  ).toBeNull();
  shell.dispose();
});

test('keeps the flag inside the scrubber at either end', () => {
  const { host, store, shell } = mountShell();
  recordTwoTurns(store);
  const flag = host.querySelector<HTMLElement>('.wb-scrubber .wb-flag');

  const atHead = flag?.dataset.anchor;
  store.seek(0);
  const atStart = flag?.dataset.anchor;

  expect(atHead).toBe('end');
  expect(atStart).toBe('start');
  shell.dispose();
});

test('keeps focus on an activated request row and tick', () => {
  const { host, store, shell } = mountShell();
  store.send('Plan');
  store.record('request', { requestId: 'r1', input: { messages: [] } });
  store.record('tool', { name: 'readContext', result: null });
  store.settle('complete', 'stop');
  const row = host.querySelectorAll<HTMLButtonElement>(
    '.wb-requests-table button[data-exchange]',
  )[0];
  const rowText = row?.textContent;
  row?.focus();

  row?.click();
  const focusedRow = document.activeElement;
  const tick = host.querySelectorAll<HTMLButtonElement>(
    '.wb-scrubber .wb-events button',
  )[0];
  const label = tick?.getAttribute('aria-label');
  tick?.focus();
  tick?.click();
  const focusedTick = document.activeElement;

  expect(focusedRow?.closest('.wb-requests-table')).not.toBeNull();
  expect(focusedRow?.textContent).toBe(rowText);
  expect(focusedRow?.getAttribute('aria-pressed')).toBe('true');
  expect(focusedTick?.closest('.wb-events')).not.toBeNull();
  expect(focusedTick?.getAttribute('aria-label')).toBe(label);
  expect(focusedTick?.getAttribute('aria-pressed')).toBe('true');
  shell.dispose();
});

test('labels player icon buttons and the rail toggle with a visible title', () => {
  const { host, store, shell } = mountShell();
  recordTwoTurns(store);
  const play = playerButton(host, 'Play');

  play.click();
  const controls = [
    ...host.querySelectorAll<HTMLButtonElement>(
      '.wb-transport button, .wb-player .wb-live, .wb-player [aria-label="Raw events"], .wb-rail-toggle',
    ),
  ];
  const titles = controls.map((node) => [
    node.getAttribute('title'),
    node.getAttribute('aria-label'),
  ]);
  shell.pause();

  expect(controls).toHaveLength(8);
  expect(titles.every(([title, label]) => !!title && title === label)).toBe(
    true,
  );
  expect(play.getAttribute('title')).toBe('Play');
  expect(titles).toContainEqual(['Pause', 'Pause']);
  shell.dispose();
});

test('rebuilds the sidebar only when rail or sections change', () => {
  const { host, shell, layout } = mountShell();
  const grid = host.querySelector<HTMLElement>('.wb-layout');
  const before = host.querySelector('.wb-cta');

  layout.set({ split: 60 });
  const afterSplit = host.querySelector('.wb-cta');
  layout.set({ collapsed: ['recipes'] });
  const afterCollapse = host.querySelector('.wb-cta');

  expect(afterSplit).toBe(before);
  expect(grid?.style.getPropertyValue('--wb-chat')).toBe('60fr');
  expect(grid?.style.getPropertyValue('--wb-inspector')).toBe('40fr');
  expect(afterCollapse).not.toBe(before);
  shell.dispose();
});

test('drives playback from shortcuts only on the visible instance', () => {
  const layout = createWorkbenchLayoutStore(fakeStorage());
  const first = mountShell(layout);
  const second = mountShell(layout);
  second.host.hidden = true;
  recordTwoTurns(first.store);
  recordTwoTurns(second.store);

  const arrow = press(document.body, 'ArrowLeft');
  const afterArrow = [
    first.store.getSnapshot().cursor,
    second.store.getSnapshot().cursor,
  ];
  const space = press(playerButton(first.host, 'Play'), ' ');
  const afterSpace = first.store.getSnapshot().cursor;

  expect(arrow.defaultPrevented).toBe(true);
  expect(afterArrow).toEqual([4, null]);
  expect(space.defaultPrevented).toBe(false);
  expect(afterSpace).toBe(4);
  expect(second.store.getSnapshot().cursor).toBeNull();
  first.shell.dispose();
  second.shell.dispose();
});

test('removes its document shortcut listener on dispose', () => {
  const add = vi.spyOn(document, 'addEventListener');
  const remove = vi.spyOn(document, 'removeEventListener');
  const { shell } = mountShell();
  const added = add.mock.calls
    .filter(([type]) => type === 'keydown')
    .map(([, listener]) => listener);

  shell.dispose();
  const removed = remove.mock.calls
    .filter(([type]) => type === 'keydown')
    .map(([, listener]) => listener);

  expect(added).toHaveLength(1);
  expect(removed).toContain(added[0]);
  add.mockRestore();
  remove.mockRestore();
});

test('jumps turns and returns live from keyboard shortcuts', () => {
  const { store, shell } = mountShell();
  const secondTurnStart = recordTwoTurns(store);
  store.seek(0);

  const next = press(document.body, 'ArrowRight', { shiftKey: true });
  const afterNextTurn = store.getSnapshot().cursor;
  press(document.body, 'ArrowLeft', { shiftKey: true });
  const afterPreviousTurn = store.getSnapshot().cursor;
  press(document.body, 'ArrowRight');
  const afterNextEvent = store.getSnapshot().cursor;
  press(document.body, 'l');

  expect(next.defaultPrevented).toBe(true);
  expect(afterNextTurn).toBe(secondTurnStart);
  expect(afterPreviousTurn).toBe(0);
  expect(afterNextEvent).toBe(1);
  expect(store.getSnapshot().cursor).toBeNull();
  shell.dispose();
});

test('ignores player shortcuts typed in the message field', () => {
  const { host, store, shell } = mountShell();
  recordTwoTurns(store);
  store.seek(0);
  const field = host.querySelector<HTMLTextAreaElement>('textarea');

  const typed = press(field as HTMLTextAreaElement, 'l');

  expect(typed.defaultPrevented).toBe(false);
  expect(store.getSnapshot().cursor).toBe(0);
  shell.dispose();
});

test('toggles the rail with Cmd+B and Ctrl+B', () => {
  const { shell, layout } = mountShell();

  press(document.body, 'b', { metaKey: true });
  const afterCmd = layout.get().rail;
  press(document.body, 'B', { ctrlKey: true });

  expect(afterCmd).toBe(true);
  expect(layout.get().rail).toBe(false);
  shell.dispose();
});

function scrubberPointer(
  target: EventTarget,
  type: string,
  clientX: number,
  init: Record<string, unknown> = {},
) {
  target.dispatchEvent(
    Object.assign(
      new MouseEvent(type, { clientX, bubbles: true, cancelable: true }),
      { pointerId: 1, ...init },
    ),
  );
}

test('drags the bottom scrubber from anywhere on the track, including a tick', () => {
  const { host, store, shell } = mountShell();
  recordTwoTurns(store);
  const scrubber = host.querySelector<HTMLElement>('.wb-scrubber');
  vi.spyOn(scrubber as HTMLElement, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    right: 1000,
    width: 1000,
  } as DOMRect);
  const total = store.getSnapshot().events.length;
  playerButton(host, 'Play').click();
  const playing = host.querySelector('.wb-player button[aria-label="Pause"]');

  scrubberPointer(scrubber as HTMLElement, 'pointerdown', 0);
  const atStart = store.getSnapshot().cursor;
  scrubberPointer(scrubber as HTMLElement, 'pointermove', 1000);
  const atEnd = store.getSnapshot().cursor;
  scrubberPointer(scrubber as HTMLElement, 'pointerup', 1000);
  const tick = host.querySelectorAll<HTMLButtonElement>(
    '.wb-scrubber .wb-events button',
  )[1];
  scrubberPointer(tick, 'pointerdown', 500);
  scrubberPointer(tick, 'pointermove', 530);
  scrubberPointer(tick, 'pointerup', 530);
  // The scrub rebuilt the ticks; the trailing click lands on the current one.
  host
    .querySelector<HTMLButtonElement>(
      `.wb-scrubber .wb-events button[data-index="${tick.dataset.index}"]`,
    )
    ?.click();

  expect(atStart).toBe(0);
  expect(atEnd).toBe(total - 1);
  expect(store.getSnapshot().cursor).toBe(Math.round(0.53 * (total - 1)));
  expect(document.activeElement?.getAttribute('aria-label')).toBe(
    'Seek captured event',
  );
  expect(playing).not.toBeNull();
  expect(
    host.querySelector('.wb-player button[aria-label="Pause"]'),
  ).toBeNull();
  shell.dispose();
});

test('still seeks to a tick on a plain click', () => {
  const { host, store, shell } = mountShell();
  recordTwoTurns(store);
  const scrubber = host.querySelector<HTMLElement>('.wb-scrubber');
  vi.spyOn(scrubber as HTMLElement, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    right: 1000,
    width: 1000,
  } as DOMRect);
  const tick = host.querySelectorAll<HTMLButtonElement>(
    '.wb-scrubber .wb-events button',
  )[0];
  const index = Number(tick.dataset.index);

  scrubberPointer(tick, 'pointerdown', 10);
  scrubberPointer(tick, 'pointerup', 10);
  tick.click();

  expect(store.getSnapshot().cursor).toBe(index);
  shell.dispose();
});

test('history inspector pairs actual SDK and retained app text and Raw keeps the selected event', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const store = createWorkbenchStore('history');
  const shell = mountWorkbench(host, store, {
    framework: 'React',
    lesson: {
      id: 'message-history',
      title: 'Message history',
      format: 'history',
      inspector: 'History',
    },
    send: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  });
  store.recordHistory({
    messages: [
      { id: 'actual-user', role: 'user', content: 'Lighthouse' },
      {
        id: 'actual-assistant',
        role: 'assistant',
        content: 'Outline, record.',
        toolCalls: [],
      },
    ],
    isLoading: false,
  });

  const tabs = [...host.querySelectorAll('[role=tab]')].map(
    (node) => node.textContent,
  );

  store.recordHistory({ messages: [], isLoading: false, isSending: true });
  expect(
    host.querySelector<HTMLInputElement>('[aria-label="Seek captured event"]')
      ?.disabled,
  ).toBe(true);
  store.recordHistory({
    messages: [
      { id: 'actual-user', role: 'user', content: 'Lighthouse' },
      {
        id: 'actual-assistant',
        role: 'assistant',
        content: 'Outline, record.',
        toolCalls: [],
      },
    ],
    isLoading: false,
  });
  expect(tabs).toContain('History');
  expect(tabs).toContain('Saved text');
  expect(host.querySelector('[data-captured]')?.textContent).toContain(
    'actual-user',
  );
  expect(host.querySelector('[data-detail]')?.textContent).toContain(
    'retained',
  );
  host
    .querySelector<HTMLButtonElement>('[aria-label="Show captured frame"]')
    ?.click();
  expect(host.querySelector('[data-captured]')?.textContent).toContain('"sdk"');
  expect(host.querySelector('[data-captured]')?.textContent).toContain(
    '"event"',
  );
  shell.dispose();
});

test('history Text and UI views describe the actual selected text without generated components', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const store = createWorkbenchStore('history');
  const shell = mountWorkbench(host, store, {
    framework: 'React',
    lesson: {
      id: 'message-history',
      title: 'Message history',
      format: 'history',
      inspector: 'History',
    },
    send: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  });
  store.recordHistory({
    messages: [
      { id: 'u', role: 'user', content: 'Lighthouse' },
      {
        id: 'a',
        role: 'assistant',
        content: 'Lighthouse: outline, then record.',
      },
    ],
    isLoading: false,
  });
  const tab = (name: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('[role=tab]')]
      .find((item) => item.textContent === name)
      ?.click();

  tab('Text');

  expect(host.querySelector('[data-captured]')?.textContent).toContain(
    'Lighthouse: outline, then record.',
  );
  store.recordHistory({ messages: [], isLoading: false });
  expect(host.querySelector('[data-captured]')?.textContent).not.toContain(
    'Lighthouse: outline, then record.',
  );
  tab('UI');
  expect(host.querySelector('[data-captured]')?.textContent).toContain(
    'Plain text',
  );
  expect(host.querySelector('[data-captured]')?.textContent).not.toContain(
    'SummaryCard',
  );
  expect(host.querySelector('[data-captured]')?.textContent).toContain(
    '"generatedProps": false',
  );
  shell.dispose();
  host.remove();
});
