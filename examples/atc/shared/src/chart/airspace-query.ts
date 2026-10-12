import type { Aircraft } from '../aircraft';
import type { LatLon } from '../places';
import {
  AIRSPACE_TYPES,
  type AirspaceShelf,
  type AirspaceType,
  type Ring,
} from './types';

/** Class A begins here; a shelf with no ceiling stops below it. */
export const CLASS_A_FLOOR_FT = 18000;

function inRing(ring: Ring, lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Whether `point` lies inside the shelf's outline. A bounding-box prefilter
 * runs first, then even-odd ray casting over every ring, so holes subtract.
 */
export function pointInShelf(shelf: AirspaceShelf, point: LatLon): boolean {
  const [west, south, east, north] = shelf.bbox;
  if (
    point.lon < west ||
    point.lon > east ||
    point.lat < south ||
    point.lat > north
  ) {
    return false;
  }
  let inside = false;
  for (const ring of shelf.rings) {
    if (inRing(ring, point.lon, point.lat)) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * The aircraft's altitude in feet MSL and where it came from: 0 on the
 * ground, else GNSS geometric altitude, else barometric, else null.
 */
export function altitudeMslFt(
  aircraft: Pick<Aircraft, 'onGround' | 'altitudeFt' | 'geometricAltitudeFt'>,
): { ft: number; source: 'ground' | 'gnss' | 'baro' } | null {
  if (aircraft.onGround) {
    return { ft: 0, source: 'ground' };
  }
  if (typeof aircraft.geometricAltitudeFt === 'number') {
    return { ft: aircraft.geometricAltitudeFt, source: 'gnss' };
  }
  if (typeof aircraft.altitudeFt === 'number') {
    return { ft: aircraft.altitudeFt, source: 'baro' };
  }
  return null;
}

/**
 * Whether `ft` MSL is within the shelf's floor and ceiling. The floor is
 * inclusive, and a surface floor has no lower bound: GNSS (height above the
 * ellipsoid) and uncorrected baro altitudes can read below zero near sea
 * level. A null ceiling counts as the Class A floor, exclusive.
 */
export function inShelfVertically(shelf: AirspaceShelf, ft: number): boolean {
  if (shelf.floor.ref !== 'SFC' && ft < shelf.floor.ft) {
    return false;
  }
  if (shelf.ceiling === null) {
    return ft < CLASS_A_FLOOR_FT;
  }
  return shelf.ceiling.exclusive
    ? ft < shelf.ceiling.ft
    : ft <= shelf.ceiling.ft;
}

/**
 * The shelves containing the aircraft, laterally and vertically. An aircraft
 * with no altitude matches nothing.
 */
export function shelvesAt(
  shelves: readonly AirspaceShelf[],
  aircraft: Pick<
    Aircraft,
    'lat' | 'lon' | 'onGround' | 'altitudeFt' | 'geometricAltitudeFt'
  >,
): AirspaceShelf[] {
  const altitude = altitudeMslFt(aircraft);
  if (!altitude) {
    return [];
  }
  return shelves.filter(
    (shelf) =>
      pointInShelf(shelf, aircraft) && inShelfVertically(shelf, altitude.ft),
  );
}

/**
 * The shelves of one airport. Matches `shelf.airport` on the code itself, and
 * on its last 3 characters when it is a 4-character code starting with K.
 */
export function airspaceOf(
  shelves: readonly AirspaceShelf[],
  code: string,
): AirspaceShelf[] {
  const faa = code.length === 4 && code.startsWith('K') ? code.slice(1) : null;
  return shelves.filter(
    (shelf) =>
      shelf.airport === code || (faa !== null && shelf.airport === faa),
  );
}

/** The distinct shelf types in `shelves`, ordered B, C, D, E2, E3, E4. */
export function airspaceTypes(
  shelves: readonly AirspaceShelf[],
): AirspaceType[] {
  return AIRSPACE_TYPES.filter((type) =>
    shelves.some((shelf) => shelf.type === type),
  );
}
