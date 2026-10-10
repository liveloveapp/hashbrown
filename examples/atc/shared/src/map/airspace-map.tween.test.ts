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
    element,
    handle,
    offsetFromCentre,
    cleanup: () => {
      handle.destroy();
      vi.unstubAllGlobals();
    },
    frames,
    markerPosition,
    planeElement: () => element.querySelector('.atc-plane'),
    rotation: () =>
      element.querySelector<HTMLElement>('.atc-plane-body')?.style.transform,
    runFrames,
    setClock: (time: number) => (clock = time),
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
  map.cleanup();
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
  map.cleanup();
});

test('destroy cancels the running animation', async () => {
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

test('the map keeps a followed plane centred while it moves', async () => {
  const map = await mount();
  const { view } = AREAS.pnw;
  const centred = { ...plane, lat: view.lat, lon: view.lon };
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
  const atArrival = map.rotation();
  map.runFrames(3500);
  const turning = map.rotation();
  map.runFrames(4000);

  expect(map.planeElement()).toBe(first);
  expect(atArrival).toBe('rotate(90deg)');
  expect(turning).toMatch(/^rotate\((9\d|1[01]\d)(\.\d+)?deg\)$/);
  expect(map.rotation()).toBe('rotate(120deg)');
  map.cleanup();
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
  map.cleanup();
});

test('reduced motion turns markers to their new track at once', async () => {
  const map = await mount();
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
  }));
  map.store.applySnapshot({ at: 1, aircraft: [plane] });
  map.setClock(3000);

  map.store.applySnapshot({ at: 2, aircraft: [{ ...plane, trackDeg: 120 }] });

  expect(map.rotation()).toBe('rotate(120deg)');
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
  map.cleanup();
});

test('the map marks itself ready once the first snapshot is drawn', async () => {
  const map = await mount();
  const before = map.element.hasAttribute('data-ready');

  map.store.applySnapshot({ at: 1, aircraft: [plane] });

  expect(before).toBe(false);
  expect(map.element.hasAttribute('data-ready')).toBe(true);
  map.cleanup();
});
