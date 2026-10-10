import { expect, test } from 'vitest';
import {
  lerpLatLon,
  shouldTween,
  tweenDurationMs,
  tweenProgress,
} from './tween';

test('lerpLatLon interpolates linearly and clamps t to 0..1', () => {
  const from = { lat: 44, lon: -121 };
  const to = { lat: 45, lon: -123 };

  const points = [
    lerpLatLon(from, to, 0),
    lerpLatLon(from, to, 0.25),
    lerpLatLon(from, to, 1),
    lerpLatLon(from, to, -1),
    lerpLatLon(from, to, 2),
  ];

  expect(points).toEqual([
    { lat: 44, lon: -121 },
    { lat: 44.25, lon: -121.5 },
    { lat: 45, lon: -123 },
    { lat: 44, lon: -121 },
    { lat: 45, lon: -123 },
  ]);
});

test('shouldTween only for moves up to 20 nm', () => {
  const here = { lat: 44, lon: -121 };

  const results = [
    shouldTween(here, { lat: 44.1, lon: -121 }),
    shouldTween(here, { lat: 44 + 20 / 60 - 0.001, lon: -121 }),
    shouldTween(here, { lat: 44 + 20 / 60 + 0.001, lon: -121 }),
    shouldTween(here, { ...here }),
  ];

  expect(results).toEqual([true, true, false, false]);
});

test('tweenDurationMs is the gap since the previous snapshot, clamped to 250 to 10,000 ms', () => {
  const durations = [
    tweenDurationMs(null, 5000),
    tweenDurationMs(1000, 4000),
    tweenDurationMs(1000, 1100),
    tweenDurationMs(1000, 60_000),
  ];

  expect(durations).toEqual([0, 3000, 250, 10_000]);
});

test('tweenProgress runs from 0 to 1 over the duration and is done without one', () => {
  const progress = [
    tweenProgress(1000, 2000, 1000),
    tweenProgress(1000, 2000, 2000),
    tweenProgress(1000, 2000, 5000),
    tweenProgress(1000, 0, 1000),
  ];

  expect(progress).toEqual([0, 0.5, 1, 1]);
});
