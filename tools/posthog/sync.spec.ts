import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  applyPlan,
  computePlan,
  fetchAllPages,
  type RemoteInsight,
  runSync,
  type SyncClient,
  toPostHogDashboard,
  toPostHogInsight,
} from './sync.ts';

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'posthog-sync-'));
  await mkdir(join(root, 'dashboards'));
  await mkdir(join(root, 'insights'));
  return root;
}

async function writeJson(root: string, path: string, value: unknown) {
  await writeFile(join(root, path), `${JSON.stringify(value, null, 2)}\n`);
}

function insight(slug: string, name: string, posthog_id: number | null = null) {
  return {
    slug,
    posthog_id,
    kind: 'trends',
    name,
    events: [{ event: '$pageview' }],
  };
}

function fakeClient(
  remote: {
    dashboards?: Array<{ id: number; name: string }>;
    insights?: RemoteInsight[];
  } = {},
): SyncClient & { calls: string[] } {
  const calls: string[] = [];
  let nextId = 1000;
  return {
    calls,
    listDashboards: async () => remote.dashboards ?? [],
    listInsights: async () => remote.insights ?? [],
    createDashboard: async (body) => {
      calls.push(`create dashboard ${body.name}`);
      nextId += 1;
      return { id: nextId, name: String(body.name) };
    },
    createInsight: async (body) => {
      calls.push(`create insight ${body.name}`);
      nextId += 1;
      return { id: nextId, name: String(body.name) };
    },
    updateDashboard: async (id, body) => {
      calls.push(`update dashboard ${id}`);
      return { id, name: String(body.name) };
    },
    updateInsight: async (id, body) => {
      calls.push(
        'dashboards' in body
          ? `wire insight ${id} -> ${JSON.stringify(body.dashboards)}`
          : `update insight ${id}`,
      );
      return { id, name: String(body.name ?? '') };
    },
    deleteDashboard: async (id) => {
      calls.push(`delete dashboard ${id}`);
    },
    deleteInsight: async (id) => {
      calls.push(`delete insight ${id}`);
    },
  };
}

test('computePlan matches by posthog_id then by unambiguous name and lists orphans', async () => {
  const root = await fixtureRoot();
  try {
    await writeJson(
      root,
      'insights/by-id.json',
      insight('by-id', 'Renamed locally', 42),
    );
    await writeJson(
      root,
      'insights/by-name.json',
      insight('by-name', 'Existing'),
    );
    await writeJson(
      root,
      'insights/ambiguous.json',
      insight('ambiguous', 'Twice'),
    );
    await writeJson(
      root,
      'insights/stale-id.json',
      insight('stale-id', 'Stale', 500),
    );
    await writeJson(root, 'insights/fresh.json', insight('fresh', 'Fresh'));
    const client = fakeClient({
      insights: [
        { id: 42, name: 'Old name' },
        { id: 77, name: 'Existing' },
        { id: 1, name: 'Twice' },
        { id: 2, name: 'Twice' },
        { id: 88, name: 'Stale' },
        { id: 99, name: 'Stray' },
      ],
    });

    const plan = await computePlan({ root, client });

    expect(plan.update.map((item) => [item.local.slug, item.remoteId])).toEqual(
      [
        ['by-id', 42],
        ['by-name', 77],
        ['stale-id', 88],
      ],
    );
    expect(plan.create.map((item) => item.local.slug)).toEqual([
      'ambiguous',
      'fresh',
    ]);
    expect(plan.orphan.map((item) => item.remote.id)).toEqual([1, 2, 99]);
    expect(client.calls).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('applyPlan creates insights before dashboards and never deletes without the flag', async () => {
  const root = await fixtureRoot();
  try {
    await writeJson(root, 'insights/i.json', insight('i', 'I'));
    await writeJson(root, 'dashboards/d.json', {
      slug: 'd',
      posthog_id: null,
      name: 'D',
      description: 'desc',
      tags: ['growth'],
      tiles: [{ insight: 'i' }],
    });
    const client = fakeClient({
      dashboards: [{ id: 5, name: 'Stray dashboard' }],
    });
    const plan = await computePlan({ root, client });

    const kept = await applyPlan({ root, client, plan });
    const keptCalls = [...client.calls];
    client.calls.length = 0;
    const deleted = await applyPlan({
      root,
      client,
      plan,
      deleteOrphans: true,
    });

    expect(kept.failed).toBe(0);
    expect(keptCalls).toEqual([
      'create insight I',
      'create dashboard D',
      'wire insight 1001 -> [1002]',
    ]);
    expect(client.calls).toContain('delete dashboard 5');
    expect(deleted.failed).toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('applyPlan writes back only posthog_id and dry runs never write', async () => {
  const root = await fixtureRoot();
  try {
    const raw = {
      slug: 'i',
      posthog_id: null,
      kind: 'trends',
      name: 'I',
      events: [{ event: '$pageview' }],
    };
    await writeJson(root, 'insights/i.json', raw);
    const client = fakeClient();
    const plan = await computePlan({ root, client });

    await applyPlan({ root, client, plan, dryRun: true });
    const afterDryRun = JSON.parse(
      await readFile(join(root, 'insights/i.json'), 'utf8'),
    );
    await applyPlan({ root, client, plan });
    const afterApply = JSON.parse(
      await readFile(join(root, 'insights/i.json'), 'utf8'),
    );

    expect(afterDryRun).toEqual(raw);
    expect(afterApply).toEqual({ ...raw, posthog_id: 1001 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('applyPlan wiring keeps manual memberships and detaches stale managed tiles', async () => {
  const root = await fixtureRoot();
  try {
    await writeJson(root, 'dashboards/d1.json', {
      slug: 'd1',
      posthog_id: 10,
      name: 'D1',
      description: '',
      tiles: [{ insight: 'i1' }],
    });
    await writeJson(root, 'insights/i1.json', insight('i1', 'I1', 1));
    const client = fakeClient({
      dashboards: [{ id: 10, name: 'D1' }],
      insights: [
        { id: 1, name: 'I1', dashboards: [99] },
        { id: 2, name: 'Stale', dashboards: [10, 99] },
        { id: 3, name: 'Manual', dashboards: [99] },
      ],
    });
    const plan = await computePlan({ root, client });

    const result = await applyPlan({ root, client, plan });

    expect(result.failed).toBe(0);
    expect(client.calls.filter((call) => call.startsWith('wire'))).toEqual([
      'wire insight 1 -> [99,10]',
      'wire insight 2 -> [99]',
    ]);
    expect(client.calls.some((call) => call.startsWith('delete'))).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('applyPlan refuses a dashboard tile that names an unknown insight', async () => {
  const root = await fixtureRoot();
  try {
    await writeJson(root, 'dashboards/d.json', {
      slug: 'd',
      posthog_id: null,
      name: 'D',
      description: '',
      tiles: [{ insight: 'missing' }],
    });
    const client = fakeClient();
    const plan = await computePlan({ root, client });

    const attempt = applyPlan({ root, client, plan });

    await expect(attempt).rejects.toThrow(/missing/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('sync --plan runs against a fake client, prints the plan and never writes', async () => {
  const root = await fixtureRoot();
  try {
    await writeJson(root, 'insights/i.json', insight('i', 'I'));
    const before = await readFile(join(root, 'insights/i.json'), 'utf8');
    const client = fakeClient({ insights: [{ id: 3, name: 'Stray' }] });
    const output: string[] = [];

    const code = await runSync({
      args: ['--plan'],
      root,
      client,
      log: (line) => output.push(line),
      error: (line) => output.push(line),
    });

    expect(code).toBe(0);
    expect(output.join('\n')).toMatch(/\[create\] {2}insight i/);
    expect(output.join('\n')).toMatch(
      /\[orphan\] {2}insight "Stray" \(posthog_id=3\)/,
    );
    expect(client.calls).toEqual([]);
    expect(await readFile(join(root, 'insights/i.json'), 'utf8')).toBe(before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('sync rejects unknown and conflicting flags', async () => {
  const output: string[] = [];
  const client = fakeClient();

  const codes = await Promise.all(
    [
      ['--plan', '--apply'],
      [],
      ['--plan', '--delete-orphans'],
      ['--bogus'],
    ].map((args) =>
      runSync({
        args,
        root: '/nonexistent',
        client,
        log: () => undefined,
        error: (line) => output.push(line),
      }),
    ),
  );

  expect(codes).toEqual([1, 1, 1, 1]);
  expect(client.calls).toEqual([]);
});

test('fetchAllPages follows next links and refuses a stalled page', async () => {
  const offsets: number[] = [];

  const rows = await fetchAllPages(async (offset, limit) => {
    offsets.push(offset);
    return {
      results: Array.from(
        { length: offset === 0 ? limit : 2 },
        (_, index) => offset + index,
      ),
      next: offset === 0 ? 'next' : null,
    };
  });
  const stalled = fetchAllPages(async () => ({ results: [], next: 'next' }));

  expect(rows).toHaveLength(102);
  expect(offsets).toEqual([0, 100]);
  await expect(stalled).rejects.toThrow(/did not advance/);
});

test('toPostHogInsight maps trends, filters and single or multiple breakdowns', () => {
  const single = toPostHogInsight({
    slug: 'x',
    posthog_id: null,
    kind: 'trends',
    name: 'X',
    description: 'd',
    events: [
      {
        event: 'marketing:cta_click',
        name: 'Clicks',
        math: 'total',
        properties: [{ key: 'surface', operator: 'is_set' }],
      },
    ],
    breakdown: 'cta_id',
    breakdown_limit: 20,
    interval: 'day',
    date_from: '-30d',
  });
  const multiple = toPostHogInsight({
    slug: 'ai',
    posthog_id: null,
    kind: 'trends',
    name: 'AI',
    description: '',
    events: [
      { event: 'marketing:ai_crawler_visit', math: 'total', properties: [] },
      { event: 'marketing:ai_referral_visit', math: 'total', properties: [] },
    ],
    breakdown: ['ai_crawler', 'ai_source'],
    interval: 'day',
    date_from: '-30d',
  });

  expect(single).toEqual({
    name: 'X',
    description: 'd',
    query: {
      kind: 'InsightVizNode',
      source: {
        kind: 'TrendsQuery',
        series: [
          {
            kind: 'EventsNode',
            event: 'marketing:cta_click',
            name: 'Clicks',
            custom_name: 'Clicks',
            math: 'total',
            properties: [{ key: 'surface', operator: 'is_set', type: 'event' }],
          },
        ],
        dateRange: { date_from: '-30d' },
        interval: 'day',
        trendsFilter: {},
        breakdownFilter: {
          breakdown_type: 'event',
          breakdown: 'cta_id',
          breakdown_limit: 20,
        },
      },
    },
  });
  expect(multiple).toMatchObject({
    query: {
      source: {
        breakdownFilter: {
          breakdowns: [
            { property: 'ai_crawler', type: 'event' },
            { property: 'ai_source', type: 'event' },
          ],
        },
      },
    },
  });
});

test('toPostHogDashboard drops slug, tiles and posthog_id', () => {
  const local = {
    slug: 'd',
    posthog_id: 3,
    name: 'D',
    description: 'x',
    tags: ['growth'],
    tiles: [{ insight: 'i' }],
  };

  const body = toPostHogDashboard(local);

  expect(body).toEqual({ name: 'D', description: 'x', tags: ['growth'] });
});
