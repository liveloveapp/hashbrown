/**
 * Samples recent production events and checks them against the telemetry
 * contract. Exits 1 on any error finding: a missing required property, a
 * forbidden property, or an email-shaped property name or value. Unexpected
 * properties are warnings. With `--require-critical-coverage` it also fails
 * when `$pageview` or `marketing:engaged_time` has no events in the window.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPosthogClient, type QueryParams } from './client.ts';
import {
  TELEMETRY_EVENT_CONTRACT,
  TELEMETRY_FORBIDDEN_PROPERTIES,
  type TelemetryEventContract,
} from './telemetry-contract.ts';

/** One sampled event. */
export interface LiveTelemetryEvent {
  event: string;
  timestamp: string;
  properties: Record<string, unknown>;
}

/** The kinds of finding the check reports. */
export type LiveQualityFindingKind =
  | 'missing_required_property'
  | 'forbidden_property'
  | 'email_shaped_value'
  | 'unexpected_property'
  | 'insufficient_event_coverage';

/** One finding. Errors fail the check; warnings do not. */
export interface LiveQualityFinding {
  severity: 'error' | 'warning';
  kind: LiveQualityFindingKind;
  event: string;
  property: string;
  timestamp: string;
  message: string;
}

/** A minimum sampled count for one event. */
export interface LiveCoverageRequirement {
  event: string;
  minCount: number;
}

/** The events whose absence means collection is broken. */
export const DEFAULT_LIVE_COVERAGE_REQUIREMENTS: readonly LiveCoverageRequirement[] =
  [
    { event: '$pageview', minCount: 1 },
    { event: 'marketing:engaged_time', minCount: 1 },
  ];

/**
 * Property names that PostHog or ad platforms attach and the contract does not
 * govern: click ids and the PostHog identity fields. `utm_*` and `$*` are
 * ignored by prefix.
 */
export const IGNORED_PROPERTY_NAMES: ReadonlySet<string> = new Set([
  '_kx',
  'dclid',
  'distinct_id',
  'epik',
  'fbclid',
  'gad_source',
  'gbraid',
  'gclid',
  'gclsrc',
  'igshid',
  'irclid',
  'li_fat_id',
  'mc_cid',
  'msclkid',
  'qclid',
  'rdt_cid',
  'sccid',
  'token',
  'ttclid',
  'twclid',
  'uuid',
  'wbraid',
]);

/** Something that looks like an email address anywhere in a string. */
const EMAIL_SHAPE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/**
 * Whether the contract ignores a property name: `$*`, `utm_*`, or one of
 * {@link IGNORED_PROPERTY_NAMES}.
 *
 * @param property - A property name.
 */
export function isIgnoredProperty(property: string): boolean {
  return (
    property.startsWith('$') ||
    property.startsWith('utm_') ||
    IGNORED_PROPERTY_NAMES.has(property)
  );
}

function isMissing(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function looksLikeEmail(property: string, value: unknown): boolean {
  return (
    EMAIL_SHAPE.test(property) ||
    (typeof value === 'string' && EMAIL_SHAPE.test(value))
  );
}

/**
 * Checks sampled events against the contract. Events outside the contract are
 * skipped. Ignored properties are never inspected.
 *
 * @param events - Sampled events.
 * @param contract - The contract; defaults to {@link TELEMETRY_EVENT_CONTRACT}.
 * @returns Findings, in event and property order.
 */
export function analyzeTelemetryEvents(
  events: readonly LiveTelemetryEvent[],
  contract: Readonly<
    Record<string, TelemetryEventContract>
  > = TELEMETRY_EVENT_CONTRACT,
): LiveQualityFinding[] {
  const forbidden = new Set<string>(TELEMETRY_FORBIDDEN_PROPERTIES);
  const findings: LiveQualityFinding[] = [];

  for (const item of events) {
    const eventContract = contract[item.event];
    if (!eventContract) continue;
    const finding = (
      severity: LiveQualityFinding['severity'],
      kind: LiveQualityFindingKind,
      property: string,
      message: string,
    ) =>
      findings.push({
        severity,
        kind,
        event: item.event,
        property,
        timestamp: item.timestamp,
        message,
      });

    for (const property of eventContract.requiredProperties) {
      if (isMissing(item.properties[property])) {
        finding(
          'error',
          'missing_required_property',
          property,
          `${item.event} is missing required property ${property}`,
        );
      }
    }
    const allowed = new Set(eventContract.allowedProperties);
    for (const [property, value] of Object.entries(item.properties)) {
      if (isIgnoredProperty(property)) continue;
      if (forbidden.has(property)) {
        finding(
          'error',
          'forbidden_property',
          property,
          `${item.event} includes forbidden property ${property}`,
        );
      } else if (looksLikeEmail(property, value)) {
        // The value is deliberately left out of the message.
        finding(
          'error',
          'email_shaped_value',
          property,
          `${item.event} carries an email-shaped value in ${property}`,
        );
      } else if (!allowed.has(property)) {
        finding(
          'warning',
          'unexpected_property',
          property,
          `${item.event} includes non-contract property ${property}`,
        );
      }
    }
  }
  return findings;
}

/**
 * Checks that each required event was sampled often enough.
 *
 * @param events - Sampled events.
 * @param requirements - Minimum counts.
 * @returns One error per unmet requirement.
 */
export function analyzeTelemetryCoverage(
  events: readonly LiveTelemetryEvent[],
  requirements: readonly LiveCoverageRequirement[],
): LiveQualityFinding[] {
  return requirements.flatMap((requirement) => {
    const count = events.filter(
      (item) => item.event === requirement.event,
    ).length;
    if (count >= requirement.minCount) return [];
    return [
      {
        severity: 'error' as const,
        kind: 'insufficient_event_coverage' as const,
        event: requirement.event,
        property: 'event_count',
        timestamp: 'n/a',
        message: `${requirement.event} has ${count} recent ${count === 1 ? 'event' : 'events'}; expected at least ${requirement.minCount}`,
      },
    ];
  });
}

/**
 * Whether any finding fails the check.
 *
 * @param findings - Findings.
 */
export function hasBlockingFindings(
  findings: readonly LiveQualityFinding[],
): boolean {
  return findings.some((finding) => finding.severity === 'error');
}

/** The read access the check needs; faked in tests. */
export interface LiveTelemetryEventsClient {
  get(path: string, query?: QueryParams): Promise<unknown>;
}

/**
 * Fetches up to `limitPerEvent` recent events for each name.
 *
 * @param options.client - Read access to PostHog.
 * @param options.eventNames - Events to sample.
 * @param options.after - ISO lower bound.
 * @param options.limitPerEvent - Sample size per event.
 * @returns The sampled events.
 */
export async function fetchRecentContractEvents({
  client,
  eventNames,
  after,
  limitPerEvent,
}: {
  client: LiveTelemetryEventsClient;
  eventNames: readonly string[];
  after: string;
  limitPerEvent: number;
}): Promise<LiveTelemetryEvent[]> {
  const fetched: LiveTelemetryEvent[] = [];
  for (const event of eventNames) {
    const page = (await client.get('/events/', {
      after,
      event,
      format: 'json',
      limit: limitPerEvent,
    })) as {
      results?: unknown;
    };
    if (!Array.isArray(page?.results))
      throw new Error(
        `PostHog events query for ${event} returned no results list`,
      );
    fetched.push(...(page.results as LiveTelemetryEvent[]));
  }
  return fetched;
}

/**
 * The human-readable check output.
 *
 * @param options - What was checked and found.
 * @returns Text for the console.
 */
export function formatLiveQualityReport({
  checkedEvents,
  coverageRequirements = [],
  days,
  limitPerEvent,
  events,
  findings,
}: {
  checkedEvents: readonly string[];
  coverageRequirements?: readonly LiveCoverageRequirement[];
  days: number;
  limitPerEvent?: number;
  events: readonly LiveTelemetryEvent[];
  findings: readonly LiveQualityFinding[];
}): string {
  const minimums = new Map(
    coverageRequirements.map((r) => [r.event, r.minCount]),
  );
  const withCoverage = coverageRequirements.length > 0;
  const lines = [
    `Live telemetry quality — last ${days} ${days === 1 ? 'day' : 'days'}`,
    '',
    `Sampled observations: ${events.length}. This is a bounded sample, not total traffic${limitPerEvent === undefined ? '.' : ` (up to ${limitPerEvent} events per event name).`}`,
    'Zero samples do not establish healthy collection. Error and warning counts below count findings, not distinct events.',
    '',
    withCoverage
      ? '| Event | Sampled events | Required minimum |'
      : '| Event | Sampled events |',
    withCoverage
      ? '|-------|---------------:|-----------------:|'
      : '|-------|---------------:|',
  ];
  for (const event of checkedEvents) {
    const count = events.filter((item) => item.event === event).length;
    lines.push(
      withCoverage
        ? `| ${event} | ${count} | ${minimums.get(event) ?? ''} |`
        : `| ${event} | ${count} |`,
    );
  }
  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warning');
  lines.push('', `Errors: ${errors.length}`, `Warnings: ${warnings.length}`);
  for (const [title, group] of [
    ['Errors', errors],
    ['Warnings', warnings],
  ] as const) {
    if (group.length === 0) continue;
    lines.push(
      '',
      `## ${title}`,
      ...group.map((f) => `- ${f.kind}: ${f.message} (${f.timestamp})`),
    );
  }
  return lines.join('\n');
}

/** Parsed `quality:live` arguments. */
export interface QualityArgs {
  days: number;
  limitPerEvent: number;
  coverageRequirements: readonly LiveCoverageRequirement[];
}

/**
 * Parses `--days N`, `--limit-per-event N` and `--require-critical-coverage`.
 *
 * @param args - Command-line arguments.
 * @returns The options; defaults are 7 days and 100 events per name.
 * @throws On an unknown argument or a non-positive integer.
 */
export function parseQualityArgs(args: readonly string[]): QualityArgs {
  let days = 7;
  let limitPerEvent = 100;
  let coverageRequirements: readonly LiveCoverageRequirement[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--days') days = Number(args[++i]);
    else if (arg === '--limit-per-event') limitPerEvent = Number(args[++i]);
    else if (arg === '--require-critical-coverage')
      coverageRequirements = DEFAULT_LIVE_COVERAGE_REQUIREMENTS;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(days) || days <= 0)
    throw new Error('--days must be a positive integer');
  if (!Number.isInteger(limitPerEvent) || limitPerEvent <= 0)
    throw new Error('--limit-per-event must be a positive integer');
  return { days, limitPerEvent, coverageRequirements };
}

async function main(): Promise<number> {
  let options: QualityArgs;
  try {
    options = parseQualityArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    console.error(
      'Usage: live-quality.ts [--days N] [--limit-per-event N] [--require-critical-coverage]',
    );
    return 1;
  }
  const checkedEvents = Object.keys(TELEMETRY_EVENT_CONTRACT).sort();
  const after = new Date(Date.now() - options.days * 86_400_000).toISOString();
  try {
    const events = await fetchRecentContractEvents({
      client: createPosthogClient(),
      eventNames: checkedEvents,
      after,
      limitPerEvent: options.limitPerEvent,
    });
    const findings = [
      ...analyzeTelemetryEvents(events),
      ...analyzeTelemetryCoverage(events, options.coverageRequirements),
    ];
    console.log(
      formatLiveQualityReport({ checkedEvents, ...options, events, findings }),
    );
    return hasBlockingFindings(findings) ? 1 : 0;
  } catch (err) {
    console.error(
      `Live telemetry quality check failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

const entry = process.argv[1];
if (entry && pathToFileURL(resolve(entry)).href === import.meta.url) {
  main().then((code) => process.exit(code));
}
