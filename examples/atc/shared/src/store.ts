import type { Aircraft, AircraftSnapshot } from './aircraft';
import { distanceNm } from './geo';
import type {
  AirspacePayload,
  AirspaceState,
  ChartAirports,
  ChartState,
  Layers,
  Surfaces,
} from './chart';
import { airportByCode } from './directory';
import {
  areaRadiusNm,
  type MapFilter,
  type ResolvedFilter,
  resolveFilter,
} from './find-aircraft';
import type { Route } from './routes';

/** How fresh the aircraft data is. */
export type FeedStatus = 'connecting' | 'live' | 'delayed' | 'stalled';

/** An aircraft that has left the area, frozen at its last values. */
export interface DepartedAircraft {
  readonly aircraft: Aircraft;
  readonly lastSeenAt: number;
}

/** A circle around an airport that the map outlines. */
export interface ShownArea {
  readonly airport: string;
  readonly radiusNm: number;
}

/**
 * A pending map move: a highlight fit, an area, a reset to the home view,
 * bringing one aircraft into view, or showing one airport. Precedence:
 * (1) follow mode always wins and drops requests; (2) the newest request
 * (highest `seq`) wins; (3) a user drag or zoom cancels a pending one;
 * (4) highlight and aircraft requests wait for their markers to be drawn.
 * The map applies each `seq` once.
 */
export type ViewRequest = ViewMove & { readonly seq: number };

/** A map move before it is numbered. */
type ViewMove =
  | { readonly kind: 'highlight' }
  | { readonly kind: 'area'; readonly area: ShownArea }
  | { readonly kind: 'reset' }
  | { readonly kind: 'aircraft'; readonly hex: string }
  | { readonly kind: 'airport'; readonly airport: string }
  | { readonly kind: 'airspace'; readonly airport: string };

/**
 * How long a departed aircraft is remembered, so cards in the transcript can
 * still show it as out of range: 30 minutes.
 */
export const DEPARTED_TTL_MS = 30 * 60 * 1000;

/**
 * The map filter as the user or model gave it, with its places resolved once.
 * Unknown places are listed in `unknownPlaces` and left out of `resolved`, so
 * matching ignores only those clauses.
 */
export interface AppliedMapFilter {
  /** The filter as given. */
  readonly filter: MapFilter;
  /** The filter with places looked up, minus unknown places. Refreshed when the chart or airspace data changes. */
  readonly resolved: ResolvedFilter;
  /** Place codes the directory does not know. */
  readonly unknownPlaces: string[];
}

/** Everything the map, tools and components read. Treat as immutable. */
export interface AtcState {
  /** The FAA chart airports, once loaded. */
  readonly chart: ChartState;
  /** Runway and taxiway surfaces per airport code, with load status. */
  readonly surfaces: ReadonlyMap<string, Surfaces | 'loading' | 'failed'>;
  /** The FAA airspace shelves, once loaded. */
  readonly airspace: AirspaceState;
  /** The airport whose airspace is highlighted on the map, or null. */
  readonly highlightedAirspace: string | null;
  /** Which chart layers are drawn. */
  readonly layers: Layers;
  /** Live aircraft by lower-case hex. */
  readonly aircraft: ReadonlyMap<string, Aircraft>;
  /** Aircraft that left the area in the last {@link DEPARTED_TTL_MS}. */
  readonly departed: ReadonlyMap<string, DepartedAircraft>;
  /** Scheduled routes by upper-case callsign; null records that none is published. */
  readonly routes: ReadonlyMap<string, Route | null>;
  readonly selectedHex: string | null;
  /** Hexes the assistant highlighted; the rest are dimmed while this is non-empty. */
  readonly highlighted: ReadonlySet<string>;
  readonly followingHex: string | null;
  /**
   * The last marker flash: a FlightCard pulses its plane when it appears;
   * `at` makes a repeat pulse distinct.
   */
  readonly pulse: { readonly hex: string; readonly at: number } | null;
  readonly feedStatus: FeedStatus;
  /** The `at` of the applied snapshot, or null before the first. */
  readonly updatedAt: number | null;
  /** The area the map outlines, or null. */
  readonly shownArea: ShownArea | null;
  /** The filter applied to the aircraft shown on the map, or null. */
  readonly mapFilter: AppliedMapFilter | null;
  /** The newest map move, or null when there is nothing to do. */
  readonly viewRequest: ViewRequest | null;
  /** The last `seq` handed out. */
  readonly viewSeq: number;
}

/** The state before any data arrives. */
export const INITIAL_STATE: AtcState = {
  chart: { status: 'loading', cycle: null, airports: [] },
  surfaces: new Map(),
  airspace: { status: 'loading', cycle: null, shelves: [] },
  highlightedAirspace: null,
  layers: { airports: true, airspace: true },
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
  mapFilter: null,
  viewRequest: null,
  viewSeq: 0,
};

/** Lowercases and trims an aircraft hex code, as the model may not. */
export function normalizeHex(hex: string): string {
  return hex.trim().toLowerCase();
}

/** Trims and upper-cases a callsign, as the model may not. */
export function normalizeCallsign(callsign: string): string {
  return callsign.trim().toUpperCase();
}

// --- Data

/**
 * Returns the state after a new snapshot. Aircraft missing from the snapshot
 * move to `departed` with the time they were last seen, and are forgotten
 * after {@link DEPARTED_TTL_MS}. A snapshot no newer
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
  const departed = new Map(
    [...state.departed].filter(
      ([hex, gone]) =>
        !aircraft.has(hex) && gone.lastSeenAt >= snapshot.at - DEPARTED_TTL_MS,
    ),
  );
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

/** Marks the chart ready with the airports in `payload`. */
export function applyChart(state: AtcState, payload: ChartAirports): AtcState {
  return reresolveMapFilter({
    ...state,
    chart: {
      status: 'ready',
      cycle: payload.cycle,
      airports: payload.airports,
    },
  });
}

/** Marks the chart limited: the airport data is unavailable. */
export function applyChartLimited(state: AtcState): AtcState {
  return reresolveMapFilter({
    ...state,
    chart: { status: 'limited', cycle: null, airports: [] },
  });
}

/** Stores the surfaces (or load status) for one airport, leaving others alone. */
export function applySurfaces(
  state: AtcState,
  code: string,
  value: Surfaces | 'loading' | 'failed',
): AtcState {
  return { ...state, surfaces: new Map(state.surfaces).set(code, value) };
}

/** Marks airspace ready with the shelves in `payload`. */
export function applyAirspace(
  state: AtcState,
  payload: AirspacePayload,
): AtcState {
  return reresolveMapFilter({
    ...state,
    airspace: {
      status: 'ready',
      cycle: payload.cycle,
      shelves: payload.shelves,
    },
  });
}

/** Marks airspace failed, but only while it is still loading. */
export function applyAirspaceFailed(state: AtcState): AtcState {
  return state.airspace.status === 'loading'
    ? reresolveMapFilter({
        ...state,
        airspace: { status: 'failed', cycle: null, shelves: [] },
      })
    : state;
}

/** Merges `patch` into the layers; returns the same state when nothing changes. */
export function applyLayers(state: AtcState, patch: Partial<Layers>): AtcState {
  const layers = { ...state.layers, ...patch };
  const changed = (Object.keys(layers) as (keyof Layers)[]).some(
    (key) => layers[key] !== state.layers[key],
  );

  return changed ? { ...state, layers } : state;
}

// --- Map filter

/**
 * Resolves `filter` against the current chart and airspace. Unknown places are
 * listed and their clauses dropped, so `resolved` never holds them.
 */
function resolveApplied(state: AtcState, filter: MapFilter): AppliedMapFilter {
  const first = resolveFilter(state, filter);
  if (!('unknownPlaces' in first)) {
    return { filter, resolved: first, unknownPlaces: [] };
  }
  const unknown = new Set(first.unknownPlaces);
  const second = resolveFilter(state, {
    ...filter,
    approaching:
      filter.approaching && unknown.has(filter.approaching)
        ? null
        : filter.approaching,
    near: filter.near && unknown.has(filter.near.airport) ? null : filter.near,
    inAirspace:
      filter.inAirspace && unknown.has(filter.inAirspace.airport)
        ? null
        : filter.inAirspace,
  });
  if ('unknownPlaces' in second) {
    // Unreachable: every unknown clause was dropped above.
    throw new Error('Map filter still has unknown places after dropping them');
  }

  return { filter, resolved: second, unknownPlaces: first.unknownPlaces };
}

/**
 * Re-resolves the applied map filter against changed chart or airspace data.
 * Never requests a view; returns the same state when no filter is set.
 */
function reresolveMapFilter(state: AtcState): AtcState {
  return state.mapFilter === null
    ? state
    : { ...state, mapFilter: resolveApplied(state, state.mapFilter.filter) };
}

/** The place the filter points the map at, as a comparable key, or null. */
function placeKey(applied: AppliedMapFilter | null): string | null {
  const resolved = applied?.resolved;
  if (resolved?.airspaceAirport) {
    return `airspace:${resolved.airspaceAirport.code}`;
  }
  if (resolved?.nearAirport) {
    return `near:${resolved.nearAirport.code}:${resolved.radius}`;
  }

  return null;
}

/**
 * Applies a map filter (or clears it with null). Unknown places are recorded
 * and their clauses ignored. When the resolved place differs from the previous
 * filter's (or there was none), the map is asked to show it: the airspace for
 * `inAirspace` (which wins), else the area outline for `near`. A repeat of the
 * same place, as while a filter streams, asks for nothing. Clearing leaves the
 * view alone and returns the same state when no filter is set.
 */
export function applyMapFilter(
  state: AtcState,
  filter: MapFilter | null,
): AtcState {
  if (filter === null) {
    return state.mapFilter === null ? state : { ...state, mapFilter: null };
  }
  const applied = resolveApplied(state, filter);
  const next = { ...state, mapFilter: applied };
  const { airspaceAirport, nearAirport } = applied.resolved;
  if (placeKey(applied) === placeKey(state.mapFilter)) {
    return next;
  }
  if (airspaceAirport) {
    return requestAirspace(next, airspaceAirport.code);
  }
  if (nearAirport && filter.near) {
    return requestArea(next, {
      airport: nearAirport.code,
      radiusNm: areaRadiusNm(filter.near.radiusNm),
    });
  }

  return next;
}

// --- Map moves

/**
 * Sets the newest map move. Follow mode owns the view, so while an aircraft
 * is followed no move is requested and any pending one is dropped.
 */
function requestView(state: AtcState, request: ViewMove): AtcState {
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
  return requestView(
    { ...state, shownArea: area, highlightedAirspace: null },
    { kind: 'area', area },
  );
}

/** Clears the area outline and asks for the home view (`Area.view`). */
export function requestReset(state: AtcState): AtcState {
  return requestView(
    { ...state, shownArea: null, highlightedAirspace: null },
    { kind: 'reset' },
  );
}

/**
 * Selects an aircraft the user picked from a card or row and asks the map to
 * bring it into view (not while following another plane).
 */
export function requestAircraft(state: AtcState, hex: string): AtcState {
  const key = normalizeHex(hex);

  return requestView(
    { ...state, selectedHex: key },
    { kind: 'aircraft', hex: key },
  );
}

/**
 * Turns the airports layer on, clears the area outline and the airspace
 * highlight, and asks the map to show the airport `code`. While following,
 * the move is dropped.
 */
export function requestAirport(state: AtcState, code: string): AtcState {
  return requestView(
    {
      ...applyLayers(state, { airports: true }),
      shownArea: null,
      highlightedAirspace: null,
    },
    { kind: 'airport', airport: code },
  );
}

/**
 * Highlights the airspace of the airport `code`, turns the airspace layer on,
 * clears the area outline and asks the map to fit it. While following, the
 * move is dropped.
 */
export function requestAirspace(state: AtcState, code: string): AtcState {
  return requestView(
    {
      ...applyLayers(state, { airspace: true }),
      highlightedAirspace: code,
      shownArea: null,
    },
    { kind: 'airspace', airport: code },
  );
}

/** Drops the pending map move, as after a user drag or zoom. */
export function cancelViewRequest(state: AtcState): AtcState {
  return state.viewRequest === null ? state : { ...state, viewRequest: null };
}

// --- Highlight and follow

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
  const centre = airportByCode(state, area.airport);
  if (centre === null) {
    return false;
  }

  return [...hexes].every((hex) => {
    const aircraft = state.aircraft.get(hex);

    return (
      aircraft !== undefined && distanceNm(aircraft, centre) <= area.radiusNm
    );
  });
}

/**
 * Highlights aircraft. A new, non-empty set asks the map to fit it, unless
 * every plane is inside the shown area, whose view already shows them. A fit
 * elsewhere clears the area outline. The same set returns `state` unchanged;
 * an empty set drops a pending highlight fit. The airspace highlight is left
 * alone: a search that finds no aircraft keeps the airspace it searched.
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

/** Drops the airspace highlight; returns the same state when there is none. */
function clearAirspaceHighlight(state: AtcState): AtcState {
  return state.highlightedAirspace === null
    ? state
    : { ...state, highlightedAirspace: null };
}

/** A tiny observable store shared by the map, the tools and the components. */
export interface AtcStore {
  getState(): AtcState;
  subscribe(listener: () => void): () => void;
  applySnapshot(snapshot: AircraftSnapshot): void;
  /** Caches a route (null for none published) under the upper-case callsign. */
  setRoute(callsign: string, route: Route | null): void;
  /** Stores the chart airports ({@link applyChart}). */
  setChart(payload: ChartAirports): void;
  /** Marks the chart limited ({@link applyChartLimited}). */
  setChartLimited(): void;
  /** Stores one airport's surfaces or status ({@link applySurfaces}). */
  setSurfaces(code: string, value: Surfaces | 'loading' | 'failed'): void;
  /** Stores the airspace shelves ({@link applyAirspace}). */
  setAirspace(payload: AirspacePayload): void;
  /** Marks airspace failed ({@link applyAirspaceFailed}). */
  setAirspaceFailed(): void;
  /** Patches the layers ({@link applyLayers}). */
  setLayers(patch: Partial<Layers>): void;
  /** Filters the aircraft on the map ({@link applyMapFilter}). */
  setMapFilter(filter: MapFilter): void;
  /** Removes the map filter ({@link applyMapFilter}). */
  clearMapFilter(): void;
  setFeedStatus(status: FeedStatus): void;
  /** Outlines an area and fits the map to it ({@link requestArea}). */
  showArea(area: ShownArea): void;
  /** Returns to the home view ({@link requestReset}). */
  resetView(): void;
  /** Selects an aircraft and brings it into view ({@link requestAircraft}). */
  revealAircraft(hex: string): void;
  /** Turns airports on and shows one ({@link requestAirport}). */
  showAirport(code: string): void;
  /** Highlights and shows an airport's airspace ({@link requestAirspace}). */
  showAirspace(code: string): void;
  /** Drops a pending map move ({@link cancelViewRequest}). */
  cancelViewRequest(): void;
  follow(hex: string | null): void;
  /** Highlights aircraft ({@link applyHighlight}). */
  highlight(hexes: readonly string[]): void;
  /** Clears the aircraft highlight and the airspace highlight. */
  clearHighlight(): void;
  select(hex: string | null): void;
  /** Flashes the plane's marker once. */
  pulse(hex: string): void;
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
        routes: new Map(state.routes).set(normalizeCallsign(callsign), route),
      }),
    setChart: (payload) => update(applyChart(state, payload)),
    setChartLimited: () => update(applyChartLimited(state)),
    setSurfaces: (code, value) => update(applySurfaces(state, code, value)),
    setAirspace: (payload) => update(applyAirspace(state, payload)),
    setAirspaceFailed: () => update(applyAirspaceFailed(state)),
    setLayers: (patch) => update(applyLayers(state, patch)),
    setMapFilter: (filter) => update(applyMapFilter(state, filter)),
    clearMapFilter: () => update(applyMapFilter(state, null)),
    setFeedStatus: (feedStatus) =>
      update(
        state.feedStatus === feedStatus ? state : { ...state, feedStatus },
      ),
    showArea: (area) => update(requestArea(state, area)),
    resetView: () => update(requestReset(state)),
    revealAircraft: (hex) => update(requestAircraft(state, hex)),
    showAirport: (code) => update(requestAirport(state, code)),
    showAirspace: (code) => update(requestAirspace(state, code)),
    cancelViewRequest: () => update(cancelViewRequest(state)),
    follow: (hex) => update(applyFollow(state, hex)),
    highlight: (hexes) => update(applyHighlight(state, hexes)),
    clearHighlight: () =>
      update(clearAirspaceHighlight(applyHighlight(state, []))),
    select: (hex) =>
      update({
        ...state,
        selectedHex: hex === null ? null : normalizeHex(hex),
      }),
    pulse: (hex) =>
      update({ ...state, pulse: { hex: normalizeHex(hex), at: now() } }),
  };
}
