import type { SqlExecutor } from '../database.ts';
import {
  collectionSource,
  type CollectionSource,
  ObservationError,
  uuid,
} from './contracts.ts';
import { publicDigest } from './canonical.ts';

/**
 * Which observations to replay: one subject, or one source within a window of
 * at most 24 hours, capped at `maxEvents` (1..1000), under an idempotent
 * operation id.
 */
export type ReplaySelection = { operationId: string; maxEvents: number } & (
  { subjectId: string } | { source: CollectionSource; from: Date; to: Date }
);
/**
 * Re-queues the selected observations for projection in one transaction under
 * the operation's advisory lock: bumps each work row's generation (fencing
 * any in-flight lease), resets it to pending with no lease or error, deletes
 * its fact, and records the operation. Repeating an operation id with the
 * same selection returns the recorded count without touching work.
 *
 * @param db - The growth database executor.
 * @param input - The replay selection.
 * @param now - The replay time.
 * @returns How many observations the operation selected.
 * @throws ObservationError `invalid_payload`, `operation_conflict` (the id
 *   was used for another kind or selection), or `selection_overflow` (more
 *   than `maxEvents` matched).
 */
export async function replayObservations(
  db: SqlExecutor,
  input: ReplaySelection,
  now = new Date(),
): Promise<{ selectedCount: number }> {
  const operationId = uuid(input.operationId);
  if (
    !Number.isInteger(input.maxEvents) ||
    input.maxEvents < 1 ||
    input.maxEvents > 1000 ||
    !Number.isFinite(now.getTime())
  )
    throw new ObservationError('invalid_payload');
  let subject: string | null = null,
    source: CollectionSource | null = null,
    from: Date | null = null,
    to: Date | null = null;
  if ('subjectId' in input) subject = uuid(input.subjectId);
  else {
    source = collectionSource(input.source);
    from = input.from;
    to = input.to;
    if (
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(to.getTime()) ||
      to <= from ||
      to.getTime() - from.getTime() > 86400000
    )
      throw new ObservationError('invalid_payload');
  }
  const digest = publicDigest({
    subject,
    source,
    from: from?.toISOString() ?? null,
    to: to?.toISOString() ?? null,
    maxEvents: input.maxEvents,
  });
  return db.transaction(async (tx) => {
    await tx.execute(
      `/* growth:observation-lock-operation */ select pg_advisory_xact_lock(hashtextextended($1,0))`,
      [`observation-operation:${operationId}`],
    );
    const existing = (
      await tx.execute<{
        kind: string;
        selection_digest: string;
        selected_count: number;
      }>(
        '/* growth:observation-read-operation */ select kind,selection_digest,selected_count from growth_observation_operations where operation_id=$1',
        [operationId],
      )
    ).rows[0];
    if (existing) {
      if (existing.kind !== 'replay' || existing.selection_digest !== digest)
        throw new ObservationError('operation_conflict');
      return { selectedCount: existing.selected_count };
    }
    const selected = await tx.execute<{ id: string }>(
      `/* growth:observation-select-replay */ select id from growth_observations where ($1::uuid is not null and subject_id=$1)
      or ($1::uuid is null and source=$2 and received_at>=$3 and received_at<$4) order by id limit $5`,
      [subject, source, from, to, input.maxEvents + 1],
    );
    if (selected.rows.length > input.maxEvents)
      throw new ObservationError('selection_overflow');
    const ids = selected.rows.map((r) => r.id);
    await tx.execute(
      '/* growth:observation-lock-replay-work */ select observation_id from growth_observation_work where observation_id=any($1::uuid[]) order by observation_id for update',
      [ids],
    );
    await tx.execute(
      `/* growth:observation-reset-work */ update growth_observation_work set generation=generation+1,status='pending',attempts=0,lease_token=null,lease_until=null,available_at=$2,updated_at=$2,last_error_code=null where observation_id=any($1::uuid[])`,
      [ids, now],
    );
    await tx.execute(
      '/* growth:observation-delete-facts */ delete from growth_observation_facts where observation_id=any($1::uuid[])',
      [ids],
    );
    await tx.execute(
      `/* growth:observation-insert-operation */ insert into growth_observation_operations(operation_id,kind,requested_at,selection_digest,selected_count,completed_at) values($1,'replay',$2,$3,$4,$2)`,
      [operationId, now, digest, ids.length],
    );
    return { selectedCount: ids.length };
  });
}
