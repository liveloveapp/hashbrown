import { expect, test } from 'vitest';
import { squareRing, testShelf } from './testing';

test('squareRing closes a square around a point', () => {
  const ring = squareRing(-121, 44, 0.5);

  expect(ring).toEqual([
    [-121.5, 43.5],
    [-120.5, 43.5],
    [-120.5, 44.5],
    [-121.5, 44.5],
    [-121.5, 43.5],
  ]);
});

test('testShelf bounds its outer ring unless a bbox is given', () => {
  const portland = testShelf();
  const redmond = testShelf({ rings: [squareRing(-121.15, 44.25, 0.15)] });
  const given = testShelf({ bbox: [0, 0, 1, 1] });

  expect(portland.bbox).toEqual([-122, 45, -121, 46]);
  expect(redmond.bbox.map((n) => n.toFixed(2))).toEqual([
    '-121.30',
    '44.10',
    '-121.00',
    '44.40',
  ]);
  expect(given.bbox).toEqual([0, 0, 1, 1]);
});
