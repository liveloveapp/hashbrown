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

test("the hovered plane's tag (always) shows even when crowded, for when its card does not fit", () => {
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

test('a plane whose tag cannot reach the bounds gets no placement', () => {
  const items = [item('a', 100, 290)];

  const placements = layoutTags({
    items,
    planes: [],
    bounds: { ...bounds, bottom: 200 },
  });

  expect(placements.has('a')).toBe(false);
});

test('a tag poking into the bounds from a plane just under a docked card keeps its side, and others keep clear', () => {
  const band = { ...bounds, top: 80 };
  const items = [item('b', 100, 95), item('a', 100, 75, { previous: 'right' })];

  const placements = layoutTags({ items, planes: [], bounds: band });

  expect(placements.get('a')).toBe('right');
  expect(placements.get('b')).not.toBe('right');
  expect(
    overlaps(
      tagRect(items[1], 'right'),
      tagRect(items[0], placements.get('b') ?? 'hidden'),
    ),
  ).toBe(false);
});

test('a tag poking in from a plane just past the left edge is kept clear of', () => {
  const items = [item('b', 40, 100), item('a', -5, 100)];

  const placements = layoutTags({ items, planes: [], bounds });

  expect(placements.get('a')).toBe('right');
  expect(
    overlaps(
      tagRect(items[1], 'right'),
      tagRect(items[0], placements.get('b') ?? 'hidden'),
    ),
  ).toBe(false);
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

/**
 * A tag for `b` at (100, 128) whose only side inside the open map is
 * above-left (51 to 111 across, 95 to 115 down), across the icon of a plane
 * at (100, 100): blocked rects close the right and the lower left.
 */
const onlyAboveLeft = {
  items: [item('b', 100, 128)],
  bounds,
  blocked: [
    { left: 112, top: 0, right: 400, bottom: 300 },
    { left: 0, top: 116, right: 112, bottom: 300 },
  ],
};

test('a tag whose only free side crosses a highlighted plane icon is hidden', () => {
  const planes = [{ hex: 'a', x: 100, y: 100, hard: true }];

  const placements = layoutTags({ ...onlyAboveLeft, planes });

  expect(placements.get('b')).toBe('hidden');
});

test('an untagged plane icon can be covered, but only when no side is clear of it', () => {
  const planes = [{ hex: 'a', x: 100, y: 100 }];

  const placements = layoutTags({ ...onlyAboveLeft, planes });

  expect(placements.get('b')).toBe('above-left');
});

test('a hovered tag (always) is hidden rather than cross a highlighted plane icon', () => {
  const planes = [{ hex: 'a', x: 100, y: 100, hard: true }];
  const items = [item('b', 100, 128, { always: true })];

  const placements = layoutTags({ ...onlyAboveLeft, items, planes });

  expect(placements.get('b')).toBe('hidden');
});

test('a tag keeps 2 px clear of a highlighted plane icon', () => {
  // The right tag spans y 90 to 110. The icon's 22 px box starts at y 111,
  // clear of it; with the 2 px margin it starts at 109 and touches it.
  const planes = [{ hex: 'z', x: 140, y: 122, hard: true }];

  const placements = layoutTags({
    items: [item('a', 100, 100)],
    planes,
    bounds,
  });

  expect(placements.get('a')).not.toBe('right');
});
