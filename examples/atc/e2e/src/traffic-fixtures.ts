import {
  type Aircraft,
  aircraftKind,
  type AircraftReadings,
  type AircraftSnapshot,
  AIRPORTS,
  applyAirspace,
  applySnapshot,
  AREAS,
  displayLabel,
  FEED_INTERVAL_MS,
  findAircraft,
  type FindAircraftInput,
  INITIAL_STATE,
} from '@atc/shared';
import { CHART_AIRSPACE } from './chart-fixtures';

/*
 * The synthetic traffic the browser's `/api/aircraft` route is stubbed with,
 * and the scenario aircraft the tests and the scripted model answer about.
 */

/** Time between synthetic frames: the browser's poll interval. */
export const FRAME_MS = FEED_INTERVAL_MS;
/** How many frames the synthetic traffic moves for (3 minutes). */
const FRAME_COUNT = 60;
const START = Date.UTC(2026, 9, 9, 18, 0, 0);
const { KSEA: SEA } = AIRPORTS;
/** The home view's centre, near Bend. */
const MAP_CENTRE = AREAS.pnw;

/** Aircraft the tests pick out by name. */
export const NAMED = {
  eugeneCessna: 'a1c009',
  lifeFlight: 'a1c00a',
  unidentified: 'a1c00b',
  bendCessna: 'a1c00c',
} as const;

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
  readings: AircraftReadings = {},
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
      ...readings,
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
 * A Cessna 182 and a Robinson R44 fly slowly near Bend, climbing, so with
 * the regional jet they are the traffic within 25 nm of KBDN and none is
 * approaching it. Every aircraft moves and changes altitude each frame.
 * Six turboprops fly north in a tight block near Klamath Falls
 * ({@link CLUSTER}), so close that their data tags must move aside, and
 * spreading apart frame by frame; two Cessnas fly among them.
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
      lat: MAP_CENTRE.lat + 0.05,
      lon: MAP_CENTRE.lon + 0.05,
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
    {
      hex: NAMED.eugeneCessna,
      callsign: 'N352LL',
      registration: 'N352LL',
    },
    'C172',
    { lat: 44.12, lon: -123.21, altitudeFt: 4_500, speedKt: 110 },
    { dLat: 0.001, dLon: -0.001, dAltFt: 10, trackDeg: 300 },
    { squawk: '1200', qnhHpa: 1016.4, year: '1978', seenS: 0.6 },
  ),
  track(
    { hex: NAMED.lifeFlight, registration: 'N911LF' },
    'EC35',
    { lat: 45.55, lon: -122.6, altitudeFt: 1_500, speedKt: 120 },
    { dLat: -0.001, dLon: 0.001, dAltFt: 10, trackDeg: 140 },
  ),
  track(
    { hex: NAMED.bendCessna, registration: 'N4417B' },
    'C182',
    {
      lat: MAP_CENTRE.lat - 0.12,
      lon: MAP_CENTRE.lon - 0.1,
      altitudeFt: 5_500,
      speedKt: 115,
    },
    { dLat: 0.0005, dLon: 0.0005, dAltFt: 10, trackDeg: 45 },
  ),
  track(
    { hex: 'a1c00d', registration: 'N44RH' },
    'R44',
    {
      lat: MAP_CENTRE.lat + 0.1,
      lon: MAP_CENTRE.lon - 0.18,
      // Above 5,000 ft, unlike the EC135, so "Below 5,000 ft" narrows the
      // helicopters without emptying them.
      altitudeFt: 6_000,
      speedKt: 90,
    },
    { dLat: -0.0005, dLon: 0.0005, dAltFt: 10, trackDeg: 135 },
  ),
  track(
    { hex: NAMED.unidentified },
    null,
    { lat: 43.56, lon: -116.22, altitudeFt: 8_000, speedKt: 150 },
    { dLat: 0.001, dLon: 0.001, dAltFt: -10, trackDeg: 45 },
  ),
  ...Array.from({ length: 6 }, (_, i) =>
    track(
      { hex: `a1c0${(0x10 + i).toString(16)}`, callsign: `QXE21${i + 10}` },
      'DH8D',
      {
        lat: 42.9 + Math.floor(i / 3) * 0.008,
        lon: -122 + (i % 3) * 0.012,
        altitudeFt: 9_000 + i * 500,
        speedKt: 140 + i * 20,
      },
      // Each flies a little faster and fans out a little more than the one
      // before, so the block keeps changing shape and its tags move.
      {
        dLat: 0.002 + i * 0.001,
        dLon: ((i % 3) - 1) * 0.002,
        dAltFt: 0,
        trackDeg: [350, 0, 10][i % 3] ?? 0,
      },
    ),
  ),
  // Two Cessnas flying with the block, never highlighted: their icons sit
  // where the block's tags go, so tags must be drawn above them.
  ...[
    { hex: 'a1c016', registration: 'N7316K', lat: 42.904, lon: -121.97 },
    { hex: 'a1c017', registration: 'N2284Q', lat: 42.912, lon: -122.03 },
  ].map(({ lat, lon, ...ident }) =>
    track(
      ident,
      'C172',
      { lat, lon, altitudeFt: 7_500, speedKt: 110 },
      { dLat: 0.003, dLon: 0, dAltFt: 0, trackDeg: 0 },
    ),
  ),
];

/**
 * The tight block of six turboprops near Klamath Falls: at the highest zoom
 * a highlight fits to, their icons are 8 to 9 px apart.
 */
export const CLUSTER: readonly string[] = TRACKS.filter(({ aircraft }) =>
  aircraft.callsign?.startsWith('QXE21'),
).map(({ aircraft }) => aircraft.hex);

/**
 * Frame `n` of the synthetic traffic. `at` always increases; positions advance
 * for {@link FRAME_COUNT} frames and then hold, so nothing ever moves backwards
 * (the store ignores snapshots that are not newer than the one it holds).
 */
export function frame(n: number): AircraftSnapshot {
  const i = Math.min(n, FRAME_COUNT - 1);

  return {
    at: START + n * FRAME_MS,
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

/** findAircraft filters with every one off; add `sortBy` and `limit` per query. */
export const NO_FILTERS = {
  airline: null,
  typeCode: null,
  kind: null,
  minAltitudeFt: null,
  maxAltitudeFt: null,
  approaching: null,
  near: null,
  inAirspace: null,
} as const satisfies Omit<FindAircraftInput, 'sortBy' | 'limit'>;

const ANY: FindAircraftInput = { ...NO_FILTERS, sortBy: 'altitude', limit: 20 };

/** The area the "near KBDN" scenario shows and searches. */
export const NEAR_BEND = { airport: 'KBDN', radiusNm: 25 } as const;

/** The airspace the Portland scenario searches. */
export const PORTLAND_CLASS_C = { airport: 'KPDX', class: 'C' } as const;

/** Throws, naming the broken condition, unless the frames hold the scenario. */
function check(ok: unknown, what: string): asserts ok {
  if (!ok) {
    throw new Error(`The synthetic frames break the scenario: ${what}`);
  }
}

/** Whether `query` finds the same aircraft in every frame. */
function sameInEveryFrame(query: FindAircraftInput): boolean {
  const hexesIn = (n: number) =>
    findAircraft(applySnapshot(INITIAL_STATE, frame(n)), query)
      .map((row) => row.hex)
      .sort()
      .join();
  const first = hexesIn(0);

  return Array.from({ length: FRAME_COUNT }, (_, n) => hexesIn(n)).every(
    (hexes) => hexes === first,
  );
}

/** The scenario aircraft, found with the app's own search over frame 0. */
export const scenario = (() => {
  const state = applySnapshot(INITIAL_STATE, frame(0));
  const selected = findAircraft(state, { ...ANY, sortBy: 'distance' })[0];
  const highest = findAircraft(state, ANY)[0];
  const fastest = findAircraft(state, { ...ANY, sortBy: 'speed' }).find(
    (row) => row.hex !== highest?.hex,
  );
  const toSeattle = {
    ...ANY,
    approaching: 'KSEA',
    sortBy: 'distance',
  } as const;
  const arrivals = findAircraft(state, { ...toSeattle, limit: 10 });
  const nearBend = { ...ANY, near: NEAR_BEND, sortBy: 'distance' } as const;
  const nearby = findAircraft(state, nearBend);
  const nearbyKinds = new Set(nearby.map((row) => row.kind));
  const portland = findAircraft(applyAirspace(state, CHART_AIRSPACE), {
    ...ANY,
    inAirspace: PORTLAND_CLASS_C,
    sortBy: 'distance',
  });

  check(selected, 'no aircraft to select');
  check(highest, 'no highest aircraft');
  check(fastest, 'no fastest aircraft besides the highest');
  check(arrivals.length >= 3, 'fewer than 3 aircraft approach KSEA');
  check(sameInEveryFrame(toSeattle), 'the KSEA arrivals change between frames');
  check(
    sameInEveryFrame(nearBend),
    'the traffic near KBDN changes between frames',
  );
  check(portland.length >= 1, 'no aircraft inside the Portland Class C');
  check(
    (['jet', 'single', 'rotor'] as const).every((kind) =>
      nearbyKinds.has(kind),
    ),
    'the traffic near KBDN lacks a jet, a single or a rotorcraft',
  );

  return { selected, highest, fastest, arrivals, nearby, portland };
})();
