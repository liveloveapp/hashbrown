import {
  ELAPSED_TICK_MS,
  formatDuration,
  NO_FLASH_MS,
  noFlashRemaining,
} from './tool-step-timing';

test.each([
  [0, '<1s'],
  [0.5, '<1s'],
  [999, '<1s'],
  [1000, '1s'],
  [1999, '1s'],
  [59999, '59s'],
  [60000, '1m 0s'],
  [61999, '1m 1s'],
  [3600000, '60m 0s'],
])('formats duration %s as %s', (milliseconds, expected) => {
  const input = milliseconds;

  const result = formatDuration(input as number);

  expect(result).toBe(expected);
});

test.each([undefined, NaN, Infinity, -Infinity, -1])(
  'keeps unknown or invalid duration %s unknown',
  (milliseconds) => {
    const input = milliseconds;

    const result = formatDuration(input);

    expect(result).toBeUndefined();
  },
);

test('exposes the no-flash window and elapsed tick cadence', () => {
  const expectedWindow = 300;
  const expectedCadence = 1000;

  const values = [NO_FLASH_MS, ELAPSED_TICK_MS];

  expect(values).toEqual([expectedWindow, expectedCadence]);
});

test.each([
  [1000, 1000, 300],
  [1000, 1299, 1],
  [1000, 1300, 0],
  [1000, 1301, 0],
  [-500, -400, 200],
  [0, 0.5, 299.5],
])('computes no-flash remaining from %s at %s', (startedAt, now, expected) => {
  const start = startedAt;
  const clock = now;

  const result = noFlashRemaining(start, clock);

  expect(result).toBe(expected);
});

test.each([
  [undefined, 1000],
  [NaN, 1000],
  [Infinity, 1000],
  [-Infinity, 1000],
  [1000, NaN],
  [1000, Infinity],
  [1000, -Infinity],
  [1001, 1000],
])(
  'keeps missing or incompatible clocks %s and %s unknown',
  (startedAt, now) => {
    const start = startedAt;
    const clock = now;

    const result = noFlashRemaining(start, clock);

    expect(result).toBeUndefined();
  },
);
