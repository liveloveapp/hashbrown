import { expect, test } from 'vitest';
import type { ChartAirport } from './chart';
import {
  airportByCode,
  airportDirectory,
  chartAirportByCode,
} from './directory';
import { FALLBACK_AIRPORTS, lookupPlace } from './places';
import { type AtcState, INITIAL_STATE } from './store';
import { testChartAirport } from './testing';

/** KRDM with no aliases or runways, unless `overrides` adds them. */
const chartAirport = (overrides: Partial<ChartAirport>) =>
  testChartAirport({ aliases: [], runways: [], weather: null, ...overrides });

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

test('fallback airports beyond the chart radius still resolve once it is ready', () => {
  const directory = airportDirectory(ready);

  const spokane = airportByCode(ready, 'KGEG');
  const sunValley = lookupPlace('Sun Valley', directory);
  const chartOnly = chartAirportByCode(ready, 'KGEG');

  expect(spokane?.code).toBe('KGEG');
  expect(lookupPlace('Spokane', directory)?.code).toBe('KGEG');
  expect(sunValley?.code).toBe('KSUN');
  expect(chartOnly).toBeNull();
  expect(directory.filter((a) => a.code === 'KRDM')).toHaveLength(1);
});
