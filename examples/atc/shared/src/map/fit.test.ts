import { expect, test } from 'vitest';
import { circleBounds, fitTarget } from './fit';

const positions = new Map([
  ['a', { lat: 47, lon: -122 }],
  ['b', { lat: 47.5, lon: -121 }],
  ['c', { lat: 46, lon: -123 }],
]);

test('a new set of several planes fits their bounds', () => {
  const previous = new Set<string>();

  const target = fitTarget(previous, new Set(['a', 'b']), positions, false);

  expect(target).toEqual({
    kind: 'bounds',
    south: 47,
    west: -122,
    north: 47.5,
    east: -121,
  });
});

test('a single plane targets a point at zoom 9', () => {
  const target = fitTarget(new Set(), new Set(['c']), positions, false);

  expect(target).toEqual({ kind: 'point', lat: 46, lon: -123, zoom: 9 });
});

test('an unchanged set, a cleared set and a followed plane do not move the map', () => {
  const same = fitTarget(new Set(['a']), new Set(['a']), positions, false);
  const cleared = fitTarget(new Set(['a']), new Set(), positions, false);
  const following = fitTarget(new Set(), new Set(['a']), positions, true);

  expect([same, cleared, following]).toEqual([null, null, null]);
});

test('hexes without a known position are ignored, and none known gives null', () => {
  const partial = fitTarget(new Set(), new Set(['a', 'zz']), positions, false);
  const unknown = fitTarget(new Set(), new Set(['zz']), positions, false);

  expect(partial).toEqual({ kind: 'point', lat: 47, lon: -122, zoom: 9 });
  expect(unknown).toBeNull();
});

test('circleBounds spans the radius north, south, east and west', () => {
  const bounds = circleBounds({ lat: 60, lon: -120 }, 30);

  expect(bounds.south).toBeCloseTo(59.5, 6);
  expect(bounds.north).toBeCloseTo(60.5, 6);
  // At 60 degrees north a degree of longitude is half as long.
  expect(bounds.west).toBeCloseTo(-121, 6);
  expect(bounds.east).toBeCloseTo(-119, 6);
});
