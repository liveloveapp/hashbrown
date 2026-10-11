// @vitest-environment jsdom
import * as module from 'leaflet';
import type { Map as LeafletMap } from 'leaflet';
import { expect, onTestFinished, test, vi } from 'vitest';
import type { Aircraft } from '../aircraft';
import type { AirspaceShelf, ChartAirport } from '../chart';
import { runwayCorners } from '../chart/runway-geometry';
import { AREAS } from '../places';
import { createAtcStore } from '../store';
import { createAirspaceMap } from './airspace-map';

const L = (module as unknown as { default?: typeof module }).default ?? module;

const end05 = { id: '05', lat: 44.2468, lon: -121.16 };
const end23 = { id: '23', lat: 44.2605, lon: -121.1405 };
const krdm: ChartAirport = {
  code: 'KRDM',
  faa: 'RDM',
  name: 'ROBERTS FLD',
  city: 'REDMOND',
  state: 'OR',
  aliases: [],
  lat: 44.2541,
  lon: -121.15,
  elevationFt: 3082,
  kind: 'airport',
  towered: true,
  towerPartTime: false,
  frequencies: { tower: '124.5', atis: null, ctaf: null, unicom: '122.95' },
  weather: null,
  lighting: 'full',
  fuel: true,
  military: false,
  runways: [
    {
      id: '05/23',
      lengthFt: 7038,
      widthFt: 150,
      surface: 'ASPH',
      hard: true,
      ends: [end05, end23],
      corners: runwayCorners(end05, end23, 150),
      bearingDeg: 50,
    },
  ],
  rank: 0,
};
const shelf: AirspaceShelf = {
  id: 'KPDX-C-0',
  airport: 'KPDX',
  name: 'PORTLAND CLASS C',
  class: 'C',
  type: 'C',
  floor: { ft: 0, ref: 'SFC' },
  ceiling: { ft: 4000, exclusive: false },
  partTime: false,
  rings: [
    [
      [-122.9, 45.4],
      [-122.3, 45.4],
      [-122.3, 45.8],
      [-122.9, 45.8],
      [-122.9, 45.4],
    ],
  ],
  bbox: [-122.9, 45.4, -122.3, 45.8],
};
const plane: Aircraft = {
  hex: 'aaaaaa',
  label: 'UAL100',
  callsign: 'UAL100',
  registration: null,
  typeCode: 'B738',
  category: null,
  kind: 'jet',
  lat: 47.4,
  lon: -122.3,
  altitudeFt: 5000,
  onGround: false,
  groundSpeedKt: 200,
  trackDeg: 90,
  verticalRateFpm: 0,
};

/**
 * Mounts a 400x300 map with reduced motion so moves are immediate, the FAA
 * chart loaded, surfaces requests left pending and a no-op canvas.
 */
async function mount() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
  }));
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => undefined)),
  );
  const context = new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, key) => (key in target ? target[key] : () => undefined),
    set: (target, key, value) => {
      target[key] = value;
      return true;
    },
  });
  const canvas = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => context as unknown as CanvasRenderingContext2D);
  const created = vi.spyOn(L, 'map');
  const store = createAtcStore();
  store.setChart({ cycle: '2610', effective: '2026-09-03', airports: [krdm] });
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { value: 400 });
  Object.defineProperty(element, 'clientHeight', { value: 300 });
  const handle = await createAirspaceMap({ element, store, area: AREAS.pnw });
  const map = created.mock.results[0]?.value as LeafletMap;
  onTestFinished(async () => {
    // Leaflet's canvas can leave a redraw frame queued past a synchronous
    // update; let it run before the renderer's context goes away.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    handle.destroy();
    created.mockRestore();
    canvas.mockRestore();
    vi.unstubAllGlobals();
  });

  store.setAirspace({
    cycle: '2610',
    effective: '2026-10-08',
    shelves: [shelf],
  });

  return { store, map };
}

test('showing airspace fits the map to the shelves bbox', async () => {
  const { store, map } = await mount();

  store.showAirspace('KPDX');

  const bounds = map.getBounds();
  expect(bounds.contains([45.4, -122.9])).toBe(true);
  expect(bounds.contains([45.8, -122.3])).toBe(true);
  expect(map.getZoom()).toBeLessThanOrEqual(12);
});

test('showing airspace with no shelves leaves the map alone', async () => {
  const { store, map } = await mount();
  const centre = map.getCenter();
  const zoom = map.getZoom();

  store.showAirspace('KXYZ');

  expect(map.getCenter()).toEqual(centre);
  expect(map.getZoom()).toBe(zoom);
});

test('while following a plane, showing airspace leaves the map alone', async () => {
  const { store, map } = await mount();
  store.applySnapshot({ at: 1, aircraft: [plane] });
  store.follow('aaaaaa');
  const centre = map.getCenter();
  const zoom = map.getZoom();

  store.showAirspace('KPDX');

  expect(map.getCenter()).toEqual(centre);
  expect(map.getZoom()).toBe(zoom);
});

test('the map marks overview zooms at 8 and below', async () => {
  const { map } = await mount();
  const element = map.getContainer();

  map.setZoom(8);
  const atEight = element.hasAttribute('data-zoom-overview');
  map.setZoom(9);
  const atNine = element.hasAttribute('data-zoom-overview');

  expect(atEight).toBe(true);
  expect(atNine).toBe(false);
});

test('the airspace layer draws shelves in the atc-airspace pane', async () => {
  const { map } = await mount();
  map.setView([45.6, -122.6], 9);

  const pane = map.getPane('atc-airspace');

  expect(pane?.querySelectorAll('path.atc-as.is-c')).toHaveLength(1);
});
