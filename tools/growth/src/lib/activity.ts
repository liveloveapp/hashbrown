import type { SqlTransaction } from './database.ts';

/** The identity and payload of one growth activity ledger entry. */
export interface ActivityEnvelope {
  /** Idempotency key; a second insert with the same key is a replay. */
  eventKey: string;
  contactId: string;
  projectId?: string | null;
  occurredAt: Date;
  kind: string;
  data: Record<string, unknown>;
}

/** A stored activity row, as read back for replay comparison. */
export interface ActivityRow extends Record<string, unknown> {
  contact_id: string | null;
  data: Record<string, unknown>;
  kind: string;
  occurred_at: Date | string;
  project_id: string | null;
}

/** Converts a database timestamp to a `Date`, passing `null` through. */
export function asDate(value: Date | string | null): Date | null {
  return value == null ? null : new Date(value);
}

/**
 * Serializes a JSON value with object keys sorted at every depth, so two
 * structurally equal values compare equal as strings.
 */
export function canonicalJson(value: unknown): string {
  function normalizeJson(candidate: unknown): unknown {
    if (Array.isArray(candidate)) {
      return candidate.map(normalizeJson);
    }
    if (candidate !== null && typeof candidate === 'object') {
      return Object.fromEntries(
        Object.entries(candidate as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, normalizeJson(entry)]),
      );
    }
    return candidate;
  }

  return JSON.stringify(normalizeJson(value));
}

/** Reads the stored activity row for an event key, if one exists. */
export async function readActivityByEventKey(
  transaction: SqlTransaction,
  eventKey: string,
): Promise<ActivityRow | undefined> {
  const existing = await transaction.execute<ActivityRow>(
    `/* growth:read-event-key */
     select contact_id, project_id, kind, occurred_at, data
     from growth_activity
     where event_key = $1`,
    [eventKey],
  );
  return existing.rows[0];
}

function validateActivityIdentity(
  row: ActivityRow,
  input: ActivityEnvelope,
): void {
  const occurredAt = asDate(row.occurred_at);
  if (
    row.contact_id !== input.contactId ||
    row.project_id !== (input.projectId ?? null) ||
    row.kind !== input.kind ||
    occurredAt?.getTime() !== input.occurredAt.getTime()
  ) {
    throw new Error(`Growth activity event key conflict: ${input.eventKey}`);
  }
}

/**
 * Checks an event key against the stored activity.
 *
 * @returns `false` when no activity has the key, `true` when the stored one
 * is identical.
 * @throws When the stored activity differs in identity or payload.
 */
export async function validateActivityReplayIfPresent(
  transaction: SqlTransaction,
  input: ActivityEnvelope,
): Promise<boolean> {
  const row = await readActivityByEventKey(transaction, input.eventKey);
  if (!row) return false;
  validateActivityIdentity(row, input);
  if (canonicalJson(row.data) !== canonicalJson(input.data)) {
    throw new Error(`Growth activity event key conflict: ${input.eventKey}`);
  }
  return true;
}

/**
 * Appends an activity to the ledger exactly once per event key.
 *
 * @returns `'inserted'` for a new entry, `'replayed'` when an identical entry
 * with the same key already exists.
 * @throws `Growth activity event key conflict: <key>` when the key exists with
 * a different contact, project, kind, time, or payload.
 */
export async function insertActivityOnce(
  transaction: SqlTransaction,
  input: ActivityEnvelope,
): Promise<'inserted' | 'replayed'> {
  const inserted = await transaction.execute<{ event_key: string }>(
    `/* growth:insert-activity */
     insert into growth_activity (
       event_key, contact_id, occurred_at, kind, data, project_id
     )
     values ($1, $2, $3, $4, $5::jsonb, $6)
     on conflict (event_key) do nothing
     returning event_key`,
    [
      input.eventKey,
      input.contactId,
      input.occurredAt,
      input.kind,
      JSON.stringify(input.data),
      input.projectId ?? null,
    ],
  );
  if (inserted.rows.length > 0) return 'inserted';

  const replay = await validateActivityReplayIfPresent(transaction, input);
  if (!replay) {
    throw new Error(`Growth activity event key conflict: ${input.eventKey}`);
  }
  return 'replayed';
}
