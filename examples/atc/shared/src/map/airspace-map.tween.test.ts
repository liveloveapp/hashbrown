// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import type { Aircraft } from '../aircraft';
import { AREAS } from '../places';
import { createAtcStore } from '../store';
import { createAirspaceMap } from './airspace-map';

const plane: Aircraft = {
  hex: 'aaaaaa',
  label: 'UAL100',
  callsign: 'UAL100',
  registration: null,
  typeCode: 'B738',
  category: null,
  kind: 'jet',
  lat: 44,
  lon: -121,
  altitudeFt: 30000,
  onGround: false,
  groundSpeedKt: 450,
  trackDeg: 90,
  verticalRateFpm: 0,
};

/**
 * Mounts a 400×300 map with a fake clock and a manual animation-frame queue.
 * Call `cleanup()` at the end of the test: it destroys the map and restores
 * the stubbed globals.
 */
async function mount() {
  let clock = 0;
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 1;
  vi.stubGlobal('performance', { now: () => clock });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(nextFrame, callback);
    return nextFrame++;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const store = createAtcStore();
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { value: 400 });
  Object.defineProperty(element, 'clientHeight', { value: 300 });
  const handle = await createAirspaceMap({ element, store, area: AREAS.pnw });
  const markerPosition = () => {
    const style = element.querySelector<HTMLElement>('.atc-plane-icon')?.style;

    return `${style?.left},${style?.top},${style?.transform}`;
  };
  const runFrames = (time: number) => {
    clock = time;
    const pending = [...frames];
    frames.clear();
    for (const [, callback] of pending) {
      callback(time);
    }
  };

  /** Where the first plane sits relative to the map's centre, in pixels. */
  const offsetFromCentre = () => {
    const icon = element.querySelector<HTMLElement>('.atc-plane-icon');
    const pane = element.querySelector<HTMLElement>('.leaflet-map-pane');
    const px = (value: string | undefined) => parseFloat(value ?? '0') || 0;

    return {
      x: px(icon?.style.left) + px(pane?.style.left) - 200,
      y: px(icon?.style.top) + px(pane?.style.top) - 150,
    };
  };

  return {
    store,
    handle,
    offsetFromCentre,
    cleanup: () => {
      handle.destroy();
      vi.unstubAllGlobals();
    },
    frames,
    markerPosition,
    planeElement: () => element.querySelector('.atc-plane'),
    runFrames,
    setClock: (time: number) => (clock = time),
  };
}

test('markers glide to a new snapshot over the gap since the previous one', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: [plane] });
  const start = map.markerPosition();
  map.setClock(3000);
  map.store.applySnapshot({
    at: 2,
    aircraft: [{ ...plane, lon: -120.9 }],
  });
  const atArrival = map.markerPosition();

  map.runFrames(4500);
  const halfway = map.markerPosition();
  map.runFrames(6000);
  const end = map.markerPosition();

  expect(atArrival).toBe(start);
  expect(halfway).not.toBe(start);
  expect(end).not.toBe(halfway);
  expect(map.frames.size).toBe(0);
  map.cleanup();
});

test('destroy cancels a running glide', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: [plane] });
  map.setClock(3000);
  map.store.applySnapshot({
    at: 2,
    aircraft: [{ ...plane, lon: -120.9 }],
  });

  map.handle.destroy();

  expect(map.frames.size).toBe(0);
  vi.unstubAllGlobals();
});

test('moves over 20 nm jump without animating', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: [plane] });
  const start = map.markerPosition();
  map.setClock(3000);

  map.store.applySnapshot({ at: 2, aircraft: [{ ...plane, lon: -118 }] });

  expect(map.markerPosition()).not.toBe(start);
  expect(map.frames.size).toBe(0);
  map.cleanup();
});

test('reduced motion makes markers jump', async () => {
  const map = await mount();
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
  }));
  map.store.applySnapshot({ at: 1, aircraft: [plane] });
  const start = map.markerPosition();
  map.setClock(3000);

  map.store.applySnapshot({ at: 2, aircraft: [{ ...plane, lon: -120.9 }] });

  expect(map.markerPosition()).not.toBe(start);
  expect(map.frames.size).toBe(0);
  map.cleanup();
});

test('the map keeps a followed plane centred while it glides', async () => {
  const map = await mount();
  const centred = { ...plane, lat: AREAS.pnw.lat, lon: AREAS.pnw.lon };
  map.store.applySnapshot({ at: 1, aircraft: [centred] });
  map.store.follow(centred.hex);
  map.setClock(3000);
  map.store.applySnapshot({
    at: 2,
    aircraft: [{ ...centred, lat: centred.lat + 0.15, lon: centred.lon + 0.2 }],
  });

  const offsets = [];
  for (let time = 3000; time <= 6000; time += 16) {
    map.runFrames(time);
    offsets.push(map.offsetFromCentre());
  }

  const worst = Math.max(...offsets.map((o) => Math.hypot(o.x, o.y)));
  expect(worst).toBeLessThan(1.5);
  expect(map.store.getState().followingHex).toBe(centred.hex);
  map.cleanup();
});

test('an altitude-only change updates the tag text in place without rebuilding the marker', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: [plane] });
  const first = map.planeElement();
  map.setClock(3000);

  map.store.applySnapshot({
    at: 2,
    aircraft: [{ ...plane, altitudeFt: 31000 }],
  });

  expect(map.planeElement()).toBe(first);
  expect(map.planeElement()?.querySelector('.atc-plane-tag')?.textContent).toBe(
    'UAL100 31,000',
  );
  map.cleanup();
});

test('a track-only change keeps the marker element and rotates it in place', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: [plane] });
  const first = map.planeElement();
  map.setClock(3000);

  map.store.applySnapshot({ at: 2, aircraft: [{ ...plane, trackDeg: 120 }] });

  expect(map.planeElement()).toBe(first);
  expect(
    map.planeElement()?.querySelector<HTMLElement>('.atc-plane-body')?.style
      .transform,
  ).toBe('rotate(120deg)');
  map.cleanup();
});

test('a class-only change keeps the marker element and toggles the class', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: [plane] });
  const first = map.planeElement();
  first?.classList.add('is-pulsing');

  map.store.select('aaaaaa');

  expect(map.planeElement()).toBe(first);
  expect(first?.classList.contains('is-selected')).toBe(true);
  expect(first?.classList.contains('is-pulsing')).toBe(true);
  map.store.select(null);
  expect(first?.classList.contains('is-selected')).toBe(false);
  map.cleanup();
});
