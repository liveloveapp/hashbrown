import type { LatLon } from '../places';

/** A `[lon, lat]` position, in GeoJSON order. */
export type LonLat = readonly [number, number];

/** A polygon ring of `[lon, lat]` positions. */
export type Ring = readonly LonLat[];

/** One end of a runway: its number and surveyed threshold position. */
export interface RunwayEnd extends LatLon {
  /** Runway end number as NASR writes it, such as "05" or "23". */
  readonly id: string;
}

/** A runway with its true-size outline. */
export interface Runway {
  /** NASR runway ID, such as "05/23". */
  readonly id: string;
  readonly lengthFt: number;
  readonly widthFt: number;
  /** NASR surface code, such as "ASPH" or "TURF", or null. */
  readonly surface: string | null;
  /** True for asphalt, concrete or other paved surfaces. */
  readonly hard: boolean;
  /** Both ends, or null when NASR has no surveyed ends. */
  readonly ends: readonly [RunwayEnd, RunwayEnd] | null;
  /** Four outline corners (true size), or null without ends. */
  readonly corners: readonly LatLon[] | null;
  /** True bearing from the first end to the second, 0 to 360, or null. */
  readonly bearingDeg: number | null;
}

/** An airport's published frequencies in MHz as text, or null. */
export interface Frequencies {
  readonly tower: string | null;
  readonly atis: string | null;
  readonly ctaf: string | null;
  readonly unicom: string | null;
}

/** An automated weather station on the field, such as AWOS-3 134.425. */
export interface FieldWeather {
  readonly kind: string;
  readonly frequency: string;
}

/** The kinds of landing facility, a closed set. */
export const FACILITY_KINDS = ['airport', 'heliport', 'seaplane'] as const;

/** What kind of landing facility: drawn with different symbols. */
export type FacilityKind = (typeof FACILITY_KINDS)[number];

/** The ways a field can be lit, a closed set. */
export const LIGHTINGS = ['full', 'limited', 'none'] as const;

/** How the field is lit: L (sunset to sunrise), *L (limited) or none. */
export type Lighting = (typeof LIGHTINGS)[number];

/** A public-use airport from FAA NASR, as the chart draws it. */
export interface ChartAirport extends LatLon {
  /** ICAO code, or the FAA ident when there is none (such as 6K5). */
  readonly code: string;
  /** FAA location identifier, such as RDM. */
  readonly faa: string;
  readonly name: string;
  readonly city: string;
  readonly state: string;
  readonly aliases: readonly string[];
  readonly elevationFt: number;
  readonly kind: FacilityKind;
  readonly towered: boolean;
  readonly towerPartTime: boolean;
  readonly frequencies: Frequencies;
  readonly weather: FieldWeather | null;
  readonly lighting: Lighting;
  readonly fuel: boolean;
  readonly military: boolean;
  readonly runways: readonly Runway[];
  /** 0 is the most important; lower ranks win label space. */
  readonly rank: number;
}

/** The `/api/chart/airports` payload. */
export interface ChartAirports {
  /** AIRAC cycle ident, such as "2610". */
  readonly cycle: string;
  /** Effective date, YYYY-MM-DD. */
  readonly effective: string;
  readonly airports: readonly ChartAirport[];
}

/** A drawn surface feature. Coordinates are [lon, lat] like GeoJSON. */
export type SurfaceFeature =
  | {
      readonly kind: 'taxiway' | 'apron' | 'hotspot';
      readonly shape: 'polygon';
      readonly rings: readonly Ring[];
      readonly ref: string | null;
    }
  | {
      readonly kind: 'taxiway' | 'hold';
      readonly shape: 'line';
      readonly points: Ring;
      readonly ref: string | null;
      readonly widthFt: number | null;
    };

/** One airport's diagram surfaces (runways come from ChartAirport). */
export interface Surfaces {
  readonly code: string;
  /** Where taxiways and aprons came from; runways-only when neither had any. */
  readonly source: 'faa' | 'osm' | 'runways-only';
  readonly features: readonly SurfaceFeature[];
}

/** Which overlays the map draws. */
export interface Layers {
  readonly airports: boolean;
  readonly airspace: boolean;
}

/** The chart data in the store. */
export interface ChartState {
  /** loading: first fetch pending; ready: FAA data; limited: fallback table. */
  readonly status: 'loading' | 'ready' | 'limited';
  readonly cycle: string | null;
  readonly airports: readonly ChartAirport[];
}

/** The FAA airspace classes the chart draws, a closed set. */
export const AIRSPACE_CLASSES = ['B', 'C', 'D', 'E'] as const;

/** The FAA airspace class a shelf belongs to. */
export type AirspaceClass = (typeof AIRSPACE_CLASSES)[number];

/** The shelf types in chart order: B, C, D, then Class E surface areas. */
export const AIRSPACE_TYPES = ['B', 'C', 'D', 'E2', 'E3', 'E4'] as const;

/** The shelf type: Class B, C, D or a Class E surface area (E2, E3, E4). */
export type AirspaceType = (typeof AIRSPACE_TYPES)[number];

/** One airspace shelf: a lateral outline between a floor and a ceiling. */
export interface AirspaceShelf {
  /** Built as `${airport}-${type}-${index}`. */
  readonly id: string;
  /** ICAO code when it has 4 characters, else the FAA ident. */
  readonly airport: string;
  readonly name: string;
  readonly class: AirspaceClass;
  readonly type: AirspaceType;
  /** Floor in feet MSL; SFC has `ft: 0`. */
  readonly floor: { readonly ft: number; readonly ref: 'SFC' | 'MSL' };
  /** Ceiling in feet MSL, or null for "up to the overlying airspace". */
  readonly ceiling: { readonly ft: number; readonly exclusive: boolean } | null;
  /** True when the airspace is active by NOTAM only (part-time). */
  readonly partTime: boolean;
  /** `[lon, lat]` rings: the first is the outer boundary, the rest holes. */
  readonly rings: readonly Ring[];
  /** `[west, south, east, north]`. */
  readonly bbox: readonly [number, number, number, number];
}

/** The airspace data in the store. */
export interface AirspaceState {
  /** loading: first fetch pending; ready: FAA data; failed: unavailable. */
  readonly status: 'loading' | 'ready' | 'failed';
  readonly cycle: string | null;
  readonly shelves: readonly AirspaceShelf[];
}

/** The `/api/chart/airspace` payload. */
export interface AirspacePayload {
  /** AIRAC cycle ident, such as "2610". */
  readonly cycle: string;
  /** Effective date, YYYY-MM-DD. */
  readonly effective: string;
  readonly shelves: readonly AirspaceShelf[];
}
