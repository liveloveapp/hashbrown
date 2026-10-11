import {
  formatAltitude,
  formatClock,
  formatHeading,
  formatSpeed,
} from './format';
import type { Aircraft } from './aircraft';
import { distanceNm, etaMinutes, isApproaching } from './geo';
import { aircraftTypeName, knownAirlineFor } from './names';
import { airportByCode, chartAirportByCode } from './directory';
import {
  type AtcState,
  type FeedStatus,
  lookupAircraft,
  normalizeHex,
  type Route,
} from './store';

/** What a FlightCard shows. */
export type FlightCardView =
  | { readonly status: 'unknown'; readonly hex: string }
  | {
      readonly status: 'live' | 'out-of-range';
      readonly hex: string;
      /** The display label: airline callsign, registration, callsign or hex. */
      readonly label: string;
      /**
       * The line beside the label: the airline for airline callsigns, else the
       * registration when the label is not already it, else null.
       */
      readonly subtitle: string | null;
      readonly aircraftType: string;
      readonly altitude: string;
      readonly speed: string;
      readonly heading: string;
      readonly route: string | null;
      readonly lastSeen: string | null;
      /** True when this is the plane selected on the map. */
      readonly selected: boolean;
    };

/** Route label: null when never looked up, "Route unavailable" when missing. */
export function routeText(
  routes: ReadonlyMap<string, Route | null>,
  callsign: string,
): string | null {
  if (!routes.has(callsign)) {
    return null;
  }
  const route = routes.get(callsign);

  return route
    ? `${route.stops.map((stop) => stop.iata).join(' → ')} · scheduled route`
    : 'Route unavailable';
}

/**
 * The line beside an aircraft's label: its airline for airline callsigns
 * with a known name, else its registration when the label is not already
 * it, else null (a bare airline code would only repeat the label).
 */
export function aircraftSubtitle(aircraft: Aircraft): string | null {
  const airline = knownAirlineFor(aircraft.callsign);
  if (airline !== null) {
    return airline;
  }
  const { registration, label } = aircraft;

  return registration === null || registration.replaceAll('-', '') === label
    ? null
    : registration;
}

/** Builds the FlightCard view for a hex code. */
export function flightCardView(
  state: AtcState,
  hex: string,
  timeZone?: string,
): FlightCardView {
  const found = lookupAircraft(state, hex);
  if (found.status === 'unknown') {
    return { status: 'unknown', hex };
  }
  const { aircraft } = found;

  return {
    status: found.status,
    hex: normalizeHex(hex),
    label: aircraft.label,
    subtitle: aircraftSubtitle(aircraft),
    aircraftType: aircraftTypeName(aircraft.typeCode),
    altitude: formatAltitude(aircraft),
    speed: formatSpeed(aircraft.groundSpeedKt),
    heading: formatHeading(aircraft.trackDeg),
    route:
      aircraft.callsign === null
        ? null
        : routeText(state.routes, aircraft.callsign),
    lastSeen:
      found.status === 'out-of-range'
        ? formatClock(found.lastSeenAt, timeZone)
        : null,
    selected: state.selectedHex === aircraft.hex,
  };
}

/**
 * One row of an ArrivalsBoard. Figures are bare ("4,200", "12", "9"); the
 * column headers carry the units.
 */
export interface ArrivalsRow {
  readonly hex: string;
  readonly status: 'live' | 'out-of-range' | 'unknown';
  readonly label: string;
  readonly aircraftType: string;
  /** Feet, "GND" on the ground, or "n/a". */
  readonly altitude: string;
  /** Nautical miles to the airport, or "n/a". */
  readonly distance: string;
  /** Minutes to the airport, or "n/a". */
  readonly eta: string;
  /** True when the plane is on the map, so picking the row can show it. */
  readonly selectable: boolean;
  /** True when this is the plane selected on the map. */
  readonly selected: boolean;
}

/** Feet without the unit, "GND" on the ground, or "n/a". */
function altitudeFigure(
  aircraft: Pick<Aircraft, 'altitudeFt' | 'onGround'>,
): string {
  if (aircraft.onGround) {
    return 'GND';
  }

  return aircraft.altitudeFt === null
    ? 'n/a'
    : aircraft.altitudeFt.toLocaleString('en-US');
}

/** Builds ArrivalsBoard rows, in the order the model gave them. */
export function arrivalsRows(
  state: AtcState,
  airport: string,
  hexes: readonly string[],
): ArrivalsRow[] {
  const centre = airportByCode(state, airport);

  return hexes.map((hex) => {
    const found = lookupAircraft(state, hex);
    if (found.status === 'unknown') {
      return {
        hex,
        status: 'unknown',
        label: 'n/a',
        aircraftType: 'Unknown aircraft',
        altitude: 'n/a',
        distance: 'n/a',
        eta: 'n/a',
        selectable: false,
        selected: false,
      };
    }
    const { aircraft } = found;
    const live = found.status === 'live';
    const distance = centre === null ? null : distanceNm(aircraft, centre);
    const eta =
      distance === null ? null : etaMinutes(distance, aircraft.groundSpeedKt);

    return {
      hex: aircraft.hex,
      status: found.status,
      label: aircraft.label,
      aircraftType: aircraftTypeName(aircraft.typeCode),
      altitude: altitudeFigure(aircraft),
      distance:
        live && distance !== null ? String(Math.round(distance)) : 'n/a',
      eta: live && eta !== null ? String(eta) : 'n/a',
      selectable: live,
      selected: state.selectedHex === aircraft.hex,
    };
  });
}

/**
 * True when at least one live aircraft on the board is approaching its
 * airport. A board of nearby traffic hides its ETA column otherwise.
 */
export function boardShowsEta(
  state: AtcState,
  airport: string,
  hexes: readonly string[],
): boolean {
  const centre = airportByCode(state, airport);
  if (centre === null) {
    return false;
  }

  return hexes.some((hex) => {
    const aircraft = state.aircraft.get(normalizeHex(hex));

    return aircraft !== undefined && isApproaching(aircraft, centre);
  });
}

/** What the feed badge shows. */
export interface FeedBadgeView {
  /** The state word: "Live", "Data delayed" or "Connecting…". */
  readonly label: string;
  /** The aircraft count such as "312 aircraft", only while live. */
  readonly count: string | null;
  /** True when the feed is live; the chip's dot is solid then, else hollow. */
  readonly live: boolean;
}

const OTHER_BADGES: Record<Exclude<FeedStatus, 'live'>, string> = {
  connecting: 'Connecting…',
  delayed: 'Data delayed',
  stalled: 'Data delayed',
};

/** The badge for a feed status: "Live" with a "312 aircraft" count, say. */
export function feedBadgeView(
  status: FeedStatus,
  aircraftCount: number,
): FeedBadgeView {
  return status === 'live'
    ? {
        label: 'Live',
        count: `${aircraftCount.toLocaleString('en-US')} aircraft`,
        live: true,
      }
    : { label: OTHER_BADGES[status], count: null, live: false };
}

/** A user message's text, or an empty string for non-text content. */
export function messageText(content: unknown): string {
  return typeof content === 'string' ? content : '';
}

/** What an AirportCard shows. */
export type AirportCardView =
  | { readonly status: 'unknown'; readonly code: string }
  | {
      readonly status: 'ready';
      readonly code: string;
      /** Such as "ROBERTS FLD/REDMOND MUNI (RDM)". */
      readonly title: string;
      /** Null when only the fallback table is loaded. */
      readonly badge: 'Towered' | 'Non-towered' | null;
      readonly towered: boolean | null;
      readonly frequencies: readonly {
        readonly label: string;
        readonly value: string;
      }[];
      /** Such as "3,082 ft". */
      readonly elevation: string | null;
      /** Such as "05/23 · 7,038 × 150 ft · asphalt". */
      readonly runways: readonly string[];
    };

const SURFACE_WORDS: Readonly<Record<string, string>> = {
  ASPH: 'asphalt',
  CONC: 'concrete',
  TURF: 'turf',
  GRVL: 'gravel',
  DIRT: 'dirt',
  WATER: 'water',
};

/** Builds the AirportCard view for an ICAO or FAA code. */
export function airportCardView(
  state: AtcState,
  code: string,
): AirportCardView {
  const airport = airportByCode(state, code);
  if (airport === null) {
    return { status: 'unknown', code };
  }
  const chart = chartAirportByCode(state, airport.code);
  if (chart === null) {
    return {
      status: 'ready',
      code: airport.code,
      title: `${airport.name} (${airport.faa})`,
      badge: null,
      towered: null,
      frequencies: [],
      elevation: null,
      runways: [],
    };
  }
  const { frequencies: f, weather } = chart;
  const entries: readonly (readonly [string, string | null])[] = [
    [
      'Tower',
      f.tower === null ? null : `${f.tower}${chart.towerPartTime ? '★' : ''}`,
    ],
    ['ATIS', f.atis],
    ['CTAF', f.ctaf],
    ['UNICOM', f.unicom],
    [weather?.kind ?? '', weather?.frequency ?? null],
  ];

  return {
    status: 'ready',
    code: chart.code,
    title: `${chart.name} (${chart.faa})`,
    badge: chart.towered ? 'Towered' : 'Non-towered',
    towered: chart.towered,
    frequencies: entries.flatMap(([label, value]) =>
      value === null ? [] : [{ label, value }],
    ),
    elevation: `${chart.elevationFt.toLocaleString('en-US')} ft`,
    runways: chart.runways.map((r) => {
      const surface =
        r.surface === null
          ? null
          : (SURFACE_WORDS[r.surface] ?? r.surface.toLowerCase());
      const size = `${r.lengthFt.toLocaleString('en-US')} × ${r.widthFt.toLocaleString('en-US')} ft`;

      return [r.id, size, ...(surface === null ? [] : [surface])].join(' · ');
    }),
  };
}
