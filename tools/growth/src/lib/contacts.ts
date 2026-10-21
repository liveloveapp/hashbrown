import {
  privacyLock,
  type SqlExecutor,
  type SqlTransaction,
} from './database.ts';
import {
  type ActivityEnvelope,
  asDate,
  canonicalJson,
  insertActivityOnce,
  readActivityByEventKey,
  validateActivityReplayIfPresent,
} from './activity.ts';
import {
  compareEmailLookupHmac,
  createEmailLookupCandidates,
  type EmailHmacKeyring,
  normalizeEmail,
} from './crypto.ts';
import { redactContactObservationEvidence } from './observability/redaction.ts';
import type {
  FormOutreachApprovedActivityData,
  GrowthEmailClassification,
} from './models.ts';

/** Activity kinds that permanently or conditionally stop outreach to a contact. */
export const CONTACT_HARD_STOP_REASONS = [
  'unsubscribe',
  'complaint',
  'hard_bounce',
  'provider_suppression',
  'invalid_address',
  'manual_suppression',
  'campaign.reply_received',
  'deletion',
] as const;

/** One of the {@link CONTACT_HARD_STOP_REASONS}. */
export type ContactHardStopReason = (typeof CONTACT_HARD_STOP_REASONS)[number];

const CONTACT_LOOKUP_ALIAS_KIND = 'contact.lookup_alias_added';

/**
 * Finds a contact by email under any keyring candidate or recorded lookup alias.
 *
 * @returns The contact id, or `null` when none matches.
 * @throws When more than one contact matches.
 */
export async function findContactIdByEmail(
  executor: SqlExecutor,
  email: string,
  keyring: EmailHmacKeyring,
): Promise<string | null> {
  const candidates = createEmailLookupCandidates(email, keyring);
  const result = await executor.execute<{ id: string }>(
    `/* growth:founder-find-contact-by-email */
     select c.id
     from growth_contacts c
     where exists (
       select 1
       from jsonb_to_recordset($1::jsonb)
         as candidate(key_version smallint, digest text)
       where (
           candidate.key_version = c.email_hmac_key_version
           and candidate.digest = c.email_lookup_hmac
         )
         or exists (
           select 1
           from growth_activity alias
           where alias.contact_id = c.id
             and alias.kind = 'contact.lookup_alias_added'
             and alias.data->>'key_version' = candidate.key_version::text
             and alias.data->>'digest' = candidate.digest
         )
     )
     limit 2`,
    [
      JSON.stringify(
        candidates.map(({ digest, keyVersion }) => ({
          digest,
          key_version: keyVersion,
        })),
      ),
    ],
  );
  if (result.rows.length > 1) {
    throw new Error('Email HMAC lookup matched multiple growth contacts');
  }
  return result.rows[0]?.id ?? null;
}

interface ContactRow extends Record<string, unknown> {
  id: string;
  outreach_approved_at: Date | string | null;
  deleted_at: Date | string | null;
  updated_at: Date | string;
}

interface IdentityContactRow extends ContactRow {
  email_lookup_hmac: string;
  email_hmac_key_version: number;
}

interface ContactControlRow extends ContactRow {
  latest_hard_stop_kind: ContactHardStopReason | null;
  latest_hard_stop_at: Date | string | null;
}

interface HardStopRow extends Record<string, unknown> {
  kind: ContactHardStopReason;
  occurred_at: Date | string;
}

/** Whether outreach to a contact is currently authorized, and why. */
export interface ContactControlState {
  contactId: string;
  authorization: 'approved' | 'stopped' | 'deleted' | 'unapproved';
  canSend: boolean;
  outreachApprovedAt: Date | null;
  latestHardStop: {
    reason: ContactHardStopReason;
    occurredAt: Date;
  } | null;
  deletedAt: Date | null;
  updatedAt: Date;
}

/** Control state plus whether this form submission granted approval. */
export interface FormApprovalControlState extends ContactControlState {
  formApprovalGranted: boolean;
}

/** A server-validated form submission that may approve outreach. */
export interface ApproveContactFromFormInput {
  /** Server-owned form admission; never accept this field from a request body. */
  serverFormBlocked?: boolean;
  email: string;
  displayName?: string | null;
  companyName?: string | null;
  companyDomain?: string | null;
  source: string;
  sourceForm: string;
  noticeText: string;
  noticeVersion: string;
  policyVersion: string;
  eventKey: string;
  occurredAt: Date;
  keyring: EmailHmacKeyring;
  serverEmailClassification?: GrowthEmailClassification;
  submittedFacts?: FormSubmittedFacts;
}

/** Optional facts the submitter supplied on the form. */
export interface FormSubmittedFacts {
  acquisition_session_id?: string;
  form_kind?: 'whitepaper' | 'newsletter' | 'contact' | 'pricing';
  message?: string;
  paper?: 'overview' | 'angular' | 'render' | 'chat';
  pilot_interest?: 'yes' | 'maybe' | 'no';
  submission_id?: string;
  team_size?: '1-5' | '6-25' | '26-100' | '100+';
  timeline?: 'this_quarter' | 'next_quarter' | '6_plus_months' | 'exploring';
}

/** A founder action that restores outreach after permitted prior stops. */
export interface ReauthorizeContactInput {
  contactId: string;
  eventKey: string;
  occurredAt: Date;
  actor: string;
  reason: string;
  source: string;
  policyVersion: string;
  allowedPriorStops: readonly Exclude<ContactHardStopReason, 'deletion'>[];
}

/** Outcome of {@link reauthorizeContact}. */
export interface ReauthorizeContactResult {
  reauthorized: boolean;
  blockedBy: ContactHardStopReason[];
  state: ContactControlState;
}

/** A verified erasure request for one contact. */
export interface DeleteContactInput {
  contactId: string;
  eventKey: string;
  occurredAt: Date;
  actor: string;
  source: string;
  policyVersion: string;
  /**
   * Redacts evidence held outside the contact tables, inside the deletion
   * transaction. Receives the transaction, the contact id, and the deletion's
   * `occurredAt`, so redactions share the deletion's timestamp. Defaults to
   * {@link redactContactObservationEvidence}.
   */
  redactEvidence?: (
    transaction: SqlTransaction,
    contactId: string,
    occurredAt: Date,
  ) => Promise<void>;
}

/** Outcome of {@link deleteContact}. */
export interface DeleteContactResult {
  deleted: boolean;
  state: ContactControlState;
  cancelledJobIds: string[];
  retainedJobIds: string[];
  unlinkedProjectIds: string[];
  deletedArtifactIds: string[];
}

const LIMITS = {
  actor: 100,
  companyDomain: 253,
  companyName: 200,
  displayName: 200,
  eventKey: 255,
  noticeText: 2_000,
  policyVersion: 100,
  reason: 500,
  source: 100,
  sourceForm: 100,
  version: 100,
} as const;

function requiredText(
  field: string,
  value: string,
  maximumLength: number,
): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximumLength) {
    throw new Error(
      `${field} must contain between 1 and ${maximumLength} characters`,
    );
  }
  return normalized;
}

function optionalText(
  field: string,
  value: string | null | undefined,
  maximumLength: number,
  lowercase = false,
): string | null {
  if (value == null) return null;
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (normalized.length > maximumLength) {
    throw new Error(`${field} must not exceed ${maximumLength} characters`);
  }
  return lowercase ? normalized.toLowerCase() : normalized;
}

function serverEmailClassification(
  value: GrowthEmailClassification | undefined,
): GrowthEmailClassification {
  if (value === undefined) return 'unknown';
  if (value === 'work' || value === 'personal' || value === 'unknown') {
    return value;
  }
  throw new Error(
    'serverEmailClassification must be work, personal, or unknown',
  );
}

function validDate(field: string, value: Date): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${field} must be a valid Date`);
  }
  return value;
}

function toControlState(row: ContactControlRow): ContactControlState {
  const outreachApprovedAt = asDate(row.outreach_approved_at);
  const deletedAt = asDate(row.deleted_at);
  const latestHardStopAt = asDate(row.latest_hard_stop_at);
  const latestHardStop =
    row.latest_hard_stop_kind && latestHardStopAt
      ? { reason: row.latest_hard_stop_kind, occurredAt: latestHardStopAt }
      : null;
  const stoppedAfterApproval =
    latestHardStop !== null &&
    (outreachApprovedAt === null ||
      latestHardStop.occurredAt.getTime() >= outreachApprovedAt.getTime());
  const authorization =
    deletedAt || latestHardStop?.reason === 'deletion'
      ? 'deleted'
      : stoppedAfterApproval
        ? 'stopped'
        : outreachApprovedAt
          ? 'approved'
          : 'unapproved';

  return {
    contactId: row.id,
    authorization,
    canSend: authorization === 'approved',
    outreachApprovedAt,
    latestHardStop,
    deletedAt,
    updatedAt: new Date(row.updated_at),
  };
}

async function readControlState(
  transaction: SqlTransaction,
  contactId: string,
): Promise<ContactControlState> {
  const result = await transaction.execute<ContactControlRow>(
    `/* growth:read-control-state */
     select c.id,
            c.outreach_approved_at,
            c.deleted_at,
            c.updated_at,
            stop.kind as latest_hard_stop_kind,
            stop.occurred_at as latest_hard_stop_at
     from growth_contacts c
     left join lateral (
       select a.kind, a.occurred_at
       from growth_activity a
       where a.contact_id = c.id
         and a.kind = any($2::text[])
       order by a.occurred_at desc, a.id desc
       limit 1
     ) stop on true
     where c.id = $1`,
    [contactId, CONTACT_HARD_STOP_REASONS],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`Growth contact not found: ${contactId}`);
  return toControlState(row);
}

/** Reads the current control state of a contact; throws when it does not exist. */
export function readContactControlState(
  executor: SqlExecutor,
  contactId: string,
): Promise<ContactControlState> {
  return readControlState(executor, contactId);
}

async function findHardStops(
  transaction: SqlTransaction,
  contactId: string,
): Promise<HardStopRow[]> {
  const result = await transaction.execute<HardStopRow>(
    `/* growth:find-hard-stops */
     select kind, occurred_at
     from growth_activity
     where contact_id = $1
       and kind = any($2::text[])
     order by occurred_at desc, id desc`,
    [contactId, CONTACT_HARD_STOP_REASONS],
  );
  return result.rows;
}

async function validateFormReplayIfPresent(
  transaction: SqlTransaction,
  input: ActivityEnvelope,
): Promise<{ approvalGranted: boolean } | undefined> {
  const row = await readActivityByEventKey(transaction, input.eventKey);
  if (!row) return undefined;
  if (
    row.contact_id !== input.contactId ||
    row.project_id !== (input.projectId ?? null) ||
    row.kind !== input.kind
  ) {
    throw new Error(`Growth activity event key conflict: ${input.eventKey}`);
  }
  const approvalGranted = row.data['approval_granted'];
  if (typeof approvalGranted !== 'boolean') {
    throw new Error(`Growth activity event key conflict: ${input.eventKey}`);
  }
  const immutableData = { ...row.data };
  delete immutableData['approval_granted'];
  delete immutableData['blocked_by'];
  if (!Object.hasOwn(immutableData, 'email_classification')) {
    immutableData['email_classification'] = 'unknown';
  }
  if (canonicalJson(immutableData) !== canonicalJson(input.data)) {
    throw new Error(`Growth activity event key conflict: ${input.eventKey}`);
  }
  return { approvalGranted };
}

interface PreparedFormApproval {
  formBlocked: boolean;
  activeLookup: ReturnType<typeof createEmailLookupCandidates>[number];
  candidates: ReturnType<typeof createEmailLookupCandidates>;
  companyDomain: string | null;
  companyName: string | null;
  displayName: string | null;
  emailClassification: GrowthEmailClassification;
  eventKey: string;
  formRequestData: Record<string, unknown>;
  normalizedEmail: string;
  occurredAt: Date;
  policyVersion: string;
  source: string;
  sourceForm: string;
}

function prepareFormApproval(
  input: ApproveContactFromFormInput,
): PreparedFormApproval {
  const normalizedEmail = normalizeEmail(input.email);
  const candidates = createEmailLookupCandidates(
    normalizedEmail,
    input.keyring,
  );
  const activeLookup = candidates[0];
  if (!activeLookup) throw new Error('An active email HMAC key is required');
  const displayName = optionalText(
    'displayName',
    input.displayName,
    LIMITS.displayName,
  );
  const companyName = optionalText(
    'companyName',
    input.companyName,
    LIMITS.companyName,
  );
  const companyDomain = optionalText(
    'companyDomain',
    input.companyDomain,
    LIMITS.companyDomain,
    true,
  );
  const source = requiredText('source', input.source, LIMITS.source);
  const sourceForm = requiredText(
    'sourceForm',
    input.sourceForm,
    LIMITS.sourceForm,
  );
  const noticeText = requiredText(
    'noticeText',
    input.noticeText,
    LIMITS.noticeText,
  );
  const noticeVersion = requiredText(
    'noticeVersion',
    input.noticeVersion,
    LIMITS.version,
  );
  const policyVersion = requiredText(
    'policyVersion',
    input.policyVersion,
    LIMITS.policyVersion,
  );
  const eventKey = requiredText('eventKey', input.eventKey, LIMITS.eventKey);
  const occurredAt = validDate('occurredAt', input.occurredAt);
  const emailClassification = serverEmailClassification(
    input.serverEmailClassification,
  );
  const submittedFacts = input.submittedFacts ?? {};
  const formRequestData = {
    ...(input.serverFormBlocked ? { form_abuse_blocked: true } : {}),
    company_domain: companyDomain,
    company_name: companyName,
    display_name: displayName,
    email_classification: emailClassification,
    notice_text: noticeText,
    notice_version: noticeVersion,
    policy_version: policyVersion,
    provenance: 'form_submission',
    source,
    source_form: sourceForm,
    ...submittedFacts,
  };

  return {
    formBlocked: input.serverFormBlocked === true,
    activeLookup,
    candidates,
    companyDomain,
    companyName,
    displayName,
    emailClassification,
    eventKey,
    formRequestData,
    normalizedEmail,
    occurredAt,
    policyVersion,
    source,
    sourceForm,
  };
}

async function approvePreparedContactFromForm(
  transaction: SqlTransaction,
  prepared: PreparedFormApproval,
): Promise<FormApprovalControlState> {
  const {
    formBlocked,
    activeLookup,
    candidates,
    companyDomain,
    companyName,
    displayName,
    emailClassification,
    eventKey,
    formRequestData,
    normalizedEmail,
    occurredAt,
    policyVersion,
    source,
    sourceForm,
  } = prepared;

  await transaction.execute(
    `/* growth:lock-email */
       select pg_advisory_xact_lock(hashtextextended($1, 0))`,
    [normalizedEmail],
  );

  const storedVersions = await transaction.execute<{
    email_hmac_key_version: number;
  }>(
    `/* growth:read-key-versions */
       select distinct email_hmac_key_version
       from growth_contacts
       order by email_hmac_key_version`,
  );
  const configuredVersions = new Set(
    candidates.map(({ keyVersion }) => keyVersion),
  );
  const uncoveredVersions = storedVersions.rows
    .map(({ email_hmac_key_version }) => email_hmac_key_version)
    .filter((version) => !configuredVersions.has(version));
  if (uncoveredVersions.length > 0) {
    throw new Error(
      `Email HMAC rotation coverage error: configured keyring does not cover stored key version(s): ${uncoveredVersions.join(
        ', ',
      )}`,
    );
  }

  const found = await transaction.execute<IdentityContactRow>(
    `/* growth:find-contact */
       select c.id,
              c.email_lookup_hmac,
              c.email_hmac_key_version,
              c.outreach_approved_at,
              c.deleted_at,
              c.updated_at
       from growth_contacts c
       left join lateral (
         select true as matched
         from jsonb_to_recordset($1::jsonb)
           as candidate(key_version smallint, digest text)
         where (
             candidate.key_version = c.email_hmac_key_version
             and candidate.digest = c.email_lookup_hmac
           )
           or exists (
             select 1
             from growth_activity alias
             where alias.contact_id = c.id
               and alias.kind = 'contact.lookup_alias_added'
               and alias.data ->> 'key_version' = candidate.key_version::text
               and alias.data ->> 'digest' = candidate.digest
           )
         limit 1
       ) lookup on true
       where lookup.matched
          or c.email_normalized = $2
       limit 1
       for update of c`,
    [
      JSON.stringify(
        candidates.map(({ digest, keyVersion }) => ({
          digest,
          key_version: keyVersion,
        })),
      ),
      normalizedEmail,
    ],
  );

  let contact = found.rows[0];
  if (contact) {
    const contactLookup = candidates.find(
      ({ keyVersion }) => keyVersion === contact?.email_hmac_key_version,
    );
    if (
      !contactLookup ||
      !compareEmailLookupHmac(contactLookup.digest, contact.email_lookup_hmac)
    ) {
      throw new Error(
        `Email HMAC key version ${contact.email_hmac_key_version} has inconsistent secret material`,
      );
    }
    const replay = await validateFormReplayIfPresent(transaction, {
      eventKey,
      contactId: contact.id,
      occurredAt,
      kind: 'contact.form_submission',
      data: formRequestData,
    });
    if (replay) {
      return {
        ...(await readControlState(transaction, contact.id)),
        formApprovalGranted: replay.approvalGranted,
      };
    }
  } else if (await readActivityByEventKey(transaction, eventKey)) {
    throw new Error(`Growth activity event key conflict: ${eventKey}`);
  }

  if (!contact) {
    const inserted = await transaction.execute<IdentityContactRow>(
      `/* growth:insert-contact */
         insert into growth_contacts (
           email_normalized,
           email_lookup_hmac,
           email_hmac_key_version,
           display_name,
           company_name,
           company_domain,
           source
         ) values ($1, $2, $3, $4, $5, $6, $7)
         returning id, email_lookup_hmac, email_hmac_key_version,
                   outreach_approved_at, deleted_at, updated_at`,
      [
        normalizedEmail,
        activeLookup.digest,
        activeLookup.keyVersion,
        displayName,
        companyName,
        companyDomain,
        source,
      ],
    );
    contact = inserted.rows[0];
    if (!contact) throw new Error('Failed to insert growth contact');
  }

  if (contact.email_hmac_key_version < activeLookup.keyVersion) {
    await insertActivityOnce(transaction, {
      eventKey: `${CONTACT_LOOKUP_ALIAS_KIND}:${contact.id}:v${contact.email_hmac_key_version}`,
      contactId: contact.id,
      occurredAt,
      kind: CONTACT_LOOKUP_ALIAS_KIND,
      data: {
        digest: contact.email_lookup_hmac,
        key_version: contact.email_hmac_key_version,
      },
    });
    const rekeyed = await transaction.execute<IdentityContactRow>(
      `/* growth:rekey-contact */
         update growth_contacts
         set email_hmac_key_version = $2,
             email_lookup_hmac = $3
         where id = $1
           and email_hmac_key_version < $2
         returning id, email_lookup_hmac, email_hmac_key_version,
                   outreach_approved_at, deleted_at, updated_at`,
      [contact.id, activeLookup.keyVersion, activeLookup.digest],
    );
    contact = rekeyed.rows[0] ?? contact;
  } else if (
    contact.email_hmac_key_version === activeLookup.keyVersion &&
    !compareEmailLookupHmac(contact.email_lookup_hmac, activeLookup.digest)
  ) {
    throw new Error(
      `Email HMAC key version ${activeLookup.keyVersion} has inconsistent secret material`,
    );
  }

  const hardStops = await findHardStops(transaction, contact.id);
  const latestHardStop = hardStops[0];
  const deleted =
    contact.deleted_at !== null || latestHardStop?.kind === 'deletion';

  if (deleted) {
    return {
      ...(await readControlState(transaction, contact.id)),
      formApprovalGranted: false,
    };
  }

  const approvedAt = asDate(contact.outreach_approved_at);
  const latestHardStopAt = latestHardStop
    ? asDate(latestHardStop.occurred_at)
    : null;
  const currentlyApproved = approvedAt !== null;
  const stoppedAfterApproval =
    latestHardStopAt !== null &&
    (approvedAt === null || latestHardStopAt.getTime() >= approvedAt.getTime());
  const currentlyAuthorized = currentlyApproved && !stoppedAfterApproval;
  const approvalAllowed =
    !formBlocked && (currentlyAuthorized || latestHardStop == null);
  const activityResult = await insertActivityOnce(transaction, {
    eventKey,
    contactId: contact.id,
    occurredAt,
    kind: 'contact.form_submission',
    data: {
      approval_granted: approvalAllowed,
      ...(!approvalAllowed && latestHardStop
        ? { blocked_by: latestHardStop.kind }
        : {}),
      ...formRequestData,
    },
  });

  if (activityResult === 'replayed') {
    const replay = await validateFormReplayIfPresent(transaction, {
      eventKey,
      contactId: contact.id,
      occurredAt,
      kind: 'contact.form_submission',
      data: formRequestData,
    });
    if (!replay) {
      throw new Error(`Growth activity event key conflict: ${eventKey}`);
    }
    return {
      ...(await readControlState(transaction, contact.id)),
      formApprovalGranted: replay.approvalGranted,
    };
  }

  if (approvalAllowed) {
    const approvalData: FormOutreachApprovedActivityData = {
      email_classification: emailClassification,
      policy_version: policyVersion,
      source,
      source_form: sourceForm,
      verification: 'server_verified',
    };
    await transaction.execute(
      `/* growth:insert-form-outreach-approved */
         insert into growth_activity (
           event_key, contact_id, occurred_at, kind, data
         ) values ($1, $2, $3, 'form.outreach_approved', $4::jsonb)
         on conflict (event_key) do nothing`,
      [
        `${eventKey}:outreach-approved`,
        contact.id,
        occurredAt,
        JSON.stringify(approvalData),
      ],
    );
  }

  if (found.rows[0] && approvalAllowed) {
    await transaction.execute<ContactRow>(
      `/* growth:update-contact-facts */
         update growth_contacts
         set display_name = coalesce($2, display_name),
             company_name = coalesce($3, company_name),
             company_domain = coalesce($4, company_domain),
             source = $5
         where id = $1
           and deleted_at is null
         returning id, outreach_approved_at, deleted_at, updated_at`,
      [contact.id, displayName, companyName, companyDomain, source],
    );
  }

  if (approvalAllowed && !currentlyApproved && latestHardStop == null) {
    await transaction.execute<ContactRow>(
      `/* growth:set-form-approval */
         update growth_contacts
         set outreach_approved_at = $2
         where id = $1
           and deleted_at is null
           and outreach_approved_at is null
         returning id, outreach_approved_at, deleted_at, updated_at`,
      [contact.id, occurredAt],
    );
  }

  return {
    ...(await readControlState(transaction, contact.id)),
    formApprovalGranted: approvalAllowed,
  };
}

/**
 * Applies a form submission inside the caller's open transaction: locks the
 * email, checks keyring rotation coverage, records the submission, and approves
 * outreach only when no hard stop applies.
 */
export function approveContactFromFormInTransaction(
  transaction: SqlTransaction,
  input: ApproveContactFromFormInput,
): Promise<FormApprovalControlState> {
  return approvePreparedContactFromForm(
    transaction,
    prepareFormApproval(input),
  );
}

/** Applies a form submission in its own transaction; see {@link approveContactFromFormInTransaction}. */
export async function approveContactFromForm(
  executor: SqlExecutor,
  input: ApproveContactFromFormInput,
): Promise<FormApprovalControlState> {
  const prepared = prepareFormApproval(input);
  return executor.transaction((transaction) =>
    approvePreparedContactFromForm(transaction, prepared),
  );
}

/**
 * Restores outreach approval when every prior hard stop is explicitly allowed
 * and none is a deletion or postdates the request.
 */
export async function reauthorizeContact(
  executor: SqlExecutor,
  input: ReauthorizeContactInput,
): Promise<ReauthorizeContactResult> {
  return executor.transaction((transaction) =>
    reauthorizeContactInTransaction(transaction, input),
  );
}

async function reauthorizeContactInTransaction(
  transaction: SqlTransaction,
  input: ReauthorizeContactInput & {
    extraActivityData?: { install_observation_id: string };
  },
): Promise<ReauthorizeContactResult> {
  const contactId = requiredText('contactId', input.contactId, 100);
  const eventKey = requiredText('eventKey', input.eventKey, LIMITS.eventKey);
  const occurredAt = validDate('occurredAt', input.occurredAt);
  const actor = requiredText('actor', input.actor, LIMITS.actor);
  const reason = requiredText('reason', input.reason, LIMITS.reason);
  const source = requiredText('source', input.source, LIMITS.source);
  const policyVersion = requiredText(
    'policyVersion',
    input.policyVersion,
    LIMITS.policyVersion,
  );
  const allowed = new Set<ContactHardStopReason>(input.allowedPriorStops);

  const locked = await transaction.execute<ContactRow>(
    `/* growth:lock-contact */
       select id, outreach_approved_at, deleted_at, updated_at
       from growth_contacts
       where id = $1
       for update`,
    [contactId],
  );
  const contact = locked.rows[0];
  if (!contact) throw new Error(`Growth contact not found: ${contactId}`);

  const hardStops = await findHardStops(transaction, contactId);
  const blockedBy = [
    ...new Set(
      hardStops
        .map(({ kind }) => kind)
        .filter((kind) => kind === 'deletion' || !allowed.has(kind)),
    ),
  ];
  if (contact.deleted_at !== null && !blockedBy.includes('deletion')) {
    blockedBy.push('deletion');
  }

  if (blockedBy.length > 0) {
    return {
      reauthorized: false,
      blockedBy,
      state: await readControlState(transaction, contactId),
    };
  }

  const latestStopAt = hardStops.reduce<number | null>((latest, stop) => {
    const stopAt = asDate(stop.occurred_at)?.getTime();
    if (stopAt == null || Number.isNaN(stopAt)) {
      throw new Error(`Growth contact has an invalid hard-stop timestamp`);
    }
    return latest == null || stopAt > latest ? stopAt : latest;
  }, null);
  if (latestStopAt !== null && occurredAt.getTime() <= latestStopAt) {
    return {
      reauthorized: false,
      blockedBy: [...new Set(hardStops.map(({ kind }) => kind))],
      state: await readControlState(transaction, contactId),
    };
  }

  const activityResult = await insertActivityOnce(transaction, {
    eventKey,
    contactId,
    occurredAt,
    kind: 'contact.reauthorized',
    data: {
      actor,
      policy_version: policyVersion,
      prior_stops: [...new Set(hardStops.map(({ kind }) => kind))],
      provenance: 'founder_action',
      reason,
      source,
      ...(input.extraActivityData ?? {}),
    },
  });
  const inserted = activityResult === 'inserted';
  if (inserted) {
    await transaction.execute<ContactRow>(
      `/* growth:set-reauthorized */
         update growth_contacts
         set outreach_approved_at = $2,
             source = $3
         where id = $1
           and deleted_at is null
         returning id, outreach_approved_at, deleted_at, updated_at`,
      [contactId, occurredAt, source],
    );
  }

  return {
    reauthorized: inserted,
    blockedBy: [],
    state: await readControlState(transaction, contactId),
  };
}

/**
 * Erases a contact: records the deletion, cancels unsent jobs, removes private
 * activity and artifacts, scrubs contact fields, and keeps stop and delivery
 * audit state. Repeating the deletion is inert.
 */
export async function deleteContact(
  executor: SqlExecutor,
  input: DeleteContactInput,
): Promise<DeleteContactResult> {
  const contactId = requiredText('contactId', input.contactId, 100);
  const eventKey = requiredText('eventKey', input.eventKey, LIMITS.eventKey);
  const occurredAt = validDate('occurredAt', input.occurredAt);
  const actor = requiredText('actor', input.actor, LIMITS.actor);
  const source = requiredText('source', input.source, 90);
  const policyVersion = requiredText(
    'policyVersion',
    input.policyVersion,
    LIMITS.policyVersion,
  );
  const deletionActivity: ActivityEnvelope = {
    eventKey,
    contactId,
    occurredAt,
    kind: 'deletion',
    data: {
      actor,
      policy_version: policyVersion,
      provenance: 'verified_deletion',
      source,
    },
  };

  return executor.transaction(async (transaction) => {
    await privacyLock(transaction, true);
    const locked = await transaction.execute<ContactRow>(
      `/* growth:lock-contact */
       select id, outreach_approved_at, deleted_at, updated_at
       from growth_contacts
       where id = $1
       for update`,
      [contactId],
    );
    const contact = locked.rows[0];
    if (!contact) throw new Error(`Growth contact not found: ${contactId}`);

    if (contact.deleted_at !== null) {
      await validateActivityReplayIfPresent(transaction, deletionActivity);
      return {
        deleted: false,
        state: await readControlState(transaction, contactId),
        cancelledJobIds: [],
        retainedJobIds: [],
        unlinkedProjectIds: [],
        deletedArtifactIds: [],
      };
    }

    await insertActivityOnce(transaction, deletionActivity);
    await (input.redactEvidence ?? redactContactObservationEvidence)(
      transaction,
      contactId,
      occurredAt,
    );

    const jobs = await transaction.execute<{
      id: string;
      status: string;
      delivery_status: string;
      last_error_code: string | null;
    }>(
      `/* growth:cancel-and-scrub-jobs */
       with authorized_interrupted as materialized (
         select target.id
         from growth_jobs target
         where (
             target.contact_id = $1
             or target.project_id in (
               select id from growth_projects where contact_id = $1
             )
           )
           and target.status = 'leased'
           and target.delivery_status = 'not_submitted'
           and target.provider_email_id is null
           and target.lease_token is not null
           and exists (
             select 1
             from growth_activity submission_authorization
             where submission_authorization.contact_id = target.contact_id
               and submission_authorization.project_id is not distinct from target.project_id
               and submission_authorization.kind = 'delivery.submission_authorized'
               and submission_authorization.event_key =
                 'job:' || target.id::text ||
                 ':submission-authorized:' || target.lease_token::text
               and submission_authorization.data->>'lease_token' = target.lease_token::text
               and submission_authorization.data->>'bounded_stop_race' = 'true'
               and submission_authorization.occurred_at <= $2
           )
       )
       update growth_jobs
       set status = case
             when id in (select id from authorized_interrupted)
             then 'failed'
             when status in ('pending', 'leased')
              and delivery_status = 'not_submitted'
              and provider_email_id is null
             then 'cancelled'
             when status in ('pending', 'leased')
             then 'completed'
             else status
           end,
           delivery_status = case
             when id in (select id from authorized_interrupted)
             then 'unknown'
             else delivery_status
           end,
           last_error_code = case
             when id in (select id from authorized_interrupted)
             then 'provider_acceptance_interrupted_by_deletion'
             else last_error_code
           end,
           lease_until = null,
           lease_token = null,
           payload = case
             when kind = 'send_step' then
               jsonb_strip_nulls(jsonb_build_object(
                 'campaign_version', payload -> 'campaign_version',
                 'step', payload -> 'step'
               ))
             else '{}'::jsonb
           end,
           project_id = null,
           updated_at = $2
       where contact_id = $1
          or project_id in (
            select id from growth_projects where contact_id = $1
          )
       returning id, status, delivery_status, last_error_code`,
      [contactId, occurredAt],
    );
    const jobIds = jobs.rows.map(({ id }) => id);
    const interruptedAuthorizedJobIds = jobs.rows
      .filter(
        ({ status, delivery_status, last_error_code }) =>
          status === 'failed' &&
          delivery_status === 'unknown' &&
          last_error_code === 'provider_acceptance_interrupted_by_deletion',
      )
      .map(({ id }) => id);
    if (interruptedAuthorizedJobIds.length > 0) {
      await transaction.execute<{ event_key: string }>(
        `/* growth:insert-deletion-provider-unknown */
         insert into growth_activity (
           event_key, contact_id, project_id, kind, occurred_at, data
         )
         select 'job:' || job.id::text || ':provider-acceptance-unknown',
                job.contact_id,
                job.project_id,
                'delivery.acceptance_unknown',
                $2,
                jsonb_build_object(
                  'reason', 'authorized_worker_interrupted_by_deletion',
                  'delivery_status', 'unknown',
                  'manual_review', true
                )
         from growth_jobs job
         where job.id = any($1::uuid[])
           and job.status = 'failed'
           and job.delivery_status = 'unknown'
           and job.last_error_code =
               'provider_acceptance_interrupted_by_deletion'
         on conflict (event_key) do nothing
         returning event_key`,
        [interruptedAuthorizedJobIds, occurredAt],
      );
    }

    const artifacts = await transaction.execute<{ id: string }>(
      `/* growth:delete-artifacts */
       delete from growth_artifacts
       where contact_id = $1
          or job_id = any($2::uuid[])
          or project_id in (
            select id from growth_projects where contact_id = $1
          )
       returning id`,
      [contactId, jobIds],
    );

    const projects = await transaction.execute<{ id: string }>(
      `/* growth:unlink-projects */
       update growth_projects
       set contact_id = null
       where contact_id = $1
       returning id`,
      [contactId],
    );
    const projectIds = projects.rows.map(({ id }) => id);

    await transaction.execute<{ id: bigint }>(
      `/* growth:delete-private-activity */
       delete from growth_activity
       where (contact_id = $1 or project_id = any($2::uuid[]))
         and kind <> all($3::text[])
         and kind not like 'delivery.%'
         and kind <> 'campaign.step_accepted'
         and kind <> 'contact.lookup_alias_added'
       returning id`,
      [contactId, projectIds, CONTACT_HARD_STOP_REASONS],
    );

    await transaction.execute<{ id: bigint }>(
      `/* growth:scrub-retained-activity */
       update growth_activity
       set project_id = null,
           data = case
             when kind = 'delivery.submission_authorized' then
               jsonb_strip_nulls(jsonb_build_object(
                 'lease_token', data -> 'lease_token',
                 'bounded_stop_race', data -> 'bounded_stop_race'
               ))
             when kind = 'contact.lookup_alias_added' then
               jsonb_strip_nulls(jsonb_build_object(
                 'key_version', data -> 'key_version',
                 'digest', data -> 'digest'
               ))
             else jsonb_strip_nulls(jsonb_build_object(
               'reason', data -> 'reason',
               'delivery_status', data -> 'delivery_status',
               'manual_review', data -> 'manual_review',
               'provider_event_id', data -> 'provider_event_id',
               'provider_ref', data -> 'provider_ref'
             ))
           end
       where (contact_id = $1 or project_id = any($2::uuid[]))
         and event_key <> $3
       returning id`,
      [contactId, projectIds, eventKey],
    );

    await transaction.execute<ContactRow>(
      `/* growth:scrub-contact */
       update growth_contacts
       set email_normalized = null,
           display_name = null,
           company_name = null,
           company_domain = null,
           outreach_approved_at = null,
           source = $3,
           deleted_at = $2
       where id = $1
         and deleted_at is null
       returning id, outreach_approved_at, deleted_at, updated_at`,
      [contactId, occurredAt, `deleted:${source}`],
    );

    const cancelledJobIds = jobs.rows
      .filter(({ status }) => status === 'cancelled')
      .map(({ id }) => id);
    const retainedJobIds = jobs.rows
      .filter(({ status }) => status !== 'cancelled')
      .map(({ id }) => id);

    return {
      deleted: true,
      state: await readControlState(transaction, contactId),
      cancelledJobIds,
      retainedJobIds,
      unlinkedProjectIds: projectIds,
      deletedArtifactIds: artifacts.rows.map(({ id }) => id),
    };
  });
}
