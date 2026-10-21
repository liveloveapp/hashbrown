import { expect, test } from 'vitest';
import {
  analyzeTelemetryCoverage,
  analyzeTelemetryEvents,
  DEFAULT_LIVE_COVERAGE_REQUIREMENTS,
  fetchRecentContractEvents,
  formatLiveQualityReport,
  hasBlockingFindings,
  type LiveTelemetryEvent,
  parseQualityArgs,
} from './live-quality.ts';
import { TELEMETRY_EVENT_CONTRACT } from './telemetry-contract.ts';

const at = '2026-10-21T00:00:00Z';

function summary(events: LiveTelemetryEvent[]) {
  return analyzeTelemetryEvents(events).map(
    ({ severity, kind, event, property }) => ({
      severity,
      kind,
      event,
      property,
    }),
  );
}

test('quality flags a cta_click missing cta_id and a page_viewed with an email-shaped property, does not require utm_* and $*, and only warns about their email-shaped values', () => {
  const events: LiveTelemetryEvent[] = [
    {
      event: 'marketing:cta_click',
      timestamp: at,
      properties: {
        surface: 'home',
        source_page: '/',
        utm_source: 'newsletter',
        utm_whatever: 'x',
        $current_url: 'https://hashbrown.dev/?e=a@b.co',
      },
    },
    {
      event: 'docs:page_viewed',
      timestamp: at,
      properties: {
        pathname: '/docs/react/start/quick',
        framework: 'react',
        source_page: '/docs/react/start/quick',
        contact: 'Jane.Doe+dev@example.com',
        gclid: 'click',
        $referrer: 'mailto:jane@example.com',
        utm_campaign: 'jane@example.com',
      },
    },
  ];

  const findings = summary(events);

  expect(findings).toEqual([
    {
      severity: 'error',
      kind: 'missing_required_property',
      event: 'marketing:cta_click',
      property: 'cta_id',
    },
    {
      severity: 'warning',
      kind: 'email_shaped_value',
      event: 'marketing:cta_click',
      property: '$current_url',
    },
    {
      severity: 'error',
      kind: 'email_shaped_value',
      event: 'docs:page_viewed',
      property: 'contact',
    },
    {
      severity: 'warning',
      kind: 'email_shaped_value',
      event: 'docs:page_viewed',
      property: '$referrer',
    },
    {
      severity: 'warning',
      kind: 'email_shaped_value',
      event: 'docs:page_viewed',
      property: 'utm_campaign',
    },
  ]);
  expect(hasBlockingFindings(analyzeTelemetryEvents(events))).toBe(true);
});

test('quality flags forbidden properties and warns on non-contract ones', () => {
  const events: LiveTelemetryEvent[] = [
    {
      event: 'docs:code_copied',
      timestamp: at,
      properties: {
        pathname: '/docs/react/x',
        framework: 'react',
        language: 'ts',
        prompt: 'hi',
        accidental: true,
        token: 'phc',
        uuid: 'u',
        distinct_id: 'd',
      },
    },
    {
      event: 'marketing:engaged_time',
      timestamp: at,
      properties: { engaged_seconds: 10, 'user@example.com': true },
    },
    {
      event: 'unknown:event',
      timestamp: at,
      properties: { prompt: 'ignored' },
    },
  ];

  const findings = summary(events);

  expect(findings).toEqual([
    {
      severity: 'error',
      kind: 'forbidden_property',
      event: 'docs:code_copied',
      property: 'prompt',
    },
    {
      severity: 'warning',
      kind: 'unexpected_property',
      event: 'docs:code_copied',
      property: 'accidental',
    },
    {
      severity: 'error',
      kind: 'email_shaped_value',
      event: 'marketing:engaged_time',
      property: 'user@example.com',
    },
  ]);
});

test('quality fails coverage when $pageview or engaged_time has no events', () => {
  const pageviewOnly: LiveTelemetryEvent[] = [
    { event: '$pageview', timestamp: at, properties: {} },
  ];
  const both: LiveTelemetryEvent[] = [
    ...pageviewOnly,
    {
      event: 'marketing:engaged_time',
      timestamp: at,
      properties: { engaged_seconds: 30 },
    },
  ];

  const none = analyzeTelemetryCoverage([], DEFAULT_LIVE_COVERAGE_REQUIREMENTS);
  const missingEngaged = analyzeTelemetryCoverage(
    pageviewOnly,
    DEFAULT_LIVE_COVERAGE_REQUIREMENTS,
  );
  const covered = analyzeTelemetryCoverage(
    both,
    DEFAULT_LIVE_COVERAGE_REQUIREMENTS,
  );

  expect(DEFAULT_LIVE_COVERAGE_REQUIREMENTS).toEqual([
    { event: '$pageview', minCount: 1 },
    { event: 'marketing:engaged_time', minCount: 1 },
  ]);
  expect(none.map((finding) => [finding.kind, finding.event])).toEqual([
    ['insufficient_event_coverage', '$pageview'],
    ['insufficient_event_coverage', 'marketing:engaged_time'],
  ]);
  expect(missingEngaged.map((finding) => finding.message)).toEqual([
    'marketing:engaged_time has 0 recent events; expected at least 1',
  ]);
  expect(hasBlockingFindings(missingEngaged)).toBe(true);
  expect(covered).toEqual([]);
});

test('every contracted event with its required properties passes', () => {
  const events = Object.entries(TELEMETRY_EVENT_CONTRACT).map(
    ([event, contract]) => ({
      event,
      timestamp: at,
      properties: Object.fromEntries(
        contract.requiredProperties.map((property) => [property, 'x']),
      ),
    }),
  );

  const findings = analyzeTelemetryEvents(events);

  expect(findings).toEqual([]);
});

test('fetchRecentContractEvents asks for each event with a bounded limit', async () => {
  const calls: unknown[] = [];
  const client = {
    get: async (path: string, query?: Record<string, unknown>) => {
      calls.push({ path, query });
      return {
        results: [
          { event: String(query?.event), timestamp: at, properties: {} },
        ],
      };
    },
  };

  const events = await fetchRecentContractEvents({
    client,
    eventNames: ['$pageview', 'marketing:engaged_time'],
    after: '2026-10-14T00:00:00.000Z',
    limitPerEvent: 25,
  });

  expect(events.map((item) => item.event)).toEqual([
    '$pageview',
    'marketing:engaged_time',
  ]);
  expect(calls).toEqual([
    {
      path: '/events/',
      query: {
        after: '2026-10-14T00:00:00.000Z',
        event: '$pageview',
        format: 'json',
        limit: 25,
      },
    },
    {
      path: '/events/',
      query: {
        after: '2026-10-14T00:00:00.000Z',
        event: 'marketing:engaged_time',
        format: 'json',
        limit: 25,
      },
    },
  ]);
});

test('quality report and arguments', () => {
  const events: LiveTelemetryEvent[] = [
    { event: '$pageview', timestamp: at, properties: {} },
  ];

  const report = formatLiveQualityReport({
    checkedEvents: ['$pageview', 'marketing:engaged_time'],
    coverageRequirements: DEFAULT_LIVE_COVERAGE_REQUIREMENTS,
    days: 7,
    limitPerEvent: 100,
    events,
    findings: analyzeTelemetryCoverage(
      events,
      DEFAULT_LIVE_COVERAGE_REQUIREMENTS,
    ),
  });
  const parsed = parseQualityArgs([
    '--days',
    '1',
    '--limit-per-event',
    '25',
    '--require-critical-coverage',
  ]);

  expect(report).toMatch(/last 7 days/);
  expect(report).toMatch(/\| \$pageview \| 1 \| 1 \|/);
  expect(report).toMatch(/\| marketing:engaged_time \| 0 \| 1 \|/);
  expect(report).toMatch(/Errors: 1/);
  expect(parsed).toEqual({
    days: 1,
    limitPerEvent: 25,
    coverageRequirements: DEFAULT_LIVE_COVERAGE_REQUIREMENTS,
  });
  expect(() => parseQualityArgs(['--days', '0'])).toThrow(/--days/);
  expect(() => parseQualityArgs(['--bogus'])).toThrow(/Unknown argument/);
});

test('an email-shaped utm value is a warning, not a blocking error', () => {
  const events: LiveTelemetryEvent[] = [
    {
      event: 'docs:page_viewed',
      timestamp: at,
      properties: {
        pathname: '/docs',
        framework: 'react',
        source_page: '/docs',
        utm_campaign: 'jane@example.com',
      },
    },
  ];

  const findings = analyzeTelemetryEvents(events);

  expect(summary(events)).toEqual([
    {
      severity: 'warning',
      kind: 'email_shaped_value',
      event: 'docs:page_viewed',
      property: 'utm_campaign',
    },
  ]);
  expect(JSON.stringify(findings)).not.toContain('jane@example.com');
  expect(hasBlockingFindings(findings)).toBe(false);
});

test('a redacted crawler user agent raises no email_shaped_value', () => {
  const events: LiveTelemetryEvent[] = [
    {
      event: 'marketing:ai_crawler_visit',
      timestamp: at,
      properties: {
        ai_crawler: 'bytespider',
        source_page: '/docs',
        user_agent:
          'Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; [email])',
      },
    },
  ];

  const findings = analyzeTelemetryEvents(events);

  expect(findings.map((finding) => finding.kind)).not.toContain(
    'email_shaped_value',
  );
});
