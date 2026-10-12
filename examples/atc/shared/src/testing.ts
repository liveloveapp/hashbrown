import type { Aircraft } from './aircraft';
import type { ChartAirport } from './chart';

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
