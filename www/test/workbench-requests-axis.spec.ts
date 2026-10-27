import { expect, test } from 'vitest';
import type { WorkbenchFrame } from '../examples/quickstart/runtime/workbench';
import { workbenchActiveAxis } from '../examples/quickstart/runtime/workbench-requests-axis';

const frame = (turn: number, elapsedMs: number) =>
  ({ turn, elapsedMs }) as WorkbenchFrame;

test('collapses idle time between turns', () => {
  const events = [
    frame(1, 0),
    frame(1, 1000),
    frame(2, 60000),
    frame(2, 61000),
  ];

  const axis = workbenchActiveAxis(events);

  expect(axis.turns).toHaveLength(2);
  expect(axis.turns[0].startPercent).toBe(0);
  expect(axis.turns[0].endPercent).toBeCloseTo(49);
  expect(axis.turns[1].startPercent).toBeCloseTo(51);
  expect(axis.turns[1].endPercent).toBeCloseTo(100);
  expect(axis.percentAt(500, 1)).toBeCloseTo(24.5);
  expect(axis.percentAt(60500, 2)).toBeCloseTo(75.5);
});

test('maps nearestIndex back to the closest event', () => {
  const events = [
    frame(1, 0),
    frame(1, 1000),
    frame(2, 60000),
    frame(2, 61000),
  ];
  const axis = workbenchActiveAxis(events);

  expect(axis.nearestIndex(0)).toBe(0);
  expect(axis.nearestIndex(45)).toBe(1);
  expect(axis.nearestIndex(52)).toBe(2);
  expect(axis.nearestIndex(100)).toBe(3);
});

test('honours a custom gap', () => {
  const events = [frame(1, 0), frame(1, 100), frame(2, 900), frame(2, 1000)];

  const axis = workbenchActiveAxis(events, 10);

  expect(axis.turns[0].endPercent).toBeCloseTo(45);
  expect(axis.turns[1].startPercent).toBeCloseTo(55);
});

test('handles one event and an empty run', () => {
  const single = workbenchActiveAxis([frame(1, 500)]);
  const empty = workbenchActiveAxis([]);

  expect(single.percentAt(500, 1)).toBe(0);
  expect(single.nearestIndex(80)).toBe(0);
  expect(empty.turns).toEqual([]);
  expect(empty.percentAt(10, 1)).toBe(0);
  expect(empty.nearestIndex(50)).toBeNull();
});

test('shrinks gaps so many turns stay within the axis', () => {
  const events = Array.from({ length: 80 }, (_, turn) => [
    frame(turn + 1, turn * 1000),
    frame(turn + 1, turn * 1000 + 10),
  ]).flat();

  const axis = workbenchActiveAxis(events);

  expect(axis.turns.at(-1)?.endPercent).toBeLessThanOrEqual(100.0001);
  expect(axis.turns.every((turn) => turn.startPercent >= 0)).toBe(true);
  expect(axis.percentAt(79010, 80)).toBeLessThanOrEqual(100.0001);
});

test('places a zero-span turn at its own start so later events stay reachable', () => {
  const events = [
    frame(1, 0),
    frame(1, 1000),
    frame(2, 5000),
    frame(3, 9000),
    frame(3, 10000),
  ];

  const axis = workbenchActiveAxis(events);

  expect(axis.percentAt(5000, 2)).toBeCloseTo(axis.turns[1].startPercent);
  expect(axis.percentAt(5000, 2)).toBeGreaterThan(0);
  expect(axis.nearestIndex(axis.turns[2].endPercent)).toBe(4);
  expect(axis.nearestIndex(axis.turns[1].startPercent)).toBe(2);
});
