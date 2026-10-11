import {
  type Aircraft,
  aircraftKind,
  type AircraftSnapshot,
  AIRPORTS,
  deadReckon,
  displayLabel,
} from '@atc/shared';
import { frame } from '../src/fixtures';

/** Seconds between synthetic frames, as the e2e fixtures advance them. */
const FRAME_S = 3;

/** A small seeded PRNG (mulberry32), so every recording shows the same sky. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;

  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Where filler traffic flies, and how much of it. */
const REGIONS = [
  // Central Oregon, around the home view but outside the 25 nm Bend ring.
  { lat: 44.2, lon: -121.2, spreadLat: 0.75, spreadLon: 1.9, count: 26 },
  // The Seattle and Portland areas.
  { lat: 47.3, lon: -122.3, spreadLat: 0.7, spreadLon: 0.9, count: 12 },
  { lat: 45.6, lon: -122.6, spreadLat: 0.5, spreadLon: 0.8, count: 8 },
] as const;

const AIRLINES = ['ASA', 'UAL', 'DAL', 'SWA', 'AAL', 'SKW', 'QXE', 'JBU'];
const JETS = ['B738', 'A320', 'E75L', 'B39M', 'A321', 'CRJ9', 'B739', 'A20N'];
const PROPS = ['C172', 'PA28', 'SR22', 'C182', 'BE36'];

/** Keeps filler out of the scripted answers: the Bend ring and Seattle approaches. */
const BEND = AIRPORTS.KBDN;
const CLEAR_OF_BEND_DEG = 0.55;

/**
 * Filler aircraft at frame 0: airliners at cruise and light aircraft, level
 * (never descending, so none is "approaching" an airport), slower and lower
 * than the scenario's fastest and highest planes, and clear of the Bend ring,
 * so the scripted answers stay true.
 */
export const FILLER: readonly Aircraft[] = (() => {
  const random = seededRandom(0xa7c);
  const pick = <T>(items: readonly T[]) =>
    items[Math.floor(random() * items.length)];
  const aircraft: Aircraft[] = [];
  let serial = 0;
  for (const region of REGIONS) {
    let placed = 0;
    while (placed < region.count) {
      const lat = region.lat + (random() * 2 - 1) * region.spreadLat;
      const lon = region.lon + (random() * 2 - 1) * region.spreadLon;
      const fromBend = Math.hypot(
        lat - BEND.lat,
        (lon - BEND.lon) * Math.cos((lat * Math.PI) / 180),
      );
      if (fromBend < CLEAR_OF_BEND_DEG) continue;
      const jet = random() < 0.72;
      const hex = `c0${(0x1000 + serial++).toString(16)}`;
      const callsign = jet
        ? `${pick(AIRLINES)}${100 + Math.floor(random() * 3800)}`
        : null;
      const registration = jet
        ? null
        : `N${1 + Math.floor(random() * 9)}${Math.floor(random() * 900 + 100)}${String.fromCharCode(65 + Math.floor(random() * 26))}`;
      const typeCode = jet ? pick(JETS) : pick(PROPS);
      aircraft.push({
        hex,
        label: displayLabel({ hex, callsign, registration }),
        callsign,
        registration,
        typeCode,
        category: null,
        kind: aircraftKind({ typeCode, category: null }),
        lat,
        lon,
        altitudeFt: jet
          ? 1000 * Math.round(18 + random() * 20)
          : 500 * Math.round(9 + random() * 10),
        onGround: false,
        groundSpeedKt: jet
          ? Math.round(360 + random() * 120)
          : Math.round(95 + random() * 45),
        trackDeg: Math.round(random() * 360),
        verticalRateFpm: 0,
      });
      placed++;
    }
  }

  return aircraft;
})();

/** Demo frame `n`: the e2e scenario's frame plus the filler, flown forward. */
export function demoFrame(n: number): AircraftSnapshot {
  const base = frame(n);
  const seconds = n * FRAME_S;

  return {
    at: base.at,
    aircraft: [
      ...base.aircraft,
      ...FILLER.map((aircraft) => ({
        ...aircraft,
        ...deadReckon(
          aircraft,
          aircraft.trackDeg ?? 0,
          aircraft.groundSpeedKt ?? 0,
          seconds,
        ),
      })),
    ],
  };
}
