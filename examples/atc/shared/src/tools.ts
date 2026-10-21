import type { s } from '@hashbrownai/core';
import {
  airspaceOf,
  type AirspaceShelf,
  airspaceTypes,
  altitudeMslFt,
  shelvesAt,
  type Surfaces,
} from './chart';
import { airportDirectory, chartAirportByCode } from './directory';
import { filterSummary } from './filter-view';
import {
  areaRadiusNm,
  findAircraft,
  type FindAircraftInput,
  toRow,
} from './find-aircraft';
import { distanceNm } from './geo';
import { airlineFor } from './names';
import { type Airport, AREAS, lookupPlace } from './places';
import type { Route } from './routes';
import {
  type AtcState,
  type AtcStore,
  normalizeCallsign,
  normalizeHex,
  type ShownArea,
} from './store';
import { ATC_TOOL_DEFINITIONS, type AtcToolName } from './tool-definitions';

/** How long chart tools wait for a loading chart before using what is loaded. */
const CHART_WAIT_MS = 5000;

/** How long `showAirport` waits for an airport's surfaces to load. */
const SURFACES_WAIT_MS = 3000;

/** `showAirport` counts aircraft this close; its result names it `aircraftWithin3Nm`. */
const AIRPORT_TRAFFIC_RADIUS_NM = 3;

const AIRSPACE_UNAVAILABLE = 'Airspace data is unavailable right now.';

/** The parsed arguments of one atc tool, inferred from its Skillet schema. */
type ToolInput<N extends AtcToolName> = s.Infer<
  (typeof ATC_TOOL_DEFINITIONS)[N]['schema']
>;

/** What the tools need from the app. */
export interface AtcToolContext {
  readonly store: AtcStore;
  /** Resolves null when no route is published; rejects when the lookup fails. */
  readonly fetchRoute: (callsign: string) => Promise<Route | null>;
  /**
   * Loads one airport's surfaces into the store. When given, `showAirport`
   * waits up to {@link SURFACES_WAIT_MS} for it so `diagram` is accurate.
   */
  readonly loadSurfaces?: (code: string) => Promise<void>;
  /**
   * How long chart and airspace tools wait for a loading chart or airspace;
   * {@link CHART_WAIT_MS} if unset.
   */
  readonly chartWaitMs?: number;
}

/**
 * The atc tools as framework-neutral definitions. Wrap each with Angular's
 * `createTool` or React's `useTool`. Handlers run in the browser against the
 * store; return small JSON, never whole state. A refusal is
 * `{ <verb>: false, reason: '<sentence>' }`.
 *
 * To add a tool: (1) add its definition to `ATC_TOOL_DEFINITIONS`
 * (`tool-definitions.ts`) and its handler here; (2) register it in
 * `angular/src/app/assistant.ts` and `react/src/assistant.tsx`; (3) add its
 * RUNNING and DONE labels in `tool-chips.ts` (the compiler asks for them);
 * (4) tell the model when to use it in `SYSTEM_PROMPT` (`contracts.ts`);
 * (5) script a model turn that calls it in `e2e/src/model.ts` and test it
 * in `e2e/src/atc.spec.ts`.
 */
export function createAtcTools(context: AtcToolContext) {
  const { store, chartWaitMs = CHART_WAIT_MS } = context;
  const chartSettled = () => whenChartSettled(store, chartWaitMs);
  const airspaceSettled = () => whenAirspaceSettled(store, chartWaitMs);
  // Bumped by every map filter tool call, so a waiting setMapFilter can tell
  // that a newer one ran.
  let filterVersion = 0;

  return {
    findAircraft: {
      ...ATC_TOOL_DEFINITIONS.findAircraft,
      handler: async (input: FindAircraftInput) => {
        if (input.near || input.approaching || input.inAirspace) {
          await chartSettled();
        }
        // Validate everything first: a refusal must not touch the map.
        let nearArea: ShownArea | null = null;
        if (input.near) {
          const centre = resolveAirport(store, input.near.airport);
          if (centre === null) {
            return {
              found: false as const,
              reason: unknownPlaceReason(input.near.airport),
            };
          }
          nearArea = {
            airport: centre.code,
            radiusNm: areaRadiusNm(input.near.radiusNm),
          };
        }

        let airspaceCode: string | null = null;
        if (input.inAirspace) {
          await airspaceSettled();
          const search = airspaceSearch(store, input.inAirspace);
          if ('reason' in search) {
            return { found: false as const, reason: search.reason };
          }
          airspaceCode = search.code;
        }

        // Exactly one view change; the airspace view wins over the ring.
        if (airspaceCode !== null) {
          store.showAirspace(airspaceCode);
        } else if (nearArea !== null) {
          showAreaOnce(store, nearArea);
        }

        const state = store.getState();
        const summary =
          state.mapFilter === null ? '' : filterSummary(state.mapFilter.filter);

        return {
          mapFilter: summary === '' ? null : summary,
          aircraft: findAircraft(
            state,
            input,
            undefined,
            state.mapFilter?.resolved ?? null,
          ),
        };
      },
    },
    setMapFilter: {
      ...ATC_TOOL_DEFINITIONS.setMapFilter,
      handler: async (input: ToolInput<'setMapFilter'>) => {
        // The chart wait can outlast a newer change; that change wins.
        const before = store.getState().mapFilter?.filter ?? null;
        filterVersion += 1;
        const mine = filterVersion;
        await chartSettled();
        const current = store.getState().mapFilter;
        if (filterVersion !== mine || (current?.filter ?? null) !== before) {
          const stale = current === null ? '' : filterSummary(current.filter);

          return {
            applied: false as const,
            mapFilter: stale === '' ? null : stale,
            unknownPlaces: [] as string[],
          };
        }
        store.setMapFilter(input);
        const applied = store.getState().mapFilter;
        const summary = applied === null ? '' : filterSummary(applied.filter);

        return {
          applied: true as const,
          mapFilter: summary,
          unknownPlaces: applied?.unknownPlaces ?? [],
        };
      },
    },
    clearMapFilter: {
      ...ATC_TOOL_DEFINITIONS.clearMapFilter,
      handler: async () => {
        filterVersion += 1;
        store.clearMapFilter();

        return { cleared: true as const };
      },
    },
    getSelectedAircraft: {
      ...ATC_TOOL_DEFINITIONS.getSelectedAircraft,
      handler: async () => {
        const { aircraft, selectedHex } = store.getState();
        const selected =
          selectedHex === null ? undefined : aircraft.get(selectedHex);

        return selected === undefined ? null : toRow(selected, AREAS.pnw);
      },
    },
    lookupRoute: {
      ...ATC_TOOL_DEFINITIONS.lookupRoute,
      handler: async ({ callsign }: ToolInput<'lookupRoute'>) => {
        const key = normalizeCallsign(callsign);
        if (airlineFor(key) === null) {
          return {
            found: false as const,
            reason: 'Routes exist only for airline callsigns.',
          };
        }
        const cached = store.getState().routes;
        let route: Route | null;
        if (cached.has(key)) {
          route = cached.get(key) ?? null;
        } else {
          try {
            route = await context.fetchRoute(key);
          } catch {
            // Not cached, so asking again retries.
            return {
              found: false as const,
              reason: 'The route lookup failed. Try again.',
            };
          }
          store.setRoute(key, route);
        }

        return route === null
          ? {
              found: false as const,
              reason: `No scheduled route is published for ${key}.`,
            }
          : {
              found: true as const,
              kind: 'scheduled route',
              stops: route.stops,
            };
      },
    },
    highlightAircraft: {
      ...ATC_TOOL_DEFINITIONS.highlightAircraft,
      handler: async ({ hexes }: ToolInput<'highlightAircraft'>) => {
        const { aircraft } = store.getState();
        const asked = [...new Set(hexes.map(normalizeHex))];
        const known = asked.filter((hex) => aircraft.has(hex));
        const unknown = asked.filter((hex) => !aircraft.has(hex));
        // Only drawable planes: an unknown hex would fail the shown-area check
        // and discard the area outline.
        store.highlight(known);

        return { highlighted: known.length, unknown };
      },
    },
    clearHighlight: {
      ...ATC_TOOL_DEFINITIONS.clearHighlight,
      handler: async () => {
        store.clearHighlight();

        return { cleared: true };
      },
    },
    followAircraft: {
      ...ATC_TOOL_DEFINITIONS.followAircraft,
      handler: async ({ hex }: ToolInput<'followAircraft'>) => {
        const key = normalizeHex(hex);
        if (!store.getState().aircraft.has(key)) {
          return {
            following: false as const,
            reason: `No aircraft with hex ${key} is on the map.`,
          };
        }
        store.follow(key);

        return { following: true as const };
      },
    },
    stopFollowing: {
      ...ATC_TOOL_DEFINITIONS.stopFollowing,
      handler: async () => {
        store.follow(null);

        return { following: false };
      },
    },
    lookupPlace: {
      ...ATC_TOOL_DEFINITIONS.lookupPlace,
      handler: async ({ query }: ToolInput<'lookupPlace'>) => {
        await chartSettled();
        const airport = resolveAirport(store, query);

        return airport === null
          ? { found: false as const, reason: unknownPlaceReason(query) }
          : {
              found: true as const,
              code: airport.code,
              faa: airport.faa,
              name: airport.name,
              city: `${airport.city}, ${airport.state}`,
              towered:
                chartAirportByCode(store.getState(), airport.code)?.towered ??
                null,
            };
      },
    },
    showArea: {
      ...ATC_TOOL_DEFINITIONS.showArea,
      handler: async (input: ToolInput<'showArea'>) => {
        await chartSettled();
        const airport = resolveAirport(store, input.airport);
        if (airport === null) {
          return {
            shown: false as const,
            reason: unknownPlaceReason(input.airport),
          };
        }
        const radiusNm = areaRadiusNm(input.radiusNm);
        store.showArea({ airport: airport.code, radiusNm });
        const state = store.getState();

        return {
          shown: true as const,
          airport: airport.code,
          radiusNm,
          aircraftInside: [...state.aircraft.values()].filter(
            (a) => distanceNm(a, airport) <= radiusNm,
          ).length,
          ...followNotice(state),
        };
      },
    },
    resetMap: {
      ...ATC_TOOL_DEFINITIONS.resetMap,
      handler: async () => {
        // The outline always goes; while following, the map stays on the plane.
        store.resetView();

        return { reset: true as const, ...followNotice(store.getState()) };
      },
    },
    showAirport: {
      ...ATC_TOOL_DEFINITIONS.showAirport,
      handler: async (input: ToolInput<'showAirport'>) => {
        await chartSettled();
        const found = resolveAirport(store, input.airport);
        if (found === null) {
          return {
            shown: false as const,
            reason: unknownPlaceReason(input.airport),
          };
        }
        store.showAirport(found.code);
        if (
          context.loadSurfaces &&
          chartAirportByCode(store.getState(), found.code) !== null
        ) {
          await settleWithin(
            context.loadSurfaces(found.code),
            SURFACES_WAIT_MS,
          );
        }
        const state = store.getState();
        const chart = chartAirportByCode(state, found.code);

        return {
          shown: true as const,
          code: found.code,
          name: chart?.name ?? found.name,
          towered: chart?.towered ?? null,
          towerPartTime: chart?.towerPartTime ?? null,
          frequencies: chart?.frequencies ?? null,
          elevationFt: chart?.elevationFt ?? null,
          runways:
            chart?.runways.map((r) => ({
              id: r.id,
              lengthFt: r.lengthFt,
              widthFt: r.widthFt,
              surface: r.surface,
            })) ?? [],
          diagram: diagramStatus(state.surfaces.get(found.code)),
          aircraftWithin3Nm: [...state.aircraft.values()].filter(
            (a) => distanceNm(a, found) <= AIRPORT_TRAFFIC_RADIUS_NM,
          ).length,
          ...followNotice(state),
        };
      },
    },
    showAirspace: {
      ...ATC_TOOL_DEFINITIONS.showAirspace,
      handler: async (input: ToolInput<'showAirspace'>) => {
        await chartSettled();
        await airspaceSettled();
        const found = resolveAirport(store, input.airport);
        if (found === null) {
          return {
            shown: false as const,
            reason: unknownPlaceReason(input.airport),
          };
        }
        if (store.getState().airspace.status !== 'ready') {
          return { shown: false as const, reason: AIRSPACE_UNAVAILABLE };
        }
        const shelves = airspaceOf(
          store.getState().airspace.shelves,
          found.code,
        );
        if (shelves.length === 0) {
          return {
            shown: false as const,
            reason: noAirspaceReason(found.code, null),
          };
        }
        store.showAirspace(found.code);
        const state = store.getState();

        return {
          shown: true as const,
          code: found.code,
          classes: airspaceTypes(shelves),
          shelves: shelves.map(shelfText),
          aircraftInside: [...state.aircraft.values()].filter(
            (a) => shelvesAt(shelves, a).length > 0,
          ).length,
          ...followNotice(state),
        };
      },
    },
    airspaceAt: {
      ...ATC_TOOL_DEFINITIONS.airspaceAt,
      handler: async ({ hex }: ToolInput<'airspaceAt'>) => {
        await airspaceSettled();
        const state = store.getState();
        if (state.airspace.status !== 'ready') {
          return { found: false as const, reason: AIRSPACE_UNAVAILABLE };
        }
        const key = normalizeHex(hex);
        const aircraft = state.aircraft.get(key);
        if (aircraft === undefined) {
          return {
            found: false as const,
            reason: `No aircraft with hex ${key} is on the map.`,
          };
        }
        const altitude = altitudeMslFt(aircraft);

        return {
          found: true as const,
          label: aircraft.label,
          altitudeFt: altitude?.ft ?? null,
          altitudeSource: altitude?.source ?? null,
          airspace: shelvesAt(state.airspace.shelves, aircraft).map(
            (shelf) => ({
              airport: shelf.airport,
              type: shelf.type,
              partTime: shelf.partTime,
            }),
          ),
        };
      },
    },
    setLayers: {
      ...ATC_TOOL_DEFINITIONS.setLayers,
      handler: async (input: ToolInput<'setLayers'>) => {
        store.setLayers({
          ...(input.airports === null ? {} : { airports: input.airports }),
          ...(input.airspace === null ? {} : { airspace: input.airspace }),
        });

        return { layers: store.getState().layers };
      },
    },
  } satisfies Record<AtcToolName, unknown>;
}

/** {@link whenSettled} for the chart: resolves once it is ready or limited. */
export function whenChartSettled(
  store: AtcStore,
  timeoutMs = CHART_WAIT_MS,
): Promise<void> {
  return whenSettled(store, (s) => s.chart.status === 'loading', timeoutMs);
}

/** {@link whenSettled} for airspace: resolves once it is ready or failed. */
export function whenAirspaceSettled(
  store: AtcStore,
  timeoutMs = CHART_WAIT_MS,
): Promise<void> {
  return whenSettled(store, (s) => s.airspace.status === 'loading', timeoutMs);
}

/**
 * Resolves once `isLoading` reports false, or after `timeoutMs`, whichever
 * comes first. Resolves at once when it is already false. Always unsubscribes.
 */
function whenSettled(
  store: AtcStore,
  isLoading: (state: AtcState) => boolean,
  timeoutMs: number,
): Promise<void> {
  if (!isLoading(store.getState())) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    const unsubscribe = store.subscribe(() => {
      if (!isLoading(store.getState())) {
        done();
      }
    });
  });
}

/** Waits for `promise` for up to `ms`, ignoring its result and any rejection. */
function settleWithin(promise: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  return Promise.race([
    promise.then(
      () => undefined,
      () => undefined,
    ),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** The airport the model named, from the chart once loaded, else the fallback table. */
function resolveAirport(store: AtcStore, query: string): Airport | null {
  return lookupPlace(query, airportDirectory(store.getState()));
}

/** What the model is told when a place is not in the airport table. */
function unknownPlaceReason(query: string): string {
  return `No airport matches "${query.trim()}". atc covers airports in the Pacific Northwest only.`;
}

/** Shows `area` unless the map already outlines exactly that area. */
function showAreaOnce(store: AtcStore, area: ShownArea): void {
  const shown = store.getState().shownArea;
  if (shown?.airport !== area.airport || shown.radiusNm !== area.radiusNm) {
    store.showArea(area);
  }
}

/** Whether the map moved; while following, the reason it stayed on the plane. */
function followNotice(state: AtcState): { moved: boolean; reason?: string } {
  const hex = state.followingHex;
  if (hex === null) {
    return { moved: true };
  }
  const label = state.aircraft.get(hex)?.label ?? hex;

  return {
    moved: false,
    reason: `Following ${label}. Call stopFollowing first to move the map.`,
  };
}

/** The airport whose airspace an `inAirspace` search uses, or why it cannot run. */
function airspaceSearch(
  store: AtcStore,
  inAirspace: NonNullable<FindAircraftInput['inAirspace']>,
): { code: string } | { reason: string } {
  const centre = resolveAirport(store, inAirspace.airport);
  if (centre === null) {
    return { reason: unknownPlaceReason(inAirspace.airport) };
  }
  const { airspace } = store.getState();
  if (airspace.status !== 'ready') {
    return { reason: AIRSPACE_UNAVAILABLE };
  }
  const cls = inAirspace.class;
  const shelves = airspaceOf(airspace.shelves, centre.code).filter(
    (shelf) => cls === null || shelf.class === cls,
  );
  if (shelves.length === 0) {
    return { reason: noAirspaceReason(centre.code, cls) };
  }

  return { code: centre.code };
}

/**
 * How `showAirport` reports the airport diagram: the surfaces' source;
 * `loading` when they did not arrive within {@link SURFACES_WAIT_MS};
 * `runways-only` when they failed or are not loaded.
 */
function diagramStatus(
  loaded: Surfaces | 'loading' | 'failed' | undefined,
): Surfaces['source'] | 'loading' {
  if (typeof loaded === 'object') {
    return loaded.source;
  }

  return loaded === 'loading' ? 'loading' : 'runways-only';
}

/** Why an airport has no airspace to show or search, of one class or any. */
function noAirspaceReason(code: string, cls: string | null): string {
  return cls === null
    ? `${code} has no Class B, C, D or E surface airspace.`
    : `${code} has no Class ${cls} airspace.`;
}

/** One shelf as the model reads it, from {@link shelfText}. */
interface AirspaceShelfText {
  readonly type: AirspaceShelf['type'];
  readonly floor: string;
  readonly ceiling: string;
  readonly partTime: boolean;
}

/**
 * One shelf as the model reads it. An exclusive ceiling reads "below 3,000
 * MSL"; an inclusive one reads "3,000 MSL".
 */
function shelfText(shelf: AirspaceShelf): AirspaceShelfText {
  return {
    type: shelf.type,
    floor: shelfFeet(shelf.floor.ft, shelf.floor.ref === 'SFC'),
    ceiling:
      shelf.ceiling === null
        ? 'up to overlying airspace'
        : `${shelf.ceiling.exclusive ? 'below ' : ''}${shelfFeet(shelf.ceiling.ft, false)}`,
    partTime: shelf.partTime,
  };
}

/** Feet as the model reads them: "SFC" for the surface, else "4,000 MSL". */
function shelfFeet(ft: number, sfc: boolean): string {
  return sfc ? 'SFC' : `${ft.toLocaleString('en-US')} MSL`;
}
