import { s } from '@hashbrownai/core';
import {
  areaRadiusNm,
  findAircraft,
  type FindAircraftInput,
  findAircraftInput,
  toRow,
} from './find-aircraft';
import {
  airspaceOf,
  type AirspaceShelf,
  airspaceTypes,
  altitudeMslFt,
  shelvesAt,
} from './chart';
import { distanceNm } from './geo';
import { airlineFor } from './names';
import { airportDirectory, chartAirportByCode } from './directory';
import { AREAS, lookupPlace } from './places';
import {
  type AtcState,
  type AtcStore,
  normalizeHex,
  type Route,
  type ShownArea,
} from './store';

/** What the model is told when a place is not in the airport table. */
export function unknownPlace(query: string): {
  found: false;
  reason: string;
} {
  return {
    found: false,
    reason: `No airport matches "${query.trim()}". atc covers airports in the Pacific Northwest only.`,
  };
}

/** Shows `area` unless the map already outlines exactly that area. */
function showAreaOnce(store: AtcStore, area: ShownArea): void {
  const shown = store.getState().shownArea;
  if (shown?.airport !== area.airport || shown.radiusNm !== area.radiusNm) {
    store.showArea(area);
  }
}

/** How long chart tools wait for a loading chart before using what is loaded. */
export const CHART_WAIT_MS = 5000;

/** How long `showAirport` waits for an airport's surfaces to load. */
export const SURFACES_WAIT_MS = 3000;

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

/**
 * Resolves once `chart.status` is no longer `loading` (the chart is `ready` or
 * `limited`), or after `timeoutMs`, whichever comes first. Resolves at once
 * when the chart has already settled. Always unsubscribes from the store.
 */
export function whenChartSettled(
  store: AtcStore,
  timeoutMs = CHART_WAIT_MS,
): Promise<void> {
  return whenSettled(store, (s) => s.chart.status === 'loading', timeoutMs);
}

/**
 * Resolves once `airspace.status` is no longer `loading` (it is `ready` or
 * `failed`), or after `timeoutMs`, whichever comes first. Resolves at once
 * when the airspace has already settled. Always unsubscribes from the store.
 */
export function whenAirspaceSettled(
  store: AtcStore,
  timeoutMs = CHART_WAIT_MS,
): Promise<void> {
  return whenSettled(store, (s) => s.airspace.status === 'loading', timeoutMs);
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

const noInput = s.object('No input', {});

/** The label of the followed aircraft, or null when none is followed. */
function followedLabel(state: AtcState): string | null {
  const hex = state.followingHex;

  return hex === null ? null : (state.aircraft.get(hex)?.label ?? hex);
}

function followingReason(label: string): string {
  return `Following ${label}. Call stopFollowing first to move the map.`;
}

const AIRSPACE_UNAVAILABLE = 'Airspace data is unavailable right now.';

/** Why an airport has no airspace to show or search, of one class or any. */
function noAirspaceReason(code: string, cls: string | null): string {
  return cls === null
    ? `${code} has no Class B, C, D or E surface airspace.`
    : `${code} has no Class ${cls} airspace.`;
}

/** Feet as the model reads them: "SFC" for the surface, else "4,000 MSL". */
function shelfFeet(ft: number, sfc: boolean): string {
  return sfc ? 'SFC' : `${ft.toLocaleString('en-US')} MSL`;
}

/**
 * One shelf as the model reads it. An exclusive ceiling reads "below 3,000
 * MSL"; an inclusive one reads "3,000 MSL".
 */
function shelfText(shelf: AirspaceShelf) {
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

/**
 * Each atc tool's name, description and input schema, without its handler.
 * The browser adds handlers in {@link createAtcTools}; the server sends these
 * definitions to the model in place of whatever the client sent, so
 * `/api/run` cannot be used as a general-purpose proxy.
 */
export const ATC_TOOL_DEFINITIONS = {
  findAircraft: {
    name: 'findAircraft' as const,
    description:
      "Find aircraft on the map by airline, type, kind, altitude, approach or distance from an airport, or keep only aircraft inside an airport's airspace (optionally of one class). With near, the map also shows and outlines that area; with inAirspace, it highlights that airspace; with both, the airspace highlight is shown. Returns compact rows.",
    schema: findAircraftInput,
  },
  lookupPlace: {
    name: 'lookupPlace' as const,
    description:
      'Find a Pacific Northwest airport by ICAO, IATA or FAA code, name or city. Returns its ICAO code, or found false.',
    schema: s.object('Place lookup', {
      query: s.string('What the user called the place, such as Bend or KBDN'),
    }),
  },
  showArea: {
    name: 'showArea' as const,
    description:
      'Move the map to a circle around an airport and outline it. Returns how many aircraft are inside.',
    schema: s.object('Area to show', {
      airport: s.string('ICAO code from lookupPlace, such as KBDN'),
      radiusNm: s.anyOf([
        s.number('Radius in nautical miles, 5 to 150; 25 if null'),
        s.nullish(),
      ]),
    }),
  },
  showAirport: {
    name: 'showAirport' as const,
    description:
      'Show one airport on the map at diagram zoom, with its runways and taxiways, and turn the airports layer on. Returns its tower, frequencies, runways and elevation from FAA data.',
    schema: s.object('Airport to show', {
      airport: s.string('ICAO code from lookupPlace, such as KRDM'),
    }),
  },
  showAirspace: {
    name: 'showAirspace' as const,
    description:
      "Show a place's controlled airspace (Class B, C, D and the Class E surface area) on the map, highlighted, and return its shelves and how many aircraft are inside.",
    schema: s.object('Airspace to show', {
      airport: s.string('ICAO code from lookupPlace, such as KPDX'),
    }),
  },
  airspaceAt: {
    name: 'airspaceAt' as const,
    description:
      'Which controlled airspace one aircraft is in now, from its position and altitude.',
    schema: s.object('Aircraft to check', {
      hex: s.string('Aircraft hex code from a tool result'),
    }),
  },
  setLayers: {
    name: 'setLayers' as const,
    description:
      'Show or hide map overlays. Pass null to leave a layer as it is.',
    schema: s.object('Layers', {
      airports: s.anyOf([s.boolean('Show airports'), s.nullish()]),
      airspace: s.anyOf([s.boolean('Show airspace'), s.nullish()]),
    }),
  },
  resetMap: {
    name: 'resetMap' as const,
    description:
      'Return the map to its home view over central Oregon (Bend, Redmond, Sisters, Prineville) and remove any area outline.',
    schema: noInput,
  },
  getSelectedAircraft: {
    name: 'getSelectedAircraft' as const,
    description:
      'Get the aircraft the user clicked on the map, or null if none is selected.',
    schema: noInput,
  },
  lookupRoute: {
    name: 'lookupRoute' as const,
    description:
      "Look up an airline flight's scheduled route by its airline callsign. Routes come from public data and can be wrong.",
    schema: s.object('Route lookup', {
      callsign: s.string('The callsign, such as UAL1372'),
    }),
  },
  highlightAircraft: {
    name: 'highlightAircraft' as const,
    description: 'Highlight these aircraft on the map and dim the rest.',
    schema: s.object('Aircraft to highlight', {
      hexes: s.array(
        'Aircraft hex codes from tool results',
        s.string('Aircraft hex code'),
      ),
    }),
  },
  clearHighlight: {
    name: 'clearHighlight' as const,
    description: 'Show every aircraft on the map again.',
    schema: noInput,
  },
  followAircraft: {
    name: 'followAircraft' as const,
    description: 'Keep the map centred on one aircraft.',
    schema: s.object('Aircraft to follow', {
      hex: s.string('Aircraft hex code from a tool result'),
    }),
  },
  stopFollowing: {
    name: 'stopFollowing' as const,
    description: 'Stop following an aircraft.',
    schema: noInput,
  },
};

/** The name of one atc tool. */
export type AtcToolName = keyof typeof ATC_TOOL_DEFINITIONS;

/** The name of every atc tool. */
export const ATC_TOOL_NAMES = Object.keys(
  ATC_TOOL_DEFINITIONS,
) as readonly AtcToolName[];

/**
 * The atc tools as framework-neutral definitions. Wrap each with Angular's
 * `createTool` or React's `useTool`. Handlers run in the browser against the
 * store; return small JSON, never whole state. A refusal is
 * `{ <verb>: false, reason: '<sentence>' }`.
 *
 * To add a tool: (1) add its definition to `ATC_TOOL_DEFINITIONS` and its
 * handler here; (2) register it in
 * `angular/src/app/assistant.ts` and `react/src/assistant.tsx`; (3) add its
 * RUNNING and DONE labels in `tool-chips.ts` (the compiler asks for them);
 * (4) tell the model when to use it in `SYSTEM_PROMPT` (`contracts.ts`);
 * (5) script it in `e2e/src/atc.spec.ts`.
 */
export function createAtcTools(context: AtcToolContext) {
  const { store, chartWaitMs = CHART_WAIT_MS } = context;
  const chartSettled = () => whenChartSettled(store, chartWaitMs);
  const airspaceSettled = () => whenAirspaceSettled(store, chartWaitMs);

  return {
    findAircraft: {
      ...ATC_TOOL_DEFINITIONS.findAircraft,
      handler: async (input: FindAircraftInput) => {
        if (input.near || input.approaching || input.inAirspace) {
          await chartSettled();
        }
        // Validate everything first: a refusal must not touch the map.
        let nearArea: { airport: string; radiusNm: number } | null = null;
        if (input.near) {
          const centre = lookupPlace(
            input.near.airport,
            airportDirectory(store.getState()),
          );
          if (centre === null) {
            return unknownPlace(input.near.airport);
          }
          nearArea = {
            airport: centre.code,
            radiusNm: areaRadiusNm(input.near.radiusNm),
          };
        }

        let airspaceCode: string | null = null;
        if (input.inAirspace) {
          await airspaceSettled();
          const centre = lookupPlace(
            input.inAirspace.airport,
            airportDirectory(store.getState()),
          );
          if (centre === null) {
            return unknownPlace(input.inAirspace.airport);
          }
          if (store.getState().airspace.status !== 'ready') {
            return { found: false as const, reason: AIRSPACE_UNAVAILABLE };
          }
          const cls = input.inAirspace.class;
          const shelves = airspaceOf(
            store.getState().airspace.shelves,
            centre.code,
          ).filter((shelf) => cls === null || shelf.class === cls);
          if (shelves.length === 0) {
            return {
              found: false as const,
              reason: noAirspaceReason(centre.code, cls),
            };
          }
          airspaceCode = centre.code;
        }

        // Exactly one view change; the airspace view wins over the ring.
        if (airspaceCode !== null) {
          store.showAirspace(airspaceCode);
        } else if (nearArea !== null) {
          showAreaOnce(store, nearArea);
        }

        return findAircraft(store.getState(), input);
      },
    },
    lookupPlace: {
      ...ATC_TOOL_DEFINITIONS.lookupPlace,
      handler: async ({ query }: { query: string }) => {
        await chartSettled();
        const airport = lookupPlace(query, airportDirectory(store.getState()));

        return airport === null
          ? unknownPlace(query)
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
      handler: async (input: { airport: string; radiusNm: number | null }) => {
        await chartSettled();
        const airport = lookupPlace(
          input.airport,
          airportDirectory(store.getState()),
        );
        if (airport === null) {
          const { reason } = unknownPlace(input.airport);

          return { shown: false as const, reason };
        }
        const radiusNm = areaRadiusNm(input.radiusNm ?? null);
        store.showArea({ airport: airport.code, radiusNm });
        const state = store.getState();
        const aircraftInside = [...state.aircraft.values()].filter(
          (a) => distanceNm(a, airport) <= radiusNm,
        ).length;
        const followed = followedLabel(state);

        return {
          shown: true as const,
          airport: airport.code,
          radiusNm,
          aircraftInside,
          moved: followed === null,
          ...(followed === null ? {} : { reason: followingReason(followed) }),
        };
      },
    },
    showAirport: {
      ...ATC_TOOL_DEFINITIONS.showAirport,
      handler: async (input: { airport: string }) => {
        await chartSettled();
        const found = lookupPlace(
          input.airport,
          airportDirectory(store.getState()),
        );
        if (found === null) {
          const { reason } = unknownPlace(input.airport);

          return { shown: false as const, reason };
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
        const loaded = state.surfaces.get(found.code);
        const followed = followedLabel(state);

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
          // 'loading' when the surfaces did not arrive within SURFACES_WAIT_MS.
          diagram:
            typeof loaded === 'object'
              ? loaded.source
              : loaded === 'loading'
                ? ('loading' as const)
                : ('runways-only' as const),
          aircraftWithin3Nm: [...state.aircraft.values()].filter(
            (a) => distanceNm(a, found) <= 3,
          ).length,
          moved: followed === null,
          ...(followed === null ? {} : { reason: followingReason(followed) }),
        };
      },
    },
    showAirspace: {
      ...ATC_TOOL_DEFINITIONS.showAirspace,
      handler: async (input: { airport: string }) => {
        await chartSettled();
        await airspaceSettled();
        const found = lookupPlace(
          input.airport,
          airportDirectory(store.getState()),
        );
        if (found === null) {
          const { reason } = unknownPlace(input.airport);

          return { shown: false as const, reason };
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
        const followed = followedLabel(state);

        return {
          shown: true as const,
          code: found.code,
          classes: airspaceTypes(shelves),
          shelves: shelves.map(shelfText),
          aircraftInside: [...state.aircraft.values()].filter(
            (a) => shelvesAt(shelves, a).length > 0,
          ).length,
          moved: followed === null,
          ...(followed === null ? {} : { reason: followingReason(followed) }),
        };
      },
    },
    airspaceAt: {
      ...ATC_TOOL_DEFINITIONS.airspaceAt,
      handler: async ({ hex }: { hex: string }) => {
        await airspaceSettled();
        if (store.getState().airspace.status !== 'ready') {
          return { found: false as const, reason: AIRSPACE_UNAVAILABLE };
        }
        const state = store.getState();
        const aircraft = state.aircraft.get(normalizeHex(hex));
        if (aircraft === undefined) {
          return {
            found: false as const,
            reason: `No aircraft with hex ${normalizeHex(hex)} is on the map.`,
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
      handler: async (input: {
        airports: boolean | null;
        airspace: boolean | null;
      }) => {
        store.setLayers({
          ...(input.airports === null ? {} : { airports: input.airports }),
          ...(input.airspace === null ? {} : { airspace: input.airspace }),
        });

        return { layers: store.getState().layers };
      },
    },
    resetMap: {
      ...ATC_TOOL_DEFINITIONS.resetMap,
      handler: async () => {
        // The outline always goes; while following, the map stays on the plane.
        store.resetView();
        const followed = followedLabel(store.getState());

        return {
          reset: true as const,
          moved: followed === null,
          ...(followed === null ? {} : { reason: followingReason(followed) }),
        };
      },
    },
    getSelectedAircraft: {
      ...ATC_TOOL_DEFINITIONS.getSelectedAircraft,
      handler: async () => {
        const { selectedHex } = store.getState();
        const selected =
          selectedHex === null
            ? undefined
            : store.getState().aircraft.get(selectedHex);

        return selected === undefined ? null : toRow(selected, AREAS.pnw);
      },
    },
    lookupRoute: {
      ...ATC_TOOL_DEFINITIONS.lookupRoute,
      handler: async ({ callsign }: { callsign: string }) => {
        const key = callsign.trim().toUpperCase();
        if (airlineFor(key) === null) {
          return {
            found: false,
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
              found: false,
              reason: 'The route lookup failed. Try again.',
            };
          }
          store.setRoute(key, route);
        }

        return route === null
          ? {
              found: false,
              reason: `No scheduled route is published for ${key}.`,
            }
          : { found: true, kind: 'scheduled route', stops: route.stops };
      },
    },
    highlightAircraft: {
      ...ATC_TOOL_DEFINITIONS.highlightAircraft,
      handler: async ({ hexes }: { hexes: string[] }) => {
        store.highlight(hexes);
        const asked = [...new Set(hexes.map(normalizeHex))];
        const unknown = asked.filter(
          (hex) => !store.getState().aircraft.has(hex),
        );

        return { highlighted: asked.length - unknown.length, unknown };
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
      handler: async ({ hex }: { hex: string }) => {
        if (!store.getState().aircraft.has(normalizeHex(hex))) {
          return {
            following: false,
            reason: `No aircraft with hex ${normalizeHex(hex)} is on the map.`,
          };
        }
        store.follow(hex);

        return { following: true };
      },
    },
    stopFollowing: {
      ...ATC_TOOL_DEFINITIONS.stopFollowing,
      handler: async () => {
        store.follow(null);

        return { following: false };
      },
    },
  } satisfies Record<AtcToolName, unknown>;
}
