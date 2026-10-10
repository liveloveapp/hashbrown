import type { LatLon } from '../places';

/** Where to move the map so highlighted planes (and their tags) are legible. */
export type FitTarget =
  | {
      readonly kind: 'bounds';
      readonly south: number;
      readonly west: number;
      readonly north: number;
      readonly east: number;
    }
  | {
      readonly kind: 'point';
      readonly lat: number;
      readonly lon: number;
      readonly zoom: number;
    };

/** Zoom used for a single highlighted plane. */
export const FIT_POINT_ZOOM = 9;

/** True when both sets hold the same members. */
export function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  return a.size === b.size && [...a].every((hex) => b.has(hex));
}

/**
 * Decides how to move the map when the highlighted set changes. Returns null
 * when the set is unchanged or empty, when an aircraft is being followed (follow
 * mode owns the view), or when none of the planes has a known position. One
 * plane gives a point; several give their bounding box.
 */
export function fitTarget(
  previous: ReadonlySet<string>,
  next: ReadonlySet<string>,
  positions: ReadonlyMap<string, LatLon>,
  following: boolean,
): FitTarget | null {
  if (following || next.size === 0 || sameSet(previous, next)) {
    return null;
  }
  const known = [...next].flatMap((hex) => {
    const position = positions.get(hex);

    return position ? [position] : [];
  });
  if (known.length === 0) {
    return null;
  }
  if (known.length === 1) {
    return {
      kind: 'point',
      lat: known[0].lat,
      lon: known[0].lon,
      zoom: FIT_POINT_ZOOM,
    };
  }
  const lats = known.map((p) => p.lat);
  const lons = known.map((p) => p.lon);

  return {
    kind: 'bounds',
    south: Math.min(...lats),
    west: Math.min(...lons),
    north: Math.max(...lats),
    east: Math.max(...lons),
  };
}
