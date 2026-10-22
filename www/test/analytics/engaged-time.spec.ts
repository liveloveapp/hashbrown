import { expect, test } from 'vitest';
import {
  createEngagedTimeTracker,
  ENGAGED_TIME_THRESHOLDS_MS,
} from '../../src/lib/analytics/engaged-time';

function harness(startVisible: boolean) {
  let now = 0;
  const fired: number[] = [];
  const tracker = createEngagedTimeTracker({
    now: () => now,
    startVisible,
    onThreshold: (ms) => fired.push(ms),
  });
  return {
    tracker,
    fired,
    advance(ms: number) {
      now += ms;
      tracker.tick();
    },
  };
}

test('thresholds are 10 and 30 seconds', () => {
  const thresholds = ENGAGED_TIME_THRESHOLDS_MS;

  const result = [...thresholds];

  expect(result).toEqual([10_000, 30_000]);
});

test('engaged time counts only visible time and fires 10 then 30 once each', () => {
  const { tracker, fired, advance } = harness(true);

  advance(9_000);
  tracker.setVisible(false);
  advance(60_000);
  tracker.setVisible(true);
  advance(1_000);
  advance(19_999);
  advance(1);
  advance(60_000);

  expect(fired).toEqual([10_000, 30_000]);
  expect(tracker.visibleMs()).toBe(90_000);
  expect(tracker.isComplete()).toBe(true);
});

test('a page that starts hidden counts nothing until it is shown', () => {
  const { tracker, fired, advance } = harness(false);

  advance(20_000);
  tracker.setVisible(true);
  advance(9_999);

  expect(fired).toEqual([]);
  expect(tracker.visibleMs()).toBe(9_999);
});

test('re-asserting visible does not restart the run', () => {
  const { tracker, fired, advance } = harness(true);

  advance(6_000);
  tracker.setVisible(true);
  advance(4_000);

  expect(fired).toEqual([10_000]);
});
