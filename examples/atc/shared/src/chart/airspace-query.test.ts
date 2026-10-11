import { expect, test } from 'vitest';
import {
  airspaceOf,
  altitudeMslFt,
  CLASS_A_FLOOR_FT,
  inShelfVertically,
  pointInShelf,
  shelvesAt,
} from './airspace-query';
import type { AirspaceShelf } from './types';

const square = [
  [-122, 45],
  [-121, 45],
  [-121, 46],
  [-122, 46],
  [-122, 45],
] as const;
const hole = [
  [-121.6, 45.4],
  [-121.4, 45.4],
  [-121.4, 45.6],
  [-121.6, 45.6],
  [-121.6, 45.4],
] as const;

function shelf(overrides: Partial<AirspaceShelf> = {}): AirspaceShelf {
  return {
    id: 'KPDX-C-0',
    airport: 'KPDX',
    name: 'PORTLAND CLASS C',
    class: 'C',
    type: 'C',
    floor: { ft: 1100, ref: 'MSL' },
    ceiling: { ft: 4000, exclusive: false },
    partTime: false,
    rings: [square],
    bbox: [-122, 45, -121, 46],
    ...overrides,
  };
}

test('a point inside the outer ring is inside the shelf', () => {
  const result = pointInShelf(shelf(), { lat: 45.5, lon: -121.5 });

  expect(result).toBe(true);
});

test('a point in a hole is outside the shelf', () => {
  const donut = shelf({ rings: [square, hole] });

  const inHole = pointInShelf(donut, { lat: 45.5, lon: -121.5 });
  const inBand = pointInShelf(donut, { lat: 45.1, lon: -121.9 });

  expect(inHole).toBe(false);
  expect(inBand).toBe(true);
});

test('a point outside the bbox is outside without a ring test', () => {
  let reads = 0;
  const rings = new Proxy([square], {
    get(target, prop, receiver) {
      reads += 1;
      return Reflect.get(target, prop, receiver);
    },
  });

  const result = pointInShelf(shelf({ rings }), { lat: 50, lon: -100 });

  expect(result).toBe(false);
  expect(reads).toBe(0);
});

test('altitudeMslFt prefers ground, then gnss, then baro', () => {
  const ground = altitudeMslFt({
    onGround: true,
    altitudeFt: 3000,
    geometricAltitudeFt: 3100,
  });
  const gnss = altitudeMslFt({
    onGround: false,
    altitudeFt: 3000,
    geometricAltitudeFt: 3100,
  });
  const baro = altitudeMslFt({ onGround: false, altitudeFt: 3000 });
  const none = altitudeMslFt({ onGround: false, altitudeFt: null });

  expect(ground).toEqual({ ft: 0, source: 'ground' });
  expect(gnss).toEqual({ ft: 3100, source: 'gnss' });
  expect(baro).toEqual({ ft: 3000, source: 'baro' });
  expect(none).toBeNull();
});

test('the floor is inclusive', () => {
  expect(inShelfVertically(shelf(), 1100)).toBe(true);
  expect(inShelfVertically(shelf(), 1099)).toBe(false);
});

test('an exclusive ceiling is outside, an inclusive one is inside', () => {
  const exclusive = shelf({ ceiling: { ft: 4000, exclusive: true } });

  expect(inShelfVertically(exclusive, 4000)).toBe(false);
  expect(inShelfVertically(exclusive, 3999)).toBe(true);
  expect(inShelfVertically(shelf(), 4000)).toBe(true);
  expect(inShelfVertically(shelf(), 4001)).toBe(false);
});

test('a null ceiling stops at the Class A floor', () => {
  const open = shelf({ ceiling: null });

  expect(CLASS_A_FLOOR_FT).toBe(18000);
  expect(inShelfVertically(open, 17999)).toBe(true);
  expect(inShelfVertically(open, 18000)).toBe(false);
});

test('an aircraft on the ground is inside a surface shelf', () => {
  const surface = shelf({
    type: 'E2',
    class: 'E',
    floor: { ft: 0, ref: 'SFC' },
    ceiling: null,
  });

  const result = shelvesAt([surface], {
    lat: 45.5,
    lon: -121.5,
    onGround: true,
    altitudeFt: null,
  });

  expect(result).toEqual([surface]);
});

test('a null altitude matches nothing', () => {
  const surface = shelf({ floor: { ft: 0, ref: 'SFC' }, ceiling: null });

  const result = shelvesAt([surface], {
    lat: 45.5,
    lon: -121.5,
    onGround: false,
    altitudeFt: null,
  });

  expect(result).toEqual([]);
});

test('shelvesAt needs both lateral and vertical containment', () => {
  const a = shelf();
  const above = { lat: 45.5, lon: -121.5, onGround: false, altitudeFt: 5000 };
  const inside = { lat: 45.5, lon: -121.5, onGround: false, altitudeFt: 2000 };
  const away = { lat: 40, lon: -121.5, onGround: false, altitudeFt: 2000 };

  expect(shelvesAt([a], above)).toEqual([]);
  expect(shelvesAt([a], inside)).toEqual([a]);
  expect(shelvesAt([a], away)).toEqual([]);
});

test('airspaceOf matches ICAO and FAA idents both ways', () => {
  const faaShelf = shelf({ airport: 'RDM' });
  const icaoShelf = shelf({ airport: 'KRDM' });
  const other = shelf({ airport: 'KPDX' });
  const shelves = [faaShelf, icaoShelf, other];

  expect(airspaceOf(shelves, 'KRDM')).toEqual([faaShelf, icaoShelf]);
  expect(airspaceOf(shelves, 'RDM')).toEqual([faaShelf]);
  expect(airspaceOf(shelves, 'KPDX')).toEqual([other]);
  expect(airspaceOf(shelves, 'ZZZ')).toEqual([]);
});
