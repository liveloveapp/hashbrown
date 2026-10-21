import { expect, test } from 'vitest';
import {
  formatDeltaCell,
  generateReport,
  insightReportRows,
  renderReport,
  type ReportClient,
  sparkline,
} from './report.ts';

const asOf = new Date('2026-10-21T17:45:00Z');
const dayMs = 86_400_000;
const today = Date.parse('2026-10-21T00:00:00Z');
const days = Array.from({ length: 28 }, (_, index) =>
  new Date(today - (28 - index) * dayMs).toISOString().slice(0, 10),
);
const daily = {
  kind: 'TrendsQuery',
  interval: 'day',
  series: [{ math: 'total' }],
};

test('report marks funnels, unique counts, hidden-Other breakdowns and stale data Unavailable', () => {
  const staleDays = days.map((day) =>
    new Date(Date.parse(day) - dayMs).toISOString().slice(0, 10),
  );
  const insights = [
    {
      id: 1,
      name: 'Funnel',
      query: { source: { kind: 'FunnelsQuery' } },
      result: [],
    },
    {
      id: 2,
      name: 'Unique',
      query: { source: { ...daily, series: [{ math: 'dau' }] } },
      result: [{ days, data: Array(28).fill(1) }],
    },
    {
      id: 3,
      name: 'Hidden other',
      query: {
        source: {
          ...daily,
          breakdownFilter: {
            breakdown: '$pathname',
            breakdown_hide_other_aggregation: true,
          },
        },
      },
      result: [{ days, data: Array(28).fill(1), breakdown_value: '/' }],
    },
    {
      id: 4,
      name: 'Breakdown unique',
      query: {
        source: {
          ...daily,
          series: [{ math: 'dau' }],
          breakdownFilter: { breakdown: '$pathname' },
        },
      },
      result: [{ days, data: Array(28).fill(1) }],
    },
    {
      id: 5,
      name: 'Stale',
      query: { source: daily },
      result: [{ days: staleDays, data: Array(28).fill(1) }],
    },
    {
      id: 6,
      name: 'Gap',
      query: { source: daily },
      result: [{ days: days.slice(0, -1), data: Array(27).fill(0) }],
    },
    { id: 7, name: 'Missing', query: { source: daily } },
  ];

  const rows = insights.flatMap((insight) => insightReportRows(insight, asOf));
  const markdown = renderReport([{ name: 'Website', rows }], '2026-10-21');

  expect(rows.map((row) => [row.metric, row.thisWeek, row.lastWeek])).toEqual(
    insights.map((insight) => [insight.name, null, null]),
  );
  expect(rows.map((row) => row.unavailable)).toEqual([
    expect.stringMatching(/funnel/i),
    expect.stringMatching(/unique/i),
    expect.stringMatching(/other/i),
    expect.stringMatching(/unique/i),
    expect.stringMatching(/stale/i),
    expect.stringMatching(/stale/i),
    expect.stringMatching(/missing/i),
  ]);
  expect(markdown.match(/Unavailable:/g)).toHaveLength(7);
  expect(markdown).not.toMatch(/\| 0 \|/);
});

test('report sums dated completed UTC days and ignores the partial current day', () => {
  const resultDays = [...days, '2026-10-21', '2026-09-01'].reverse();
  const data = [...days.map((_, index) => index + 1), 10_000, 20_000].reverse();

  const rows = insightReportRows(
    {
      id: 1,
      name: 'Dated',
      query: { source: daily },
      result: [{ days: resultDays, data }],
    },
    asOf,
  );

  expect(rows).toEqual([
    {
      metric: 'Dated',
      thisWeek: 175,
      lastWeek: 126,
      weeks: [28, 77, 126, 175],
    },
  ]);
});

test('generateReport reads managed dashboards and their tiles through the client', async () => {
  const requests: string[] = [];
  const client: ReportClient = {
    async get(path, query) {
      requests.push(`${path} ${JSON.stringify(query ?? {})}`);
      if (path === '/dashboards/') {
        return {
          results: [
            { id: 10, name: 'Managed' },
            { id: 99, name: 'Other' },
          ],
          next: null,
        };
      }
      if (path === '/dashboards/10/') {
        return {
          id: 10,
          name: 'Managed',
          tiles: [{ insight: { id: 7 } }, { text: 'note' }],
        };
      }
      return {
        id: 7,
        name: 'Pageviews',
        query: { source: daily },
        result: [{ days, data: Array(28).fill(1) }],
      };
    },
  };

  const report = await generateReport({ client, asOf, dashboardIds: [10] });

  expect(report.date).toBe('2026-10-21');
  expect(report.markdown).toMatch(/## Managed/);
  expect(report.markdown).toMatch(/\| Pageviews \| 7 \| 7 \|/);
  expect(report.markdown).not.toMatch(/Other/);
  expect(requests).toEqual([
    '/dashboards/ {"limit":100,"offset":0}',
    '/dashboards/10/ {}',
    '/insights/7/ {"refresh":"force_cache"}',
  ]);
});

test('generateReport refuses an absent dashboard and a dashboard without tiles data', async () => {
  const absent: ReportClient = {
    get: async () => ({ results: [], next: null }),
  };
  const tileless: ReportClient = {
    get: async (path) =>
      path === '/dashboards/'
        ? { results: [{ id: 10, name: 'M' }], next: null }
        : { id: 10, name: 'M' },
  };

  const missing = generateReport({ client: absent, asOf, dashboardIds: [10] });
  const noTiles = generateReport({
    client: tileless,
    asOf,
    dashboardIds: [10],
  });

  await expect(missing).rejects.toThrow(/absent/);
  await expect(noTiles).rejects.toThrow(/tiles/);
});

test('report formatting helpers', () => {
  const cells = [
    formatDeltaCell({ thisWeek: 5, lastWeek: 0 }),
    formatDeltaCell({ thisWeek: 120, lastWeek: 100 }),
    formatDeltaCell({ thisWeek: 80, lastWeek: 100 }),
  ];

  const bars = [sparkline([]), sparkline([0, 1, 2, 4, 8])];

  expect(cells).toEqual(['+5 (new)', '+20 (+20%)', '-20 (-20%)']);
  expect(bars).toEqual(['—', '▁▂▃▅█']);
});

test('report sums a total breakdown across values, including Other, and lists the top values', () => {
  const series = (label: string, perDay: number) => ({
    days,
    data: Array(28).fill(perDay),
    breakdown_value: label,
    label,
    action: { order: 0 },
  });
  const insight = {
    id: 1,
    name: 'By path',
    query: {
      source: {
        ...daily,
        breakdownFilter: { breakdown: '$pathname', breakdown_limit: 3 },
      },
    },
    result: [
      series('/a', 4),
      series('/b', 3),
      series('/c', 2),
      series('$$_posthog_breakdown_other_$$', 1),
      series('$$_posthog_breakdown_null_$$', 1),
    ],
  };

  const rows = insightReportRows(insight, asOf);

  expect(rows).toEqual([
    {
      metric: 'By path',
      thisWeek: 77,
      lastWeek: 77,
      weeks: [77, 77, 77, 77],
      topValues: '/a, /b, /c',
    },
  ]);
});

test('report renders the Top values cell', () => {
  const markdown = renderReport(
    [
      {
        name: 'Website',
        rows: [
          {
            metric: 'By path',
            thisWeek: 10,
            lastWeek: 5,
            weeks: [1, 2, 5, 10],
            topValues: '/a, /b',
          },
        ],
      },
    ],
    '2026-10-21',
  );

  expect(markdown).toMatch(
    /\| By path \| 10 \| 5 \| \+5 \(\+100%\) \| .* \| \/a, \/b \|/,
  );
  expect(markdown).toMatch(/Top values/);
});
