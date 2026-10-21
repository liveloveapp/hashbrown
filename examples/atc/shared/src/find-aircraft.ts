import { s } from '@hashbrownai/core';
import type { Aircraft } from './aircraft';
import { distanceNm, isApproaching } from './geo';
import { type AircraftKind, KINDS } from './kinds';
import { aircraftTypeName, airlineFor } from './names';
import {
  type Airport,
  type Area,
  AREAS,
  type LatLon,
  lookupPlace,
} from './places';
import { airspaceOf, altitudeMslFt, shelvesAt } from './chart/airspace-query';
import type { AirspaceShelf } from './chart/types';
import { airportDirectory } from './directory';
import type { AtcState } from './store';

// The pure query behind the findAircraft tool: filters and sorts the
// aircraft already in the store and returns compact rows for the model.

/** Radius used when the model asks for an area without one. */
export const DEFAULT_AREA_RADIUS_NM = 25;

/** Clamps an area radius to 5 to 150 nm; null or non-finite gives the default. */
export function areaRadiusNm(radiusNm: number | null): number {
  return radiusNm === null || !Number.isFinite(radiusNm)
    ? DEFAULT_AREA_RADIUS_NM
    : Math.min(150, Math.max(5, Math.round(radiusNm)));
}

/**
 * The filter fields shared by `findAircraft` and the map filter. Every field is
 * required; null means "any".
 */
export const aircraftFilterFields = {
  airline: s.anyOf([
    s.string('Airline ICAO code such as UAL, or a name such as United'),
    s.nullish(),
  ]),
  typeCode: s.anyOf([
    s.string('ICAO type code such as B738, or a family such as 737'),
    s.nullish(),
  ]),
  kind: s.anyOf([
    s.enumeration(
      'Only this kind of aircraft: jet, twin (twin-engine prop), single (single-engine prop) or rotor (helicopter)',
      [...KINDS],
    ),
    s.nullish(),
  ]),
  minAltitudeFt: s.anyOf([s.number('Minimum altitude in feet'), s.nullish()]),
  maxAltitudeFt: s.anyOf([s.number('Maximum altitude in feet'), s.nullish()]),
  approaching: s.anyOf([
    s.string(
      'Only aircraft on approach to this airport: ICAO code from lookupPlace',
    ),
    s.nullish(),
  ]),
  near: s.anyOf([
    s.object('Only aircraft within radiusNm of an airport', {
      airport: s.string('ICAO code from lookupPlace, such as KBDN'),
      radiusNm: s.number('Radius in nautical miles, 5 to 150'),
    }),
    s.nullish(),
  ]),
  inAirspace: s.anyOf([
    s.object("Only aircraft inside this airport's airspace", {
      airport: s.string('ICAO code from lookupPlace'),
      class: s.anyOf([
        s.enumeration('Airspace class', ['B', 'C', 'D', 'E']),
        s.nullish(),
      ]),
    }),
    s.nullish(),
  ]),
};

/** Input schema for `findAircraft`. Every field is required; null means "any". */
export const findAircraftInput = s.object(
  'Filters for aircraft currently on the map',
  {
    ...aircraftFilterFields,
    sortBy: s.enumeration('Sort order', ['altitude', 'speed', 'distance']),
    limit: s.integer('Maximum rows, 1 to 20'),
  },
);

/** Streaming schema for the filter applied to the aircraft shown on the map. */
export const mapFilterSchema = s.streaming.object(
  'A filter for the aircraft shown on the map',
  aircraftFilterFields,
);

/** The parsed input of `findAircraft`. */
export type FindAircraftInput = s.Infer<typeof findAircraftInput>;

/** The filter fields of {@link FindAircraftInput}, without sorting or a limit. */
export type MapFilter = Omit<FindAircraftInput, 'sortBy' | 'limit'>;

/** A compact aircraft row returned to the model. */
export interface AircraftRow {
  readonly hex: string;
  /** How to name the aircraft: airline callsign, registration, callsign or hex. */
  readonly label: string;
  readonly callsign: string | null;
  readonly registration: string | null;
  /** The airline for airline callsigns; null for private and other traffic. */
  readonly airline: string | null;
  readonly aircraftType: string;
  /** The silhouette drawn on the map. */
  readonly kind: AircraftKind;
  readonly altitudeFt: number | null;
  readonly groundSpeedKt: number | null;
  readonly trackDeg: number | null;
  /**
   * Nautical miles from the search centre: the near, inAirspace or
   * approaching airport, else the area centre.
   */
  readonly distanceNm: number;
}

/**
 * An {@link AircraftRow} from an `inAirspace` search. The row's `altitudeFt` is
 * barometric, but airspace containment uses ground, then GNSS, then baro, so
 * these fields say which altitude decided it.
 */
export interface AirspaceAircraftRow extends AircraftRow {
  /** The altitude in feet MSL the airspace check used. */
  readonly checkedAltitudeFt: number | null;
  /** Where `checkedAltitudeFt` came from. */
  readonly altitudeSource: 'ground' | 'gnss' | 'baro' | null;
  /**
   * True when every shelf the aircraft is in is part-time (in effect only
   * during hours set by NOTAM), so it may be outside active airspace now.
   */
  readonly partTime: boolean;
}

/** The row the model sees for one aircraft, measured from `from`. */
export function toRow(aircraft: Aircraft, from: LatLon): AircraftRow {
  return {
    hex: aircraft.hex,
    label: aircraft.label,
    callsign: aircraft.callsign,
    registration: aircraft.registration,
    airline: airlineFor(aircraft.callsign),
    aircraftType: aircraftTypeName(aircraft.typeCode),
    kind: aircraft.kind,
    altitudeFt: aircraft.altitudeFt,
    groundSpeedKt: aircraft.groundSpeedKt,
    trackDeg: aircraft.trackDeg,
    distanceNm: Math.round(distanceNm(aircraft, from) * 10) / 10,
  };
}

/**
 * The row plus the altitude the airspace check used for `aircraft`, and
 * whether every shelf it is in (`inside`) is part-time.
 */
function toAirspaceRow(
  aircraft: Aircraft,
  from: LatLon,
  inside: readonly AirspaceShelf[],
): AirspaceAircraftRow {
  const checked = altitudeMslFt(aircraft);

  return {
    ...toRow(aircraft, from),
    checkedAltitudeFt: checked?.ft ?? null,
    altitudeSource: checked?.source ?? null,
    partTime: inside.length > 0 && inside.every((shelf) => shelf.partTime),
  };
}

/** Lower-cased, trimmed query, or null when empty. */
function queryText(value: string | null): string | null {
  const trimmed = value?.trim().toLowerCase() ?? '';

  return trimmed === '' ? null : trimmed;
}

/** True when an airliner's ICAO code or airline name matches `query`. */
function matchesAirline(aircraft: Aircraft, query: string): boolean {
  const name = airlineFor(aircraft.callsign);

  return (
    name !== null &&
    (aircraft.callsign?.slice(0, 3).toLowerCase() === query ||
      name.toLowerCase().includes(query))
  );
}

const SORTS: Record<
  FindAircraftInput['sortBy'],
  (a: AircraftRow, b: AircraftRow) => number
> = {
  altitude: (a, b) => (b.altitudeFt ?? -Infinity) - (a.altitudeFt ?? -Infinity),
  speed: (a, b) =>
    (b.groundSpeedKt ?? -Infinity) - (a.groundSpeedKt ?? -Infinity),
  distance: (a, b) => a.distanceNm - b.distanceNm,
};

/**
 * A {@link MapFilter} with its places and airspace looked up once, ready to
 * test many aircraft with {@link matchesResolved}.
 */
export interface ResolvedFilter {
  readonly airline: string | null;
  readonly type: string | null;
  readonly kind: AircraftKind | null;
  readonly minAltitudeFt: number | null;
  readonly maxAltitudeFt: number | null;
  readonly approachAirport: Airport | null;
  readonly nearAirport: Airport | null;
  readonly airspaceAirport: Airport | null;
  /** Shelves of the `inAirspace` airport (of one class when given), else null. */
  readonly shelves: readonly AirspaceShelf[] | null;
  /** Radius of `near` in nm, or Infinity without one. */
  readonly radius: number;
}

/**
 * Looks up the places and airspace of `filter` once. Returns the codes that
 * are not in the directory (approaching, near, then inAirspace) when any is
 * unknown.
 */
export function resolveFilter(
  state: AtcState,
  filter: MapFilter,
): ResolvedFilter | { unknownPlaces: string[] } {
  const directory = airportDirectory(state);
  const { near, inAirspace } = filter;
  const approachAirport = filter.approaching
    ? lookupPlace(filter.approaching, directory)
    : null;
  const nearAirport: Airport | null =
    near === null ? null : lookupPlace(near.airport, directory);
  const airspaceAirport: Airport | null =
    inAirspace === null ? null : lookupPlace(inAirspace.airport, directory);
  const unknownPlaces = [
    filter.approaching && approachAirport === null ? filter.approaching : null,
    near !== null && nearAirport === null ? near.airport : null,
    inAirspace !== null && airspaceAirport === null ? inAirspace.airport : null,
  ].filter((code): code is string => code !== null);
  if (unknownPlaces.length > 0) {
    return { unknownPlaces };
  }

  return {
    airline: queryText(filter.airline),
    type: queryText(filter.typeCode),
    kind: filter.kind,
    minAltitudeFt: filter.minAltitudeFt,
    maxAltitudeFt: filter.maxAltitudeFt,
    approachAirport,
    nearAirport,
    airspaceAirport,
    shelves:
      inAirspace === null || airspaceAirport === null
        ? null
        : airspaceOf(state.airspace.shelves, airspaceAirport.code).filter(
            (shelf) =>
              inAirspace.class === null || shelf.class === inAirspace.class,
          ),
    radius: near === null ? Infinity : areaRadiusNm(near.radiusNm),
  };
}

/** True when `aircraft` passes every part of a filter from {@link resolveFilter}. */
export function matchesResolved(
  resolved: ResolvedFilter,
  aircraft: Aircraft,
): boolean {
  const { airline, type, kind, minAltitudeFt, maxAltitudeFt } = resolved;
  const { approachAirport, nearAirport, shelves, radius } = resolved;

  return (
    (airline === null || matchesAirline(aircraft, airline)) &&
    (type === null ||
      (aircraft.typeCode ?? '').toLowerCase() === type ||
      aircraftTypeName(aircraft.typeCode).toLowerCase().includes(type)) &&
    (kind === null || aircraft.kind === kind) &&
    (minAltitudeFt === null ||
      (aircraft.altitudeFt !== null && aircraft.altitudeFt >= minAltitudeFt)) &&
    (maxAltitudeFt === null ||
      (aircraft.altitudeFt !== null && aircraft.altitudeFt <= maxAltitudeFt)) &&
    (approachAirport === null || isApproaching(aircraft, approachAirport)) &&
    (nearAirport === null || distanceNm(aircraft, nearAirport) <= radius) &&
    (shelves === null || shelvesAt(shelves, aircraft).length > 0)
  );
}

/**
 * Filters and sorts the aircraft on the map. Distances are measured from the
 * airport in `near`, else `inAirspace`, else the one in `approaching`, else
 * the area centre. A `near`, `inAirspace` or `approaching` airport outside the
 * directory matches nothing, and `inAirspace` keeps aircraft inside any shelf
 * of that airport (of one class when given). Those rows also carry the altitude
 * the check used.
 */
export function findAircraft(
  state: AtcState,
  input: FindAircraftInput,
  area: Area = AREAS.pnw,
): AircraftRow[] {
  const resolved = resolveFilter(state, input);
  if ('unknownPlaces' in resolved) {
    return [];
  }
  const { nearAirport, airspaceAirport, approachAirport, shelves } = resolved;
  const from = nearAirport ?? airspaceAirport ?? approachAirport ?? area;
  const limit = Math.min(20, Math.max(1, Math.round(input.limit)));

  return [...state.aircraft.values()]
    .filter((a) => matchesResolved(resolved, a))
    .map((a) =>
      shelves === null
        ? toRow(a, from)
        : toAirspaceRow(a, from, shelvesAt(shelves, a)),
    )
    .sort(SORTS[input.sortBy])
    .slice(0, limit);
}
