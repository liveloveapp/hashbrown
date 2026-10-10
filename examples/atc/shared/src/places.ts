/** A point on the globe in decimal degrees. */
export interface LatLon {
  readonly lat: number;
  readonly lon: number;
}

/** Airports the assistant can ask about. */
export type AirportCode = 'ORD' | 'MDW';

/** An airport with its reference point. */
export interface Airport extends LatLon {
  readonly code: AirportCode;
  readonly name: string;
}

/** The airport codes, in display order. */
export const AIRPORT_CODES: readonly AirportCode[] = ['ORD', 'MDW'];

/** Airport reference points. */
export const AIRPORTS: Readonly<Record<AirportCode, Airport>> = {
  ORD: { code: 'ORD', name: "Chicago O'Hare", lat: 41.9786, lon: -87.9048 },
  MDW: { code: 'MDW', name: 'Chicago Midway', lat: 41.7868, lon: -87.7522 },
};

/** Areas the server may fetch. */
export type AreaId = 'ord';

/** A map area: its centre, fetch radius and initial zoom. */
export interface Area extends LatLon {
  readonly id: AreaId;
  readonly label: string;
  readonly radiusNm: number;
  readonly zoom: number;
}

/** The allowlisted areas. */
export const AREAS: Readonly<Record<AreaId, Area>> = {
  ord: {
    id: 'ord',
    label: "Chicago O'Hare",
    lat: 41.9786,
    lon: -87.9048,
    radiusNm: 60,
    zoom: 9,
  },
};

/** Returns true when `value` names an allowlisted area. */
export function isAreaId(value: string): value is AreaId {
  return Object.hasOwn(AREAS, value);
}
