/**
 * Dashboards as code: reconciles `dashboards/*.json` and `insights/*.json`
 * with PostHog. `--plan` only reads. `--apply` creates and updates, writes
 * new PostHog ids back into the JSON, and deletes nothing unless
 * `--delete-orphans` is also given.
 */
import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPosthogClient, type PosthogClient } from './client.ts';
import {
  type DashboardLocal,
  type InsightLocal,
  parseDashboard,
  parseInsight,
} from './schema.ts';

/** A dashboard as PostHog lists it; only the fields the sync reads. */
export interface RemoteDashboard {
  id: number;
  name: string;
}

/** An insight as PostHog lists it; only the fields the sync reads. */
export interface RemoteInsight {
  id: number;
  name: string;
  /** Ids of the dashboards the insight is a tile on. */
  dashboards?: number[];
}

/** A JSON request body. */
export type JsonBody = Record<string, unknown>;

/** The PostHog operations the sync needs; faked in tests. */
export interface SyncClient {
  listDashboards(): Promise<RemoteDashboard[]>;
  listInsights(): Promise<RemoteInsight[]>;
  createDashboard(body: JsonBody): Promise<RemoteDashboard>;
  createInsight(body: JsonBody): Promise<RemoteInsight>;
  updateDashboard(id: number, body: JsonBody): Promise<RemoteDashboard>;
  updateInsight(id: number, body: JsonBody): Promise<RemoteInsight>;
  deleteDashboard(id: number): Promise<void>;
  deleteInsight(id: number): Promise<void>;
}

/** The two kinds of managed artifact. */
export type Kind = 'dashboard' | 'insight';

/** A local artifact with its parsed value and repo-relative path. */
export type LocalItem =
  | { kind: 'dashboard'; local: DashboardLocal; path: string }
  | { kind: 'insight'; local: InsightLocal; path: string };

/** A local artifact matched to a remote one. */
export type UpdateItem = LocalItem & { remoteId: number };

/** A remote artifact with no local JSON. */
export interface OrphanItem {
  kind: Kind;
  remote: { id: number; name: string };
}

/** What `--apply` would do. */
export interface SyncPlan {
  create: LocalItem[];
  update: UpdateItem[];
  orphan: OrphanItem[];
}

async function loadLocal<T>(
  root: string,
  subdir: string,
  parse: (value: unknown) => T,
): Promise<Array<{ value: T; path: string }>> {
  let files: string[];
  try {
    files = (await readdir(join(root, subdir)))
      .filter((f) => f.endsWith('.json'))
      .sort();
  } catch {
    return [];
  }
  return Promise.all(
    files.map(async (file) => {
      const path = join(subdir, file);
      try {
        return {
          value: parse(JSON.parse(await readFile(join(root, path), 'utf8'))),
          path,
        };
      } catch (err) {
        throw new Error(
          `${path}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }),
  );
}

/** Loads and validates every committed dashboard. */
export function loadDashboards(root: string) {
  return loadLocal(root, 'dashboards', parseDashboard);
}

/** Loads and validates every committed insight. */
export function loadInsights(root: string) {
  return loadLocal(root, 'insights', parseInsight);
}

/**
 * The remote artifact a local one corresponds to: the one with its
 * `posthog_id`, otherwise the only one with its name. Several remotes sharing
 * the name are ambiguous: the local one is created and they become orphans.
 */
function matchRemote<R extends { id: number; name: string }>(
  local: { posthog_id: number | null; name: string },
  remotes: readonly R[],
): { remote: R | null; ambiguous: R[] } {
  if (local.posthog_id !== null) {
    const byId = remotes.find((remote) => remote.id === local.posthog_id);
    if (byId) return { remote: byId, ambiguous: [] };
  }
  const named = remotes.filter((remote) => remote.name === local.name);
  if (named.length === 1) return { remote: named[0], ambiguous: [] };
  return { remote: null, ambiguous: named };
}

/**
 * Compares local JSON with PostHog. Never writes.
 *
 * @param options.root - Directory holding `dashboards/` and `insights/`.
 * @param options.client - PostHog operations.
 * @returns Creates, updates and orphans, in file and listing order.
 */
export async function computePlan({
  root,
  client,
}: {
  root: string;
  client: SyncClient;
}): Promise<SyncPlan> {
  const dashboards = await loadDashboards(root);
  const insights = await loadInsights(root);
  const remoteDashboards = await client.listDashboards();
  const remoteInsights = await client.listInsights();
  const plan: SyncPlan = { create: [], update: [], orphan: [] };

  const reconcile = (
    items: LocalItem[],
    remotes: ReadonlyArray<{ id: number; name: string }>,
    kind: Kind,
  ) => {
    const claimed = new Set<number>();
    for (const item of items) {
      const { remote, ambiguous } = matchRemote(item.local, remotes);
      if (remote) {
        plan.update.push({ ...item, remoteId: remote.id });
        claimed.add(remote.id);
        continue;
      }
      plan.create.push(item);
      for (const duplicate of ambiguous) {
        if (claimed.has(duplicate.id)) continue;
        plan.orphan.push({
          kind,
          remote: { id: duplicate.id, name: duplicate.name },
        });
        claimed.add(duplicate.id);
      }
    }
    for (const remote of remotes) {
      if (!claimed.has(remote.id))
        plan.orphan.push({
          kind,
          remote: { id: remote.id, name: remote.name },
        });
    }
  };

  reconcile(
    dashboards.map(({ value, path }) => ({
      kind: 'dashboard' as const,
      local: value,
      path,
    })),
    remoteDashboards,
    'dashboard',
  );
  reconcile(
    insights.map(({ value, path }) => ({
      kind: 'insight' as const,
      local: value,
      path,
    })),
    remoteInsights,
    'insight',
  );
  return plan;
}

/**
 * The PostHog body for an insight: an `InsightVizNode` wrapping a
 * `TrendsQuery` or `FunnelsQuery`.
 *
 * @param local - A parsed insight.
 * @returns The create/update body.
 */
export function toPostHogInsight(local: InsightLocal) {
  const base = { name: local.name, description: local.description };
  const dateRange = { date_from: local.date_from };

  if (local.kind === 'funnel') {
    return {
      ...base,
      query: {
        kind: 'InsightVizNode',
        source: {
          kind: 'FunnelsQuery',
          series: (local.steps ?? []).map((step) => ({
            kind: 'EventsNode',
            event: step.event,
            name: step.name ?? step.event,
            math: 'total',
          })),
          dateRange,
          funnelsFilter: {
            funnelWindowInterval: local.window_minutes ?? 60,
            funnelWindowIntervalUnit: 'minute',
          },
        },
      },
    };
  }

  const breakdowns =
    local.breakdown === undefined ? [] : [local.breakdown].flat();
  const limit =
    local.breakdown_limit === undefined
      ? {}
      : { breakdown_limit: local.breakdown_limit };
  const breakdownFilter =
    typeof local.breakdown === 'string'
      ? {
          breakdownFilter: {
            breakdown_type: 'event',
            breakdown: local.breakdown,
            ...limit,
          },
        }
      : breakdowns.length > 0
        ? {
            breakdownFilter: {
              breakdowns: breakdowns.map((property) => ({
                property,
                type: 'event',
              })),
              ...limit,
            },
          }
        : {};

  return {
    ...base,
    query: {
      kind: 'InsightVizNode',
      source: {
        kind: 'TrendsQuery',
        series: local.events.map((series) => ({
          kind: 'EventsNode',
          event: series.event,
          name: series.name ?? series.event,
          ...(series.name ? { custom_name: series.name } : {}),
          math: series.math,
          properties: series.properties.map((filter) => ({
            ...filter,
            type: 'event',
          })),
        })),
        dateRange,
        interval: local.interval,
        trendsFilter: {},
        ...breakdownFilter,
      },
    },
  };
}

/**
 * The PostHog body for a dashboard. Tiles are read-only in the dashboard API;
 * the wiring pass sets each insight's `dashboards` instead.
 *
 * @param local - A parsed dashboard.
 * @returns The create/update body.
 */
export function toPostHogDashboard(local: DashboardLocal) {
  return { name: local.name, description: local.description, tags: local.tags };
}

/** Outcome of {@link applyPlan}. */
export interface ApplyResult {
  applied: number;
  failed: number;
  errors: Array<{ kind: Kind; slug: string; error: string }>;
}

/** Options for {@link applyPlan}. */
export interface ApplyOptions {
  root: string;
  client: SyncClient;
  plan: SyncPlan;
  /** Validate only; no request and no file write. */
  dryRun?: boolean;
  /** Also delete orphans. Never implied. */
  deleteOrphans?: boolean;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Sets `posthog_id` in a committed JSON file and changes nothing else. */
async function writeBackId(path: string, id: number): Promise<void> {
  const raw = JSON.parse(await readFile(path, 'utf8')) as Record<
    string,
    unknown
  >;
  const tmp = `${path}.tmp`;
  await writeFile(
    tmp,
    `${JSON.stringify({ ...raw, posthog_id: id }, null, 2)}\n`,
    'utf8',
  );
  await rename(tmp, path);
}

/**
 * Applies a plan: insights first, then dashboards, then dashboard membership
 * ("wiring"), then — only with `deleteOrphans` — orphan deletion. A failed
 * request is recorded and the rest continue; a tile naming an unknown insight
 * is a data error and throws before any dashboard is written.
 *
 * @param options - See {@link ApplyOptions}.
 * @returns Counts and per-item errors.
 */
export async function applyPlan(options: ApplyOptions): Promise<ApplyResult> {
  const { root, client, plan, dryRun = false, deleteOrphans = false } = options;
  const result: ApplyResult = { applied: 0, failed: 0, errors: [] };
  const insightIds = new Map<string, number>();
  const dashboardIds = new Map<string, number>();
  const createdInsightIds = new Set<number>();
  const record = (kind: Kind, slug: string, err: unknown) => {
    result.failed += 1;
    result.errors.push({ kind, slug, error: message(err) });
  };

  for (const item of plan.update) {
    (item.kind === 'insight' ? insightIds : dashboardIds).set(
      item.local.slug,
      item.remoteId,
    );
  }
  const knownInsightSlugs = new Set([
    ...plan.create
      .filter((item) => item.kind === 'insight')
      .map((item) => item.local.slug),
    ...insightIds.keys(),
  ]);
  for (const item of [...plan.create, ...plan.update]) {
    if (item.kind !== 'dashboard') continue;
    for (const tile of item.local.tiles) {
      if (!knownInsightSlugs.has(tile.insight)) {
        throw new Error(
          `dashboards/${item.local.slug}.json references unknown insight "${tile.insight}"`,
        );
      }
    }
  }
  if (dryRun) return result;

  for (const kind of ['insight', 'dashboard'] as const) {
    for (const item of plan.create) {
      if (item.kind !== kind) continue;
      try {
        const created =
          item.kind === 'insight'
            ? await client.createInsight(toPostHogInsight(item.local))
            : await client.createDashboard(toPostHogDashboard(item.local));
        if (item.kind === 'insight') {
          insightIds.set(item.local.slug, created.id);
          createdInsightIds.add(created.id);
        } else {
          dashboardIds.set(item.local.slug, created.id);
        }
        await writeBackId(join(root, item.path), created.id);
        result.applied += 1;
      } catch (err) {
        record(item.kind, item.local.slug, err);
      }
    }
    for (const item of plan.update) {
      if (item.kind !== kind) continue;
      try {
        if (item.kind === 'insight')
          await client.updateInsight(
            item.remoteId,
            toPostHogInsight(item.local),
          );
        else
          await client.updateDashboard(
            item.remoteId,
            toPostHogDashboard(item.local),
          );
        result.applied += 1;
      } catch (err) {
        record(item.kind, item.local.slug, err);
      }
    }
  }

  if (dashboardIds.size > 0) {
    try {
      await wireDashboards({
        root,
        client,
        insightIds,
        dashboardIds,
        createdInsightIds,
        record,
      });
    } catch (err) {
      record('dashboard', '(wiring)', err);
    }
  }

  if (deleteOrphans) {
    for (const orphan of plan.orphan) {
      try {
        if (orphan.kind === 'insight')
          await client.deleteInsight(orphan.remote.id);
        else await client.deleteDashboard(orphan.remote.id);
      } catch (err) {
        record(orphan.kind, `(orphan id=${orphan.remote.id})`, err);
      }
    }
  }
  return result;
}

/**
 * Reconciles memberships in repository-managed dashboards only. Memberships
 * in any other dashboard are preserved, including on insights the repository
 * does not track. Reads memberships after the metadata writes rather than
 * trusting the plan's snapshot.
 */
async function wireDashboards({
  root,
  client,
  insightIds,
  dashboardIds,
  createdInsightIds,
  record,
}: {
  root: string;
  client: SyncClient;
  insightIds: ReadonlyMap<string, number>;
  dashboardIds: ReadonlyMap<string, number>;
  createdInsightIds: ReadonlySet<number>;
  record: (kind: Kind, slug: string, err: unknown) => void;
}): Promise<void> {
  const managed = new Set(dashboardIds.values());
  const desired = new Map<number, number[]>();
  for (const { value: dashboard } of await loadDashboards(root)) {
    const dashboardId = dashboardIds.get(dashboard.slug);
    if (dashboardId === undefined) continue;
    for (const tile of dashboard.tiles) {
      const insightId = insightIds.get(tile.insight);
      if (insightId === undefined)
        throw new Error(`Insight ${tile.insight} has no PostHog id`);
      const memberships = desired.get(insightId) ?? [];
      if (!memberships.includes(dashboardId)) memberships.push(dashboardId);
      desired.set(insightId, memberships);
    }
  }

  const current = new Map(
    (await client.listInsights()).map((insight) => [insight.id, insight]),
  );
  for (const id of desired.keys()) {
    if (current.has(id)) continue;
    if (!createdInsightIds.has(id))
      throw new Error(`Cannot read memberships for insight ${id}`);
    current.set(id, { id, name: `insight ${id}`, dashboards: [] });
  }

  for (const insight of current.values()) {
    if (!Array.isArray(insight.dashboards))
      throw new Error(`Cannot read memberships for insight ${insight.id}`);
    const before = insight.dashboards;
    const after = [
      ...new Set([
        ...before.filter((id) => !managed.has(id)),
        ...(desired.get(insight.id) ?? []),
      ]),
    ];
    if (
      before.length === after.length &&
      before.every((id) => after.includes(id))
    )
      continue;
    try {
      await client.updateInsight(insight.id, { dashboards: after });
    } catch (err) {
      record('insight', `${insight.name} (wiring)`, err);
    }
  }
}

/**
 * Reads every page of a PostHog list endpoint.
 *
 * @param fetchPage - Fetches one page at an offset.
 * @returns Every result, in order.
 * @throws When a page is malformed or pagination does not advance.
 */
export async function fetchAllPages<T>(
  fetchPage: (
    offset: number,
    limit: number,
  ) => Promise<{ results?: T[]; next?: string | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const page = await fetchPage(rows.length, 100);
    if (!Array.isArray(page.results))
      throw new Error('Invalid PostHog list response');
    rows.push(...page.results);
    if (!page.next) return rows;
    if (page.results.length === 0)
      throw new Error('PostHog pagination did not advance');
  }
}

/**
 * Adapts a {@link PosthogClient} to {@link SyncClient}. PostHog refuses hard
 * deletes of dashboards and insights, so deletion is a soft delete
 * (`PATCH { deleted: true }`).
 *
 * @param client - The HTTP client.
 * @returns The sync operations.
 */
export function createSyncClient(client: PosthogClient): SyncClient {
  const listAll = <T>(path: string) =>
    fetchAllPages<T>((offset, limit) => client.get(path, { limit, offset }));
  return {
    listDashboards: () => listAll<RemoteDashboard>('/dashboards/'),
    listInsights: () => listAll<RemoteInsight>('/insights/'),
    createDashboard: (body) =>
      client.post<RemoteDashboard>('/dashboards/', body),
    createInsight: (body) => client.post<RemoteInsight>('/insights/', body),
    updateDashboard: (id, body) =>
      client.patch<RemoteDashboard>(`/dashboards/${id}/`, body),
    updateInsight: (id, body) =>
      client.patch<RemoteInsight>(`/insights/${id}/`, body),
    deleteDashboard: async (id) => {
      await client.patch(`/dashboards/${id}/`, { deleted: true });
    },
    deleteInsight: async (id) => {
      await client.patch(`/insights/${id}/`, { deleted: true });
    },
  };
}

/**
 * One line per planned action.
 *
 * @param plan - The plan.
 * @returns Printable text.
 */
export function formatPlan(plan: SyncPlan): string {
  const lines = [
    ...plan.create.map((item) => `[create]  ${item.kind} ${item.local.slug}`),
    ...plan.update.map(
      (item) =>
        `[update]  ${item.kind} ${item.local.slug}  (posthog_id=${item.remoteId})`,
    ),
    ...plan.orphan.map(
      (item) =>
        `[orphan]  ${item.kind} "${item.remote.name}" (posthog_id=${item.remote.id})`,
    ),
  ];
  return lines.length > 0 ? lines.join('\n') : '(nothing to do)';
}

/** Options for {@link runSync}. */
export interface RunSyncOptions {
  args: readonly string[];
  /** Directory holding `dashboards/` and `insights/`. */
  root: string;
  /** Lazily built so a bad flag fails before the environment is read. */
  client: SyncClient | (() => SyncClient);
  log: (line: string) => void;
  error: (line: string) => void;
}

const USAGE = 'Usage: sync.ts (--plan | --apply [--delete-orphans])';

/**
 * The `sync:plan` / `sync:apply` command.
 *
 * @param options - Arguments, root, client and output sinks.
 * @returns The process exit code.
 */
export async function runSync(options: RunSyncOptions): Promise<number> {
  const { args, root, log, error } = options;
  const known = new Set(['--plan', '--apply', '--delete-orphans']);
  const unknown = args.filter((arg) => !known.has(arg));
  const wantPlan = args.includes('--plan');
  const wantApply = args.includes('--apply');
  const deleteOrphans = args.includes('--delete-orphans');
  if (
    unknown.length > 0 ||
    wantPlan === wantApply ||
    (deleteOrphans && !wantApply)
  ) {
    if (unknown.length > 0) error(`Unknown argument: ${unknown.join(' ')}`);
    error(USAGE);
    return 1;
  }

  let plan: SyncPlan;
  let client: SyncClient;
  try {
    client =
      typeof options.client === 'function' ? options.client() : options.client;
    plan = await computePlan({ root, client });
  } catch (err) {
    error(`Plan failed: ${message(err)}`);
    return 1;
  }
  log(formatPlan(plan));
  if (wantPlan) return 0;

  let result: ApplyResult;
  try {
    result = await applyPlan({ root, client, plan, deleteOrphans });
  } catch (err) {
    error(`Apply failed: ${message(err)}`);
    return 1;
  }
  log(`\napplied: ${result.applied}, failed: ${result.failed}`);
  for (const failure of result.errors)
    error(`  ${failure.kind} ${failure.slug}: ${failure.error}`);
  if (plan.create.length > 0) {
    log(
      '\nNew posthog_id values were written back. Commit tools/posthog/{dashboards,insights}/.',
    );
  }
  return result.errors.length > 0 ? 1 : 0;
}

const entry = process.argv[1];
if (entry && pathToFileURL(resolve(entry)).href === import.meta.url) {
  runSync({
    args: process.argv.slice(2),
    root: dirname(fileURLToPath(import.meta.url)),
    client: () => createSyncClient(createPosthogClient()),
    log: (line) => console.log(line),
    error: (line) => console.error(line),
  }).then((code) => process.exit(code));
}
