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

test('every kind has a distinct silhouette path in the 24 by 24 box', () => {
  const paths = KINDS.map((kind) => KIND_PATHS[kind]);

  expect(new Set(paths).size).toBe(4);
  for (const path of paths) {
    expect(path).toMatch(/^[AaMmLlHhVvCcSsZz0-9 .,-]+$/);
  }
});
