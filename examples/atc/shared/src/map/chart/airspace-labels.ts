import { type AirspaceShelf, pointInShelf } from '../../chart';
import type { LatLon } from '../../places';

/** A shelf's altitude label, as the sectional prints it. */
export type ShelfLabel =
  | {
      /** Class B and C: the ceiling over the floor, with a rule between. */
      readonly kind: 'stack';
      readonly top: string;
      readonly bottom: string;
    }
  | {
      /** Class D: the ceiling inside a corner-bracket box. */
      readonly kind: 'box';
      readonly text: string;
    };

/** Feet as the chart writes them: hundreds, last two zeros dropped. */
const hundreds = (ft: number): string => String(Math.round(ft / 100));

/**
 * The altitude label for a shelf, in hundreds of feet MSL. Class B and C
 * stack the ceiling over the floor (`SFC` for a surface floor); Class D is
 * its ceiling in a box, with the chart's leading minus when the ceiling is
 * exclusive (up to but not including; the FAA's TNI). The layer labels only
 * each airport's largest D shelf. Class E surface areas, and any shelf with no ceiling, have none.
 * The text is built from validated numbers and fixed literals only.
 */
export function shelfLabel(shelf: AirspaceShelf): ShelfLabel | null {
  if (shelf.ceiling === null) return null;
  const top = hundreds(shelf.ceiling.ft);
  switch (shelf.type) {
    case 'B':
    case 'C':
      return {
        kind: 'stack',
        top,
        bottom: shelf.floor.ref === 'SFC' ? 'SFC' : hundreds(shelf.floor.ft),
      };
    case 'D':
      return {
        kind: 'box',
        text: shelf.ceiling.exclusive ? `-${top}` : top,
      };
    default:
      return null;
  }
}

/** A ring's vertices without the closing repeat of the first. */
function openRing(
  ring: readonly (readonly [number, number])[],
): readonly (readonly [number, number])[] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  return ring.length > 1 &&
    first &&
    last &&
    first[0] === last[0] &&
    first[1] === last[1]
    ? ring.slice(0, -1)
    : ring;
}

/**
 * The midpoint of the widest inside stretch of the horizontal line at `lat`,
 * crossing every ring (even-odd, so holes subtract), or null when the line
 * misses the shelf.
 */
function widestStretch(shelf: AirspaceShelf, lat: number): LatLon | null {
  const crossings: number[] = [];
  for (const ring of shelf.rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i] ?? [0, 0];
      const [xj, yj] = ring[j] ?? [0, 0];
      if (yi > lat !== yj > lat) {
        crossings.push(xi + ((lat - yi) * (xj - xi)) / (yj - yi));
      }
    }
  }
  const sorted = [...crossings].sort((a, b) => a - b);
  let best: LatLon | null = null;
  let width = 0;
  for (let k = 0; k + 1 < sorted.length; k += 2) {
    const west = sorted[k] ?? 0;
    const east = sorted[k + 1] ?? 0;
    if (east - west > width) {
      width = east - west;
      best = { lat, lon: (west + east) / 2 };
    }
  }
  return best;
}

/**
 * Where a shelf's label goes: the centre of its bounding box when that lies
 * inside the shelf, else the average of its outer ring's vertices. A ring
 * (a Class C outer shelf around its core) can hold neither, so the last
 * resort is the middle of the widest inside stretch across the bbox's middle
 * latitude. A shelf with no rings is labelled at its bbox centre.
 */
export function shelfLabelPoint(shelf: AirspaceShelf): LatLon {
  const [west, south, east, north] = shelf.bbox;
  const centre: LatLon = { lat: (south + north) / 2, lon: (west + east) / 2 };
  if (pointInShelf(shelf, centre)) return centre;
  const outer = openRing(shelf.rings[0] ?? []);
  if (outer.length === 0) return centre;
  const average: LatLon = {
    lat: outer.reduce((sum, [, lat]) => sum + lat, 0) / outer.length,
    lon: outer.reduce((sum, [lon]) => sum + lon, 0) / outer.length,
  };
  if (pointInShelf(shelf, average)) return average;
  return (
    widestStretch(shelf, centre.lat) ??
    widestStretch(shelf, average.lat) ??
    average
  );
}

/**
 * Where a shelf's label is drawn. A label point at the bbox centre of a
 * core shelf (a Class C core, a Class D ring) is the airport itself, under
 * its runways and data block; there the label moves halfway to the bbox's
 * south edge, as the chart sets it beside the field, when that point is
 * still inside the shelf. Any other label point is kept.
 */
export function shelfLabelAnchor(shelf: AirspaceShelf): LatLon {
  const point = shelfLabelPoint(shelf);
  const [west, south, east, north] = shelf.bbox;
  const centre: LatLon = { lat: (south + north) / 2, lon: (west + east) / 2 };
  if (point.lat !== centre.lat || point.lon !== centre.lon) return point;
  const below: LatLon = { lat: (centre.lat + south) / 2, lon: centre.lon };
  return pointInShelf(shelf, below) ? below : point;
}
