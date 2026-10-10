import { expect, test } from 'vitest';
import {
  formatAltitude,
  formatClock,
  formatHeading,
  formatSpeed,
  plainLabel,
} from './format';
import { aircraftTypeName, airlineName } from './names';

test('formatAltitude handles flight levels, the ground and missing data', () => {
  const values = [
    formatAltitude({ altitudeFt: 35000, onGround: false }),
    formatAltitude({ altitudeFt: null, onGround: true }),
    formatAltitude({ altitudeFt: null, onGround: false }),
  ];

  expect(values).toEqual(['35,000 ft', 'On ground', 'n/a']);
});

test('formatSpeed, formatHeading and formatClock produce short labels', () => {
  const labels = [
    formatSpeed(491.6),
    formatSpeed(null),
    formatHeading(5.4),
    formatHeading(360),
    formatHeading(null),
    formatClock(Date.UTC(2026, 9, 9, 0, 5), 'UTC'),
  ];

  expect(labels).toEqual(['492 kt', 'n/a', '005°', '000°', 'n/a', '00:05']);
});

test('names fall back to the raw code', () => {
  const labels = [
    airlineName('UAL1372'),
    airlineName('ZZZ123'),
    aircraftTypeName('B39M'),
    aircraftTypeName('ZZ99'),
    aircraftTypeName(null),
  ];

  expect(labels).toEqual([
    'United Airlines',
    'ZZZ',
    'Boeing 737 MAX 9',
    'ZZ99',
    'Unknown type',
  ]);
});

test('plainLabel swaps dashes for commas and tidies spaces', () => {
  const labels = [
    plainLabel('Arrivals at Seattle — nearest first'),
    plainLabel('Arrivals – Seattle'),
    plainLabel('Seattle—Portland'),
    plainLabel('  Nearest   first '),
  ];

  expect(labels).toEqual([
    'Arrivals at Seattle, nearest first',
    'Arrivals, Seattle',
    'Seattle, Portland',
    'Nearest first',
  ]);
});
