import { expect, test } from 'vitest';
import type { ChartAirport } from './chart';
import {
  airportByCode,
  airportDirectory,
  chartAirportByCode,
} from './directory';
import { FALLBACK_AIRPORTS, lookupPlace } from './places';
import { type AtcState, INITIAL_STATE } from './store';

function chartAirport(overrides: Partial<ChartAirport>): ChartAirport {
  return {
    code: 'KRDM',
    faa: 'RDM',
    name: 'ROBERTS FLD/REDMOND MUNI',
    city: 'REDMOND',
    state: 'OR',
    aliases: [],
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
    weather: null,
    lighting: 'limited',
    fuel: true,
    military: false,
    runways: [],
    rank: 0,
    ...overrides,
  };
}

const ready: AtcState = {
  ...INITIAL_STATE,
  chart: {
    status: 'ready',
    cycle: '2610',
    airports: [
      chartAirport({}),
      chartAirport({
        code: '6K5',
        faa: '6K5',
        name: 'SISTERS EAGLE AIR',
        city: 'SISTERS',
        lat: 44.288,
        lon: -121.54,
        towered: false,
        rank: 40,
      }),
      chartAirport({
        code: 'KSEA',
        faa: 'SEA',
        name: 'SEATTLE-TACOMA INTL',
        city: 'SEATTLE',
        lat: 47.45,
        lon: -122.31,
        rank: 1,
      }),
      chartAirport({
        code: 'KBFI',
        faa: 'BFI',
        name: 'BOEING FIELD/KING COUNTY INTL',
        city: 'SEATTLE',
        lat: 47.53,
        lon: -122.3,
        rank: 2,
      }),
    ],
  },
};

test('while the chart loads, the directory is the fallback table', () => {
  const directory = airportDirectory(INITIAL_STATE);

  expect(directory).toBe(FALLBACK_AIRPORTS);
});

test('a ready chart resolves airports without an ICAO code by FAA ident', () => {
  const directory = airportDirectory(ready);

  const found = lookupPlace('6K5', directory);

  expect(found?.code).toBe('6K5');
  expect(lookupPlace('Sisters', directory)?.code).toBe('6K5');
});

test('fallback aliases still resolve against the chart airports', () => {
  const directory = airportDirectory(ready);

  const found = lookupPlace('SeaTac', directory);

  expect(found?.code).toBe('KSEA');
});

test('a shared city keeps the fallback priority (Seattle is KSEA)', () => {
  const directory = airportDirectory(ready);

  const found = lookupPlace('Seattle', directory);

  expect(found?.code).toBe('KSEA');
});

test('airportByCode matches ICAO or FAA ident, ignoring case', () => {
  const byIcao = airportByCode(ready, 'krdm');
  const byFaa = airportByCode(ready, 'RDM');
  const missing = airportByCode(ready, 'KJFK');

  expect(byIcao?.code).toBe('KRDM');
  expect(byFaa?.code).toBe('KRDM');
  expect(missing).toBeNull();
});

test('chartAirportByCode is null while only the fallback is loaded', () => {
  const result = chartAirportByCode(INITIAL_STATE, 'KRDM');

  expect(result).toBeNull();
  expect(airportByCode(INITIAL_STATE, 'KRDM')?.code).toBe('KRDM');
});
