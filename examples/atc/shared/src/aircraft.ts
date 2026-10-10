import { isRecord, numberOrNull } from './json';
import { aircraftKind, type AircraftKind, isCategory } from './kinds';

/** adsb.lol's emergency states, a closed set. */
export const EMERGENCIES = [
  'none',
  'general',
  'lifeguard',
  'minfuel',
  'nordo',
  'unlawful',
  'downed',
  'reserved',
] as const;

/** An emergency state from {@link EMERGENCIES}. */
export type Emergency = (typeof EMERGENCIES)[number];

/**
 * Extra readings shown only in the map's detail card. Each one is present
 * only when adsb.lol broadcast a value that passed its check.
 */
export interface AircraftReadings {
  /** The type description such as `BOEING 737 MAX 9`. */
  readonly description?: string;
  /** The model year, four digits. */
  readonly year?: string;
  /** The transponder code, four octal digits. */
  readonly squawk?: string;
  readonly emergency?: Emergency;
  readonly geometricAltitudeFt?: number;
  /** The altitude selected on the autopilot (MCP or FCU). */
  readonly selectedAltitudeFt?: number;
  readonly selectedHeadingDeg?: number;
  /** The altimeter setting (QNH) in hectopascals. */
  readonly qnhHpa?: number;
  readonly indicatedAirspeedKt?: number;
  readonly trueAirspeedKt?: number;
  readonly mach?: number;
  readonly magneticHeadingDeg?: number;
  readonly windDirectionDeg?: number;
  readonly windSpeedKt?: number;
  readonly outsideAirTempC?: number;
  /** Seconds between the last message and the snapshot. */
  readonly seenS?: number;
}

/** One aircraft on the map, normalized from ADS-B data. */
export interface Aircraft extends AircraftReadings {
  readonly hex: string;
  /**
   * The name shown on the map and in answers: the airline callsign, else the
   * registration, else any other callsign, else the hex code in capitals.
   * Always matches `^[A-Z0-9]{1,8}$`, so it is safe in marker HTML.
   */
  readonly label: string;
  /** The broadcast callsign (airline or private), or null when none is valid. */
  readonly callsign: string | null;
  /** The registration such as `N352LL` or `C-GABC`, or null when unknown. */
  readonly registration: string | null;
  readonly typeCode: string | null;
  /** The ADS-B emitter category such as `A3`, or null when not broadcast. */
  readonly category: string | null;
  /** The silhouette to draw, from the type code, else the category, else jet. */
  readonly kind: AircraftKind;
  readonly lat: number;
  readonly lon: number;
  readonly altitudeFt: number | null;
  readonly onGround: boolean;
  readonly groundSpeedKt: number | null;
  readonly trackDeg: number | null;
  readonly verticalRateFpm: number | null;
}

/** Every aircraft in an area at one moment (`at` is epoch milliseconds). */
export interface AircraftSnapshot {
  readonly at: number;
  readonly aircraft: readonly Aircraft[];
}

const HEX = /^[0-9a-f]{6}$/;
const AIRLINE_CALLSIGN = /^[A-Z]{3}\d[A-Z0-9]{0,4}$/;
const LABEL = /^[A-Z0-9]{1,8}$/;
const REGISTRATION = /^[A-Z0-9](?:[A-Z0-9-]{0,8}[A-Z0-9])?$/;

/**
 * Returns true for airline flight numbers such as `UAL1372`: a three-letter
 * ICAO airline code, a digit, then up to four letters or digits. Private
 * registrations such as `N352LL` are rejected.
 */
export function isAirlineCallsign(callsign: string): boolean {
  return AIRLINE_CALLSIGN.test(callsign);
}

const SQUAWK = /^[0-7]{4}$/;
const YEAR = /^\d{4}$/;
const DESCRIPTION = /^[A-Za-z0-9 .,/()&'+-]{1,40}$/;

/** True for a finite number. */
function isFiniteNumber(value: unknown): value is number {
  return numberOrNull(value) !== null;
}

/** A check for a finite number from `min` to `max`, both inclusive. */
function within(min: number, max: number): (value: unknown) => value is number {
  return (value): value is number =>
    isFiniteNumber(value) && value >= min && value <= max;
}

/** Headings and tracks in degrees. */
const isDegrees = within(0, 360);
/** Speeds in knots: not negative and below 2000. */
const isSpeed = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= 0 && value < 2000;

/** A finite number passing `check`, else null. */
function numberWhere(
  value: unknown,
  check: (value: unknown) => value is number,
): number | null {
  return check(value) ? value : null;
}

/** A check for a string matching `pattern`. */
function matches(pattern: RegExp): (value: unknown) => value is string {
  return (value): value is string =>
    typeof value === 'string' && pattern.test(value);
}

/**
 * Every extra reading: its adsb.lol field, the check a value must pass, and
 * whether to round it to whole feet.
 */
const READINGS: ReadonlyArray<{
  readonly key: keyof AircraftReadings;
  readonly source: string;
  readonly check: (value: unknown) => boolean;
  readonly round?: true;
}> = [
  { key: 'description', source: 'desc', check: matches(DESCRIPTION) },
  { key: 'year', source: 'year', check: matches(YEAR) },
  { key: 'squawk', source: 'squawk', check: matches(SQUAWK) },
  {
    key: 'emergency',
    source: 'emergency',
    check: (value) => (EMERGENCIES as readonly unknown[]).includes(value),
  },
  {
    key: 'geometricAltitudeFt',
    source: 'alt_geom',
    check: isFiniteNumber,
    round: true,
  },
  {
    key: 'selectedAltitudeFt',
    source: 'nav_altitude_mcp',
    check: isFiniteNumber,
    round: true,
  },
  { key: 'selectedHeadingDeg', source: 'nav_heading', check: isDegrees },
  { key: 'qnhHpa', source: 'nav_qnh', check: within(800, 1100) },
  { key: 'indicatedAirspeedKt', source: 'ias', check: isSpeed },
  { key: 'trueAirspeedKt', source: 'tas', check: isSpeed },
  { key: 'mach', source: 'mach', check: within(0, 5) },
  { key: 'magneticHeadingDeg', source: 'mag_heading', check: isDegrees },
  { key: 'windDirectionDeg', source: 'wd', check: isDegrees },
  { key: 'windSpeedKt', source: 'ws', check: isSpeed },
  { key: 'outsideAirTempC', source: 'oat', check: within(-100, 60) },
  {
    key: 'seenS',
    source: 'seen',
    check: (value) => isFiniteNumber(value) && value >= 0,
  },
];

/** The readings in an adsb.lol entry that pass their checks. */
function adsbReadings(entry: Record<string, unknown>): AircraftReadings {
  return Object.fromEntries(
    READINGS.flatMap(({ key, source, check, round }) => {
      const value = entry[source];
      if (!check(value)) {
        return [];
      }

      return [[key, round ? Math.round(value as number) : value]];
    }),
  );
}

/**
 * The readings of an aircraft received over the network, or null when any
 * present reading fails its check.
 */
function parseReadings(
  value: Record<string, unknown>,
): AircraftReadings | null {
  const entries = READINGS.flatMap(({ key }) =>
    value[key] === undefined ? [] : [[key, value[key]] as const],
  );
  const valid = entries.every(([key, reading]) =>
    READINGS.some((spec) => spec.key === key && spec.check(reading)),
  );

  return valid ? Object.fromEntries(entries) : null;
}

/** True for a value safe to show as a label: 1 to 8 capital letters or digits. */
function isLabel(value: unknown): value is string {
  return typeof value === 'string' && LABEL.test(value);
}

/** True for a registration: capital letters and digits, inner hyphens allowed. */
function isRegistration(value: unknown): value is string {
  return typeof value === 'string' && REGISTRATION.test(value);
}

/** A trimmed, upper-cased string field, or null when it is not a string. */
function upper(value: unknown): string | null {
  return typeof value === 'string' ? value.trim().toUpperCase() : null;
}

/**
 * The display label for an aircraft: an airline callsign, else the
 * registration without hyphens, else any other callsign, else the hex code in
 * capitals. Each source must match `^[A-Z0-9]{1,8}$`; invalid ones fall
 * through to the next.
 */
export function displayLabel(
  aircraft: Pick<Aircraft, 'hex' | 'callsign' | 'registration'>,
): string {
  const { callsign, registration, hex } = aircraft;
  const candidates = [
    callsign !== null && isAirlineCallsign(callsign) ? callsign : null,
    registration?.replaceAll('-', '') ?? null,
    callsign,
    hex.toUpperCase(),
  ];

  return candidates.find(isLabel) ?? hex.toUpperCase();
}

/**
 * Normalizes an adsb.lol `/v2/point` payload. Keeps every aircraft with an
 * ICAO hex code and a position, and copies only whitelisted fields, so owner
 * and operator data never leave the server.
 */
export function normalizeAdsbLol(
  payload: unknown,
  at: number,
): AircraftSnapshot {
  const entries =
    isRecord(payload) && Array.isArray(payload['ac']) ? payload['ac'] : [];
  const aircraft = entries.flatMap((entry: unknown) => {
    const normalized = normalizeEntry(entry);

    return normalized === null ? [] : [normalized];
  });

  return { at, aircraft };
}

function normalizeEntry(entry: unknown): Aircraft | null {
  if (!isRecord(entry)) {
    return null;
  }
  const hex =
    typeof entry['hex'] === 'string' ? entry['hex'].toLowerCase() : '';
  const flight = upper(entry['flight']);
  const callsign = isLabel(flight) ? flight : null;
  const r = upper(entry['r']);
  const registration = isRegistration(r) ? r : null;
  const lat = numberOrNull(entry['lat']);
  const lon = numberOrNull(entry['lon']);
  if (!HEX.test(hex) || lat === null || lon === null) {
    return null;
  }
  const altitude = entry['alt_baro'];
  const typeCode =
    typeof entry['t'] === 'string' ? entry['t'].toUpperCase() : null;
  const category = isCategory(entry['category']) ? entry['category'] : null;

  return {
    hex,
    label: displayLabel({ hex, callsign, registration }),
    callsign,
    registration,
    typeCode,
    category,
    kind: aircraftKind({ typeCode, category }),
    lat,
    lon,
    altitudeFt: typeof altitude === 'number' ? Math.round(altitude) : null,
    onGround: altitude === 'ground',
    groundSpeedKt: numberWhere(entry['gs'], isSpeed),
    trackDeg: numberWhere(entry['track'], isDegrees),
    verticalRateFpm:
      numberOrNull(entry['baro_rate']) ?? numberOrNull(entry['geom_rate']),
    ...adsbReadings(entry),
  };
}

/** True for `null` or a finite number: the shape of every nullable numeric field. */
function isNullableNumber(value: unknown): value is number | null {
  return value === null || numberOrNull(value) !== null;
}

/**
 * Validates one aircraft against every field of the `Aircraft` shape and
 * rebuilds it from those fields only. Returns `null` when any field is invalid.
 */
function parseAircraft(value: unknown): Aircraft | null {
  if (!isRecord(value)) {
    return null;
  }
  const hex = value['hex'];
  const label = value['label'];
  const callsign = value['callsign'];
  const registration = value['registration'];
  const typeCode = value['typeCode'];
  const category = value['category'] ?? null;
  const lat = numberOrNull(value['lat']);
  const lon = numberOrNull(value['lon']);
  const altitudeFt = value['altitudeFt'];
  const onGround = value['onGround'];
  const groundSpeedKt = value['groundSpeedKt'];
  const trackDeg = value['trackDeg'];
  const verticalRateFpm = value['verticalRateFpm'];
  const valid =
    typeof hex === 'string' &&
    HEX.test(hex) &&
    isLabel(label) &&
    (callsign === null || isLabel(callsign)) &&
    (registration === null || isRegistration(registration)) &&
    (typeCode === null || typeof typeCode === 'string') &&
    (category === null || isCategory(category)) &&
    lat !== null &&
    lon !== null &&
    isNullableNumber(altitudeFt) &&
    typeof onGround === 'boolean' &&
    (groundSpeedKt === null || isSpeed(groundSpeedKt)) &&
    (trackDeg === null || isDegrees(trackDeg)) &&
    isNullableNumber(verticalRateFpm);
  const readings = parseReadings(value);
  if (!valid || readings === null) {
    return null;
  }

  return {
    hex,
    label,
    callsign,
    registration,
    typeCode,
    category,
    kind: aircraftKind({ typeCode, category }),
    lat,
    lon,
    altitudeFt,
    onGround,
    groundSpeedKt,
    trackDeg,
    verticalRateFpm,
    ...readings,
  };
}

/**
 * Validates a snapshot received over the network.
 * Returns a rebuilt snapshot whose aircraft carry only the `Aircraft` fields.
 */
export function parseSnapshot(value: unknown): AircraftSnapshot {
  if (
    !isRecord(value) ||
    typeof value['at'] !== 'number' ||
    !Array.isArray(value['aircraft'])
  ) {
    throw new Error('Invalid aircraft snapshot');
  }
  const parsed = value['aircraft'].map(parseAircraft);
  const aircraft = parsed.filter((item): item is Aircraft => item !== null);
  if (aircraft.length !== parsed.length) {
    throw new Error('Invalid aircraft snapshot');
  }

  return { at: value['at'], aircraft };
}
