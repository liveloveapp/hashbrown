import type { SqlExecutor } from '../database.ts';
import {
  type IdentityScope,
  ObservationError,
  type ObservationSource,
  uuid,
} from './contracts.ts';

/** One observation on a subject's timeline with its processing state and fact. */
export type TimelineObservation = {
  id: string;
  source: ObservationSource;
  kind: string;
  session_id: string | null;
  collector_version: string;
  identity_scope: IdentityScope;
  occurred_at: Date;
  received_at: Date;
  trust: 'client_reported' | 'server_verified';
  properties: Record<string, string>;
  identity_redacted: boolean;
  processing_status: 'pending' | 'leased' | 'completed' | 'failed';
  last_error_code: string | null;
  projection_version: string | null;
  active_day: Date | string | null;
  milestone_kind: string | null;
};

/** The private identity stored for one observation. */
export type ObservationIdentityRow = {
  email_normalized: string | null;
  git_display_name: string | null;
  git_config_origin: string | null;
  repository_provider: string | null;
  repository_owner: string | null;
};

/**
 * Reads one subject's observations in `(received_at, id)` order, keyset
 * paginated. The cursor is a base64url JSON `[receivedAtIso, id]` of at most
 * 300 characters.
 *
 * @param db - The growth database executor.
 * @param subjectId - The subject row id.
 * @param input - Page size (1..100, default 100) and the previous page's cursor.
 * @returns The page of events and the next cursor, or `null` on the last page.
 * @throws ObservationError `invalid_payload` (bad id or limit) or `invalid_cursor`.
 */
export async function readTimeline(
  db: SqlExecutor,
  subjectId: string,
  input: { limit?: number; cursor?: string } = {},
): Promise<{
  subjectId: string;
  events: TimelineObservation[];
  nextCursor: string | null;
}> {
  uuid(subjectId);
  const limit = input.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new ObservationError('invalid_payload');
  let cursorTime: Date | null = null,
    cursorId: string | null = null;
  if (input.cursor) {
    try {
      if (input.cursor.length > 300) throw new Error();
      const decoded = JSON.parse(
        Buffer.from(input.cursor, 'base64url').toString('utf8'),
      );
      if (!Array.isArray(decoded) || decoded.length !== 2) throw new Error();
      cursorTime = new Date(decoded[0]);
      cursorId = uuid(decoded[1]);
      if (!Number.isFinite(cursorTime.getTime())) throw new Error();
    } catch {
      throw new ObservationError('invalid_cursor');
    }
  }
  const rows = await db.execute<TimelineObservation>(
    `/* growth:observation-read-timeline */ select o.id,o.source,o.kind,o.session_id,o.collector_version,o.identity_scope,o.occurred_at,o.received_at,o.trust,o.properties,
    o.redacted_at is not null as identity_redacted,w.status as processing_status,w.last_error_code,f.projection_version,f.active_day,f.milestone_kind
    from growth_observations o join growth_observation_work w on w.observation_id=o.id
    left join growth_observation_facts f on f.observation_id=o.id
    where o.subject_id=$1 and ($2::timestamptz is null or (o.received_at,o.id)>($2,$3::uuid))
    order by o.received_at,o.id limit $4`,
    [subjectId, cursorTime, cursorId, limit + 1],
  );
  const events = rows.rows.slice(0, limit);
  const last = events.at(-1);
  const nextCursor =
    rows.rows.length > limit && last
      ? Buffer.from(
          JSON.stringify([new Date(last.received_at).toISOString(), last.id]),
        ).toString('base64url')
      : null;
  return { subjectId, events, nextCursor };
}

/**
 * Reads the private identity stored for one observation. Operator-only: the
 * result can contain an email address.
 *
 * @param db - The growth database executor.
 * @param observationId - The observation row id.
 * @returns The identity row, or `null` when none is stored (or it was redacted).
 * @throws ObservationError `invalid_payload` for a bad id.
 */
export async function readObservationIdentity(
  db: SqlExecutor,
  observationId: string,
): Promise<ObservationIdentityRow | null> {
  uuid(observationId);
  const rows = await db.execute<ObservationIdentityRow>(
    `/* growth:observation-read-identity */ select email_normalized,git_display_name,git_config_origin,repository_provider,repository_owner from growth_observation_identities where observation_id=$1`,
    [observationId],
  );
  return rows.rows[0] ?? null;
}

/**
 * Reports observation health: activity received in `[from, to)` grouped by
 * source, kind, collector version, and install environment, plus the current
 * projection work queue. Ingress rejections are only in service logs.
 *
 * @param db - The growth database executor.
 * @param input - The receipt window; `to` after `from`, at most 31 days.
 * @returns The window, activity rows, queue rows, and where ingress failures live.
 * @throws ObservationError `invalid_payload` for a bad window.
 */
export async function readObservationHealth(
  db: SqlExecutor,
  input: { from: Date; to: Date },
): Promise<{
  from: string;
  to: string;
  activity: Record<string, unknown>[];
  currentQueue: Record<string, unknown>[];
  ingressFailures: 'service_logs';
}> {
  if (
    !Number.isFinite(input.from.getTime()) ||
    !Number.isFinite(input.to.getTime()) ||
    input.to <= input.from ||
    input.to.getTime() - input.from.getTime() > 31 * 86400000
  )
    throw new ObservationError('invalid_payload');
  const activity = await db.execute(
    `/* growth:observation-read-health-activity */ select source,kind,collector_version,case when source='install' then properties->>'environment' end as environment,
    count(*) as observation_count,count(distinct subject_id) as subject_count,max(received_at) as last_received_at
    from growth_observations where received_at>=$1 and received_at<$2 group by source,kind,collector_version,case when source='install' then properties->>'environment' end order by source,kind,collector_version`,
    [input.from, input.to],
  );
  const work = await db.execute(
    '/* growth:observation-read-work-health */ select * from growth_observation_work_health_v1 order by status,projection_version',
  );
  return {
    from: input.from.toISOString(),
    to: input.to.toISOString(),
    activity: activity.rows,
    currentQueue: work.rows,
    ingressFailures: 'service_logs',
  };
}
