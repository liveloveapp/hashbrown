import type { Aircraft, AircraftSnapshot } from './aircraft';
import { distanceNm } from './geo';
import { type AirportCode, AIRPORTS } from './places';

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

/** A circle around an airport that the map outlines. */
export interface ShownArea {
  readonly airport: AirportCode;
  readonly radiusNm: number;
}

/**
 * A pending map move. Only the newest one counts: a highlight fit, an area,
 * or a reset to the regional view. `seq` tells the map whether it has
 * already applied this one.
 */
export type ViewRequest =
  | { readonly seq: number; readonly kind: 'highlight' }
  | { readonly seq: number; readonly kind: 'area'; readonly area: ShownArea }
  | { readonly seq: number; readonly kind: 'reset' };

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
  /** The area the map outlines, or null. */
  readonly shownArea: ShownArea | null;
  /** The newest map move, or null when there is nothing to do. */
  readonly viewRequest: ViewRequest | null;
  /** The last `seq` handed out. */
  readonly viewSeq: number;
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
  shownArea: null,
  viewRequest: null,
  viewSeq: 0,
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

/**
 * Sets the newest map move. Follow mode owns the view, so while an aircraft
 * is followed no move is requested and any pending one is dropped.
 */
function requestView(
  state: AtcState,
  request:
    | { readonly kind: 'highlight' }
    | { readonly kind: 'area'; readonly area: ShownArea }
    | { readonly kind: 'reset' },
): AtcState {
  if (state.followingHex !== null) {
    return { ...state, viewRequest: null };
  }
  const seq = state.viewSeq + 1;

  return { ...state, viewSeq: seq, viewRequest: { ...request, seq } };
}

/**
 * Outlines `area` and asks the map to fit it. Map moves follow these rules:
 * the newest request wins, follow mode wins over every request, and a user
 * drag or zoom cancels a pending one ({@link cancelViewRequest}).
 */
export function requestArea(state: AtcState, area: ShownArea): AtcState {
  return requestView({ ...state, shownArea: area }, { kind: 'area', area });
}

/** Clears the area outline and asks for the regional view. */
export function requestReset(state: AtcState): AtcState {
  return requestView({ ...state, shownArea: null }, { kind: 'reset' });
}

/** Drops the pending map move, as after a user drag or zoom. */
export function cancelViewRequest(state: AtcState): AtcState {
  return state.viewRequest === null ? state : { ...state, viewRequest: null };
}

/** Follows an aircraft (or stops with null); following drops a pending move. */
export function applyFollow(state: AtcState, hex: string | null): AtcState {
  return hex === null
    ? { ...state, followingHex: null }
    : { ...state, followingHex: normalizeHex(hex), viewRequest: null };
}

/** True when every hex is a live aircraft inside `area`. */
function allInside(
  state: AtcState,
  hexes: ReadonlySet<string>,
  area: ShownArea,
): boolean {
  return [...hexes].every((hex) => {
    const aircraft = state.aircraft.get(hex);

    return (
      aircraft !== undefined &&
      distanceNm(aircraft, AIRPORTS[area.airport]) <= area.radiusNm
    );
  });
}

/**
 * Highlights aircraft. A new, non-empty set asks the map to fit it, unless
 * every plane is inside the shown area, whose view already shows them. A fit
 * elsewhere clears the area outline. The same set returns `state` unchanged;
 * an empty set drops a pending highlight fit.
 */
export function applyHighlight(
  state: AtcState,
  hexes: readonly string[],
): AtcState {
  const highlighted: ReadonlySet<string> = new Set(hexes.map(normalizeHex));
  if (
    highlighted.size === state.highlighted.size &&
    [...highlighted].every((hex) => state.highlighted.has(hex))
  ) {
    return state;
  }
  const next = { ...state, highlighted };
  if (highlighted.size === 0) {
    return next.viewRequest?.kind === 'highlight'
      ? { ...next, viewRequest: null }
      : next;
  }
  if (next.shownArea !== null && allInside(next, highlighted, next.shownArea)) {
    return next;
  }

  return requestView({ ...next, shownArea: null }, { kind: 'highlight' });
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
  /** Outlines an area and fits the map to it ({@link requestArea}). */
  showArea(area: ShownArea): void;
  /** Returns to the regional view ({@link requestReset}). */
  resetView(): void;
  /** Drops a pending map move ({@link cancelViewRequest}). */
  cancelViewRequest(): void;
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
    highlight: (hexes) => update(applyHighlight(state, hexes)),
    clearHighlight: () => update(applyHighlight(state, [])),
    follow: (hex) => update(applyFollow(state, hex)),
    showArea: (area) => update(requestArea(state, area)),
    resetView: () => update(requestReset(state)),
    cancelViewRequest: () => update(cancelViewRequest(state)),
    pulse: (hex) =>
      update({ ...state, pulse: { hex: normalizeHex(hex), at: now() } }),
    setFeedStatus: (feedStatus) =>
      update(
        state.feedStatus === feedStatus ? state : { ...state, feedStatus },
      ),
  };
}
