import { createAtcStore, type MapFilter, STARTER_PROMPTS } from '@atc/shared';
import {
  fakeDecisionTransport,
  fakeFilterTransport,
} from '@atc/shared/testing';
import { TestBed } from '@angular/core/testing';
import { provideHashbrown } from '@hashbrownai/angular';
import { expect, test } from 'vitest';
import { Assistant } from './assistant';
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

function setup(answer: Parameters<typeof fakeDecisionTransport>[0]) {
  const store = createAtcStore();
  const chat = fakeFilterTransport();
  const route = fakeDecisionTransport(answer);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHashbrown({ baseUrl: '/unused', transport: chat.transport }),
      { provide: ATC_STORE, useValue: store },
      { provide: ROUTE_DECISION_TRANSPORT, useValue: route.transport },
    ],
  });
  const fixture = TestBed.createComponent(Assistant);
  const filtered: string[] = [];
  fixture.componentInstance.filter.subscribe((request) =>
    filtered.push(request),
  );
  fixture.detectChanges();
  document.body.append(fixture.nativeElement);

  return {
    store,
    chat,
    route,
    filtered,
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

test('a chat starter sends a chat message', async () => {
  const starter = STARTER_PROMPTS[0];
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
