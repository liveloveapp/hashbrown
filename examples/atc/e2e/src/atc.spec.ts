import { createApp } from '@atc/server';
import { STARTER_PROMPTS } from '@atc/shared';
import { LLMock } from '@copilotkit/aimock';
import { expect, type Page, test } from '@playwright/test';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { frame, scenario, SYNTHETIC_HEXES, ui } from './fixtures';

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
        title: 'Arriving at Seattle',
        airport: 'SEA',
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
          approaching: 'SEA',
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
  let next = 0;
  await page.route('**/api/aircraft**', (route) =>
    route.fulfill({ json: frame(next++) }),
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
  await page.goto(`${origin}/${framework}/`);
  await expect(page.getByRole('status')).toContainText('Live');
}

async function expectOnlyCompleteIds(page: Page): Promise<void> {
  const hexes = await page.evaluate(
    () => (window as unknown as { __atcCardHexes: string[] }).__atcCardHexes,
  );
  expect(hexes.length).toBeGreaterThan(0);
  for (const hex of hexes) {
    expect(
      SYNTHETIC_HEXES.has(hex),
      `card rendered with incomplete or unknown ID "${hex}"`,
    ).toBe(true);
  }
}

test('tags private and unidentified traffic by label', async ({
  page,
}, testInfo) => {
  await open(page, testInfo.project.name);

  const tags = [
    ['a1c009', 'N352LL'],
    ['a1c00a', 'N911LF'],
    ['a1c00b', 'A1C00B'],
  ].map(([hex, label]) => ({
    tag: page.locator(`.atc-plane[data-hex="${hex}"] .atc-plane-tag`),
    label,
  }));

  for (const { tag, label } of tags) {
    await expect(tag).toContainText(label);
  }
});

test('hovering a plane shows its detail card', async ({ page }, testInfo) => {
  await open(page, testInfo.project.name);
  const card = page.getByTestId('aircraft-detail');
  await expect(card).toBeHidden();

  await page
    .locator('.atc-plane[data-hex="a1c009"]')
    .dispatchEvent('mouseover');

  await expect(card).toBeVisible();
  await expect(card).toContainText('RegistrationN352LL');
  await expect(card).toContainText(/Pressure altitude[45],\d{3} ft/);
  await expect(card).toContainText('Squawk1200');
  await expect(card).toContainText('QNH1016.4 hPa');
  await expect(card).toContainText('Altimeter30.01 inHg');

  await page.locator('.atc-plane[data-hex="a1c009"]').dispatchEvent('mouseout');

  await expect(card).toBeHidden();
});

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

test('shows Seattle arrivals and highlights them on the map', async ({
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
  await expect(compare).toContainText(highest.label);
  await expect(compare).toContainText(fastest.label);
  await expectOnlyCompleteIds(page);
});

test('has no framework switcher', async ({ page }, testInfo) => {
  await open(page, testInfo.project.name);

  const links = page.locator(
    'a[href^="/angular"], a[href^="/react"], a[href*="atc.hashbrown.dev"]',
  );
  const named = page.getByRole('link', { name: /^(angular|react)$/i });

  await expect(links).toHaveCount(0);
  await expect(named).toHaveCount(0);
});

test('pressing / focuses the composer', async ({ page }, testInfo) => {
  await open(page, testInfo.project.name);
  const input = page.getByRole('textbox', { name: 'Message' });
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await expect(input).not.toBeFocused();

  await page.keyboard.press('/');

  await expect(input).toBeFocused();
  await expect(input).toHaveValue('');
});

test('shows a tool chip when the assistant calls a tool', async ({
  page,
}, testInfo) => {
  await open(page, testInfo.project.name);

  await page.getByRole('button', { name: STARTER_PROMPTS[2] }).click();

  const chip = page.getByTestId('tool-chip').first();
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('findAircraft');
});

test('follows an aircraft on the map', async ({ page }, testInfo) => {
  await open(page, testInfo.project.name);

  await page.getByRole('button', { name: STARTER_PROMPTS[3] }).click();

  await expect(
    page.locator(`[data-testid="flight-card"][data-hex="${fastest.hex}"]`),
  ).toBeVisible();
  const plane = page.locator(`.atc-plane[data-hex="${fastest.hex}"]`);
  await expect(plane).toHaveClass(/is-followed/);
  await expectOnlyCompleteIds(page);

  const offCentre = async () => {
    const map = await page.getByTestId('airspace-map').boundingBox();
    const box = await plane.boundingBox();
    if (!map || !box) return Infinity;
    return Math.hypot(
      box.x + box.width / 2 - (map.x + map.width / 2),
      box.y + box.height / 2 - (map.y + map.height / 2),
    );
  };
  const startedAt = await page.evaluate(() => performance.now());
  await expect.poll(offCentre).toBeLessThan(3);
  await expect
    .poll(
      async () => {
        const elapsed = await page.evaluate(
          (t) => performance.now() - t,
          startedAt,
        );
        return elapsed > 7000 ? offCentre() : Infinity;
      },
      { timeout: 15_000 },
    )
    .toBeLessThan(3);
});

test('recovers from a failed send with Retry', async ({ page }, testInfo) => {
  let failed = false;
  await page.route('**/api/run', (route) => {
    if (failed) return route.continue();
    failed = true;
    return route.fulfill({ status: 500, body: 'boom' });
  });
  await open(page, testInfo.project.name);

  await page.getByRole('button', { name: STARTER_PROMPTS[2] }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  await alert.getByRole('button', { name: 'Retry' }).click();

  await expect(page.getByTestId('aircraft-compare')).toContainText(
    highest.label,
  );
  await expect(alert).toHaveCount(0);
});
