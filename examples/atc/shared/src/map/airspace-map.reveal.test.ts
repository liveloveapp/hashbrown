// @vitest-environment jsdom
import { expect, onTestFinished, test, vi } from 'vitest';
import type { Aircraft } from '../aircraft';
import { AIRPORTS, type Area, AREAS } from '../places';
import { createAtcStore } from '../store';
import { testAircraft } from '../testing';
import { createAirspaceMap } from './airspace-map';
import {
  createFrameQueue,
  mapElement,
  planePixel,
  REDUCED_MOTION,
  stubMedia,
} from './testing';

/** The whole region at zoom 6, so every test plane is on the 400 by 300 map. */
const REGIONAL = {
  ...AREAS.pnw,
  view: { lat: AREAS.pnw.lat, lon: AREAS.pnw.lon, zoom: 6 },
};

const base = testAircraft();
const planes: Aircraft[] = [
  base,
  { ...base, hex: 'bbbbbb', callsign: 'ASA2', lat: 47.45, lon: -122.2 },
  { ...base, hex: 'cccccc', callsign: 'DAL3', lat: 45.6, lon: -122.6 },
];

/**
 * Mounts a 400x300 map with reduced motion and animation frames that only
 * run when a test calls the returned `settle`. With `sheetTop`, the map sits
 * in a workbench whose chat panel covers the map from that y down, like the
 * phone bottom sheet. `media` lists further media queries that match. The
 * map is destroyed and the page restored when the test finishes, even if it
 * fails.
 */
async function mount(
  sheetTop?: number,
  area: Area = REGIONAL,
  media: readonly string[] = [],
) {
  stubMedia(REDUCED_MOTION, ...media);
  const queue = createFrameQueue();
  const store = createAtcStore();
  const workbench = document.createElement('main');
  workbench.className = 'atc-workbench';
  const element = mapElement();
  element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 400, bottom: 300 }) as DOMRect;
  let panel: HTMLElement | null = null;
  if (sheetTop !== undefined) {
    panel = document.createElement('section');
    panel.className = 'atc-chat-panel';
    panel.getBoundingClientRect = () =>
      ({ left: 0, top: sheetTop, right: 400, bottom: 300 }) as DOMRect;
    workbench.append(panel);
  }
  workbench.append(element);
  document.body.append(workbench);
  const handle = await createAirspaceMap({
    element,
    store,
    area,
    obstruction: () => panel,
  });

  let destroyed = false;
  const destroy = () => {
    if (!destroyed) {
      destroyed = true;
      handle.destroy();
    }
  };
  onTestFinished(() => {
    destroy();
    workbench.remove();
    vi.restoreAllMocks();
  });

  return {
    store,
    pixel: (hex: string) => planePixel(element, hex),
    element,
    /**
     * Runs the map's pending animation frames, and any they ask for, a few
     * rounds deep. This covers the map's two-frame wait for the sheet
     * without depending on the clock, so it holds under load.
     */
    settle: queue.settle,
    /** Destroys the map but leaves its container in the page. */
    destroy,
  };
}

test('revealing a plane picked in the chat centres it', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: planes });

  map.store.revealAircraft('cccccc');
  await map.settle();

  const { x, y } = map.pixel('cccccc');
  expect(Math.hypot(x - 200, y - 150)).toBeLessThan(2);
  expect(map.store.getState().selectedHex).toBe('cccccc');
});

test('a revealed plane lands in the middle of the map left above the sheet', async () => {
  const map = await mount(180);
  map.store.applySnapshot({ at: 1, aircraft: planes });

  map.store.revealAircraft('cccccc');
  await map.settle();

  const { x, y } = map.pixel('cccccc');
  expect(Math.hypot(x - 200, y - 90)).toBeLessThan(2);
});

test('a highlight fit keeps every plane above the sheet', async () => {
  const map = await mount(180);
  map.store.applySnapshot({ at: 1, aircraft: planes });

  map.store.highlight(['aaaaaa', 'bbbbbb', 'cccccc']);
  await map.settle();

  const ys = ['aaaaaa', 'bbbbbb', 'cccccc'].map((hex) => map.pixel(hex).y);
  expect(Math.max(...ys)).toBeLessThan(180);
  expect(Math.min(...ys)).toBeGreaterThan(0);
});

test('a revealed plane lands between a docked detail card and the sheet', async () => {
  const map = await mount(180);
  // On screen above the sheet, so its card docks as the map moves.
  const visible = { ...base, hex: 'dddddd', lat: 44.4, lon: -121.6 };
  map.store.applySnapshot({ at: 1, aircraft: [...planes, visible] });
  const card = document.querySelector<HTMLElement>(
    '[data-testid="aircraft-detail"]',
  );
  Object.defineProperty(card, 'offsetHeight', { get: () => 60 });

  map.store.revealAircraft('dddddd');
  await map.settle();

  // The card covers 8 + 60 + 8 px at the top; the sheet starts at 180.
  const { x, y } = map.pixel('dddddd');
  expect(Math.hypot(x - 200, y - (76 + 180) / 2)).toBeLessThan(2);
});

test('the map opens on its home view, centred in the map left above the sheet', async () => {
  const { view } = AREAS.pnw;
  const map = await mount(180, AREAS.pnw);

  map.store.applySnapshot({
    at: 1,
    aircraft: [{ ...base, lat: view.lat, lon: view.lon, groundSpeedKt: 0 }],
  });

  const { x, y } = map.pixel('aaaaaa');
  expect(Math.hypot(x - 200, y - 90)).toBeLessThan(2);
});

test('resetting on a phone returns to the home view above the sheet', async () => {
  const { view } = AREAS.pnw;
  const map = await mount(180, AREAS.pnw);
  map.store.applySnapshot({
    at: 1,
    aircraft: [{ ...base, lat: view.lat, lon: view.lon, groundSpeedKt: 0 }],
  });
  map.store.showArea({ airport: 'KSEA', radiusNm: 10 });
  await map.settle();

  map.store.resetView();
  await map.settle();

  const { x, y } = map.pixel('aaaaaa');
  expect(Math.hypot(x - 200, y - 90)).toBeLessThan(2);
});

/**
 * Gives every detail card (and the hidden copy it measures) a height, as
 * layout would; jsdom has none. Restored when the test finishes.
 */
function cardHeight(height: number) {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(
    function (this: HTMLElement) {
      return this.classList.contains('atc-detail') ? height : 0;
    },
  );
}

/** A plane on screen above the sheet in the regional view. */
const visible: Aircraft = { ...base, hex: 'dddddd', lat: 44.4, lon: -121.6 };
/** A plane over Bend, the centre of the shown areas below. */
const overBend: Aircraft = {
  ...base,
  hex: 'eeeeee',
  lat: AIRPORTS.KBDN.lat,
  lon: AIRPORTS.KBDN.lon,
  groundSpeedKt: 0,
};

test('a plane revealed from off screen lands between the card it docks and the sheet', async () => {
  const map = await mount(180);
  map.store.applySnapshot({ at: 1, aircraft: planes });
  cardHeight(100);

  map.store.revealAircraft('cccccc');
  await map.settle();

  // The card will cover 8 + 100 + 8 px at the top; the sheet starts at 180.
  const { x, y } = map.pixel('cccccc');
  expect(Math.hypot(x - 200, y - (116 + 180) / 2)).toBeLessThan(2);
});

test('a highlight fit keeps every plane between a docked card and the sheet', async () => {
  const map = await mount(180);
  map.store.applySnapshot({ at: 1, aircraft: [...planes, visible] });
  cardHeight(60);
  map.store.select('dddddd');

  map.store.highlight(['dddddd', 'aaaaaa', 'bbbbbb']);
  await map.settle();

  const ys = ['dddddd', 'aaaaaa', 'bbbbbb'].map((hex) => map.pixel(hex).y);
  expect(Math.min(...ys)).toBeGreaterThan(76);
  expect(Math.max(...ys)).toBeLessThan(180);
});

test('highlighting one plane centres it between a docked card and the sheet', async () => {
  const map = await mount(180);
  map.store.applySnapshot({ at: 1, aircraft: [...planes, visible] });
  cardHeight(60);
  map.store.select('dddddd');

  map.store.highlight(['dddddd']);
  await map.settle();

  const { x, y } = map.pixel('dddddd');
  expect(Math.hypot(x - 200, y - (76 + 180) / 2)).toBeLessThan(2);
});

test('a followed plane stays mid-way down the map left above the sheet', async () => {
  const map = await mount(180);
  map.store.applySnapshot({ at: 1, aircraft: planes });

  map.store.follow('cccccc');

  const { x, y } = map.pixel('cccccc');
  expect(Math.hypot(x - 200, y - 90)).toBeLessThan(2);
});

test('a followed plane stays between its docked card and the sheet', async () => {
  const map = await mount(180);
  map.store.applySnapshot({ at: 1, aircraft: [...planes, visible] });
  cardHeight(60);
  map.store.select('dddddd');

  map.store.follow('dddddd');

  const { x, y } = map.pixel('dddddd');
  expect(Math.hypot(x - 200, y - (76 + 180) / 2)).toBeLessThan(2);
});

test('showing an area centres it between a docked card and the sheet', async () => {
  const map = await mount(180);
  map.store.applySnapshot({ at: 1, aircraft: [...planes, overBend] });
  cardHeight(60);
  map.store.select('eeeeee');

  map.store.showArea({ airport: 'KBDN', radiusNm: 5 });
  await map.settle();

  const { x, y } = map.pixel('eeeeee');
  expect(Math.hypot(x - 200, y - (76 + 180) / 2)).toBeLessThan(2);
});

test('showing an airport centres it between a docked card and the sheet', async () => {
  const map = await mount(180);
  map.store.applySnapshot({ at: 1, aircraft: [...planes, overBend] });
  cardHeight(60);
  map.store.select('eeeeee');

  map.store.showAirport('KBDN');
  await map.settle();

  const { x, y } = map.pixel('eeeeee');
  expect(Math.hypot(x - 200, y - (76 + 180) / 2)).toBeLessThan(2);
});

test('a plane revealed from off screen has its summary written as its card opens, so it is announced', async () => {
  const map = await mount(180);
  map.store.applySnapshot({ at: 1, aircraft: planes });
  cardHeight(100);
  const card = [
    ...document.querySelectorAll<HTMLElement>(
      '[data-testid="aircraft-detail"]',
    ),
  ].at(-1) as HTMLElement;
  const events: string[] = [];
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.attributeName === 'aria-hidden' && record.target === card) {
        events.push(record.oldValue === 'true' ? 'open' : 'close');
      } else if (
        record.type === 'childList' &&
        (record.target as Element).closest?.('.atc-detail-summary')
      ) {
        events.push('write');
      }
    }
  });
  observer.observe(card, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ['aria-hidden'],
  });

  map.store.revealAircraft('cccccc');
  await map.settle();
  await Promise.resolve();
  observer.disconnect();

  // The last write to the live summary comes with the opening that shows it.
  const lastOpen = events.lastIndexOf('open');
  const lastWrite = events.lastIndexOf('write');
  expect(card.getAttribute('aria-hidden')).toBe('false');
  expect(lastWrite).toBeGreaterThanOrEqual(0);
  expect(events.slice(lastWrite + 1, lastOpen)).not.toContain('close');
  expect(events.slice(lastWrite + 1, lastOpen)).not.toContain('open');
});

test('a plane tapped earlier (a sticky hover on phones) does not stop a reveal leaving room for the docked card', async () => {
  const map = await mount(180);
  map.store.applySnapshot({ at: 1, aircraft: planes });
  cardHeight(100);
  document
    .querySelector('[data-hex="aaaaaa"]')
    ?.closest('.atc-plane-icon')
    ?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

  map.store.revealAircraft('cccccc');
  await map.settle();

  const { x, y } = map.pixel('cccccc');
  expect(Math.hypot(x - 200, y - (116 + 180) / 2)).toBeLessThan(2);
});

test('on a touch screen a tap does not leave a sticky hover: a plane picked in the chat gets the card', async () => {
  const map = await mount(180, REGIONAL, ['(hover: none)']);
  const neighbour = { ...base, hex: 'ffffff', lat: 45.65, lon: -122.6 };
  map.store.applySnapshot({ at: 1, aircraft: [...planes, neighbour] });
  document
    .querySelector('[data-hex="ffffff"]')
    ?.closest('.atc-plane-icon')
    ?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

  map.store.revealAircraft('cccccc');
  await map.settle();

  const card = [
    ...document.querySelectorAll('[data-testid="aircraft-detail"]'),
  ].at(-1);
  expect(card?.getAttribute('data-hex')).toBe('cccccc');
  expect(card?.classList.contains('is-docked')).toBe(true);
});

test('destroying the map removes the detail card and its hidden measuring copy', async () => {
  const map = await mount(180);
  map.store.applySnapshot({ at: 1, aircraft: planes });
  cardHeight(100);
  map.store.revealAircraft('cccccc');
  await map.settle();
  const before = map.element.querySelectorAll('.atc-detail').length;

  map.destroy();

  expect(before).toBe(2);
  expect(map.element.querySelectorAll('.atc-detail')).toHaveLength(0);
});
