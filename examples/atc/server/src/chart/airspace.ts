import {
  type AirspaceClass,
  type AirspaceShelf,
  type AirspaceType,
  distanceNm,
  ICAO,
  IDENT,
  isRecord,
  type LatLon,
  type LonLat,
  type Ring,
} from '@atc/shared';

const MAX_NAME = 80;
const LOCAL_TYPES: Readonly<Record<string, AirspaceType>> = {
  CLASS_B: 'B',
  CLASS_C: 'C',
  CLASS_D: 'D',
  CLASS_E2: 'E2',
  CLASS_E3: 'E3',
  CLASS_E4: 'E4',
};
const CLASS_TYPES: Readonly<Record<string, AirspaceType>> = {
  B: 'B',
  C: 'C',
  D: 'D',
};

/** Rounds a coordinate to 5 decimals (about 1 m). */
const round5 = (n: number): number => Math.round(n * 1e5) / 1e5;

/** One ring as rounded `[lon, lat]` pairs, or null when it is malformed. */
function toRing(raw: unknown): Ring | null {
  if (!Array.isArray(raw) || raw.length < 4) return null;
  const points: LonLat[] = [];
  for (const p of raw) {
    if (
      !Array.isArray(p) ||
      typeof p[0] !== 'number' ||
      typeof p[1] !== 'number' ||
      !Number.isFinite(p[0]) ||
      !Number.isFinite(p[1]) ||
      Math.abs(p[0]) > 180 ||
      Math.abs(p[1]) > 90
    ) {
      return null;
    }
    points.push([round5(p[0]), round5(p[1])]);
  }

  return points;
}

/** The polygons (each a list of rings) of a Polygon or MultiPolygon geometry. */
function toPolygons(geometry: unknown): Ring[][] | null {
  if (!isRecord(geometry) || !Array.isArray(geometry['coordinates'])) {
    return null;
  }
  const coordinates: unknown[] = geometry['coordinates'];
  const polygons =
    geometry['type'] === 'Polygon'
      ? [coordinates]
      : geometry['type'] === 'MultiPolygon'
        ? coordinates
        : null;
  if (polygons === null || polygons.length === 0) return null;
  const result: Ring[][] = [];
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || polygon.length === 0) return null;
    const rings = polygon.map(toRing);
    if (rings.some((r) => r === null)) return null;
    result.push(rings as Ring[]);
  }

  return result;
}

/** The fields every polygon of one feature shares, or null when invalid. */
function toBase(
  props: Record<string, unknown>,
): Omit<AirspaceShelf, 'id' | 'rings' | 'bbox'> | null {
  const local = props['LOCAL_TYPE'];
  const cls = props['CLASS'];
  const type =
    typeof local === 'string'
      ? LOCAL_TYPES[local]
      : typeof cls === 'string'
        ? CLASS_TYPES[cls]
        : undefined;
  const name = props['NAME'];
  const icao = props['ICAO_ID'];
  const airport =
    typeof icao === 'string' && ICAO.test(icao) ? icao : props['IDENT'];
  const lowerVal = props['LOWER_VAL'];
  const upperVal = props['UPPER_VAL'];
  if (
    type === undefined ||
    typeof name !== 'string' ||
    name.length === 0 ||
    typeof airport !== 'string' ||
    !IDENT.test(airport)
  ) {
    return null;
  }
  // A surface floor is LOWER_VAL 0. A nonzero value coded SFC is a floor in
  // feet above ground level, which a shelf cannot represent, so it is dropped.
  const sfc = lowerVal === 0;
  if (!sfc && (typeof lowerVal !== 'number' || !Number.isFinite(lowerVal))) {
    return null;
  }
  if (!sfc && props['LOWER_CODE'] === 'SFC') return null;
  const floor = sfc
    ? ({ ft: 0, ref: 'SFC' } as const)
    : ({ ft: lowerVal as number, ref: 'MSL' } as const);
  const open =
    props['UPPER_DESC'] === 'AA' ||
    (typeof upperVal === 'number' && upperVal <= -9998);
  if (!open && (typeof upperVal !== 'number' || !Number.isFinite(upperVal))) {
    return null;
  }
  if (floor.ft < 0 || (!open && (upperVal as number) <= floor.ft)) return null;

  return {
    airport,
    name: name.slice(0, MAX_NAME),
    class: type[0] as AirspaceClass,
    type,
    floor,
    // UPPER_DESC 'TI' is "to and including"; 'TNI' is "to not including".
    ceiling: open
      ? null
      : { ft: upperVal as number, exclusive: props['UPPER_DESC'] === 'TNI' },
    partTime: props['WKHR_CODE'] === 'NOTAM',
  };
}

function bboxOf(rings: readonly Ring[]): AirspaceShelf['bbox'] {
  const points = rings.flat();
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);

  return [
    Math.min(...lons),
    Math.min(...lats),
    Math.max(...lons),
    Math.max(...lats),
  ];
}

/**
 * Turns FAA Class_Airspace GeoJSON features into airspace shelves: maps the
 * FAA fields to a type, floor, ceiling and part-time flag, splits a
 * MultiPolygon into one shelf per polygon, rounds coordinates to 5 decimals,
 * and keeps only shelves with a vertex within `radiusNm` of `centre`. Shelf ids
 * count per airport and type from 1, in input order. Invalid features are
 * counted in `dropped`; features outside the area are not.
 */
export function normalizeAirspace(
  features: unknown,
  centre: LatLon,
  radiusNm: number,
): { shelves: AirspaceShelf[]; dropped: number } {
  if (!Array.isArray(features)) return { shelves: [], dropped: 0 };
  const counts = new Map<string, number>();
  const shelves: AirspaceShelf[] = [];
  let dropped = 0;

  for (const feature of features as unknown[]) {
    const props = isRecord(feature) ? feature['properties'] : null;
    const base = isRecord(props) ? toBase(props) : null;
    const polygons = isRecord(feature) ? toPolygons(feature['geometry']) : null;
    if (base === null || polygons === null) {
      dropped += 1;
      continue;
    }
    for (const rings of polygons) {
      const near = rings.some((ring) =>
        ring.some(([lon, lat]) => distanceNm(centre, { lat, lon }) <= radiusNm),
      );
      if (!near) continue;
      const key = `${base.airport}-${base.type}`;
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      shelves.push({ ...base, id: `${key}-${n}`, rings, bbox: bboxOf(rings) });
    }
  }

  return { shelves, dropped };
}
