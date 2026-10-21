import { privacyLock, type SqlExecutor } from '../database.ts';
import { MILESTONES, ObservationError, uuid } from './contracts.ts';

/** The projection version stamped on every fact and settled work row. */
export const PROJECTION_VERSION = 'observation-facts-v1';
/** A claimed, fenced right to project one observation until its lease expires. */
export interface ObservationLease {
  observationId: string;
  generation: string;
  leaseToken: string;
  attempts: number;
}
/**
 * Claims due projection work for 30 seconds. Work that has used five attempts
 * is failed with `attempts_exhausted` instead of claimed; due pending or
 * expired-leased rows are claimed with `for update skip locked` in
 * `available_at, observation_id` order, each claim spending one attempt.
 *
 * @param db - The growth database executor.
 * @param input - The claim time and the most rows to claim (1..20).
 * @returns The leases claimed, without the exhausted rows.
 * @throws ObservationError `invalid_payload` for a bad limit or time.
 */
export async function leaseObservationWork(
  db: SqlExecutor,
  input: { now: Date; limit: number },
): Promise<ObservationLease[]> {
  return (await claimObservationWork(db, input)).leases;
}
async function claimObservationWork(
  db: SqlExecutor,
  input: { now: Date; limit: number },
): Promise<{ leases: ObservationLease[]; failed: number }> {
  if (
    !Number.isInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > 20 ||
    !Number.isFinite(input.now.getTime())
  )
    throw new ObservationError('invalid_payload');
  const result = await db.execute<{
    observation_id: string;
    generation: string;
    lease_token: string;
    attempts: number;
    exhausted_count: number;
  }>(
    `/* growth:observation-claim-work */
    with exhausted as (
      select observation_id from growth_observation_work where attempts>=5 and (status='pending' or (status='leased' and lease_until<=$1))
      order by observation_id for update skip locked limit $2
    ), failed as (
      update growth_observation_work w set status='failed',lease_token=null,lease_until=null,last_error_code='attempts_exhausted',updated_at=$1
      from exhausted e where w.observation_id=e.observation_id returning w.observation_id
    ), due as (
      select observation_id from growth_observation_work where attempts<5 and available_at<=$1
        and (status='pending' or (status='leased' and lease_until<=$1))
      order by available_at,observation_id for update skip locked limit ($2-(select count(*) from failed))
    ), claimed as (
      update growth_observation_work w set status='leased',lease_token=gen_random_uuid(),lease_until=$3,attempts=attempts+1,updated_at=$1
      from due where w.observation_id=due.observation_id returning w.observation_id,w.generation,w.lease_token,w.attempts
    ) select claimed.*,counts.exhausted_count from (select count(*)::int as exhausted_count from failed) counts left join claimed on true`,
    [input.now, input.limit, new Date(input.now.getTime() + 30000)],
  );
  return {
    failed: result.rows[0]?.exhausted_count ?? 0,
    leases: result.rows
      .filter((r) => r.observation_id)
      .map((r) => ({
        observationId: r.observation_id,
        generation: r.generation,
        leaseToken: r.lease_token,
        attempts: r.attempts,
      })),
  };
}
/**
 * Projects one leased observation into its fact under the shared privacy
 * lock. The lease (generation, token, unexpired) is re-verified `for update`;
 * the fact's `active_day` is the UTC date of the earlier of occurrence and
 * receipt, and `milestone_kind` is the kind when it is a milestone. The fact
 * is upserted and the work settled in the same transaction, fenced by the
 * lease, so a lease lost at settlement rolls the fact back.
 *
 * Unlike the source design, a redacted observation (`redacted_at` set) is
 * never projected into a milestone: its fact keeps `active_day`, so activity
 * counts survive, but `milestone_kind` is null, so a replay cannot resurrect
 * a redacted milestone.
 *
 * @param db - The growth database executor.
 * @param lease - The lease from {@link leaseObservationWork}.
 * @param context - The clock, read at each fenced step.
 * @returns `completed`, or `lease_lost` when the lease no longer holds.
 */
export async function projectObservation(
  db: SqlExecutor,
  lease: ObservationLease,
  context: { now: () => Date } = { now: () => new Date() },
): Promise<'completed' | 'lease_lost'> {
  uuid(lease.observationId);
  uuid(lease.leaseToken);
  try {
    return await db.transaction(async (tx) => {
      await privacyLock(tx);
      const locked = await tx.execute(
        `/* growth:observation-read-lease */ select observation_id from growth_observation_work where observation_id=$1 and generation=$2 and lease_token=$3 and status='leased' and lease_until>$4 for update`,
        [
          lease.observationId,
          lease.generation,
          lease.leaseToken,
          context.now(),
        ],
      );
      if (!locked.rows.length) return 'lease_lost';
      const observation = (
        await tx.execute<{
          subject_id: string;
          source: string;
          kind: string;
          occurred_at: Date;
          received_at: Date;
          redacted_at: Date | null;
        }>(
          '/* growth:observation-read-observation */ select subject_id,source,kind,occurred_at,received_at,redacted_at from growth_observations where id=$1',
          [lease.observationId],
        )
      ).rows[0];
      const activeDay = new Date(
        Math.min(
          new Date(observation.occurred_at).getTime(),
          new Date(observation.received_at).getTime(),
        ),
      )
        .toISOString()
        .slice(0, 10);
      const milestone =
        observation.redacted_at === null &&
        (MILESTONES as readonly string[]).includes(observation.kind)
          ? observation.kind
          : null;
      await tx.execute(
        `/* growth:observation-upsert-fact */ insert into growth_observation_facts(observation_id,generation,projection_version,projected_at,active_day,milestone_kind,source,subject_id)
        values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(observation_id) do update set generation=excluded.generation,projection_version=excluded.projection_version,projected_at=excluded.projected_at,active_day=excluded.active_day,milestone_kind=excluded.milestone_kind`,
        [
          lease.observationId,
          lease.generation,
          PROJECTION_VERSION,
          context.now(),
          activeDay,
          milestone,
          observation.source,
          observation.subject_id,
        ],
      );
      const settled = await tx.execute(
        `/* growth:observation-settle-work */ update growth_observation_work set status='completed',lease_token=null,lease_until=null,last_error_code=null,updated_at=$4,projection_version=$5
        where observation_id=$1 and generation=$2 and lease_token=$3 and lease_until>$4 returning observation_id`,
        [
          lease.observationId,
          lease.generation,
          lease.leaseToken,
          context.now(),
          PROJECTION_VERSION,
        ],
      );
      if (!settled.rows.length) throw new ObservationError('lease_lost');
      return 'completed';
    });
  } catch (error) {
    if (error instanceof ObservationError && error.code === 'lease_lost')
      return 'lease_lost';
    throw error;
  }
}
async function failObservation(
  db: SqlExecutor,
  lease: ObservationLease,
  now: Date,
): Promise<'retry_scheduled' | 'failed' | 'lease_lost'> {
  const delay = [60000, 300000, 1800000][Math.min(lease.attempts - 1, 2)];
  const settled = await db.execute(
    `/* growth:observation-fail-work */ update growth_observation_work set status=$4,lease_token=null,lease_until=null,last_error_code='projection_failed',available_at=$5,updated_at=$6
    where observation_id=$1 and generation=$2 and lease_token=$3 and status='leased' and lease_until>$6 returning observation_id`,
    [
      lease.observationId,
      lease.generation,
      lease.leaseToken,
      lease.attempts >= 5 ? 'failed' : 'pending',
      new Date(now.getTime() + delay),
      now,
    ],
  );
  if (!settled.rows.length) return 'lease_lost';
  return lease.attempts >= 5 ? 'failed' : 'retry_scheduled';
}
/** What one {@link processObservations} pass did. */
export interface ObservationProcessingCounts {
  completed: number;
  leaseLost: number;
  retryScheduled: number;
  failed: number;
  disabled: boolean;
}
/**
 * Runs one projection pass: claims work in chunks of at most 20 up to
 * `limit`, projects each lease with per-item containment (a failure backs off
 * 1, 5, then 30 minutes and fails after the fifth attempt), then garbage
 * collects up to 1000 collection budget rows older than two hours.
 *
 * @param db - The growth database executor.
 * @param input - Whether projection is enabled, the most items to process
 *   (1..100), and the clock.
 * @returns The per-outcome counts; `disabled` when nothing ran.
 * @throws ObservationError `invalid_payload` for a bad limit.
 */
export async function processObservations(
  db: SqlExecutor,
  input: { enabled: boolean; limit: number; now?: () => Date },
): Promise<ObservationProcessingCounts> {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100)
    throw new ObservationError('invalid_payload');
  const counts = {
    completed: 0,
    leaseLost: 0,
    retryScheduled: 0,
    failed: 0,
    disabled: !input.enabled,
  };
  if (!input.enabled) return counts;
  const now = input.now ?? (() => new Date());
  let remaining = input.limit;
  while (remaining > 0) {
    const claimed = await claimObservationWork(db, {
      now: now(),
      limit: Math.min(20, remaining),
    });
    const { leases } = claimed;
    counts.failed += claimed.failed;
    if (!leases.length && !claimed.failed) break;
    remaining -= leases.length + claimed.failed;
    for (const lease of leases) {
      try {
        const result = await projectObservation(db, lease, { now });
        if (result === 'completed') counts.completed++;
        else counts.leaseLost++;
      } catch {
        const result = await failObservation(db, lease, now());
        if (result === 'retry_scheduled') counts.retryScheduled++;
        else if (result === 'failed') counts.failed++;
        else counts.leaseLost++;
      }
    }
  }
  await db.execute(
    `/* growth:observation-gc-budgets */ delete from growth_collection_budgets where (bucket_key,window_start) in (select bucket_key,window_start from growth_collection_budgets where window_start<$1 order by window_start limit 1000)`,
    [new Date(now().getTime() - 7200000)],
  );
  return counts;
}
