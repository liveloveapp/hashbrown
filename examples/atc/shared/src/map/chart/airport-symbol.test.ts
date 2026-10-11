import { expect, test } from 'vitest';
import type { ChartAirport } from '../../chart';
import { type Airport, AIRPORTS } from '../../places';
import { airportSymbol } from './airport-symbol';

const runway = {
  id: '05/23',
  lengthFt: 7038,
  widthFt: 150,
  surface: 'ASPH',
  hard: true,
  ends: null,
  corners: null,
  bearingDeg: 60,
} as const;

const base: ChartAirport = {
  code: 'KRDM',
  faa: 'RDM',
  name: 'ROBERTS FLD/REDMOND MUNI',
  city: 'REDMOND',
  state: 'OR',
  aliases: [],
  lat: 44.25,
  lon: -121.15,
  elevationFt: 3082,
  kind: 'airport',
  towered: true,
  towerPartTime: true,
  frequencies: { tower: '124.5', atis: null, ctaf: null, unicom: null },
  weather: null,
  lighting: 'limited',
  fuel: true,
  military: false,
  rank: 0,
  runways: [runway, { ...runway, id: '11/29', bearingDeg: 105 }],
};

const count = (html: string, tag: string) => html.split(`<${tag}`).length - 1;

test('a towered fuel field is a 12 px disc with bars and four ticks', () => {
  const symbol = airportSymbol(base);

  expect(symbol.className).toContain('atc-apt');
  expect(symbol.className).toContain('is-towered');
  expect(symbol.html).toContain('<circle');
  expect(symbol.html).toContain('r="6"');
  expect(count(symbol.html, 'line')).toBe(2);
  expect(count(symbol.html, 'rect')).toBe(4);
  expect(symbol.size).toBe(24);
});

test('a non-towered field is marked as such', () => {
  const bend = { ...base, towered: false, fuel: false };

  const symbol = airportSymbol(bend);

  expect(symbol.className).toContain('is-nontowered');
  expect(count(symbol.html, 'rect')).toBe(0);
  expect(symbol.size).toBe(24);
});

test('a field with only turf runways is a ring', () => {
  const turf = {
    ...base,
    fuel: false,
    runways: [{ ...runway, hard: false }],
  };

  const symbol = airportSymbol(turf);

  expect(symbol.html).toContain('fill="none"');
  expect(symbol.html).toContain('stroke-width="1.5"');
  expect(count(symbol.html, 'line')).toBe(0);
  expect(symbol.size).toBe(18);
});

test('a runway without a bearing draws no bar', () => {
  const airport = {
    ...base,
    runways: [runway, { ...runway, id: '11/29', bearingDeg: null }],
  };

  const symbol = airportSymbol(airport);

  expect(count(symbol.html, 'line')).toBe(1);
});

test('a fallback airport is a plain ring with no ticks', () => {
  const symbol = airportSymbol(AIRPORTS['KBDN'] as Airport);

  expect(symbol.className).toContain('is-fallback');
  expect(symbol.html).toContain('fill="none"');
  expect(count(symbol.html, 'rect')).toBe(0);
  expect(symbol.size).toBe(18);
});

test('heliports, seaplane bases and military fields get their own shapes', () => {
  const heli = airportSymbol({ ...base, kind: 'heliport', fuel: false });
  const sea = airportSymbol({ ...base, kind: 'seaplane', fuel: false });
  const mil = airportSymbol({ ...base, military: true, fuel: false });

  expect(heli.html).toContain('<path');
  expect(heli.html).not.toContain('<text');
  expect(sea.html).toContain('<path');
  expect(count(mil.html, 'circle')).toBe(2);
  expect(mil.html).toContain('r="6"');
  expect(mil.html).toContain('r="3"');
});

test('markup never includes upstream text', () => {
  const symbol = airportSymbol(base);

  expect(symbol.html).not.toContain('ROBERTS');
  expect(symbol.html).not.toContain('RDM');
});

test('a military field with fuel is a double ring and is never ticked', () => {
  const symbol = airportSymbol({ ...base, military: true, fuel: true });

  expect(count(symbol.html, 'rect')).toBe(0);
  expect(count(symbol.html, 'circle')).toBe(2);
  expect(symbol.size).toBe(18);
});
