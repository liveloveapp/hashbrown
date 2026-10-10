import { createApp } from '@atc/server';
import { SELECTED_PROMPT, STARTER_PROMPTS } from '@atc/shared';
import { LLMock } from '@copilotkit/aimock';
import { expect, type Page, test } from '@playwright/test';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { frame, NEAR_BEND, scenario, SYNTHETIC_HEXES, ui } from './fixtures';

const dist = resolve(__dirname, '../../../../dist/examples/atc');
const { selected, highest, fastest, arrivals, nearby } = scenario;
const NEAR_PROMPT = "What's flying near KBDN?";
/** findAircraft arguments with every filter off. */
const ANY = {
  airline: null,
  typeCode: null,
  kind: null,
  minAltitudeFt: null,
  maxAltitudeFt: null,
  approaching: null,
  near: null,
};
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
        airport: 'KSEA',
        hexes: arrivals.map((r) => r.hex),
      },
    },
  });
  const nearBoard = ui({
    ArrivalsBoard: {
      props: {
        title: 'Near Bend',
        airport: NEAR_BEND.airport,
        hexes: nearby.map((r) => r.hex),
      },
    },
  });
  for (const id of ['near-area', 'near-find', 'near-highlight']) {
    mock.onToolResult(id, async () => ({ content: nearBoard }));
  }
  mock.onMessage(NEAR_PROMPT, {
    toolCalls: [
      { id: 'near-area', name: 'showArea', arguments: NEAR_BEND },
      {
        id: 'near-find',
        name: 'findAircraft',
        arguments: { ...ANY, near: NEAR_BEND, sortBy: 'distance', limit: 20 },
      },
      {
        id: 'near-highlight',
        name: 'highlightAircraft',
        arguments: { hexes: nearby.map((r) => r.hex) },
      },
    ],
  });
  // The near-Bend starter: the model lists nearby traffic without calling
  // showArea; findAircraft draws the ring itself.
  for (const id of ['bend-find', 'bend-highlight']) {
    mock.onToolResult(id, async () => ({ content: nearBoard }));
  }
  mock.onMessage(STARTER_PROMPTS[0], {
    toolCalls: [
      {
        id: 'bend-find',
        name: 'findAircraft',
        arguments: { ...ANY, near: NEAR_BEND, sortBy: 'distance', limit: 20 },
      },
      {
        id: 'bend-highlight',
        name: 'highlightAircraft',
        arguments: { hexes: nearby.map((r) => r.hex) },
      },
    ],
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
  mock.onMessage(SELECTED_PROMPT, {
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
          ...ANY,
          approaching: 'KSEA',
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
        arguments: { ...ANY, sortBy: 'altitude', limit: 3 },
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
  await expect(card).toContainText(/Altitude[45],\d{3} ft/);
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

  await page.getByRole('button', { name: SELECTED_PROMPT }).click();
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

test("shows what's flying near KBDN in an outlined area", async ({
  page,
}, testInfo) => {
  await open(page, testInfo.project.name);
  const input = page.getByRole('textbox', { name: 'Message' });

  await input.fill(NEAR_PROMPT);
  await page.getByRole('button', { name: 'Send' }).click();

  const board = page.getByTestId('arrivals-board');
  await expect(page.locator('.atc-area')).toBeAttached();
  await expect(board.getByTestId('arrivals-row')).toHaveCount(nearby.length);
  await expect(board).toContainText('N4417B');
  await expect(board).toContainText('N44RH');
  await expect(board.getByRole('columnheader', { name: 'ETA' })).toHaveCount(0);
  for (const row of nearby) {
    await expect(page.locator(`.atc-plane[data-hex="${row.hex}"]`)).toHaveClass(
      /is-highlighted/,
    );
  }
  await expectOnlyCompleteIds(page);
});

test('on a phone, the starters show in the peek, a pick lowers the sheet to half, and a row shows its plane', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await open(page, testInfo.project.name);
  const sheet = page.locator('#atc-chat-sheet');
  const starter = page.getByRole('button', { name: STARTER_PROMPTS[0] });
  await expect(sheet).toHaveAttribute('data-snap', 'peek');
  await expect(starter).toBeInViewport();

  await starter.tap();

  await expect(sheet).toHaveAttribute('data-snap', 'half');
  await expect(page.locator('.atc-area')).toBeAttached();
  const row = page.getByTestId('arrivals-row').first();
  await expect(row).toBeVisible();
  const hex = await row.getAttribute('data-hex');
  await row.getByRole('button').tap();
  await expect(page.locator(`.atc-plane[data-hex="${hex}"]`)).toHaveClass(
    /is-selected/,
  );
  const card = page.getByTestId('aircraft-detail');
  await expect(card).toHaveClass(/is-docked/);
  await card.getByRole('button', { name: /^Close details/ }).tap();
  await expect(card).toBeHidden();
  await context.close();
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

test('folds tool calls into a summary that expands to every step', async ({
  page,
}, testInfo) => {
  await open(page, testInfo.project.name);

  await page.getByRole('button', { name: STARTER_PROMPTS[2] }).click();

  const summary = page.getByTestId('tool-summary');
  await expect(summary).toHaveText('Searched traffic');
  await summary.click();
  await expect(page.getByTestId('tool-step')).toHaveText([
    'Finding aircraft · sorted by altitude',
  ]);
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
