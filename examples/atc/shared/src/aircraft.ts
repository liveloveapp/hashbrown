import { isRecord, numberOrNull } from './json';

/** One aircraft on the map, normalized from ADS-B data. */
export interface Aircraft {
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

  return {
    hex,
    label: displayLabel({ hex, callsign, registration }),
    callsign,
    registration,
    typeCode: typeof entry['t'] === 'string' ? entry['t'].toUpperCase() : null,
    lat,
    lon,
    altitudeFt: typeof altitude === 'number' ? Math.round(altitude) : null,
    onGround: altitude === 'ground',
    groundSpeedKt: numberOrNull(entry['gs']),
    trackDeg: numberOrNull(entry['track']),
    verticalRateFpm:
      numberOrNull(entry['baro_rate']) ?? numberOrNull(entry['geom_rate']),
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
    lat !== null &&
    lon !== null &&
    isNullableNumber(altitudeFt) &&
    typeof onGround === 'boolean' &&
    isNullableNumber(groundSpeedKt) &&
    isNullableNumber(trackDeg) &&
    isNullableNumber(verticalRateFpm);
  if (!valid) {
    return null;
  }

  return {
    hex,
    label,
    callsign,
    registration,
    typeCode,
    lat,
    lon,
    altitudeFt,
    onGround,
    groundSpeedKt,
    trackDeg,
    verticalRateFpm,
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
