/**
 * Shapes of the committed dashboard and insight JSON files, validated by hand
 * so the tools need no schema library. `parse*` functions apply defaults and
 * throw one error listing every problem.
 */

/** Property filter operators the sync maps to PostHog. */
export const PROPERTY_OPERATORS = [
  'exact',
  'is_not',
  'icontains',
  'is_set',
  'is_not_set',
] as const;
/** One of {@link PROPERTY_OPERATORS}. */
export type PropertyOperator = (typeof PROPERTY_OPERATORS)[number];

/** Operators that test presence and so take no value. */
const VALUELESS_OPERATORS: ReadonlySet<string> = new Set([
  'is_set',
  'is_not_set',
]);

/** Series aggregations. Only `total` is additive across days. */
export const SERIES_MATH = ['total', 'dau', 'unique_session'] as const;
/** One of {@link SERIES_MATH}. */
export type SeriesMath = (typeof SERIES_MATH)[number];

/** Trend intervals. */
export const INTERVALS = ['minute', 'hour', 'day', 'week', 'month'] as const;
/** One of {@link INTERVALS}. */
export type Interval = (typeof INTERVALS)[number];

/** An event property filter on one series. */
export interface InsightPropertyFilter {
  key: string;
  operator: PropertyOperator;
  value?: string | number | boolean;
}

/** One trend series. */
export interface InsightSeries {
  event: string;
  /** Friendly label; becomes PostHog's `custom_name`. */
  name?: string;
  math: SeriesMath;
  properties: InsightPropertyFilter[];
}

/** One funnel step. */
export interface FunnelStep {
  event: string;
  name?: string;
}

/** A committed insight (`insights/<slug>.json`) after defaults. */
export interface InsightLocal {
  slug: string;
  /** `null` until `sync:apply` writes the PostHog id back. */
  posthog_id: number | null;
  kind: 'trends' | 'funnel';
  name: string;
  description: string;
  events: InsightSeries[];
  /** One event property to break the series down by. */
  breakdown?: string;
  breakdown_limit?: number;
  interval: Interval;
  window_minutes?: number;
  steps?: FunnelStep[];
  date_from: string;
}

/** A committed dashboard (`dashboards/<slug>.json`) after defaults. */
export interface DashboardLocal {
  slug: string;
  /** `null` until `sync:apply` writes the PostHog id back. */
  posthog_id: number | null;
  name: string;
  description: string;
  tags: string[];
  /** Insight slugs, in display order. */
  tiles: Array<{ insight: string }>;
}

type Json = Record<string, unknown>;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function oneOf<T extends string>(
  values: readonly T[],
  value: unknown,
): value is T {
  return (
    typeof value === 'string' && (values as readonly string[]).includes(value)
  );
}

function checkCommon(value: Json, problems: string[]): void {
  if (typeof value['slug'] !== 'string' || !SLUG.test(value['slug'])) {
    problems.push('slug must be lowercase kebab-case');
  }
  if (value['posthog_id'] !== null && !positiveInteger(value['posthog_id'])) {
    problems.push('posthog_id must be null or a positive integer');
  }
  if (!nonEmptyString(value['name'])) problems.push('name is required');
}

function fail(kind: string, value: unknown, problems: string[]): never {
  const slug =
    isRecord(value) && typeof value['slug'] === 'string'
      ? ` ${value['slug']}`
      : '';
  throw new Error(`Invalid ${kind}${slug}: ${problems.join('; ')}`);
}

function parseFilter(
  value: unknown,
  where: string,
  problems: string[],
): InsightPropertyFilter {
  if (!isRecord(value) || !nonEmptyString(value['key'])) {
    problems.push(`${where}.key is required`);
    return { key: '', operator: 'exact' };
  }
  const operator = value['operator'] ?? 'exact';
  if (!oneOf(PROPERTY_OPERATORS, operator)) {
    problems.push(
      `${where}.operator must be one of ${PROPERTY_OPERATORS.join(', ')}`,
    );
    return { key: value['key'], operator: 'exact' };
  }
  const raw = value['value'];
  const hasValue = ['string', 'number', 'boolean'].includes(typeof raw);
  if (raw !== undefined && !hasValue)
    problems.push(`${where}.value must be a string, number or boolean`);
  if (!VALUELESS_OPERATORS.has(operator) && !hasValue) {
    problems.push(`${where}: operator ${operator} requires a value`);
  }
  return hasValue && !VALUELESS_OPERATORS.has(operator)
    ? { key: value['key'], operator, value: raw as string | number | boolean }
    : { key: value['key'], operator };
}

function parseSeries(
  value: unknown,
  index: number,
  problems: string[],
): InsightSeries {
  const where = `events[${index}]`;
  if (!isRecord(value) || !nonEmptyString(value['event'])) {
    problems.push(`${where}.event is required`);
    return { event: '', math: 'total', properties: [] };
  }
  const math = value['math'] ?? 'total';
  if (!oneOf(SERIES_MATH, math))
    problems.push(`${where}.math must be one of ${SERIES_MATH.join(', ')}`);
  const rawProperties = value['properties'] ?? [];
  if (!Array.isArray(rawProperties))
    problems.push(`${where}.properties must be an array`);
  const properties = Array.isArray(rawProperties)
    ? rawProperties.map((filter, i) =>
        parseFilter(filter, `${where}.properties[${i}]`, problems),
      )
    : [];
  if (value['name'] !== undefined && !nonEmptyString(value['name']))
    problems.push(`${where}.name must be a non-empty string`);
  return {
    event: value['event'],
    ...(nonEmptyString(value['name']) ? { name: value['name'] } : {}),
    math: oneOf(SERIES_MATH, math) ? math : 'total',
    properties,
  };
}

/**
 * Validates an insight JSON value and applies defaults (`math: total`,
 * `operator: exact`, `interval: day`, `date_from: -30d`, empty description).
 *
 * @param value - Parsed JSON from `insights/<slug>.json`.
 * @returns The insight with defaults.
 * @throws Error listing every problem.
 */
export function parseInsight(value: unknown): InsightLocal {
  if (!isRecord(value)) fail('insight', value, ['must be an object']);
  const problems: string[] = [];
  checkCommon(value, problems);

  const kind = value['kind'];
  if (kind !== 'trends' && kind !== 'funnel')
    problems.push('kind must be trends or funnel');

  const rawEvents = value['events'] ?? [];
  if (!Array.isArray(rawEvents)) problems.push('events must be an array');
  const events = Array.isArray(rawEvents)
    ? rawEvents.map((item, i) => parseSeries(item, i, problems))
    : [];
  if (kind === 'trends' && events.length === 0)
    problems.push('trends insights require non-empty events');

  const rawSteps = value['steps'];
  let steps: FunnelStep[] | undefined;
  if (rawSteps !== undefined) {
    if (!Array.isArray(rawSteps)) problems.push('steps must be an array');
    else {
      steps = rawSteps.map((step, i) => {
        if (!isRecord(step) || !nonEmptyString(step['event'])) {
          problems.push(`steps[${i}].event is required`);
          return { event: '' };
        }
        return {
          event: step['event'],
          ...(nonEmptyString(step['name']) ? { name: step['name'] } : {}),
        };
      });
    }
  }
  if (kind === 'funnel' && (steps === undefined || steps.length === 0)) {
    problems.push('funnel insights require non-empty steps');
  }

  const breakdown = value['breakdown'];
  if (breakdown !== undefined && !nonEmptyString(breakdown))
    problems.push('breakdown must be a property name');
  if (
    value['breakdown_limit'] !== undefined &&
    !positiveInteger(value['breakdown_limit'])
  ) {
    problems.push('breakdown_limit must be a positive integer');
  }
  const interval = value['interval'] ?? 'day';
  if (!oneOf(INTERVALS, interval))
    problems.push(`interval must be one of ${INTERVALS.join(', ')}`);
  if (
    value['window_minutes'] !== undefined &&
    !positiveInteger(value['window_minutes'])
  ) {
    problems.push('window_minutes must be a positive integer');
  }
  const dateFrom = value['date_from'] ?? '-30d';
  if (!nonEmptyString(dateFrom))
    problems.push('date_from must be a non-empty string');
  const description = value['description'] ?? '';
  if (typeof description !== 'string')
    problems.push('description must be a string');

  if (problems.length > 0) fail('insight', value, problems);

  return {
    slug: value['slug'] as string,
    posthog_id: value['posthog_id'] as number | null,
    kind: kind as InsightLocal['kind'],
    name: value['name'] as string,
    description: description as string,
    events,
    ...(breakdown === undefined ? {} : { breakdown: breakdown as string }),
    ...(value['breakdown_limit'] === undefined
      ? {}
      : { breakdown_limit: value['breakdown_limit'] as number }),
    interval: interval as Interval,
    ...(value['window_minutes'] === undefined
      ? {}
      : { window_minutes: value['window_minutes'] as number }),
    ...(steps === undefined ? {} : { steps }),
    date_from: dateFrom as string,
  };
}

/**
 * Validates a dashboard JSON value and applies defaults (empty tags).
 *
 * @param value - Parsed JSON from `dashboards/<slug>.json`.
 * @returns The dashboard with defaults.
 * @throws Error listing every problem.
 */
export function parseDashboard(value: unknown): DashboardLocal {
  if (!isRecord(value)) fail('dashboard', value, ['must be an object']);
  const problems: string[] = [];
  checkCommon(value, problems);
  if (typeof value['description'] !== 'string')
    problems.push('description must be a string');
  const tags = value['tags'] ?? [];
  if (!Array.isArray(tags) || !tags.every(nonEmptyString))
    problems.push('tags must be a list of strings');
  const tiles = value['tiles'];
  if (
    !Array.isArray(tiles) ||
    !tiles.every((tile) => isRecord(tile) && nonEmptyString(tile['insight']))
  ) {
    problems.push('tiles must be a list of { insight: <slug> }');
  }
  if (problems.length > 0) fail('dashboard', value, problems);
  return {
    slug: value['slug'] as string,
    posthog_id: value['posthog_id'] as number | null,
    name: value['name'] as string,
    description: value['description'] as string,
    tags: [...(tags as string[])],
    tiles: (tiles as Array<{ insight: string }>).map((tile) => ({
      insight: tile.insight,
    })),
  };
}
