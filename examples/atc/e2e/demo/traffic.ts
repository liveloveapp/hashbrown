import {
  type Aircraft,
  aircraftKind,
  type AircraftSnapshot,
  applyAirspace,
  deadReckon,
  displayLabel,
  type FindAircraftInput,
  INITIAL_STATE,
  matchesResolved,
  type ResolvedFilter,
  resolveFilter,
} from '@atc/shared';
import { CHART_AIRSPACE } from '../src/chart-fixtures';
import {
  frame,
  FRAME_MS,
  NEAR_BEND,
  NO_FILTERS,
  PORTLAND_CLASS_C,
  scenario,
} from '../src/traffic-fixtures';
import snapshot from './live-snapshot.json';

/** One aircraft as `live-snapshot.json` stores it: an {@link Aircraft} without its derived label and kind. */
type StoredAircraft = Omit<Aircraft, 'label' | 'kind'>;

/** A capture of real traffic, with where and when it came from. */
export interface LiveSnapshot {
  /** The attribution the data needs: "Aircraft data adsb.lol (ODbL)". */
  readonly source: string;
  /** The URL it was fetched from. */
  readonly capturedFrom: string;
  /** When adsb.lol reported it, as an ISO 8601 timestamp. */
  readonly capturedAt: string;
  readonly aircraft: readonly Aircraft[];
}

/**
 * Real Pacific Northwest traffic, captured once from production
 * (`GET https://atc.hashbrown.dev/api/aircraft?area=pnw`) and checked in, so
 * every recording shows the same sky. Aircraft data adsb.lol (ODbL). The
 * file keeps only the fields {@link Aircraft} needs; the label and kind are
 * derived here the way the server derives them.
 */
export const LIVE_SNAPSHOT: LiveSnapshot = {
  source: snapshot.source,
  capturedFrom: snapshot.capturedFrom,
  capturedAt: snapshot.capturedAt,
  aircraft: (snapshot.aircraft as readonly StoredAircraft[]).map(
    (aircraft) => ({
      ...aircraft,
      label: displayLabel(aircraft),
      kind: aircraftKind(aircraft),
    }),
  ),
};

/**
 * How many frames the filler flies for (10 minutes, longer than a
 * recording); after that it holds still, so the checks in {@link liveFiller}
 * cover every frame.
 */
export const LIVE_FRAMES = 200;

/** Where an aircraft is in demo frame `n`: dead-reckoned along its track. */
function fly(aircraft: Aircraft, n: number): Aircraft {
  const seconds = (Math.min(n, LIVE_FRAMES - 1) * FRAME_MS) / 1000;

  return {
    ...aircraft,
    ...deadReckon(
      aircraft,
      aircraft.trackDeg ?? 0,
      aircraft.groundSpeedKt ?? 0,
      seconds,
    ),
  };
}

/** The scripted answers' searches, resolved against the chart fixtures. */
const ANSWER_FILTERS: readonly ResolvedFilter[] = (() => {
  const state = applyAirspace(INITIAL_STATE, CHART_AIRSPACE);
  const queries: FindAircraftInput[] = [
    { ...NO_FILTERS, near: NEAR_BEND, sortBy: 'distance', limit: 20 },
    { ...NO_FILTERS, approaching: 'KSEA', sortBy: 'distance', limit: 10 },
    {
      ...NO_FILTERS,
      inAirspace: PORTLAND_CLASS_C,
      sortBy: 'distance',
      limit: 20,
    },
  ];

  return queries.map((query) => {
    const resolved = resolveFilter(state, query);
    if ('unknownPlaces' in resolved) {
      throw new Error(`Unknown places: ${resolved.unknownPlaces.join(', ')}`);
    }

    return resolved;
  });
})();

/**
 * The aircraft from `candidates` that never change a scripted answer, in any
 * frame up to {@link LIVE_FRAMES}: lower than the scenario's highest plane,
 * slower than its fastest, never within 25 nm of KBDN (the near-Bend board),
 * never approaching KSEA (the Seattle arrivals) and never inside the Portland
 * Class C below its ceiling. Any that shares a hex, callsign, registration or
 * label with a scenario aircraft is dropped too, so cards and highlights name
 * one plane.
 */
export function liveFiller(candidates: readonly Aircraft[]): Aircraft[] {
  const scripted = frame(0).aircraft;
  const taken = new Set(
    scripted.flatMap((aircraft) =>
      [aircraft.hex, aircraft.label, aircraft.callsign, aircraft.registration]
        .filter((name): name is string => name !== null)
        .map((name) => name.toUpperCase()),
    ),
  );
  const ceilingFt = scenario.highest.altitudeFt ?? 0;
  const topSpeedKt = scenario.fastest.groundSpeedKt ?? 0;
  const frames = Array.from({ length: LIVE_FRAMES }, (_, n) => n);

  return candidates.filter(
    (aircraft) =>
      [aircraft.hex, aircraft.label, aircraft.callsign, aircraft.registration]
        .filter((name): name is string => name !== null)
        .every((name) => !taken.has(name.toUpperCase())) &&
      (aircraft.altitudeFt ?? 0) < ceilingFt &&
      (aircraft.groundSpeedKt ?? 0) < topSpeedKt &&
      frames.every((n) => {
        const flown = fly(aircraft, n);

        return ANSWER_FILTERS.every(
          (filter) => !matchesResolved(filter, flown),
        );
      }),
  );
}

/**
 * The traffic around the scenario: every aircraft of {@link LIVE_SNAPSHOT}
 * that {@link liveFiller} keeps, so the map is full of real planes while the
 * scripted answers stay true.
 */
export const FILLER: readonly Aircraft[] = liveFiller(LIVE_SNAPSHOT.aircraft);

/** Demo frame `n`: the e2e scenario's frame plus the live filler, flown forward. */
export function demoFrame(n: number): AircraftSnapshot {
  const base = frame(n);

  return {
    at: base.at,
    aircraft: [...base.aircraft, ...FILLER.map((aircraft) => fly(aircraft, n))],
  };
}
