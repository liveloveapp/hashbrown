import type { Aircraft } from './aircraft';
import type { LatLon } from './places';

const EARTH_RADIUS_NM = 3440.065;
const APPROACH_RADIUS_NM = 40;
const APPROACH_CEILING_FT = 12000;

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance between two points in nautical miles. */
export function distanceNm(a: LatLon, b: LatLon): number {
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.lat)) *
      Math.cos(radians(b.lat)) *
      Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_NM * Math.asin(Math.sqrt(h));
}

/** Minutes to cover `distance` nautical miles, rounded up, or null without a positive speed. */
export function etaMinutes(
  distance: number,
  groundSpeedKt: number | null,
): number | null {
  if (groundSpeedKt === null || groundSpeedKt <= 0) {
    return null;
  }

  return Math.ceil((distance / groundSpeedKt) * 60);
}

/**
 * True when an aircraft is within 40 nm of the airport, airborne, below
 * 12,000 ft and descending.
 */
export function isApproaching(aircraft: Aircraft, airport: LatLon): boolean {
  return (
    !aircraft.onGround &&
    aircraft.altitudeFt !== null &&
    aircraft.altitudeFt < APPROACH_CEILING_FT &&
    aircraft.verticalRateFpm !== null &&
    aircraft.verticalRateFpm < 0 &&
    distanceNm(aircraft, airport) <= APPROACH_RADIUS_NM
  );
}
