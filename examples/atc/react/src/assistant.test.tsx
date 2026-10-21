import {
  createAtcStore,
  type MapFilter,
  RESPONSE_SCHEMA_ALLOWLIST,
  STARTER_PROMPTS,
} from '@atc/shared';
import {
  fakeCardsTransport,
  fakeDecisionTransport,
  fakeFilterTransport,
} from '@atc/shared/testing';
import { HashbrownProvider } from '@hashbrownai/react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react';
import { expect, test } from 'vitest';
import { Assistant } from './assistant';
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

test('a chat starter sends a chat message', async () => {
  const starter = STARTER_PROMPTS[0];
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
