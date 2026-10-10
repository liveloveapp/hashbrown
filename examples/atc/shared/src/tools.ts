/* eslint-disable @typescript-eslint/no-unused-vars -- no-input handlers keep an unused parameter so every tool has the same shape */
import { s } from '@hashbrownai/core';
import type { Aircraft } from './aircraft';
import { type AircraftKind, KINDS } from './kinds';
import { distanceNm, isApproaching } from './geo';
import { aircraftTypeName, airlineFor } from './names';
import {
  type Airport,
  AIRPORT_CODES,
  AIRPORTS,
  type Area,
  AREAS,
  type LatLon,
  lookupPlace,
} from './places';
import {
  type AtcState,
  type AtcStore,
  normalizeHex,
  type Route,
  type ShownArea,
} from './store';

/** Radius used when the model asks for an area without one. */
export const DEFAULT_AREA_RADIUS_NM = 25;

/** Clamps an area radius to 5 to 150 nm; null or non-finite gives the default. */
export function areaRadiusNm(radiusNm: number | null): number {
  return radiusNm === null || !Number.isFinite(radiusNm)
    ? DEFAULT_AREA_RADIUS_NM
    : Math.min(150, Math.max(5, Math.round(radiusNm)));
}

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

/** Input schema for `findAircraft`. Every field is required; null means "any". */
export const findAircraftInput = s.object(
  'Filters for aircraft currently on the map',
  {
    airline: s.anyOf([
      s.string('Airline ICAO code such as UAL, or a name such as United'),
      s.nullish(),
    ]),
    typeCode: s.anyOf([
      s.string('ICAO type code such as B738, or a family such as 737'),
      s.nullish(),
    ]),
    kind: s.anyOf([
      s.enumeration(
        'Only this kind of aircraft: jet, twin (twin-engine prop), single (single-engine prop) or rotor (helicopter)',
        [...KINDS],
      ),
      s.nullish(),
    ]),
    minAltitudeFt: s.anyOf([s.number('Minimum altitude in feet'), s.nullish()]),
    maxAltitudeFt: s.anyOf([s.number('Maximum altitude in feet'), s.nullish()]),
    approaching: s.anyOf([
      s.enumeration('Only aircraft on approach to this airport (ICAO code)', [
        ...AIRPORT_CODES,
      ]),
      s.nullish(),
    ]),
    near: s.anyOf([
      s.object('Only aircraft within radiusNm of an airport', {
        airport: s.string('ICAO code from lookupPlace, such as KBDN'),
        radiusNm: s.number('Radius in nautical miles, 5 to 150'),
      }),
      s.nullish(),
    ]),
    sortBy: s.enumeration('Sort order', ['altitude', 'speed', 'distance']),
    limit: s.integer('Maximum rows, 1 to 20'),
  },
);

/** The parsed input of `findAircraft`. */
export type FindAircraftInput = s.Infer<typeof findAircraftInput>;

/** A compact aircraft row returned to the model. */
export interface AircraftRow {
  readonly hex: string;
  /** How to name the aircraft: airline callsign, registration, callsign or hex. */
  readonly label: string;
  readonly callsign: string | null;
  readonly registration: string | null;
  /** The airline for airline callsigns; null for private and other traffic. */
  readonly airline: string | null;
  readonly aircraftType: string;
  /** The silhouette drawn on the map. */
  readonly kind: AircraftKind;
  readonly altitudeFt: number | null;
  readonly groundSpeedKt: number | null;
  readonly trackDeg: number | null;
  readonly distanceNm: number;
}

function toRow(aircraft: Aircraft, from: LatLon): AircraftRow {
  return {
    hex: aircraft.hex,
    label: aircraft.label,
    callsign: aircraft.callsign,
    registration: aircraft.registration,
    airline: airlineFor(aircraft.callsign),
    aircraftType: aircraftTypeName(aircraft.typeCode),
    kind: aircraft.kind,
    altitudeFt: aircraft.altitudeFt,
    groundSpeedKt: aircraft.groundSpeedKt,
    trackDeg: aircraft.trackDeg,
    distanceNm: Math.round(distanceNm(aircraft, from) * 10) / 10,
  };
}

function text(value: string | null): string | null {
  const trimmed = value?.trim().toLowerCase() ?? '';

  return trimmed === '' ? null : trimmed;
}

/** True when an airliner's ICAO code or airline name matches `query`. */
function matchesAirline(aircraft: Aircraft, query: string): boolean {
  const name = airlineFor(aircraft.callsign);

  return (
    name !== null &&
    (aircraft.callsign?.slice(0, 3).toLowerCase() === query ||
      name.toLowerCase().includes(query))
  );
}

const SORTS: Record<
  FindAircraftInput['sortBy'],
  (a: AircraftRow, b: AircraftRow) => number
> = {
  altitude: (a, b) => (b.altitudeFt ?? -Infinity) - (a.altitudeFt ?? -Infinity),
  speed: (a, b) =>
    (b.groundSpeedKt ?? -Infinity) - (a.groundSpeedKt ?? -Infinity),
  distance: (a, b) => a.distanceNm - b.distanceNm,
};

/**
 * Filters and sorts the aircraft on the map. Distances are measured from the
 * airport in `near`, else the one in `approaching`, else the area centre.
 * A `near` airport outside the table matches nothing.
 */
export function findAircraft(
  state: AtcState,
  input: FindAircraftInput,
  area: Area = AREAS.pnw,
): AircraftRow[] {
  const airline = text(input.airline);
  const type = text(input.typeCode);
  const airport = input.approaching ? AIRPORTS[input.approaching] : null;
  const near = input.near ?? null;
  const centre: Airport | null =
    near === null ? null : lookupPlace(near.airport);
  if (near !== null && centre === null) {
    return [];
  }
  const radius = near === null ? Infinity : areaRadiusNm(near.radiusNm);
  const limit = Math.min(20, Math.max(1, Math.round(input.limit)));

  return [...state.aircraft.values()]
    .filter((a) => airline === null || matchesAirline(a, airline))
    .filter(
      (a) =>
        type === null ||
        (a.typeCode ?? '').toLowerCase() === type ||
        aircraftTypeName(a.typeCode).toLowerCase().includes(type),
    )
    .filter((a) => !input.kind || a.kind === input.kind)
    .filter(
      (a) =>
        input.minAltitudeFt === null ||
        (a.altitudeFt !== null && a.altitudeFt >= input.minAltitudeFt),
    )
    .filter(
      (a) =>
        input.maxAltitudeFt === null ||
        (a.altitudeFt !== null && a.altitudeFt <= input.maxAltitudeFt),
    )
    .filter((a) => airport === null || isApproaching(a, airport))
    .filter((a) => centre === null || distanceNm(a, centre) <= radius)
    .map((a) => toRow(a, centre ?? airport ?? area))
    .sort(SORTS[input.sortBy])
    .slice(0, limit);
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
 * The name of every atc tool. The server forwards only these to the model, so
 * `/api/run` cannot be used as a general-purpose proxy.
 */
export const ATC_TOOL_NAMES = [
  'findAircraft',
  'lookupPlace',
  'showArea',
  'resetMap',
  'getSelectedAircraft',
  'lookupRoute',
  'highlightAircraft',
  'clearHighlight',
  'followAircraft',
  'stopFollowing',
] as const satisfies readonly AtcToolName[];

/** The name of one atc tool; a key of `createAtcTools`'s result. */
export type AtcToolName = keyof ReturnType<typeof createAtcTools>;

/**
 * The atc tools as framework-neutral definitions. Wrap each with Angular's
 * `createTool` or React's `useTool`.
 */
export function createAtcTools(context: AtcToolContext) {
  const { store } = context;

  return {
    findAircraft: {
      name: 'findAircraft' as const,
      description:
        'Find aircraft on the map by airline, type, kind, altitude, approach or distance from an airport. With near, the map also shows and outlines that area. Returns compact rows.',
      schema: findAircraftInput,
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
      name: 'lookupPlace' as const,
      description:
        'Find a Pacific Northwest airport by ICAO, IATA or FAA code, name or city. Returns its ICAO code, or found false.',
      schema: s.object('Place lookup', {
        query: s.string('What the user called the place, such as Bend or KBDN'),
      }),
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
      name: 'resetMap' as const,
      description:
        'Zoom the map back out to the whole Pacific Northwest and remove any area outline.',
      schema: noInput,
      handler: async (_input: Record<string, never>) => {
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
      name: 'getSelectedAircraft' as const,
      description:
        'Get the aircraft the user clicked on the map, or null if none is selected.',
      schema: noInput,
      handler: async (_input: Record<string, never>) => {
        const { selectedHex } = store.getState();
        const selected =
          selectedHex === null
            ? undefined
            : store.getState().aircraft.get(selectedHex);

        return selected === undefined ? null : toRow(selected, AREAS.pnw);
      },
    },
    lookupRoute: {
      name: 'lookupRoute' as const,
      description:
        "Look up an airline flight's scheduled route by its airline callsign. Routes come from public data and can be wrong.",
      schema: s.object('Route lookup', {
        callsign: s.string('The callsign, such as UAL1372'),
      }),
      handler: async ({ callsign }: { callsign: string }) => {
        const key = callsign.trim().toUpperCase();
        if (airlineFor(key) === null) {
          return {
            found: false,
            reason: 'Routes exist only for airline callsigns.',
          };
        }
        const cached = store.getState().routes;
        const route = cached.has(key)
          ? (cached.get(key) ?? null)
          : await context.fetchRoute(key);
        if (!cached.has(key)) {
          store.setRoute(key, route);
        }

        return route === null
          ? { found: false }
          : { found: true, kind: 'scheduled route', stops: route.stops };
      },
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
      handler: async ({ hexes }: { hexes: string[] }) => {
        store.highlight(hexes);
        const unknown = hexes
          .map(normalizeHex)
          .filter((hex) => !store.getState().aircraft.has(hex));

        return { highlighted: hexes.length - unknown.length, unknown };
      },
    },
    clearHighlight: {
      name: 'clearHighlight' as const,
      description: 'Show every aircraft on the map again.',
      schema: noInput,
      handler: async (_input: Record<string, never>) => {
        store.clearHighlight();

        return { cleared: true };
      },
    },
    followAircraft: {
      name: 'followAircraft' as const,
      description: 'Keep the map centred on one aircraft.',
      schema: s.object('Aircraft to follow', {
        hex: s.string('Aircraft hex code from a tool result'),
      }),
      handler: async ({ hex }: { hex: string }) => {
        if (!store.getState().aircraft.has(normalizeHex(hex))) {
          return { following: false, reason: 'Unknown aircraft' };
        }
        store.follow(hex);

        return { following: true };
      },
    },
    stopFollowing: {
      name: 'stopFollowing' as const,
      description: 'Stop following an aircraft.',
      schema: noInput,
      handler: async (_input: Record<string, never>) => {
        store.follow(null);

        return { following: false };
      },
    },
  };
}
