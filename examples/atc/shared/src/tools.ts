import { s } from '@hashbrownai/core';
import {
  areaRadiusNm,
  findAircraft,
  type FindAircraftInput,
  findAircraftInput,
  toRow,
} from './find-aircraft';
import { distanceNm } from './geo';
import { airlineFor } from './names';
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

/** What the tools need from the app. */
export interface AtcToolContext {
  readonly store: AtcStore;
  /** Resolves null when no route is published; rejects when the lookup fails. */
  readonly fetchRoute: (callsign: string) => Promise<Route | null>;
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
      'Find aircraft on the map by airline, type, kind, altitude, approach or distance from an airport. With near, the map also shows and outlines that area. Returns compact rows.',
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
  resetMap: {
    name: 'resetMap' as const,
    description:
      'Zoom the map back out to the whole Pacific Northwest and remove any area outline.',
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
  const { store } = context;

  return {
    findAircraft: {
      ...ATC_TOOL_DEFINITIONS.findAircraft,
      handler: async (input: FindAircraftInput) => {
        if (input.near) {
          const centre = lookupPlace(input.near.airport);
          if (centre === null) {
            return unknownPlace(input.near.airport);
          }
          // The ring and the fit happen whether or not the model calls showArea.
          showAreaOnce(store, {
            airport: centre.code,
            radiusNm: areaRadiusNm(input.near.radiusNm),
          });
        }

        return findAircraft(store.getState(), input);
      },
    },
    lookupPlace: {
      ...ATC_TOOL_DEFINITIONS.lookupPlace,
      handler: async ({ query }: { query: string }) => {
        const airport = lookupPlace(query);

        return airport === null
          ? unknownPlace(query)
          : {
              found: true as const,
              code: airport.code,
              faa: airport.faa,
              name: airport.name,
              city: `${airport.city}, ${airport.state}`,
            };
      },
    },
    showArea: {
      ...ATC_TOOL_DEFINITIONS.showArea,
      handler: async (input: { airport: string; radiusNm: number | null }) => {
        const airport = lookupPlace(input.airport);
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
