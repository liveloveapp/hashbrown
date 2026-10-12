// @vitest-environment jsdom
import { expect, onTestFinished, test } from 'vitest';
import { AIRPORTS, AREAS } from '../places';
import { createAtcStore } from '../store';
import { testAircraft } from '../testing';
import { createAirspaceMap } from './airspace-map';
import { leafletModule, mapElement, stubMedia } from './testing';

const { KBDN } = AIRPORTS;
const plane = testAircraft({ lat: KBDN.lat, lon: KBDN.lon });

/**
 * Mounts a 400x300 map with motion on and Leaflet's zoom animation enabled,
 * which jsdom does not detect by itself. Leaflet then starts an animated zoom
 * on the next animation frame, as it does in a browser.
 */
async function mountAnimated() {
  stubMedia();
  const L = await leafletModule();
  const any3d = L.Browser.any3d;
  (L.Browser as { any3d: boolean }).any3d = true;
  const store = createAtcStore();
  const handle = await createAirspaceMap({
    element: mapElement(),
    store,
    area: AREAS.pnw,
  });
  onTestFinished(async () => {
    // Lets Leaflet's 250 ms zoom transition end before the map is removed.
    await new Promise((resolve) => setTimeout(resolve, 400));
    handle.destroy();
    (L.Browser as { any3d: boolean }).any3d = any3d;
  });

  return { store };
}

const frame = () => new Promise((resolve) => setTimeout(resolve, 50));

test("an animated area zoom does not cancel a newer request when Leaflet's zoomstart fires a frame later", async () => {
  const map = await mountAnimated();
  map.store.applySnapshot({ at: 1, aircraft: [plane] });
  map.store.showArea({ airport: 'KBDN', radiusNm: 10 });
  // A newer highlight whose plane has no marker yet, so it waits.
  map.store.highlight(['bbbbbb']);

  await frame();

  expect(map.store.getState().viewRequest?.kind).toBe('highlight');
});

test('a move that interrupts another keeps the guard until its own animation ends', async () => {
  const map = await mountAnimated();
  map.store.applySnapshot({ at: 1, aircraft: [plane] });
  map.store.showArea({ airport: 'KBDN', radiusNm: 10 });
  await frame();
  map.store.showArea({ airport: 'KSEA', radiusNm: 10 });
  map.store.highlight(['bbbbbb']);

  for (let i = 0; i < 8; i++) {
    await frame();
  }

  expect(map.store.getState().viewRequest?.kind).toBe('highlight');
});
