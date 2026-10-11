import type { AtcState } from '../store';

/**
 * Where a plane's data tag sits beside its icon, or `hidden` when no side is
 * free. `right` is the default (and the CSS without a placement).
 */
export type TagPlacement =
  | 'right'
  | 'left'
  | 'above-right'
  | 'below-right'
  | 'above-left'
  | 'below-left'
  | 'hidden';

/** The sides a tag may take, in order of preference. */
export const TAG_PLACEMENTS: readonly Exclude<TagPlacement, 'hidden'>[] = [
  'right',
  'left',
  'above-right',
  'below-right',
  'above-left',
  'below-left',
];

/** A rectangle in map container pixels. */
export interface TagRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** One plane whose tag shows, at its container point, with its tag's width. */
export interface TagItem {
  readonly hex: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  /** The placement it has now, kept while it is still valid. */
  readonly previous: TagPlacement | null;
  /** Shown even when crowded (the hovered plane). */
  readonly always?: boolean;
}

/** A plane icon tags should not cover. */
export interface TagObstacle {
  readonly hex: string;
  readonly x: number;
  readonly y: number;
}

/** A tag's height in pixels: a 16 px line, 1 px padding and border each side. */
export const TAG_HEIGHT = 20;
/** The plane icon's box, in pixels. */
const ICON = 22;
const HALF = ICON / 2;
/** From the icon's edge to a side tag (`left: 24px` on a 22 px icon). */
const SIDE_GAP = 2;
/** Space kept between two tags, in pixels. */
const TAG_GAP = 2;
/** The obstacle grid's cell size, in pixels. */
const CELL = 32;

/**
 * Where a tag would be drawn for `placement`, in container pixels. Matches
 * the CSS for `.atc-plane[data-tag]` in `styles/markers.css`: side tags are
 * centred on the icon 2 px from its edge, and the others sit 2 px above or
 * below it, aligned with its left or right edge.
 */
export function tagRect(
  item: Pick<TagItem, 'x' | 'y' | 'width'>,
  placement: TagPlacement,
): TagRect {
  const { x, y, width } = item;
  const side = HALF + SIDE_GAP;
  const [left, top] =
    placement === 'left'
      ? [x - side - width, y - TAG_HEIGHT / 2]
      : placement === 'above-right'
        ? [x - HALF, y - side - TAG_HEIGHT]
        : placement === 'below-right'
          ? [x - HALF, y + side]
          : placement === 'above-left'
            ? [x + HALF - width, y - side - TAG_HEIGHT]
            : placement === 'below-left'
              ? [x + HALF - width, y + side]
              : [x + side, y - TAG_HEIGHT / 2];

  return { left, top, right: left + width, bottom: top + TAG_HEIGHT };
}

function intersects(a: TagRect, b: TagRect, gap = 0): boolean {
  return (
    a.left < b.right + gap &&
    b.left < a.right + gap &&
    a.top < b.bottom + gap &&
    b.top < a.bottom + gap
  );
}

function inside(rect: TagRect, bounds: TagRect): boolean {
  return (
    rect.left >= bounds.left &&
    rect.top >= bounds.top &&
    rect.right <= bounds.right &&
    rect.bottom <= bounds.bottom
  );
}

/** Buckets plane icons by grid cell, so a tag only checks its neighbours. */
function obstacleGrid(planes: readonly TagObstacle[]) {
  const cells = new Map<string, TagObstacle[]>();
  for (const plane of planes) {
    const key = `${Math.floor(plane.x / CELL)},${Math.floor(plane.y / CELL)}`;
    const cell = cells.get(key);
    if (cell) {
      cell.push(plane);
    } else {
      cells.set(key, [plane]);
    }
  }

  /** True when `rect` covers any plane icon but `own`'s. */
  return (rect: TagRect, own: string): boolean => {
    for (
      let cx = Math.floor((rect.left - HALF) / CELL);
      cx <= Math.floor((rect.right + HALF) / CELL);
      cx++
    ) {
      for (
        let cy = Math.floor((rect.top - HALF) / CELL);
        cy <= Math.floor((rect.bottom + HALF) / CELL);
        cy++
      ) {
        for (const plane of cells.get(`${cx},${cy}`) ?? []) {
          if (
            plane.hex !== own &&
            intersects(rect, {
              left: plane.x - HALF,
              top: plane.y - HALF,
              right: plane.x + HALF,
              bottom: plane.y + HALF,
            })
          ) {
            return true;
          }
        }
      }
    }

    return false;
  };
}

/**
 * Places data tags so no two overlap. `items` come in priority order (see
 * {@link tagOrder}); each takes the first side, in {@link TAG_PLACEMENTS}
 * order, that stays inside `bounds`, clear of `blocked` rectangles and of
 * the tags already placed, preferring one that covers no other plane icon.
 * A placement the tag already has is kept while it is as good as the best
 * free one, so tags do not flip back and forth as planes move. A tag with no
 * free side is `hidden`, unless it is `always` shown. A plane outside
 * `bounds` gets no entry. Planes are bucketed in a grid, so hundreds of
 * obstacles cost little.
 */
export function layoutTags(input: {
  readonly items: readonly TagItem[];
  readonly planes: readonly TagObstacle[];
  readonly bounds: TagRect;
  readonly blocked?: readonly TagRect[];
}): Map<string, TagPlacement> {
  const { items, bounds, blocked = [] } = input;
  const coversPlane = obstacleGrid(input.planes);
  const placed: TagRect[] = [];
  const result = new Map<string, TagPlacement>();
  for (const item of items) {
    if (
      item.x < bounds.left ||
      item.x > bounds.right ||
      item.y < bounds.top ||
      item.y > bounds.bottom
    ) {
      continue;
    }
    const free = (placement: TagPlacement) => {
      const rect = tagRect(item, placement);

      return (
        inside(rect, bounds) &&
        !blocked.some((block) => intersects(rect, block)) &&
        !placed.some((other) => intersects(rect, other, TAG_GAP))
      );
    };
    const clear = (placement: TagPlacement) =>
      free(placement) && !coversPlane(tagRect(item, placement), item.hex);
    const previous =
      item.previous === null || item.previous === 'hidden'
        ? null
        : item.previous;
    const best =
      (previous !== null && clear(previous) ? previous : null) ??
      TAG_PLACEMENTS.find(clear) ??
      (previous !== null && free(previous) ? previous : null) ??
      TAG_PLACEMENTS.find(free) ??
      (item.always ? (previous ?? 'right') : 'hidden');
    result.set(item.hex, best);
    if (best !== 'hidden') {
      placed.push(tagRect(item, best));
    }
  }

  return result;
}

/**
 * The planes whose tags show, in priority order: the hovered plane, the
 * selected, the followed, then the highlighted in the model's order. The
 * plane the detail card describes is left out: the card repeats its tag.
 */
export function tagOrder(
  state: Pick<AtcState, 'selectedHex' | 'followingHex' | 'highlighted'>,
  focus: { readonly hovered: string | null; readonly detailed: string | null },
): string[] {
  const order = new Set<string>();
  for (const hex of [
    focus.hovered,
    state.selectedHex,
    state.followingHex,
    ...state.highlighted,
  ]) {
    if (hex !== null && hex !== focus.detailed) {
      order.add(hex);
    }
  }

  return [...order];
}
