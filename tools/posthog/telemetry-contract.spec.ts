import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { type InsightLocal, parseInsight } from './schema.ts';
import {
  documentedEvents,
  TELEMETRY_EVENT_CONTRACT,
  TELEMETRY_FORBIDDEN_PROPERTIES,
} from './telemetry-contract.ts';

const HERE = import.meta.dirname;
const EVENTS_MODULE = join(
  HERE,
  '..',
  '..',
  'www',
  'src',
  'lib',
  'analytics',
  'events.ts',
);

async function insights(): Promise<InsightLocal[]> {
  const dir = join(HERE, 'insights');
  const files = (await readdir(dir))
    .filter((file) => file.endsWith('.json'))
    .sort();
  return Promise.all(
    files.map(async (file) =>
      parseInsight(JSON.parse(await readFile(join(dir, file), 'utf8'))),
    ),
  );
}

/** Every way an insight leans on the contract, as human-readable violations. */
function contractViolations(insight: InsightLocal): string[] {
  const violations: string[] = [];
  const series = [
    ...insight.events,
    ...(insight.steps ?? []).map((step) => ({
      event: step.event,
      properties: [],
    })),
  ];
  const breakdown = insight.breakdown;
  for (const item of series) {
    const contract = TELEMETRY_EVENT_CONTRACT[item.event];
    if (!contract) {
      violations.push(`${insight.slug}: ${item.event} is not in the contract`);
      continue;
    }
    for (const filter of item.properties) {
      if (!contract.allowedProperties.includes(filter.key)) {
        violations.push(
          `${insight.slug}: ${item.event} filters by ${filter.key}`,
        );
      }
    }
    // A breakdown applies to every series.
    if (
      breakdown !== undefined &&
      !contract.allowedBreakdowns.includes(breakdown)
    ) {
      violations.push(
        `${insight.slug}: ${item.event} breaks down by ${breakdown}`,
      );
    }
  }
  if (breakdown !== undefined) {
    const usedBySomeSeries = series.some((item) =>
      TELEMETRY_EVENT_CONTRACT[item.event]?.allowedBreakdowns.includes(
        breakdown,
      ),
    );
    if (!usedBySomeSeries)
      violations.push(
        `${insight.slug}: no series allows breakdown ${breakdown}`,
      );
  }
  return violations;
}

test('every insight event, breakdown and filter is allowed by the contract', async () => {
  const all = await insights();

  const violations = all.flatMap(contractViolations);
  const probe = contractViolations(
    parseInsight({
      slug: 'probe',
      posthog_id: null,
      kind: 'trends',
      name: 'Probe',
      events: [
        {
          event: 'marketing:cta_click',
          properties: [{ key: 'prompt', operator: 'is_set' }],
        },
        { event: 'nope:event' },
      ],
      breakdown: 'messages',
    }),
  );

  expect(all.length).toBe(9);
  expect(violations).toEqual([]);
  expect(probe).toEqual([
    'probe: marketing:cta_click filters by prompt',
    'probe: marketing:cta_click breaks down by messages',
    'probe: nope:event is not in the contract',
    'probe: no series allows breakdown messages',
  ]);
});

test('forbidden properties are the Global Constraints list and never allowed', () => {
  const forbidden = new Set<string>(TELEMETRY_FORBIDDEN_PROPERTIES);

  const leaks = Object.entries(TELEMETRY_EVENT_CONTRACT).flatMap(
    ([event, contract]) =>
      [
        ...contract.requiredProperties,
        ...contract.allowedProperties,
        ...contract.allowedBreakdowns,
      ]
        .filter((property) => forbidden.has(property))
        .map((property) => `${event}: ${property}`),
  );

  expect([...TELEMETRY_FORBIDDEN_PROPERTIES].sort()).toEqual(
    [
      'prompt',
      'messages',
      'threadId',
      'runId',
      'apiUrl',
      'url',
      'error',
      'schema',
      'toolArgs',
      'componentProps',
    ].sort(),
  );
  expect(leaks).toEqual([]);
});

test('each contract entry is internally consistent', () => {
  const entries = Object.entries(TELEMETRY_EVENT_CONTRACT);

  const problems = entries.flatMap(([event, contract]) => [
    ...contract.requiredProperties
      .filter((p) => !contract.allowedProperties.includes(p))
      .map((p) => `${event}: required ${p} not allowed`),
    ...contract.allowedBreakdowns
      .filter((p) => !contract.allowedProperties.includes(p))
      .map((p) => `${event}: breakdown ${p} not allowed`),
  ]);

  expect(problems).toEqual([]);
});

test('the contract covers exactly the declared website events plus $pageview', async () => {
  const body = await readFile(EVENTS_MODULE, 'utf8');

  const declared = [
    ...(
      /export const analyticsEvents = \{([\s\S]*?)\} as const;/.exec(
        body,
      )?.[1] ?? ''
    ).matchAll(/:\s*'([^']+)'/g),
  ].map((m) => m[1]);
  const contracted = Object.keys(TELEMETRY_EVENT_CONTRACT);

  expect(declared.length).toBeGreaterThan(0);
  expect(contracted.sort()).toEqual(['$pageview', ...declared].sort());
});

test('documentedEvents reads backticked event names only', () => {
  const markdown =
    'Uses `$pageview`, `marketing:cta_click` and `docs:page_viewed`; not marketing:bare or `Marketing:Bad`.';

  const documented = documentedEvents(markdown);

  expect([...documented].sort()).toEqual([
    '$pageview',
    'docs:page_viewed',
    'marketing:cta_click',
  ]);
});
