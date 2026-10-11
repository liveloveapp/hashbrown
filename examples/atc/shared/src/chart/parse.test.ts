import { expect, test } from 'vitest';
import { parseAirspace, parseChartAirports, parseSurfaces } from './parse';

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

const ring = [
  [-122, 45],
  [-121, 45],
  [-121, 46],
  [-122, 46],
  [-122, 45],
];

const validShelf = {
  id: 'KPDX-C-0',
  airport: 'KPDX',
  name: 'PORTLAND INTERNATIONAL AIRPORT CLASS C',
  class: 'C',
  type: 'C',
  floor: { ft: 1100, ref: 'MSL' },
  ceiling: { ft: 4000, exclusive: false },
  partTime: false,
  rings: [ring],
  bbox: [-122, 45, -121, 46],
};

const airspacePayload = (shelves: unknown[]) => ({
  cycle: '2610',
  effective: '2026-10-08',
  shelves,
});

test('parseAirspace accepts a valid shelf', () => {
  const result = parseAirspace(airspacePayload([validShelf]));

  expect(result.cycle).toBe('2610');
  expect(result.effective).toBe('2026-10-08');
  expect(result.shelves).toEqual([validShelf]);
});

test('parseAirspace throws when shelves or cycle are wrong', () => {
  expect(() => parseAirspace(null)).toThrow();
  expect(() => parseAirspace({ cycle: '2610', shelves: {} })).toThrow();
  expect(() => parseAirspace({ cycle: 1, shelves: [] })).toThrow();
});

test('parseAirspace copies whitelisted fields only', () => {
  const result = parseAirspace(
    airspacePayload([
      { ...validShelf, extra: 'x', floor: { ft: 0, ref: 'SFC', y: 1 } },
    ]),
  );

  expect(result.shelves[0]).not.toHaveProperty('extra');
  expect(result.shelves[0].floor).toEqual({ ft: 0, ref: 'SFC' });
});

test('parseAirspace keeps a null ceiling', () => {
  const result = parseAirspace(
    airspacePayload([{ ...validShelf, ceiling: null }]),
  );

  expect(result.shelves[0].ceiling).toBeNull();
});

test('parseAirspace drops invalid shelves', () => {
  const bad = [
    { ...validShelf, airport: 'toolong' },
    { ...validShelf, airport: 'a' },
    { ...validShelf, class: 'A' },
    { ...validShelf, type: 'E5' },
    { ...validShelf, floor: { ft: -1, ref: 'MSL' } },
    { ...validShelf, floor: { ft: Infinity, ref: 'MSL' } },
    { ...validShelf, floor: { ft: 0, ref: 'AGL' } },
    { ...validShelf, ceiling: { ft: 1100, exclusive: false } },
    { ...validShelf, ceiling: { ft: 'x', exclusive: false } },
    { ...validShelf, rings: [] },
    { ...validShelf, rings: [ring.slice(0, 3)] },
    { ...validShelf, rings: [[...ring.slice(0, 4), [-200, 45]]] },
    { ...validShelf, rings: [[...ring.slice(0, 4), [-122, 95]]] },
    { ...validShelf, bbox: [-122, 45, -121] },
    { ...validShelf, bbox: [-122, 45, -121, NaN] },
    null,
  ];

  const result = parseAirspace(airspacePayload([validShelf, ...bad]));

  expect(result.shelves).toEqual([validShelf]);
});
