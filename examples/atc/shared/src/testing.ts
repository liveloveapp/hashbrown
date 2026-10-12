import type { Aircraft } from './aircraft';
import type { AirspaceShelf, ChartAirport } from './chart';

/** A test aircraft: UAL100, a level Boeing 737 at 5,000 ft near Seattle. */
export function testAircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  return {
    hex: 'aaaaaa',
    label: 'UAL100',
    callsign: 'UAL100',
    registration: null,
    typeCode: 'B738',
    category: null,
    kind: 'jet',
    lat: 47.4,
    lon: -122.3,
    altitudeFt: 5000,
    onGround: false,
    groundSpeedKt: 200,
    trackDeg: 90,
    verticalRateFpm: 0,
    ...overrides,
  };
}

/** A test chart airport: KRDM (Redmond), part-time tower, one runway. */
export function testChartAirport(
  overrides: Partial<ChartAirport> = {},
): ChartAirport {
  return {
    code: 'KRDM',
    faa: 'RDM',
    name: 'ROBERTS FLD/REDMOND MUNI',
    city: 'REDMOND',
    state: 'OR',
    aliases: ['redmond'],
    lat: 44.254,
    lon: -121.15,
    elevationFt: 3082,
    kind: 'airport',
    towered: true,
    towerPartTime: true,
    frequencies: {
      tower: '124.5',
      atis: '119.025',
      ctaf: '124.5',
      unicom: '122.95',
    },
    weather: { kind: 'AWOS-3', frequency: '134.425' },
    lighting: 'limited',
    fuel: true,
    military: false,
    runways: [
      {
        id: '05/23',
        lengthFt: 7038,
        widthFt: 150,
        surface: 'ASPH',
        hard: true,
        ends: null,
        corners: null,
        bearingDeg: null,
      },
    ],
    rank: 0,
    ...overrides,
  };
}

/** A closed square `[lon, lat]` ring around (lon, lat), `half` degrees each way. */
export function squareRing(
  lon: number,
  lat: number,
  half: number,
): (readonly [number, number])[] {
  return [
    [lon - half, lat - half],
    [lon + half, lat - half],
    [lon + half, lat + half],
    [lon - half, lat + half],
    [lon - half, lat - half],
  ];
}

/**
 * A test airspace shelf: Portland's Class C, 1,100 to 4,000 MSL, a 1-degree
 * square. The bbox bounds the outer ring unless `overrides` sets one.
 */
export function testShelf(
  overrides: Partial<AirspaceShelf> = {},
): AirspaceShelf {
  const rings = overrides.rings ?? [squareRing(-121.5, 45.5, 0.5)];
  const outer = rings[0] ?? [];
  const lons = outer.map(([lon]) => lon);
  const lats = outer.map(([, lat]) => lat);

  return {
    id: 'KPDX-C-0',
    airport: 'KPDX',
    name: 'PORTLAND CLASS C',
    class: 'C',
    type: 'C',
    floor: { ft: 1100, ref: 'MSL' },
    ceiling: { ft: 4000, exclusive: false },
    partTime: false,
    rings,
    bbox: [
      Math.min(...lons),
      Math.min(...lats),
      Math.max(...lons),
      Math.max(...lats),
    ],
    ...overrides,
  };
}
