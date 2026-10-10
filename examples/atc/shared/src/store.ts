import type { Aircraft, AircraftSnapshot } from './aircraft';

/** One stop on a scheduled route. */
export interface RouteAirport {
  readonly iata: string;
  readonly name: string;
  readonly city: string;
}

/** A scheduled route from public data; may be stale. */
export interface Route {
  readonly stops: readonly RouteAirport[];
}

/** How fresh the aircraft data is. */
export type FeedStatus = 'connecting' | 'live' | 'delayed' | 'stalled';

/** An aircraft that has left the area, frozen at its last values. */
export interface DepartedAircraft {
  readonly aircraft: Aircraft;
  readonly lastSeenAt: number;
}

/** Everything the map, tools and components read. Treat as immutable. */
export interface AtcState {
  readonly aircraft: ReadonlyMap<string, Aircraft>;
  readonly departed: ReadonlyMap<string, DepartedAircraft>;
  readonly routes: ReadonlyMap<string, Route | null>;
  readonly selectedHex: string | null;
  readonly highlighted: ReadonlySet<string>;
  readonly followingHex: string | null;
  readonly pulse: { readonly hex: string; readonly at: number } | null;
  readonly feedStatus: FeedStatus;
  readonly updatedAt: number | null;
}

/** The state before any data arrives. */
export const INITIAL_STATE: AtcState = {
  aircraft: new Map(),
  departed: new Map(),
  routes: new Map(),
  selectedHex: null,
  highlighted: new Set(),
  followingHex: null,
  pulse: null,
  feedStatus: 'connecting',
  updatedAt: null,
};

/** Lowercases and trims an aircraft hex code, as the model may not. */
export function normalizeHex(hex: string): string {
  return hex.trim().toLowerCase();
}

/**
 * Returns the state after a new snapshot. Aircraft missing from the snapshot
 * move to `departed` with the time they were last seen. A snapshot no newer
 * than the current one (a cached repeat, or an older copy from another server
 * instance) returns `state` unchanged, so planes never move backwards.
 */
export function applySnapshot(
  state: AtcState,
  snapshot: AircraftSnapshot,
): AtcState {
  if (state.updatedAt !== null && snapshot.at <= state.updatedAt) {
    return state;
  }
  const aircraft = new Map(
    snapshot.aircraft.map((entry) => [entry.hex, entry] as const),
  );
  const departed = new Map(state.departed);
  for (const hex of aircraft.keys()) {
    departed.delete(hex);
  }
  for (const [hex, previous] of state.aircraft) {
    if (!aircraft.has(hex)) {
      departed.set(hex, {
        aircraft: previous,
        lastSeenAt: state.updatedAt ?? snapshot.at,
      });
    }
  }

  return { ...state, aircraft, departed, updatedAt: snapshot.at };
}

/** The result of looking an aircraft up by hex code. */
export type AircraftLookup =
  | { readonly status: 'live'; readonly aircraft: Aircraft }
  | {
      readonly status: 'out-of-range';
      readonly aircraft: Aircraft;
      readonly lastSeenAt: number;
    }
  | { readonly status: 'unknown' };

/** Finds an aircraft by hex code, live or departed. */
export function lookupAircraft(state: AtcState, hex: string): AircraftLookup {
  const key = normalizeHex(hex);
  const live = state.aircraft.get(key);
  if (live) {
    return { status: 'live', aircraft: live };
  }
  const gone = state.departed.get(key);
  if (gone) {
    return {
      status: 'out-of-range',
      aircraft: gone.aircraft,
      lastSeenAt: gone.lastSeenAt,
    };
  }

  return { status: 'unknown' };
}

/** A tiny observable store shared by the map, the tools and the components. */
export interface AtcStore {
  getState(): AtcState;
  subscribe(listener: () => void): () => void;
  applySnapshot(snapshot: AircraftSnapshot): void;
  setRoute(callsign: string, route: Route | null): void;
  select(hex: string | null): void;
  highlight(hexes: readonly string[]): void;
  clearHighlight(): void;
  follow(hex: string | null): void;
  pulse(hex: string): void;
  setFeedStatus(status: FeedStatus): void;
}

/** Creates an {@link AtcStore}. `now` is injectable for tests. */
export function createAtcStore(options: { now?: () => number } = {}): AtcStore {
  const { now = Date.now } = options;
  let state = INITIAL_STATE;
  const listeners = new Set<() => void>();
  const update = (next: AtcState) => {
    if (next === state) {
      return;
    }
    state = next;
    for (const listener of [...listeners]) {
      listener();
    }
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    applySnapshot: (snapshot) => update(applySnapshot(state, snapshot)),
    setRoute: (callsign, route) =>
      update({
        ...state,
        routes: new Map(state.routes).set(callsign.trim().toUpperCase(), route),
      }),
    select: (hex) =>
      update({
        ...state,
        selectedHex: hex === null ? null : normalizeHex(hex),
      }),
    highlight: (hexes) =>
      update({ ...state, highlighted: new Set(hexes.map(normalizeHex)) }),
    clearHighlight: () => update({ ...state, highlighted: new Set() }),
    follow: (hex) =>
      update({
        ...state,
        followingHex: hex === null ? null : normalizeHex(hex),
      }),
    pulse: (hex) =>
      update({ ...state, pulse: { hex: normalizeHex(hex), at: now() } }),
    setFeedStatus: (feedStatus) =>
      update(
        state.feedStatus === feedStatus ? state : { ...state, feedStatus },
      ),
  };
}
