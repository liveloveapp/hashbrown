import {
  createAtcStore,
  DEV_MODE_KEY,
  type MapFilter,
  RESPONSE_SCHEMA_ALLOWLIST,
  ROUTER_SKIPPED,
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
import type { Chat } from '@hashbrownai/core';
import { HashbrownProvider, type UiChatMessage } from '@hashbrownai/react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react';
import { useMemo } from 'react';
import { expect, test } from 'vitest';
import { Assistant } from './assistant';
import { PanelHeader } from './panel-header';
import { Transcript } from './transcript';
import { DevDrawer } from './dev-drawer';
import { type DevChat, DevModeProvider, usePublishDev } from './dev-mode';
import { AtcStoreProvider } from './store';

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
) {
  cleanup();
  const store = createAtcStore();
  const chat = fakeFilterTransport();
  const route = fakeDecisionTransport(answer);
  const cards = fakeCardsTransport(cardsAnswer);
  const filtered: string[] = [];
  const view = render(
    <HashbrownProvider url="/unused" transport={chat.transport}>
      <AtcStoreProvider store={store}>
        <Assistant
          routeTransport={route.transport}
          cardsTransport={cards.transport}
          onFilter={(request) => filtered.push(request)}
        />
      </AtcStoreProvider>
    </HashbrownProvider>,
  );

  return { store, chat, route, cards, filtered, element: view.container };
}

function starterButton(element: HTMLElement, text: string) {
  return [...element.querySelectorAll('button')].find((button) =>
    button.textContent?.startsWith(text),
  ) as HTMLButtonElement;
}

test('the filter starter applies the filter once, sends no chat request and leaves the transcript empty', async () => {
  const filter = STARTER_PROMPTS.find((starter) => starter.route === 'filter');
  const { chat, route, filtered, element } = setup(() => null);

  act(() => starterButton(element, filter?.text ?? '').click());
  await new Promise((resolve) => setTimeout(resolve, 50));

  expect(filtered).toEqual([filter?.text]);
  expect(chat.requests).toHaveLength(0);
  expect(route.requests).toHaveLength(0);
  expect(element.querySelectorAll('.atc-message, [data-role]')).toHaveLength(0);
  expect(element.querySelector('ol')?.children.length ?? 0).toBe(0);
});

function refinementTexts(element: HTMLElement) {
  return [
    ...element.querySelectorAll('[data-testid="refinements"] button'),
  ].map((button) => button.textContent);
}

test('a refinement appears once a filter is applied and refines it without a transcript entry', async () => {
  const { store, chat, route, filtered, element } = setup(() => null);
  act(() => {
    store.applySnapshot({
      at: 1,
      aircraft: [testAircraft({ callsign: 'ASA1' })],
    });
  });
  const before = element.querySelector('[data-testid="refinements"]');

  act(() => store.setMapFilter(FILTER));
  const texts = refinementTexts(element);
  act(() =>
    (
      element.querySelector(
        '[data-testid="refinements"] button',
      ) as HTMLButtonElement
    ).click(),
  );
  await new Promise((resolve) => setTimeout(resolve, 50));

  expect(before).toBeNull();
  expect(texts).toEqual(['Below 5,000 ft', 'Only jets']);
  expect(filtered).toEqual(['Below 5,000 ft']);
  expect(chat.requests).toHaveLength(0);
  expect(route.requests).toHaveLength(0);
  expect(element.querySelector('ol')?.children.length ?? 0).toBe(0);
});

test('refinements disappear when the filter is cleared', () => {
  const { store, element } = setup(() => null);
  act(() => {
    store.applySnapshot({
      at: 1,
      aircraft: [testAircraft({ callsign: 'ASA1' })],
    });
    store.setMapFilter(FILTER);
  });
  const shown = refinementTexts(element).length;

  act(() => store.clearMapFilter());

  expect(shown).toBeGreaterThan(0);
  expect(element.querySelector('[data-testid="refinements"]')).toBeNull();
});

test('a chat starter sends a chat message', async () => {
  const starter = STARTER_PROMPTS[4];
  const { chat, filtered, element } = setup(() => null);

  act(() => starterButton(element, starter.text).click());
  await waitFor(() => expect(chat.requests).toHaveLength(1));

  expect(filtered).toEqual([]);
  expect(JSON.stringify(chat.requests[0].input.messages)).toContain(
    starter.text,
  );
});

test('a clear-routed Enter empties the map filter with no filter request', async () => {
  const { store, chat, filtered, element } = setup(() => ({
    intent: 'filter',
    confidence: 0.95,
    clear: 0.9,
  }));
  act(() => store.setMapFilter(FILTER));
  const input = element.querySelector('input') as HTMLInputElement;

  fireEvent.change(input, { target: { value: 'show everything again' } });
  await waitFor(() =>
    expect(element.querySelector('.atc-route')?.textContent).toBe(
      '→ filter 0.95',
    ),
  );
  fireEvent.submit(element.querySelector('form') as HTMLFormElement);
  await waitFor(() => expect(store.getState().mapFilter).toBeNull());

  expect(filtered).toEqual([]);
  expect(chat.requests).toHaveLength(0);
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
  const { chat, cards, element } = setup(
    () => null,
    () => ({ FlightCard: 0.9, AirportCard: 0.8 }),
  );

  act(() => starterButton(element, starter?.text ?? '').click());
  await waitFor(() => expect(chat.requests).toHaveLength(1));

  expect(cards.requests).toEqual([starter?.text]);
  expect(isAllowlisted(chat.requests[0])).toBe(true);
  expect(offeredComponents(chat.requests[0])).toEqual([
    'Markdown',
    'FlightCard',
    'AirportCard',
  ]);
});

test('a cards decision failure sends with every card', async () => {
  const starter = STARTER_PROMPTS.find((entry) => entry.route !== 'filter');
  const { chat, cards, element } = setup(
    () => null,
    () => null,
  );

  act(() => starterButton(element, starter?.text ?? '').click());
  await waitFor(() => expect(chat.requests).toHaveLength(1));

  expect(cards.requests).toEqual([starter?.text]);
  expect(isAllowlisted(chat.requests[0])).toBe(true);
  expect(offeredComponents(chat.requests[0])).toEqual([
    'Markdown',
    'FlightCard',
    'ArrivalsBoard',
    'AircraftCompare',
    'AirportCard',
  ]);
});

test('the header button toggles dev mode on phones', () => {
  cleanup();
  const toggled: string[] = [];
  const view = render(
    <AtcStoreProvider store={createAtcStore()}>
      <PanelHeader devMode onToggleDevMode={() => toggled.push('toggle')} />
    </AtcStoreProvider>,
  );
  const button = view.container.querySelector(
    '.atc-header-dev',
  ) as HTMLButtonElement;

  fireEvent.click(button);

  expect(button.getAttribute('aria-label')).toBe('Developer tools');
  expect(button.getAttribute('aria-pressed')).toBe('true');
  expect(toggled).toEqual(['toggle']);
  expect(view.container.textContent).not.toContain('Show the stream');
  expect(view.container.querySelector('[role="switch"]')).toBeNull();
});

test('without dev mode an answer is not selectable', async () => {
  const starter = STARTER_PROMPTS.find((entry) => entry.route !== 'filter');
  const { chat, element } = setup(() => null);

  act(() => starterButton(element, starter?.text ?? '').click());
  await waitFor(() => expect(chat.requests).toHaveLength(1));

  expect(element.querySelectorAll('.atc-dev-inspect')).toHaveLength(0);
  expect(element.querySelectorAll('[class*="atc-stream"]')).toHaveLength(0);
});

test('a superseded send does not shift later answers onto the wrong decisions', () => {
  cleanup();
  const answer = (text: string) => ({
    role: 'assistant',
    toolCalls: [],
    content: { ui: [{ Markdown: { data: text } }] },
    ui: [<p key={text}>{text}</p>],
  });
  const messages = [
    { id: 'u-jets', role: 'user', content: 'jets' },
    answer('first'),
    { id: 'u-Seattle?', role: 'user', content: 'Seattle?' },
    answer('second'),
  ] as UiChatMessage<Chat.AnyTool>[];
  const turns: TurnShown[] = [
    { text: 'jets', router: { kind: 'fallback', reason: 'superseded' } },
    { text: 'jets', router: ROUTER_SKIPPED },
    { text: 'Seattle?', router: { kind: 'fallback', reason: 'unavailable' } },
  ];
  const items = transcriptItems(messages);
  const view = render(
    <AtcStoreProvider store={createAtcStore()}>
      <DevModeProvider storage={onStorage()}>
        <Published items={items} turns={turns} />
        <Transcript items={items} turns={turns} />
        <DevDrawer />
      </DevModeProvider>
    </AtcStoreProvider>,
  );
  const answers = view.container.querySelectorAll('.atc-answer');
  const inspect =
    view.container.querySelectorAll<HTMLButtonElement>('.atc-dev-inspect');
  const router = () =>
    view.container.querySelector('[role="tabpanel"]')?.textContent ?? '';

  fireEvent.click(answers[0] as HTMLElement);
  const unchanged = router();
  fireEvent.click(inspect[0] as HTMLElement);
  const first = router();
  fireEvent.click(inspect[1] as HTMLElement);
  const second = router();

  expect(unchanged).toContain('→ chat (unavailable)');
  expect(first).toContain('skipped (starter)');
  expect(first).not.toContain('superseded');
  expect(inspect[0]?.getAttribute('aria-pressed')).toBe('false');
  expect(second).toContain('→ chat (unavailable)');
  expect(inspect[1]?.getAttribute('aria-pressed')).toBe('true');
});

/** A storage with dev mode on. */
function onStorage() {
  const data = new Map([[DEV_MODE_KEY, 'on']]);

  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

/** Publishes a transcript to the drawer, as the assistant does. */
function Published({ items, turns }: Omit<DevChat, 'busy'>) {
  const chat = useMemo(() => ({ items, turns, busy: false }), [items, turns]);
  usePublishDev('chat', chat);

  return null;
}
