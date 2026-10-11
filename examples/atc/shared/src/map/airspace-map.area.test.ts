// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import type { Aircraft } from '../aircraft';
import { AIRPORTS, type Area, AREAS } from '../places';
import { createAtcStore } from '../store';
import { createAirspaceMap } from './airspace-map';

const { KBDN } = AIRPORTS;
const base: Aircraft = {
  hex: 'aaaaaa',
  label: 'N352LL',
  callsign: null,
  registration: 'N352LL',
  typeCode: 'C172',
  category: null,
  kind: 'single',
  lat: KBDN.lat,
  lon: KBDN.lon,
  altitudeFt: 5000,
  onGround: false,
  groundSpeedKt: 110,
  trackDeg: 90,
  verticalRateFpm: 0,
};
/** One plane over Bend and one 20 nm east of it. */
const planes: Aircraft[] = [
  base,
  { ...base, hex: 'bbbbbb', lon: KBDN.lon + 20 / (60 * Math.cos(0.7696)) },
];

/**
 * Mounts a 400x300 map with reduced motion so moves are immediate, on the
 * real home view unless `area` says otherwise.
 */
async function mount(area: Area = AREAS.pnw) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
  }));
  const store = createAtcStore();
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { value: 400 });
  Object.defineProperty(element, 'clientHeight', { value: 300 });
  const handle = await createAirspaceMap({ element, store, area });
  const px = (value: string | undefined) => parseFloat(value ?? '0') || 0;
  const pane = () => element.querySelector<HTMLElement>('.leaflet-map-pane');
  const pixel = (hex: string) => {
    const icon = element
      .querySelector(`[data-hex="${hex}"]`)
      ?.closest<HTMLElement>('.atc-plane-icon');

    return {
      x: px(icon?.style.left) + px(pane()?.style.left),
      y: px(icon?.style.top) + px(pane()?.style.top),
    };
  };
  /** Pixels between the plane over Bend and the one 20 nm east. */
  const spread = () => pixel('bbbbbb').x - pixel('aaaaaa').x;

  return {
    store,
    element,
    pixel,
    spread,
    outline: () => element.querySelector('.atc-area'),
    zoomIn: () =>
      element.querySelector<HTMLElement>('.leaflet-control-zoom-in')?.click(),
    cleanup: () => {
      handle.destroy();
      vi.unstubAllGlobals();
    },
  };
}

test('showing an area centres it, zooms in and draws a faint outline', async () => {
  const map = await mount({
    ...AREAS.pnw,
    view: { lat: AREAS.pnw.lat, lon: AREAS.pnw.lon, zoom: 6 },
  });
  map.store.applySnapshot({ at: 1, aircraft: planes });
  const before = map.spread();

  map.store.showArea({ airport: 'KBDN', radiusNm: 25 });

  const { x, y } = map.pixel('aaaaaa');
  expect(Math.hypot(x - 200, y - 150)).toBeLessThan(2);
  expect(map.spread()).toBeGreaterThan(before * 3);
  expect(map.spread()).toBeLessThan(200);
  expect(map.outline()).not.toBeNull();
  map.cleanup();
});

test('resetting returns to the home view and removes the outline', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: planes });
  const regional = map.spread();
  map.store.showArea({ airport: 'KSEA', radiusNm: 10 });

  map.store.resetView();

  // Zoom 9: a degree of longitude is 256 * 2^9 / 360 pixels.
  expect(regional).toBeCloseTo(
    (20 * 256 * 2 ** 9) / 360 / 60 / Math.cos(0.7696),
    -1,
  );
  expect(map.spread()).toBeCloseTo(regional, 0);
  expect(map.outline()).toBeNull();
  map.cleanup();
});

test('a followed plane keeps the view when an area is shown', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: planes });
  map.store.follow('aaaaaa');
  const before = map.spread();

  map.store.showArea({ airport: 'KSEA', radiusNm: 10 });

  expect(map.spread()).toBeCloseTo(before, 0);
  map.cleanup();
});

test('highlighting planes inside the shown area keeps the area view', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: planes });
  map.store.showArea({ airport: 'KBDN', radiusNm: 25 });
  const area = map.spread();

  map.store.highlight(['aaaaaa', 'bbbbbb']);

  expect(map.spread()).toBeCloseTo(area, 0);
  expect(map.outline()).not.toBeNull();
  map.cleanup();
});

test('a user zoom cancels a fit still waiting for its planes', async () => {
  const map = await mount({
    ...AREAS.pnw,
    view: { lat: AREAS.pnw.lat, lon: AREAS.pnw.lon, zoom: 6 },
  });
  map.store.highlight(['aaaaaa', 'bbbbbb']);
  map.zoomIn();
  const zoomed = (20 * 256 * 2 ** 7) / 360 / 60 / Math.cos(0.7696);

  map.store.applySnapshot({ at: 1, aircraft: planes });

  // Zoom 7 (6 plus the user's step), not the fit's zoom.
  expect(map.spread()).toBeCloseTo(zoomed, -1);
  expect(map.store.getState().viewRequest).toBeNull();
  map.cleanup();
});
