// @vitest-environment jsdom
import { expect, test } from 'vitest';
import {
  adjacentTurnIndex,
  formatPlaybackSeconds,
  nextPlaybackSpeed,
  workbenchShortcut,
  workbenchTickPercent,
  workbenchTurnSegments,
} from '../examples/quickstart/runtime/workbench-player';

const events = [1, 1, 1, 2, 2].map((turn) => ({ turn }));
const keys = {
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
};

test('splits events into turn segments', () => {
  const segments = workbenchTurnSegments(events);

  expect(segments).toEqual([
    { turn: 1, start: 0, end: 2 },
    { turn: 2, start: 3, end: 4 },
  ]);
});

test('positions ticks by event index', () => {
  expect(workbenchTickPercent(0, 1)).toBe(0);
  expect(workbenchTickPercent(61, 123)).toBe(50);
  expect(workbenchTickPercent(122, 123)).toBe(100);
});

test('jumps between turns like a media player', () => {
  expect(adjacentTurnIndex(events, 4, -1)).toBe(3);
  expect(adjacentTurnIndex(events, 3, -1)).toBe(0);
  expect(adjacentTurnIndex(events, 0, -1)).toBeNull();
  expect(adjacentTurnIndex(events, 1, 1)).toBe(3);
  expect(adjacentTurnIndex(events, 3, 1)).toBeNull();
  expect(adjacentTurnIndex(events, null, -1)).toBe(3);
  expect(adjacentTurnIndex([], null, -1)).toBeNull();
  expect(adjacentTurnIndex(events, 99, -1)).toBe(3);
});

test('formats time and cycles speed', () => {
  expect(formatPlaybackSeconds(7330)).toBe('7.33 s');
  expect(formatPlaybackSeconds(2140)).toBe('2.14 s');
  expect(nextPlaybackSpeed(0.5)).toBe(1);
  expect(nextPlaybackSpeed(1)).toBe(2);
  expect(nextPlaybackSpeed(2)).toBe(0.5);
  expect(nextPlaybackSpeed(3)).toBe(1);
});

test('maps keys to shortcuts outside text fields and buttons', () => {
  const button = document.createElement('button');
  const range = document.createElement('input');
  range.type = 'range';
  const textarea = document.createElement('textarea');
  document.body.append(button, range, textarea);

  expect(workbenchShortcut({ ...keys, key: ' ' }, document.body)).toBe(
    'toggle-play',
  );
  expect(
    workbenchShortcut(
      { ...keys, key: 'ArrowLeft', shiftKey: true },
      document.body,
    ),
  ).toBe('previous-turn');
  expect(workbenchShortcut({ ...keys, key: 'ArrowRight' }, document.body)).toBe(
    'next-event',
  );
  expect(
    workbenchShortcut({ ...keys, key: 'b', metaKey: true }, document.body),
  ).toBe('toggle-sidebar');
  expect(workbenchShortcut({ ...keys, key: 'L' }, document.body)).toBe('live');
  expect(workbenchShortcut({ ...keys, key: ' ' }, button)).toBeNull();
  expect(workbenchShortcut({ ...keys, key: 'ArrowRight' }, range)).toBeNull();
  expect(workbenchShortcut({ ...keys, key: 'l' }, textarea)).toBeNull();
  expect(
    workbenchShortcut(
      { ...keys, key: 'ArrowLeft', altKey: true },
      document.body,
    ),
  ).toBeNull();
  expect(
    workbenchShortcut(
      { ...keys, key: 'ArrowLeft', ctrlKey: true },
      document.body,
    ),
  ).toBeNull();
  expect(
    workbenchShortcut({ ...keys, key: 'l', metaKey: true }, document.body),
  ).toBeNull();
});
