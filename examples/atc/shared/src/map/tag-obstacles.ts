import { intersects, type PixelRect, rectAround } from './pixels';

/** A plane icon that tags should not cover, at its container point. */
export interface TagObstacle {
  readonly hex: string;
  readonly x: number;
  readonly y: number;
  /**
   * A plane that is tagged, highlighted, selected or followed: no tag may
   * cover its icon. Other planes' icons are avoided where a side allows.
   */
  readonly hard?: boolean;
}

/** The plane icon's box, in pixels (`iconSize` in `airspace-map.ts`). */
export const PLANE_ICON = 22;
/** Space kept around an icon, in pixels. */
export const ICON_MARGIN = 2;
/** Half the box a tag keeps out of: the icon and its margin. */
const KEEP_OUT_HALF = PLANE_ICON / 2 + ICON_MARGIN;
/** The grid's cell size, in pixels. */
const CELL = 32;

const cellKey = (cx: number, cy: number) => `${cx},${cy}`;

/**
 * Buckets plane icons in a grid of 32 px cells, so asking whether a tag
 * covers a plane only looks at the planes in the cells around it, not at
 * every plane on the map. Returns the question as a function: true when
 * `rect` comes within {@link ICON_MARGIN} of a plane icon but `own`'s, of
 * any plane, or of a `hard` one only when `hardOnly`.
 */
export function createObstacleGrid(
  planes: readonly TagObstacle[],
): (rect: PixelRect, own: string, hardOnly?: boolean) => boolean {
  const cells = new Map<string, TagObstacle[]>();
  for (const plane of planes) {
    const key = cellKey(Math.floor(plane.x / CELL), Math.floor(plane.y / CELL));
    const cell = cells.get(key);
    if (cell) {
      cell.push(plane);
    } else {
      cells.set(key, [plane]);
    }
  }
  const nearby = function* (rect: PixelRect) {
    const left = Math.floor((rect.left - KEEP_OUT_HALF) / CELL);
    const right = Math.floor((rect.right + KEEP_OUT_HALF) / CELL);
    const top = Math.floor((rect.top - KEEP_OUT_HALF) / CELL);
    const bottom = Math.floor((rect.bottom + KEEP_OUT_HALF) / CELL);
    for (let cx = left; cx <= right; cx++) {
      for (let cy = top; cy <= bottom; cy++) {
        yield* cells.get(cellKey(cx, cy)) ?? [];
      }
    }
  };

  return (rect, own, hardOnly = false) => {
    for (const plane of nearby(rect)) {
      if (hardOnly && !plane.hard) {
        continue;
      }
      const icon = rectAround(plane.x, plane.y, 2 * KEEP_OUT_HALF);
      if (plane.hex !== own && intersects(rect, icon)) {
        return true;
      }
    }

    return false;
  };
}
