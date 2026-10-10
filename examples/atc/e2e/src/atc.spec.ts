import { createApp } from '@atc/server';
import { STARTER_PROMPTS } from '@atc/shared';
import { LLMock } from '@copilotkit/aimock';
import { expect, type Page, test } from '@playwright/test';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { RECORDED_HEXES, scenario, ui } from './fixtures';

const dist = resolve(__dirname, '../../../../dist/examples/atc');
const { selected, highest, fastest, arrivals } = scenario;
let mock: LLMock;
let server: Server;
let origin: string;

test.beforeAll(async () => {
  mock = new LLMock({ port: 0, chunkSize: 8 });
  const card = (note: string, hex: string) => ({
    FlightCard: { props: { note, hex } },
  });
  const board = ui({
    ArrivalsBoard: {
      props: {
        title: "Arriving at O'Hare",
        airport: 'ORD',
        hexes: arrivals.map((r) => r.hex),
      },
    },
  });
  mock.onToolResult('selected-1', async () => ({
    content: ui(card('This is the plane you selected.', selected.hex)),
  }));
  mock.onToolResult('arrivals-find', async () => ({ content: board }));
  mock.onToolResult('arrivals-highlight', async () => ({ content: board }));
  mock.onToolResult('compare-find', async () => ({
    content: ui({
      AircraftCompare: {
        props: {
          takeaway: 'One climbs highest, one flies fastest.',
          hexes: [highest.hex, fastest.hex],
        },
      },
    }),
  }));
  mock.onToolResult('follow-1', async () => ({
    content: ui(card('Following this flight.', fastest.hex)),
  }));
  mock.onMessage(STARTER_PROMPTS[0], {
    toolCalls: [
      { id: 'selected-1', name: 'getSelectedAircraft', arguments: {} },
    ],
  });
  mock.onMessage(STARTER_PROMPTS[1], {
    toolCalls: [
      {
        id: 'arrivals-find',
        name: 'findAircraft',
        arguments: {
          airline: null,
          typeCode: null,
          minAltitudeFt: null,
          maxAltitudeFt: null,
          approaching: 'ORD',
          sortBy: 'distance',
          limit: 10,
        },
      },
      {
        id: 'arrivals-highlight',
        name: 'highlightAircraft',
        arguments: { hexes: arrivals.map((r) => r.hex) },
      },
    ],
  });
  mock.onMessage(STARTER_PROMPTS[2], {
    toolCalls: [
      {
        id: 'compare-find',
        name: 'findAircraft',
        arguments: {
          airline: null,
          typeCode: null,
          minAltitudeFt: null,
          maxAltitudeFt: null,
          approaching: null,
          sortBy: 'altitude',
          limit: 3,
        },
      },
    ],
  });
  mock.onMessage(STARTER_PROMPTS[3], {
    toolCalls: [
      {
        id: 'follow-1',
        name: 'followAircraft',
        arguments: { hex: fastest.hex },
      },
    ],
  });
  await mock.start();
  server = createApp({
    run: {
      apiKey: 'fixture-only',
      baseURL: `${mock.url}/v1`,
      model: 'gpt-5-mini',
    },
    statics: [
      { path: '/angular', dir: resolve(dist, 'angular/browser') },
      { path: '/react', dir: resolve(dist, 'react') },
    ],
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  server?.closeAllConnections();
  await new Promise((resolve) =>
    server ? server.close(resolve) : resolve(undefined),
  );
  await mock?.stop();
});

async function open(page: Page, framework: string): Promise<void> {
  await page.route('https://tiles.stadiamaps.com/**', (route) => route.abort());
  await page.route('https://vrs-standing-data.adsb.lol/**', (route) =>
    route.fulfill({ status: 404, body: '' }),
  );
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __atcCardHexes: string[] }).__atcCardHexes = seen;
    new MutationObserver(() => {
      for (const card of document.querySelectorAll(
        '[data-testid="flight-card"],[data-testid="arrivals-row"],[data-testid="aircraft-compare"] [data-hex]',
      )) {
        seen.push(card.getAttribute('data-hex') ?? '');
      }
    }).observe(document, { subtree: true, childList: true, attributes: true });
  });
  await page.goto(`${origin}/${framework}/?replay=1&tick=1000`);
  await expect(page.getByRole('status')).toContainText('Replay');
}

async function expectOnlyCompleteIds(page: Page): Promise<void> {
  const hexes = await page.evaluate(
    () => (window as unknown as { __atcCardHexes: string[] }).__atcCardHexes,
  );
  expect(hexes.length).toBeGreaterThan(0);
  for (const hex of hexes) {
    expect(
      RECORDED_HEXES.has(hex),
      `card rendered with incomplete or unknown ID "${hex}"`,
    ).toBe(true);
  }
}

test('renders the selected aircraft as a live card', async ({
  page,
}, testInfo) => {
  await open(page, testInfo.project.name);
  await page
    .locator(`.atc-plane[data-hex="${selected.hex}"]`)
    .dispatchEvent('click');

  await page.getByRole('button', { name: STARTER_PROMPTS[0] }).click();
  const card = page.locator(
    `[data-testid="flight-card"][data-hex="${selected.hex}"]`,
  );
  await expect(card).toHaveAttribute('data-status', 'live');
  const first = await card.getByTestId('flight-altitude').textContent();

  await expect
    .poll(() => card.getByTestId('flight-altitude').textContent(), {
      timeout: 30_000,
    })
    .not.toBe(first);
  await expectOnlyCompleteIds(page);
});

test("shows O'Hare arrivals and highlights them on the map", async ({
  page,
}, testInfo) => {
  await open(page, testInfo.project.name);

  await page.getByRole('button', { name: STARTER_PROMPTS[1] }).click();

  await expect(page.getByTestId('arrivals-row')).toHaveCount(arrivals.length);
  await expect(page.locator('.atc-plane.is-dimmed').first()).toBeAttached();
  for (const row of arrivals) {
    await expect(
      page.locator(`.atc-plane[data-hex="${row.hex}"]`),
    ).not.toHaveClass(/is-dimmed/);
  }
  await expectOnlyCompleteIds(page);
});

test('compares the highest and the fastest aircraft', async ({
  page,
}, testInfo) => {
  await open(page, testInfo.project.name);

  await page.getByRole('button', { name: STARTER_PROMPTS[2] }).click();

  const compare = page.getByTestId('aircraft-compare');
  await expect(compare).toContainText(highest.callsign);
  await expect(compare).toContainText(fastest.callsign);
  await expectOnlyCompleteIds(page);
});

test('follows an aircraft on the map', async ({ page }, testInfo) => {
  await open(page, testInfo.project.name);

  await page.getByRole('button', { name: STARTER_PROMPTS[3] }).click();

  await expect(
    page.locator(`[data-testid="flight-card"][data-hex="${fastest.hex}"]`),
  ).toBeVisible();
  await expect(
    page.locator(`.atc-plane[data-hex="${fastest.hex}"]`),
  ).toHaveClass(/is-followed/);
  await expectOnlyCompleteIds(page);
});
