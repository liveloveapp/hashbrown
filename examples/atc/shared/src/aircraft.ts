import { isRecord, numberOrNull } from './json';

/** One airline aircraft on the map, normalized from ADS-B data. */
export interface Aircraft {
  readonly hex: string;
  readonly callsign: string;
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

/** A recorded sequence of snapshots used by replay mode. */
export interface ReplayFile {
  readonly area: string;
  readonly recordedAt: number;
  readonly frames: readonly AircraftSnapshot[];
}

const HEX = /^[0-9a-f]{6}$/;
const AIRLINE_CALLSIGN = /^[A-Z]{3}\d[A-Z0-9]{0,4}$/;

/**
 * Returns true for airline flight numbers such as `UAL1372`: a three-letter
 * ICAO airline code, a digit, then up to four letters or digits. Private
 * registrations such as `N352LL` are rejected.
 */
export function isAirlineCallsign(callsign: string): boolean {
  return AIRLINE_CALLSIGN.test(callsign);
}

/**
 * Normalizes an adsb.lol `/v2/point` payload. Keeps airline aircraft with an
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
  const callsign =
    typeof entry['flight'] === 'string'
      ? entry['flight'].trim().toUpperCase()
      : '';
  const lat = numberOrNull(entry['lat']);
  const lon = numberOrNull(entry['lon']);
  if (
    !HEX.test(hex) ||
    !isAirlineCallsign(callsign) ||
    lat === null ||
    lon === null
  ) {
    return null;
  }
  const altitude = entry['alt_baro'];

  return {
    hex,
    callsign,
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

function isAircraft(value: unknown): value is Aircraft {
  return (
    isRecord(value) &&
    typeof value['hex'] === 'string' &&
    HEX.test(value['hex']) &&
    typeof value['callsign'] === 'string' &&
    isAirlineCallsign(value['callsign']) &&
    typeof value['lat'] === 'number' &&
    typeof value['lon'] === 'number' &&
    typeof value['onGround'] === 'boolean'
  );
}

/** Validates a snapshot received over the network or from a replay file. */
export function parseSnapshot(value: unknown): AircraftSnapshot {
  if (
    !isRecord(value) ||
    typeof value['at'] !== 'number' ||
    !Array.isArray(value['aircraft']) ||
    !value['aircraft'].every(isAircraft)
  ) {
    throw new Error('Invalid aircraft snapshot');
  }

  return { at: value['at'], aircraft: value['aircraft'] };
}

/** Validates a replay file; it must contain at least one valid frame. */
export function parseReplayFile(value: unknown): ReplayFile {
  if (
    !isRecord(value) ||
    typeof value['area'] !== 'string' ||
    typeof value['recordedAt'] !== 'number' ||
    !Array.isArray(value['frames']) ||
    value['frames'].length === 0
  ) {
    throw new Error('Invalid replay file');
  }

  return {
    area: value['area'],
    recordedAt: value['recordedAt'],
    frames: value['frames'].map(parseSnapshot),
  };
}
