import { s } from '@hashbrownai/core';
import { expect, test } from 'vitest';
import type { Aircraft } from './aircraft';
import type { AirspaceShelf } from './chart';
import {
  findAircraft,
  findAircraftInput,
  type FindAircraftInput,
  type MapFilter,
  matchesResolved,
  resolveFilter,
} from './find-aircraft';
import { applySnapshot, createAtcStore, INITIAL_STATE } from './store';
import {
  squareRing,
  testAircraft,
  testChartAirport,
  testShelf,
} from './testing';

function plane(hex: string, overrides: Partial<Aircraft> = {}): Aircraft {
  return testAircraft({
    hex,
    lat: 44.0946,
    lon: -121.2002,
    altitudeFt: 30000,
    groundSpeedKt: 450,
    ...overrides,
  });
}

const any: FindAircraftInput = {
  airline: null,
  typeCode: null,
  kind: null,
  minAltitudeFt: null,
  maxAltitudeFt: null,
  approaching: null,
  near: null,
  inAirspace: null,
  sortBy: 'altitude',
  limit: 20,
};

const state = applySnapshot(INITIAL_STATE, {
  at: 1,
  aircraft: [
    plane('aaaaaa', { altitudeFt: 38000, groundSpeedKt: 480 }),
    plane('bbbbbb', {
      label: 'DAL200',
      callsign: 'DAL200',
      registration: null,
      typeCode: 'A321',
      category: null,
      kind: 'jet',
      altitudeFt: 5000,
      groundSpeedKt: 200,
      verticalRateFpm: -900,
      lat: 44.2,
    }),
    plane('cccccc', {
      label: 'SWA300',
      callsign: 'SWA300',
      registration: null,
      typeCode: 'B38M',
      category: null,
      kind: 'jet',
      altitudeFt: 12000,
      groundSpeedKt: 520,
    }),
  ],
});

const pdxShelves: readonly AirspaceShelf[] = [
  testShelf(),
  testShelf({
    id: 'KPDX-E2-0',
    name: 'PORTLAND E2',
    class: 'E',
    type: 'E2',
    floor: { ft: 0, ref: 'SFC' },
    ceiling: null,
  }),
];

const rdmShelf = testShelf({
  id: 'KRDM-D-0',
  airport: 'KRDM',
  name: 'REDMOND CLASS D',
  class: 'D',
  type: 'D',
  floor: { ft: 0, ref: 'SFC' },
  ceiling: { ft: 6000, exclusive: false },
  partTime: true,
  rings: [squareRing(-121.15, 44.25, 0.15)],
});

function airspaceStore(shelves: readonly AirspaceShelf[]) {
  const store = createAtcStore();
  store.setChart({
    cycle: '2610',
    effective: '2026-10-08',
    airports: [testChartAirport()],
  });
  store.setAirspace({ cycle: '2610', effective: '2026-10-08', shelves });

  return store;
}

test('findAircraft sorts by altitude, speed and distance', () => {
  const byAltitude = findAircraft(state, any).map((row) => row.hex);
  const bySpeed = findAircraft(state, { ...any, sortBy: 'speed' }).map(
    (row) => row.hex,
  );
  const byDistance = findAircraft(state, { ...any, sortBy: 'distance' }).map(
    (row) => row.hex,
  );

  expect(byAltitude).toEqual(['aaaaaa', 'cccccc', 'bbbbbb']);
  expect(bySpeed).toEqual(['cccccc', 'aaaaaa', 'bbbbbb']);
  expect(byDistance[byDistance.length - 1]).toBe('bbbbbb');
});

test('findAircraft matches airlines and types by code or name, ignoring case', () => {
  const results = [
    findAircraft(state, { ...any, airline: 'united' }).map((row) => row.hex),
    findAircraft(state, { ...any, airline: 'dal' }).map((row) => row.hex),
    findAircraft(state, { ...any, airline: '' }).length,
    findAircraft(state, { ...any, typeCode: '737' }).map((row) => row.hex),
    findAircraft(state, { ...any, typeCode: 'a321' }).map((row) => row.hex),
  ];

  expect(results).toEqual([
    ['aaaaaa'],
    ['bbbbbb'],
    3,
    ['aaaaaa', 'cccccc'],
    ['bbbbbb'],
  ]);
});

test('findAircraft filters by altitude band and approach, and clamps the limit', () => {
  const band = findAircraft(state, {
    ...any,
    minAltitudeFt: 10000,
    maxAltitudeFt: 20000,
  }).map((row) => row.hex);
  const approaching = findAircraft(state, { ...any, approaching: 'KRDM' }).map(
    (row) => row.hex,
  );
  const none = findAircraft(state, { ...any, limit: 0 }).length;
  const many = findAircraft(state, { ...any, limit: 500 }).length;

  expect(band).toEqual(['cccccc']);
  expect(approaching).toEqual(['bbbbbb']);
  expect([none, many]).toEqual([1, 3]);
});

test('findAircraft rows carry readable names and rounded distance', () => {
  const [row] = findAircraft(state, { ...any, limit: 1 });

  expect(row).toEqual({
    hex: 'aaaaaa',
    label: 'UAL100',
    callsign: 'UAL100',
    registration: null,
    airline: 'United Airlines',
    aircraftType: 'Boeing 737-800',
    kind: 'jet',
    altitudeFt: 38000,
    groundSpeedKt: 480,
    trackDeg: 90,
    distanceNm: 0,
  });
});

test('findAircraft lists private traffic with no airline and skips it for airline filters', () => {
  const mixed = applySnapshot(INITIAL_STATE, {
    at: 1,
    aircraft: [
      plane('aaaaaa'),
      plane('dddddd', {
        label: 'UAL1PVT',
        callsign: 'UAL1PVT',
        registration: null,
      }),
      plane('eeeeee', {
        label: 'N352LL',
        callsign: 'N352LL',
        registration: 'N352LL',
        typeCode: 'C172',
        category: null,
        kind: 'single',
        altitudeFt: 4500,
      }),
      plane('ffffff', {
        label: 'FFFFFF',
        callsign: null,
        registration: null,
        typeCode: null,
        category: null,
        kind: 'jet',
        altitudeFt: 1000,
      }),
    ],
  });

  const all = findAircraft(mixed, any).map((row) => [row.label, row.airline]);
  const united = findAircraft(mixed, { ...any, airline: 'united' }).map(
    (row) => row.hex,
  );
  const byCode = findAircraft(mixed, { ...any, airline: 'n35' }).length;

  expect(all).toEqual([
    ['UAL100', 'United Airlines'],
    ['UAL1PVT', 'United Airlines'],
    ['N352LL', null],
    ['FFFFFF', null],
  ]);
  expect(united).toEqual(['aaaaaa', 'dddddd']);
  expect(byCode).toBe(0);
});

test('findAircraft filters by kind and rows carry the kind', () => {
  const mixed = applySnapshot(INITIAL_STATE, {
    at: 1,
    aircraft: [
      plane('aaaaaa'),
      plane('bbbbbb', { typeCode: 'R44', kind: 'rotor' }),
      plane('cccccc', { typeCode: 'C172', kind: 'single' }),
    ],
  });

  const rotors = findAircraft(mixed, { ...any, kind: 'rotor' });
  const all = findAircraft(mixed, any);

  expect(rotors.map((row) => [row.hex, row.kind, row.aircraftType])).toEqual([
    ['bbbbbb', 'rotor', 'Robinson R44'],
  ]);
  expect(all.map((row) => row.kind).sort()).toEqual(['jet', 'rotor', 'single']);
});

test('findAircraft filters to a circle around an airport and measures from it', () => {
  const traffic = applySnapshot(INITIAL_STATE, {
    at: 1,
    aircraft: [
      plane('aaaaaa', { lat: 44.0946, lon: -121.2002 }),
      plane('bbbbbb', { lat: 44.3, lon: -121.2002 }),
      plane('cccccc', { lat: 47.45, lon: -122.31 }),
    ],
  });

  const near = findAircraft(traffic, {
    ...any,
    near: { airport: 'kbdn', radiusNm: 25 },
    sortBy: 'distance',
  });
  const tight = findAircraft(traffic, {
    ...any,
    near: { airport: 'KBDN', radiusNm: 5 },
  });

  expect(near.map((row) => [row.hex, row.distanceNm])).toEqual([
    ['aaaaaa', 0],
    ['bbbbbb', 12.3],
  ]);
  expect(tight.map((row) => row.hex)).toEqual(['aaaaaa']);
});

test('findAircraft with inAirspace and no class keeps any shelf of the airport', () => {
  const state = {
    ...airspaceStore([...pdxShelves, rdmShelf]).getState(),
  };
  const traffic = applySnapshot(state, {
    at: 1,
    aircraft: [
      plane('aaaaaa', { lat: 45.5, lon: -121.5, altitudeFt: 25000 }),
      plane('bbbbbb', { lat: 45.5, lon: -121.5, altitudeFt: 3000 }),
    ],
  });

  const rows = findAircraft(traffic, {
    ...any,
    inAirspace: { airport: 'KPDX', class: null },
  });

  expect(rows.map((row) => row.hex)).toEqual(['bbbbbb']);
});

test('findAircraft with inAirspace says which altitude the check used', () => {
  const traffic = applySnapshot(
    airspaceStore([...pdxShelves, rdmShelf]).getState(),
    {
      at: 1,
      aircraft: [
        plane('aaaaaa', {
          lat: 44.25,
          lon: -121.15,
          altitudeFt: 3000,
          geometricAltitudeFt: 3200,
        }),
        plane('bbbbbb', { lat: 44.25, lon: -121.15, altitudeFt: 2500 }),
      ],
    },
  );

  const rows = findAircraft(traffic, {
    ...any,
    inAirspace: { airport: 'KRDM', class: 'D' },
    sortBy: 'altitude',
  });

  expect(rows).toMatchObject([
    {
      hex: 'aaaaaa',
      altitudeFt: 3000,
      checkedAltitudeFt: 3200,
      altitudeSource: 'gnss',
    },
    {
      hex: 'bbbbbb',
      altitudeFt: 2500,
      checkedAltitudeFt: 2500,
      altitudeSource: 'baro',
    },
  ]);
});

test('findAircraft with inAirspace says when the airspace is part-time', () => {
  const traffic = applySnapshot(
    airspaceStore([...pdxShelves, rdmShelf]).getState(),
    {
      at: 1,
      aircraft: [
        plane('aaaaaa', { lat: 44.25, lon: -121.15, altitudeFt: 3000 }),
        plane('bbbbbb', { lat: 45.5, lon: -121.5, altitudeFt: 3000 }),
      ],
    },
  );

  const rdm = findAircraft(traffic, {
    ...any,
    inAirspace: { airport: 'KRDM', class: 'D' },
  });
  const pdx = findAircraft(traffic, {
    ...any,
    inAirspace: { airport: 'KPDX', class: null },
  });

  expect(rdm).toMatchObject([{ hex: 'aaaaaa', partTime: true }]);
  expect(pdx).toMatchObject([{ hex: 'bbbbbb', partTime: false }]);
});

test('findAircraft without inAirspace adds no airspace fields to rows', () => {
  const rows = findAircraft(state, any);

  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(row).not.toHaveProperty('checkedAltitudeFt');
    expect(row).not.toHaveProperty('altitudeSource');
  }
});

const BEFORE_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    airline: {
      anyOf: [
        {
          type: 'string',
          description:
            'Airline ICAO code such as UAL, or a name such as United',
        },
        {
          type: 'null',
          description: '',
        },
      ],
    },
    typeCode: {
      anyOf: [
        {
          type: 'string',
          description: 'ICAO type code such as B738, or a family such as 737',
        },
        {
          type: 'null',
          description: '',
        },
      ],
    },
    kind: {
      anyOf: [
        {
          type: 'string',
          enum: ['jet', 'twin', 'single', 'rotor'],
          description:
            'Only this kind of aircraft: jet, twin (twin-engine prop), single (single-engine prop) or rotor (helicopter)',
        },
        {
          type: 'null',
          description: '',
        },
      ],
    },
    minAltitudeFt: {
      anyOf: [
        {
          type: 'number',
          description: 'Minimum altitude in feet',
        },
        {
          type: 'null',
          description: '',
        },
      ],
    },
    maxAltitudeFt: {
      anyOf: [
        {
          type: 'number',
          description: 'Maximum altitude in feet',
        },
        {
          type: 'null',
          description: '',
        },
      ],
    },
    approaching: {
      anyOf: [
        {
          type: 'string',
          description:
            'Only aircraft on approach to this airport: ICAO code from lookupPlace',
        },
        {
          type: 'null',
          description: '',
        },
      ],
    },
    near: {
      anyOf: [
        {
          type: 'object',
          properties: {
            airport: {
              type: 'string',
              description: 'ICAO code from lookupPlace, such as KBDN',
            },
            radiusNm: {
              type: 'number',
              description: 'Radius in nautical miles, 5 to 150',
            },
          },
          required: ['airport', 'radiusNm'],
          additionalProperties: false,
          description: 'Only aircraft within radiusNm of an airport',
        },
        {
          type: 'null',
          description: '',
        },
      ],
    },
    inAirspace: {
      anyOf: [
        {
          type: 'object',
          properties: {
            airport: {
              type: 'string',
              description: 'ICAO code from lookupPlace',
            },
            class: {
              anyOf: [
                {
                  type: 'string',
                  enum: ['B', 'C', 'D', 'E'],
                  description: 'Airspace class',
                },
                {
                  type: 'null',
                  description: '',
                },
              ],
            },
          },
          required: ['airport', 'class'],
          additionalProperties: false,
          description: "Only aircraft inside this airport's airspace",
        },
        {
          type: 'null',
          description: '',
        },
      ],
    },
    sortBy: {
      type: 'string',
      enum: ['altitude', 'speed', 'distance'],
      description: 'Sort order',
    },
    limit: {
      type: 'integer',
      description: 'Maximum rows, 1 to 20',
    },
  },
  required: [
    'airline',
    'typeCode',
    'kind',
    'minAltitudeFt',
    'maxAltitudeFt',
    'approaching',
    'near',
    'inAirspace',
    'sortBy',
    'limit',
  ],
  additionalProperties: false,
  description: 'Filters for aircraft currently on the map',
};

test('findAircraftInput keeps its JSON schema', () => {
  const schema = s.toJsonSchema(findAircraftInput);

  expect(schema).toEqual(BEFORE_SCHEMA);
});

function mapAny(): MapFilter {
  return {
    airline: null,
    typeCode: null,
    kind: null,
    minAltitudeFt: null,
    maxAltitudeFt: null,
    approaching: null,
    near: null,
    inAirspace: null,
  };
}

const fixtureFilters: readonly MapFilter[] = [
  mapAny(),
  { ...mapAny(), airline: 'delta' },
  { ...mapAny(), typeCode: 'a321' },
  { ...mapAny(), kind: 'jet', minAltitudeFt: 6000 },
  { ...mapAny(), maxAltitudeFt: 12000 },
  { ...mapAny(), approaching: 'KRDM' },
  { ...mapAny(), near: { airport: 'KBDN', radiusNm: 25 } },
  { ...mapAny(), inAirspace: { airport: 'KRDM', class: 'D' } },
];

const parityState = applySnapshot(
  airspaceStore([...pdxShelves, rdmShelf]).getState(),
  {
    at: 1,
    aircraft: [
      ...state.aircraft.values(),
      plane('dddddd', { lat: 44.25, lon: -121.15, altitudeFt: 3000 }),
    ],
  },
);

test('matchesResolved agrees with findAircraft for every fixture filter', () => {
  const all = [...parityState.aircraft.values()];

  const results = fixtureFilters.map((filter) => {
    const resolved = resolveFilter(parityState, filter);
    const viaPredicate =
      'unknownPlaces' in resolved
        ? []
        : all.filter((a) => matchesResolved(resolved, a)).map((a) => a.hex);
    const viaFind = findAircraft(parityState, { ...any, ...filter, limit: 20 })
      .map((row) => row.hex)
      .sort();

    return { viaPredicate: viaPredicate.sort(), viaFind };
  });

  for (const { viaPredicate, viaFind } of results) {
    expect(viaPredicate).toEqual(viaFind);
    expect(viaFind.length).toBeGreaterThan(0);
  }
  expect(results[0].viaFind).toEqual(['aaaaaa', 'bbbbbb', 'cccccc', 'dddddd']);
});

test('resolveFilter and matchesResolved treat missing fields as any', () => {
  const partial = { kind: 'jet' } as unknown as MapFilter;
  const resolved = resolveFilter(parityState, partial);

  const hexes =
    'unknownPlaces' in resolved
      ? []
      : [...parityState.aircraft.values()]
          .filter((a) => matchesResolved(resolved, a))
          .map((a) => a.hex);

  expect(hexes).toEqual(
    findAircraft(parityState, { ...any, kind: 'jet' })
      .map((row) => row.hex)
      .sort(),
  );
  expect(hexes.length).toBeGreaterThan(0);
});

test('resolveFilter reports unknown places instead of resolving them', () => {
  const filter: MapFilter = {
    ...mapAny(),
    near: { airport: 'ZZZZ', radiusNm: 25 },
    approaching: 'QQQQ',
  };

  const resolved = resolveFilter(state, filter);

  expect(resolved).toEqual({ unknownPlaces: ['QQQQ', 'ZZZZ'] });
});
