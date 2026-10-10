/* eslint-disable @typescript-eslint/no-unused-vars -- no-input handlers keep an unused parameter so every tool has the same shape */
import { s } from '@hashbrownai/core';
import type { Aircraft } from './aircraft';
import { distanceNm, isApproaching } from './geo';
import { aircraftTypeName, airlineName } from './names';
import {
  AIRPORT_CODES,
  AIRPORTS,
  type Area,
  AREAS,
  type LatLon,
} from './places';
import {
  type AtcState,
  type AtcStore,
  normalizeHex,
  type Route,
} from './store';

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
    minAltitudeFt: s.anyOf([s.number('Minimum altitude in feet'), s.nullish()]),
    maxAltitudeFt: s.anyOf([s.number('Maximum altitude in feet'), s.nullish()]),
    approaching: s.anyOf([
      s.enumeration('Only aircraft on approach to this airport', [
        ...AIRPORT_CODES,
      ]),
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
  readonly callsign: string;
  readonly airline: string;
  readonly aircraftType: string;
  readonly altitudeFt: number | null;
  readonly groundSpeedKt: number | null;
  readonly trackDeg: number | null;
  readonly distanceNm: number;
}

function toRow(aircraft: Aircraft, from: LatLon): AircraftRow {
  return {
    hex: aircraft.hex,
    callsign: aircraft.callsign,
    airline: airlineName(aircraft.callsign),
    aircraftType: aircraftTypeName(aircraft.typeCode),
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
 * airport in `approaching`, or from the area centre.
 */
export function findAircraft(
  state: AtcState,
  input: FindAircraftInput,
  area: Area = AREAS.ord,
): AircraftRow[] {
  const airline = text(input.airline);
  const type = text(input.typeCode);
  const airport =
    input.approaching === null ? null : AIRPORTS[input.approaching];
  const limit = Math.min(20, Math.max(1, Math.round(input.limit)));

  return [...state.aircraft.values()]
    .filter(
      (a) =>
        airline === null ||
        a.callsign.slice(0, 3).toLowerCase() === airline ||
        airlineName(a.callsign).toLowerCase().includes(airline),
    )
    .filter(
      (a) =>
        type === null ||
        (a.typeCode ?? '').toLowerCase() === type ||
        aircraftTypeName(a.typeCode).toLowerCase().includes(type),
    )
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
    .map((a) => toRow(a, airport ?? area))
    .sort(SORTS[input.sortBy])
    .slice(0, limit);
}

/** What the tools need from the app. */
export interface AtcToolContext {
  readonly store: AtcStore;
  readonly fetchRoute: (callsign: string) => Promise<Route | null>;
}

const noInput = s.object('No input', {});

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
        'Find aircraft on the map by airline, type, altitude or approach. Returns compact rows.',
      schema: findAircraftInput,
      handler: async (input: FindAircraftInput) =>
        findAircraft(store.getState(), input),
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

        return selected === undefined ? null : toRow(selected, AREAS.ord);
      },
    },
    lookupRoute: {
      name: 'lookupRoute' as const,
      description:
        "Look up an aircraft's scheduled route by callsign. Routes come from public data and can be wrong.",
      schema: s.object('Route lookup', {
        callsign: s.string('The callsign, such as UAL1372'),
      }),
      handler: async ({ callsign }: { callsign: string }) => {
        const key = callsign.trim().toUpperCase();
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
