import { expect, test } from 'vitest';
import { aircraftKind, isCategory, KIND_PATHS, KINDS } from './kinds';

test('aircraftKind uses the type table first', () => {
  const kinds = [
    aircraftKind({ typeCode: 'B738', category: 'A7' }),
    aircraftKind({ typeCode: 'C172', category: 'A3' }),
    aircraftKind({ typeCode: 'BE20', category: null }),
    aircraftKind({ typeCode: 'R44', category: null }),
    aircraftKind({ typeCode: 'c172', category: null }),
    aircraftKind({ typeCode: 'DH8D', category: null }),
  ];

  expect(kinds).toEqual(['jet', 'single', 'twin', 'rotor', 'single', 'twin']);
});

test('aircraftKind falls back to the category for unknown types', () => {
  const kinds = [
    aircraftKind({ typeCode: 'ZZZZ', category: 'A7' }),
    aircraftKind({ typeCode: null, category: 'A3' }),
    aircraftKind({ typeCode: null, category: 'A4' }),
    aircraftKind({ typeCode: null, category: 'A5' }),
    aircraftKind({ typeCode: null, category: 'A6' }),
    aircraftKind({ typeCode: null, category: 'A2' }),
    aircraftKind({ typeCode: null, category: 'A1' }),
    aircraftKind({ typeCode: null, category: 'B1' }),
    aircraftKind({ typeCode: null, category: 'B6' }),
  ];

  expect(kinds).toEqual([
    'rotor',
    'jet',
    'jet',
    'jet',
    'jet',
    'twin',
    'single',
    'single',
    'single',
  ]);
});

test('aircraftKind defaults to jet when nothing is known', () => {
  const kinds = [
    aircraftKind({ typeCode: null, category: null }),
    aircraftKind({ typeCode: 'ZZZZ', category: null }),
    aircraftKind({ typeCode: null, category: 'C2' }),
    aircraftKind({ typeCode: null, category: 'A0' }),
  ];

  expect(kinds).toEqual(['jet', 'jet', 'jet', 'jet']);
});

test('isCategory accepts only A to C followed by 0 to 7', () => {
  const results = ['A1', 'B7', 'C0', 'D1', 'A8', 'a1', 'A', '<b>', 'A11'].map(
    isCategory,
  );

  expect(results).toEqual([
    true,
    true,
    true,
    false,
    false,
    false,
    false,
    false,
    false,
  ]);
});

/** Every vertex of a path made only of absolute `M`, `L` and `Z` commands. */
function vertices(path: string): [number, number][] {
  return [...path.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);
}

test('every kind has a distinct silhouette made of straight segments', () => {
  const paths = KINDS.map((kind) => KIND_PATHS[kind]);

  expect(new Set(paths).size).toBe(4);
  for (const path of paths) {
    expect(path).toMatch(/^(?:[ML]-?[\d.]+ -?[\d.]+|Z)+$/);
  }
});

test('every silhouette is mirror-symmetric about the vertical centre line', () => {
  for (const kind of KINDS) {
    const points = vertices(KIND_PATHS[kind]);
    const keys = new Set(points.map(([x, y]) => `${x},${y}`));

    const unmatched = points.filter(([x, y]) => !keys.has(`${24 - x},${y}`));

    expect(unmatched, kind).toEqual([]);
  }
});

test('every silhouette sits on a quarter-unit grid inside the 24 by 24 box', () => {
  for (const kind of KINDS) {
    const points = vertices(KIND_PATHS[kind]);

    const offGrid = points.filter(
      ([x, y]) =>
        !Number.isInteger(x * 4) ||
        !Number.isInteger(y * 4) ||
        x < 0 ||
        x > 24 ||
        y < 0 ||
        y > 24,
    );

    expect(offGrid, kind).toEqual([]);
  }
});

test('every silhouette stays inside the keyline; fixed wings span all of it', () => {
  for (const kind of KINDS) {
    const points = vertices(KIND_PATHS[kind]);
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);

    const bounds = [Math.min(...xs, ...ys), Math.max(...xs, ...ys)];

    expect(bounds[0], kind).toBeGreaterThanOrEqual(2);
    expect(bounds[1], kind).toBeLessThanOrEqual(22);
    if (kind !== 'rotor') {
      expect([Math.min(...xs), Math.max(...xs)], kind).toEqual([2, 22]);
    }
  }
});

test('the single-engine prop is a short, thin bar, about a fifth of the wingspan', () => {
  const prop = vertices(KIND_PATHS.single).filter(([, y]) => y < 3.5);
  const xs = prop.map(([x]) => x);
  const ys = prop.map(([, y]) => y);

  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);

  expect(width).toBeGreaterThan(0);
  expect(width).toBeLessThanOrEqual(4);
  expect(height).toBeLessThanOrEqual(1);
});
