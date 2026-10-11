import { expect, test } from 'vitest';
import type { ChartAirport } from '../../chart';
import { type Airport, AIRPORTS } from '../../places';
import { airportRing } from './airport-ring';

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
  runways: [runway],
};

const HELI_H = 'M-2.5 -3 V3 M2.5 -3 V3 M-2.5 0 H2.5';
const count = (html: string, tag: string) => html.split(`<${tag}`).length - 1;

test('an airport is a 10 px open ink ring and nothing else', () => {
  const ring = airportRing(base);

  expect(ring.className).toBe('atc-apt');
  expect(count(ring.html, 'circle')).toBe(1);
  expect(ring.html).toContain('r="5"');
  expect(ring.html).toContain('fill="none"');
  expect(ring.html).toContain('stroke="currentColor"');
  expect(count(ring.html, 'path')).toBe(0);
});

test('a towered or non-towered airport carries no tone class', () => {
  const towered = airportRing(base);
  const other = airportRing({ ...base, towered: false });

  expect(towered.className).not.toContain('is-towered');
  expect(other.className).not.toContain('is-nontowered');
});

test('a heliport ring holds the H path', () => {
  const ring = airportRing({ ...base, kind: 'heliport' });

  expect(ring.html).toContain(`d="${HELI_H}"`);
  expect(count(ring.html, 'circle')).toBe(1);
});

test('the glyphs are scaled to fit inside the 10 px ring', () => {
  const heli = airportRing({ ...base, kind: 'heliport' });
  const sea = airportRing({ ...base, kind: 'seaplane' });

  expect(heli.html).toContain('scale(0.8)');
  expect(sea.html).toContain('scale(0.65)');
});

test('a seaplane base ring holds an anchor path, not the H', () => {
  const ring = airportRing({ ...base, kind: 'seaplane' });

  expect(count(ring.html, 'path')).toBe(1);
  expect(ring.html).not.toContain(HELI_H);
});

test('a fallback airport is a plain ring marked is-fallback', () => {
  const ring = airportRing(AIRPORTS['KBDN'] as Airport);

  expect(ring.className).toBe('atc-apt is-fallback');
  expect(count(ring.html, 'circle')).toBe(1);
  expect(count(ring.html, 'path')).toBe(0);
});

test('markup never includes upstream text', () => {
  const rings = [
    airportRing(base),
    airportRing({ ...base, kind: 'heliport' }),
    airportRing({ ...base, kind: 'seaplane' }),
    airportRing(AIRPORTS['KBDN'] as Airport),
  ];

  for (const ring of rings) {
    expect(ring.html).not.toContain('ROBERTS');
    expect(ring.html).not.toContain('RDM');
    expect(ring.html).not.toContain('BEND');
    expect(ring.html).not.toContain('BDN');
  }
});
