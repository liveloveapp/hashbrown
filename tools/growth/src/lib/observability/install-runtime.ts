import { privacyLock, type SqlExecutor } from '../database.ts';
import type { EmailHmacKeyring } from '../crypto.ts';
import { approveContactFromInstallRuntimeInTransaction } from '../contacts.ts';
import { isPersonalEmailDomain } from './install-digest.ts';
import { assertIdentityKeyCoverage } from './store.ts';

/** Counts from one {@link processInstallRuntimeActivations} run. */
export interface InstallRuntimeActivationCounts {
  approved: number;
  ineligible: number;
  conflicted: number;
  disabled: boolean;
}

type LinkOutcome = 'approved' | 'ineligible' | 'conflicted';

/**
 * Resolves unlinked `runtime.session_started` observations into hello-path
 * outreach approvals inside the lifecycle tick; never invoked by public
 * payloads. A runtime links to the install observations that share its
 * installation token (hashbrown's token comes from `@hashbrownai/core` while
 * the runtime names `@hashbrownai/react` or `/angular`, so package names are
 * not compared). Exactly one email, at least one non-CI unredacted install,
 * no redacted install and a work domain approve; two emails are `conflicted`;
 * anything else is `ineligible`. Every runtime gets one link row.
 *
 * @throws `invalid_activation_input` for a limit outside 1..100 or an invalid `now`.
 */
export async function processInstallRuntimeActivations(
  db: SqlExecutor,
  input: {
    enabled: boolean;
    limit: number;
    now: Date;
    keyring: EmailHmacKeyring;
  },
): Promise<InstallRuntimeActivationCounts> {
  const counts = {
    approved: 0,
    ineligible: 0,
    conflicted: 0,
    disabled: !input.enabled,
  };
  if (!input.enabled) return counts;
  if (
    !Number.isInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > 100 ||
    !Number.isFinite(input.now.getTime())
  )
    throw new Error('invalid_activation_input');
  return db.transaction(async (tx) => {
    await privacyLock(tx);
    await assertIdentityKeyCoverage(tx, input.keyring);
    // Reuse database exclusion, not a new queue or in-memory background task.
    await tx.execute(
      "/* growth:install-runtime-lock */ select pg_advisory_xact_lock(hashtextextended('growth-install-runtime-v1',0))",
    );
    const runtimes = await tx.execute<{
      id: string;
      installation_token_digest: string;
    }>(
      `/* growth:read-install-runtime-candidates */
       select r.id, r.installation_token_digest
       from growth_observations r
       where r.source = 'runtime'
         and r.kind = 'runtime.session_started'
         and r.redacted_at is null
         and r.installation_token_digest is not null
         and not exists (
           select 1 from growth_install_runtime_links l
           where l.runtime_observation_id = r.id
         )
         and exists (
           select 1 from growth_observations i
           where i.source = 'install'
             and i.kind = 'package.installed'
             and i.installation_token_digest = r.installation_token_digest
         )
       order by r.received_at, r.id
       limit $1
       for update of r`,
      [input.limit],
    );
    for (const runtime of runtimes.rows) {
      const installs = await tx.execute<{
        id: string;
        email_normalized: string | null;
        redacted_at: Date | null;
        environment: string | null;
      }>(
        `/* growth:read-install-runtime-installs */
         select i.id, e.email_normalized, i.redacted_at,
                i.properties->>'environment' as environment
         from growth_observations i
         left join growth_observation_identities e on e.observation_id = i.id
         where i.source = 'install'
           and i.kind = 'package.installed'
           and i.installation_token_digest = $1
         order by i.received_at, i.id`,
        [runtime.installation_token_digest],
      );
      const emails = new Set(
        installs.rows
          .map((i) => i.email_normalized)
          .filter((email): email is string => Boolean(email)),
      );
      const installation = installs.rows.find(
        (i) => i.email_normalized && !i.redacted_at && i.environment !== 'ci',
      );
      const [email] = [...emails];
      let outcome: LinkOutcome = emails.size > 1 ? 'conflicted' : 'ineligible';
      let contactId: string | null = null;
      if (
        emails.size === 1 &&
        email &&
        installation &&
        !installs.rows.some((i) => i.redacted_at) &&
        !isPersonalEmailDomain(email.split('@')[1] ?? '')
      ) {
        contactId = await approveContactFromInstallRuntimeInTransaction(tx, {
          email,
          keyring: input.keyring,
          now: input.now,
          installObservationId: installation.id,
          runtimeObservationId: runtime.id,
        });
        if (contactId) outcome = 'approved';
      }
      await tx.execute(
        `/* growth:insert-install-runtime-link */
         insert into growth_install_runtime_links (
           runtime_observation_id, install_observation_id, contact_id,
           outcome, evaluated_at
         ) values ($1, $2, $3, $4, $5)`,
        [runtime.id, installation?.id ?? null, contactId, outcome, input.now],
      );
      counts[outcome]++;
    }
    return counts;
  });
}
