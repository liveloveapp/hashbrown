import { expect, test } from 'vitest';
import { AREAS, parseAirspace } from '@atc/shared';
import { normaliseAirspace } from './airspace';

const RING = (lon: number, lat: number, d = 0.1): number[][] => [
  [lon - d, lat - d],
  [lon + d, lat - d],
  [lon + d, lat + d],
  [lon - d, lat + d],
  [lon - d, lat - d],
];

function feature(
  properties: Record<string, unknown>,
  coordinates: number[][][] | number[][][][] = [RING(-122.6, 45.58)],
  type = 'Polygon',
): unknown {
  return {
    type: 'Feature',
    properties: {
      NAME: 'PORTLAND INTERNATIONAL AIRPORT CLASS C',
      IDENT: 'PDX',
      ICAO_ID: 'KPDX',
      CLASS: 'C',
      LOCAL_TYPE: 'CLASS_C',
      LOWER_VAL: 0,
      LOWER_CODE: 'SFC',
      UPPER_VAL: 4000,
      UPPER_CODE: 'MSL',
      UPPER_DESC: 'TI',
      WKHR_CODE: 'H24',
      ...properties,
    },
    geometry: { type, coordinates },
  };
}

const pdxSurface = feature({});
const pdxShelf = feature({
  LOWER_VAL: 1100,
  LOWER_CODE: 'MSL',
  UPPER_DESC: null,
});
const redmondD = feature(
  {
    NAME: 'REDMOND MUNI AIRPORT CLASS D',
    IDENT: 'RDM',
    ICAO_ID: 'KRDM',
    CLASS: 'D',
    LOCAL_TYPE: 'CLASS_D',
    UPPER_VAL: 5600,
    WKHR_CODE: 'NOTAM',
  },
  [RING(-121.15, 44.25)],
);
const redmondE2 = feature(
  {
    NAME: 'REDMOND MUNI AIRPORT CLASS E2',
    IDENT: 'RDM',
    ICAO_ID: 'KRDM',
    CLASS: 'E',
    LOCAL_TYPE: 'CLASS_E2',
    UPPER_VAL: -9998,
    UPPER_CODE: null,
    UPPER_DESC: 'AA',
    WKHR_CODE: 'RMK',
  },
  [RING(-121.15, 44.25, 0.2)],
);
const bendE2 = feature(
  {
    NAME: 'BEND MUNI AIRPORT CLASS E2',
    IDENT: 'BDN',
    ICAO_ID: 'KBDN',
    CLASS: 'E',
    LOCAL_TYPE: 'CLASS_E2',
    UPPER_VAL: -9998,
    UPPER_DESC: 'AA',
  },
  [RING(-121.2, 44.09)],
);
const noLocalType = feature(
  {
    NAME: 'SOMEWHERE AIRPORT CLASS D',
    IDENT: 'S33',
    ICAO_ID: null,
    CLASS: 'D',
    LOCAL_TYPE: null,
    UPPER_VAL: 3000,
  },
  [RING(-121.5, 44.3)],
);
const invalid = feature({ NAME: 'BROKEN' }, [[[1, 2]]]);
const far = feature({ IDENT: 'JFK', ICAO_ID: 'KJFK' }, [RING(-73.8, 40.6)]);

const centre = { lat: AREAS.pnw.lat, lon: AREAS.pnw.lon };

test('maps types, floors, ceilings, exclusivity and part-time', () => {
  const features = [pdxSurface, pdxShelf, redmondD, redmondE2, bendE2];

  const { shelves, dropped } = normaliseAirspace(features, centre, 250);

  expect(dropped).toBe(0);
  expect(shelves.map((s) => [s.id, s.type, s.class])).toEqual([
    ['KPDX-C-1', 'C', 'C'],
    ['KPDX-C-2', 'C', 'C'],
    ['KRDM-D-1', 'D', 'D'],
    ['KRDM-E2-1', 'E2', 'E'],
    ['KBDN-E2-1', 'E2', 'E'],
  ]);
  expect(shelves[0].floor).toEqual({ ft: 0, ref: 'SFC' });
  expect(shelves[0].ceiling).toEqual({ ft: 4000, exclusive: false });
  expect(shelves[1].floor).toEqual({ ft: 1100, ref: 'MSL' });
  expect(shelves[1].ceiling).toEqual({ ft: 4000, exclusive: false });
  expect(shelves[2].partTime).toBe(true);
  expect(shelves[0].partTime).toBe(false);
  expect(shelves[3].ceiling).toBeNull();
});

test('TI (to and including) is an inclusive ceiling; TNI (to not including) is exclusive', () => {
  const including = feature({ UPPER_DESC: 'TI' });
  const notIncluding = feature({
    NAME: 'SEATTLE CLASS D',
    IDENT: 'BFI',
    ICAO_ID: 'KBFI',
    CLASS: 'D',
    LOCAL_TYPE: 'CLASS_D',
    UPPER_VAL: 3000,
    UPPER_DESC: 'TNI',
  });

  const { shelves } = normaliseAirspace([including, notIncluding], centre, 250);

  expect(shelves.map((s) => s.ceiling)).toEqual([
    { ft: 4000, exclusive: false },
    { ft: 3000, exclusive: true },
  ]);
});

test('a nonzero floor coded SFC is above ground level, so it is dropped', () => {
  const agl = feature({ LOWER_VAL: 700, LOWER_CODE: 'SFC' });

  const { shelves, dropped } = normaliseAirspace(
    [agl, pdxSurface],
    centre,
    250,
  );

  expect(shelves.map((s) => s.floor)).toEqual([{ ft: 0, ref: 'SFC' }]);
  expect(dropped).toBe(1);
});

test('a null LOCAL_TYPE falls back to CLASS and IDENT', () => {
  const { shelves } = normaliseAirspace([noLocalType], centre, 250);

  expect(shelves[0]).toMatchObject({ airport: 'S33', type: 'D', class: 'D' });
  expect(shelves[0].id).toBe('S33-D-1');
});

test('filters features outside the area and counts invalid ones', () => {
  const { shelves, dropped } = normaliseAirspace(
    [far, invalid, redmondD],
    centre,
    250,
  );

  expect(shelves.map((s) => s.airport)).toEqual(['KRDM']);
  expect(dropped).toBe(1);
});

test('splits a MultiPolygon, rounds to 5 decimals and computes the bbox', () => {
  const multi = feature(
    {},
    [
      [
        [
          [-121.123456789, 44.1],
          [-121.0, 44.1],
          [-121.0, 44.2],
          [-121.123456789, 44.1],
        ],
      ],
      [RING(-121.5, 44.3)],
    ],
    'MultiPolygon',
  );

  const { shelves } = normaliseAirspace([multi], centre, 250);

  expect(shelves).toHaveLength(2);
  expect(shelves[0].rings[0][0]).toEqual([-121.12346, 44.1]);
  expect(shelves[0].bbox).toEqual([-121.12346, 44.1, -121, 44.2]);
  expect(shelves.map((s) => s.id)).toEqual(['KPDX-C-1', 'KPDX-C-2']);
});

test('the output round-trips through parseAirspace', () => {
  const { shelves } = normaliseAirspace(
    [pdxSurface, pdxShelf, redmondD, redmondE2, bendE2, noLocalType],
    centre,
    250,
  );

  const parsed = parseAirspace({
    cycle: '2610',
    effective: '2026-10-01',
    shelves,
  });

  expect(parsed.shelves).toEqual(shelves);
});

test('a non-array input yields nothing', () => {
  expect(normaliseAirspace(null, centre, 250)).toEqual({
    shelves: [],
    dropped: 0,
  });
});
