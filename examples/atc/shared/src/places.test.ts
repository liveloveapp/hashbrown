import { expect, test } from 'vitest';
import { distanceNm } from './geo';
import { AIRPORT_CODES, AIRPORTS, AREAS, lookupPlace } from './places';

test('lookupPlace matches ICAO and FAA codes, names and cities, ignoring case', () => {
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
    expect(airport.faa).toBe(airport.code.slice(1));
    expect(distanceNm(airport, AREAS.pnw)).toBeLessThan(450);
  }
  expect(AIRPORTS.KBDN).toMatchObject({ lat: 44.0946, lon: -121.2002 });
});

test('the home view opens on central Oregon while the feed stays 250 nm around KBDN', () => {
  const { pnw } = AREAS;
  const towns = [
    { lat: 44.0582, lon: -121.3153 }, // Bend
    { lat: 44.2726, lon: -121.1739 }, // Redmond
    { lat: 44.291, lon: -121.5492 }, // Sisters
    { lat: 44.3001, lon: -120.8342 }, // Prineville
  ];

  const offsets = towns.map((town) => distanceNm(town, pnw.view));

  expect(pnw.radiusNm).toBe(250);
  expect({ lat: pnw.lat, lon: pnw.lon }).toEqual({
    lat: AIRPORTS.KBDN.lat,
    lon: AIRPORTS.KBDN.lon,
  });
  expect(pnw.view.zoom).toBe(9);
  expect(Math.max(...offsets)).toBeLessThan(20);
});
