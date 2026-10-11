/** A rectangle in map container pixels. */
export interface TagRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** A plane icon that tags should not cover, at its container point. */
export interface TagObstacle {
  readonly hex: string;
  readonly x: number;
  readonly y: number;
}

/** The plane icon's box, in pixels (`iconSize` in `airspace-map.ts`). */
export const PLANE_ICON = 22;
const HALF = PLANE_ICON / 2;
/** The grid's cell size, in pixels. */
const CELL = 32;

/** True when two rectangles overlap, or come closer than `gap` pixels. */
export function intersects(a: TagRect, b: TagRect, gap = 0): boolean {
  return (
    a.left < b.right + gap &&
    b.left < a.right + gap &&
    a.top < b.bottom + gap &&
    b.top < a.bottom + gap
  );
}

const cellKey = (cx: number, cy: number) => `${cx},${cy}`;

/**
 * Buckets plane icons in a grid of 32 px cells, so asking whether a tag
 * covers a plane only looks at the planes in the cells around it, not at
 * every plane on the map. Returns the question as a function: true when
 * `rect` covers any plane icon but `own`'s.
 */
export function createObstacleGrid(
  planes: readonly TagObstacle[],
): (rect: TagRect, own: string) => boolean {
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
  const nearby = function* (rect: TagRect) {
    const left = Math.floor((rect.left - HALF) / CELL);
    const right = Math.floor((rect.right + HALF) / CELL);
    const top = Math.floor((rect.top - HALF) / CELL);
    const bottom = Math.floor((rect.bottom + HALF) / CELL);
    for (let cx = left; cx <= right; cx++) {
      for (let cy = top; cy <= bottom; cy++) {
        yield* cells.get(cellKey(cx, cy)) ?? [];
      }
    }
  };

  return (rect, own) => {
    for (const plane of nearby(rect)) {
      const icon = {
        left: plane.x - HALF,
        top: plane.y - HALF,
        right: plane.x + HALF,
        bottom: plane.y + HALF,
      };
      if (plane.hex !== own && intersects(rect, icon)) {
        return true;
      }
    }

    return false;
  };
}
