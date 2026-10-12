// @vitest-environment jsdom
import { expect, onTestFinished, test } from 'vitest';
import { AREAS } from '../places';
import { createAtcStore } from '../store';
import { testAircraft } from '../testing';
import { createAirspaceMap } from './airspace-map';
import { createFrameQueue, mapElement } from './testing';

const plane = testAircraft({
  lat: 44,
  lon: -121,
  altitudeFt: 30000,
  groundSpeedKt: 450,
});

/** Mounts a 400x300 map with a fake clock and a manual animation-frame queue. */
async function mount() {
  const queue = createFrameQueue();
  const store = createAtcStore();
  const element = mapElement();
  const handle = await createAirspaceMap({ element, store, area: AREAS.pnw });
  onTestFinished(() => {
    handle.destroy();
  });

  return {
    store,
    element,
    planeElement: () => element.querySelector('.atc-plane'),
    rotation: () =>
      element.querySelector<HTMLElement>('.atc-plane-body')?.style.transform,
    runFrames: queue.run,
    setClock: queue.setClock,
  };
}

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
  expect(map.planeElement()?.querySelector('.atc-plane-alt')?.textContent).toBe(
    ' 31,000',
  );
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
});

test('the map marks itself ready once the first snapshot is drawn', async () => {
  const map = await mount();
  const before = map.element.hasAttribute('data-ready');

  map.store.applySnapshot({ at: 1, aircraft: [plane] });

  expect(before).toBe(false);
  expect(map.element.hasAttribute('data-ready')).toBe(true);
});
