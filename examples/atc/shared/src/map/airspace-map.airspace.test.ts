// @vitest-environment jsdom
import type { Map as LeafletMap } from 'leaflet';
import { expect, onTestFinished, test, vi } from 'vitest';
import { runwayCorners } from '../chart/runway-geometry';
import { AREAS } from '../places';
import { createAtcStore } from '../store';
import { testAircraft, testChartAirport, testShelf } from '../testing';
import { createAirspaceMap } from './airspace-map';
import {
  leafletModule,
  mapElement,
  REDUCED_MOTION,
  stubCanvas,
  stubMedia,
} from './testing';

const end05 = { id: '05', lat: 44.2468, lon: -121.16 };
const end23 = { id: '23', lat: 44.2605, lon: -121.1405 };
const krdm = testChartAirport({
  lat: 44.2541,
  runways: [
    {
      ...testChartAirport().runways[0],
      ends: [end05, end23],
      corners: runwayCorners(end05, end23, 150),
      bearingDeg: 50,
    },
  ],
});
const shelf = testShelf({
  floor: { ft: 0, ref: 'SFC' },
  rings: [
    [
      [-122.9, 45.4],
      [-122.3, 45.4],
      [-122.3, 45.8],
      [-122.9, 45.8],
      [-122.9, 45.4],
    ],
  ],
});
const plane = testAircraft();

/**
 * Mounts a 400x300 map with reduced motion so moves are immediate, the FAA
 * chart loaded, surfaces requests left pending and a no-op canvas.
 */
async function mount() {
  stubMedia(REDUCED_MOTION);
  stubCanvas();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => undefined)),
  );
  const created = vi.spyOn(await leafletModule(), 'map');
  const store = createAtcStore();
  store.setChart({ cycle: '2610', effective: '2026-09-03', airports: [krdm] });
  const handle = await createAirspaceMap({
    element: mapElement(),
    store,
    area: AREAS.pnw,
  });
  const map = created.mock.results[0]?.value as LeafletMap;
  onTestFinished(async () => {
    // Leaflet's canvas can leave a redraw frame queued past a synchronous
    // update; let it run before the renderer's context goes away.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    handle.destroy();
    created.mockRestore();
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
