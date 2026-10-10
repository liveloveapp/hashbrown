import {
  formatAltitude,
  formatClock,
  formatHeading,
  formatSpeed,
} from './format';
import type { Aircraft, Emergency } from './aircraft';
import type { AircraftKind } from './kinds';
import { distanceNm, etaMinutes } from './geo';
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

function subtitle(aircraft: Aircraft): string | null {
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
    subtitle: subtitle(aircraft),
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

/** One label and value in the detail card, such as "Ground speed", "240 kt". */
export interface DetailRow {
  readonly label: string;
  readonly value: string;
}

/** A titled group of detail rows; groups with no rows are left out. */
export interface DetailGroup {
  readonly title: string;
  readonly rows: readonly DetailRow[];
}

/** What the map's floating detail card shows for one live aircraft. */
export interface AircraftDetailView {
  readonly hex: string;
  readonly label: string;
  /** The airline, or the registration when the label is not already it. */
  readonly subtitle: string | null;
  readonly groups: readonly DetailGroup[];
}

const KIND_NAMES: Record<AircraftKind, string> = {
  jet: 'Jet',
  twin: 'Twin-engine prop',
  single: 'Single-engine prop',
  rotor: 'Helicopter',
};

const EMERGENCY_NAMES: Record<Exclude<Emergency, 'none'>, string> = {
  general: 'General emergency',
  lifeguard: 'Lifeguard (medical)',
  minfuel: 'Minimum fuel',
  nordo: 'No radio',
  unlawful: 'Unlawful interference',
  downed: 'Downed aircraft',
  reserved: 'Reserved',
};

/** What each ADS-B emitter category means. */
const CATEGORY_NAMES: Readonly<Record<string, string>> = {
  A1: 'light',
  A2: 'small',
  A3: 'large',
  A4: 'high vortex large',
  A5: 'heavy',
  A6: 'high performance',
  A7: 'rotorcraft',
  B1: 'glider',
  B2: 'lighter than air',
  B3: 'parachutist',
  B4: 'ultralight',
  B6: 'drone',
  B7: 'space vehicle',
  C1: 'emergency vehicle',
  C2: 'service vehicle',
  C3: 'obstacle',
};

/** Inches of mercury per hectopascal. */
const INHG_PER_HPA = 0.02953;

function ft(value: number): string {
  return `${Math.round(value).toLocaleString('en-US')} ft`;
}

function fpm(value: number): string {
  const rounded = Math.round(value);

  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString('en-US')} fpm`;
}

/** A row, or nothing when the value is missing. */
function row<T>(
  label: string,
  value: T | null | undefined,
  format: (value: T) => string,
): DetailRow[] {
  return value === null || value === undefined
    ? []
    : [{ label, value: format(value) }];
}

const text = (value: string) => value;

function identityRows(aircraft: Aircraft): DetailRow[] {
  const { typeCode, description, emergency, category } = aircraft;
  const typeName = aircraftTypeName(typeCode);
  const readable =
    typeCode !== null && typeName !== typeCode
      ? typeName
      : (description ?? null);

  return [
    ...row('Registration', aircraft.registration, text),
    ...row('Type', readable, text),
    ...row('ICAO type', typeCode, text),
    ...row('Kind', aircraft.kind, (kind) => KIND_NAMES[kind]),
    ...row('Model year', aircraft.year, text),
    ...row('Callsign', aircraft.callsign, text),
    ...row('Squawk', aircraft.squawk, text),
    ...row(
      'Emergency',
      emergency === 'none' ? null : emergency,
      (state) => EMERGENCY_NAMES[state],
    ),
    ...row('Category', category, (code) =>
      CATEGORY_NAMES[code] ? `${code}, ${CATEGORY_NAMES[code]}` : code,
    ),
    { label: 'Hex', value: aircraft.hex.toUpperCase() },
  ];
}

function altitudeRows(aircraft: Aircraft): DetailRow[] {
  return [
    ...row(
      'Pressure altitude',
      aircraft.onGround ? 'On ground' : aircraft.altitudeFt,
      (value) => (typeof value === 'string' ? value : ft(value)),
    ),
    ...row('Geometric altitude', aircraft.geometricAltitudeFt, ft),
    ...row('Selected altitude', aircraft.selectedAltitudeFt, ft),
    ...row(
      'Altimeter',
      aircraft.qnhHpa,
      (hpa) => `${hpa.toFixed(1)} hPa, ${(hpa * INHG_PER_HPA).toFixed(2)} inHg`,
    ),
    ...row('Vertical rate', aircraft.verticalRateFpm, fpm),
  ];
}

function speedRows(aircraft: Aircraft): DetailRow[] {
  const { windDirectionDeg, windSpeedKt } = aircraft;
  const wind =
    windDirectionDeg === undefined || windSpeedKt === undefined
      ? null
      : `${formatHeading(windDirectionDeg)} at ${Math.round(windSpeedKt)} kt`;

  return [
    ...row('Ground speed', aircraft.groundSpeedKt, formatSpeed),
    ...row('Indicated airspeed', aircraft.indicatedAirspeedKt, formatSpeed),
    ...row('True airspeed', aircraft.trueAirspeedKt, formatSpeed),
    ...row('Mach', aircraft.mach, (mach) => mach.toFixed(3)),
    ...row('Track', aircraft.trackDeg, formatHeading),
    ...row('Magnetic heading', aircraft.magneticHeadingDeg, formatHeading),
    ...row('Selected heading', aircraft.selectedHeadingDeg, formatHeading),
    ...row('Wind', wind, text),
    ...row(
      'Outside air',
      aircraft.outsideAirTempC,
      (c) => `${Math.round(c)} °C`,
    ),
  ];
}

function positionRows(state: AtcState, aircraft: Aircraft): DetailRow[] {
  return [
    {
      label: 'Position',
      value: `${aircraft.lat.toFixed(4)}, ${aircraft.lon.toFixed(4)}`,
    },
    ...row('Last message', aircraft.seenS, (s) => `${Math.round(s)}s ago`),
    ...row(
      'Route',
      aircraft.callsign === null
        ? null
        : routeText(state.routes, aircraft.callsign),
      text,
    ),
  ];
}

/**
 * Builds the map's detail card for a live aircraft: identity, altitude, speed
 * and direction, and position groups, each row formatted with its unit.
 * Missing values leave their row out rather than showing a placeholder.
 * Returns null when the aircraft is not live.
 */
export function aircraftDetailView(
  state: AtcState,
  hex: string,
): AircraftDetailView | null {
  const aircraft = state.aircraft.get(normalizeHex(hex));
  if (!aircraft) {
    return null;
  }
  const groups: DetailGroup[] = [
    { title: 'Identity', rows: identityRows(aircraft) },
    { title: 'Altitude', rows: altitudeRows(aircraft) },
    { title: 'Speed and direction', rows: speedRows(aircraft) },
    { title: 'Position', rows: positionRows(state, aircraft) },
  ];

  return {
    hex: aircraft.hex,
    label: aircraft.label,
    subtitle: subtitle(aircraft),
    groups: groups.filter((group) => group.rows.length > 0),
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

function findSummary(args: Record<string, unknown>): string | null {
  const approaching = shortText(args['approaching']);
  const filters = [
    shortText(args['airline']),
    shortText(args['typeCode']),
    shortText(args['kind']),
    feet(args['minAltitudeFt'], 'above'),
    feet(args['maxAltitudeFt'], 'below'),
    approaching === null ? null : `approaching ${approaching}`,
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
};

/**
 * A short label for a tool call, such as `findAircraft · approaching SEA`.
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
