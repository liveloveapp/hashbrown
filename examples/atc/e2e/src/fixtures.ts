import {
  type Aircraft,
  aircraftKind,
  type AircraftSnapshot,
  AIRPORTS,
  applySnapshot,
  AREAS,
  displayLabel,
  findAircraft,
  type FindAircraftInput,
  INITIAL_STATE,
} from '@atc/shared';

/** How many frames the synthetic traffic moves for (3 minutes at 3 s a frame). */
const FRAME_COUNT = 60;
const START = Date.UTC(2026, 9, 9, 18, 0, 0);
const { SEA } = AIRPORTS;
const centre = AREAS.pnw;

/** One synthetic aircraft: where it is at frame 0 and how it moves per frame. */
interface Track {
  readonly aircraft: Aircraft;
  readonly dLat: number;
  readonly dLon: number;
  readonly dAltFt: number;
}

/** Who an aircraft is: a hex, plus a callsign and registration when it has them. */
interface Ident {
  readonly hex: string;
  readonly callsign?: string;
  readonly registration?: string;
}

function track(
  ident: Ident,
  typeCode: string | null,
  at: { lat: number; lon: number; altitudeFt: number; speedKt: number },
  motion: { dLat: number; dLon: number; dAltFt: number; trackDeg: number },
): Track {
  const { hex, callsign = null, registration = null } = ident;

  return {
    aircraft: {
      hex,
      label: displayLabel({ hex, callsign, registration }),
      callsign,
      registration,
      typeCode,
      category: null,
      kind: aircraftKind({ typeCode, category: null }),
      lat: at.lat,
      lon: at.lon,
      altitudeFt: at.altitudeFt,
      onGround: false,
      groundSpeedKt: at.speedKt,
      trackDeg: motion.trackDeg,
      verticalRateFpm: Math.sign(motion.dAltFt) * 1000,
    },
    dLat: motion.dLat,
    dLon: motion.dLon,
    dAltFt: motion.dAltFt,
  };
}

/**
 * The synthetic traffic: three airliners descending into SEA from the north,
 * one climbing out right next to Bend (the nearest to the map centre), one
 * cruising highest, one flying fastest and two fillers, plus private traffic
 * labelled by registration (a Cessna and a helicopter) and one aircraft that
 * broadcasts neither callsign nor registration, so only its hex labels it.
 * Every aircraft moves and changes altitude each frame.
 */
const TRACKS: readonly Track[] = [
  track(
    { hex: 'a1c001', callsign: 'ASA301' },
    'B39M',
    { lat: SEA.lat + 0.35, lon: SEA.lon, altitudeFt: 11_000, speedKt: 250 },
    { dLat: -0.004, dLon: 0, dAltFt: -100, trackDeg: 180 },
  ),
  track(
    { hex: 'a1c002', callsign: 'DAL1820' },
    'A321',
    {
      lat: SEA.lat + 0.45,
      lon: SEA.lon + 0.05,
      altitudeFt: 11_500,
      speedKt: 260,
    },
    { dLat: -0.004, dLon: 0, dAltFt: -100, trackDeg: 185 },
  ),
  track(
    { hex: 'a1c003', callsign: 'UAL2244' },
    'B738',
    {
      lat: SEA.lat + 0.55,
      lon: SEA.lon - 0.05,
      altitudeFt: 11_800,
      speedKt: 270,
    },
    { dLat: -0.004, dLon: 0, dAltFt: -100, trackDeg: 175 },
  ),
  track(
    { hex: 'a1c004', callsign: 'SKW3410' },
    'E75L',
    {
      lat: centre.lat + 0.05,
      lon: centre.lon + 0.05,
      altitudeFt: 9_000,
      speedKt: 280,
    },
    { dLat: 0.003, dLon: 0.003, dAltFt: 300, trackDeg: 45 },
  ),
  track(
    { hex: 'a1c005', callsign: 'AAL2711' },
    'A21N',
    { lat: 45.2, lon: -119.8, altitudeFt: 41_000, speedKt: 470 },
    { dLat: 0.002, dLon: 0.006, dAltFt: 10, trackDeg: 70 },
  ),
  track(
    { hex: 'a1c006', callsign: 'FDX1234' },
    'B77L',
    { lat: 43.1, lon: -122.9, altitudeFt: 33_000, speedKt: 560 },
    { dLat: 0.005, dLon: 0.003, dAltFt: -10, trackDeg: 30 },
  ),
  track(
    { hex: 'a1c007', callsign: 'SWA1458' },
    'B38M',
    { lat: 44.9, lon: -123.4, altitudeFt: 24_000, speedKt: 420 },
    { dLat: -0.003, dLon: 0.002, dAltFt: -50, trackDeg: 150 },
  ),
  track(
    { hex: 'a1c008', callsign: 'QXE2045' },
    'DH8D',
    { lat: 42.4, lon: -120.1, altitudeFt: 17_000, speedKt: 300 },
    { dLat: 0.003, dLon: -0.002, dAltFt: 50, trackDeg: 330 },
  ),
  track(
    { hex: 'a1c009', callsign: 'N352LL', registration: 'N352LL' },
    'C172',
    { lat: 44.12, lon: -123.21, altitudeFt: 4_500, speedKt: 110 },
    { dLat: 0.001, dLon: -0.001, dAltFt: 10, trackDeg: 300 },
  ),
  track(
    { hex: 'a1c00a', registration: 'N911LF' },
    'EC35',
    { lat: 45.55, lon: -122.6, altitudeFt: 1_500, speedKt: 120 },
    { dLat: -0.001, dLon: 0.001, dAltFt: 10, trackDeg: 140 },
  ),
  track(
    { hex: 'a1c00b' },
    null,
    { lat: 43.56, lon: -116.22, altitudeFt: 8_000, speedKt: 150 },
    { dLat: 0.001, dLon: 0.001, dAltFt: -10, trackDeg: 45 },
  ),
];

/**
 * Frame `n` of the synthetic traffic. `at` always increases; positions advance
 * for {@link FRAME_COUNT} frames and then hold, so nothing ever moves backwards
 * (the store ignores snapshots that are not newer than the one it holds).
 */
export function frame(n: number): AircraftSnapshot {
  const i = Math.min(n, FRAME_COUNT - 1);

  return {
    at: START + n * 3000,
    aircraft: TRACKS.map(({ aircraft, dLat, dLon, dAltFt }) => ({
      ...aircraft,
      lat: aircraft.lat + dLat * i,
      lon: aircraft.lon + dLon * i,
      altitudeFt:
        aircraft.altitudeFt === null ? null : aircraft.altitudeFt + dAltFt * i,
    })),
  };
}

/** Every synthetic hex; a rendered card must use one of these. */
export const SYNTHETIC_HEXES: ReadonlySet<string> = new Set(
  TRACKS.map((t) => t.aircraft.hex),
);

const ANY: FindAircraftInput = {
  airline: null,
  typeCode: null,
  kind: null,
  minAltitudeFt: null,
  maxAltitudeFt: null,
  approaching: null,
  sortBy: 'altitude',
  limit: 20,
};

/** The scenario aircraft, found with the app's own search over frame 0. */
export const scenario = (() => {
  const state = applySnapshot(INITIAL_STATE, frame(0));
  const selected = findAircraft(state, { ...ANY, sortBy: 'distance' })[0];
  const highest = findAircraft(state, ANY)[0];
  const fastest = findAircraft(state, { ...ANY, sortBy: 'speed' }).find(
    (row) => row.hex !== highest?.hex,
  );
  const arrivals = findAircraft(state, {
    ...ANY,
    approaching: 'SEA',
    sortBy: 'distance',
    limit: 10,
  });
  const approachingEveryFrame = Array.from(
    { length: FRAME_COUNT },
    (_, n) =>
      findAircraft(applySnapshot(INITIAL_STATE, frame(n)), {
        ...ANY,
        approaching: 'SEA',
      }).length,
  ).every((count) => count === arrivals.length);
  if (
    !selected ||
    !highest ||
    !fastest ||
    arrivals.length < 3 ||
    !approachingEveryFrame
  ) {
    throw new Error('The synthetic frames lack a scenario aircraft.');
  }

  return { selected, highest, fastest, arrivals };
})();

/** The JSON a UI chat answer contains. */
export function ui(
  ...components: Record<string, { props: Record<string, unknown> }>[]
): string {
  return JSON.stringify({ ui: components });
}
