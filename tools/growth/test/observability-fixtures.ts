import { randomUUID } from 'node:crypto';

import {
  applyMigrations,
  defaultMigrationsDirectory,
} from '../scripts/apply-migrations.mts';
import {
  createEmailLookupCandidates,
  type EmailHmacKeyring,
} from '../src/lib/crypto.ts';
import {
  createDatabaseExecutor,
  type SqlExecutor,
} from '../src/lib/database.ts';
import type { CollectionBatchV1 } from '../src/lib/observability/contracts.ts';

/** The synthetic email HMAC keyring every observation fixture uses. */
export const evidenceKeys: EmailHmacKeyring = {
  active: {
    version: 777,
    secret: 'observation-fixture-secret-at-least-32-bytes',
  },
};

/** One batch per collection source for a linked synthetic journey. */
export interface EvidenceFixture {
  website: CollectionBatchV1;
  install: CollectionBatchV1;
  runtime: CollectionBatchV1;
}

/** Remove only fences created for this exact synthetic contact before deleting its fixture rows. */
export async function cleanContactObservationFences(
  db: SqlExecutor,
  contactId: string,
): Promise<void> {
  await db.execute(
    `delete from growth_observation_redactions r where r.selector_kind='email' and (r.key_version,r.selector_key) in (
    select email_hmac_key_version,email_lookup_hmac from growth_contacts where id=$1
    union all select (data->>'key_version')::smallint,data->>'digest' from growth_activity where contact_id=$1 and kind='contact.lookup_alias_added'
  )`,
    [contactId],
  );
}

/** Opens the dedicated test store (`TEST_DATABASE_URL`) with migrations applied. */
export async function evidenceDatabase(): Promise<SqlExecutor> {
  if (!process.env['TEST_DATABASE_URL'])
    throw new Error('TEST_DATABASE_URL required');
  const db = createDatabaseExecutor(process.env['TEST_DATABASE_URL']);
  await applyMigrations({
    directory: defaultMigrationsDirectory(),
    executor: db,
  });
  return db;
}

/**
 * A fresh website session, install (with a synthetic git identity), and
 * runtime session batch. Install and runtime share an installation token.
 */
export function evidenceFixture(now = new Date()): EvidenceFixture {
  const occurredAt = now.toISOString();
  const installationToken = randomUUID();
  return {
    website: {
      schemaVersion: 1,
      events: [
        {
          eventId: randomUUID(),
          kind: 'website.session_started',
          occurredAt,
          collectorVersion: '1',
          subject: {
            id: randomUUID(),
            namespace: 'website_session',
            scope: 'session',
          },
          properties: {
            campaignSource: 'newsletter',
            referrerHost: 'example.com',
          },
        },
      ],
    },
    install: {
      schemaVersion: 1,
      events: [
        {
          eventId: randomUUID(),
          kind: 'package.installed',
          occurredAt,
          collectorVersion: '1',
          subject: {
            id: randomUUID(),
            namespace: 'installation',
            scope: 'persistent',
          },
          installationToken,
          properties: {
            packageName: '@hashbrownai/core',
            packageVersion: '1',
            osFamily: 'linux',
            architecture: 'x64',
            nodeVersion: '22',
            environment: 'ci',
            environmentEvidence: 'generic_ci',
          },
          identity: {
            gitEmail: `${randomUUID()}@example.invalid`,
            gitDisplayName: 'Synthetic Developer',
            gitConfigOrigin: 'global',
          },
        },
      ],
    },
    runtime: {
      schemaVersion: 1,
      events: [
        {
          eventId: randomUUID(),
          kind: 'runtime.session_started',
          occurredAt,
          collectorVersion: '1',
          subject: {
            id: randomUUID(),
            namespace: 'development_browser',
            scope: 'persistent',
          },
          sessionId: randomUUID(),
          installationToken,
          properties: {
            packageName: '@hashbrownai/react',
            packageVersion: '1',
            integration: 'react',
            transport: 'http',
            provider: 'openai',
          },
        },
      ],
    },
  };
}

/**
 * Deletes what the fixtures created, in foreign-key-safe order: subject and
 * email fences, then subjects (observations, identities, work, and facts
 * cascade), then operations.
 */
export async function cleanEvidence(
  db: SqlExecutor,
  fixture: {
    subjects: readonly string[];
    emails?: readonly string[];
    operations?: readonly string[];
  },
): Promise<void> {
  const candidates = (fixture.emails ?? []).flatMap((email) =>
    createEmailLookupCandidates(email, evidenceKeys),
  );
  await db.transaction(async (tx) => {
    await tx.execute(
      `delete from growth_observation_redactions where selector_kind='subject' and selector_key in (select id::text from growth_observation_subjects where external_id=any($1::uuid[]))`,
      [fixture.subjects],
    );
    await tx.execute(
      `delete from growth_observation_redactions where selector_kind='email' and (key_version,selector_key) in (select * from unnest($1::smallint[],$2::text[]))`,
      [candidates.map((c) => c.keyVersion), candidates.map((c) => c.digest)],
    );
    await tx.execute(
      'delete from growth_observation_subjects where external_id=any($1::uuid[])',
      [fixture.subjects],
    );
    await tx.execute(
      'delete from growth_observation_operations where operation_id=any($1::uuid[])',
      [fixture.operations ?? []],
    );
  });
}
