import { expect, test } from 'vitest';
import { parseChartAirports, parseSurfaces } from './parse';

const validAirport = {
  code: 'KRDM',
  faa: 'RDM',
  name: 'Roberts Field/Redmond-Bend',
  city: 'Redmond',
  state: 'OR',
  aliases: ['RDM'],
  lat: 44.25,
  lon: -121.15,
  elevationFt: 3080,
  kind: 'airport',
  towered: true,
  towerPartTime: false,
  frequencies: { tower: '118.3', atis: '124.35', ctaf: null, unicom: null },
  weather: { kind: 'ASOS', frequency: '124.35' },
  lighting: 'full',
  fuel: true,
  military: false,
  runways: [
    {
      id: '05/23',
      lengthFt: 7000,
      widthFt: 100,
      surface: 'ASPH',
      hard: true,
      ends: null,
      corners: null,
      bearingDeg: null,
    },
  ],
  rank: 1,
};

const payload = {
  cycle: '2610',
  effective: '2026-10-08',
  airports: [validAirport],
};

test('a valid payload round-trips', () => {
  const result = parseChartAirports(payload);

  expect(result).toEqual(payload);
});

test('an airport with a markup code is dropped', () => {
  const bad = { ...validAirport, code: '<img>' };

  const result = parseChartAirports({
    ...payload,
    airports: [bad, validAirport],
  });

  expect(result.airports).toEqual([validAirport]);
});

test('extra fields are not copied', () => {
  const extra = { ...validAirport, ownerPhone: '555-0100' };

  const result = parseChartAirports({ ...payload, airports: [extra] });

  expect(result.airports[0]).not.toHaveProperty('ownerPhone');
});

test('a non-array airports list throws', () => {
  expect(() => parseChartAirports({ cycle: '2610', airports: {} })).toThrow();
  expect(() => parseChartAirports({ cycle: 5, airports: [] })).toThrow();
});

test('a bad frequency or runway drops the airport', () => {
  const badFreq = {
    ...validAirport,
    frequencies: { ...validAirport.frequencies, tower: 'x<y' },
  };
  const badRunway = {
    ...validAirport,
    runways: [{ ...validAirport.runways[0], lengthFt: -1 }],
  };

  const result = parseChartAirports({
    ...payload,
    airports: [badFreq, badRunway],
  });

  expect(result.airports).toEqual([]);
});

test('a surface ref that fails the pattern becomes null', () => {
  const surfaces = parseSurfaces(
    {
      source: 'faa',
      features: [
        {
          kind: 'taxiway',
          shape: 'line',
          points: [
            [-122, 47],
            [-122.1, 47.1],
          ],
          ref: 'A<',
          widthFt: 50,
        },
        {
          kind: 'apron',
          shape: 'polygon',
          rings: [
            [
              [-122, 47],
              [-122.1, 47.1],
              [-122.2, 47],
            ],
          ],
          ref: 'CARGO 2',
        },
      ],
    },
    'KSEA',
  );

  expect(surfaces.code).toBe('KSEA');
  expect(surfaces.features).toHaveLength(2);
  expect(surfaces.features[0]).toMatchObject({ ref: null });
  expect(surfaces.features[1]).toMatchObject({ ref: 'CARGO 2' });
});
