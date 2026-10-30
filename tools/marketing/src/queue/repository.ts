import type { SqlExecutor } from '../growth.ts';
import type { WeekImport } from './schema.ts';
import type {
  BlogDraft,
  PostKind,
  QueuedPost,
  QueueDraft,
  QueuedWeek,
  Source,
} from './types.ts';

/** A blog post is leased this long before `scheduled_at`, to update its branch. */
export const BLOG_PREP_WINDOW_MS = 2 * 60 * 60 * 1000;
/** How long a lease holds a post before another tick may take it. */
export const LEASE_MS = 5 * 60 * 1000;
/** Failed attempts after which a post is `failed` instead of retried. */
export const MAX_ATTEMPTS = 3;

/**
 * A state change was refused because the post is no longer in a state that
 * allows it, for example a worker finishing a post that was held or cancelled
 * meanwhile. Nothing was changed; callers log it and move on.
 */
export class PostStateError extends Error {
  constructor(
    public readonly postId: string,
    message: string,
  ) {
    super(message);
    this.name = 'PostStateError';
  }
}

interface PostRow extends Record<string, unknown> {
  id: string;
  week_id: string;
  channel: QueuedPost['channel'];
  kind: PostKind;
  scheduled_at: Date;
  draft: QueueDraft;
  sources: Source[];
  depends_on: string | null;
  status: QueuedPost['status'];
  attempts: number;
  external_id: string | null;
  external_url: string | null;
  published_at: Date | null;
  last_error: string | null;
}

function toPost(row: PostRow): QueuedPost {
  return {
    id: row.id,
    weekId: row.week_id,
    channel: row.channel,
    kind: row.kind,
    scheduledAt: row.scheduled_at,
    draft: row.draft,
    sources: row.sources,
    dependsOn: row.depends_on,
    status: row.status,
    attempts: row.attempts,
    externalId: row.external_id,
    externalUrl: row.external_url,
    publishedAt: row.published_at,
    lastError: row.last_error,
  };
}

/**
 * Leases the posts that are due: `approved` posts whose time has come (blog
 * posts {@link BLOG_PREP_WINDOW_MS} early), whose dependency is published and
 * whose retry delay has passed, plus `publishing` posts whose lease expired.
 * One statement with `for update skip locked`, so concurrent ticks never
 * lease the same post.
 *
 * @param executor - The database.
 * @param now - The tick time.
 * @param limit - The most posts to lease.
 * @returns The leased posts, earliest first.
 */
export async function leaseDuePosts(
  executor: SqlExecutor,
  now: Date,
  limit: number,
): Promise<QueuedPost[]> {
  const { rows } = await executor.execute<PostRow>(
    `update marketing_posts
     set lease_until = $2::timestamptz
     where id in (
       select candidate.id
       from marketing_posts candidate
       where candidate.status in ('approved', 'publishing')
         and (candidate.lease_until is null or candidate.lease_until <= $1::timestamptz)
         and (candidate.next_attempt_at is null or candidate.next_attempt_at <= $1::timestamptz)
         and (
           candidate.depends_on is null
           or exists (
             select 1 from marketing_posts dependency
             where dependency.id = candidate.depends_on
               and dependency.status = 'published'
           )
         )
         and (
           candidate.scheduled_at <= $1::timestamptz
           or (
             candidate.channel = 'blog'
             and candidate.scheduled_at - ($3::int * interval '1 millisecond') <= $1::timestamptz
           )
         )
       order by candidate.scheduled_at, candidate.id
       limit $4::int
       for update of candidate skip locked
     )
     returning *`,
    [
      now.toISOString(),
      new Date(now.getTime() + LEASE_MS).toISOString(),
      BLOG_PREP_WINDOW_MS,
      limit,
    ],
  );
  return rows
    .map(toPost)
    .sort(
      (a, b) =>
        a.scheduledAt.getTime() - b.scheduledAt.getTime() ||
        a.id.localeCompare(b.id),
    );
}

async function requireUpdated(
  executor: SqlExecutor,
  id: string,
  sql: string,
  parameters: readonly unknown[],
  failure: string,
): Promise<void> {
  const { rows } = await executor.execute(sql, parameters);
  if (rows.length === 0) throw new PostStateError(id, failure);
}

/**
 * Marks a leased post as being published. The lease stays, so a crashed tick's
 * post is picked up again once it expires.
 *
 * @throws {PostStateError} When the post is not `approved` or `publishing`.
 */
export async function markPublishing(
  executor: SqlExecutor,
  id: string,
): Promise<void> {
  await requireUpdated(
    executor,
    id,
    `update marketing_posts set status = 'publishing'
     where id = $1::uuid and status in ('approved', 'publishing')
     returning id`,
    [id],
    `Post ${id} is not approved and cannot start publishing`,
  );
}

/**
 * Records a published post and releases its lease. A `held` post is accepted
 * (a hold can land while its publish was already in flight), a `cancelled`
 * one never is.
 *
 * @param result - Where the post lives. `warning` is a follow-up step that
 *   failed after the post went live (a LinkedIn first comment); it is stored
 *   as `last_error` on the published row, which is otherwise cleared.
 * @throws {PostStateError} When the post is missing or not `approved`,
 *   `publishing` or `held`; the row is left unchanged.
 */
export async function markPublished(
  executor: SqlExecutor,
  id: string,
  result: {
    externalId: string;
    externalUrl: string;
    publishedAt: Date;
    warning?: string;
  },
): Promise<void> {
  await requireUpdated(
    executor,
    id,
    `update marketing_posts
     set status = 'published', external_id = $2, external_url = $3,
         published_at = $4::timestamptz, last_error = $5, lease_until = null
     where id = $1::uuid and status in ('approved', 'publishing', 'held')
     returning id`,
    [
      id,
      result.externalId,
      result.externalUrl,
      result.publishedAt.toISOString(),
      result.warning ?? null,
    ],
    `Post ${id} cannot be marked published from its current status`,
  );
}

/**
 * Records a failed attempt. Under {@link MAX_ATTEMPTS} the post goes back to
 * `approved` with a `2^attempts` minute delay; otherwise it is `failed`. Either
 * way the lease is released.
 *
 * @param now - The time the attempt failed.
 * @returns Whether the post will be retried.
 * @throws {PostStateError} When the post is not `approved` or `publishing`
 *   (for example it was held or cancelled meanwhile); the row is unchanged.
 */
export async function markRetry(
  executor: SqlExecutor,
  id: string,
  error: string,
  now: Date,
): Promise<'retry' | 'failed'> {
  const { rows } = await executor.execute<{ status: string }>(
    `update marketing_posts
     set attempts = attempts + 1,
         last_error = $2,
         lease_until = null,
         status = case when attempts + 1 < $3::int then 'approved' else 'failed' end,
         next_attempt_at = case
           when attempts + 1 < $3::int
           then $4::timestamptz + power(2, attempts + 1) * interval '1 minute'
           else next_attempt_at
         end
     where id = $1::uuid and status in ('approved', 'publishing')
     returning status`,
    [id, error, MAX_ATTEMPTS, now.toISOString()],
  );
  const [row] = rows;
  if (!row) {
    throw new PostStateError(
      id,
      `Post ${id} is not approved or publishing and cannot be retried`,
    );
  }
  return row.status === 'failed' ? 'failed' : 'retry';
}

/**
 * Fails a post without retrying and releases its lease.
 *
 * @throws {PostStateError} When the post is not `approved` or `publishing`;
 *   the row is unchanged.
 */
export async function markFailed(
  executor: SqlExecutor,
  id: string,
  error: string,
): Promise<void> {
  await requireUpdated(
    executor,
    id,
    `update marketing_posts
     set status = 'failed', last_error = $2, lease_until = null
     where id = $1::uuid and status in ('approved', 'publishing')
     returning id`,
    [id, error],
    `Post ${id} is not approved or publishing and cannot be failed`,
  );
}

/**
 * Holds a post and every post that depends on it, directly or not, and
 * releases their leases. Cancelled posts stay cancelled, and a dependent that
 * already published is left alone; the named post is held whatever its status,
 * so a blog that merged but never went live can be held.
 *
 * @param reason - Stored as each held post's `last_error`.
 * @returns The ids of the held posts, the named post first.
 */
export async function holdWithDependents(
  executor: SqlExecutor,
  id: string,
  reason: string,
): Promise<string[]> {
  const { rows } = await executor.execute<{ id: string }>(
    `with recursive tree as (
       select id from marketing_posts where id = $1::uuid
       union
       select child.id
       from marketing_posts child
       join tree on child.depends_on = tree.id
     )
     update marketing_posts
     set status = 'held', last_error = $2, lease_until = null
     where id in (select id from tree)
       and status <> 'cancelled'
       and (id = $1::uuid or status <> 'published')
     returning id`,
    [id, reason],
  );
  return [
    ...rows.filter((row) => row.id === id),
    ...rows.filter((row) => row.id !== id),
  ].map((row) => row.id);
}

/**
 * Merges blog fields (PR number, branch and merge times) into a blog post's
 * draft. The status is untouched: this records progress, not an edit.
 *
 * @throws When the post is not a blog post.
 */
export async function updateBlogDraft(
  executor: SqlExecutor,
  id: string,
  patch: Partial<BlogDraft>,
): Promise<void> {
  await requireUpdated(
    executor,
    id,
    `update marketing_posts
     set draft = draft || $2::jsonb
     where id = $1::uuid and channel = 'blog'
     returning id`,
    [id, JSON.stringify(patch)],
    `Post ${id} is not a blog post`,
  );
}

/**
 * Edits a post. An `approved` post goes back to `draft`, so an edit is always
 * re-approved.
 *
 * @throws When the post is missing or `published`, `publishing` or `cancelled`.
 */
export async function updatePostDraft(
  executor: SqlExecutor,
  id: string,
  patch: {
    draft?: QueueDraft;
    scheduledAt?: Date;
    kind?: PostKind;
    sources?: Source[];
  },
): Promise<void> {
  const { rows } = await executor.execute(
    `update marketing_posts
     set draft = coalesce($2::jsonb, draft),
         scheduled_at = coalesce($3::timestamptz, scheduled_at),
         kind = coalesce($4, kind),
         sources = coalesce($5::jsonb, sources),
         status = case when status = 'approved' then 'draft' else status end
     where id = $1::uuid and status not in ('published', 'publishing', 'cancelled')
     returning id`,
    [
      id,
      patch.draft === undefined ? null : JSON.stringify(patch.draft),
      patch.scheduledAt?.toISOString() ?? null,
      patch.kind ?? null,
      patch.sources === undefined ? null : JSON.stringify(patch.sources),
    ],
  );
  if (rows.length > 0) return;

  const { rows: found } = await executor.execute<{ status: string }>(
    'select status from marketing_posts where id = $1::uuid',
    [id],
  );
  throw new Error(
    found[0]
      ? `Post ${id} is ${found[0].status} and cannot be edited`
      : `Post ${id} does not exist`,
  );
}

/**
 * Approves posts of a week. Without `postId`, every `draft` post is approved
 * (held, failed and cancelled posts are skipped) and the week is approved too.
 * With `postId`, that post is approved when it is `draft`, `held` or `failed`,
 * which is how an operator releases a hold or retries a failure. Approval
 * resets `attempts`, `next_attempt_at`, `lease_until` and `last_error`.
 *
 * @returns The number of posts approved.
 */
export async function approvePosts(
  executor: SqlExecutor,
  weekId: string,
  postId?: string,
): Promise<number> {
  return executor.transaction(async (tx) => {
    const { rows } = await tx.execute(
      `update marketing_posts
       set status = 'approved', attempts = 0, next_attempt_at = null,
           lease_until = null, last_error = null
       where week_id = $1::uuid
         and (
           ($2::uuid is null and status = 'draft')
           or (id = $2::uuid and status in ('draft', 'held', 'failed'))
         )
       returning id`,
      [weekId, postId ?? null],
    );
    if (postId === undefined) {
      await tx.execute(
        `update marketing_weeks set status = 'approved', approved_at = now()
         where id = $1::uuid`,
        [weekId],
      );
    }
    return rows.length;
  });
}

/**
 * Holds or cancels a post that is not yet publishing or published, and
 * releases its lease.
 *
 * @throws When the post is missing, publishing or published.
 */
export async function setPostStatus(
  executor: SqlExecutor,
  id: string,
  status: 'held' | 'cancelled',
): Promise<void> {
  await requireUpdated(
    executor,
    id,
    `update marketing_posts set status = $2, lease_until = null
     where id = $1::uuid and status not in ('publishing', 'published')
     returning id`,
    [id, status],
    `Post ${id} is missing, publishing or published and cannot be ${status}`,
  );
}

/**
 * Writes a week's drafts. An existing week keeps its row and has its `draft`
 * posts replaced.
 *
 * @returns The week id and each post's id by import key.
 * @throws When the week already has a post past `draft`.
 */
export async function importWeek(
  executor: SqlExecutor,
  week: WeekImport,
): Promise<{ weekId: string; postIds: Record<string, string> }> {
  return executor.transaction(async (tx) => {
    const { rows: weekRows } = await tx.execute<{ id: string }>(
      `insert into marketing_weeks (week_start, research_brief)
       values ($1::date, $2::jsonb)
       on conflict (week_start) do update
         set research_brief = excluded.research_brief,
             status = 'draft',
             approved_at = null
       returning id`,
      [week.weekStart, JSON.stringify(week.researchBrief)],
    );
    const weekId = weekRows[0]?.id;
    if (!weekId) throw new Error('marketing_weeks upsert returned no row');

    // The upsert holds the week row lock, so a concurrent import waits here.
    const { rows: past } = await tx.execute(
      `select 1 from marketing_posts
       where week_id = $1::uuid and status <> 'draft' limit 1`,
      [weekId],
    );
    if (past.length > 0) {
      throw new Error(
        `Week ${week.weekStart} has a post past draft and cannot be re-imported`,
      );
    }
    await tx.execute(
      `delete from marketing_posts where week_id = $1::uuid and status = 'draft'`,
      [weekId],
    );

    const postIds: Record<string, string> = {};
    for (const post of week.posts) {
      const { rows } = await tx.execute<{ id: string }>(
        `insert into marketing_posts (week_id, channel, kind, scheduled_at, draft, sources)
         values ($1::uuid, $2, $3, $4::timestamptz, $5::jsonb, $6::jsonb)
         returning id`,
        [
          weekId,
          post.channel,
          post.kind,
          post.scheduledAt,
          JSON.stringify(post.draft),
          JSON.stringify(post.sources),
        ],
      );
      const id = rows[0]?.id;
      if (!id) throw new Error('marketing_posts insert returned no row');
      postIds[post.key] = id;
    }
    for (const post of week.posts) {
      if (post.dependsOnKey === undefined) continue;
      await tx.execute(
        'update marketing_posts set depends_on = $2::uuid where id = $1::uuid',
        [postIds[post.key], postIds[post.dependsOnKey]],
      );
    }
    return { weekId, postIds };
  });
}

/**
 * Reads a week and its posts.
 *
 * @param weekStart - The week's Monday, `YYYY-MM-DD`.
 * @returns The week with its posts by schedule, or `undefined` when none.
 */
export async function readWeek(
  executor: SqlExecutor,
  weekStart: string,
): Promise<{ week: QueuedWeek; posts: QueuedPost[] } | undefined> {
  const { rows } = await executor.execute<{
    id: string;
    week_start: string;
    status: QueuedWeek['status'];
    research_brief: Record<string, unknown>;
    approved_at: Date | null;
  }>(
    `select id, to_char(week_start, 'YYYY-MM-DD') as week_start, status,
            research_brief, approved_at
     from marketing_weeks where week_start = $1::date`,
    [weekStart],
  );
  const [row] = rows;
  if (!row) return undefined;

  const { rows: postRows } = await executor.execute<PostRow>(
    `select * from marketing_posts where week_id = $1::uuid
     order by scheduled_at, created_at, id`,
    [row.id],
  );
  return {
    week: {
      id: row.id,
      weekStart: row.week_start,
      status: row.status,
      researchBrief: row.research_brief,
      approvedAt: row.approved_at,
    },
    posts: postRows.map(toPost),
  };
}

/**
 * Reads one post.
 *
 * @returns The post, or `undefined` when none has this id.
 */
export async function readPost(
  executor: SqlExecutor,
  id: string,
): Promise<QueuedPost | undefined> {
  const { rows } = await executor.execute<PostRow>(
    'select * from marketing_posts where id = $1::uuid',
    [id],
  );
  return rows[0] ? toPost(rows[0]) : undefined;
}

/**
 * Lists the posts in any of the given statuses across all weeks, by schedule.
 */
export async function listPostsByStatus(
  executor: SqlExecutor,
  statuses: readonly QueuedPost['status'][],
): Promise<QueuedPost[]> {
  const { rows } = await executor.execute<PostRow>(
    `select * from marketing_posts where status = any($1::text[])
     order by scheduled_at, created_at, id`,
    [statuses],
  );
  return rows.map(toPost);
}

/**
 * Lists the published posts that carry a warning (a non-null `last_error`)
 * and were published at or after `since`, across all weeks, by publish time.
 */
export async function listPublishedWithWarnings(
  executor: SqlExecutor,
  since: Date,
): Promise<QueuedPost[]> {
  const { rows } = await executor.execute<PostRow>(
    `select * from marketing_posts
     where status = 'published' and last_error is not null
       and published_at >= $1::timestamptz
     order by published_at, id`,
    [since.toISOString()],
  );
  return rows.map(toPost);
}
