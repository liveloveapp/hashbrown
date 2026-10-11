// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import type { Aircraft } from '../aircraft';
import { AREAS } from '../places';
import { createAtcStore } from '../store';
import { createAirspaceMap } from './airspace-map';

const base: Aircraft = {
  hex: 'aaaaaa',
  label: 'UAL100',
  callsign: 'UAL100',
  registration: null,
  typeCode: 'B738',
  category: null,
  kind: 'jet',
  lat: AREAS.pnw.lat,
  lon: AREAS.pnw.lon,
  altitudeFt: 5000,
  onGround: false,
  groundSpeedKt: 0,
  trackDeg: 90,
  verticalRateFpm: 0,
};
/** A fit zooms to at most 10, where 0.002 degrees is about 2 pixels. */
const close: Aircraft[] = [
  base,
  { ...base, hex: 'bbbbbb', label: 'ASA2', lat: base.lat + 0.002 },
];
/** Far apart: the fit spreads them across the map. */
const apart: Aircraft[] = [
  base,
  { ...base, hex: 'bbbbbb', label: 'ASA2', lat: base.lat + 1.5 },
];

/**
 * Mounts a 400x300 map with reduced motion, so moves are immediate. A
 * highlight fits the map to its planes.
 */
async function mount() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
  }));
  const store = createAtcStore();
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { value: 400 });
  Object.defineProperty(element, 'clientHeight', { value: 300 });
  document.body.append(element);
  const handle = await createAirspaceMap({
    element,
    store,
    area: { ...AREAS.pnw, view: { ...AREAS.pnw.view, zoom: 6 } },
  });
  const tag = (hex: string) =>
    element
      .querySelector(`.atc-plane[data-hex="${hex}"]`)
      ?.getAttribute('data-tag') ?? 'right';

  return {
    store,
    tag,
    zoomOut: () =>
      element.querySelector<HTMLElement>('.leaflet-control-zoom-out')?.click(),
    cleanup: () => {
      handle.destroy();
      element.remove();
      vi.unstubAllGlobals();
    },
  };
}

test('highlighting two planes drawn on top of each other moves the second tag aside', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: close });

  map.store.highlight(['aaaaaa', 'bbbbbb']);

  expect(map.tag('aaaaaa')).toBe('right');
  expect(map.tag('bbbbbb')).not.toBe('right');
  expect(map.tag('bbbbbb')).not.toBe('hidden');
  map.cleanup();
});

test('the highlight order decides which tag keeps the right side', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: close });

  map.store.highlight(['bbbbbb', 'aaaaaa']);

  expect(map.tag('bbbbbb')).toBe('right');
  expect(map.tag('aaaaaa')).not.toBe('right');
  map.cleanup();
});

test('a snapshot that brings two tagged planes together lays the tags out again', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: apart });
  map.store.highlight(['aaaaaa', 'bbbbbb']);
  const before = map.tag('bbbbbb');

  map.store.applySnapshot({ at: 2, aircraft: close });

  expect(before).toBe('right');
  expect(map.tag('bbbbbb')).not.toBe('right');
  map.cleanup();
});

test('zooming out until two tagged planes meet lays the tags out again', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: apart });
  map.store.highlight(['aaaaaa', 'bbbbbb']);
  const before = map.tag('bbbbbb');

  for (let step = 0; step < 5; step++) {
    map.zoomOut();
  }

  expect(before).toBe('right');
  expect(map.tag('bbbbbb')).not.toBe('right');
  map.cleanup();
});

test('a tag that is no longer shown returns to the default side', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: close });
  map.store.highlight(['aaaaaa', 'bbbbbb']);

  map.store.clearHighlight();

  expect(map.tag('bbbbbb')).toBe('right');
  map.cleanup();
});
