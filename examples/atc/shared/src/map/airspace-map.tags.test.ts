// @vitest-environment jsdom
import { expect, onTestFinished, test } from 'vitest';
import type { Aircraft } from '../aircraft';
import { AREAS } from '../places';
import { createAtcStore } from '../store';
import { testAircraft } from '../testing';
import { createAirspaceMap } from './airspace-map';
import { mapElement, REDUCED_MOTION, stubMedia } from './testing';

const base = testAircraft({
  lat: AREAS.pnw.lat,
  lon: AREAS.pnw.lon,
  groundSpeedKt: 0,
});
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
  stubMedia(REDUCED_MOTION);
  const store = createAtcStore();
  const element = mapElement();
  document.body.append(element);
  const handle = await createAirspaceMap({
    element,
    store,
    area: { ...AREAS.pnw, view: { ...AREAS.pnw.view, zoom: 6 } },
  });
  onTestFinished(() => {
    handle.destroy();
    element.remove();
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
  };
}

test('highlighting two planes drawn on top of each other moves the second tag aside', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: close });

  map.store.highlight(['aaaaaa', 'bbbbbb']);

  expect(map.tag('aaaaaa')).toBe('right');
  expect(map.tag('bbbbbb')).not.toBe('right');
  expect(map.tag('bbbbbb')).not.toBe('hidden');
});

test('the highlight order decides which tag keeps the right side', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: close });

  map.store.highlight(['bbbbbb', 'aaaaaa']);

  expect(map.tag('bbbbbb')).toBe('right');
  expect(map.tag('aaaaaa')).not.toBe('right');
});

test('a snapshot that brings two tagged planes together lays the tags out again', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: apart });
  map.store.highlight(['aaaaaa', 'bbbbbb']);
  const before = map.tag('bbbbbb');

  map.store.applySnapshot({ at: 2, aircraft: close });

  expect(before).toBe('right');
  expect(map.tag('bbbbbb')).not.toBe('right');
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
});

test('a tag that is no longer shown returns to the default side', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: close });
  map.store.highlight(['aaaaaa', 'bbbbbb']);

  map.store.clearHighlight();

  expect(map.tag('bbbbbb')).toBe('right');
});

test('planes with a visible tag are marked is-tagged, so they stack above untagged planes', async () => {
  const map = await mount();
  const crowd = Array.from({ length: 8 }, (_, i) => ({
    ...base,
    hex: `c0000${i}`,
    label: `QXE${i}`,
    lat: base.lat + i * 0.0002,
  }));
  map.store.applySnapshot({ at: 1, aircraft: [...crowd, apart[1]] });

  map.store.highlight(crowd.map((plane) => plane.hex));
  const tagged = (hex: string) =>
    document
      .querySelector(`.atc-plane[data-hex="${hex}"]`)
      ?.classList.contains('is-tagged');
  const states = crowd.map((plane) => [map.tag(plane.hex), tagged(plane.hex)]);
  const untagged = tagged('bbbbbb');
  map.store.clearHighlight();

  expect(states.every(([tag, on]) => (tag === 'hidden') === !on)).toBe(true);
  expect(states.some(([tag]) => tag === 'hidden')).toBe(true);
  expect(untagged).toBe(false);
  expect(tagged('c00000')).toBe(false);
});
