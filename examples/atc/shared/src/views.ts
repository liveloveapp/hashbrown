import {
  formatAltitude,
  formatClock,
  formatHeading,
  formatSpeed,
} from './format';
import { distanceNm, etaMinutes } from './geo';
import { aircraftTypeName, airlineName } from './names';
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
      readonly callsign: string;
      readonly airline: string;
      readonly aircraftType: string;
      readonly altitude: string;
      readonly speed: string;
      readonly heading: string;
      readonly route: string | null;
      readonly lastSeen: string | null;
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
    callsign: aircraft.callsign,
    airline: airlineName(aircraft.callsign),
    aircraftType: aircraftTypeName(aircraft.typeCode),
    altitude: formatAltitude(aircraft),
    speed: formatSpeed(aircraft.groundSpeedKt),
    heading: formatHeading(aircraft.trackDeg),
    route: routeText(state.routes, aircraft.callsign),
    lastSeen:
      found.status === 'out-of-range'
        ? formatClock(found.lastSeenAt, timeZone)
        : null,
  };
}

/** One row of an ArrivalsBoard. */
export interface ArrivalsRow {
  readonly hex: string;
  readonly status: 'live' | 'out-of-range' | 'unknown';
  readonly callsign: string;
  readonly aircraftType: string;
  readonly altitude: string;
  readonly distance: string;
  readonly eta: string;
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
        callsign: '—',
        aircraftType: 'Unknown aircraft',
        altitude: '—',
        distance: '—',
        eta: '—',
      };
    }
    const { aircraft } = found;
    const live = found.status === 'live';
    const distance = distanceNm(aircraft, AIRPORTS[airport]);
    const eta = etaMinutes(distance, aircraft.groundSpeedKt);

    return {
      hex: aircraft.hex,
      status: found.status,
      callsign: aircraft.callsign,
      aircraftType: aircraftTypeName(aircraft.typeCode),
      altitude: formatAltitude(aircraft),
      distance: live ? `${Math.round(distance)} nm` : '—',
      eta: live ? (eta === null ? '—' : `${eta} min`) : 'Out of range',
    };
  });
}

/** What the feed badge shows. */
export interface FeedBadgeView {
  readonly label: string;
  readonly offerReplay: boolean;
}

const BADGES: Record<FeedStatus, FeedBadgeView> = {
  connecting: { label: 'Connecting…', offerReplay: false },
  live: { label: 'Live · adsb.lol', offerReplay: false },
  delayed: { label: 'Data delayed', offerReplay: false },
  stalled: { label: 'Data delayed', offerReplay: true },
  replay: { label: 'Replay · recorded traffic', offerReplay: false },
};

/** The badge for a feed status. */
export function feedBadgeView(status: FeedStatus): FeedBadgeView {
  return BADGES[status];
}

/** A user message's text, or an empty string for non-text content. */
export function messageText(content: unknown): string {
  return typeof content === 'string' ? content : '';
}
