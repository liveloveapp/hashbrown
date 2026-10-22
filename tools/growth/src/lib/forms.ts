import {
  type ApproveContactFromFormInput,
  approveContactFromFormInTransaction,
  type FormApprovalControlState,
  type FormSubmittedFacts,
  FULFILLMENT_EPOCH_FATAL_STOP_REASONS,
} from './contacts.ts';
import { type EmailHmacKeyring, normalizeRecipientEmail } from './crypto.ts';
import type { SqlExecutor, SqlTransaction } from './database.ts';
import { prepareFormAdmission, recordFormAdmission } from './form-admission.ts';
import { UNSTUCK_FRAMEWORKS, type UnstuckFramework } from './models.ts';
import { isPersonalEmailDomain } from './observability/install-digest.ts';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** Shortest "Where are you stuck?" answer, after trimming. */
export const UNSTUCK_MESSAGE_MIN_LENGTH = 20;
/** Longest "Where are you stuck?" answer, after trimming. */
export const UNSTUCK_MESSAGE_MAX_LENGTH = 1_000;

/** The fields of a Get unstuck submission. */
export interface UnstuckSubmission {
  framework: UnstuckFramework;
  /** "Where are you stuck?"; trimmed, then 20 to 1,000 characters. */
  message: string;
}

/**
 * A Get unstuck submission the route has already validated. The source is
 * always `website` and the source form always `unstuck`.
 */
export interface AcceptFormSubmissionInput {
  /** Client-generated UUIDv4, reused for byte-identical retries. */
  submissionId: string;
  email: string;
  form: UnstuckSubmission;
  /** The disclosure shown beside the button, stored verbatim as consent. */
  noticeText: string;
  noticeVersion: string;
  policyVersion: string;
  occurredAt: Date;
  keyring: EmailHmacKeyring;
  /** The `website_url` honeypot; any non-blank value blocks the submission. */
  honeypot?: string;
  /** The client IP from a trusted proxy header, for the per-IP budget. */
  trustedClientIp?: string;
}

/** The outcome of {@link acceptFormSubmission}, replayed for retries. */
export interface AcceptFormSubmissionResult {
  accepted: true;
  /** Whether this submission approved campaign outreach. */
  approved: boolean;
  contactId: string;
  submissionId: string;
  /**
   * Present when no mail will follow: the submission was blocked as abuse, or
   * the contact has a hard stop other than an unsubscribe or a reply.
   */
  deliverySuppressed?: true;
}

/** Injectable collaborators of {@link acceptFormSubmission}. */
export interface AcceptFormSubmissionDependencies {
  approveContact: (
    transaction: SqlTransaction,
    input: ApproveContactFromFormInput,
  ) => Promise<FormApprovalControlState>;
}

const defaultDependencies: AcceptFormSubmissionDependencies = {
  approveContact: approveContactFromFormInTransaction,
};

function uuid(field: string, value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!UUID_V4.test(normalized)) {
    throw new Error(`${field} must be a UUIDv4`);
  }
  return normalized;
}

function unstuckSubmission(form: UnstuckSubmission): UnstuckSubmission {
  if (!(UNSTUCK_FRAMEWORKS as readonly unknown[]).includes(form.framework)) {
    throw new Error(
      `framework must be one of: ${UNSTUCK_FRAMEWORKS.join(', ')}`,
    );
  }
  const message = typeof form.message === 'string' ? form.message.trim() : '';
  if (
    message.length < UNSTUCK_MESSAGE_MIN_LENGTH ||
    message.length > UNSTUCK_MESSAGE_MAX_LENGTH
  ) {
    throw new Error(
      `message must be ${UNSTUCK_MESSAGE_MIN_LENGTH} to ${UNSTUCK_MESSAGE_MAX_LENGTH} characters`,
    );
  }
  return { framework: form.framework, message };
}

/**
 * Whether mail to the contact is over, judged as `authorizeLeasedJobForSubmission`
 * judges `fulfill`: the contact is deleted, or a stop in
 * {@link FULFILLMENT_EPOCH_FATAL_STOP_REASONS} occurred at or after its
 * outreach approval (at any time when it was never approved). A later
 * unsubscribe or reply never lifts an earlier complaint or bounce.
 */
async function deliveryBlocked(
  transaction: SqlTransaction,
  contactId: string,
): Promise<boolean> {
  const result = await transaction.execute<{ blocked: boolean }>(
    `/* growth:read-form-delivery-block */
     select c.deleted_at is not null
            or exists (
              select 1
              from growth_activity deletion_stop
              where deletion_stop.contact_id = c.id
                and deletion_stop.kind = 'deletion'
            )
            or exists (
              select 1
              from growth_activity fatal_stop
              where fatal_stop.contact_id = c.id
                and fatal_stop.kind = any($2::text[])
                and (
                  c.outreach_approved_at is null
                  or fatal_stop.occurred_at >= c.outreach_approved_at
                )
            ) as blocked
     from growth_contacts c
     where c.id = $1`,
    [contactId, FULFILLMENT_EPOCH_FATAL_STOP_REASONS],
  );
  return result.rows[0]?.blocked === true;
}

/**
 * Accepts a Get unstuck submission in one transaction: admits it (replay,
 * abuse score and hourly and daily budgets; see `prepareFormAdmission`),
 * records the `contact.form_submission` consent record as
 * `form:<id>:accepted` with the server's work or personal email
 * classification, approves outreach when no hard stop applies, and enqueues
 * `notify` per submission (`form:<id>:notify`) and `fulfill` once per contact
 * per UTC day (`form:contact:<contact_id>:fulfill:<yyyy-mm-dd>`, carrying the
 * day's first submission id), so one address gets at most one acknowledgement
 * a day. A submission blocked as abuse, from a deleted contact, or from a
 * contact with a complaint, bounce, suppression or invalid-address stop since
 * its approval (even one followed by an unsubscribe or reply) gets no jobs and
 * returns `deliverySuppressed`. Retrying a submission id returns the original
 * result.
 *
 * @throws When the submission id, framework or message is invalid (before any
 * transaction opens), when a retried submission id carries a different
 * request, or when its jobs belong to another contact.
 * @throws {FormRateLimitError} When an hourly or daily budget is exhausted.
 */
export async function acceptFormSubmission(
  executor: SqlExecutor,
  input: AcceptFormSubmissionInput,
  dependencies: AcceptFormSubmissionDependencies = defaultDependencies,
): Promise<AcceptFormSubmissionResult> {
  const submissionId = uuid('submissionId', input.submissionId);
  const form = unstuckSubmission(input.form);
  const facts: FormSubmittedFacts = {
    form_kind: 'unstuck',
    submission_id: submissionId,
    framework: form.framework,
    message: form.message,
  };
  const normalized: AcceptFormSubmissionInput = {
    ...input,
    submissionId,
    form,
  };

  const domain = normalizeRecipientEmail(input.email).split('@')[1] ?? '';
  const emailClassification = isPersonalEmailDomain(domain)
    ? 'personal'
    : 'work';

  return executor.transaction(async (transaction) => {
    const admission = await prepareFormAdmission(transaction, normalized);
    if (admission.replay) return admission.replay;
    const blocked = admission.assessment.decision === 'blocked';
    const contact = await dependencies.approveContact(transaction, {
      email: normalized.email,
      source: 'website',
      sourceForm: 'unstuck',
      noticeText: normalized.noticeText,
      noticeVersion: normalized.noticeVersion,
      policyVersion: normalized.policyVersion,
      eventKey: `form:${submissionId}:accepted`,
      occurredAt: normalized.occurredAt,
      keyring: normalized.keyring,
      serverEmailClassification: emailClassification,
      submittedFacts: facts,
      ...(blocked ? { serverFormBlocked: true } : {}),
    });
    const approved = !blocked && contact.formApprovalGranted;
    const suppressed =
      blocked ||
      contact.authorization === 'deleted' ||
      (await deliveryBlocked(transaction, contact.contactId));
    if (suppressed) {
      const result: AcceptFormSubmissionResult = {
        accepted: true,
        approved: false,
        contactId: contact.contactId,
        submissionId,
        deliverySuppressed: true,
      };
      await recordFormAdmission(transaction, normalized, admission, result);
      return result;
    }

    const jobs = await transaction.execute<{ idempotency_key: string }>(
      `/* growth:enqueue-form-jobs */
       with requested(kind, idempotency_key, payload) as (
         select 'fulfill', $5, $4::jsonb
         union all
         select 'notify', 'form:' || $3 || ':notify', $4::jsonb
       ), inserted as (
         insert into growth_jobs (
           kind, contact_id, status, available_at, idempotency_key, payload
         )
         select kind, $1, 'pending', $2, idempotency_key, payload
         from requested
         on conflict (idempotency_key) do nothing
         returning idempotency_key
       )
       select idempotency_key from inserted
       union all
       select requested.idempotency_key
       from requested
       join growth_jobs existing
         on existing.idempotency_key = requested.idempotency_key
       where not exists (
               select 1 from inserted
               where inserted.idempotency_key = requested.idempotency_key
             )
         and existing.contact_id = $1
         and existing.kind = requested.kind
         and (
           existing.payload = requested.payload
           -- The day's acknowledgement keeps its first submission id.
           or (
             requested.kind = 'fulfill'
             and existing.payload->>'form_kind' = requested.payload->>'form_kind'
           )
         )`,
      [
        contact.contactId,
        normalized.occurredAt,
        submissionId,
        JSON.stringify({ form_kind: 'unstuck', submission_id: submissionId }),
        `form:contact:${contact.contactId}:fulfill:${normalized.occurredAt
          .toISOString()
          .slice(0, 10)}`,
      ],
    );
    if (jobs.rows.length !== 2) {
      throw new Error(`Growth form job idempotency conflict: ${submissionId}`);
    }

    const result: AcceptFormSubmissionResult = {
      accepted: true,
      approved,
      contactId: contact.contactId,
      submissionId,
    };
    await recordFormAdmission(transaction, normalized, admission, result);
    return result;
  });
}
