import { expect, test } from 'vitest';
import type { Aircraft } from './aircraft';
import { distanceNm, etaMinutes, isApproaching } from './geo';
import { AIRPORTS } from './places';

const base: Aircraft = {
  hex: 'a1b2c3',
  label: 'UAL1',
  callsign: 'UAL1',
  registration: null,
  typeCode: 'B738',
  category: null,
  kind: 'jet',
  lat: 47.5716,
  lon: -122.3088,
  altitudeFt: 6000,
  onGround: false,
  groundSpeedKt: 240,
  trackDeg: 180,
  verticalRateFpm: -800,
};

test('distanceNm measures great-circle distance in nautical miles', () => {
  const sea = AIRPORTS.KSEA;
  const pdx = AIRPORTS.KPDX;

  const distance = distanceNm(sea, pdx);

  expect(distance).toBeCloseTo(112.4, 0);
});

test('etaMinutes rounds up and needs a positive ground speed', () => {
  const cases = [etaMinutes(20, 240), etaMinutes(20, 0), etaMinutes(20, null)];

  expect(cases).toEqual([5, null, null]);
});

test('isApproaching requires near, descending, low and airborne', () => {
  const sea = AIRPORTS.KSEA;

  const results = [
    isApproaching(base, sea),
    isApproaching({ ...base, verticalRateFpm: 0 }, sea),
    isApproaching({ ...base, verticalRateFpm: null }, sea),
    isApproaching({ ...base, altitudeFt: 15000 }, sea),
    isApproaching({ ...base, lat: 48.5 }, sea),
    isApproaching({ ...base, onGround: true }, sea),
  ];

  expect(results).toEqual([true, false, false, false, false, false]);
});
