import { isRecord } from '../json';
import type { LatLon } from '../places';
import { FREQUENCY, IDENT } from './patterns';
import {
  AIRSPACE_CLASSES,
  AIRSPACE_TYPES,
  type AirspaceClass,
  type AirspacePayload,
  type AirspaceShelf,
  type AirspaceType,
  type ChartAirport,
  type ChartAirports,
  FACILITY_KINDS,
  type FacilityKind,
  type FieldWeather,
  type Frequencies,
  type Lighting,
  LIGHTINGS,
  type LonLat,
  type Ring,
  type Runway,
  type RunwayEnd,
  type SurfaceFeature,
  type Surfaces,
} from './types';

const WEATHER_KIND = /^[A-Z0-9-]{2,12}$/;
const SURFACE_REF = /^[A-Z0-9 ]{1,12}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 80;

const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const text = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.length <= max ? v : null;

function latLon(value: unknown): LatLon | null {
  if (!isRecord(value)) return null;
  const { lat, lon } = value;
  return finite(lat) &&
    finite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
    ? { lat, lon }
    : null;
}

function frequency(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === 'string' && FREQUENCY.test(value) ? value : undefined;
}

function parseFrequencies(value: unknown): Frequencies | null {
  if (!isRecord(value)) return null;
  const tower = frequency(value['tower']);
  const atis = frequency(value['atis']);
  const ctaf = frequency(value['ctaf']);
  const unicom = frequency(value['unicom']);
  if (
    tower === undefined ||
    atis === undefined ||
    ctaf === undefined ||
    unicom === undefined
  ) {
    return null;
  }
  return { tower, atis, ctaf, unicom };
}

function parseWeather(value: unknown): FieldWeather | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const { kind, frequency: freq } = value;
  return typeof kind === 'string' &&
    WEATHER_KIND.test(kind) &&
    typeof freq === 'string' &&
    FREQUENCY.test(freq)
    ? { kind, frequency: freq }
    : undefined;
}

function parseEnd(value: unknown): RunwayEnd | null {
  const point = latLon(value);
  const id = isRecord(value) ? text(value['id'], 8) : null;
  return point && id !== null ? { id, lat: point.lat, lon: point.lon } : null;
}

function parseRunway(value: unknown): Runway | null {
  if (!isRecord(value)) return null;
  const id = text(value['id'], 16);
  const { lengthFt, widthFt, hard, ends, corners, bearingDeg, surface } = value;
  if (
    id === null ||
    !finite(lengthFt) ||
    lengthFt <= 0 ||
    !finite(widthFt) ||
    widthFt <= 0 ||
    typeof hard !== 'boolean'
  ) {
    return null;
  }
  if (surface !== null && text(surface, 16) === null) return null;
  if (bearingDeg !== null && !finite(bearingDeg)) return null;

  let parsedEnds: Runway['ends'] = null;
  if (ends !== null) {
    if (!Array.isArray(ends) || ends.length !== 2) return null;
    const a = parseEnd(ends[0]);
    const b = parseEnd(ends[1]);
    if (!a || !b) return null;
    parsedEnds = [a, b];
  }

  let parsedCorners: Runway['corners'] = null;
  if (corners !== null) {
    if (!Array.isArray(corners) || corners.length !== 4) return null;
    const points = corners.map(latLon);
    if (points.some((p) => p === null)) return null;
    parsedCorners = points as LatLon[];
  }

  return {
    id,
    lengthFt,
    widthFt,
    surface: surface as string | null,
    hard,
    ends: parsedEnds,
    corners: parsedCorners,
    bearingDeg: bearingDeg as number | null,
  };
}

function parseAirport(value: unknown): ChartAirport | null {
  if (!isRecord(value)) return null;
  const { code, faa, kind, lighting } = value;
  const point = latLon(value);
  const name = text(value['name'], MAX_TEXT);
  const city = text(value['city'], MAX_TEXT);
  const state = text(value['state'], MAX_TEXT);
  const frequencies = parseFrequencies(value['frequencies']);
  const weather = parseWeather(value['weather']);
  const { aliases, runways, elevationFt, rank } = value;

  if (
    typeof code !== 'string' ||
    !IDENT.test(code) ||
    typeof faa !== 'string' ||
    !IDENT.test(faa) ||
    !point ||
    name === null ||
    city === null ||
    state === null ||
    !frequencies ||
    weather === undefined ||
    !FACILITY_KINDS.includes(kind as FacilityKind) ||
    !LIGHTINGS.includes(lighting as Lighting) ||
    !finite(elevationFt) ||
    !finite(rank) ||
    typeof value['towered'] !== 'boolean' ||
    typeof value['towerPartTime'] !== 'boolean' ||
    typeof value['fuel'] !== 'boolean' ||
    typeof value['military'] !== 'boolean' ||
    !Array.isArray(aliases) ||
    !Array.isArray(runways)
  ) {
    return null;
  }

  const parsedAliases = aliases.filter(
    (a): a is string => typeof a === 'string' && IDENT.test(a),
  );
  const parsedRunways: Runway[] = [];
  for (const raw of runways) {
    const runway = parseRunway(raw);
    if (!runway) return null;
    parsedRunways.push(runway);
  }

  return {
    code,
    faa,
    name,
    city,
    state,
    aliases: parsedAliases,
    lat: point.lat,
    lon: point.lon,
    elevationFt,
    kind: kind as FacilityKind,
    towered: value['towered'],
    towerPartTime: value['towerPartTime'],
    frequencies,
    weather,
    lighting: lighting as Lighting,
    fuel: value['fuel'],
    military: value['military'],
    runways: parsedRunways,
    rank,
  };
}

/**
 * Validates an `/api/chart/airports` payload. Throws when `airports` is not an
 * array or `cycle` is not a string; drops airports that fail validation.
 * Copies whitelisted fields only.
 */
export function parseChartAirports(payload: unknown): ChartAirports {
  if (
    !isRecord(payload) ||
    typeof payload['cycle'] !== 'string' ||
    !Array.isArray(payload['airports'])
  ) {
    throw new Error('Invalid chart airports payload');
  }
  const effective = payload['effective'];
  return {
    cycle: payload['cycle'],
    effective:
      typeof effective === 'string' && DATE.test(effective) ? effective : '',
    airports: payload['airports']
      .map(parseAirport)
      .filter((a): a is ChartAirport => a !== null),
  };
}

function pair(value: unknown): LonLat | null {
  return Array.isArray(value) &&
    value.length === 2 &&
    finite(value[0]) &&
    finite(value[1])
    ? [value[0], value[1]]
    : null;
}

function refOrNull(value: unknown): string | null {
  return typeof value === 'string' && SURFACE_REF.test(value) ? value : null;
}

function parseFeature(value: unknown): SurfaceFeature | null {
  if (!isRecord(value)) return null;
  const { kind, shape } = value;
  const ref = refOrNull(value['ref']);

  if (
    shape === 'polygon' &&
    (kind === 'taxiway' || kind === 'apron' || kind === 'hotspot')
  ) {
    if (!Array.isArray(value['rings'])) return null;
    const rings: Ring[] = [];
    for (const ring of value['rings']) {
      if (!Array.isArray(ring)) return null;
      const points = ring.map(pair);
      if (points.some((p) => p === null)) return null;
      rings.push(points as LonLat[]);
    }
    return { kind, shape, rings, ref };
  }

  if (shape === 'line' && (kind === 'taxiway' || kind === 'hold')) {
    if (!Array.isArray(value['points'])) return null;
    const points = value['points'].map(pair);
    if (points.some((p) => p === null)) return null;
    const widthFt = finite(value['widthFt']) ? value['widthFt'] : null;
    return { kind, shape, points: points as LonLat[], ref, widthFt };
  }

  return null;
}

/**
 * Validates an `/api/chart/surfaces` payload for `code`. Features that fail
 * validation are dropped; a ref that fails its pattern becomes null.
 */
export function parseSurfaces(payload: unknown, code: string): Surfaces {
  if (!isRecord(payload) || !Array.isArray(payload['features'])) {
    throw new Error('Invalid chart surfaces payload');
  }
  const source = payload['source'];
  return {
    code,
    source:
      source === 'faa' || source === 'osm' || source === 'runways-only'
        ? source
        : 'runways-only',
    features: payload['features']
      .map(parseFeature)
      .filter((f): f is SurfaceFeature => f !== null),
  };
}

function lonLat(value: unknown): LonLat | null {
  const point = pair(value);
  return point && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90
    ? point
    : null;
}

function parseRings(value: unknown): Ring[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const rings: Ring[] = [];
  for (const raw of value) {
    if (!Array.isArray(raw) || raw.length < 4) return null;
    const points = raw.map(lonLat);
    if (points.some((p) => p === null)) return null;
    rings.push(points as LonLat[]);
  }
  return rings;
}

function parseShelf(value: unknown): AirspaceShelf | null {
  if (!isRecord(value)) return null;
  const { airport, floor, ceiling, bbox } = value;
  const id = text(value['id'], MAX_TEXT);
  const name = text(value['name'], MAX_TEXT);
  const rings = parseRings(value['rings']);
  const shelfClass = value['class'];
  const type = value['type'];

  if (
    id === null ||
    name === null ||
    typeof airport !== 'string' ||
    !IDENT.test(airport) ||
    !AIRSPACE_CLASSES.includes(shelfClass as AirspaceClass) ||
    !AIRSPACE_TYPES.includes(type as AirspaceType) ||
    typeof value['partTime'] !== 'boolean' ||
    !rings ||
    !isRecord(floor) ||
    !finite(floor['ft']) ||
    floor['ft'] < 0 ||
    (floor['ref'] !== 'SFC' && floor['ref'] !== 'MSL') ||
    !Array.isArray(bbox) ||
    bbox.length !== 4 ||
    !bbox.every(finite)
  ) {
    return null;
  }

  let parsedCeiling: AirspaceShelf['ceiling'] = null;
  if (ceiling !== null) {
    if (
      !isRecord(ceiling) ||
      !finite(ceiling['ft']) ||
      ceiling['ft'] <= floor['ft'] ||
      typeof ceiling['exclusive'] !== 'boolean'
    ) {
      return null;
    }
    parsedCeiling = { ft: ceiling['ft'], exclusive: ceiling['exclusive'] };
  }

  return {
    id,
    airport,
    name,
    class: shelfClass as AirspaceClass,
    type: type as AirspaceType,
    floor: { ft: floor['ft'], ref: floor['ref'] },
    ceiling: parsedCeiling,
    partTime: value['partTime'],
    rings,
    bbox: [bbox[0], bbox[1], bbox[2], bbox[3]],
  };
}

/**
 * Validates an `/api/chart/airspace` payload. Throws when `shelves` is not an
 * array or `cycle` is not a string; drops shelves that fail validation.
 * Copies whitelisted fields only.
 */
export function parseAirspace(payload: unknown): AirspacePayload {
  if (
    !isRecord(payload) ||
    typeof payload['cycle'] !== 'string' ||
    !Array.isArray(payload['shelves'])
  ) {
    throw new Error('Invalid chart airspace payload');
  }
  const effective = payload['effective'];
  return {
    cycle: payload['cycle'],
    effective:
      typeof effective === 'string' && DATE.test(effective) ? effective : '',
    shelves: payload['shelves']
      .map(parseShelf)
      .filter((s): s is AirspaceShelf => s !== null),
  };
}
