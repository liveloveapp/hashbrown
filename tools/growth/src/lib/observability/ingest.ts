import { randomUUID } from 'node:crypto';

import { privacyLock, type SqlExecutor } from '../database.ts';
import {
  createEmailLookupCandidates,
  createEmailLookupHmac,
  type EmailHmacKeyring,
} from '../crypto.ts';
import {
  type CollectionAcknowledgment,
  type CollectionSource,
  ObservationError,
  type ObservationIdentity,
  parseCollectionBatch,
} from './contracts.ts';
import { identityDigest, publicDigest } from './canonical.ts';
import { assertIdentityKeyCoverage } from './store.ts';

/** The identity digest under one keyring key version, for replay comparison. */
function identityDigestAt(
  identity: ObservationIdentity,
  keyring: EmailHmacKeyring,
  version: number,
): string {
  const key = [keyring.active, ...(keyring.previous ?? [])].find(
    (k) => k.version === version,
  );
  if (!key) throw new ObservationError('identity_key_unavailable');
  return identityDigest(identity, { active: key }).digest;
}

/**
 * Validates and durably accepts one collection batch in a single transaction
 * under the shared privacy lock. Subjects are locked in sorted id order and
 * events written in sorted event id order, so concurrent batches cannot
 * deadlock. A replayed event must match the stored public and identity
 * digests; events fenced by a subject or email redaction are stored redacted
 * without identity. Each accepted event queues a projection work row.
 *
 * @param db - The growth database executor.
 * @param source - The collection source the batch arrived on.
 * @param input - The raw, untrusted batch body.
 * @param context - Receipt time and the email HMAC keyring (required when any
 *   event carries identity).
 * @returns Per-event dispositions in the original batch order.
 * @throws ObservationError `invalid_payload`, `unsupported_version`,
 *   `identity_key_unavailable`, `redaction_initialization_required`, or
 *   `event_conflict` (the whole batch rolls back).
 */
export async function acceptObservationBatch(
  db: SqlExecutor,
  source: CollectionSource,
  input: unknown,
  context: { now: Date; keyring?: EmailHmacKeyring },
): Promise<CollectionAcknowledgment> {
  const batch = parseCollectionBatch(source, input, context.now);
  const { now } = context;
  const requireKeyring = () => {
    if (!context.keyring)
      throw new ObservationError('identity_key_unavailable');
    return context.keyring;
  };
  return db.transaction(async (tx) => {
    await privacyLock(tx);
    if (batch.events.some((e) => e.identity))
      await assertIdentityKeyCoverage(tx, requireKeyring());
    const subjectIds = new Map<string, string>();
    for (const event of [...batch.events].sort((a, b) =>
      a.subject.id.localeCompare(b.subject.id),
    )) {
      if (subjectIds.has(event.subject.id)) continue;
      await tx.execute(
        `/* growth:observation-insert-subject */ insert into growth_observation_subjects(namespace,external_id,first_received_at,last_received_at) values($1,$2,$3,$3) on conflict(namespace,external_id) do nothing`,
        [event.subject.namespace, event.subject.id, now],
      );
      const row = await tx.execute<{ id: string }>(
        '/* growth:observation-lock-subject */ select id from growth_observation_subjects where namespace=$1 and external_id=$2 for update',
        [event.subject.namespace, event.subject.id],
      );
      subjectIds.set(event.subject.id, row.rows[0].id);
    }
    const receipts = new Map<
      string,
      CollectionAcknowledgment['events'][number]
    >();
    for (const event of [...batch.events].sort((a, b) =>
      a.eventId.localeCompare(b.eventId),
    )) {
      const { identity, ...publicEvent } = event;
      const digest = publicDigest(publicEvent);
      const subjectId = subjectIds.get(event.subject.id) as string;
      const candidates = identity?.gitEmail
        ? createEmailLookupCandidates(identity.gitEmail, requireKeyring())
        : [];
      const suppressed = await tx.execute(
        `/* growth:observation-read-redaction */ select 1 from growth_observation_redactions where
        (selector_kind='subject' and selector_key=$1 and key_version=0) or
        (selector_kind='email' and (key_version,selector_key) in (select * from unnest($2::smallint[],$3::text[]))) limit 1`,
        [
          subjectId,
          candidates.map((c) => c.keyVersion),
          candidates.map((c) => c.digest),
        ],
      );
      const redacted = suppressed.rows.length > 0;
      const privateHash =
        identity && !redacted
          ? identityDigest(identity, requireKeyring())
          : null;
      const id = randomUUID();
      const inserted = await tx.execute<{ id: string }>(
        `/* growth:observation-insert-event */ insert into growth_observations
        (id,source,event_id,subject_id,session_id,kind,schema_version,collector_version,identity_scope,occurred_at,received_at,properties,public_digest,identity_digest,identity_digest_key_version,redacted_at)
        values($1,$2,$3,$4,$5,$6,1,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15)
        on conflict(source,event_id) do nothing returning id`,
        [
          id,
          source,
          event.eventId,
          subjectId,
          event.sessionId ?? null,
          event.kind,
          event.collectorVersion,
          event.subject.scope,
          event.occurredAt,
          now,
          JSON.stringify(event.properties),
          digest,
          privateHash?.digest ?? null,
          privateHash?.keyVersion ?? null,
          redacted ? now : null,
        ],
      );
      if (!inserted.rows.length) {
        const old = (
          await tx.execute<{
            public_digest: string;
            identity_digest: string | null;
            identity_digest_key_version: number | null;
            redacted_at: Date | null;
          }>(
            `/* growth:observation-read-replay */ select public_digest,identity_digest,identity_digest_key_version,redacted_at from growth_observations where source=$1 and event_id=$2`,
            [source, event.eventId],
          )
        ).rows[0];
        if (old.public_digest !== digest)
          throw new ObservationError('event_conflict');
        if (!old.redacted_at) {
          const comparison = identity
            ? identityDigestAt(
                identity,
                requireKeyring(),
                old.identity_digest_key_version ??
                  requireKeyring().active.version,
              )
            : null;
          if (comparison !== old.identity_digest)
            throw new ObservationError('event_conflict');
        }
        receipts.set(event.eventId, {
          eventId: event.eventId,
          disposition: old.redacted_at ? 'redacted' : 'duplicate',
        });
        continue;
      }
      if (identity && !redacted) {
        const email = identity.gitEmail
          ? createEmailLookupHmac(identity.gitEmail, requireKeyring().active)
          : null;
        await tx.execute(
          `/* growth:observation-insert-identity */ insert into growth_observation_identities(observation_id,email_normalized,git_display_name,git_config_origin,repository_provider,repository_owner,email_lookup_hmac,email_key_version)
          values($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            id,
            identity.gitEmail ?? null,
            identity.gitDisplayName ?? null,
            identity.gitConfigOrigin ?? null,
            identity.repositoryProvider ?? null,
            identity.repositoryOwner ?? null,
            email?.digest ?? null,
            email?.keyVersion ?? null,
          ],
        );
      }
      if (event.installationToken) {
        await tx.execute(
          '/* growth:observation-update-token-digest */ update growth_observations set installation_token_digest=$2 where id=$1',
          [id, publicDigest({ installationToken: event.installationToken })],
        );
      }
      await tx.execute(
        `/* growth:observation-update-subject */ update growth_observation_subjects set first_received_at=least(first_received_at,$2),last_received_at=greatest(last_received_at,$2) where id=$1`,
        [subjectId, now],
      );
      await tx.execute(
        `/* growth:observation-insert-work */ insert into growth_observation_work(observation_id,available_at,updated_at) values($1,$2,$2)`,
        [id, now],
      );
      receipts.set(event.eventId, {
        eventId: event.eventId,
        disposition: redacted ? 'redacted' : 'accepted',
      });
    }
    return {
      schemaVersion: 1,
      events: batch.events.map(
        (e) =>
          receipts.get(e.eventId) as CollectionAcknowledgment['events'][number],
      ),
    };
  });
}
