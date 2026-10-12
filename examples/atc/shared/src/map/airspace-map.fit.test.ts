// @vitest-environment jsdom
import { expect, onTestFinished, test } from 'vitest';
import type { Aircraft } from '../aircraft';
import { AREAS } from '../places';
import { createAtcStore } from '../store';
import { testAircraft } from '../testing';
import { createAirspaceMap } from './airspace-map';
import { mapElement, planePixel, REDUCED_MOTION, stubMedia } from './testing';

const base = testAircraft();
const planes: Aircraft[] = [
  base,
  { ...base, hex: 'bbbbbb', callsign: 'ASA2', lat: 47.45, lon: -122.2 },
  { ...base, hex: 'cccccc', callsign: 'DAL3', lat: 47.5, lon: -122.35 },
];

/** Mounts a 400x300 map with reduced motion so moves are immediate. */
async function mount() {
  stubMedia(REDUCED_MOTION);
  const store = createAtcStore();
  const element = mapElement();
  const handle = await createAirspaceMap({
    element,
    store,
    area: {
      ...AREAS.pnw,
      view: { lat: AREAS.pnw.lat, lon: AREAS.pnw.lon, zoom: 6 },
    },
  });
  onTestFinished(() => {
    handle.destroy();
  });
  /** Pixel position of a plane relative to the map's top-left. */
  const pixel = (hex: string) => planePixel(element, hex);
  const spread = () => {
    const a = pixel('aaaaaa');
    const c = pixel('cccccc');

    return Math.hypot(a.x - c.x, a.y - c.y);
  };

  return {
    store,
    /** The user presses the zoom control's plus button. */
    zoomIn: () =>
      element.querySelector<HTMLElement>('.leaflet-control-zoom-in')?.click(),
    pixel,
    spread,
  };
}

test('highlighting several planes zooms in so they spread apart', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: planes });
  const before = map.spread();

  map.store.highlight(['aaaaaa', 'bbbbbb', 'cccccc']);

  expect(map.spread()).toBeGreaterThan(before * 2);
});

test('highlighting one plane centres it', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: planes });

  map.store.highlight(['bbbbbb']);

  const { x, y } = map.pixel('bbbbbb');
  expect(Math.hypot(x - 200, y - 150)).toBeLessThan(2);
});

test('clearing the highlight and new snapshots leave the view alone', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: planes });
  map.store.highlight(['aaaaaa', 'cccccc']);
  const fitted = map.spread();

  map.store.clearHighlight();
  map.store.applySnapshot({ at: 2, aircraft: planes });

  expect(map.spread()).toBeCloseTo(fitted, 0);
});

test('a followed plane keeps the view: highlighting does not refit', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: planes });
  map.store.follow('bbbbbb');
  const before = map.spread();

  map.store.highlight(['aaaaaa', 'cccccc']);

  expect(map.spread()).toBeCloseTo(before, 0);
});

test('a user zoom after a fit is not overridden by later snapshots', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: planes });
  map.store.highlight(['aaaaaa', 'cccccc']);
  const fitted = map.pixel('aaaaaa');
  map.zoomIn();
  const after = map.pixel('aaaaaa');
  expect(after).not.toEqual(fitted);

  map.store.applySnapshot({ at: 2, aircraft: planes });
  map.store.applySnapshot({ at: 3, aircraft: planes });
  const later = map.pixel('aaaaaa');

  // Under a pixel: Leaflet rounds after the zoom, the motion loop does not.
  expect(Math.hypot(later.x - after.x, later.y - after.y)).toBeLessThan(1);
});

test('a highlight that arrives before its markers fits once they appear', async () => {
  const map = await mount();
  map.store.highlight(['aaaaaa', 'cccccc']);

  map.store.applySnapshot({ at: 1, aircraft: planes });

  const a = map.pixel('aaaaaa');
  const c = map.pixel('cccccc');
  expect(Math.hypot(a.x - c.x, a.y - c.y)).toBeGreaterThan(60);
});

test('changing the highlighted set refits', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: planes });
  map.store.highlight(['aaaaaa', 'cccccc']);
  const first = map.pixel('bbbbbb');

  map.store.highlight(['bbbbbb']);

  expect(map.pixel('bbbbbb')).not.toEqual(first);
  const { x, y } = map.pixel('bbbbbb');
  expect(Math.hypot(x - 200, y - 150)).toBeLessThan(2);
});

test('a wide spread stops zooming out at zoom 5', async () => {
  const map = await mount();
  const far = [
    { ...base, hex: 'aaaaaa', lat: 30, lon: -125 },
    { ...base, hex: 'cccccc', lat: 49, lon: -105 },
  ];
  map.store.applySnapshot({ at: 1, aircraft: far });

  map.store.highlight(['aaaaaa', 'cccccc']);

  // At zoom 5 a degree of longitude is 256 * 2^5 / 360 pixels.
  const a = map.pixel('aaaaaa');
  const c = map.pixel('cccccc');
  expect(Math.abs(c.x - a.x)).toBeCloseTo((20 * 256 * 32) / 360, -1);
});

test('co-located planes stop zooming in at zoom 10', async () => {
  const map = await mount();
  const near = [
    { ...base, hex: 'aaaaaa', lat: 47.4, lon: -122.3 },
    { ...base, hex: 'cccccc', lat: 47.4001, lon: -122.3001 },
    { ...base, hex: 'bbbbbb', lat: 47.4, lon: -122.2 },
  ];
  map.store.applySnapshot({ at: 1, aircraft: near });

  map.store.highlight(['aaaaaa', 'cccccc']);

  // At zoom 10 a degree of longitude is 256 * 2^10 / 360 pixels.
  const a = map.pixel('aaaaaa');
  const b = map.pixel('bbbbbb');
  expect(Math.abs(b.x - a.x)).toBeCloseTo((0.1 * 256 * 1024) / 360, 0);
});
