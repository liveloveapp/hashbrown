import { expect, test } from 'vitest';
import { distanceNm } from './geo';
import { AIRPORT_CODES, AIRPORTS, AREAS, lookupPlace } from './places';

test('lookupPlace matches ICAO and IATA codes, names and cities, ignoring case', () => {
  const queries = [
    'KBDN',
    'kbdn',
    'BDN',
    'bend',
    'Bend Municipal',
    'Roberts Field',
    'redmond',
    ' Seattle ',
    'SeaTac',
    'Boeing Field',
    'Portland',
    'Hillsboro',
    'Spokane',
    'Bend airport',
    'Bend, OR',
    'Medford',
  ];

  const codes = queries.map((query) => lookupPlace(query)?.code ?? null);

  expect(codes).toEqual([
    'KBDN',
    'KBDN',
    'KBDN',
    'KBDN',
    'KBDN',
    'KRDM',
    'KRDM',
    'KSEA',
    'KSEA',
    'KBFI',
    'KPDX',
    'KHIO',
    'KGEG',
    'KBDN',
    'KBDN',
    'KMFR',
  ]);
});

test('lookupPlace returns null for places outside the table', () => {
  const queries = ['Tokyo', 'KJFK', 'JFK', 'Portland, Maine', '', '  ', 'k'];

  const results = queries.map(lookupPlace);

  expect(results).toEqual(queries.map(() => null));
});

test('the airport table is keyed by ICAO code and stays near the Pacific Northwest', () => {
  const airports = AIRPORT_CODES.map((code) => AIRPORTS[code]);

  expect(AIRPORT_CODES.length).toBeGreaterThanOrEqual(40);
  expect(new Set(AIRPORT_CODES).size).toBe(AIRPORT_CODES.length);
  for (const airport of airports) {
    expect(airport.code).toMatch(/^K[A-Z]{3}$/);
    expect(airport.iata).toBe(airport.code.slice(1));
    expect(distanceNm(airport, AREAS.pnw)).toBeLessThan(450);
  }
  expect(AIRPORTS.KBDN).toMatchObject({ lat: 44.0946, lon: -121.2002 });
});
