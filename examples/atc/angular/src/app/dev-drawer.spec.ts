import {
  createAtcStore,
  DEV_MODE_KEY,
  type DevStorage,
  DRAWER_HEIGHT_KEY,
  type MapFilter,
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
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
  type Type,
} from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHashbrown, type UiChatMessage } from '@hashbrownai/angular';
import { afterAll, expect, test, vi } from 'vitest';
import { AirspaceMap } from './airspace-map';
import { App } from './app';
import { Assistant, CARDS_DECISION_TRANSPORT } from './assistant';
import { DevDrawer } from './dev-drawer';
import { DEV_STORAGE, type DevChat, DevMode, publishDev } from './dev-mode';
import { Rail } from './rail';
import { ROUTE_DECISION_TRANSPORT } from './router';
import { ATC_STORE } from './store';
import { Transcript } from './transcript';

// The feed, the router and the cards decision go over fetch: offline here.
vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
afterAll(() => vi.unstubAllGlobals());

/** Leaflet is not under test here: the map is a plain element. */
@Component({
  selector: 'atc-airspace-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'atc-map', 'data-testid': 'airspace-map' },
  template: '',
})
class FakeMap {
  readonly obstruction = input<HTMLElement | null>(null);
  readonly streaming = input<ReadonlySet<keyof MapFilter>>(new Set());
  readonly notice = input<string | null>(null);
  readonly clearFilter = output<void>();
}

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

async function until(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    TestBed.tick();
    if (check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('condition not met');
}

/** Providers for the chat, the router and the cards decision, all scripted. */
function configure(storage: DevStorage | null = null) {
  const chat = fakeFilterTransport();
  const route = fakeDecisionTransport(() => ({
    intent: 'chat',
    confidence: 0.9,
  }));
  const cards = fakeCardsTransport(() => null);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHashbrown({ baseUrl: '/unused', transport: chat.transport }),
      { provide: ATC_STORE, useValue: createAtcStore() },
      { provide: ROUTE_DECISION_TRANSPORT, useValue: route.transport },
      { provide: CARDS_DECISION_TRANSPORT, useValue: cards.transport },
      ...(storage === null
        ? []
        : [{ provide: DEV_STORAGE, useValue: storage }]),
    ],
  });
  TestBed.overrideComponent(App, {
    remove: { imports: [AirspaceMap] },
    add: { imports: [FakeMap] },
  });

  return { chat };
}

function mount<T>(type: Type<T>) {
  const fixture = TestBed.createComponent(type);
  document.body.append(fixture.nativeElement);
  fixture.detectChanges();

  return {
    fixture,
    element: fixture.nativeElement as HTMLElement,
    unmount: () => {
      fixture.destroy();
      (fixture.nativeElement as HTMLElement).remove();
    },
  };
}

/** The whole app with a scripted chat model and the browser's storage. */
function renderApp() {
  const { chat } = configure();

  return { chat, ...mount(App) };
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
    button.textContent?.trim().startsWith(label),
  ) as HTMLButtonElement;
}

function click(fixture: ComponentFixture<unknown>, target: Element | null) {
  (target as HTMLElement | null)?.click();
  fixture.detectChanges();
}

/** Publishes a chat to the drawer, as the assistant does. */
@Component({
  selector: 'atc-test-feed',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class Feed {
  readonly chat = input.required<DevChat>();

  constructor() {
    publishDev('chat', this.chat);
  }
}

test('the rail toggles the drawer and remembers it', () => {
  localStorage.clear();
  const first = renderApp();

  const before = drawer(first.element);
  const pressedBefore = toggle(first.element).getAttribute('aria-pressed');
  click(first.fixture, toggle(first.element));
  const opened = drawer(first.element);
  const stored = localStorage.getItem(DEV_MODE_KEY);
  first.unmount();
  const second = renderApp();
  const remembered = drawer(second.element);
  click(second.fixture, toggle(second.element));

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
  second.unmount();
});

const TOOL_MESSAGES = [
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
    ui: [],
  },
] as unknown as UiChatMessage[];

/** The rail, a transcript with a tool call and the drawer, in dev mode. */
@Component({
  selector: 'atc-test-tools',
  imports: [Feed, Rail, Transcript, DevDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    DevMode,
    {
      provide: DEV_STORAGE,
      useFactory: () => memoryStorage({ [DEV_MODE_KEY]: 'on' }),
    },
  ],
  template: `
    <atc-test-feed [chat]="chat" />
    <atc-rail [on]="dev.on()" (toggleDevMode)="dev.toggle()" />
    <atc-transcript [items]="chat.items" />
    @if (dev.on()) {
      <atc-dev-drawer />
    }
  `,
})
class ToolsHarness {
  protected readonly dev = inject(DevMode);
  protected readonly chat = {
    items: transcriptItems(TOOL_MESSAGES),
    turns: [{ text: 'Seattle?', router: ROUTER_SKIPPED }] as TurnShown[],
    busy: false,
  };
}

test('with dev mode off there is no technical UI', async () => {
  localStorage.clear();
  const { chat, fixture, element, unmount } = renderApp();
  const tools = mount(ToolsHarness);
  const starter = STARTER_PROMPTS.find((entry) => entry.route !== 'filter');
  starterButton(element, starter?.text ?? '').click();
  await until(() => chat.requests.length === 1);
  chat.push(answerJson('Six turboprops, flying north.'));
  chat.finish();
  await until(() => text(element).includes('Six turboprops, flying north.'));

  click(fixture, toggle(element));
  click(fixture, tab(element, 'UI stream'));
  const shown = text(drawer(element));
  click(fixture, toggle(element));
  click(tools.fixture, toggle(tools.element));

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
  unmount();
  tools.unmount();
});

/** The assistant and the drawer, in dev mode. */
@Component({
  selector: 'atc-test-chat',
  imports: [Assistant, DevDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<atc-assistant /><atc-dev-drawer />`,
})
class ChatHarness {}

test('the drawer always follows the newest send', async () => {
  const { chat } = configure(memoryStorage({ [DEV_MODE_KEY]: 'on' }));
  const { fixture, element, unmount } = mount(ChatHarness);
  const input = element.querySelector('input') as HTMLInputElement;
  const answer = async (sent: number, words: string) => {
    await until(() => chat.requests.length === sent);
    chat.push(answerJson(words));
    chat.finish();
    await until(() => text(element).includes(words));
  };
  const ask = async (question: string, sent: number, words: string) => {
    input.value = question;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await until(
      () => text(element.querySelector('.atc-route')) === '→ chat 0.90',
    );
    element
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { cancelable: true }));
    await answer(sent, words);
  };
  const shown = () => {
    fixture.detectChanges();
    return text(element.querySelector('[role="tabpanel"]'));
  };
  const starter = STARTER_PROMPTS.find((entry) => entry.route !== 'filter');

  starterButton(element, starter?.text ?? '').click();
  await answer(1, 'First answer');
  await ask('What about Bend?', 2, 'Second answer');
  click(fixture, tab(element, 'UI stream'));
  const second = shown();
  await ask('And Redmond?', 3, 'Third answer');
  const third = shown();

  expect(second).toContain('Second answer');
  expect(third).toContain('Third answer');
  expect(third).not.toContain('Second answer');
  expect(element.querySelector('.atc-dev-latest')).toBeNull();
  expect(element.querySelector('.atc-dev-inspect')).toBeNull();
  unmount();
});

/** The drawer alone, in a column the test measures. */
@Component({
  selector: 'atc-test-column',
  imports: [DevDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div data-testid="column"><atc-dev-drawer /></div>`,
})
class ColumnHarness {}

function pointer(
  target: Element,
  type: string,
  init: { clientY?: number; pointerId: number; button?: number },
): boolean {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientY: init.clientY ?? 0,
    button: init.button ?? 0,
  });
  Object.assign(event, { pointerId: init.pointerId });

  return target.dispatchEvent(event);
}

test('dragging the handle resizes within the clamp and is remembered', () => {
  let column = 1000;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      return {
        height: this.dataset['testid'] === 'column' ? column : 0,
      } as DOMRect;
    },
  );
  const storage = memoryStorage({ [DEV_MODE_KEY]: 'on' });
  configure(storage);
  const { fixture, element, unmount } = mount(ColumnHarness);
  const panel = () => {
    fixture.detectChanges();
    return drawer(element) as HTMLElement;
  };
  const height = () => panel().style.getPropertyValue('--atc-drawer-height');
  const handle = element.querySelector('.atc-dev-resize') as HTMLElement;

  const initial = height();
  pointer(handle, 'pointerdown', { clientY: 500, pointerId: 1, button: 2 });
  pointer(handle, 'pointermove', { clientY: 300, pointerId: 1 });
  const ignored = height();
  const down = pointer(handle, 'pointerdown', {
    clientY: 500,
    pointerId: 1,
    button: 0,
  });
  const selecting = document.body.style.userSelect;
  pointer(handle, 'pointermove', { clientY: 300, pointerId: 1 });
  const dragged = height();
  pointer(handle, 'pointermove', { clientY: -1000, pointerId: 1 });
  const capped = height();
  const unsaved = storage.data.get(DRAWER_HEIGHT_KEY);
  pointer(handle, 'pointerup', { clientY: -1000, pointerId: 1 });
  const saved = storage.data.get(DRAWER_HEIGHT_KEY);
  const selectingAfter = document.body.style.userSelect;
  pointer(handle, 'pointerdown', { clientY: 500, pointerId: 2, button: 0 });
  pointer(handle, 'pointermove', { clientY: 700, pointerId: 2 });
  pointer(handle, 'pointercancel', { pointerId: 2 });
  const cancelled = storage.data.get(DRAWER_HEIGHT_KEY);
  handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
  const home = height();
  handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
  const end = height();
  column = 500;
  window.dispatchEvent(new Event('resize'));
  const reclamped = height();
  unmount();
  column = 1000;
  configure(
    memoryStorage({ [DEV_MODE_KEY]: 'on', [DRAWER_HEIGHT_KEY]: saved ?? '' }),
  );
  const again = mount(ColumnHarness);
  const restored = drawer(again.element)?.style.getPropertyValue(
    '--atc-drawer-height',
  );
  again.unmount();
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

const HTML_MESSAGES = [
  { id: 'u-1', role: 'user', content: 'Highest?' },
  {
    role: 'assistant',
    toolCalls: [],
    content: { ui: [{ Markdown: { props: { children: '<b>hi</b>' } } }] },
    ui: [],
  },
] as unknown as UiChatMessage[];

/** A published chat and the drawer, in dev mode; the feed can be removed. */
@Component({
  selector: 'atc-test-published',
  imports: [Feed, DevDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (published()) {
      <atc-test-feed [chat]="chat()" />
    }
    <atc-dev-drawer />
  `,
})
class PublishedHarness {
  readonly published = signal(true);
  readonly chat = signal<DevChat>({
    items: transcriptItems(HTML_MESSAGES),
    turns: [{ text: 'Highest?', router: ROUTER_SKIPPED }],
    busy: false,
  });
}

test('JSON renders as text', () => {
  configure(memoryStorage({ [DEV_MODE_KEY]: 'on' }));
  const { fixture, element, unmount } = mount(PublishedHarness);

  click(fixture, tab(element, 'UI stream'));
  const body = element.querySelector('[role="tabpanel"]');

  expect(text(body)).toContain('<b>hi</b>');
  expect(drawer(element)?.querySelector('b')).toBeNull();
  unmount();
});

test('the drawer is aria-live off', () => {
  configure(memoryStorage({ [DEV_MODE_KEY]: 'on' }));
  const { element, unmount } = mount(ColumnHarness);

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
  unmount();
});

test('the tabs move with the arrow keys, Home and End', () => {
  configure(memoryStorage({ [DEV_MODE_KEY]: 'on' }));
  const { fixture, element, unmount } = mount(ColumnHarness);
  const tabs = () => [...element.querySelectorAll<HTMLElement>('[role="tab"]')];
  const press = (key: string) => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();
    return text(document.activeElement);
  };

  tabs()[0]?.focus();
  const left = press('ArrowLeft');
  const right = press('ArrowRight');
  const end = press('End');
  const home = press('Home');

  expect(left).toBe('Tools');
  expect(right).toBe('Router');
  expect(end).toBe('Tools');
  expect(home).toBe('Router');
  expect(tabs().map((entry) => entry.getAttribute('tabindex'))).toEqual([
    '0',
    '-1',
    '-1',
    '-1',
    '-1',
  ]);
  unmount();
});

test('a publisher that is destroyed clears what it published', () => {
  configure(memoryStorage({ [DEV_MODE_KEY]: 'on' }));
  const { fixture, element, unmount } = mount(PublishedHarness);
  const body = () => {
    fixture.detectChanges();
    return text(element.querySelector('[role="tabpanel"]'));
  };
  click(fixture, tab(element, 'UI stream'));

  const before = body();
  fixture.componentInstance.published.set(false);
  const after = body();

  expect(before).toContain('<b>hi</b>');
  expect(after).not.toContain('<b>hi</b>');
  unmount();
});
