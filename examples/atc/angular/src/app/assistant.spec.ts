import {
  createAtcStore,
  DEV_MODE_KEY,
  type MapFilter,
  RESPONSE_SCHEMA_ALLOWLIST,
  ROUTER_SKIPPED,
  ROUTER_SKIPPED_REFINEMENT,
  type RouterShown,
  STARTER_PROMPTS,
  transcriptItems,
  type TurnShown,
} from '@atc/shared';
import {
  fakeCardsTransport,
  fakeDecisionTransport,
  fakeFilterTransport,
  testAircraft,
} from '@atc/shared/testing';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHashbrown, type UiChatMessage } from '@hashbrownai/angular';
import { expect, test } from 'vitest';
import { Assistant, CARDS_DECISION_TRANSPORT } from './assistant';
import { DevDrawer } from './dev-drawer';
import { DEV_STORAGE, type DevChat, DevMode, publishDev } from './dev-mode';
import { Transcript } from './transcript';
import { ROUTE_DECISION_TRANSPORT } from './router';
import { ATC_STORE } from './store';

const FILTER: MapFilter = {
  airline: 'Alaska',
  typeCode: null,
  kind: null,
  minAltitudeFt: null,
  maxAltitudeFt: null,
  approaching: null,
  near: null,
  inAirspace: null,
};

function setup(
  answer: Parameters<typeof fakeDecisionTransport>[0],
  cardsAnswer: Parameters<typeof fakeCardsTransport>[0] = () => null,
  filterLoading = false,
) {
  const store = createAtcStore();
  const chat = fakeFilterTransport();
  const route = fakeDecisionTransport(answer);
  const cards = fakeCardsTransport(cardsAnswer);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHashbrown({ baseUrl: '/unused', transport: chat.transport }),
      { provide: ATC_STORE, useValue: store },
      { provide: ROUTE_DECISION_TRANSPORT, useValue: route.transport },
      { provide: CARDS_DECISION_TRANSPORT, useValue: cards.transport },
    ],
  });
  const fixture = TestBed.createComponent(Assistant);
  const filtered: string[] = [];
  const routes: RouterShown[] = [];
  fixture.componentInstance.filter.subscribe((request) =>
    filtered.push(request),
  );
  fixture.componentInstance.filterRouted.subscribe((routed) =>
    routes.push(routed),
  );
  fixture.componentRef.setInput('filterLoading', filterLoading);
  fixture.detectChanges();
  document.body.append(fixture.nativeElement);

  return {
    store,
    chat,
    route,
    cards,
    filtered,
    routes,
    fixture,
    element: fixture.nativeElement as HTMLElement,
  };
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

function starterButton(element: HTMLElement, text: string): HTMLButtonElement {
  return [...element.querySelectorAll('button')].find((button) =>
    button.textContent?.trim().startsWith(text),
  ) as HTMLButtonElement;
}

test('the filter starter applies the filter once, sends no chat request and leaves the transcript empty', async () => {
  const filter = STARTER_PROMPTS.find((starter) => starter.route === 'filter');
  const { chat, route, filtered, fixture, element } = setup(() => null);

  starterButton(element, filter?.text ?? '').click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  fixture.detectChanges();

  expect(filtered).toEqual([filter?.text]);
  expect(chat.requests).toHaveLength(0);
  expect(route.requests).toHaveLength(0);
  expect(element.querySelector('ol')?.children.length ?? 0).toBe(0);
  fixture.destroy();
});

function refinementTexts(element: HTMLElement) {
  return [
    ...element.querySelectorAll('[data-testid="refinements"] button'),
  ].map((button) => button.textContent?.trim());
}

/** Two Alaska flights: one low jet, one higher single-engine prop. */
const ALASKA = [
  testAircraft({ hex: 'a00001', callsign: 'ASA1', altitudeFt: 3000 }),
  testAircraft({
    hex: 'a00002',
    callsign: 'ASA2',
    altitudeFt: 9000,
    kind: 'single',
  }),
];

test('a refinement appears once a filter is applied and refines it without a transcript entry', async () => {
  const { store, chat, route, filtered, routes, fixture, element } = setup(
    () => null,
  );
  store.applySnapshot({ at: 1, aircraft: ALASKA });
  fixture.detectChanges();
  const before = element.querySelector('[data-testid="refinements"]');

  store.setMapFilter(FILTER);
  fixture.detectChanges();
  const texts = refinementTexts(element);
  const row = element.querySelector('[data-testid="refinements"]');
  const label = element.querySelector('.atc-refinements-label');
  (
    element.querySelector('[data-testid="refinements"] button') as HTMLElement
  ).click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  fixture.detectChanges();

  expect(before).toBeNull();
  expect(texts).toEqual(['Below 5,000 ft', 'Only jets']);
  expect(row?.getAttribute('role')).toBe('group');
  expect(label?.textContent?.trim()).toBe('Refine:');
  expect(row?.getAttribute('aria-labelledby')).toBe(label?.id);
  expect(label?.id).not.toBe('');
  expect(filtered).toEqual(['Below 5,000 ft']);
  expect(routes).toEqual([ROUTER_SKIPPED_REFINEMENT]);
  expect(chat.requests).toHaveLength(0);
  expect(route.requests).toHaveLength(0);
  expect(element.querySelector('ol')?.children.length ?? 0).toBe(0);
  fixture.destroy();
});

test('refinements disappear when the filter is cleared', () => {
  const { store, fixture, element } = setup(() => null);
  store.applySnapshot({ at: 1, aircraft: ALASKA });
  store.setMapFilter(FILTER);
  fixture.detectChanges();
  const shown = refinementTexts(element).length;

  store.clearMapFilter();
  fixture.detectChanges();

  expect(shown).toBeGreaterThan(0);
  expect(element.querySelector('[data-testid="refinements"]')).toBeNull();
  fixture.destroy();
});

test('no refinements show while a filter run streams', () => {
  const { store, fixture, element } = setup(() => null, undefined, true);
  store.applySnapshot({ at: 1, aircraft: ALASKA });
  store.setMapFilter(FILTER);
  fixture.detectChanges();
  const streaming = element.querySelector('[data-testid="refinements"]');

  fixture.componentRef.setInput('filterLoading', false);
  fixture.detectChanges();

  expect(streaming).toBeNull();
  expect(refinementTexts(element)).toEqual(['Below 5,000 ft', 'Only jets']);
  fixture.destroy();
});

test('refinements stay put while traffic changes under the same filter', () => {
  const { store, fixture, element } = setup(() => null);
  store.applySnapshot({ at: 1, aircraft: ALASKA });
  store.setMapFilter(FILTER);
  fixture.detectChanges();
  const before = refinementTexts(element);

  store.applySnapshot({
    at: 2,
    aircraft: ALASKA.map((a) => ({ ...a, altitudeFt: 2000 })),
  });
  fixture.detectChanges();

  expect(before).toEqual(['Below 5,000 ft', 'Only jets']);
  expect(refinementTexts(element)).toEqual(before);
  fixture.destroy();
});

test('a refinement picked from the keyboard moves focus to the message field', () => {
  const { store, fixture, element } = setup(() => null);
  store.applySnapshot({ at: 1, aircraft: ALASKA });
  store.setMapFilter(FILTER);
  fixture.detectChanges();
  const button = element.querySelector(
    '[data-testid="refinements"] button',
  ) as HTMLButtonElement;
  button.focus();

  button.click();

  expect(document.activeElement).toBe(element.querySelector('input'));
  fixture.destroy();
});

test('a chat starter sends a chat message', async () => {
  const starter = STARTER_PROMPTS[4];
  const { chat, filtered, fixture, element } = setup(() => null);

  starterButton(element, starter.text).click();
  await until(() => chat.requests.length === 1);

  expect(filtered).toEqual([]);
  expect(JSON.stringify(chat.requests[0].input.messages)).toContain(
    starter.text,
  );
  fixture.destroy();
});

test('a clear-routed Enter empties the map filter with no filter request', async () => {
  const { store, chat, filtered, fixture, element } = setup(() => ({
    intent: 'filter',
    confidence: 0.95,
    clear: 0.9,
  }));
  store.setMapFilter(FILTER);
  const input = element.querySelector('input') as HTMLInputElement;

  input.value = 'show everything again';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await until(
    () =>
      element.querySelector('.atc-route')?.textContent?.trim() ===
      '→ filter 0.95',
  );
  element
    .querySelector('form')
    ?.dispatchEvent(new Event('submit', { cancelable: true }));
  await until(() => store.getState().mapFilter === null);

  expect(filtered).toEqual([]);
  expect(chat.requests).toHaveLength(0);
  fixture.destroy();
});

/** Whether the response schema a chat request carried is an allowlisted one. */
function isAllowlisted(request: { input: unknown }): boolean {
  const schema = (
    request.input as {
      forwardedProps?: { hashbrown?: { responseSchema?: unknown } };
    }
  ).forwardedProps?.hashbrown?.responseSchema;

  return RESPONSE_SCHEMA_ALLOWLIST.some(
    (entry) => JSON.stringify(entry) === JSON.stringify(schema),
  );
}

/** The card names in the response schema a chat request carried. */
function offeredComponents(request: { input: unknown }): string[] {
  const json = JSON.stringify(request.input);

  return [
    'Markdown',
    'FlightCard',
    'ArrivalsBoard',
    'AircraftCompare',
    'AirportCard',
  ].filter((name) => json.includes(`"${name}":{"type":"object"`));
}

test('a chat-routed message decides the cards, then sends the narrowed chat with Markdown', async () => {
  const starter = STARTER_PROMPTS.find((entry) => entry.route !== 'filter');
  const { chat, cards, fixture, element } = setup(
    () => null,
    () => ({ FlightCard: 0.9, AirportCard: 0.8 }),
  );

  starterButton(element, starter?.text ?? '').click();
  await until(() => chat.requests.length === 1);

  expect(cards.requests).toEqual([starter?.text]);
  expect(isAllowlisted(chat.requests[0])).toBe(true);
  expect(offeredComponents(chat.requests[0])).toEqual([
    'Markdown',
    'FlightCard',
    'AirportCard',
  ]);
  fixture.destroy();
});

test('a cards decision failure sends with every card', async () => {
  const starter = STARTER_PROMPTS.find((entry) => entry.route !== 'filter');
  const { chat, cards, fixture, element } = setup(
    () => null,
    () => null,
  );

  starterButton(element, starter?.text ?? '').click();
  await until(() => chat.requests.length === 1);

  expect(cards.requests).toEqual([starter?.text]);
  expect(isAllowlisted(chat.requests[0])).toBe(true);
  expect(offeredComponents(chat.requests[0])).toEqual([
    'Markdown',
    'FlightCard',
    'ArrivalsBoard',
    'AircraftCompare',
    'AirportCard',
  ]);
  fixture.destroy();
});

test('without dev mode an answer is not selectable', async () => {
  const starter = STARTER_PROMPTS.find((entry) => entry.route !== 'filter');
  const { chat, fixture, element } = setup(() => null);

  starterButton(element, starter?.text ?? '').click();
  await until(() => chat.requests.length === 1);

  expect(element.querySelectorAll('.atc-dev-inspect')).toHaveLength(0);
  expect(element.querySelectorAll('[class*="atc-stream"]')).toHaveLength(0);
  fixture.destroy();
});

/** Publishes a transcript to the drawer, as the assistant does. */
@Component({
  selector: 'atc-test-published',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class Published {
  readonly chat = input.required<DevChat>();

  constructor() {
    publishDev('chat', this.chat);
  }
}

function answer(text: string) {
  return {
    role: 'assistant',
    toolCalls: [],
    content: { ui: [{ Markdown: { data: text } }] },
    ui: [],
  };
}

/** A transcript whose first send was superseded, with the drawer, in dev mode. */
@Component({
  selector: 'atc-test-superseded',
  imports: [Published, Transcript, DevDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    DevMode,
    {
      provide: DEV_STORAGE,
      useFactory: () => {
        const data = new Map([[DEV_MODE_KEY, 'on']]);

        return {
          getItem: (key: string) => data.get(key) ?? null,
          setItem: (key: string, value: string) => void data.set(key, value),
        };
      },
    },
  ],
  template: `
    <atc-test-published [chat]="chat" />
    <atc-transcript [items]="chat.items" [turns]="chat.turns" />
    <atc-dev-drawer />
  `,
})
class Superseded {
  protected readonly chat = {
    items: transcriptItems([
      { id: 'u-jets', role: 'user', content: 'jets' },
      answer('first'),
      { id: 'u-Seattle?', role: 'user', content: 'Seattle?' },
      answer('second'),
    ] as unknown as UiChatMessage[]),
    turns: [
      { text: 'jets', router: { kind: 'fallback', reason: 'superseded' } },
      { text: 'jets', router: ROUTER_SKIPPED },
      { text: 'Seattle?', router: { kind: 'fallback', reason: 'unavailable' } },
    ] as TurnShown[],
    busy: false,
  };
}

test('a superseded send does not shift later answers onto the wrong decisions', () => {
  setup(() => null);
  const fixture = TestBed.createComponent(Superseded);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const answers = element.querySelectorAll<HTMLElement>('.atc-answer');
  const inspect = () =>
    element.querySelectorAll<HTMLButtonElement>('.atc-dev-inspect');
  const router = () => {
    fixture.detectChanges();
    return element.querySelector('[role="tabpanel"]')?.textContent ?? '';
  };

  answers[0]?.click();
  const unchanged = router();
  inspect()[0]?.click();
  const first = router();
  inspect()[1]?.click();
  const second = router();

  expect(unchanged).toContain('→ chat (unavailable)');
  expect(first).toContain('skipped (starter)');
  expect(first).not.toContain('superseded');
  expect(inspect()[0]?.getAttribute('aria-pressed')).toBe('false');
  expect(second).toContain('→ chat (unavailable)');
  expect(inspect()[1]?.getAttribute('aria-pressed')).toBe('true');
  fixture.destroy();
});

@Component({
  selector: 'atc-test-assistant-drawer',
  imports: [Assistant, DevDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <atc-assistant />
    <atc-dev-drawer />
  `,
})
class AssistantWithDrawer {}

/** The assistant and the drawer, with stubbed decisions. */
function setupWithDrawer(answer: Parameters<typeof fakeDecisionTransport>[0]) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHashbrown({
        baseUrl: '/unused',
        transport: fakeFilterTransport().transport,
      }),
      { provide: ATC_STORE, useValue: createAtcStore() },
      {
        provide: ROUTE_DECISION_TRANSPORT,
        useValue: fakeDecisionTransport(answer).transport,
      },
      {
        provide: CARDS_DECISION_TRANSPORT,
        useValue: fakeCardsTransport(() => null).transport,
      },
    ],
  });
  const fixture = TestBed.createComponent(AssistantWithDrawer);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const router = () => {
    fixture.detectChanges();
    return element.querySelector('[role="tabpanel"]')?.textContent ?? '';
  };

  return { fixture, element, router };
}

test('the router tab keeps what a filter send decided after the box clears', async () => {
  const { fixture, element, router } = setupWithDrawer(() => ({
    intent: 'filter',
    confidence: 0.97,
  }));
  const input = element.querySelector('input') as HTMLInputElement;
  const empty = router();

  input.value = 'only jets below 8000 ft';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await until(
    () =>
      element.querySelector('.atc-route')?.textContent?.trim() ===
      '→ filter 0.97',
  );
  element
    .querySelector('form')
    ?.dispatchEvent(new Event('submit', { cancelable: true }));
  await until(() => input.value === '');
  const sent = router();

  expect(empty).toContain('type to see where it goes');
  expect(sent).toContain('sent: "only jets below 8000 ft" → filter');
  expect(sent).toContain('intent: filter 0.97');
  expect(sent).toContain('type to see where it goes');
  fixture.destroy();
});

test('the router tab shows a filter starter as skipped', () => {
  const starter = STARTER_PROMPTS.find((entry) => entry.route === 'filter');
  const { fixture, element, router } = setupWithDrawer(() => null);

  starterButton(element, starter?.text ?? '').click();
  const shown = router();

  expect(shown).toContain(`sent: "${starter?.text}" → filter`);
  expect(shown).toContain('skipped (starter)');
  fixture.destroy();
});
