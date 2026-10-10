import type { Aircraft, Emergency } from './aircraft';
import { formatAltitude, formatHeading, formatSpeed } from './format';
import type { AircraftKind } from './kinds';
import { aircraftTypeName } from './names';
import { type AtcState, normalizeHex } from './store';
import { aircraftSubtitle, routeText } from './views';

/** One label and value in the detail card, such as "Ground speed", "240 kt". */
export interface DetailRow {
  readonly label: string;
  readonly value: string;
  /** True for long values that take a whole line of the card's grid. */
  readonly wide?: true;
  /** True for words rather than figures or codes; shown in the text face. */
  readonly text?: true;
}

/**
 * The glance the card leads with: the readable type, the scheduled route
 * when looked up, and altitude, speed and heading when known.
 */
export interface DetailSummary {
  readonly type: string | null;
  readonly route: string | null;
  readonly figures: readonly DetailRow[];
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
  readonly summary: DetailSummary;
  /** Every other reading, in titled groups. */
  readonly groups: readonly DetailGroup[];
  /** How many rows {@link trimDetailView} left out to fit the map. */
  readonly hiddenRows: number;
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

/** How a row is laid out: a whole line, and in the text face. */
interface RowStyle {
  readonly wide?: true;
  readonly text?: true;
}

/** A row, or nothing when the value is missing. */
function row<T>(
  label: string,
  value: T | null | undefined,
  format: (value: T) => string,
  style: RowStyle = {},
): DetailRow[] {
  if (value === null || value === undefined) {
    return [];
  }

  return [{ label, value: format(value), ...style }];
}

const text = (value: string) => value;

/** The readable type name, else adsb.lol's description, else null. */
function readableType(aircraft: Aircraft): string | null {
  const { typeCode, description } = aircraft;
  const typeName = aircraftTypeName(typeCode);

  return typeCode !== null && typeName !== typeCode
    ? typeName
    : (description ?? null);
}

function summary(state: AtcState, aircraft: Aircraft): DetailSummary {
  return {
    type: readableType(aircraft),
    route:
      aircraft.callsign === null
        ? null
        : routeText(state.routes, aircraft.callsign),
    figures: [
      ...row(
        'Altitude',
        aircraft.onGround || aircraft.altitudeFt !== null ? aircraft : null,
        formatAltitude,
      ),
      ...row('Speed', aircraft.groundSpeedKt, formatSpeed),
      ...row('Heading', aircraft.trackDeg, formatHeading),
    ],
  };
}

function identityRows(aircraft: Aircraft): DetailRow[] {
  const { typeCode, emergency, category } = aircraft;

  return [
    ...row(
      'Emergency',
      emergency === 'none' ? null : emergency,
      (state) => EMERGENCY_NAMES[state],
      { wide: true, text: true },
    ),
    ...row('Registration', aircraft.registration, text),
    ...row('ICAO type', typeCode, text),
    ...row('Kind', aircraft.kind, (kind) => KIND_NAMES[kind], { text: true }),
    ...row('Model year', aircraft.year, text),
    ...row('Callsign', aircraft.callsign, text),
    ...row('Squawk', aircraft.squawk, text),
    ...row(
      'Category',
      category,
      (code) =>
        CATEGORY_NAMES[code] ? `${code}, ${CATEGORY_NAMES[code]}` : code,
      { text: true },
    ),
    { label: 'Hex', value: aircraft.hex.toUpperCase() },
  ];
}

function altitudeRows(aircraft: Aircraft): DetailRow[] {
  return [
    ...row('Geometric altitude', aircraft.geometricAltitudeFt, ft),
    ...row('Selected altitude', aircraft.selectedAltitudeFt, ft),
    ...row('Vertical rate', aircraft.verticalRateFpm, fpm),
    ...row('QNH', aircraft.qnhHpa, (hpa) => `${hpa.toFixed(1)} hPa`),
    ...row(
      'Altimeter',
      aircraft.qnhHpa,
      (hpa) => `${(hpa * INHG_PER_HPA).toFixed(2)} inHg`,
    ),
  ];
}

function speedRows(aircraft: Aircraft): DetailRow[] {
  const { windDirectionDeg, windSpeedKt } = aircraft;
  const wind =
    windDirectionDeg === undefined || windSpeedKt === undefined
      ? null
      : `${formatHeading(windDirectionDeg)} at ${Math.round(windSpeedKt)} kt`;

  return [
    ...row('Indicated airspeed', aircraft.indicatedAirspeedKt, formatSpeed),
    ...row('True airspeed', aircraft.trueAirspeedKt, formatSpeed),
    ...row('Mach', aircraft.mach, (mach) => mach.toFixed(3)),
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

function positionRows(
  state: AtcState,
  aircraft: Aircraft,
  now: number | undefined,
): DetailRow[] {
  const sinceSnapshot =
    now === undefined || state.updatedAt === null
      ? 0
      : Math.max(0, (now - state.updatedAt) / 1000);

  return [
    {
      label: 'Position',
      value: `${aircraft.lat.toFixed(4)}, ${aircraft.lon.toFixed(4)}`,
      wide: true,
    },
    ...row(
      'Last message',
      aircraft.seenS,
      (s) => `${Math.round(s + sinceSnapshot)}s ago`,
    ),
  ];
}

/**
 * Builds the map's detail card for a live aircraft: a summary (type, route,
 * altitude, speed and heading), then identity, altitude, speed and direction,
 * and position groups, each row formatted with its unit.
 * Missing values leave their row out rather than showing a placeholder. With
 * `now` (epoch ms), the last message age counts up from the snapshot time.
 * Returns null when the aircraft is not live.
 */
export function aircraftDetailView(
  state: AtcState,
  hex: string,
  now?: number,
): AircraftDetailView | null {
  const aircraft = state.aircraft.get(normalizeHex(hex));
  if (!aircraft) {
    return null;
  }
  const groups: DetailGroup[] = [
    { title: 'Identity', rows: identityRows(aircraft) },
    { title: 'Altitude', rows: altitudeRows(aircraft) },
    { title: 'Speed and direction', rows: speedRows(aircraft) },
    { title: 'Position', rows: positionRows(state, aircraft, now) },
  ];

  return {
    hex: aircraft.hex,
    label: aircraft.label,
    subtitle: aircraftSubtitle(aircraft),
    summary: summary(state, aircraft),
    groups: groups.filter((group) => group.rows.length > 0),
    hiddenRows: 0,
  };
}

/**
 * What each trim level removes from the speed group, least important first:
 * weather, then speed details, then the extra headings, which empties the
 * group. The summary, identity, altitude and position always stay.
 */
const TRIM_STEPS: readonly ((label: string) => boolean)[] = [
  (label) => label === 'Wind' || label === 'Outside air',
  (label) => ['Indicated airspeed', 'True airspeed', 'Mach'].includes(label),
  (label) => label === 'Magnetic heading' || label === 'Selected heading',
];

/** How many trim levels {@link trimDetailView} has beyond the full view. */
export const DETAIL_TRIM_LEVELS = TRIM_STEPS.length;

/**
 * The view with the first `level` trim steps applied to its speed and
 * direction group, counting the rows removed in `hiddenRows`.
 */
export function trimDetailView(
  view: AircraftDetailView,
  level: number,
): AircraftDetailView {
  const steps = TRIM_STEPS.slice(0, level);
  const drop = (label: string) => steps.some((step) => step(label));
  let hiddenRows = view.hiddenRows;
  const groups = view.groups.flatMap((group) => {
    if (group.title !== 'Speed and direction') {
      return [group];
    }
    const rows = group.rows.filter((r) => !drop(r.label));
    hiddenRows += group.rows.length - rows.length;

    return rows.length > 0 ? [{ ...group, rows }] : [];
  });

  return { ...view, groups, hiddenRows };
}

/**
 * The fullest trim of `view` whose `measure`d height fits `maxHeight`, or
 * null when even the smallest does not, so the card is never cut off.
 */
export function fitDetailView(
  view: AircraftDetailView,
  maxHeight: number,
  measure: (view: AircraftDetailView) => number,
): AircraftDetailView | null {
  for (let level = 0; level <= DETAIL_TRIM_LEVELS; level++) {
    const trimmed = trimDetailView(view, level);
    if (measure(trimmed) <= maxHeight) {
      return trimmed;
    }
  }

  return null;
}
