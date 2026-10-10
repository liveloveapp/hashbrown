import { s } from '@hashbrownai/core';
import type { Aircraft } from './aircraft';
import { distanceNm, isApproaching } from './geo';
import { type AircraftKind, KINDS } from './kinds';
import { aircraftTypeName, airlineFor } from './names';
import {
  type Airport,
  AIRPORT_CODES,
  AIRPORTS,
  type Area,
  AREAS,
  type LatLon,
  lookupPlace,
} from './places';
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

/** Input schema for `findAircraft`. Every field is required; null means "any". */
export const findAircraftInput = s.object(
  'Filters for aircraft currently on the map',
  {
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
      s.enumeration('Only aircraft on approach to this airport (ICAO code)', [
        ...AIRPORT_CODES,
      ]),
      s.nullish(),
    ]),
    near: s.anyOf([
      s.object('Only aircraft within radiusNm of an airport', {
        airport: s.string('ICAO code from lookupPlace, such as KBDN'),
        radiusNm: s.number('Radius in nautical miles, 5 to 150'),
      }),
      s.nullish(),
    ]),
    sortBy: s.enumeration('Sort order', ['altitude', 'speed', 'distance']),
    limit: s.integer('Maximum rows, 1 to 20'),
  },
);

/** The parsed input of `findAircraft`. */
export type FindAircraftInput = s.Infer<typeof findAircraftInput>;

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
  readonly distanceNm: number;
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

function text(value: string | null): string | null {
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
 * Filters and sorts the aircraft on the map. Distances are measured from the
 * airport in `near`, else the one in `approaching`, else the area centre.
 * A `near` airport outside the table matches nothing.
 */
export function findAircraft(
  state: AtcState,
  input: FindAircraftInput,
  area: Area = AREAS.pnw,
): AircraftRow[] {
  const airline = text(input.airline);
  const type = text(input.typeCode);
  const airport = input.approaching ? AIRPORTS[input.approaching] : null;
  const near = input.near ?? null;
  const centre: Airport | null =
    near === null ? null : lookupPlace(near.airport);
  if (near !== null && centre === null) {
    return [];
  }
  const radius = near === null ? Infinity : areaRadiusNm(near.radiusNm);
  const limit = Math.min(20, Math.max(1, Math.round(input.limit)));

  return [...state.aircraft.values()]
    .filter((a) => airline === null || matchesAirline(a, airline))
    .filter(
      (a) =>
        type === null ||
        (a.typeCode ?? '').toLowerCase() === type ||
        aircraftTypeName(a.typeCode).toLowerCase().includes(type),
    )
    .filter((a) => !input.kind || a.kind === input.kind)
    .filter(
      (a) =>
        input.minAltitudeFt === null ||
        (a.altitudeFt !== null && a.altitudeFt >= input.minAltitudeFt),
    )
    .filter(
      (a) =>
        input.maxAltitudeFt === null ||
        (a.altitudeFt !== null && a.altitudeFt <= input.maxAltitudeFt),
    )
    .filter((a) => airport === null || isApproaching(a, airport))
    .filter((a) => centre === null || distanceNm(a, centre) <= radius)
    .map((a) => toRow(a, centre ?? airport ?? area))
    .sort(SORTS[input.sortBy])
    .slice(0, limit);
}
