import { expect, test } from 'vitest';
import { INITIAL_STATE } from '../store';
import {
  layoutTags,
  TAG_HEIGHT,
  type TagItem,
  tagOrder,
  tagRect,
  type TagRect,
} from './tag-layout';

const bounds: TagRect = { left: 0, top: 0, right: 400, bottom: 300 };

/** A tag item at (x, y), 60 px wide. */
function item(hex: string, x: number, y: number, extra: Partial<TagItem> = {}) {
  return { hex, x, y, width: 60, previous: null, ...extra };
}

/** True when two rectangles overlap. */
function overlaps(a: TagRect, b: TagRect): boolean {
  return (
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  );
}

test('a lone tag sits to the right of its plane', () => {
  const items = [item('a', 100, 100)];

  const placements = layoutTags({ items, planes: [], bounds });

  expect(placements.get('a')).toBe('right');
  expect(tagRect(items[0], 'right')).toEqual({
    left: 113,
    top: 90,
    right: 173,
    bottom: 90 + TAG_HEIGHT,
  });
});

test('a tag that would overlap a higher priority tag moves to another side', () => {
  const items = [item('a', 100, 100), item('b', 100, 104)];

  const placements = layoutTags({ items, planes: [], bounds });

  expect(placements.get('a')).toBe('right');
  expect(placements.get('b')).not.toBe('right');
  expect(placements.get('b')).not.toBe('hidden');
  expect(
    overlaps(
      tagRect(items[0], 'right'),
      tagRect(items[1], placements.get('b') ?? 'hidden'),
    ),
  ).toBe(false);
});

test('earlier items win: the first in priority order keeps its first choice', () => {
  const items = [item('b', 100, 104), item('a', 100, 100)];

  const placements = layoutTags({ items, planes: [], bounds });

  expect(placements.get('b')).toBe('right');
  expect(placements.get('a')).not.toBe('right');
});

test('when every side is taken, the lowest priority tag is hidden', () => {
  const items = Array.from({ length: 8 }, (_, i) =>
    item(`p${i}`, 200, 150 + i),
  );

  const placements = layoutTags({ items, planes: [], bounds });

  const shown = items.filter((i) => placements.get(i.hex) !== 'hidden');
  expect(placements.get('p0')).toBe('right');
  expect(placements.get('p7')).toBe('hidden');
  for (const a of shown) {
    for (const b of shown) {
      if (a !== b) {
        expect(
          overlaps(
            tagRect(a, placements.get(a.hex) ?? 'hidden'),
            tagRect(b, placements.get(b.hex) ?? 'hidden'),
          ),
        ).toBe(false);
      }
    }
  }
});

test('an always-shown tag (the hovered plane) shows even when crowded', () => {
  const crowd = Array.from({ length: 7 }, (_, i) =>
    item(`p${i}`, 200, 150 + i),
  );
  const hovered = item('h', 200, 152, { always: true });

  const placements = layoutTags({
    items: [...crowd, hovered],
    planes: [],
    bounds,
  });

  expect(placements.get('h')).not.toBe('hidden');
});

test('tags stay inside the bounds, so a plane by the right edge labels to the left', () => {
  const items = [item('a', 380, 150)];

  const placements = layoutTags({ items, planes: [], bounds });

  expect(placements.get('a')).toBe('left');
});

test('insets shrink the bounds: a docked card on top and a sheet below', () => {
  const inset = { left: 0, top: 80, right: 400, bottom: 200 };
  const items = [item('a', 100, 85), item('b', 100, 195)];

  const placements = layoutTags({ items, planes: [], bounds: inset });

  expect(placements.get('a')).toMatch(/^below/);
  expect(placements.get('b')).toMatch(/^above/);
});

test('a plane outside the bounds gets no placement', () => {
  const items = [item('a', 100, 290)];

  const placements = layoutTags({
    items,
    planes: [],
    bounds: { ...bounds, bottom: 200 },
  });

  expect(placements.has('a')).toBe(false);
});

test('blocked rectangles, such as the zoom control, are avoided', () => {
  const items = [item('a', 100, 100)];
  const blocked = [{ left: 110, top: 80, right: 200, bottom: 120 }];

  const placements = layoutTags({ items, planes: [], bounds, blocked });

  expect(placements.get('a')).toBe('left');
});

test('a tag avoids covering another plane icon when it can', () => {
  const items = [item('a', 100, 100)];
  const planes = [
    { hex: 'a', x: 100, y: 100 },
    { hex: 'z', x: 140, y: 100 },
  ];

  const placements = layoutTags({ items, planes, bounds });

  expect(placements.get('a')).toBe('left');
});

test('a tag covers a plane icon rather than hide when nothing else fits', () => {
  const items = [item('a', 100, 100)];
  const planes = [
    { hex: 'z1', x: 140, y: 100 },
    { hex: 'z2', x: 60, y: 100 },
    { hex: 'z3', x: 110, y: 75 },
    { hex: 'z4', x: 110, y: 125 },
    { hex: 'z5', x: 90, y: 75 },
    { hex: 'z6', x: 90, y: 125 },
  ];

  const placements = layoutTags({ items, planes, bounds });

  expect(placements.get('a')).toBe('right');
});

test('hysteresis: a still valid previous placement is kept', () => {
  const items = [item('a', 100, 100, { previous: 'below-left' })];

  const placements = layoutTags({ items, planes: [], bounds });

  expect(placements.get('a')).toBe('below-left');
});

test('hysteresis: an invalid previous placement is replaced', () => {
  const items = [
    item('a', 100, 100),
    item('b', 100, 104, { previous: 'right' }),
  ];

  const placements = layoutTags({ items, planes: [], bounds });

  expect(placements.get('b')).not.toBe('right');
});

test('hysteresis: a previous placement that covers a plane gives way to a clear one', () => {
  const items = [item('a', 100, 100, { previous: 'right' })];
  const planes = [{ hex: 'z', x: 140, y: 100 }];

  const placements = layoutTags({ items, planes, bounds });

  expect(placements.get('a')).toBe('left');
});

test('hundreds of obstacle planes lay out quickly', () => {
  const items = Array.from({ length: 30 }, (_, i) =>
    item(`t${i}`, 20 + ((i * 37) % 360), 20 + ((i * 53) % 260)),
  );
  const planes = Array.from({ length: 500 }, (_, i) => ({
    hex: `o${i}`,
    x: (i * 7919) % 400,
    y: (i * 104729) % 300,
  }));

  const start = performance.now();
  layoutTags({ items, planes, bounds });
  const elapsed = performance.now() - start;

  expect(elapsed).toBeLessThan(20);
});

test('tag order: hovered, then selected, then followed, then highlighted in order', () => {
  const state = {
    ...INITIAL_STATE,
    selectedHex: 'bbbbbb',
    followingHex: 'cccccc',
    highlighted: new Set(['eeeeee', 'dddddd', 'bbbbbb']),
  };

  const order = tagOrder(state, { hovered: 'aaaaaa', detailed: null });

  expect(order).toEqual(['aaaaaa', 'bbbbbb', 'cccccc', 'eeeeee', 'dddddd']);
});

test('tag order drops the plane the detail card describes, which has no tag', () => {
  const state = {
    ...INITIAL_STATE,
    selectedHex: 'bbbbbb',
    highlighted: new Set(['dddddd']),
  };

  const order = tagOrder(state, { hovered: null, detailed: 'bbbbbb' });

  expect(order).toEqual(['dddddd']);
});
