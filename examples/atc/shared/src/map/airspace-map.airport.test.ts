// @vitest-environment jsdom
import type { Map as LeafletMap } from 'leaflet';
import { expect, onTestFinished, test, vi } from 'vitest';
import { runwayCorners } from '../chart/runway-geometry';
import { AREAS } from '../places';
import { createAtcStore } from '../store';
import { testAircraft, testChartAirport } from '../testing';
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

  return { store, map };
}

test('showing an airport centres it at diagram zoom', async () => {
  const { store, map } = await mount();

  store.showAirport('KRDM');

  const centre = map.getCenter();
  expect(Math.abs(centre.lat - krdm.lat)).toBeLessThan(0.05);
  expect(Math.abs(centre.lng - krdm.lon)).toBeLessThan(0.05);
  expect(map.getZoom()).toBeGreaterThanOrEqual(13);
});

test('while following a plane, showing an airport leaves the map alone', async () => {
  const { store, map } = await mount();
  store.applySnapshot({ at: 1, aircraft: [plane] });
  store.follow('aaaaaa');
  const centre = map.getCenter();
  const zoom = map.getZoom();

  store.showAirport('KRDM');

  expect(map.getCenter()).toEqual(centre);
  expect(map.getZoom()).toBe(zoom);
});
