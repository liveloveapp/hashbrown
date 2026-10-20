/*
 * End-to-end tests for both apps, with no model key and no network. One real
 * atc server serves the built apps and `/api/run`; `/api/run` talks to aimock
 * instead of OpenAI, and aimock answers each question with the tool calls and
 * UI scripted in `model.ts`. The browser's data routes are stubbed with the
 * synthetic traffic and chart fixtures (`stubs.ts`). Each Playwright project
 * (`angular`, `react`) opens the app at its own path.
 */
import { createApp } from '@atc/server';
import { LLMock } from '@copilotkit/aimock';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { PROMPTS, REASONING, scriptAtcModel } from './model';
import { stubAtcFeeds } from './stubs';
import {
  CLUSTER,
  frame,
  NAMED,
  scenario,
  SYNTHETIC_HEXES,
} from './traffic-fixtures';

const dist = resolve(__dirname, '../../../../dist/examples/atc');
const { selected, highest, fastest, arrivals, nearby, portland } = scenario;
/** The phone most tests use. */
const PHONE = { width: 390, height: 844 } as const;
let mock: LLMock;
let server: Server;
let origin: string;

// One server and one model mock for the whole file, for speed: every test
// opens a fresh page, and the mock answers by the user's message.
test.beforeAll(async () => {
  mock = new LLMock({ port: 0, chunkSize: 8 });
  scriptAtcModel(mock);
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

/** Opens one app with stubbed feeds and waits for the map to draw its first frame. */
async function openApp(page: Page, framework: string): Promise<void> {
  await stubAtcFeeds(page, { frames: frame, blockTiles: true });
  // Record every data-hex a card ever renders, not just the final DOM, so a
  // card that briefly showed a half-streamed ID is caught by expectOnlyCompleteIds.
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
  await expect(page.getByTestId('airspace-map')).toHaveAttribute(
    'data-ready',
    '',
  );
}

/** Opens one app in a new phone-sized, touch context. Close the context when done. */
async function openPhone(
  browser: Browser,
  framework: string,
  viewport: { readonly width: number; readonly height: number } = PHONE,
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    viewport,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await openApp(page, framework);

  return { page, close: () => context.close() };
}

/** Types `prompt` into the composer and sends it. */
async function ask(page: Page, prompt: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Message' }).fill(prompt);
  await page.getByRole('button', { name: 'Send' }).click();
}

/**
 * Presses the map's zoom-out button `steps` times, waiting for each zoom to
 * finish. Leaflet starts the animation on the next frame (adding
 * `leaflet-zoom-anim`) and removes the class when it ends, so wait two frames
 * and then for the class to go. Under reduced motion there is no animation and
 * the class never appears.
 */
async function zoomOut(page: Page, steps: number): Promise<void> {
  for (let step = 0; step < steps; step++) {
    await page.locator('.leaflet-control-zoom-out').click();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page.locator('.leaflet-zoom-anim')).toHaveCount(0);
  }
}

/**
 * The boxes of the data tags on screen, once no tag is changing sides:
 * every tag shown and not hidden by the layout, including tags still fading
 * back in.
 */
async function visibleTags(page: Page) {
  await expect(page.locator('.atc-plane.is-tag-fading')).toHaveCount(0);
  return page.locator('.atc-plane-tag').evaluateAll((tags) =>
    tags
      .filter((tag) => {
        const plane = tag.closest('.atc-plane');
        return (
          getComputedStyle(tag).display !== 'none' &&
          plane?.getAttribute('data-tag') !== 'hidden'
        );
      })
      .map((tag) => {
        const { left, top, right, bottom } = tag.getBoundingClientRect();
        return { left, top, right, bottom };
      }),
  );
}

/**
 * Problems between visible tags and plane icons, once no tag is changing
 * sides: tags over the icon of a plane that is tagged, highlighted, selected
 * or followed (with its 2 px margin), and tags over an untagged plane's icon
 * whose marker is not stacked below the tag's marker.
 */
async function tagIconProblems(page: Page) {
  await expect(page.locator('.atc-plane.is-tag-fading')).toHaveCount(0);
  return page.evaluate(() => {
    const hits = (
      a: DOMRect,
      b: { left: number; top: number; right: number; bottom: number },
    ) =>
      a.left < b.right &&
      b.left < a.right &&
      a.top < b.bottom &&
      b.top < a.bottom;
    const zOf = (plane: Element) =>
      Number(
        getComputedStyle(plane.closest('.atc-plane-icon') as Element).zIndex,
      );
    const planes = [...document.querySelectorAll('.atc-plane')];
    const isHard = (plane: Element) =>
      plane.matches('.is-highlighted, .is-selected, .is-followed, .is-tagged');
    const problems: string[] = [];
    for (const owner of planes) {
      const tag = owner.querySelector('.atc-plane-tag');
      if (
        !tag ||
        getComputedStyle(tag).display === 'none' ||
        owner.getAttribute('data-tag') === 'hidden'
      ) {
        continue;
      }
      const box = tag.getBoundingClientRect();
      for (const other of planes) {
        if (other === owner) continue;
        const icon = other.getBoundingClientRect();
        const label = `${owner.getAttribute('data-label')} over ${other.getAttribute('data-label')}`;
        if (isHard(other)) {
          const margin = 2;
          if (
            hits(box, {
              left: icon.left - margin,
              top: icon.top - margin,
              right: icon.right + margin,
              bottom: icon.bottom + margin,
            })
          ) {
            problems.push(`${label} (tagged icon)`);
          }
        } else if (hits(box, icon) && zOf(owner) <= zOf(other)) {
          problems.push(`${label} (drawn under it)`);
        }
      }
    }
    // Whether or not a tag sits over one now, every untagged marker stacks
    // below every marker with a visible tag.
    const tagged = planes.filter((plane) => plane.matches('.is-tagged'));
    const untagged = planes.filter((plane) => !isHard(plane));
    const lowestTagged = Math.min(...tagged.map(zOf));
    for (const plane of untagged) {
      if (zOf(plane) >= lowestTagged) {
        problems.push(`${plane.getAttribute('data-label')} stacks above a tag`);
      }
    }
    return problems;
  });
}

/** How many pairs of boxes overlap. */
function overlappingPairs(
  boxes: { left: number; top: number; right: number; bottom: number }[],
): number {
  let pairs = 0;
  boxes.forEach((a, i) => {
    for (const b of boxes.slice(i + 1)) {
      if (
        a.left < b.right &&
        b.left < a.right &&
        a.top < b.bottom &&
        b.top < a.bottom
      ) {
        pairs++;
      }
    }
  });
  return pairs;
}

/** Fails if any card rendered a hex that is not a synthetic aircraft, such as a partial ID. */
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
  await openApp(page, testInfo.project.name);

  const tags = [
    [NAMED.eugeneCessna, 'N352LL'],
    [NAMED.lifeFlight, 'N911LF'],
    [NAMED.unidentified, 'A1C00B'],
  ].map(([hex, label]) => ({
    tag: page.locator(`.atc-plane[data-hex="${hex}"] .atc-plane-tag`),
    label,
  }));

  for (const { tag, label } of tags) {
    await expect(tag).toContainText(label);
  }
});

test('hovering a plane shows its detail card', async ({ page }, testInfo) => {
  await openApp(page, testInfo.project.name);
  // The home view frames central Oregon; zoom out to bring Eugene on screen.
  await zoomOut(page, 2);
  const card = page.getByTestId('aircraft-detail');
  await expect(card).toBeHidden();

  await page
    .locator(`.atc-plane[data-hex="${NAMED.eugeneCessna}"]`)
    .dispatchEvent('mouseover');

  await expect(card).toBeVisible();
  await expect(card).toContainText('RegistrationN352LL');
  await expect(card).toContainText(/Altitude[45],\d{3} ft/);
  await expect(card).toContainText('Squawk1200');
  await expect(card).toContainText('QNH1016.4 hPa');
  await expect(card).toContainText('Altimeter30.01 inHg');

  await page
    .locator(`.atc-plane[data-hex="${NAMED.eugeneCessna}"]`)
    .dispatchEvent('mouseout');

  await expect(card).toBeHidden();
});

test('the hovered plane stacks above the selected one and every other marker', async ({
  page,
}, testInfo) => {
  await openApp(page, testInfo.project.name);
  const icon = (hex: string) =>
    page.locator('.atc-plane-icon').filter({
      has: page.locator(`.atc-plane[data-hex="${hex}"]`),
    });
  const zIndex = (hex: string) =>
    icon(hex).evaluate((node) => Number(getComputedStyle(node).zIndex));
  await page
    .locator(`.atc-plane[data-hex="${selected.hex}"]`)
    .dispatchEvent('click');

  // N4417B, near Bend: on screen in the home view, like the selected plane.
  // force: planes glide every frame, so they never count as stable.
  await icon(NAMED.bendCessna).hover({ force: true });

  const others = await page
    .locator('.atc-plane-icon')
    .evaluateAll((nodes) =>
      nodes
        .filter((node) => !node.matches(':hover, :has(.is-selected)'))
        .map((node) => Number(getComputedStyle(node).zIndex)),
    );
  const hovered = await zIndex(NAMED.bendCessna);
  const chosen = await zIndex(selected.hex);
  expect(hovered).toBeGreaterThan(chosen);
  expect(chosen).toBeGreaterThan(Math.max(...others));
});

test('renders the selected aircraft as a live card', async ({
  page,
}, testInfo) => {
  await openApp(page, testInfo.project.name);
  await page
    .locator(`.atc-plane[data-hex="${selected.hex}"]`)
    .dispatchEvent('click');

  await page.getByRole('button', { name: PROMPTS.selected }).click();
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
  await openApp(page, testInfo.project.name);

  await page.getByRole('button', { name: PROMPTS.seattleArrivals }).click();

  await expect(page.getByTestId('arrivals-row')).toHaveCount(arrivals.length);
  await expect(page.locator('.atc-plane.is-dimmed').first()).toBeAttached();
  for (const row of arrivals) {
    await expect(
      page.locator(`.atc-plane[data-hex="${row.hex}"]`),
    ).not.toHaveClass(/is-dimmed/);
  }
  await expectOnlyCompleteIds(page);
});

test('the browser sends the response schema the server pins', async ({
  page,
}, testInfo) => {
  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
    warn.apply(console, args);
  };
  try {
    await openApp(page, testInfo.project.name);

    await page.getByRole('button', { name: PROMPTS.seattleArrivals }).click();
    await expect(page.getByTestId('arrivals-row')).toHaveCount(arrivals.length);
  } finally {
    console.warn = warn;
  }

  expect(warnings.filter((line) => line.includes('response schema'))).toEqual(
    [],
  );
});

test("shows what's flying near KBDN in an outlined area", async ({
  page,
}, testInfo) => {
  await openApp(page, testInfo.project.name);

  await ask(page, PROMPTS.nearKbdn);

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
  // The narrowest common phone: the peek must still show the starters.
  const { page, close } = await openPhone(browser, testInfo.project.name, {
    width: 375,
    height: 812,
  });
  const sheet = page.locator('#atc-chat-sheet');
  const starter = page.getByRole('button', { name: PROMPTS.nearBend });
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
  await close();
});

test('the data tags of a tight block of highlighted planes overlap no tag and no tagged icon, and sit above untagged icons', async ({
  page,
}, testInfo) => {
  await openApp(page, testInfo.project.name);

  await ask(page, PROMPTS.cluster);

  await expect(page.locator('.atc-plane.is-highlighted')).toHaveCount(
    CLUSTER.length,
  );
  // Wait for the fit to settle: the block is mid-map and no zoom animates.
  const map = page.getByTestId('airspace-map');
  const block = page.locator(`.atc-plane[data-hex="${CLUSTER[0]}"]`);
  await expect
    .poll(async () => {
      const outer = await map.boundingBox();
      const plane = await block.boundingBox();
      if (!outer || !plane) return Infinity;
      return Math.abs(plane.y - (outer.y + outer.height / 2));
    })
    .toBeLessThan(40);
  await expect(page.locator('.leaflet-zoom-anim')).toHaveCount(0);
  await expect
    .poll(async () => (await visibleTags(page)).length)
    .toBeGreaterThanOrEqual(3);
  // The block spreads with every fix, and tags are laid out again twice a
  // second; check across several fixes.
  for (let check = 0; check < 12; check++) {
    expect(overlappingPairs(await visibleTags(page))).toBe(0);
    expect(await tagIconProblems(page)).toEqual([]);
    await page.waitForTimeout(500);
  }
});

test('on a phone, a plane picked off screen lands mid-way between the docked card and the sheet', async ({
  browser,
}, testInfo) => {
  const { page, close } = await openPhone(browser, testInfo.project.name);
  await page.getByRole('button', { name: PROMPTS.highestAndFastest }).tap();
  const pick = page.locator(
    `[data-testid="aircraft-compare"] [data-hex="${highest.hex}"]`,
  );
  const plane = page.locator(`.atc-plane[data-hex="${highest.hex}"]`);
  await expect(pick).toBeEnabled();
  await expect(plane).not.toBeInViewport();

  await pick.tap();

  const card = page.getByTestId('aircraft-detail');
  await expect(card).toHaveClass(/is-docked/);
  await expect(card).toHaveClass(/is-open/);
  const sheet = page.locator('#atc-chat-sheet');
  /** Pixels from the plane to the middle of the band it should land in. */
  const offMiddle = async () => {
    const icon = await plane.boundingBox();
    const top = await card.boundingBox();
    const bottom = await sheet.boundingBox();
    if (!icon || !top || !bottom) return Infinity;
    const band = { top: top.y + top.height, bottom: bottom.y };
    return Math.abs(icon.y + icon.height / 2 - (band.top + band.bottom) / 2);
  };
  // The band starts 8 px below the card; the slack covers that.
  await expect.poll(offMiddle, { timeout: 15_000 }).toBeLessThan(12);
  await close();
});

test('on a phone, a typed question sent with the Send button lowers the sheet, and the fit lands above it', async ({
  browser,
}, testInfo) => {
  const { page, close } = await openPhone(browser, testInfo.project.name);
  const sheet = page.locator('#atc-chat-sheet');
  const input = page.getByRole('textbox', { name: 'Message' });
  await input.tap();
  await expect(sheet).toHaveAttribute('data-snap', 'full');
  await input.fill(PROMPTS.seattleArrivals);

  await page.getByRole('button', { name: 'Send' }).tap();

  await expect(sheet).toHaveAttribute('data-snap', 'half');
  await expect(page.getByTestId('arrivals-row')).toHaveCount(arrivals.length);
  /** The lowest highlighted plane's bottom, minus the sheet's top edge. */
  const belowSheet = async () => {
    const top = (await sheet.boundingBox())?.y ?? 0;
    const bottoms = await page
      .locator('.atc-plane.is-highlighted')
      .evaluateAll((planes) =>
        planes.map((plane) => plane.getBoundingClientRect().bottom),
      );
    return bottoms.length === 0 ? Infinity : Math.max(...bottoms) - top;
  };
  await expect.poll(belowSheet, { timeout: 15_000 }).toBeLessThan(-8);
  await close();
});

test('compares the highest and the fastest aircraft', async ({
  page,
}, testInfo) => {
  await openApp(page, testInfo.project.name);

  await page.getByRole('button', { name: PROMPTS.highestAndFastest }).click();

  const compare = page.getByTestId('aircraft-compare');
  await expect(compare).toContainText(highest.label);
  await expect(compare).toContainText(fastest.label);
  await expectOnlyCompleteIds(page);
});

test("shows the model's reasoning before its tool calls, collapsed once answered", async ({
  page,
}, testInfo) => {
  await openApp(page, testInfo.project.name);

  await ask(page, PROMPTS.reasoned);

  const reasoning = page.getByTestId('reasoning');
  const card = page.getByTestId('flight-card');
  await expect(card).toHaveAttribute('data-hex', highest.hex);
  await expect(reasoning).toHaveCount(1);
  await expect(reasoning).toContainText(REASONING);
  await expect(reasoning.locator('summary')).toHaveText('Reasoned');
  await expect(reasoning.locator('details')).not.toHaveAttribute('open');
  await expect(reasoning.locator('.atc-shimmer')).toHaveCount(0);
  const beforeTools = await reasoning.evaluate((row) => {
    const tools = document.querySelector('[data-testid="tool-summary"]');
    return (
      tools !== null &&
      Boolean(
        row.compareDocumentPosition(tools) & Node.DOCUMENT_POSITION_FOLLOWING,
      )
    );
  });
  expect(beforeTools).toBe(true);
});

test('each app stands alone, with no links to the other framework', async ({
  page,
}, testInfo) => {
  await openApp(page, testInfo.project.name);

  const links = page.locator(
    'a[href^="/angular"], a[href^="/react"], a[href*="atc.hashbrown.dev"]',
  );
  const named = page.getByRole('link', { name: /^(angular|react)$/i });

  await expect(links).toHaveCount(0);
  await expect(named).toHaveCount(0);
});

test('the header links to the source on GitHub', async ({ page }, testInfo) => {
  await openApp(page, testInfo.project.name);

  const link = page.getByRole('link', { name: 'atc source on GitHub' });

  await expect(link).toHaveAttribute(
    'href',
    'https://github.com/liveloveapp/hashbrown/tree/main/examples/atc',
  );
});

test('pressing / focuses the composer', async ({ page }, testInfo) => {
  await openApp(page, testInfo.project.name);
  const input = page.getByRole('textbox', { name: 'Message' });
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await expect(input).not.toBeFocused();

  await page.keyboard.press('/');

  await expect(input).toBeFocused();
  await expect(input).toHaveValue('');
});

test('folds tool calls into one activity line that expands to every step', async ({
  page,
}, testInfo) => {
  await openApp(page, testInfo.project.name);

  await page.getByRole('button', { name: PROMPTS.highestAndFastest }).click();

  const summary = page.getByTestId('tool-summary');
  await expect(summary).toHaveText('Searched traffic · 1 step');
  await expect(summary).toHaveAttribute('aria-expanded', 'false');
  await summary.click();
  await expect(summary).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('tool-step')).toHaveText([
    'Finding aircraft sorted by altitude',
  ]);
});

test('follows an aircraft on the map', async ({ page }, testInfo) => {
  await openApp(page, testInfo.project.name);

  await page.getByRole('button', { name: PROMPTS.followFastest }).click();

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
  // Still centred after two more 3 s snapshots.
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
  await openApp(page, testInfo.project.name);

  await page.getByRole('button', { name: PROMPTS.highestAndFastest }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  await alert.getByRole('button', { name: 'Retry' }).click();

  await expect(page.getByTestId('aircraft-compare')).toContainText(
    highest.label,
  );
  await expect(alert).toHaveCount(0);
});

test('shows Redmond airport as a diagram with its card', async ({
  page,
}, testInfo) => {
  await openApp(page, testInfo.project.name);

  await page.getByRole('button', { name: PROMPTS.redmondAirport }).click();

  const card = page.getByTestId('airport-card');
  await expect(card).toContainText('ROBERTS FLD/REDMOND MUNI (RDM)');
  await expect(card).toContainText('124.5★');
  await expect(card.locator('.atc-airport-badge')).toHaveText('Towered');
  await expect(
    page.locator('.atc-diagram-label.is-runway > span').first(),
  ).toBeVisible();
  await expect(page.getByTestId('tool-summary')).toHaveText(
    'Looked up Redmond, showed KRDM · 2 steps',
  );
});

test('the airports layer can be hidden by the assistant', async ({
  page,
}, testInfo) => {
  await openApp(page, testInfo.project.name);
  await expect(
    page.locator('.atc-apt-block', { hasText: /^RDM$/ }),
  ).toBeAttached();
  await expect(page.locator('.atc-apt-block.is-fallback')).toHaveCount(0);

  await ask(page, PROMPTS.hideAirports);

  await expect(page.locator('.atc-apt-block')).toHaveCount(0);
  await expect(page.locator('.leaflet-atc-airports-pane > *')).toHaveCount(0);
});

test('the Layers control works from the keyboard', async ({
  page,
}, testInfo) => {
  await openApp(page, testInfo.project.name);
  const toggle = page.getByRole('button', { name: 'Layers' });

  await toggle.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('checkbox', { name: 'Airports' }).press('Space');
  await page.keyboard.press('Escape');

  await expect(page.locator('.atc-apt-block')).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('lists the aircraft inside the Portland Class C and lights its shelf', async ({
  page,
}, testInfo) => {
  await openApp(page, testInfo.project.name);

  await page.getByRole('button', { name: PROMPTS.portlandClassC }).click();

  await expect(page.getByTestId('arrivals-row')).toHaveCount(portland.length);
  await expect(page.locator('.atc-as.is-c.is-highlighted')).toHaveCount(1);
  await expect(page.getByTestId('tool-summary')).toHaveText(
    `Looked up Portland, searched traffic, highlighted ${portland.length} aircraft · 3 steps`,
  );
});

test('shows the Redmond airspace with its ceiling label', async ({
  page,
}, testInfo) => {
  await openApp(page, testInfo.project.name);

  await ask(page, PROMPTS.redmondAirspace);

  await expect(
    page.locator('.atc-as-label .atc-as-text', { hasText: '56' }),
  ).toBeVisible();
  await expect(page.locator('.atc-as.is-d.is-highlighted')).toHaveCount(1);
  await expect(
    page.getByText('Redmond has a part-time Class D.'),
  ).toBeVisible();
  await expect(page.getByTestId('tool-summary')).toHaveText(
    'Showed KRDM airspace · 1 step',
  );
});

test('the Layers control hides the airspace', async ({ page }, testInfo) => {
  await openApp(page, testInfo.project.name);
  await expect(page.locator('.atc-as').first()).toBeAttached();

  await page.getByRole('button', { name: 'Layers' }).click();
  await page.getByRole('checkbox', { name: 'Airspace' }).uncheck();

  await expect(page.locator('.atc-as')).toHaveCount(0);
});
