// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { prefersReducedMotion } from '../dom';
import {
  createFrameQueue,
  destroyOnce,
  leafletModule,
  mapElement,
  planePixel,
  REDUCED_MOTION,
  stubCanvas,
  stubMedia,
} from './testing';

test('leafletModule returns the namespace, whichever way the import wraps it', async () => {
  const L = await leafletModule();

  expect(typeof L.map).toBe('function');
});

test('stubMedia matches only the queries it is given', () => {
  stubMedia(REDUCED_MOTION);

  const results = [prefersReducedMotion(), matchMedia('(hover: none)').matches];

  expect(results).toEqual([true, false]);
});

test('a frame queue runs frames only when asked, at its own clock', () => {
  const queue = createFrameQueue();
  const times: number[] = [];
  requestAnimationFrame((time) => times.push(time));
  const cancelled = requestAnimationFrame((time) => times.push(-time));
  cancelAnimationFrame(cancelled);

  queue.run(1000);

  expect(times).toEqual([1000]);
  expect(performance.now()).toBe(1000);
  expect(queue.frames.size).toBe(0);
});

test('settling a frame queue runs the frames that frames ask for', async () => {
  const queue = createFrameQueue();
  let ran = 0;
  requestAnimationFrame(() => requestAnimationFrame(() => ran++));

  await queue.settle();

  expect(ran).toBe(1);
});

test('mapElement reports its size as Leaflet reads it', () => {
  const element = mapElement(320, 200);

  const size = [element.clientWidth, element.clientHeight];

  expect(size).toEqual([320, 200]);
});

test('stubCanvas gives a context that ignores every call', () => {
  stubCanvas();

  const context = document.createElement('canvas').getContext('2d');

  expect(() => context?.fillRect(0, 0, 1, 1)).not.toThrow();
});

test("planePixel adds the map pane's pan to the icon's position", () => {
  const element = document.createElement('div');
  element.innerHTML =
    '<div class="leaflet-map-pane" style="left: 10px; top: -5px"><div class="atc-plane-icon" style="left: 100.5px; top: 50px"><div data-hex="aaaaaa"></div></div></div>';

  const point = planePixel(element, 'aaaaaa');

  expect(point).toEqual({ x: 110.5, y: 45 });
});

test('destroyOnce destroys the map the first time only', () => {
  let calls = 0;
  const destroy = destroyOnce({ destroy: () => calls++ });

  destroy();
  destroy();

  expect(calls).toBe(1);
});
