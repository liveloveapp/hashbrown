// @vitest-environment jsdom
import { expect, onTestFinished, test } from 'vitest';
import {
  contains,
  exactContainerPoint,
  exactLayerPoint,
  intersects,
  rectAround,
  rectAt,
} from './pixels';

/** A real 400x300 Leaflet map at zoom 9 over Bend. */
async function leafletMap() {
  const module = await import('leaflet');
  const L =
    (module as unknown as { default?: typeof module }).default ?? module;
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { value: 400 });
  Object.defineProperty(element, 'clientHeight', { value: 300 });
  const map = L.map(element).setView([44.09, -121.2], 9);
  onTestFinished(() => {
    map.remove();
  });

  return map;
}

test('intersects keeps a gap when asked', () => {
  const a = { left: 0, top: 0, right: 10, bottom: 10 };
  const b = { left: 11, top: 0, right: 20, bottom: 10 };

  const results = [intersects(a, b), intersects(a, b, 2)];

  expect(results).toEqual([false, true]);
});

test('rectangles that only share an edge do not intersect', () => {
  const a = { left: 0, top: 0, right: 10, bottom: 10 };
  const b = { left: 10, top: 0, right: 20, bottom: 10 };

  const result = intersects(a, b);

  expect(result).toBe(false);
});

test('contains is true only when the inner rectangle lies wholly inside', () => {
  const outer = { left: 0, top: 0, right: 100, bottom: 50 };

  const results = [
    contains(outer, { left: 0, top: 0, right: 100, bottom: 50 }),
    contains(outer, { left: 10, top: 10, right: 20, bottom: 20 }),
    contains(outer, { left: 90, top: 10, right: 101, bottom: 20 }),
    contains(outer, { left: 10, top: -1, right: 20, bottom: 20 }),
  ];

  expect(results).toEqual([true, true, false, false]);
});

test('rectAt places a rectangle by its top-left corner', () => {
  const rect = rectAt(10, 20, 30, 40);

  expect(rect).toEqual({ left: 10, top: 20, right: 40, bottom: 60 });
});

test('rectAround centres a rectangle on a point, square by default', () => {
  const rects = [rectAround(50, 50, 20, 10), rectAround(50, 50, 22)];

  expect(rects).toEqual([
    { left: 40, top: 45, right: 60, bottom: 55 },
    { left: 39, top: 39, right: 61, bottom: 61 },
  ]);
});

test('exactLayerPoint keeps the fraction Leaflet rounds away', async () => {
  const map = await leafletMap();
  const position = { lat: 44.0912345, lon: -121.2012345 };

  const exact = exactLayerPoint(map, position);
  const rounded = map.latLngToLayerPoint([position.lat, position.lon]);

  expect(Math.round(exact.x)).toBe(rounded.x);
  expect(Math.round(exact.y)).toBe(rounded.y);
  expect(Number.isInteger(exact.x) && Number.isInteger(exact.y)).toBe(false);
});

test('exactContainerPoint is the exact layer point in container pixels', async () => {
  const map = await leafletMap();
  map.panBy([37, -12], { animate: false });
  const position = { lat: 44.0912345, lon: -121.2012345 };
  const rounded = map.latLngToContainerPoint([position.lat, position.lon]);

  const point = exactContainerPoint(map, position);

  expect(Math.abs(point.x - rounded.x)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(point.y - rounded.y)).toBeLessThanOrEqual(0.5);
});
