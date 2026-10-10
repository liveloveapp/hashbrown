// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import type { Aircraft } from '../aircraft';
import { AREAS } from '../places';
import { createAtcStore } from '../store';
import { createAirspaceMap } from './airspace-map';

const base: Aircraft = {
  hex: 'aaaaaa',
  callsign: 'UAL100',
  typeCode: 'B738',
  lat: 47.4,
  lon: -122.3,
  altitudeFt: 5000,
  onGround: false,
  groundSpeedKt: 200,
  trackDeg: 90,
  verticalRateFpm: 0,
};
const planes: Aircraft[] = [
  base,
  { ...base, hex: 'bbbbbb', callsign: 'ASA2', lat: 47.45, lon: -122.2 },
  { ...base, hex: 'cccccc', callsign: 'DAL3', lat: 47.5, lon: -122.35 },
];

/** Mounts a 400x300 map with reduced motion so moves are immediate. */
async function mount() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
  }));
  const store = createAtcStore();
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { value: 400 });
  Object.defineProperty(element, 'clientHeight', { value: 300 });
  const handle = await createAirspaceMap({ element, store, area: AREAS.pnw });
  const px = (value: string | undefined) => parseFloat(value ?? '0') || 0;
  const pane = () => element.querySelector<HTMLElement>('.leaflet-map-pane');
  /** Pixel position of a plane relative to the map's top-left. */
  const pixel = (hex: string) => {
    const icon = element
      .querySelector(`[data-hex="${hex}"]`)
      ?.closest<HTMLElement>('.atc-plane-icon');

    return {
      x: px(icon?.style.left) + px(pane()?.style.left),
      y: px(icon?.style.top) + px(pane()?.style.top),
    };
  };
  const spread = () => {
    const a = pixel('aaaaaa');
    const c = pixel('cccccc');

    return Math.hypot(a.x - c.x, a.y - c.y);
  };

  return {
    store,
    pixel,
    spread,
    cleanup: () => {
      handle.destroy();
      vi.unstubAllGlobals();
    },
  };
}

test('highlighting several planes zooms in so they spread apart', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: planes });
  const before = map.spread();

  map.store.highlight(['aaaaaa', 'bbbbbb', 'cccccc']);

  expect(map.spread()).toBeGreaterThan(before * 2);
  map.cleanup();
});

test('highlighting one plane centres it', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: planes });

  map.store.highlight(['bbbbbb']);

  const { x, y } = map.pixel('bbbbbb');
  expect(Math.hypot(x - 200, y - 150)).toBeLessThan(2);
  map.cleanup();
});

test('clearing the highlight and new snapshots leave the view alone', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: planes });
  map.store.highlight(['aaaaaa', 'cccccc']);
  const fitted = map.spread();

  map.store.clearHighlight();
  map.store.applySnapshot({ at: 2, aircraft: planes });

  expect(map.spread()).toBeCloseTo(fitted, 0);
  map.cleanup();
});

test('a followed plane keeps the view: highlighting does not refit', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: planes });
  map.store.follow('bbbbbb');
  const before = map.spread();

  map.store.highlight(['aaaaaa', 'cccccc']);

  expect(map.spread()).toBeCloseTo(before, 0);
  map.cleanup();
});
