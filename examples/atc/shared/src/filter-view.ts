import { airportDirectory } from './directory';
import { areaRadiusNm, type MapFilter } from './find-aircraft';
import { isRecord } from './json';
import { type AircraftKind, KINDS } from './kinds';
import { lookupPlace } from './places';
import type { AtcState } from './store';

// The view model of the natural-language map filter: parsing the partial
// output of a streaming structured completion, and the chips and summary that
// describe a filter. Pure and framework-free.

/** One field of a {@link MapFilter}. */
type FilterKey = keyof MapFilter;

/** The fields in the order chips and summaries read them. */
const FILTER_KEYS: readonly FilterKey[] = [
  'airline',
  'typeCode',
  'kind',
  'minAltitudeFt',
  'maxAltitudeFt',
  'approaching',
  'near',
  'inAirspace',
];

const AIRSPACE_CLASSES: readonly string[] = ['B', 'C', 'D', 'E'];

/** A chip describing one clause of the filter. */
export interface FilterChip {
  /** The filter field the chip describes. */
  readonly key: string;
  readonly label: string;
  /**
   * `set` is a complete clause, `streaming` is still arriving, `unknown` is a
   * complete clause naming a place the directory does not know.
   */
  readonly state: 'set' | 'streaming' | 'unknown';
}

/** What {@link parseStreamedFilter} found in a partial value. */
export interface ParsedFilter {
  /**
   * The filter with every missing, incomplete or malformed field set to null,
   * so it is always safe to pass to `resolveFilter` or `setMapFilter`.
   */
  readonly filter: MapFilter;
  /** The fields that are present and fully formed (an explicit null counts). */
  readonly complete: ReadonlySet<keyof MapFilter>;
  /**
   * The raw values of fields that are present but not complete, for showing
   * as streaming chips. Never resolve these.
   */
  readonly pending: Readonly<Partial<Record<keyof MapFilter, unknown>>>;
}

const EMPTY_FILTER: MapFilter = {
  airline: null,
  typeCode: null,
  kind: null,
  minAltitudeFt: null,
  maxAltitudeFt: null,
  approaching: null,
  near: null,
  inAirspace: null,
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** True for a string with something in it, the only usable place code. */
function isPlaceCode(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isKind(value: unknown): value is AircraftKind {
  return (
    typeof value === 'string' && (KINDS as readonly string[]).includes(value)
  );
}

/**
 * Returns the fully formed value for `key`, or `undefined` when `value` is
 * malformed or incomplete. Null is a fully formed "any".
 */
function formed(key: FilterKey, value: unknown): unknown {
  if (value === null) {
    return null;
  }
  switch (key) {
    case 'airline':
    case 'typeCode':
    case 'approaching':
      return typeof value === 'string' &&
        (key !== 'approaching' || value.trim() !== '')
        ? value
        : undefined;
    case 'kind':
      return isKind(value) ? value : undefined;
    case 'minAltitudeFt':
    case 'maxAltitudeFt':
      return isFiniteNumber(value) ? value : undefined;
    case 'near':
      return isRecord(value) &&
        isPlaceCode(value['airport']) &&
        isFiniteNumber(value['radiusNm'])
        ? { airport: value['airport'], radiusNm: value['radiusNm'] }
        : undefined;
    case 'inAirspace': {
      if (!isRecord(value) || !isPlaceCode(value['airport'])) {
        return undefined;
      }
      const cls = value['class'];
      if (cls === null || cls === undefined) {
        return { airport: value['airport'], class: null };
      }

      return typeof cls === 'string' && AIRSPACE_CLASSES.includes(cls)
        ? { airport: value['airport'], class: cls }
        : undefined;
    }
  }
}

/**
 * Turns the partial output of `useStructuredCompletion` (a stream of
 * {@link mapFilterSchema} values) into a safe {@link MapFilter}.
 *
 * Completeness rule, derived from Skillet's streaming parser: the schema is a
 * `s.streaming.object` whose children are `anyOf` of non-streaming leaves
 * (`s.string`, `s.number`, `s.enumeration`, non-streaming `s.object`) and
 * `nullish`. The parser resolves a non-streaming leaf only once its JSON node
 * is complete, and a non-streaming object only once every required child
 * matches, so a key appears in the partial only when its value is whole. A
 * missing key is therefore "not decided yet". This function does not rely on
 * that alone: a field is `complete` when it is present and fully formed (the
 * right type, a known enum member, and for objects every required member), or
 * an explicit null. Anything else that is present is `pending` (raw, for a
 * streaming chip) and null in `filter`. Missing keys are neither.
 *
 * @param partial - The latest partial value; anything is tolerated.
 */
export function parseStreamedFilter(partial: unknown): ParsedFilter {
  const source = isRecord(partial) ? partial : {};
  const filter: Record<string, unknown> = { ...EMPTY_FILTER };
  const complete = new Set<FilterKey>();
  const pending: Partial<Record<FilterKey, unknown>> = {};
  for (const key of FILTER_KEYS) {
    if (!Object.hasOwn(source, key) || source[key] === undefined) {
      continue;
    }
    const value = formed(key, source[key]);
    if (value === undefined) {
      pending[key] = source[key];
    } else {
      filter[key] = value;
      complete.add(key);
    }
  }

  return { filter: filter as unknown as MapFilter, complete, pending };
}

/** Text trimmed and upper-cased for display as a code, or null when empty. */
function codeText(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : '';

  return text === '' ? null : text;
}

/** Free text trimmed, or null when empty. */
function plainText(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';

  return text === '' ? null : text;
}

/** "10,000 ft" for a finite number, else null. Fixed locale. */
function feet(value: unknown): string | null {
  return isFiniteNumber(value)
    ? `${Math.round(value).toLocaleString('en-US')} ft`
    : null;
}

const KIND_PLURALS: Readonly<Record<AircraftKind, string>> = {
  jet: 'Jets',
  twin: 'Twin-engine props',
  single: 'Single-engine props',
  rotor: 'Helicopters',
};

/** The sentence-case label of one field's value, or null when there is none. */
function labelOf(key: FilterKey, value: unknown): string | null {
  switch (key) {
    case 'airline': {
      const text = plainText(value);

      return text === null ? null : `Airline ${text}`;
    }
    case 'typeCode': {
      const text = codeText(value);

      return text === null ? null : `Type ${text}`;
    }
    case 'kind':
      return isKind(value) ? KIND_PLURALS[value] : plainText(value);
    case 'minAltitudeFt': {
      const text = feet(value);

      return text === null ? null : `Above ${text}`;
    }
    case 'maxAltitudeFt': {
      const text = feet(value);

      return text === null ? null : `Below ${text}`;
    }
    case 'approaching': {
      const code = codeText(value);

      return code === null ? null : `Approaching ${code}`;
    }
    case 'near': {
      const near = isRecord(value) ? value : {};
      const code = codeText(near['airport']);
      if (code === null) {
        return null;
      }
      const radius = near['radiusNm'];

      return isFiniteNumber(radius)
        ? `Within ${areaRadiusNm(radius)} nm of ${code}`
        : `Near ${code}`;
    }
    case 'inAirspace': {
      const airspace = isRecord(value) ? value : {};
      const code = codeText(airspace['airport']);
      if (code === null) {
        return null;
      }
      const cls = airspace['class'];

      return typeof cls === 'string' && cls !== ''
        ? `In ${code} Class ${cls.toUpperCase()} airspace`
        : `In ${code} airspace`;
    }
  }
}

/** The place code a field points at when it is complete, else null. */
function placeOf(key: FilterKey, value: unknown): string | null {
  if (key === 'approaching') {
    return typeof value === 'string' ? value : null;
  }
  if ((key === 'near' || key === 'inAirspace') && isRecord(value)) {
    const airport = value['airport'];

    return typeof airport === 'string' ? airport : null;
  }

  return null;
}

/**
 * The chips for `filter`, one per non-null clause, in reading order.
 *
 * Fields in `streaming` are still arriving: they are labelled from whatever
 * has arrived and are never looked up. Only complete place clauses are checked
 * against the airport directory, and become `unknown` when it lacks them.
 */
export function filterChips(
  state: AtcState,
  filter: MapFilter,
  streaming: ReadonlySet<keyof MapFilter>,
): FilterChip[] {
  const directory = airportDirectory(state);
  const chips: FilterChip[] = [];
  for (const key of FILTER_KEYS) {
    const value: unknown = filter[key];
    if (value === null || value === undefined) {
      continue;
    }
    const label = labelOf(key, value);
    if (label === null) {
      continue;
    }
    if (streaming.has(key)) {
      chips.push({ key, label, state: 'streaming' });
      continue;
    }
    const place = placeOf(key, value);
    const unknown = place !== null && lookupPlace(place, directory) === null;
    chips.push({ key, label, state: unknown ? 'unknown' : 'set' });
  }

  return chips;
}

const KIND_NOUNS: Readonly<Record<AircraftKind, string>> = {
  jet: 'jets',
  twin: 'twin-engine props',
  single: 'single-engine props',
  rotor: 'helicopters',
};

/**
 * A one-line plain-language summary such as "jets below 10,000 ft within 25
 * nm of KSEA", or an empty string for a filter that matches everything.
 */
export function filterSummary(filter: MapFilter): string {
  const clauses = (
    [
      'minAltitudeFt',
      'maxAltitudeFt',
      'approaching',
      'near',
      'inAirspace',
    ] as const
  )
    .map((key) => labelOf(key, filter[key]))
    .filter((label): label is string => label !== null)
    .map((label) => label.charAt(0).toLowerCase() + label.slice(1));
  const hasSubject =
    filter.airline != null || filter.typeCode != null || filter.kind != null;
  if (!hasSubject && clauses.length === 0) {
    return '';
  }
  const noun = isKind(filter.kind) ? KIND_NOUNS[filter.kind] : 'aircraft';
  const subject = [plainText(filter.airline), codeText(filter.typeCode), noun]
    .filter((part): part is string => part !== null)
    .join(' ');

  return [subject, ...clauses].join(' ');
}

/**
 * The chips for a parse result, with its pending (still arriving) fields
 * shown as streaming chips and its complete fields as set or unknown chips.
 * Use this instead of merging `filter` and `pending` by hand.
 */
export function streamingChips(
  state: AtcState,
  parsed: ParsedFilter,
): FilterChip[] {
  const streaming = new Set(Object.keys(parsed.pending) as FilterKey[]);
  const merged: Record<string, unknown> = {
    ...parsed.filter,
    ...parsed.pending,
  };

  return filterChips(state, merged as unknown as MapFilter, streaming);
}
