/** Lifecycle status of a growth job row. */
export type GrowthJobStatus =
  'pending' | 'leased' | 'completed' | 'failed' | 'cancelled';

/** Provider delivery status recorded against a growth job. */
export type GrowthDeliveryStatus =
  | 'not_submitted'
  | 'submitted'
  | 'delivered'
  | 'bounced'
  | 'complained'
  | 'suppressed'
  | 'failed'
  | 'unknown';

/** The kinds of work the growth job queue runs. */
export type GrowthJobKind =
  'fulfill' | 'notify' | 'send_step' | 'digest' | 'reply_reconcile';

/** The framework choices on the Get unstuck form. */
export const UNSTUCK_FRAMEWORKS = [
  'react',
  'angular',
  'both',
  'not_sure',
] as const;

/** One of {@link UNSTUCK_FRAMEWORKS}. */
export type UnstuckFramework = (typeof UNSTUCK_FRAMEWORKS)[number];

/** Whether a submitted address looks like a work or personal mailbox. */
export type GrowthEmailClassification = 'work' | 'personal' | 'unknown';

/** Payload of the `form.outreach_approved` activity. */
export interface FormOutreachApprovedActivityData {
  email_classification: GrowthEmailClassification;
  policy_version: string;
  source: string;
  source_form: string;
  verification: 'server_verified';
}

/** A person the growth programme knows about. */
export interface GrowthContact {
  id: string;
  emailNormalized: string | null;
  emailLookupHmac: string;
  emailHmacKeyVersion: number;
  displayName: string | null;
  companyName: string | null;
  companyDomain: string | null;
  outreachApprovedAt: Date | null;
  source: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** A project (anonymous or claimed) tracked by its PostHog distinct id. */
export interface GrowthProject {
  id: string;
  contactId: string | null;
  posthogDistinctId: string;
  claimKeyHash: string;
  claimConsumedAt: Date | null;
  claimMethod: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** An append-only activity event, deduplicated by `eventKey`. */
export interface GrowthActivity {
  id: bigint;
  eventKey: string;
  contactId: string | null;
  projectId: string | null;
  kind: string;
  occurredAt: Date;
  data: Record<string, unknown>;
  createdAt: Date;
}

/** A queued unit of work. */
export interface GrowthJob {
  id: string;
  kind: GrowthJobKind | (string & {});
  contactId: string | null;
  projectId: string | null;
  status: GrowthJobStatus;
  availableAt: Date;
  leaseUntil: Date | null;
  leaseToken: string | null;
  attempts: number;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  providerEmailId: string | null;
  rfcMessageId: string | null;
  gmailSeedMessageId: string | null;
  deliveryStatus: GrowthDeliveryStatus;
  lastErrorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A versioned output produced by a job. */
export interface GrowthArtifact {
  id: string;
  jobId: string;
  contactId: string | null;
  projectId: string | null;
  kind: string;
  schemaVersion: number;
  content: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Why a contact entered campaign v1: a Get unstuck form approval, a founder
 * approval from the install digest, or a linked install and runtime approval.
 */
export type GrowthCampaignEnrollmentReason =
  'unstuck_form' | 'install_digest' | 'install_runtime';

/**
 * The form facts a lifecycle job may use. The message itself never leaves the
 * activity log; only whether one was given.
 */
export interface GrowthLifecycleFormSubmission {
  form_kind?: 'unstuck';
  submission_id?: string;
  message_present?: boolean;
}

/** What a lifecycle job knows about its contact when it renders a message. */
export interface GrowthLifecycleJobContext {
  contactId: string;
  displayName: string | null;
  companyName: string | null;
  companyDomain: string | null;
  emailClassification: GrowthEmailClassification;
  /** The accepted form submission behind the job, or `null` when there is none. */
  formSubmission: GrowthLifecycleFormSubmission | null;
  /** When the contact was enrolled in campaign v1, or `null`. */
  enrollmentAt: Date | null;
  campaignEnrollmentReason: GrowthCampaignEnrollmentReason | null;
}
