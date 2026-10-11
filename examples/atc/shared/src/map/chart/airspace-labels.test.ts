import { expect, test } from 'vitest';
import { type AirspaceShelf, pointInShelf } from '../../chart';
import {
  shelfLabel,
  shelfLabelAnchor,
  shelfLabelPoint,
} from './airspace-labels';

type Ring = (readonly [number, number])[];

/** A closed square ring around (lon, lat), `half` degrees each way. */
const square = (lon: number, lat: number, half: number): Ring => [
  [lon - half, lat - half],
  [lon + half, lat - half],
  [lon + half, lat + half],
  [lon - half, lat + half],
  [lon - half, lat - half],
];

const pdxC: AirspaceShelf = {
  id: 'KPDX-C-1',
  airport: 'KPDX',
  name: 'PORTLAND CLASS C',
  class: 'C',
  type: 'C',
  floor: { ft: 1100, ref: 'MSL' },
  ceiling: { ft: 4000, exclusive: false },
  partTime: false,
  rings: [square(-122.6, 45.59, 0.1)],
  bbox: [-122.7, 45.49, -122.5, 45.69],
};

test('a Class C shelf from 1,100 to 4,000 ft stacks 40 over 11', () => {
  const shelf = pdxC;

  const label = shelfLabel(shelf);

  expect(label).toEqual({ kind: 'stack', top: '40', bottom: '11' });
});

test('a surface floor reads SFC', () => {
  const shelf: AirspaceShelf = { ...pdxC, floor: { ft: 0, ref: 'SFC' } };

  const label = shelfLabel(shelf);

  expect(label).toEqual({ kind: 'stack', top: '40', bottom: 'SFC' });
});

test('a Class B shelf rounds to hundreds', () => {
  const shelf: AirspaceShelf = {
    ...pdxC,
    class: 'B',
    type: 'B',
    floor: { ft: 3049, ref: 'MSL' },
    ceiling: { ft: 10000, exclusive: false },
  };

  const label = shelfLabel(shelf);

  expect(label).toEqual({ kind: 'stack', top: '100', bottom: '30' });
});

test('a B or C shelf with no ceiling has no label', () => {
  const shelf: AirspaceShelf = { ...pdxC, ceiling: null };

  const label = shelfLabel(shelf);

  expect(label).toBeNull();
});

test('a Class D shelf up to 5,600 ft is a 56 box', () => {
  const shelf: AirspaceShelf = {
    ...pdxC,
    class: 'D',
    type: 'D',
    floor: { ft: 0, ref: 'SFC' },
    ceiling: { ft: 5600, exclusive: true },
  };

  const label = shelfLabel(shelf);

  expect(label).toEqual({ kind: 'box', text: '56' });
});

test('a Class E surface area has no label', () => {
  const shelf: AirspaceShelf = { ...pdxC, class: 'E', type: 'E2' };

  const label = shelfLabel(shelf);

  expect(label).toBeNull();
});

test('a convex shelf is labelled at its bbox centre', () => {
  const shelf = pdxC;

  const point = shelfLabelPoint(shelf);

  expect(point.lon).toBeCloseTo(-122.6, 9);
  expect(point.lat).toBeCloseTo(45.59, 9);
});

test('a donut-shaped shelf is labelled on the ring, not in the hole', () => {
  const shelf: AirspaceShelf = {
    ...pdxC,
    rings: [square(-122.6, 45.59, 0.2), square(-122.6, 45.59, 0.1)],
    bbox: [-122.8, 45.39, -122.4, 45.79],
  };

  const point = shelfLabelPoint(shelf);

  expect(pointInShelf(shelf, point)).toBe(true);
});

test('an L-shaped shelf whose centre and vertex average fall outside is labelled inside', () => {
  const shelf: AirspaceShelf = {
    ...pdxC,
    rings: [
      [
        [0, 0],
        [10, 0],
        [10, 2],
        [2, 2],
        [2, 10],
        [0, 10],
        [0, 0],
      ],
    ],
    bbox: [0, 0, 10, 10],
  };

  const point = shelfLabelPoint(shelf);

  expect(pointInShelf(shelf, point)).toBe(true);
});

test('a shelf with no rings falls back to its bbox centre', () => {
  const shelf: AirspaceShelf = { ...pdxC, rings: [] };

  const point = shelfLabelPoint(shelf);

  expect(point.lon).toBeCloseTo(-122.6, 9);
  expect(point.lat).toBeCloseTo(45.59, 9);
});

test('a label at the bbox centre moves halfway to the south edge', () => {
  const shelf = pdxC;

  const anchor = shelfLabelAnchor(shelf);

  expect(anchor.lon).toBeCloseTo(-122.6, 9);
  expect(anchor.lat).toBeCloseTo(45.54, 9);
});

test('a label off the bbox centre stays at its label point', () => {
  const shelf: AirspaceShelf = {
    ...pdxC,
    rings: [square(-122.6, 45.59, 0.2), square(-122.6, 45.59, 0.1)],
    bbox: [-122.8, 45.39, -122.4, 45.79],
  };

  const anchor = shelfLabelAnchor(shelf);

  expect(anchor).toEqual(shelfLabelPoint(shelf));
});
