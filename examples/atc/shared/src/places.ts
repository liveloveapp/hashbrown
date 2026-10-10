/** A point on the globe in decimal degrees. */
export interface LatLon {
  readonly lat: number;
  readonly lon: number;
}

/** Airports the assistant can ask about. */
export type AirportCode = 'SEA' | 'PDX' | 'BOI' | 'GEG' | 'RDM';

/** An airport with its reference point. */
export interface Airport extends LatLon {
  readonly code: AirportCode;
  readonly name: string;
}

/** The airport codes, in display order. */
export const AIRPORT_CODES: readonly AirportCode[] = [
  'SEA',
  'PDX',
  'BOI',
  'GEG',
  'RDM',
];

/** Airport reference points. */
export const AIRPORTS: Readonly<Record<AirportCode, Airport>> = {
  SEA: { code: 'SEA', name: 'Seattle–Tacoma', lat: 47.4502, lon: -122.3088 },
  PDX: { code: 'PDX', name: 'Portland', lat: 45.5887, lon: -122.5975 },
  BOI: { code: 'BOI', name: 'Boise', lat: 43.5644, lon: -116.2228 },
  GEG: { code: 'GEG', name: 'Spokane', lat: 47.6199, lon: -117.5338 },
  RDM: { code: 'RDM', name: 'Redmond/Bend', lat: 44.2541, lon: -121.15 },
};

/** Areas the server may fetch. */
export type AreaId = 'pnw';

/** A map area: its centre, fetch radius and initial zoom. */
export interface Area extends LatLon {
  readonly id: AreaId;
  readonly label: string;
  readonly radiusNm: number;
  readonly zoom: number;
}

/**
 * The allowlisted areas. `pnw` is centred on Bend Municipal (KBDN) with
 * adsb.lol's maximum radius, 250 nm.
 */
export const AREAS: Readonly<Record<AreaId, Area>> = {
  pnw: {
    id: 'pnw',
    label: 'Pacific Northwest',
    lat: 44.0946,
    lon: -121.2002,
    radiusNm: 250,
    zoom: 6,
  },
};

/** Returns true when `value` names an allowlisted area. */
export function isAreaId(value: string): value is AreaId {
  return Object.hasOwn(AREAS, value);
}
