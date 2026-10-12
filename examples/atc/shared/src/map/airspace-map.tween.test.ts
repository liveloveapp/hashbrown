// @vitest-environment jsdom
import { expect, onTestFinished, test, vi } from 'vitest';
import { AREAS } from '../places';
import { createAtcStore } from '../store';
import { testAircraft } from '../testing';
import { createAirspaceMap } from './airspace-map';
import {
  createFrameQueue,
  destroyOnce,
  mapElement,
  REDUCED_MOTION,
  stubMedia,
} from './testing';

const plane = testAircraft({
  lat: 44,
  lon: -121,
  altitudeFt: 30000,
  groundSpeedKt: 450,
});

/**
 * Mounts a 400x300 map with a fake clock and a manual animation-frame queue.
 * The map is destroyed when the test finishes, unless the test already did.
 */
async function mount() {
  const queue = createFrameQueue();
  const store = createAtcStore();
  const element = mapElement();
  const handle = await createAirspaceMap({ element, store, area: AREAS.pnw });
  const destroy = destroyOnce(handle);
  onTestFinished(destroy);

  return {
    store,
    element,
    destroy,
    frames: queue.frames,
    markerPosition: () => {
      const style =
        element.querySelector<HTMLElement>('.atc-plane-icon')?.style;

      return `${style?.left},${style?.top},${style?.transform}`;
    },
    rotation: () =>
      element.querySelector<HTMLElement>('.atc-plane-body')?.style.transform,
    runFrames: queue.run,
    setClock: queue.setClock,
  };
}

test('markers dead-reckon along their track between snapshots, up to a cap', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: [plane] });
  const start = map.markerPosition();

  map.runFrames(5000);
  const moving = map.markerPosition();
  map.runFrames(31_000);
  const capped = map.markerPosition();
  map.runFrames(40_000);

  expect(moving).not.toBe(start);
  expect(capped).not.toBe(moving);
  expect(map.markerPosition()).toBe(capped);
  expect(map.frames.size).toBe(0);
});

test('a new snapshot eases from where the plane is drawn, without a jump', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: [plane] });
  map.runFrames(3000);
  const drawn = map.markerPosition();

  map.store.applySnapshot({ at: 2, aircraft: [{ ...plane, lon: -120.9 }] });
  const atArrival = map.markerPosition();
  map.runFrames(3500);

  expect(atArrival).toBe(drawn);
  expect(map.markerPosition()).not.toBe(drawn);
});

test('destroy cancels the running animation', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: [plane] });
  map.setClock(3000);
  map.store.applySnapshot({
    at: 2,
    aircraft: [{ ...plane, lon: -120.9 }],
  });

  map.destroy();

  expect(map.frames.size).toBe(0);
});

test('moves over 20 nm jump at once', async () => {
  const map = await mount();
  map.store.applySnapshot({
    at: 1,
    aircraft: [{ ...plane, groundSpeedKt: 0 }],
  });
  const start = map.markerPosition();
  map.setClock(3000);

  map.store.applySnapshot({
    at: 2,
    aircraft: [{ ...plane, groundSpeedKt: 0, lon: -118 }],
  });
  const jumped = map.markerPosition();
  map.runFrames(3016);

  expect(jumped).not.toBe(start);
  expect(map.markerPosition()).toBe(jumped);
});

test('reduced motion makes markers jump', async () => {
  const map = await mount();
  stubMedia(REDUCED_MOTION);
  map.store.applySnapshot({ at: 1, aircraft: [plane] });
  const start = map.markerPosition();
  map.setClock(3000);

  map.store.applySnapshot({ at: 2, aircraft: [{ ...plane, lon: -120.9 }] });

  expect(map.markerPosition()).not.toBe(start);
  expect(map.frames.size).toBe(0);
});

test('every frame draws each moving plane at its exact, unrounded position', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: [plane] });

  const positions = [1000, 1016, 1033, 1050].map((time) => {
    map.runFrames(time);
    return map.markerPosition();
  });

  expect(new Set(positions).size).toBe(4);
  expect(positions.some((position) => /\d\.\d/.test(position))).toBe(true);
});

test('reduced motion turns markers to their new track at once', async () => {
  const map = await mount();
  stubMedia(REDUCED_MOTION);
  map.store.applySnapshot({ at: 1, aircraft: [plane] });
  map.setClock(3000);

  map.store.applySnapshot({ at: 2, aircraft: [{ ...plane, trackDeg: 120 }] });

  expect(map.rotation()).toBe('rotate(120deg)');
});

test('a fix that lands between a frame starting and drawing does not freeze the planes', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: [plane] });
  for (let time = 16; time <= 2992; time += 16) {
    map.runFrames(time);
  }
  map.setClock(3010);

  map.store.applySnapshot({ at: 2, aircraft: [{ ...plane, lon: -120.99 }] });
  const atArrival = map.markerPosition();
  map.runFrames(3008);

  expect(map.markerPosition()).not.toBe(atArrival);
});

test('a fix that lands after seconds without frames (a hidden tab) starts from its own time', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: [plane] });
  for (let time = 16; time <= 2992; time += 16) {
    map.runFrames(time);
  }
  map.setClock(45_000);

  map.store.applySnapshot({ at: 2, aircraft: [{ ...plane, lon: -118 }] });
  map.runFrames(46_000);
  const oneSecondOn = map.markerPosition();
  map.runFrames(50_000);

  expect(map.markerPosition()).not.toBe(oneSecondOn);
  expect(map.frames.size).toBe(1);
});

test('frames reuse each plane body instead of querying the DOM again', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: [plane] });
  map.runFrames(16);
  const icon = map.element.querySelector<HTMLElement>('.atc-plane-icon');
  const query = vi.spyOn(icon as HTMLElement, 'querySelector');

  for (let time = 32; time <= 1000; time += 16) {
    map.runFrames(time);
  }

  expect(query).not.toHaveBeenCalled();
});
