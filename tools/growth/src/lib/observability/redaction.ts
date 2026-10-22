import {
  privacyLock,
  type SqlExecutor,
  type SqlTransaction,
} from '../database.ts';
import {
  createEmailLookupCandidates,
  type EmailHmacKeyring,
  type EmailLookupHmac,
  normalizeEmail,
} from '../crypto.ts';
import { ObservationError, uuid } from './contracts.ts';
import { identityDigest, publicDigest } from './canonical.ts';

/** What one redaction operation selects: one subject row, or one email. */
export type ObservationRedactionSelector =
  { subjectId: string } | { email: string };

/** The identity digest of a value under one keyring key version. */
function identityDigestAt(
  value: unknown,
  keyring: EmailHmacKeyring,
  version: number,
): string {
  const key = [keyring.active, ...(keyring.previous ?? [])].find(
    (k) => k.version === version,
  );
  if (!key) throw new ObservationError('identity_key_unavailable');
  return identityDigest(value, { active: key }).digest;
}

async function redactLocked(
  tx: SqlTransaction,
  input: {
    subjectId?: string;
    email?: string;
    lookups: readonly EmailLookupHmac[];
  },
  now: Date,
): Promise<number> {
  const rows = await tx.execute<{
    observation_id: string;
    email_lookup_hmac: string | null;
    email_key_version: number | null;
  }>(
    `/* growth:observation-select-redaction-targets */
    select o.id as observation_id,i.email_lookup_hmac,i.email_key_version from growth_observations o
    left join growth_observation_identities i on i.observation_id=o.id where
      ($1::uuid is not null and o.subject_id=$1) or
      ($2::text is not null and i.email_normalized=$2) or
      ((i.email_key_version,i.email_lookup_hmac) in (select * from unnest($3::smallint[],$4::text[]))) order by o.id`,
    [
      input.subjectId ?? null,
      input.email ?? null,
      input.lookups.map((k) => k.keyVersion),
      input.lookups.map((k) => k.digest),
    ],
  );
  if (input.subjectId)
    await tx.execute(
      `/* growth:observation-insert-fence */ insert into growth_observation_redactions values('subject',$1,0,$2) on conflict do nothing`,
      [input.subjectId, now],
    );
  const lookups = [
    ...input.lookups,
    ...rows.rows.flatMap((r) =>
      r.email_lookup_hmac && r.email_key_version
        ? [{ digest: r.email_lookup_hmac, keyVersion: r.email_key_version }]
        : [],
    ),
  ];
  for (const key of lookups)
    await tx.execute(
      `/* growth:observation-insert-fence */ insert into growth_observation_redactions values('email',$1,$2,$3) on conflict do nothing`,
      [key.digest, key.keyVersion, now],
    );
  const ids = rows.rows.map((r) => r.observation_id);
  await tx.execute(
    '/* growth:observation-lock-redaction-work */ select observation_id from growth_observation_work where observation_id=any($1::uuid[]) order by observation_id for update',
    [ids],
  );
  await tx.execute(
    '/* growth:observation-delete-identities */ delete from growth_observation_identities where observation_id=any($1::uuid[])',
    [ids],
  );
  await tx.execute(
    '/* growth:observation-redact-observations */ update growth_observations set identity_digest=null,identity_digest_key_version=null,redacted_at=coalesce(redacted_at,$2) where id=any($1::uuid[])',
    [ids, now],
  );
  await tx.execute(
    '/* growth:observation-delete-redacted-facts */ delete from growth_observation_facts where observation_id=any($1::uuid[])',
    [ids],
  );
  await tx.execute(
    `/* growth:observation-reset-redacted-work */ update growth_observation_work set generation=generation+1,status='pending',attempts=0,lease_token=null,lease_until=null,last_error_code=null,available_at=$2,updated_at=$2 where observation_id=any($1::uuid[])`,
    [ids, now],
  );
  return ids.length;
}

/**
 * Erases private observation evidence for one subject or one email under the
 * exclusive privacy lock and the operation's advisory lock. Writes fences for
 * the subject and for every email HMAC candidate (and every HMAC found on a
 * matching identity) so future events are stored redacted, deletes identity
 * rows, nulls identity digests, deletes facts, and regenerates work so each
 * observation re-projects anonymously. Repeating an operation id with the same
 * selection returns the recorded count; an email operation is compared under
 * the key version it was recorded with.
 *
 * @param db - The growth database executor.
 * @param selector - The subject row id, or the email, to redact.
 * @param context - The operation id, redaction time, and email HMAC keyring.
 * @returns How many observations the operation selected.
 * @throws ObservationError `invalid_payload`, `operation_conflict` (the id was
 *   used for another kind or selection), or `identity_key_unavailable`.
 */
export async function redactObservationEvidence(
  db: SqlExecutor,
  selector: ObservationRedactionSelector,
  context: { operationId: string; now: Date; keyring: EmailHmacKeyring },
): Promise<{ selectedCount: number }> {
  uuid(context.operationId);
  if (!Number.isFinite(context.now.getTime()))
    throw new ObservationError('invalid_payload');
  const subjectId =
    'subjectId' in selector ? uuid(selector.subjectId) : undefined;
  const email =
    'email' in selector ? normalizeEmail(selector.email) : undefined;
  const lookups = email
    ? createEmailLookupCandidates(email, context.keyring)
    : [];
  return db.transaction(async (tx) => {
    await privacyLock(tx, true);
    // Acquire privacy first everywhere that both locks are needed.
    await tx.execute(
      '/* growth:observation-lock-operation */ select pg_advisory_xact_lock(hashtextextended($1,0))',
      [`observation-operation:${context.operationId}`],
    );
    const old = (
      await tx.execute<{
        kind: string;
        selection_digest: string;
        selected_count: number;
      }>(
        '/* growth:observation-read-operation */ select kind,selection_digest,selected_count from growth_observation_operations where operation_id=$1',
        [context.operationId],
      )
    ).rows[0];
    if (
      old &&
      (old.kind !== 'redact' || (email && !/^\d+:/u.test(old.selection_digest)))
    )
      throw new ObservationError('operation_conflict');
    const version =
      old && email
        ? Number(old.selection_digest.split(':')[0])
        : context.keyring.active.version;
    const digest = email
      ? `${version}:${identityDigestAt({ email }, context.keyring, version)}`
      : publicDigest({ subjectId });
    if (old) {
      if (old.kind !== 'redact' || old.selection_digest !== digest)
        throw new ObservationError('operation_conflict');
      return { selectedCount: old.selected_count };
    }
    const selectedCount = await redactLocked(
      tx,
      { subjectId, email, lookups },
      context.now,
    );
    await tx.execute(
      `/* growth:observation-insert-operation */ insert into growth_observation_operations values($1,'redact',$2,$3,$4,$2)`,
      [context.operationId, context.now, digest, selectedCount],
    );
    return { selectedCount };
  });
}

/**
 * Redacts a contact's observation evidence inside the caller's transaction
 * (the contact deletion hook): fences the contact's lookup HMAC and every
 * `contact.lookup_alias_added` alias, and scrubs observations matching the
 * contact's email or HMACs. Takes the exclusive privacy lock (re-entrant when
 * the caller already holds it). A missing contact is a no-op.
 *
 * @param tx - The open transaction, normally the contact deletion's.
 * @param contactId - The contact being deleted.
 * @param now - The redaction time (the deletion's `occurredAt`).
 */
export async function redactContactObservationEvidence(
  tx: SqlTransaction,
  contactId: string,
  now: Date,
): Promise<void> {
  await privacyLock(tx, true);
  const contact = (
    await tx.execute<{
      email_normalized: string | null;
      email_lookup_hmac: string;
      email_hmac_key_version: number;
    }>(
      `/* growth:observation-read-contact-identity */ select email_normalized,email_lookup_hmac,email_hmac_key_version from growth_contacts where id=$1`,
      [contactId],
    )
  ).rows[0];
  if (!contact) return;
  const aliases = await tx.execute<{ digest: string; version: number }>(
    `/* growth:observation-read-contact-aliases */ select data->>'digest' as digest,(data->>'key_version')::smallint as version from growth_activity where contact_id=$1 and kind='contact.lookup_alias_added'`,
    [contactId],
  );
  await redactLocked(
    tx,
    {
      email: contact.email_normalized ?? undefined,
      lookups: [
        {
          digest: contact.email_lookup_hmac,
          keyVersion: contact.email_hmac_key_version,
        },
        ...aliases.rows.map((k) => ({
          digest: k.digest,
          keyVersion: k.version,
        })),
      ],
    },
    now,
  );
}

/**
 * Backfills observation fences for contacts deleted before observation
 * redaction existed, one contact per transaction, `limit` (1..100) contacts
 * per call in id order after `cursor`. Repeatable: fences are written with
 * `on conflict do nothing`.
 *
 * @param db - The growth database executor.
 * @param input - Page size and the cursor from the previous call.
 * @param now - The redaction time.
 * @returns How many contacts were processed and the next cursor, or `null`
 *   when no deleted contacts remain.
 * @throws ObservationError `invalid_payload` for a bad limit or cursor.
 */
export async function initializeObservationRedactions(
  db: SqlExecutor,
  input: { limit: number; cursor?: string },
  now = new Date(),
): Promise<{ processed: number; nextCursor: string | null }> {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100)
    throw new ObservationError('invalid_payload');
  const cursor = input.cursor ? uuid(input.cursor) : null;
  const rows = await db.execute<{ id: string }>(
    '/* growth:observation-read-deleted-contacts */ select id from growth_contacts where deleted_at is not null and ($1::uuid is null or id>$1) order by id limit $2',
    [cursor, input.limit + 1],
  );
  const selected = rows.rows.slice(0, input.limit);
  for (const row of selected)
    await db.transaction(async (tx) => {
      await privacyLock(tx, true);
      await tx.execute(
        '/* growth:observation-lock-deleted-contact */ select id from growth_contacts where id=$1 for update',
        [row.id],
      );
      await redactContactObservationEvidence(tx, row.id, now);
    });
  return {
    processed: selected.length,
    nextCursor:
      rows.rows.length > input.limit ? (selected.at(-1)?.id ?? null) : null,
  };
}
