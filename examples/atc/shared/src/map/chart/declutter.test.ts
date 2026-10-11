import { expect, test } from 'vitest';
import type { ChartAirport } from '../../chart';
import { blockZoomRule, placeBlocks, visibleAirports } from './declutter';

function field(
  code: string,
  rank: number,
  towered: boolean,
  lengthFt: number,
  hard = true,
): ChartAirport {
  return {
    code,
    faa: code,
    name: code,
    city: '',
    state: 'OR',
    aliases: [],
    lat: 44,
    lon: -121,
    elevationFt: 0,
    kind: 'airport',
    towered,
    towerPartTime: false,
    frequencies: { tower: null, atis: null, ctaf: null, unicom: null },
    weather: null,
    lighting: 'none',
    fuel: false,
    military: false,
    rank,
    runways: [
      {
        id: '01/19',
        lengthFt,
        widthFt: 75,
        surface: hard ? 'ASPH' : 'TURF',
        hard,
        ends: null,
        corners: null,
        bearingDeg: 10,
      },
    ],
  };
}

const airports = [
  field('LONG', 3, false, 5500),
  field('TWR', 1, true, 3000),
  field('MID', 2, false, 4000),
  field('TURF', 0, false, 2000, false),
];

const codes = (list: readonly ChartAirport[]) => list.map((a) => a.code);

test('at zoom 6 only towered or long-runway fields show, in rank order', () => {
  const result = visibleAirports(airports, 6);

  expect(codes(result)).toEqual(['TWR', 'LONG']);
});

test('at zoom 9 a 3,000 ft hard runway is enough', () => {
  const result = visibleAirports(airports, 9);

  expect(codes(result)).toEqual(['TWR', 'MID', 'LONG']);
});

test('at zoom 10 every field shows, turf included', () => {
  const result = visibleAirports(airports, 10);

  expect(codes(result)).toEqual(['TURF', 'TWR', 'MID', 'LONG']);
});

test('blockZoomRule is true at every zoom for a visible airport', () => {
  const towered = field('A', 0, true, 5000);
  const open = field('B', 0, false, 5000);

  const zooms = [4, 7, 8, 9, 10, 14];

  expect(zooms.map((zoom) => blockZoomRule(towered, zoom))).toEqual(
    zooms.map(() => true),
  );
  expect(zooms.map((zoom) => blockZoomRule(open, zoom))).toEqual(
    zooms.map(() => true),
  );
});

test('two blocks at the same pixel place only the first', () => {
  const items = [
    { code: 'A', x: 100, y: 100, lines: ['ONE'] },
    { code: 'B', x: 100, y: 100, lines: ['TWO'] },
  ];

  const placed = placeBlocks(items);

  expect([...placed.keys()]).toEqual(['A']);
  expect(placed.get('A')).toEqual({ x: 114, y: 90 });
});

test('blocks 300 px apart both place', () => {
  const items = [
    { code: 'A', x: 100, y: 100, lines: ['ONE'] },
    { code: 'B', x: 400, y: 100, lines: ['TWO'] },
  ];

  const placed = placeBlocks(items);

  expect([...placed.keys()]).toEqual(['A', 'B']);
});

test('a block that would cover another airport symbol is skipped', () => {
  const items = [
    { code: 'A', x: 100, y: 100, lines: ['ONE LINE OF TEXT'] },
    { code: 'B', x: 160, y: 100, lines: ['X'] },
  ];

  const placed = placeBlocks(items);

  expect(placed.has('A')).toBe(false);
  expect(placed.has('B')).toBe(true);
});
