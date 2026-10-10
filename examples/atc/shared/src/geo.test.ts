import { expect, test } from 'vitest';
import type { Aircraft } from './aircraft';
import { distanceNm, etaMinutes, isApproaching } from './geo';
import { AIRPORTS } from './places';

const base: Aircraft = {
  hex: 'a1b2c3',
  callsign: 'UAL1',
  typeCode: 'B738',
  lat: 42.1,
  lon: -87.9,
  altitudeFt: 6000,
  onGround: false,
  groundSpeedKt: 240,
  trackDeg: 180,
  verticalRateFpm: -800,
};

test('distanceNm measures great-circle distance in nautical miles', () => {
  const ord = AIRPORTS.ORD;
  const mdw = AIRPORTS.MDW;

  const distance = distanceNm(ord, mdw);

  expect(distance).toBeCloseTo(13.4, 0);
});

test('etaMinutes rounds up and needs a positive ground speed', () => {
  const cases = [etaMinutes(20, 240), etaMinutes(20, 0), etaMinutes(20, null)];

  expect(cases).toEqual([5, null, null]);
});

test('isApproaching requires near, descending, low and airborne', () => {
  const ord = AIRPORTS.ORD;

  const results = [
    isApproaching(base, ord),
    isApproaching({ ...base, verticalRateFpm: 0 }, ord),
    isApproaching({ ...base, verticalRateFpm: null }, ord),
    isApproaching({ ...base, altitudeFt: 15000 }, ord),
    isApproaching({ ...base, lat: 43.5 }, ord),
    isApproaching({ ...base, onGround: true }, ord),
  ];

  expect(results).toEqual([true, false, false, false, false, false]);
});
