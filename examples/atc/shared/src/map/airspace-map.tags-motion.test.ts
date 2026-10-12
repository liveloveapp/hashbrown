// @vitest-environment jsdom
import { expect, onTestFinished, test, vi } from 'vitest';
import type { Aircraft } from '../aircraft';
import { AIRPORTS, AREAS } from '../places';
import { createAtcStore } from '../store';
import { testAircraft } from '../testing';
import { createAirspaceMap } from './airspace-map';
import { createFrameQueue, destroyOnce, mapElement } from './testing';

const { KBDN } = AIRPORTS;
const base = testAircraft({ lat: KBDN.lat, lon: KBDN.lon, groundSpeedKt: 0 });
/**
 * Showing 25 nm around Bend on the 400x300 map zooms to 8, where 0.3
 * degrees of latitude is about 76 px: far enough apart for both tags.
 */
const farB: Aircraft = {
  ...base,
  hex: 'bbbbbb',
  label: 'ASA2',
  lat: KBDN.lat + 0.3,
};
const onA: Aircraft = { ...farB, lat: KBDN.lat + 0.001 };

/** A ResizeObserver stand-in whose callbacks the tests run by hand. */
class FakeResizeObserver {
  static all: FakeResizeObserver[] = [];
  readonly targets: Element[] = [];
  constructor(readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.all.push(this);
  }
  observe(target: Element) {
    this.targets.push(target);
  }
  disconnect() {
    this.targets.length = 0;
  }
  unobserve() {
    // Not used.
  }
  /** Runs the callback of every observer watching a matching element. */
  static fire(matches: (target: Element) => boolean) {
    for (const observer of FakeResizeObserver.all) {
      if (observer.targets.some(matches)) {
        observer.callback([], observer as unknown as ResizeObserver);
      }
    }
  }
}

/**
 * Mounts a 400x300 map with motion on (no reduced-motion query), a fake
 * clock, a manual animation-frame queue, fake timers for the tag fades and
 * a hand-run ResizeObserver; shows 25 nm around Bend and highlights the
 * two planes, `base` first.
 */
async function mount() {
  const queue = createFrameQueue();
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
  });
  FakeResizeObserver.all = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  const store = createAtcStore();
  const element = mapElement();
  document.body.append(element);
  const handle = await createAirspaceMap({ element, store, area: AREAS.pnw });
  const destroy = destroyOnce(handle);
  onTestFinished(() => {
    destroy();
    element.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  store.showArea({ airport: 'KBDN', radiusNm: 25 });
  store.applySnapshot({ at: 1, aircraft: [base, farB] });
  store.highlight(['aaaaaa', 'bbbbbb']);
  const plane = (hex: string) =>
    element.querySelector<HTMLElement>(`.atc-plane[data-hex="${hex}"]`);

  return {
    store,
    element,
    plane,
    tag: (hex: string) => plane(hex)?.getAttribute('data-tag') ?? 'right',
    fading: (hex: string) =>
      plane(hex)?.classList.contains('is-tag-fading') ?? false,
    mouse: (hex: string, type: 'mouseover' | 'mouseout') =>
      plane(hex)
        ?.closest('.atc-plane-icon')
        ?.dispatchEvent(new MouseEvent(type, { bubbles: true })),
    /** Runs the queued animation frames at `time`. */
    runFrames: queue.run,
    /** Moves `b` onto `base` at the current clock and lets it ease there. */
    bringTogether(time = 1000) {
      store.applySnapshot({ at: 2, aircraft: [base, onA] });
      queue.run(time);
    },
    destroy,
  };
}

test('a tag changing sides fades out for 150 ms, then moves and fades back in', async () => {
  const map = await mount();
  const before = map.tag('bbbbbb');

  map.bringTogether();
  const fadingAt0 = [map.fading('bbbbbb'), map.tag('bbbbbb')];
  vi.advanceTimersByTime(149);
  const fadingAt149 = map.fading('bbbbbb');
  vi.advanceTimersByTime(1);

  expect(before).toBe('right');
  expect(fadingAt0).toEqual([true, 'right']);
  expect(fadingAt149).toBe(true);
  expect(map.fading('bbbbbb')).toBe(false);
  expect(map.tag('bbbbbb')).not.toBe('right');
});

test('a fade in progress retargets when its side is taken before it lands', async () => {
  const map = await mount();
  map.bringTogether();
  const control = map.element.querySelector<HTMLElement>(
    '.leaflet-bottom.leaflet-right .leaflet-control',
  );
  // A control now covers everything left of the planes: no tag goes left.
  if (control) {
    control.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 185, bottom: 300 }) as DOMRect;
  }

  FakeResizeObserver.fire((target) => target === map.element);
  vi.advanceTimersByTime(150);

  expect(map.tag('bbbbbb')).toMatch(/^(above|below)-right$/);
  expect(map.fading('bbbbbb')).toBe(false);
});

test('a tag no longer shown mid-fade is reset at once, and its fade never lands', async () => {
  const map = await mount();
  map.bringTogether();

  map.store.clearHighlight();
  const reset = [map.fading('bbbbbb'), map.tag('bbbbbb')];
  vi.advanceTimersByTime(500);

  expect(reset).toEqual([false, 'right']);
  expect(map.tag('bbbbbb')).toBe('right');
});

test('while planes move, tags are laid out again every 500 ms, not every frame', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 2, aircraft: [base, onA] });

  // By 450 ms b has eased to within 13 px of base: the tags overlap.
  map.runFrames(300);
  map.runFrames(450);
  const at450 = map.fading('bbbbbb') || map.tag('bbbbbb') !== 'right';
  map.runFrames(500);

  expect(at450).toBe(false);
  expect(map.fading('bbbbbb')).toBe(true);
});

test('hovering a plane lays tags out at once: its card replaces its tag, and leaving brings the tag back', async () => {
  const map = await mount();
  map.bringTogether();
  vi.advanceTimersByTime(150);
  const moved = map.tag('bbbbbb');

  map.mouse('bbbbbb', 'mouseover');
  const hovered = [
    map.plane('bbbbbb')?.classList.contains('is-detailed'),
    map.tag('bbbbbb'),
  ];
  map.mouse('bbbbbb', 'mouseout');

  expect(moved).not.toBe('right');
  expect(hovered).toEqual([true, 'right']);
  expect(map.tag('bbbbbb')).toBe(moved);
});

test('a resize lays tags out again around the map controls', async () => {
  const map = await mount();
  const corner = map.element.querySelector<HTMLElement>(
    '.leaflet-bottom.leaflet-right .leaflet-control',
  );
  // The control now covers the right of the map's middle, where the first plane's tag is.
  if (corner) {
    corner.getBoundingClientRect = () =>
      ({ left: 150, top: 0, right: 400, bottom: 300 }) as DOMRect;
  }

  FakeResizeObserver.fire((target) => target === map.element);
  vi.advanceTimersByTime(150);

  expect(map.tag('aaaaaa')).not.toBe('right');
});

test('a map control growing (the Layers panel opening) is measured again', async () => {
  const map = await mount();
  const control = map.element.querySelector<HTMLElement>(
    '.leaflet-bottom.leaflet-right .leaflet-control',
  );
  if (control) {
    control.getBoundingClientRect = () =>
      ({ left: 150, top: 0, right: 400, bottom: 300 }) as DOMRect;
  }

  FakeResizeObserver.fire((target) =>
    target.classList.contains('leaflet-right'),
  );
  vi.advanceTimersByTime(150);

  expect(map.tag('aaaaaa')).not.toBe('right');
});

test('destroying the map mid-fade cancels the fade', async () => {
  const map = await mount();
  map.bringTogether();
  const plane = map.plane('bbbbbb');
  const fading = plane?.classList.contains('is-tag-fading');

  map.destroy();
  vi.advanceTimersByTime(500);

  // The fade's timer would have moved the tag and dropped the class.
  expect(fading).toBe(true);
  expect(plane?.classList.contains('is-tag-fading')).toBe(true);
  expect(plane?.getAttribute('data-tag')).toBeNull();
});
