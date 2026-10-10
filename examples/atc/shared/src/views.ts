import {
  formatAltitude,
  formatClock,
  formatHeading,
  formatSpeed,
} from './format';
import type { Aircraft } from './aircraft';
import { distanceNm, etaMinutes, isApproaching } from './geo';
import { aircraftTypeName, airlineFor } from './names';
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
 * The line beside an aircraft's label: its airline for airline callsigns,
 * else its registration when the label is not already it, else null.
 */
export function aircraftSubtitle(aircraft: Aircraft): string | null {
  const airline = airlineFor(aircraft.callsign);
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
  };
}

/** One row of an ArrivalsBoard. */
export interface ArrivalsRow {
  readonly hex: string;
  readonly status: 'live' | 'out-of-range' | 'unknown';
  readonly label: string;
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
        label: 'n/a',
        aircraftType: 'Unknown aircraft',
        altitude: 'n/a',
        distance: 'n/a',
        eta: 'n/a',
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
      altitude: formatAltitude(aircraft),
      distance: live ? `${Math.round(distance)} nm` : 'n/a',
      eta: live ? (eta === null ? 'n/a' : `${eta} min`) : 'Out of range',
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

/** What the feed badge shows. */
export interface FeedBadgeView {
  /** The state word: "Live", "Data delayed" or "Connecting…". */
  readonly label: string;
  /** The aircraft count such as "312 aircraft", only while live. */
  readonly count: string | null;
  /** True when the feed is live; the chip then shows a dot. */
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

const MAX_ARG = 24;

function record(args: unknown): Record<string, unknown> {
  return typeof args === 'object' && args !== null
    ? (args as Record<string, unknown>)
    : {};
}

function shortText(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text === '') return null;

  return text.length > MAX_ARG ? `${text.slice(0, MAX_ARG - 1)}…` : text;
}

function feet(value: unknown, prefix: string): string | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${prefix} ${Math.round(value).toLocaleString('en-US')} ft`
    : null;
}

/** "25 nm" for a finite number, else null. */
function miles(value: unknown): string | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${Math.round(value)} nm`
    : null;
}

/** "within 25 nm of KBDN", or "near KBDN" while the radius streams. */
function nearSummary(value: unknown): string | null {
  const near = record(value);
  const airport = shortText(near['airport'])?.toUpperCase() ?? null;
  const radius = miles(near['radiusNm']);
  if (airport === null) return null;

  return radius === null ? `near ${airport}` : `within ${radius} of ${airport}`;
}

function areaSummary(args: Record<string, unknown>): string | null {
  const airport = shortText(args['airport'])?.toUpperCase() ?? null;
  const radius = miles(args['radiusNm']);
  if (airport === null) return null;

  return radius === null ? airport : `${airport}, ${radius}`;
}

function findSummary(args: Record<string, unknown>): string | null {
  const approaching = shortText(args['approaching']);
  const filters = [
    shortText(args['airline']),
    shortText(args['typeCode']),
    shortText(args['kind']),
    feet(args['minAltitudeFt'], 'above'),
    feet(args['maxAltitudeFt'], 'below'),
    approaching === null ? null : `approaching ${approaching}`,
    nearSummary(args['near']),
  ].filter((part): part is string => part !== null);
  if (filters.length > 0) return filters.join(', ');
  const sortBy = shortText(args['sortBy']);

  return sortBy === null ? null : `sorted by ${sortBy}`;
}

const SUMMARIES: Record<
  string,
  (args: Record<string, unknown>) => string | null
> = {
  findAircraft: findSummary,
  lookupRoute: (args) => shortText(args['callsign'])?.toUpperCase() ?? null,
  highlightAircraft: (args) =>
    Array.isArray(args['hexes']) ? `${args['hexes'].length} aircraft` : null,
  followAircraft: (args) => shortText(args['hex'])?.toLowerCase() ?? null,
  lookupPlace: (args) => shortText(args['query']),
  showArea: areaSummary,
};

/**
 * A short label for a tool call, such as `findAircraft · approaching KSEA`.
 * Arguments may be partial while they stream, so anything unexpected falls
 * back to the tool name.
 */
export function toolCallLabel(name: string, args: unknown): string {
  const summary = SUMMARIES[name]?.(record(args)) ?? null;

  return summary === null ? name : `${name} · ${summary}`;
}

/** The parts of a Hashbrown tool call that the tool chip reads. */
export interface ToolCallLike {
  readonly name: string;
  readonly args: unknown;
  readonly status: 'pending' | 'done';
  readonly result?: { readonly status: 'fulfilled' | 'rejected' };
}

/** What a tool chip shows. Only `running` animates. */
export interface ToolChipView {
  readonly label: string;
  readonly state: 'running' | 'done' | 'failed' | 'stopped';
}

/**
 * The chip for one tool call. A pending call only spins while the chat is
 * busy, so a run that errors or stops never leaves a chip spinning.
 */
export function toolChipView(call: ToolCallLike, busy: boolean): ToolChipView {
  const label = toolCallLabel(call.name, call.args);
  if (call.status === 'pending') {
    return { label, state: busy ? 'running' : 'stopped' };
  }

  return {
    label,
    state: call.result?.status === 'rejected' ? 'failed' : 'done',
  };
}

/** A user message's text, or an empty string for non-text content. */
export function messageText(content: unknown): string {
  return typeof content === 'string' ? content : '';
}
