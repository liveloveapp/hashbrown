import type { SqlExecutor } from '../database.ts';
import {
  type CollectionEventV1,
  collectionSource,
  type CollectionSource,
  ObservationError,
  uuid,
} from './contracts.ts';

/** Whether a request fits its budgets, and when to retry if it does not. */
export interface AdmissionResult {
  allowed: boolean;
  retryAfterSec: number;
}
async function consume(
  db: SqlExecutor,
  buckets: { key: string; count: number; limit: number }[],
  now: Date,
): Promise<AdmissionResult> {
  const milliseconds = now.getTime();
  if (!Number.isFinite(milliseconds))
    throw new ObservationError('invalid_payload');
  const window = new Date(Math.floor(milliseconds / 60000) * 60000);
  try {
    const allowed = await db.transaction(async (tx) => {
      let accepted = true;
      for (const bucket of buckets.sort((a, b) => a.key.localeCompare(b.key))) {
        const result = await tx.execute<{ count: string }>(
          `/* growth:collection-budget */ insert into growth_collection_budgets(bucket_key,window_start,count) values($1,$2,$3)
          on conflict(bucket_key,window_start) do update set count=growth_collection_budgets.count+excluded.count returning count`,
          [bucket.key, window, bucket.count],
        );
        if (Number(result.rows[0].count) > bucket.limit) accepted = false;
      }
      return accepted;
    });
    return {
      allowed,
      retryAfterSec: Math.ceil(
        (window.getTime() + 60000 - milliseconds) / 1000,
      ),
    };
  } catch {
    throw new ObservationError('admission_unavailable');
  }
}
/** Charges one request to the source's per-minute budget (1,200). */
export function consumeSourceBudget(
  db: SqlExecutor,
  source: CollectionSource,
  now: Date,
): Promise<AdmissionResult> {
  collectionSource(source);
  return consume(db, [{ key: `source:${source}`, count: 1, limit: 1200 }], now);
}
/**
 * Charges every event to its subject's per-minute budget (120), charging all
 * buckets even when one denies. Fails closed with `admission_unavailable`.
 */
export async function consumeSubjectBudgets(
  db: SqlExecutor,
  source: CollectionSource,
  events: readonly CollectionEventV1[],
  now: Date,
): Promise<AdmissionResult> {
  collectionSource(source);
  if (!events.length || events.length > 20)
    throw new ObservationError('invalid_payload');
  const counts = new Map<string, number>();
  const namespace = {
    website: 'website_session',
    install: 'installation',
    runtime: 'development_browser',
  }[source];
  for (const event of events) {
    if (event.subject.namespace !== namespace)
      throw new ObservationError('invalid_payload');
    const key = `subject:${namespace}:${uuid(event.subject.id)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return consume(
    db,
    [...counts].map(([key, count]) => ({ key, count, limit: 120 })),
    now,
  );
}
