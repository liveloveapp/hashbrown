import {
  createAtcStore,
  DEV_MODE_KEY,
  DRAWER_HEIGHT_KEY,
  ROUTER_SKIPPED,
  STARTER_PROMPTS,
  transcriptItems,
  type TurnShown,
} from '@atc/shared';
import {
  fakeCardsTransport,
  fakeDecisionTransport,
  fakeFilterTransport,
} from '@atc/shared/testing';
import type { Chat } from '@hashbrownai/core';
import { HashbrownProvider, type UiChatMessage } from '@hashbrownai/react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterAll, expect, test, vi } from 'vitest';
import { App } from './app';
import { Assistant } from './assistant';
import { DevDrawer } from './dev-drawer';
import {
  type DevChat,
  DevModeProvider,
  useDevMode,
  usePublishDev,
} from './dev-mode';
import { Rail } from './rail';
import { AtcStoreProvider } from './store';
import { Transcript } from './transcript';

// Leaflet is not under test here: the map is a plain element.
vi.mock('./airspace-map', () => ({
  AirspaceMap: () => <div className="atc-map" data-testid="airspace-map" />,
}));

// The feed, the router and the cards decision go over fetch: offline here.
vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
// jsdom has no PointerEvent; fireEvent falls back to Event, without clientY.
vi.stubGlobal(
  'PointerEvent',
  class extends MouseEvent {
    readonly pointerId: number;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  },
);
afterAll(() => vi.unstubAllGlobals());

function memoryStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));

  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

function text(element: Element | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** The text a reader sees: Markdown's own stylesheet is left out. */
function visibleText(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll('style').forEach((style) => style.remove());

  return text(copy);
}

function answerJson(words: string): string {
  return JSON.stringify({
    ui: [{ Markdown: { props: { children: words } } }],
  });
}

/** The whole app with a scripted chat model. */
function renderApp() {
  cleanup();
  const chat = fakeFilterTransport();
  const view = render(
    <HashbrownProvider url="/unused" transport={chat.transport}>
      <AtcStoreProvider store={createAtcStore()}>
        <App />
      </AtcStoreProvider>
    </HashbrownProvider>,
  );

  return { chat, element: view.container, unmount: view.unmount };
}

function toggle(element: HTMLElement): HTMLButtonElement {
  return element.querySelector(
    '[data-testid="dev-toggle"]',
  ) as HTMLButtonElement;
}

function drawer(element: HTMLElement): HTMLElement | null {
  return element.querySelector('[data-testid="dev-drawer"]');
}

function tab(element: HTMLElement, label: string): HTMLButtonElement {
  return [...element.querySelectorAll('[role="tab"]')].find(
    (candidate) => text(candidate) === label,
  ) as HTMLButtonElement;
}

function starterButton(element: HTMLElement, label: string) {
  return [...element.querySelectorAll('button')].find((button) =>
    button.textContent?.startsWith(label),
  ) as HTMLButtonElement;
}

/** Publishes a chat to the drawer, as the assistant does. */
function Feed({ chat }: { chat: DevChat }) {
  usePublishDev('chat', chat);

  return null;
}

function inDevMode(ui: ReactElement, seed: Record<string, string> = {}) {
  cleanup();
  const storage = memoryStorage({ [DEV_MODE_KEY]: 'on', ...seed });
  const view = render(
    <AtcStoreProvider store={createAtcStore()}>
      <DevModeProvider storage={storage}>{ui}</DevModeProvider>
    </AtcStoreProvider>,
  );

  return { storage, element: view.container, unmount: view.unmount };
}

test('the rail toggles the drawer and remembers it', () => {
  localStorage.clear();
  const first = renderApp();

  const before = drawer(first.element);
  const pressedBefore = toggle(first.element).getAttribute('aria-pressed');
  fireEvent.click(toggle(first.element));
  const opened = drawer(first.element);
  const stored = localStorage.getItem(DEV_MODE_KEY);
  first.unmount();
  const second = renderApp();
  const remembered = drawer(second.element);
  fireEvent.click(toggle(second.element));

  expect(before).toBeNull();
  expect(pressedBefore).toBe('false');
  expect(opened).not.toBeNull();
  expect(stored).toBe('on');
  expect(remembered).not.toBeNull();
  expect(toggle(second.element).getAttribute('aria-label')).toBe(
    'Developer tools',
  );
  expect(drawer(second.element)).toBeNull();
  expect(toggle(second.element).getAttribute('aria-pressed')).toBe('false');
  expect(localStorage.getItem(DEV_MODE_KEY)).toBe('off');
});

test('with dev mode off there is no technical UI', async () => {
  localStorage.clear();
  const { chat, element } = renderApp();
  const starter = STARTER_PROMPTS.find((entry) => entry.route !== 'filter');
  act(() => starterButton(element, starter?.text ?? '').click());
  await waitFor(() => expect(chat.requests).toHaveLength(1));
  act(() => chat.push(answerJson('Six turboprops, flying north.')));
  act(() => chat.finish());
  await waitFor(() =>
    expect(text(element)).toContain('Six turboprops, flying north.'),
  );
  const tools = inDevModeTools();

  fireEvent.click(toggle(element));
  fireEvent.click(tab(element, 'UI stream'));
  const shown = text(drawer(element));
  fireEvent.click(toggle(element));
  fireEvent.click(toggle(tools.element));

  expect(shown).toContain('"Markdown"');
  for (const root of [element, tools.element]) {
    expect(
      root.querySelectorAll('[class*="atc-dev-"], [class*="atc-stream"]'),
    ).toHaveLength(0);
    expect(root.querySelector('[data-testid="dev-drawer"]')).toBeNull();
    expect(visibleText(root)).not.toContain('"Markdown"');
    expect(visibleText(root)).not.toContain('{');
    expect(visibleText(root)).not.toContain('KSEA');
  }
});

/** A transcript with a tool call and its arguments, beside the rail. */
function inDevModeTools() {
  const messages = [
    { id: 'u-1', role: 'user', content: 'Seattle?' },
    {
      role: 'assistant',
      toolCalls: [
        {
          role: 'tool',
          toolCallId: 't1',
          name: 'findAircraft',
          args: { approaching: 'KSEA' },
          status: 'done',
          result: { status: 'fulfilled', value: [] },
        },
      ],
      content: { ui: [{ Markdown: { props: { children: 'Two.' } } }] },
      ui: [<p key="a">Two.</p>],
    },
  ] as UiChatMessage<Chat.AnyTool>[];
  const host = document.createElement('div');
  document.body.append(host);
  const items = transcriptItems(messages);
  const turns: TurnShown[] = [{ text: 'Seattle?', router: ROUTER_SKIPPED }];
  const view = render(<ToolsHarness items={items} turns={turns} />, {
    container: host,
  });

  return { element: view.container };
}

type Items = ReturnType<typeof transcriptItems<UiChatMessage<Chat.AnyTool>>>;

/** The rail, a transcript and the drawer, in dev mode. */
function ToolsHarness({
  items,
  turns,
}: {
  items: Items;
  turns: readonly TurnShown[];
}) {
  return (
    <AtcStoreProvider store={createAtcStore()}>
      <DevModeProvider storage={memoryStorage({ [DEV_MODE_KEY]: 'on' })}>
        <Feed chat={{ items, turns, busy: false }} />
        <HarnessRail />
        <Transcript items={items} />
        <DevDrawer />
      </DevModeProvider>
    </AtcStoreProvider>
  );
}

function HarnessRail() {
  const dev = useDevMode();

  return <Rail on={dev.on} onToggle={dev.toggle} />;
}

test('the drawer always follows the newest send', async () => {
  cleanup();
  const chat = fakeFilterTransport();
  const route = fakeDecisionTransport(() => ({
    intent: 'chat',
    confidence: 0.9,
  }));
  const cards = fakeCardsTransport(() => null);
  const view = render(
    <HashbrownProvider url="/unused" transport={chat.transport}>
      <AtcStoreProvider store={createAtcStore()}>
        <DevModeProvider storage={memoryStorage({ [DEV_MODE_KEY]: 'on' })}>
          <Assistant
            routeTransport={route.transport}
            cardsTransport={cards.transport}
            onFilter={() => undefined}
          />
          <DevDrawer />
        </DevModeProvider>
      </AtcStoreProvider>
    </HashbrownProvider>,
  );
  const element = view.container;
  const input = element.querySelector('input') as HTMLInputElement;
  const answer = async (sent: number, words: string) => {
    await waitFor(() => expect(chat.requests).toHaveLength(sent));
    act(() => chat.push(answerJson(words)));
    act(() => chat.finish());
    await waitFor(() => expect(text(element)).toContain(words));
  };
  const ask = async (question: string, sent: number, words: string) => {
    fireEvent.change(input, { target: { value: question } });
    await waitFor(() =>
      expect(text(element.querySelector('.atc-route'))).toBe('→ chat 0.90'),
    );
    fireEvent.submit(element.querySelector('form') as HTMLFormElement);
    await answer(sent, words);
  };
  const shown = () => text(element.querySelector('[role="tabpanel"]'));
  const starter = STARTER_PROMPTS.find((entry) => entry.route !== 'filter');

  act(() => starterButton(element, starter?.text ?? '').click());
  await answer(1, 'First answer');
  await ask('What about Bend?', 2, 'Second answer');
  fireEvent.click(tab(element, 'UI stream'));
  const second = shown();
  await ask('And Redmond?', 3, 'Third answer');
  const third = shown();

  expect(second).toContain('Second answer');
  expect(third).toContain('Third answer');
  expect(third).not.toContain('Second answer');
  expect(element.querySelector('.atc-dev-latest')).toBeNull();
  expect(element.querySelector('.atc-dev-inspect')).toBeNull();
});

test('dragging the handle resizes within the clamp and is remembered', () => {
  let column = 1000;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      return {
        height: this.dataset['testid'] === 'column' ? column : 0,
      } as DOMRect;
    },
  );
  const ui = (
    <div data-testid="column">
      <DevDrawer />
    </div>
  );
  const { storage, element, unmount } = inDevMode(ui);
  const panel = () => drawer(element) as HTMLElement;
  const height = () => panel().style.getPropertyValue('--atc-drawer-height');
  const handle = element.querySelector('.atc-dev-resize') as HTMLElement;

  const initial = height();
  fireEvent.pointerDown(handle, { clientY: 500, pointerId: 1, button: 2 });
  fireEvent.pointerMove(handle, { clientY: 300, pointerId: 1 });
  const ignored = height();
  const down = fireEvent.pointerDown(handle, {
    clientY: 500,
    pointerId: 1,
    button: 0,
  });
  const selecting = document.body.style.userSelect;
  fireEvent.pointerMove(handle, { clientY: 300, pointerId: 1 });
  const dragged = height();
  fireEvent.pointerMove(handle, { clientY: -1000, pointerId: 1 });
  const capped = height();
  const unsaved = storage.data.get(DRAWER_HEIGHT_KEY);
  fireEvent.pointerUp(handle, { clientY: -1000, pointerId: 1 });
  const saved = storage.data.get(DRAWER_HEIGHT_KEY);
  const selectingAfter = document.body.style.userSelect;
  fireEvent.pointerDown(handle, { clientY: 500, pointerId: 2, button: 0 });
  fireEvent.pointerMove(handle, { clientY: 700, pointerId: 2 });
  fireEvent.pointerCancel(handle, { pointerId: 2 });
  const cancelled = storage.data.get(DRAWER_HEIGHT_KEY);
  fireEvent.keyDown(handle, { key: 'Home' });
  const home = height();
  fireEvent.keyDown(handle, { key: 'End' });
  const end = height();
  column = 500;
  act(() => window.dispatchEvent(new Event('resize')));
  const reclamped = height();
  unmount();
  column = 1000;
  const again = inDevMode(ui, { [DRAWER_HEIGHT_KEY]: saved ?? '' });
  const restored = drawer(again.element)?.style.getPropertyValue(
    '--atc-drawer-height',
  );
  vi.restoreAllMocks();

  expect(initial).toBe('350px');
  expect(ignored).toBe('350px');
  expect(down).toBe(false);
  expect(selecting).toBe('none');
  expect(selectingAfter).toBe('');
  expect(cancelled).toBe('400');
  expect(home).toBe('160px');
  expect(end).toBe('600px');
  expect(dragged).toBe('550px');
  expect(capped).toBe('600px');
  expect(unsaved).toBeUndefined();
  expect(saved).toBe('600');
  expect(reclamped).toBe('300px');
  expect(restored).toBe('600px');
  expect(storage.data.get(DRAWER_HEIGHT_KEY)).toBe('600');
});

test('JSON renders as text', () => {
  const messages = [
    { id: 'u-1', role: 'user', content: 'Highest?' },
    {
      role: 'assistant',
      toolCalls: [],
      content: { ui: [{ Markdown: { props: { children: '<b>hi</b>' } } }] },
      ui: [<p key="a">hi</p>],
    },
  ] as UiChatMessage<Chat.AnyTool>[];
  const chat: DevChat = {
    items: transcriptItems(messages),
    turns: [{ text: 'Highest?', router: ROUTER_SKIPPED }],
    busy: false,
  };
  const { element } = inDevMode(
    <>
      <Feed chat={chat} />
      <DevDrawer />
    </>,
  );

  fireEvent.click(tab(element, 'UI stream'));
  const body = element.querySelector('[role="tabpanel"]');

  expect(text(body)).toContain('<b>hi</b>');
  expect(drawer(element)?.querySelector('b')).toBeNull();
});

test('the drawer is aria-live off', () => {
  const { element } = inDevMode(<DevDrawer />);

  const panel = drawer(element);
  const tabs = [...element.querySelectorAll('[role="tab"]')];
  const body = element.querySelector('[role="tabpanel"]');

  expect(panel?.getAttribute('aria-live')).toBe('off');
  expect(element.querySelector('[role="tablist"]')).not.toBeNull();
  expect(tabs.map((entry) => text(entry))).toEqual([
    'Router',
    'Cards',
    'Filter',
    'UI stream',
    'Tools',
  ]);
  expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
  expect(body?.getAttribute('aria-labelledby')).toBe(tabs[0]?.id);
});

test('a publisher that unmounts clears what it published', () => {
  const messages = [
    { id: 'u-1', role: 'user', content: 'Highest?' },
    {
      role: 'assistant',
      toolCalls: [],
      content: { ui: [{ Markdown: { props: { children: 'Gone soon' } } }] },
      ui: [<p key="a">Gone soon</p>],
    },
  ] as UiChatMessage<Chat.AnyTool>[];
  const chat: DevChat = {
    items: transcriptItems(messages),
    turns: [{ text: 'Highest?', router: ROUTER_SKIPPED }],
    busy: false,
  };
  const storage = memoryStorage({ [DEV_MODE_KEY]: 'on' });
  const tree = (published: boolean) => (
    <AtcStoreProvider store={createAtcStore()}>
      <DevModeProvider storage={storage}>
        {published ? <Feed chat={chat} /> : null}
        <DevDrawer />
      </DevModeProvider>
    </AtcStoreProvider>
  );
  cleanup();
  const view = render(tree(true));
  fireEvent.click(tab(view.container, 'UI stream'));

  const before = text(view.container.querySelector('[role="tabpanel"]'));
  view.rerender(tree(false));
  const after = text(view.container.querySelector('[role="tabpanel"]'));

  expect(before).toContain('Gone soon');
  expect(after).not.toContain('Gone soon');
});
