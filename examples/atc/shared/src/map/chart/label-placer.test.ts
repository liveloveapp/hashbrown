import { expect, test } from 'vitest';
import type { TagRect } from '../tag-obstacles';
import { type LabelRequest, placeLabels } from './label-placer';

const rect = (left: number, top: number, width = 20, height = 10): TagRect => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

test('a lower priority value places first and wins the spot', () => {
  const requests: LabelRequest[] = [
    { id: 'late', priority: 2, candidates: [rect(0, 0)] },
    { id: 'early', priority: 1, candidates: [rect(0, 0)] },
  ];

  const placed = placeLabels(requests, []);

  expect(placed.get('early')).toBe(0);
  expect(placed.get('late')).toBeNull();
});

test('equal priorities place by id, whatever the input order', () => {
  const requests: LabelRequest[] = [
    { id: 'b', priority: 1, candidates: [rect(0, 0)] },
    { id: 'a', priority: 1, candidates: [rect(0, 0)] },
  ];

  const placed = placeLabels(requests, []);

  expect(placed.get('a')).toBe(0);
  expect(placed.get('b')).toBeNull();
});

test('a blocked first candidate falls back to a later one', () => {
  const requests: LabelRequest[] = [
    { id: 'a', priority: 0, candidates: [rect(0, 0)] },
    { id: 'b', priority: 1, candidates: [rect(5, 5), rect(100, 0)] },
  ];

  const placed = placeLabels(requests, []);

  expect(placed.get('a')).toBe(0);
  expect(placed.get('b')).toBe(1);
});

test('a label with every candidate blocked is null', () => {
  const requests: LabelRequest[] = [
    { id: 'a', priority: 0, candidates: [rect(0, 0, 200, 200)] },
    { id: 'b', priority: 1, candidates: [rect(10, 10), rect(50, 50)] },
  ];

  const placed = placeLabels(requests, []);

  expect(placed.get('b')).toBeNull();
});

test('candidates over an obstacle, or within the gap of one, are skipped', () => {
  const obstacles = [rect(0, 0, 30, 30)];
  const requests: LabelRequest[] = [
    {
      id: 'a',
      priority: 0,
      candidates: [rect(10, 10), rect(31, 0), rect(40, 0)],
    },
  ];

  const placed = placeLabels(requests, obstacles);

  expect(placed.get('a')).toBe(2);
});

test('a label with no candidates is null', () => {
  const requests: LabelRequest[] = [{ id: 'a', priority: 0, candidates: [] }];

  const placed = placeLabels(requests, []);

  expect(placed.get('a')).toBeNull();
});
