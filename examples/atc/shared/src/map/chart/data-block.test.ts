// @vitest-environment jsdom
import { expect, test } from 'vitest';
import type { ChartAirport } from '../../chart';
import { dataBlockLines, renderDataBlock } from './data-block';

const runway05 = {
  id: '05/23',
  lengthFt: 7038,
  widthFt: 150,
  surface: 'ASPH',
  hard: true,
  ends: null,
  corners: null,
  bearingDeg: 60,
} as const;

const base: ChartAirport = {
  code: 'KRDM',
  faa: 'RDM',
  name: 'ROBERTS FLD/REDMOND MUNI',
  city: 'REDMOND',
  state: 'OR',
  aliases: [],
  lat: 44.25,
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
  rank: 0,
  runways: [
    {
      id: '05/23',
      lengthFt: 7038,
      widthFt: 150,
      surface: 'ASPH',
      hard: true,
      ends: null,
      corners: null,
      bearingDeg: 60,
    },
    {
      id: '11/29',
      lengthFt: 7006,
      widthFt: 100,
      surface: 'ASPH',
      hard: true,
      ends: null,
      corners: null,
      bearingDeg: 105,
    },
  ],
};

test('a part-time towered field reads like the sectional', () => {
  const lines = dataBlockLines(base, 10);

  expect(lines).toEqual([
    'ROBERTS FLD/REDMOND MUNI (RDM)',
    'CT 124.5★ ATIS 119.025',
    '3082 *L 70 122.95',
  ]);
});

test('a non-towered field shows its weather station and CTAF', () => {
  const bend: ChartAirport = {
    ...base,
    faa: 'BDN',
    name: 'BEND MUNI',
    towered: false,
    towerPartTime: false,
    frequencies: { tower: null, atis: null, ctaf: '123.0', unicom: null },
    weather: { kind: 'AWOS-3', frequency: '134.425' },
    elevationFt: 3459,
    runways: [{ ...runway05, id: '17/35', lengthFt: 5200 }],
  };

  const lines = dataBlockLines(bend, 10);

  expect(lines).toEqual([
    'BEND MUNI (BDN)',
    'AWOS-3 134.425',
    '3459 *L 52 123.0',
  ]);
});

test('8,069 ft rounds to 80 and 8,070 ft to 81', () => {
  const short = { ...base, runways: [{ ...runway05, lengthFt: 8069 }] };
  const long = { ...base, runways: [{ ...runway05, lengthFt: 8070 }] };

  expect(dataBlockLines(short, 10)[2]).toBe('3082 *L 80 122.95');
  expect(dataBlockLines(long, 10)[2]).toBe('3082 *L 81 122.95');
});

test('at diagram zoom only the name line shows', () => {
  const lines = dataBlockLines(base, 12);

  expect(lines).toEqual(['ROBERTS FLD/REDMOND MUNI (RDM)']);
});

test('rendered blocks use text nodes, so markup in names stays text', () => {
  const lines = ['<b>X</b> (ABC)'];

  const block = renderDataBlock(document, lines, 'towered');

  expect(block.classList.contains('is-towered')).toBe(true);
  expect(block.classList.contains('atc-apt-block')).toBe(true);
  expect(block.querySelector('b')).toBeNull();
  expect(block.textContent).toBe('<b>X</b> (ABC)');
});
