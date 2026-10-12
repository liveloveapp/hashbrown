import type { AtcState } from '../store';
import { contains, intersects, type PixelRect, rectAt } from './pixels';
import {
  createObstacleGrid,
  PLANE_ICON,
  type TagObstacle,
} from './tag-obstacles';

export type { TagObstacle } from './tag-obstacles';

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

/** One plane whose tag shows, at its container point, with its tag's width. */
export interface TagItem {
  readonly hex: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  /** The placement it has now, kept while it is still valid. */
  readonly previous: TagPlacement | null;
  /**
   * Shown even when crowded: the hovered plane, whose tag shows while the
   * detail card does not (when the card does not fit). A hidden tag's plane
   * is otherwise reached by hovering or tapping it, which opens the card.
   */
  readonly always?: boolean;
}

/**
 * A tag's height in pixels: a 16 px line, plus 1 px of padding and 1 px of
 * border on each side.
 */
export const TAG_HEIGHT = 20;
/** Half the plane icon's box, in pixels. */
const ICON_HALF = PLANE_ICON / 2;
/** From the icon's edge to a side tag (`left: 24px` on a 22 px icon). */
const SIDE_GAP = 2;
/** Space kept between two tags, in pixels. */
const TAG_GAP = 2;

/**
 * Where a tag would be drawn for `placement`, in container pixels. Matches
 * the CSS for `.atc-plane[data-tag]` in `styles/markers.css`: side tags are
 * centred on the icon 2 px from its edge, and the others sit 2 px above or
 * below it, aligned with its left or right edge.
 */
export function tagRect(
  item: Pick<TagItem, 'x' | 'y' | 'width'>,
  placement: TagPlacement,
): PixelRect {
  const { x, y, width } = item;
  const side = ICON_HALF + SIDE_GAP;
  const at = (left: number, top: number) =>
    rectAt(left, top, width, TAG_HEIGHT);
  switch (placement) {
    case 'left':
      return at(x - side - width, y - TAG_HEIGHT / 2);
    case 'above-right':
      return at(x - ICON_HALF, y - side - TAG_HEIGHT);
    case 'below-right':
      return at(x - ICON_HALF, y + side);
    case 'above-left':
      return at(x + ICON_HALF - width, y - side - TAG_HEIGHT);
    case 'below-left':
      return at(x + ICON_HALF - width, y + side);
    case 'right':
    case 'hidden':
      return at(x + side, y - TAG_HEIGHT / 2);
  }
}

/**
 * Places data tags so no two overlap. `items` come in priority order (see
 * {@link tagOrder}); each takes the first side, in {@link TAG_PLACEMENTS}
 * order, that stays inside `bounds`, clear of `blocked` rectangles, of the
 * tags already placed and of every `hard` plane icon (tagged, highlighted,
 * selected or followed), preferring one that covers no other plane icon
 * either. Icons count with a 2 px margin.
 * A placement the tag already has is kept while it is as good as the best
 * free one, so tags do not flip back and forth as planes move. A tag with no
 * free side is `hidden` (its plane still opens the detail card on hover or
 * tap). An `always` tag may overlap other tags (it is drawn above them) but
 * never a hard icon. Planes are bucketed in a grid
 * (`createObstacleGrid`), so hundreds of obstacles cost little.
 *
 * A plane outside `bounds` (under a docked card, past an edge) keeps the
 * side it has: its tag cannot move into the visible map, but where it pokes
 * in, the other tags keep clear of it. A plane whose tag cannot reach
 * `bounds` gets no entry.
 */
export function layoutTags(input: {
  readonly items: readonly TagItem[];
  readonly planes: readonly TagObstacle[];
  readonly bounds: PixelRect;
  readonly blocked?: readonly PixelRect[];
}): Map<string, TagPlacement> {
  const { items, bounds, blocked = [] } = input;
  const coversPlane = createObstacleGrid(input.planes);
  const placed: PixelRect[] = [];
  const result = new Map<string, TagPlacement>();
  const outside = (item: TagItem) =>
    item.x < bounds.left ||
    item.x > bounds.right ||
    item.y < bounds.top ||
    item.y > bounds.bottom;
  for (const item of items.filter(outside)) {
    const current = item.previous ?? 'right';
    const rect = tagRect(item, current);
    if (current !== 'hidden' && intersects(rect, bounds)) {
      placed.push(rect);
      result.set(item.hex, current);
    }
  }
  for (const item of items) {
    if (outside(item)) {
      continue;
    }
    /** Open: inside, off the controls, clear of hard icons. */
    const open = (placement: TagPlacement) => {
      const rect = tagRect(item, placement);

      return (
        contains(bounds, rect) &&
        !blocked.some((block) => intersects(rect, block)) &&
        !coversPlane(rect, item.hex, true)
      );
    };
    /** Free: open and clear of the tags already placed. */
    const free = (placement: TagPlacement) =>
      open(placement) &&
      !placed.some((other) =>
        intersects(tagRect(item, placement), other, TAG_GAP),
      );
    /** Clear: free and covering no plane icon. */
    const clear = (placement: TagPlacement) =>
      free(placement) && !coversPlane(tagRect(item, placement), item.hex);
    const previous =
      item.previous === null || item.previous === 'hidden'
        ? null
        : item.previous;
    /** The kept placement when it passes `test`, else the first that does. */
    const pick = (test: (placement: TagPlacement) => boolean) =>
      (previous !== null && test(previous) ? previous : undefined) ??
      TAG_PLACEMENTS.find(test);
    const best =
      pick(clear) ??
      pick(free) ??
      (item.always ? pick(open) : undefined) ??
      'hidden';
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
