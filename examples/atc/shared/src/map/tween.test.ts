import { expect, test } from 'vitest';
import {
  deadReckon,
  MAX_DEAD_RECKON_S,
  motionPosition,
  motionSettled,
  nextMotion,
  shouldTween,
} from './tween';

const fix = {
  lat: 44,
  lon: -121,
  trackDeg: 90,
  groundSpeedKt: 360,
  onGround: false,
};

function close(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
) {
  return Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lon - b.lon) < 1e-9;
}

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

test('deadReckon moves along the track at the ground speed', () => {
  const north = deadReckon({ lat: 44, lon: -121 }, 0, 360, 10);
  const east = deadReckon({ lat: 60, lon: -121 }, 90, 360, 10);
  const still = deadReckon({ lat: 44, lon: -121 }, 45, 0, 10);

  // 360 kt for 10 s is 1 nm: 1/60 degree of latitude, 1/30 of longitude at 60°.
  expect(north.lat).toBeCloseTo(44 + 1 / 60, 9);
  expect(north.lon).toBeCloseTo(-121, 9);
  expect(east.lon).toBeCloseTo(-121 + 1 / 30, 9);
  expect(still).toEqual({ lat: 44, lon: -121 });
});

test('a first fix starts at the reported position and dead-reckons up to the cap', () => {
  const motion = nextMotion(undefined, fix, null, 1000);

  const start = motionPosition(motion, 1000);
  const later = motionPosition(motion, 6000);
  const capped = motionPosition(motion, 1000 + MAX_DEAD_RECKON_S * 1000);
  const beyond = motionPosition(motion, 1000 + 60_000);

  expect(start).toEqual({ lat: 44, lon: -121 });
  expect(later.lon).toBeGreaterThan(-121);
  expect(beyond).toEqual(capped);
  expect(motionSettled(motion, 6000)).toBe(false);
  expect(motionSettled(motion, 1000 + MAX_DEAD_RECKON_S * 1000)).toBe(true);
});

test('a new fix eases from where the plane is drawn instead of jumping', () => {
  const first = nextMotion(undefined, fix, null, 0);
  const drawn = motionPosition(first, 3000);
  const report = { ...fix, lon: -120.98 };

  const next = nextMotion(first, report, drawn, 3000);

  expect(close(motionPosition(next, 3000), drawn)).toBe(true);
  expect(
    close(motionPosition(next, 5000), deadReckon(report, 90, 360, 2)),
  ).toBe(true);
});

test('a repeated fix keeps dead-reckoning from the first time it was seen', () => {
  const first = nextMotion(undefined, fix, null, 0);

  const repeat = nextMotion(
    first,
    { ...fix },
    motionPosition(first, 3000),
    3000,
  );

  expect(repeat).toBe(first);
});

test('planes on the ground, without a speed, or jumping far do not glide', () => {
  const grounded = nextMotion(undefined, { ...fix, onGround: true }, null, 0);
  const unknown = nextMotion(
    undefined,
    { ...fix, groundSpeedKt: null },
    null,
    0,
  );
  const far = nextMotion(
    nextMotion(undefined, fix, null, 0),
    { ...fix, lon: -118 },
    { lat: 44, lon: -121 },
    3000,
  );

  expect(motionPosition(grounded, 9000)).toEqual({ lat: 44, lon: -121 });
  expect(motionSettled(unknown, 0)).toBe(true);
  expect(motionPosition(far, 3000)).toEqual({ lat: 44, lon: -118 });
});
