import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { parseDashboard, parseInsight } from './schema.ts';

const HERE = import.meta.dirname;

async function committed(
  dir: string,
): Promise<Array<{ file: string; json: unknown }>> {
  const files = (await readdir(join(HERE, dir)))
    .filter((file) => file.endsWith('.json'))
    .sort();
  return Promise.all(
    files.map(async (file) => ({
      file,
      json: JSON.parse(
        await readFile(join(HERE, dir, file), 'utf8'),
      ) as unknown,
    })),
  );
}

test('schema rejects a funnel without steps and an operator needing a value', () => {
  const funnel = { slug: 'f', posthog_id: null, kind: 'funnel', name: 'F' };
  const comparison = {
    slug: 't',
    posthog_id: null,
    kind: 'trends',
    name: 'T',
    events: [
      {
        event: 'marketing:cta_click',
        properties: [{ key: 'cta_id', operator: 'exact' }],
      },
    ],
  };
  const presence = {
    ...comparison,
    events: [
      {
        event: 'marketing:cta_click',
        properties: [{ key: 'cta_id', operator: 'is_set' }],
      },
    ],
  };

  const parsePresence = () => parseInsight(presence);

  expect(() => parseInsight(funnel)).toThrow(/steps/);
  expect(() => parseInsight(comparison)).toThrow(/value/);
  expect(parsePresence().events[0].properties).toEqual([
    { key: 'cta_id', operator: 'is_set' },
  ]);
});

test('schema applies defaults and rejects malformed slugs and kinds', () => {
  const minimal = {
    slug: 'pageviews-by-path',
    posthog_id: null,
    kind: 'trends',
    name: 'Pageviews',
    events: [{ event: '$pageview' }],
    breakdown: '$pathname',
  };

  const insight = parseInsight(minimal);
  const dashboard = parseDashboard({
    slug: 'growth-overview',
    posthog_id: 12,
    name: 'Overview',
    description: '',
    tiles: [{ insight: 'pageviews-by-path' }],
  });

  expect(insight).toMatchObject({
    interval: 'day',
    date_from: '-30d',
    description: '',
    events: [{ event: '$pageview', math: 'total', properties: [] }],
  });
  expect(dashboard.tags).toEqual([]);
  expect(() => parseInsight({ ...minimal, slug: 'Bad_Slug' })).toThrow(/slug/);
  expect(() => parseInsight({ ...minimal, kind: 'retention' })).toThrow(/kind/);
  expect(() => parseInsight({ ...minimal, events: [] })).toThrow(/events/);
  expect(() => parseInsight({ ...minimal, posthog_id: 'x' })).toThrow(
    /posthog_id/,
  );
  expect(() =>
    parseDashboard({
      slug: 'd',
      posthog_id: null,
      name: 'D',
      description: '',
      tiles: [{}],
    }),
  ).toThrow(/tiles/);
});

test('every committed dashboard and insight parses, matches its file name, and starts unsynced or synced', async () => {
  const dashboards = await committed('dashboards');
  const insights = await committed('insights');

  const parsedDashboards = dashboards.map(({ file, json }) => ({
    file,
    value: parseDashboard(json),
  }));
  const parsedInsights = insights.map(({ file, json }) => ({
    file,
    value: parseInsight(json),
  }));
  const insightSlugs = new Set(parsedInsights.map(({ value }) => value.slug));

  expect(parsedDashboards.map(({ value }) => value.slug).sort()).toEqual([
    'developer-funnel',
    'growth-overview',
    'threadplane-handoff',
  ]);
  for (const { file, value } of [...parsedDashboards, ...parsedInsights]) {
    expect(file).toBe(`${value.slug}.json`);
  }
  for (const { value } of parsedDashboards) {
    for (const tile of value.tiles)
      expect(insightSlugs).toContain(tile.insight);
  }
  for (const { value } of parsedInsights) {
    expect(value).toMatchObject({
      kind: 'trends',
      interval: 'day',
      date_from: '-30d',
    });
  }
});
