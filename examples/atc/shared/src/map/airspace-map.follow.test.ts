// @vitest-environment jsdom
import { expect, onTestFinished, test, vi } from 'vitest';
import { AREAS } from '../places';
import { createAtcStore } from '../store';
import { testAircraft } from '../testing';
import { createAirspaceMap } from './airspace-map';
import {
  createFrameQueue,
  mapElement,
  planePixel,
  REDUCED_MOTION,
  stubMedia,
} from './testing';

const plane = testAircraft({
  hex: 'a1b2c3',
  label: 'UAL1802',
  callsign: 'UAL1802',
  lat: 44,
  lon: -121,
  altitudeFt: 30000,
  groundSpeedKt: 450,
});

/** Mounts a 400x300 map with reduced motion and one followed-ready plane. */
async function mount() {
  stubMedia(REDUCED_MOTION);
  const store = createAtcStore();
  const element = mapElement();
  document.body.append(element);
  const handle = await createAirspaceMap({ element, store, area: AREAS.pnw });
  onTestFinished(() => {
    handle.destroy();
    element.remove();
  });
  store.applySnapshot({ at: 1, aircraft: [plane] });
  const pill = () =>
    element.querySelector<HTMLElement>('[data-testid="follow-pill"]');
  return { store, pill };
}

test('following shows a pill with the label and a Stop button that ends it', async () => {
  const map = await mount();

  map.store.follow('a1b2c3');
  const text = map.pill()?.textContent;
  map.pill()?.querySelector('button')?.click();

  expect(text).toBe('Following UAL1802Stop');
  expect(map.store.getState().followingHex).toBeNull();
  expect(map.pill()?.classList.contains('is-open')).toBe(false);
});

/**
 * Mounts a 400x300 map in a phone workbench whose sheet covers it from
 * y = 180, with a fake clock and a manual frame queue. It starts under
 * reduced motion, following and selecting the plane so its card docks
 * (60 px tall); `motionOn` then turns motion on.
 */
async function mountPhone() {
  let cardHeight = 60;
  const queue = createFrameQueue();
  stubMedia(REDUCED_MOTION);
  const offsetHeight = vi
    .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
    .mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('atc-detail') ? cardHeight : 0;
    });
  const store = createAtcStore();
  const workbench = document.createElement('main');
  const panel = document.createElement('section');
  panel.getBoundingClientRect = () =>
    ({ left: 0, top: 180, right: 400, bottom: 300 }) as DOMRect;
  const element = mapElement();
  element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 400, bottom: 300 }) as DOMRect;
  workbench.append(panel, element);
  document.body.append(workbench);
  const handle = await createAirspaceMap({
    element,
    store,
    area: AREAS.pnw,
    obstruction: () => panel,
  });
  onTestFinished(() => {
    handle.destroy();
    workbench.remove();
    offsetHeight.mockRestore();
  });
  store.applySnapshot({ at: 1, aircraft: [plane] });
  store.follow('a1b2c3');
  store.select('a1b2c3');

  return {
    store,
    element,
    /** The followed plane's y on the map, in pixels. */
    y: () => planePixel(element, 'a1b2c3').y,
    motionOn: () => stubMedia(),
    /** Animation frames waiting to run. */
    pendingFrames: () => queue.frames.size,
    setCardHeight: (height: number) => (cardHeight = height),
    runFrames: queue.run,
  };
}

test('when the docked card grows while following, the plane eases to the new middle of the band', async () => {
  const map = await mountPhone();
  map.runFrames(16);
  const before = map.y();
  map.motionOn();
  // A fix with motion on starts the frame loop; the plane flies on.
  map.store.applySnapshot({ at: 2, aircraft: [plane] });
  map.runFrames(24);
  map.setCardHeight(120);

  map.element.querySelector<HTMLElement>('.atc-detail-more')?.click();
  map.runFrames(32);
  const nextFrame = map.y();
  for (let time = 48; time <= 400; time += 16) {
    map.runFrames(time);
  }

  // The band was 76 to 180 px; with the taller card it is 136 to 180 px.
  expect(Math.abs(before - (76 + 180) / 2)).toBeLessThan(2);
  expect(nextFrame - before).toBeLessThan(10);
  expect(Math.abs(map.y() - (136 + 180) / 2)).toBeLessThan(2);
});

test('following under reduced motion schedules no frame loop of its own', async () => {
  const map = await mountPhone();

  for (let time = 16; time <= 160; time += 16) {
    map.runFrames(time);
  }

  expect(map.pendingFrames()).toBe(0);
});

/** Mounts a 400x300 map with motion on, a fake clock and a manual frame queue. */
async function mountMoving() {
  const queue = createFrameQueue();
  const store = createAtcStore();
  const element = mapElement();
  const handle = await createAirspaceMap({ element, store, area: AREAS.pnw });
  onTestFinished(() => {
    handle.destroy();
  });

  return {
    store,
    /** Where the plane sits relative to the map's centre, in pixels. */
    offsetFromCentre: () => {
      const { x, y } = planePixel(element, plane.hex);

      return { x: x - 200, y: y - 150 };
    },
    runFrames: queue.run,
    setClock: queue.setClock,
  };
}

test('the map keeps a followed plane centred while it moves', async () => {
  const map = await mountMoving();
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
});
