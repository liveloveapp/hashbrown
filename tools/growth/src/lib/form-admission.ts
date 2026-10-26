import { createHmac } from 'node:crypto';

import { canonicalJson } from './activity.ts';
import { normalizeRecipientEmail } from './crypto.ts';
import type { SqlTransaction } from './database.ts';
import { assessFormAbuse, type FormAbuseAssessment } from './form-abuse.ts';
import type {
  AcceptFormSubmissionInput,
  AcceptFormSubmissionResult,
} from './forms.ts';

/** Submissions one email may make per clock hour. */
const EMAIL_HOURLY_LIMIT = 5;
/** Submissions one email may make per UTC day. */
const EMAIL_DAILY_LIMIT = 10;
/** Submissions one trusted client IP may make per clock hour. */
const IP_HOURLY_LIMIT = 20;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * Thrown when a form submission exceeds its hourly email or IP budget or its
 * daily email budget. The route answers 429 with `Retry-After: retryAfterSec`.
 */
export class FormRateLimitError extends Error {
  /**
   * @param retryAfterSec - Seconds until the exhausted window ends: the clock
   * hour (1..3600) or the UTC day (1..86400).
   */
  constructor(readonly retryAfterSec: number) {
    super('Form submission rate limited');
    this.name = 'FormRateLimitError';
  }
}

/**
 * Thrown when a form submission's identity can never be admitted: a reused
 * `submission_id` arrived with a changed request, or its jobs already belong
 * to another contact. A retry cannot succeed, so the route answers 422 rather
 * than a retryable 503.
 */
export class FormSubmissionConflictError extends Error {
  /** @param message - A fixed description; never submitted values. */
  constructor(message: string) {
    super(message);
    this.name = 'FormSubmissionConflictError';
  }
}

/** What {@link prepareFormAdmission} decided before the submission is applied. */
export interface FormAdmission {
  assessment: FormAbuseAssessment;
  /** HMAC of the canonical request under the active email key. */
  requestDigest: string;
  /** True when the budget store failed and the submission was admitted anyway. */
  limiterUnavailable: boolean;
  /** The original result when this submission id was already admitted. */
  replay?: AcceptFormSubmissionResult;
}

function digest(secret: string | Uint8Array, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

/**
 * Admits a form submission inside the caller's transaction. It serializes on
 * the submission id and the normalized email (advisory locks), then:
 *
 * - replays the recorded `form:<id>:assessment` result when the submission id
 *   was already admitted with a byte-identical request (no budget is spent),
 *   and throws {@link FormSubmissionConflictError} when the request changed;
 * - otherwise scores the submission with {@link assessFormAbuse} and charges
 *   the budgets in `growth_collection_budgets` inside a savepoint: 5 per email
 *   per clock hour (`form:email:<hmac>`), 10 per email per UTC day
 *   (`form:email-day:<hmac>`), and 20 per trusted client IP per clock hour
 *   (`form:ip:<hmac>`) when one is given. A blocked submission (honeypot or
 *   abuse score) charges only the IP budget, so spam cannot spend a real
 *   visitor's email budget.
 *
 * The Get unstuck form carries no name or company, so the rapid identity
 * change signal (a different name and company for one email within a minute)
 * has nothing to compare and is not evaluated.
 *
 * @throws {FormRateLimitError} When a budget is exhausted. Any other budget
 * failure fails open and sets `limiterUnavailable`.
 */
export async function prepareFormAdmission(
  tx: SqlTransaction,
  input: AcceptFormSubmissionInput,
): Promise<FormAdmission> {
  const email = normalizeRecipientEmail(input.email);
  const request = canonicalJson({
    email,
    form: {
      message: input.form.message.trim(),
    },
    honeypot: input.honeypot?.trim() || null,
  });
  const requestDigest = digest(
    input.keyring.active.secret,
    `form-request:${request}`,
  );
  const eventKey = `form:${input.submissionId}:assessment`;
  await tx.execute(
    '/* growth:lock-form-submission */ select pg_advisory_xact_lock(hashtextextended($1, 0))',
    [eventKey],
  );
  await tx.execute(
    '/* growth:lock-form-email */ select pg_advisory_xact_lock(hashtextextended($1, 0))',
    [email],
  );
  const prior = await tx.execute<{ data: Record<string, unknown> }>(
    '/* growth:read-form-assessment */ select data from growth_activity where event_key = $1',
    [eventKey],
  );
  const recorded = prior.rows[0];
  if (recorded) {
    const data = recorded.data;
    const key = [input.keyring.active, ...(input.keyring.previous ?? [])].find(
      (candidate) => candidate.version === data['key_version'],
    );
    if (
      !key ||
      digest(key.secret, `form-request:${request}`) !== data['request_digest']
    ) {
      throw new FormSubmissionConflictError(
        'Form submission identity conflict',
      );
    }
    return {
      assessment: data['assessment'] as FormAbuseAssessment,
      replay: data['result'] as AcceptFormSubmissionResult,
      requestDigest,
      limiterUnavailable: data['limiter_unavailable'] === true,
    };
  }

  const assessment = assessFormAbuse({
    email,
    message: input.form.message,
    honeypot: input.honeypot,
  });

  const now = input.occurredAt.getTime();
  const window = new Date(Math.floor(now / HOUR_MS) * HOUR_MS);
  const day = new Date(Math.floor(now / DAY_MS) * DAY_MS);
  const emailDigest = digest(
    input.keyring.active.secret,
    `form-email:${email}`,
  );
  const emailBuckets =
    assessment.decision === 'blocked'
      ? []
      : [
          {
            key: `form:email:${emailDigest}`,
            window,
            windowMs: HOUR_MS,
            limit: EMAIL_HOURLY_LIMIT,
          },
          {
            key: `form:email-day:${emailDigest}`,
            window: day,
            windowMs: DAY_MS,
            limit: EMAIL_DAILY_LIMIT,
          },
        ];
  const buckets = [
    ...emailBuckets,
    ...(input.trustedClientIp
      ? [
          {
            key: `form:ip:${digest(
              input.keyring.active.secret,
              `form-ip:${input.trustedClientIp}`,
            )}`,
            window,
            windowMs: HOUR_MS,
            limit: IP_HOURLY_LIMIT,
          },
        ]
      : []),
  ].sort((a, b) => a.key.localeCompare(b.key));
  let limiterUnavailable = false;
  await tx.execute('savepoint growth_form_budget');
  try {
    for (const bucket of buckets) {
      const count = await tx.execute<{ count: string | number }>(
        `/* growth:consume-form-budget */
         insert into growth_collection_budgets(bucket_key, window_start, count) values($1,$2,1)
         on conflict(bucket_key,window_start) do update set count=growth_collection_budgets.count+1 returning count`,
        [bucket.key, bucket.window],
      );
      const charged = count.rows[0];
      if (!charged) throw new Error('Form budget unavailable');
      if (Number(charged.count) > bucket.limit) {
        throw new FormRateLimitError(
          Math.max(
            1,
            Math.ceil((bucket.window.getTime() + bucket.windowMs - now) / 1000),
          ),
        );
      }
    }
    await tx.execute(
      `/* growth:expire-form-budgets */
       delete from growth_collection_budgets where (bucket_key,window_start) in
       (select bucket_key,window_start from growth_collection_budgets where bucket_key like 'form:%'
        and window_start < $1::timestamptz - interval '1 day' limit 100)`,
      [window],
    );
    await tx.execute('release savepoint growth_form_budget');
  } catch (error) {
    await tx.execute('rollback to savepoint growth_form_budget');
    await tx.execute('release savepoint growth_form_budget');
    if (error instanceof FormRateLimitError) throw error;
    limiterUnavailable = true;
  }
  return { assessment, requestDigest, limiterUnavailable };
}

/**
 * Records the admission as `form.abuse_assessed` under
 * `form:<submission_id>:assessment`: the assessment, the result returned to
 * the caller, the request digest and its key version. It holds no email or
 * message, and it is what {@link prepareFormAdmission} replays.
 */
export async function recordFormAdmission(
  tx: SqlTransaction,
  input: AcceptFormSubmissionInput,
  admission: FormAdmission,
  result: AcceptFormSubmissionResult,
): Promise<void> {
  await tx.execute(
    `/* growth:record-form-assessment */
     insert into growth_activity(event_key,contact_id,kind,occurred_at,data)
     values($1,$2,'form.abuse_assessed',$3,$4::jsonb)`,
    [
      `form:${input.submissionId}:assessment`,
      result.contactId,
      input.occurredAt,
      JSON.stringify({
        assessment: admission.assessment,
        result,
        submission_id: input.submissionId,
        request_digest: admission.requestDigest,
        key_version: input.keyring.active.version,
        limiter_unavailable: admission.limiterUnavailable,
      }),
    ],
  );
}
