import { expect, test } from 'vitest';
import { amToSurfaces, osmToSurfaces } from './surfaces';

const ring = [
  [-122.3, 47.4],
  [-122.29, 47.4],
  [-122.29, 47.41],
  [-122.3, 47.4],
];

const polygon = (designator: string) => ({
  type: 'Feature',
  properties: { DESIGNATOR: designator },
  geometry: { type: 'Polygon', coordinates: [ring] },
});

const empty = { type: 'FeatureCollection', features: [] };

test('amToSurfaces reads taxiway refs and maps UNK to null', () => {
  const taxiways = {
    type: 'FeatureCollection',
    features: [polygon('D_B'), polygon('UNK')],
  };

  const result = amToSurfaces('KSEA', {
    taxiways,
    aprons: empty,
    hotspots: empty,
  });

  expect(result?.source).toBe('faa');
  expect(result?.code).toBe('KSEA');
  expect(result?.features.map((f) => f.ref)).toEqual(['D', null]);
});

test('amToSurfaces reads aprons, hot spots and multipolygons', () => {
  const layers = {
    taxiways: {
      features: [
        {
          properties: { DESIGNATOR: 'A' },
          geometry: { type: 'MultiPolygon', coordinates: [[ring], [ring]] },
        },
      ],
    },
    aprons: { features: [polygon('NORTH')] },
    hotspots: {
      features: [
        {
          properties: { HOT_ID: 3 },
          geometry: { type: 'Polygon', coordinates: [ring] },
        },
      ],
    },
  };

  const result = amToSurfaces('KSEA', layers);

  expect(result?.features.map((f) => [f.kind, f.ref])).toEqual([
    ['taxiway', 'A'],
    ['taxiway', 'A'],
    ['apron', 'NORTH'],
    ['hotspot', 'HS 3'],
  ]);
});

test('amToSurfaces returns null without taxiways', () => {
  const result = amToSurfaces('KRDM', {
    taxiways: empty,
    aprons: { features: [polygon('X')] },
    hotspots: empty,
  });

  expect(result).toBeNull();
});

const pt = (lat: number, lon: number) => ({ lat, lon });

test('osmToSurfaces converts aprons, taxiways and holds', () => {
  const overpass = {
    elements: [
      {
        type: 'way',
        tags: { aeroway: 'apron' },
        geometry: [pt(1, 2), pt(1, 3), pt(2, 3), pt(1, 2)],
      },
      {
        type: 'way',
        tags: { aeroway: 'taxiway', ref: 'A', width: '15.2' },
        geometry: [pt(1, 2), pt(1.5, 2.5)],
      },
      {
        type: 'way',
        tags: { aeroway: 'taxilane' },
        geometry: [pt(1, 2), pt(1.5, 2.5)],
      },
      {
        type: 'way',
        tags: { aeroway: 'holding_position' },
        geometry: [pt(1.1234567, 2), pt(1.5, 2.5)],
      },
      {
        type: 'way',
        tags: { aeroway: 'runway' },
        geometry: [pt(1, 2), pt(1.5, 2.5)],
      },
    ],
  };

  const result = osmToSurfaces('KRDM', overpass);

  expect(result.source).toBe('osm');
  expect(result.features.map((f) => f.kind)).toEqual([
    'apron',
    'taxiway',
    'taxiway',
    'hold',
  ]);
  const taxiway = result.features[1];
  expect(taxiway.shape === 'line' && taxiway.widthFt).toBeCloseTo(49.87, 1);
  expect(taxiway.ref).toBe('A');
  const hold = result.features[3];
  expect(hold.shape === 'line' && hold.points[0]).toEqual([2, 1.123457]);
});

test('osmToSurfaces reports runways-only for an empty payload', () => {
  const result = osmToSurfaces('KRDM', { elements: [] });

  expect(result).toEqual({
    code: 'KRDM',
    source: 'runways-only',
    features: [],
  });
});

test('osmToSurfaces strips Taxiway and TWY prefixes and keeps the first of several refs', () => {
  const taxiway = (ref: string) => ({
    type: 'way',
    tags: { aeroway: 'taxiway', ref },
    geometry: [pt(1, 2), pt(1.5, 2.5)],
  });
  const overpass = {
    elements: [
      taxiway('Taxiway A'),
      taxiway('twy b2'),
      taxiway('A;B'),
      taxiway(' c '),
      taxiway('Taxiway '),
    ],
  };

  const result = osmToSurfaces('KBDN', overpass);

  expect(result.features.map((f) => f.ref)).toEqual([
    'A',
    'B2',
    'A',
    'C',
    null,
  ]);
});
