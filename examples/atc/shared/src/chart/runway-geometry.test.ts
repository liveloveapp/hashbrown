import { expect, test } from 'vitest';
import { distanceNm } from '../geo';
import type { LatLon } from '../places';
import { testChartAirport } from '../testing';
import {
  bearingDeg,
  longestHardRunwayFt,
  metresPerPixel,
  ringCentroid,
  runwayCorners,
} from './runway-geometry';

const NM_TO_FT = 6076.12;
// KRDM runway 05/23 thresholds from NASR (7,038 ft by 150 ft).
const end05 = { lat: 44.24950936, lon: -121.16178461 };
const end23 = { lat: 44.25905422, lon: -121.13844225 };

test('runway corners are as long as the runway and as wide as its width', () => {
  const corners = runwayCorners(end05, end23, 150);

  const [a, b, c, d] = corners as [LatLon, LatLon, LatLon, LatLon];
  const lengthFt = distanceNm(a, b) * NM_TO_FT;
  const widthFt = distanceNm(b, c) * NM_TO_FT;

  expect(corners).toHaveLength(4);
  expect(lengthFt).toBeGreaterThan(7038 - 15);
  expect(lengthFt).toBeLessThan(7038 + 15);
  expect(widthFt).toBeGreaterThan(148);
  expect(widthFt).toBeLessThan(152);
  expect(distanceNm(a, d) * NM_TO_FT).toBeCloseTo(widthFt, 0);
});

test('bearing between runway ends is the true alignment', () => {
  const bearing = bearingDeg(end05, end23);

  expect(bearing).toBeGreaterThan(58);
  expect(bearing).toBeLessThan(62);
});

test('metres per pixel halves with each zoom level', () => {
  const z10 = metresPerPixel(10, 44);
  const z11 = metresPerPixel(11, 44);

  expect(z10).toBeCloseTo(109.97, 1);
  expect(z11 * 2).toBeCloseTo(z10, 6);
});

test('longestHardRunwayFt is the longest paved runway, ignoring turf', () => {
  const runway = testChartAirport().runways[0];
  const airport = testChartAirport({
    runways: [
      { ...runway, lengthFt: 5000 },
      { ...runway, lengthFt: 9000, hard: false },
      { ...runway, lengthFt: 7000 },
    ],
  });

  const longest = longestHardRunwayFt(airport);

  expect(longest).toBe(7000);
});

test('longestHardRunwayFt is 0 without a paved runway', () => {
  const airport = testChartAirport({ runways: [] });

  const longest = longestHardRunwayFt(airport);

  expect(longest).toBe(0);
});

test('ringCentroid averages the vertices it is given', () => {
  const ring = [
    [-121, 44],
    [-120, 44],
    [-120, 46],
  ] as const;

  const centre = ringCentroid(ring);

  expect(centre?.lat).toBeCloseTo(44.6667, 4);
  expect(centre?.lon).toBeCloseTo(-120.3333, 4);
});

test('ringCentroid of an empty ring is null', () => {
  const centre = ringCentroid([]);

  expect(centre).toBeNull();
});
