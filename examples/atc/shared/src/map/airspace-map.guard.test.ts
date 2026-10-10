// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import type { Aircraft } from '../aircraft';
import { AIRPORTS, AREAS } from '../places';
import { createAtcStore } from '../store';
import { createAirspaceMap } from './airspace-map';

const { KBDN } = AIRPORTS;
const plane: Aircraft = {
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

/**
 * Mounts a 400x300 map with motion on and Leaflet's zoom animation enabled,
 * which jsdom does not detect by itself. Leaflet then starts an animated zoom
 * on the next animation frame, as it does in a browser.
 */
async function mountAnimated() {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const module = await import('leaflet');
  const L =
    (module as unknown as { default?: typeof module }).default ?? module;
  const any3d = L.Browser.any3d;
  (L.Browser as { any3d: boolean }).any3d = true;
  const store = createAtcStore();
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { value: 400 });
  Object.defineProperty(element, 'clientHeight', { value: 300 });
  const handle = await createAirspaceMap({ element, store, area: AREAS.pnw });

  return {
    store,
    /** Lets Leaflet's 250 ms zoom transition end before the map is removed. */
    cleanup: async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      handle.destroy();
      (L.Browser as { any3d: boolean }).any3d = any3d;
      vi.unstubAllGlobals();
    },
  };
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
  await map.cleanup();
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
  await map.cleanup();
});
