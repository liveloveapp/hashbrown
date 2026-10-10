// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import type { Aircraft } from '../aircraft';
import { AREAS } from '../places';
import { createAtcStore } from '../store';
import { createAirspaceMap } from './airspace-map';

const plane: Aircraft = {
  hex: 'aaaaaa',
  callsign: 'UAL100',
  typeCode: 'B738',
  lat: 44,
  lon: -121,
  altitudeFt: 30000,
  onGround: false,
  groundSpeedKt: 450,
  trackDeg: 90,
  verticalRateFpm: 0,
};

afterEach(() => vi.unstubAllGlobals());

/** Mounts a map with a fake clock and a manual animation-frame queue. */
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

  return {
    store,
    handle,
    frames,
    markerPosition,
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
  map.handle.destroy();
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
});

test('moves over 20 nm jump without animating', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: [plane] });
  const start = map.markerPosition();
  map.setClock(3000);

  map.store.applySnapshot({ at: 2, aircraft: [{ ...plane, lon: -118 }] });

  expect(map.markerPosition()).not.toBe(start);
  expect(map.frames.size).toBe(0);
  map.handle.destroy();
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
  map.handle.destroy();
});
