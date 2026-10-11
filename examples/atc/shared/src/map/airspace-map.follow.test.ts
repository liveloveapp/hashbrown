// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import type { Aircraft } from '../aircraft';
import { AREAS } from '../places';
import { createAtcStore } from '../store';
import { createAirspaceMap } from './airspace-map';

const plane: Aircraft = {
  hex: 'a1b2c3',
  label: 'UAL1802',
  callsign: 'UAL1802',
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

/** Mounts a 400x300 map with reduced motion and one followed-ready plane. */
async function mount() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
  }));
  const store = createAtcStore();
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { value: 400 });
  Object.defineProperty(element, 'clientHeight', { value: 300 });
  document.body.append(element);
  const handle = await createAirspaceMap({ element, store, area: AREAS.pnw });
  store.applySnapshot({ at: 1, aircraft: [plane] });
  const pill = () =>
    element.querySelector<HTMLElement>('[data-testid="follow-pill"]');
  return {
    store,
    pill,
    cleanup: () => {
      handle.destroy();
      element.remove();
      vi.unstubAllGlobals();
    },
  };
}

test('following shows a pill with the label and a Stop button that ends it', async () => {
  const map = await mount();

  map.store.follow('a1b2c3');
  const text = map.pill()?.textContent;
  map.pill()?.querySelector('button')?.click();

  expect(text).toBe('Following UAL1802Stop');
  expect(map.store.getState().followingHex).toBeNull();
  expect(map.pill()?.classList.contains('is-open')).toBe(false);
  map.cleanup();
});

/**
 * Mounts a 400x300 map in a phone workbench whose sheet covers it from
 * y = 180, with a fake clock and a manual frame queue. It starts under
 * reduced motion, following and selecting the plane so its card docks
 * (60 px tall); `motionOn` then turns motion on.
 */
async function mountPhone() {
  let clock = 0;
  let reduced = true;
  let cardHeight = 60;
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 1;
  vi.stubGlobal('performance', { now: () => clock });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(nextFrame, callback);
    return nextFrame++;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query === '(prefers-reduced-motion: reduce)',
  }));
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(
    function (this: HTMLElement) {
      return this.classList.contains('atc-detail') ? cardHeight : 0;
    },
  );
  const store = createAtcStore();
  const workbench = document.createElement('main');
  const panel = document.createElement('section');
  panel.getBoundingClientRect = () =>
    ({ left: 0, top: 180, right: 400, bottom: 300 }) as DOMRect;
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { value: 400 });
  Object.defineProperty(element, 'clientHeight', { value: 300 });
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
  store.applySnapshot({ at: 1, aircraft: [plane] });
  store.follow('a1b2c3');
  store.select('a1b2c3');
  const px = (value: string | undefined) => parseFloat(value ?? '0') || 0;

  return {
    store,
    element,
    /** The followed plane's y on the map, in pixels. */
    y: () => {
      const icon = element
        .querySelector('[data-hex="a1b2c3"]')
        ?.closest<HTMLElement>('.atc-plane-icon');
      const pane = element.querySelector<HTMLElement>('.leaflet-map-pane');
      return px(icon?.style.top) + px(pane?.style.top);
    },
    motionOn: () => (reduced = false),
    /** Animation frames waiting to run. */
    pendingFrames: () => frames.size,
    setCardHeight: (height: number) => (cardHeight = height),
    runFrames(time: number) {
      clock = time;
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) {
        callback(time);
      }
    },
    cleanup: () => {
      handle.destroy();
      workbench.remove();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    },
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
  map.cleanup();
});

test('following under reduced motion schedules no frame loop of its own', async () => {
  const map = await mountPhone();

  for (let time = 16; time <= 160; time += 16) {
    map.runFrames(time);
  }

  expect(map.pendingFrames()).toBe(0);
  map.cleanup();
});
