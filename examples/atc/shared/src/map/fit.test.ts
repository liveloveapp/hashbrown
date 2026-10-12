import { expect, test } from 'vitest';
import { circleBounds, fitTarget } from './fit';

const positions = new Map([
  ['a', { lat: 47, lon: -122 }],
  ['b', { lat: 47.5, lon: -121 }],
  ['c', { lat: 46, lon: -123 }],
]);

test('several planes fit their bounds', () => {
  const highlighted = new Set(['a', 'b']);

  const target = fitTarget(highlighted, positions);

  expect(target).toEqual({
    kind: 'bounds',
    south: 47,
    west: -122,
    north: 47.5,
    east: -121,
  });
});

test('a single plane targets a point at zoom 9', () => {
  const target = fitTarget(new Set(['c']), positions);

  expect(target).toEqual({ kind: 'point', lat: 46, lon: -123, zoom: 9 });
});

test('a cleared set does not move the map', () => {
  const cleared = fitTarget(new Set(), positions);

  expect(cleared).toBeNull();
});

test('hexes without a known position are ignored, and none known gives null', () => {
  const partial = fitTarget(new Set(['a', 'zz']), positions);
  const unknown = fitTarget(new Set(['zz']), positions);

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
