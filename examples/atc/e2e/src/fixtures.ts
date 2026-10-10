import {
  type Aircraft,
  type AircraftSnapshot,
  AIRPORTS,
  applySnapshot,
  AREAS,
  findAircraft,
  type FindAircraftInput,
  INITIAL_STATE,
} from '@atc/shared';

/** How many synthetic frames exist before the sequence starts again. */
const FRAME_COUNT = 60;
const START = Date.UTC(2026, 9, 9, 18, 0, 0);
const { SEA } = AIRPORTS;
const centre = AREAS.pnw;

/** One synthetic airliner: where it is at frame 0 and how it moves per frame. */
interface Track {
  readonly aircraft: Aircraft;
  readonly dLat: number;
  readonly dLon: number;
  readonly dAltFt: number;
}

function track(
  hex: string,
  callsign: string,
  typeCode: string,
  at: { lat: number; lon: number; altitudeFt: number; speedKt: number },
  motion: { dLat: number; dLon: number; dAltFt: number; trackDeg: number },
): Track {
  return {
    aircraft: {
      hex,
      callsign,
      typeCode,
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
 * cruising highest, one flying fastest and two fillers. Every aircraft moves
 * and changes altitude each frame.
 */
const TRACKS: readonly Track[] = [
  track(
    'a1c001',
    'ASA301',
    'B39M',
    { lat: SEA.lat + 0.35, lon: SEA.lon, altitudeFt: 11_000, speedKt: 250 },
    { dLat: -0.004, dLon: 0, dAltFt: -100, trackDeg: 180 },
  ),
  track(
    'a1c002',
    'DAL1820',
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
    'a1c003',
    'UAL2244',
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
    'a1c004',
    'SKW3410',
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
    'a1c005',
    'AAL2711',
    'A21N',
    { lat: 45.2, lon: -119.8, altitudeFt: 41_000, speedKt: 470 },
    { dLat: 0.002, dLon: 0.006, dAltFt: 10, trackDeg: 70 },
  ),
  track(
    'a1c006',
    'FDX1234',
    'B77L',
    { lat: 43.1, lon: -122.9, altitudeFt: 33_000, speedKt: 560 },
    { dLat: 0.005, dLon: 0.003, dAltFt: -10, trackDeg: 30 },
  ),
  track(
    'a1c007',
    'SWA1458',
    'B38M',
    { lat: 44.9, lon: -123.4, altitudeFt: 24_000, speedKt: 420 },
    { dLat: -0.003, dLon: 0.002, dAltFt: -50, trackDeg: 150 },
  ),
  track(
    'a1c008',
    'QXE2045',
    'DH8D',
    { lat: 42.4, lon: -120.1, altitudeFt: 17_000, speedKt: 300 },
    { dLat: 0.003, dLon: -0.002, dAltFt: 50, trackDeg: 330 },
  ),
];

/** Frame `n` of the synthetic traffic, wrapping after {@link FRAME_COUNT}. */
export function frame(n: number): AircraftSnapshot {
  const i = n % FRAME_COUNT;

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
