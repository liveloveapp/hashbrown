import {
  formatAltitude,
  formatClock,
  formatHeading,
  formatSpeed,
} from './format';
import type { Aircraft } from './aircraft';
import { distanceNm, etaMinutes, isApproaching } from './geo';
import { aircraftTypeName, knownAirlineFor } from './names';
import { type AirportCode, AIRPORTS } from './places';
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
  airport: AirportCode,
  hexes: readonly string[],
): ArrivalsRow[] {
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
    const distance = distanceNm(aircraft, AIRPORTS[airport]);
    const eta = etaMinutes(distance, aircraft.groundSpeedKt);

    return {
      hex: aircraft.hex,
      status: found.status,
      label: aircraft.label,
      aircraftType: aircraftTypeName(aircraft.typeCode),
      altitude: altitudeFigure(aircraft),
      distance: live ? String(Math.round(distance)) : 'n/a',
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
  airport: AirportCode,
  hexes: readonly string[],
): boolean {
  return hexes.some((hex) => {
    const aircraft = state.aircraft.get(normalizeHex(hex));

    return aircraft !== undefined && isApproaching(aircraft, AIRPORTS[airport]);
  });
}

/**
 * The quiet notice for a feed that is not live: "Connecting to live
 * traffic…" before the first snapshot, "Traffic data delayed" when snapshots
 * are late or stale. Null while live, when the map says enough.
 */
export function feedNotice(status: FeedStatus): string | null {
  switch (status) {
    case 'live':
      return null;
    case 'connecting':
      return 'Connecting to live traffic…';
    default:
      return 'Traffic data delayed';
  }
}

/** A user message's text, or an empty string for non-text content. */
export function messageText(content: unknown): string {
  return typeof content === 'string' ? content : '';
}
