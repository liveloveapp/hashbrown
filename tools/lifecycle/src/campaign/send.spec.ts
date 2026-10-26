import { expect, test, vi } from 'vitest';

import {
  createGrowthActionToken,
  createUnsubscribeActionUrl,
  createUnsubscribeActionUrlForJob,
  FOUNDER_APPROVE_INSTALL_TOKEN_MAX_AGE_SECONDS,
  FOUNDER_STOP_TOKEN_MAX_AGE_SECONDS,
  type GrowthJob,
  type GrowthLifecycleJobContext,
  JobLeaseConflictError,
  ProviderAttemptError,
  providerIdempotencyKey,
  type RecipientSendResult,
  type SqlExecutor,
  unsubscribeActionUrlValue,
  verifyGrowthActionToken,
} from '../growth.ts';
import { DeterministicLifecycleJobError } from '../job-errors.ts';
import {
  campaignGreeting,
  createDefaultLifecycleJobDependencies,
  createLifecycleAppJobHandlers,
  dispatchLifecycleAppOwnedJob,
  INSTALL_DIGEST_CANDIDATE_LIMIT,
  type LifecycleJobDependencies,
  type LifecycleResendClient,
  loadLifecycleRuntimeConfiguration,
  loadRecipientDeliveryPolicy,
  prepareCampaignMessage,
  RETRY_DELAY_MS,
  STEP_NAMES,
} from './send.ts';

const NOW = new Date('2026-09-01T14:03:00.000Z');
const CONTACT_ID = '00000000-0000-4000-8000-000000000002';
const JOB_ID = '00000000-0000-4000-8000-000000000001';
const LEASE_TOKEN = '00000000-0000-4000-8000-000000000099';
const ORIGIN = 'https://preview.hashbrown.test';
const TOKEN_KEY = {
  version: 1,
  secret: 'lifecycle-send-test-token-secret-material',
};
const EMAIL_KEYRING = {
  active: { version: 1, secret: 'lifecycle-send-test-email-secret-material' },
};
const DIGEST_CANDIDATE = {
  email: 'dev@corp.example',
  companyDomain: 'corp.example',
  gitDisplayName: 'Dev Person',
  repositoryProvider: 'github',
  repositoryOwner: 'corp',
  gitConfigOrigin: 'global' as const,
  packages: [{ packageName: '@hashbrownai/core', packageVersion: '0.8.0' }],
  installCount: 1,
  firstSeenAt: new Date('2026-08-31T15:00:00.000Z'),
  lastSeenAt: new Date('2026-08-31T15:00:00.000Z'),
  firstInstallObservationId: '0f1e2d3c-4b5a-4c7d-8e9f-a0b1c2d3e4f5',
  emailLookupHmac: 'a'.repeat(64),
  emailKeyVersion: 1,
  framework: 'react' as const,
  highestMilestone: 'streamed' as const,
  scoreTier: 'medium' as const,
};
const BASE_ENVIRONMENT = {
  DELIVERY_ENABLED: 'true',
  DELIVERY_ENVIRONMENT: 'preview',
  GROWTH_DATABASE_ENVIRONMENT: 'preview',
  RESEND_SENDER_VERIFIED: 'true',
  RESEND_TRACKING_DISABLED: 'true',
  RESEND_NON_PRODUCTION_ALLOWLIST: 'founder@hashbrown.test, qa@hashbrown.test',
  RESEND_API_KEY: 're_test_not_a_real_key',
  FOUNDER_NOTIFICATION_EMAIL: 'founder@hashbrown.test',
  GROWTH_PUBLIC_ACTION_ORIGIN: ORIGIN,
  GROWTH_ACTION_TOKEN_ACTIVE_VERSION: '1',
  GROWTH_ACTION_TOKEN_ACTIVE_SECRET: TOKEN_KEY.secret,
};

function job(
  kind = 'send_step',
  payload: Record<string, unknown> = { campaign_version: 'v1', step: 1 },
): GrowthJob {
  return {
    id: JOB_ID,
    kind,
    contactId: CONTACT_ID,
    projectId: null,
    status: 'leased',
    availableAt: NOW,
    leaseUntil: new Date(NOW.getTime() + 60_000),
    leaseToken: LEASE_TOKEN,
    attempts: 1,
    idempotencyKey: `${kind}:fixture`,
    payload,
    providerEmailId: null,
    rfcMessageId: null,
    deliveryStatus: 'not_submitted',
    lastErrorCode: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function digestJob(): GrowthJob {
  return {
    ...job('digest', {
      business_date: '2026-09-01',
      digest_kind: 'install_identities',
    }),
    contactId: null,
  };
}

function context(
  overrides: Partial<GrowthLifecycleJobContext> = {},
): GrowthLifecycleJobContext {
  return {
    contactId: CONTACT_ID,
    displayName: 'Ada Lovelace',
    companyName: 'Example',
    companyDomain: 'example.com',
    emailClassification: 'work',
    formSubmission: { form_kind: 'unstuck', message_present: true },
    enrollmentAt: new Date('2026-08-31T12:00:00.000Z'),
    campaignEnrollmentReason: 'unstuck_form',
    ...overrides,
  };
}

function unsubscribeUrl() {
  return createUnsubscribeActionUrl(
    { contactId: CONTACT_ID, issuedAt: NOW, eventNonce: JOB_ID },
    TOKEN_KEY,
    ORIGIN,
  );
}

function transactionalExecutor(): SqlExecutor {
  const stub = {
    execute: vi.fn(),
    transaction: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
      operation(stub),
    ),
  };
  return stub as unknown as SqlExecutor;
}

function dependencies(
  overrides: Partial<LifecycleJobDependencies> = {},
): LifecycleJobDependencies {
  return {
    now: () => NOW,
    deliveryEnabled: true,
    publicActionOrigin: ORIGIN,
    emailKeyring: EMAIL_KEYRING,
    readJobContext: vi.fn().mockResolvedValue(context()),
    readNotificationSubmission: vi.fn().mockResolvedValue({
      message: 'The stream stops after the first tool call.',
    }),
    scoreContact: vi.fn().mockResolvedValue({
      subject: { type: 'contact', id: CONTACT_ID },
      score: 30,
      tier: 'medium',
      policyVersion: 'growth-score-policy:v1',
      scoreVersion: 'growth-score-policy:v1',
      reasons: [
        {
          code: 'contact.approved_work_email_form',
          points: 30,
          identifiers: ['once'],
        },
      ],
    }),
    createUnsubscribeUrl: vi.fn(() => unsubscribeUrl()),
    createUnsubscribeUrlForJob: vi.fn((job) =>
      createUnsubscribeActionUrlForJob(job, TOKEN_KEY, ORIGIN),
    ),
    createActionToken: vi.fn((input) =>
      createGrowthActionToken(input, TOKEN_KEY),
    ),
    sendRecipient: vi
      .fn()
      .mockResolvedValue({ accepted: true, providerEmailId: 'provider-1' }),
    deferJob: vi.fn().mockResolvedValue(job()),
    completeJob: vi.fn().mockResolvedValue(job()),
    cancelJob: vi.fn().mockResolvedValue(job()),
    failJob: vi.fn().mockResolvedValue(job()),
    claimInternalNotification: vi.fn().mockResolvedValue('claimed'),
    markInternalNotificationUnknown: vi.fn().mockResolvedValue(job()),
    sendInternalNotification: vi
      .fn()
      .mockResolvedValue({ outcome: 'accepted' }),
    readInstallDigestCandidates: vi.fn().mockResolvedValue([DIGEST_CANDIDATE]),
    readInstallDigestContext: vi.fn().mockResolvedValue({
      since: new Date(NOW.getTime() - 86_400_000),
      anonymousInstallSubjects: 2,
      ciInstallSubjects: 1,
    }),
    markInstallDigestReported: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

test('loadLifecycleRuntimeConfiguration accepts only true/false and requires a canonical start time when enrollment is on', () => {
  const startAt = '2026-09-01T00:00:00.000Z';

  const defaults = loadLifecycleRuntimeConfiguration({});
  const enabled = loadLifecycleRuntimeConfiguration({
    CAMPAIGN_ENABLED: 'true',
    CAMPAIGN_ENROLLMENT_ENABLED: 'true',
    CAMPAIGN_ENROLLMENT_START_AT: startAt,
    DELIVERY_ENABLED: 'true',
    GROWTH_OBSERVATION_PROCESSING_ENABLED: 'false',
    GROWTH_INSTALL_DIGEST_ENABLED: 'true',
    GROWTH_INSTALL_RUNTIME_HELLO_ENABLED: 'true',
  });
  const loose = (name: string, value: string) => () =>
    loadLifecycleRuntimeConfiguration({ [name]: value });
  const enrollment = (value: string | undefined) => () =>
    loadLifecycleRuntimeConfiguration({
      CAMPAIGN_ENROLLMENT_ENABLED: 'true',
      CAMPAIGN_ENROLLMENT_START_AT: value,
    });

  expect(defaults).toEqual({
    campaignEnabled: false,
    campaignEnrollmentEnabled: false,
    installRuntimeHelloEnabled: false,
    installDigestEnabled: false,
    observationProcessingEnabled: false,
    deliveryEnabled: false,
  });
  expect(enabled).toEqual({
    campaignEnabled: true,
    campaignEnrollmentEnabled: true,
    installRuntimeHelloEnabled: true,
    installDigestEnabled: true,
    observationProcessingEnabled: false,
    deliveryEnabled: true,
    campaignEnrollmentStartAt: new Date(startAt),
  });
  for (const name of [
    'CAMPAIGN_ENABLED',
    'CAMPAIGN_ENROLLMENT_ENABLED',
    'DELIVERY_ENABLED',
    'GROWTH_OBSERVATION_PROCESSING_ENABLED',
    'GROWTH_INSTALL_DIGEST_ENABLED',
    'GROWTH_INSTALL_RUNTIME_HELLO_ENABLED',
  ]) {
    for (const value of ['TRUE', '1', 'yes', ' true', '']) {
      expect(loose(name, value)).toThrow(
        `${name} must be exactly true or false`,
      );
    }
  }
  for (const value of [
    undefined,
    '2026-09-01T00:00:00Z',
    '2026-09-01',
    '2026-02-30T00:00:00.000Z',
    '2026-09-01T00:00:00.000+00:00',
  ]) {
    expect(enrollment(value)).toThrow(/CAMPAIGN_ENROLLMENT_START_AT/u);
  }
  expect(
    loadLifecycleRuntimeConfiguration({
      CAMPAIGN_ENROLLMENT_START_AT: 'not checked while enrollment is off',
    }),
  ).not.toHaveProperty('campaignEnrollmentStartAt');
});

test('campaignGreeting uses a plain first name and falls back to Hey there', () => {
  const cases: [string | null, string][] = [
    ['Ada Lovelace', 'Hey Ada,'],
    ["  O'Brien  ", "Hey O'Brien,"],
    [null, 'Hey there,'],
    ['', 'Hey there,'],
    ['ada@example.com', 'Hey there,'],
    ['Ada https://evil.example', 'Hey there,'],
    ['R2D2', 'Hey there,'],
    ['A'.repeat(61), 'Hey there,'],
  ];

  const greetings = cases.map(([name]) => campaignGreeting(name));

  expect(greetings).toEqual(cases.map(([, greeting]) => greeting));
});

test('prepareCampaignMessage renders the fixed template per step with greeting, signature and unsubscribe link', () => {
  const url = unsubscribeUrl();

  const messages = ([1, 2, 3] as const).map((step) =>
    prepareCampaignMessage({
      context: context(),
      job: job('send_step', { campaign_version: 'v1', step }),
      unsubscribeUrl: url,
    }),
  );
  const invalid = () =>
    prepareCampaignMessage({
      context: context(),
      job: job('send_step', { campaign_version: 'v1', step: 4 }),
      unsubscribeUrl: url,
    });

  expect(STEP_NAMES).toEqual({ 1: 'immediate', 2: 'day-3', 3: 'day-8' });
  expect(messages.map(({ template }) => template)).toEqual([
    'immediate',
    'day-3',
    'day-8',
  ]);
  expect(messages[0]?.subject).toBe('Engineer to engineer');
  for (const message of messages) {
    expect(message.text.startsWith('Hey Ada,\n\n')).toBe(true);
    expect(message.text).toContain('\n\nBrian\n\n--\n\n');
    expect(message.text).toContain(unsubscribeActionUrlValue(url));
    expect(message.html).toContain('<p>Hey Ada,</p>');
    expect(message.html.split(unsubscribeActionUrlValue(url))).toHaveLength(2);
  }
  expect(invalid).toThrow(DeterministicLifecycleJobError);
});

test('send_step maps every RecipientSendResult to the documented dispatch outcome', async () => {
  const cases: [RecipientSendResult, string, string | null][] = [
    [{ accepted: true, providerEmailId: 'p-1' }, 'completed', null],
    [{ accepted: false, reason: 'campaign_disabled' }, 'deferred', 'defer'],
    [{ accepted: false, reason: 'delivery_disabled' }, 'deferred', 'defer'],
    [{ accepted: false, reason: 'outside_send_window' }, 'deferred', 'defer'],
    [{ accepted: false, reason: 'reply_binding_pending' }, 'deferred', 'defer'],
    [
      { accepted: false, reason: 'pilot_recipient_not_allowlisted' },
      'deferred',
      'defer',
    ],
    [{ accepted: false, reason: 'contact_deleted' }, 'cancelled', 'cancel'],
    [{ accepted: false, reason: 'contact_stopped' }, 'cancelled', 'cancel'],
    [{ accepted: false, reason: 'contact_unapproved' }, 'cancelled', 'cancel'],
    [
      { accepted: false, reason: 'mailbox_recovery_required' },
      'recovery_paused',
      null,
    ],
    [{ accepted: false, reason: 'provider_rejected' }, 'failed', null],
    [{ accepted: false, reason: 'provider_outcome_unknown' }, 'failed', null],
  ];

  const outcomes = await Promise.all(
    cases.map(async ([sendResult]) => {
      const deps = dependencies({
        sendRecipient: vi.fn().mockResolvedValue(sendResult),
      });
      const result = await dispatchLifecycleAppOwnedJob(
        transactionalExecutor(),
        job(),
        {},
        deps,
      );
      return { result, deps, sendResult };
    }),
  );

  outcomes.forEach(({ result, deps, sendResult }, index) => {
    const [, expected, transition] = cases[index] ?? [];
    expect(result).toBe(expected);
    const reason = sendResult.accepted ? undefined : sendResult.reason;
    if (transition === 'defer') {
      expect(deps.deferJob).toHaveBeenCalledWith(expect.anything(), {
        jobId: JOB_ID,
        leaseToken: LEASE_TOKEN,
        now: NOW,
        availableAt: new Date(NOW.getTime() + RETRY_DELAY_MS),
        errorCode: reason,
      });
    } else {
      expect(deps.deferJob).not.toHaveBeenCalled();
    }
    if (transition === 'cancel') {
      expect(deps.cancelJob).toHaveBeenCalledWith(expect.anything(), {
        jobId: JOB_ID,
        leaseToken: LEASE_TOKEN,
        now: NOW,
        errorCode: reason,
      });
    } else {
      expect(deps.cancelJob).not.toHaveBeenCalled();
    }
    expect(deps.failJob).not.toHaveBeenCalled();
    expect(deps.completeJob).not.toHaveBeenCalled();
    expect(deps.sendRecipient).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        jobId: JOB_ID,
        leaseToken: LEASE_TOKEN,
        subject: 'Engineer to engineer',
        campaignTemplate: 'immediate',
      }),
    );
  });
});

test('fulfill sends the unstuck acknowledgement without a campaign template and poisons other forms', async () => {
  const deps = dependencies();
  const unsupported = dependencies();

  const result = await dispatchLifecycleAppOwnedJob(
    transactionalExecutor(),
    job('fulfill', { form_kind: 'unstuck' }),
    {},
    deps,
  );
  const poisoned = dispatchLifecycleAppOwnedJob(
    transactionalExecutor(),
    job('fulfill', { form_kind: 'whitepaper' }),
    {},
    unsupported,
  );

  expect(result).toBe('completed');
  const [, input] = vi.mocked(deps.sendRecipient).mock.calls[0] ?? [];
  expect(input).toMatchObject({ subject: 'Got your note' });
  expect(input).not.toHaveProperty('campaignTemplate');
  expect(input?.text.startsWith('Hey Ada,\n\nThanks for writing.')).toBe(true);
  await expect(poisoned).rejects.toThrow(DeterministicLifecycleJobError);
  expect(unsupported.sendRecipient).not.toHaveBeenCalled();
});

test('a context for another contact is deterministic poison', async () => {
  const deps = dependencies({
    readJobContext: vi
      .fn()
      .mockResolvedValue(
        context({ contactId: '00000000-0000-4000-8000-000000000003' }),
      ),
  });

  const result = dispatchLifecycleAppOwnedJob(
    transactionalExecutor(),
    job(),
    {},
    deps,
  );

  await expect(result).rejects.toThrow(DeterministicLifecycleJobError);
  expect(deps.sendRecipient).not.toHaveBeenCalled();
});

test('notify defers while delivery is disabled and claims at most once', async () => {
  const disabled = dependencies({ deliveryEnabled: false });
  const sent = dependencies();
  const reclaimed = dependencies({
    claimInternalNotification: vi.fn().mockResolvedValue('already_claimed'),
  });
  const conflicted = dependencies({
    claimInternalNotification: vi
      .fn()
      .mockRejectedValue(new JobLeaseConflictError(JOB_ID)),
  });
  const notify = () =>
    job('notify', { submission_id: '00000000-0000-4000-8000-000000000012' });

  const disabledResult = await dispatchLifecycleAppOwnedJob(
    transactionalExecutor(),
    notify(),
    {},
    disabled,
  );
  const sentResult = await dispatchLifecycleAppOwnedJob(
    transactionalExecutor(),
    notify(),
    {},
    sent,
  );
  const reclaimedResult = await dispatchLifecycleAppOwnedJob(
    transactionalExecutor(),
    notify(),
    {},
    reclaimed,
  );
  const conflictedResult = dispatchLifecycleAppOwnedJob(
    transactionalExecutor(),
    notify(),
    {},
    conflicted,
  );

  expect(disabledResult).toBe('deferred');
  expect(disabled.deferJob).toHaveBeenCalledWith(expect.anything(), {
    jobId: JOB_ID,
    leaseToken: LEASE_TOKEN,
    now: NOW,
    availableAt: new Date(NOW.getTime() + RETRY_DELAY_MS),
    errorCode: 'delivery_disabled',
  });
  expect(disabled.claimInternalNotification).not.toHaveBeenCalled();
  expect(disabled.sendInternalNotification).not.toHaveBeenCalled();

  expect(sentResult).toBe('completed');
  expect(sent.claimInternalNotification).toHaveBeenCalledWith(
    expect.anything(),
    { jobId: JOB_ID, leaseToken: LEASE_TOKEN, now: NOW, kind: 'notify' },
  );
  expect(sent.createActionToken).toHaveBeenCalledWith({
    contactId: CONTACT_ID,
    purpose: 'founder_stop',
    issuedAt: NOW,
    eventNonce: JOB_ID,
  });
  const request = vi.mocked(sent.sendInternalNotification).mock.calls[0]?.[1];
  expect(request).toMatchObject({
    subject: 'Hashbrown lifecycle review',
    idempotencyKey: 'notify:fixture',
    kind: 'notify',
  });
  expect(request?.text).not.toContain('Framework:');
  expect(request?.text).toContain(
    '> The stream stops after the first tool call.',
  );
  expect(request?.text).toContain('- contact.approved_work_email_form: 30');
  expect(request?.text).toContain(`${ORIGIN}/_/growth/stop?token=g1.`);
  expect(sent.completeJob).toHaveBeenCalledWith(expect.anything(), {
    jobId: JOB_ID,
    leaseToken: LEASE_TOKEN,
    now: NOW,
  });

  expect(reclaimedResult).toBe('failed');
  expect(reclaimed.sendInternalNotification).not.toHaveBeenCalled();
  expect(reclaimed.markInternalNotificationUnknown).toHaveBeenCalledWith(
    expect.anything(),
    {
      jobId: JOB_ID,
      leaseToken: LEASE_TOKEN,
      occurredAt: NOW,
      errorCode: 'internal_notification_outcome_unknown',
      kind: 'notify',
    },
  );

  await expect(conflictedResult).rejects.toThrow(JobLeaseConflictError);
  expect(conflicted.sendInternalNotification).not.toHaveBeenCalled();
  expect(conflicted.markInternalNotificationUnknown).not.toHaveBeenCalled();
});

test('notify records an unknown outcome for manual review and fails a rejection', async () => {
  const unknown = dependencies({
    sendInternalNotification: vi.fn().mockResolvedValue({ outcome: 'unknown' }),
  });
  const rejected = dependencies({
    sendInternalNotification: vi
      .fn()
      .mockResolvedValue({ outcome: 'rejected' }),
  });

  const unknownResult = await dispatchLifecycleAppOwnedJob(
    transactionalExecutor(),
    job('notify', {}),
    {},
    unknown,
  );
  const rejectedResult = await dispatchLifecycleAppOwnedJob(
    transactionalExecutor(),
    job('notify', {}),
    {},
    rejected,
  );

  expect(unknownResult).toBe('failed');
  expect(unknown.markInternalNotificationUnknown).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      errorCode: 'internal_notification_outcome_unknown',
      kind: 'notify',
    }),
  );
  expect(unknown.completeJob).not.toHaveBeenCalled();
  expect(rejectedResult).toBe('failed');
  expect(rejected.failJob).toHaveBeenCalledWith(expect.anything(), {
    jobId: JOB_ID,
    leaseToken: LEASE_TOKEN,
    now: NOW,
    errorCode: 'internal_notification_rejected',
  });
});

test('digest completes without sending when no candidates remain and marks reported on acceptance', async () => {
  const empty = dependencies({
    readInstallDigestCandidates: vi.fn().mockResolvedValue([]),
  });
  const accepted = dependencies();
  const unknown = dependencies({
    sendInternalNotification: vi.fn().mockResolvedValue({ outcome: 'unknown' }),
  });
  const executor = transactionalExecutor();

  const emptyResult = await dispatchLifecycleAppOwnedJob(
    transactionalExecutor(),
    digestJob(),
    {},
    empty,
  );
  const acceptedResult = await dispatchLifecycleAppOwnedJob(
    executor,
    digestJob(),
    {},
    accepted,
  );
  const unknownResult = await dispatchLifecycleAppOwnedJob(
    transactionalExecutor(),
    digestJob(),
    {},
    unknown,
  );

  expect(emptyResult).toBe('completed');
  expect(empty.completeJob).toHaveBeenCalledOnce();
  expect(empty.claimInternalNotification).not.toHaveBeenCalled();
  expect(empty.sendInternalNotification).not.toHaveBeenCalled();
  expect(empty.markInstallDigestReported).not.toHaveBeenCalled();

  expect(acceptedResult).toBe('completed');
  expect(accepted.readInstallDigestCandidates).toHaveBeenCalledWith(executor, {
    limit: INSTALL_DIGEST_CANDIDATE_LIMIT,
    keyring: EMAIL_KEYRING,
  });
  expect(accepted.readJobContext).not.toHaveBeenCalled();
  expect(accepted.createActionToken).toHaveBeenCalledWith({
    contactId: DIGEST_CANDIDATE.firstInstallObservationId,
    purpose: 'founder_approve_install',
    issuedAt: NOW,
    eventNonce: JOB_ID,
  });
  expect(accepted.claimInternalNotification).toHaveBeenCalledWith(
    expect.anything(),
    { jobId: JOB_ID, leaseToken: LEASE_TOKEN, now: NOW, kind: 'digest' },
  );
  const request = vi.mocked(accepted.sendInternalNotification).mock
    .calls[0]?.[1];
  expect(request).toMatchObject({
    subject: 'Hashbrown install digest for 2026-09-01: 1 new identity',
    idempotencyKey: 'digest:fixture',
    kind: 'digest',
  });
  expect(request?.text).toContain(
    `${ORIGIN}/_/growth/approve-install?token=g1.`,
  );
  expect(executor.transaction).toHaveBeenCalledOnce();
  expect(accepted.markInstallDigestReported).toHaveBeenCalledWith(executor, {
    digestJobId: JOB_ID,
    reportedAt: NOW,
    candidates: [DIGEST_CANDIDATE],
  });
  expect(accepted.completeJob).toHaveBeenCalledWith(executor, {
    jobId: JOB_ID,
    leaseToken: LEASE_TOKEN,
    now: NOW,
  });

  expect(unknownResult).toBe('failed');
  expect(unknown.markInstallDigestReported).not.toHaveBeenCalled();
  expect(unknown.markInternalNotificationUnknown).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      errorCode: 'install_digest_outcome_unknown',
      kind: 'digest',
    }),
  );
});

test('digest pluralizes identities and poisons a missing business date', async () => {
  const two = dependencies({
    readInstallDigestCandidates: vi.fn().mockResolvedValue([
      DIGEST_CANDIDATE,
      {
        ...DIGEST_CANDIDATE,
        email: 'other@corp.example',
        firstInstallObservationId: '1f1e2d3c-4b5a-4c7d-8e9f-a0b1c2d3e4f5',
      },
    ]),
  });
  const undated = dependencies();

  await dispatchLifecycleAppOwnedJob(
    transactionalExecutor(),
    digestJob(),
    {},
    two,
  );
  const poisoned = dispatchLifecycleAppOwnedJob(
    transactionalExecutor(),
    { ...digestJob(), payload: {} },
    {},
    undated,
  );

  expect(
    vi.mocked(two.sendInternalNotification).mock.calls[0]?.[1].subject,
  ).toBe('Hashbrown install digest for 2026-09-01: 2 new identities');
  await expect(poisoned).rejects.toThrow(DeterministicLifecycleJobError);
});

test('createLifecycleAppJobHandlers registers exactly the four app kinds', async () => {
  const deps = dependencies();

  const handlers = createLifecycleAppJobHandlers(deps);
  const result = await handlers.send_step?.(transactionalExecutor(), job(), {});

  expect(Object.keys(handlers).sort()).toEqual([
    'digest',
    'fulfill',
    'notify',
    'send_step',
  ]);
  expect(result).toBe('completed');
});

test('loadRecipientDeliveryPolicy reads the delivery environment and allowlist', () => {
  const policy = loadRecipientDeliveryPolicy({
    ...BASE_ENVIRONMENT,
    CAMPAIGN_ENABLED: 'true',
    RESEND_NON_PRODUCTION_REDIRECT_TO: 'qa@hashbrown.test',
  });
  const mismatched = () =>
    loadRecipientDeliveryPolicy({
      ...BASE_ENVIRONMENT,
      GROWTH_DATABASE_ENVIRONMENT: 'production',
    });
  const unknownEnvironment = () =>
    loadRecipientDeliveryPolicy({
      ...BASE_ENVIRONMENT,
      DELIVERY_ENVIRONMENT: 'staging',
    });

  expect(policy).toEqual({
    campaignEnabled: true,
    deliveryEnabled: true,
    environment: 'preview',
    databaseEnvironment: 'preview',
    senderVerified: true,
    verifiedDomain: 'hashbrown.dev',
    configuredSender: 'Brian at Hashbrown <brian@hashbrown.dev>',
    providerTrackingDisabled: true,
    nonProductionRecipientAllowlist: [
      'founder@hashbrown.test',
      'qa@hashbrown.test',
    ],
    nonProductionRedirectTo: 'qa@hashbrown.test',
  });
  expect(mismatched).toThrow();
  expect(unknownEnvironment).toThrow(/DELIVERY_ENVIRONMENT/u);
});

for (const kind of ['notify', 'digest'] as const) {
  for (const [name, invalid, expected] of [
    [
      'unverified sender',
      { RESEND_SENDER_VERIFIED: 'false' },
      /verified Hashbrown sender/u,
    ],
    [
      'tracking enabled',
      { RESEND_TRACKING_DISABLED: 'false' },
      /verified Hashbrown sender/u,
    ],
    ['missing sending credential', { RESEND_API_KEY: '' }, /RESEND_API_KEY/u],
    ['invalid founder', { FOUNDER_NOTIFICATION_EMAIL: 'invalid' }, /email/u],
    [
      'founder outside allowlist',
      { FOUNDER_NOTIFICATION_EMAIL: 'other@hashbrown.test' },
      /NON_PRODUCTION_ALLOWLIST/u,
    ],
  ] as const) {
    test(`${kind} validates ${name} before consuming its submission claim`, async () => {
      const db = transactionalExecutor();
      vi.mocked(db.execute).mockResolvedValue({
        rows: [{ event_key: 'claimed' }],
      });
      const send = vi.fn().mockResolvedValue({
        data: { id: 'provider-internal-1' },
        error: null,
      });
      const reserve = vi.fn(async () => null);
      const createDependencies = (environment: Record<string, string>) => {
        const defaults = createDefaultLifecycleJobDependencies(environment, {
          now: () => NOW,
          resend: () => ({ emails: { send } }) as LifecycleResendClient,
          reserveProviderAttempt: reserve,
          completeProviderAttempt: async () => undefined,
        });
        return dependencies({
          claimInternalNotification: defaults.claimInternalNotification,
          sendInternalNotification: defaults.sendInternalNotification,
        });
      };
      const invalidDependencies = createDependencies({
        ...BASE_ENVIRONMENT,
        ...invalid,
      });
      const queued = kind === 'notify' ? job('notify', {}) : digestJob();

      const invalidAttempt = dispatchLifecycleAppOwnedJob(
        db,
        queued,
        {},
        invalidDependencies,
      );

      await expect(invalidAttempt).rejects.toThrow(expected);
      expect(db.execute).not.toHaveBeenCalled();
      expect(reserve).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();

      const corrected = createDependencies(BASE_ENVIRONMENT);
      const result = await dispatchLifecycleAppOwnedJob(
        db,
        queued,
        {},
        corrected,
      );

      expect(result).toBe('completed');
      expect(db.execute).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining(
          'growth:claim-internal-notification-submission',
        ),
        [JOB_ID, LEASE_TOKEN, NOW, kind],
      );
      expect(send).toHaveBeenCalledTimes(1);
      expect(corrected.markInternalNotificationUnknown).not.toHaveBeenCalled();
    });
  }
}

test('the internal sender mails only the founder with an app tag and environment-scoped reserved payload', async () => {
  const send = vi.fn().mockResolvedValue({
    data: { id: 'provider-internal-1' },
    error: null,
  });
  const resend = { emails: { send } } as unknown as LifecycleResendClient;
  const reserve = vi.fn(async () => null);
  const complete = vi.fn(async () => undefined);
  const db = transactionalExecutor();
  const deps = createDefaultLifecycleJobDependencies(BASE_ENVIRONMENT, {
    resend: () => resend,
    reserveProviderAttempt: reserve,
    completeProviderAttempt: complete,
  });
  const malformed = createDefaultLifecycleJobDependencies(BASE_ENVIRONMENT, {
    reserveProviderAttempt: async () => null,
    completeProviderAttempt: async () => undefined,
    resend: () =>
      ({
        emails: {
          send: vi.fn().mockResolvedValue({ data: { id: '' }, error: null }),
        },
      }) as unknown as LifecycleResendClient,
  });
  const offAllowlist = createDefaultLifecycleJobDependencies(
    { ...BASE_ENVIRONMENT, FOUNDER_NOTIFICATION_EMAIL: 'other@hashbrown.test' },
    { resend: () => resend },
  );
  const request = {
    subject: 'Hashbrown lifecycle review',
    text: 'Review only',
    idempotencyKey: 'notify:fixture',
    kind: 'notify' as const,
  };

  const accepted = await deps.sendInternalNotification(db, request);
  const unknown = await malformed.sendInternalNotification(
    transactionalExecutor(),
    request,
  );
  const refused = offAllowlist.sendInternalNotification(
    transactionalExecutor(),
    request,
  );

  expect(accepted).toEqual({ outcome: 'accepted' });
  expect(send).toHaveBeenCalledWith(
    {
      from: 'Brian at Hashbrown <brian@hashbrown.dev>',
      to: 'founder@hashbrown.test',
      subject: 'Hashbrown lifecycle review',
      text: 'Review only',
      tags: [
        { name: 'app', value: 'hashbrown' },
        { name: 'environment', value: 'preview' },
        { name: 'job_kind', value: 'notify' },
      ],
    },
    {
      idempotencyKey: providerIdempotencyKey(
        'preview',
        'internal:notify:fixture',
      ),
    },
  );
  expect(reserve).toHaveBeenCalledWith(
    db,
    providerIdempotencyKey('preview', 'internal:notify:fixture'),
    send.mock.calls[0]?.[0],
    expect.any(Date),
  );
  expect(reserve.mock.invocationCallOrder[0]).toBeLessThan(
    send.mock.invocationCallOrder[0] ?? 0,
  );
  expect(complete).toHaveBeenCalledWith(
    db,
    providerIdempotencyKey('preview', 'internal:notify:fixture'),
    'provider-internal-1',
  );
  expect(unknown).toEqual({ outcome: 'unknown' });
  await expect(refused).rejects.toThrow(/NON_PRODUCTION_ALLOWLIST/u);
});

test('default dependencies bind unsubscribe links and action tokens to the configured origin and key', () => {
  const deps = createDefaultLifecycleJobDependencies(BASE_ENVIRONMENT, {
    resend: () => ({ emails: { send: vi.fn() } }) as LifecycleResendClient,
  });
  const badOrigin = createDefaultLifecycleJobDependencies(
    { ...BASE_ENVIRONMENT, GROWTH_PUBLIC_ACTION_ORIGIN: `${ORIGIN}/path` },
    { resend: () => ({ emails: { send: vi.fn() } }) as LifecycleResendClient },
  );

  const url = deps.createUnsubscribeUrl({
    contactId: CONTACT_ID,
    issuedAt: NOW,
    eventNonce: JOB_ID,
  });
  const token = deps.createActionToken({
    contactId: CONTACT_ID,
    purpose: 'founder_stop',
    issuedAt: NOW,
    eventNonce: JOB_ID,
  });

  expect(unsubscribeActionUrlValue(url)).toMatch(
    new RegExp(`^${ORIGIN}/_/unsubscribe\\?token=g1\\.`, 'u'),
  );
  expect(token).toMatch(/^g1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/u);
  expect(deps.deliveryEnabled).toBe(true);
  expect(deps.publicActionOrigin).toBe(ORIGIN);
  expect(() => badOrigin.publicActionOrigin).toThrow(/origin/u);
});

for (const kind of ['fulfill', 'send_step'] as const) {
  test(`${kind} retries keep the unsubscribe token stable across clocks`, async () => {
    const deps = dependencies();
    const executor = transactionalExecutor();
    const first =
      kind === 'fulfill' ? job(kind, { form_kind: 'unstuck' }) : job(kind);
    const signal = new AbortController().signal;

    await dispatchLifecycleAppOwnedJob(executor, first, { signal }, deps);
    const initial = vi.mocked(deps.sendRecipient).mock.calls[0]?.[1]
      .unsubscribeUrl;
    deps.now = () => new Date(NOW.getTime() + 60000);
    await dispatchLifecycleAppOwnedJob(executor, first, { signal }, deps);
    const retried = vi.mocked(deps.sendRecipient).mock.calls[1]?.[1]
      .unsubscribeUrl;

    if (initial === undefined || retried === undefined)
      throw new Error('Expected recipient submissions');
    expect(unsubscribeActionUrlValue(initial)).toBe(
      unsubscribeActionUrlValue(retried),
    );
    expect(deps.createUnsubscribeUrlForJob).toHaveBeenCalledWith(first);
  });
}

for (const code of ['payload_conflict', 'idempotency_expired'] as const) {
  test(`internal messages fail closed on ${code} before contacting Resend`, async () => {
    const send = vi.fn();
    const deps = createDefaultLifecycleJobDependencies(BASE_ENVIRONMENT, {
      resend: () => ({ emails: { send } }) as LifecycleResendClient,
      reserveProviderAttempt: async () => {
        throw new ProviderAttemptError(code);
      },
      completeProviderAttempt: vi.fn(),
    });

    const attempt = deps.sendInternalNotification(transactionalExecutor(), {
      subject: 'Review',
      text: 'Body',
      idempotencyKey: 'notify:fixture',
      kind: 'notify',
    });

    await expect(attempt).rejects.toThrow(ProviderAttemptError);
    expect(send).not.toHaveBeenCalled();
  });
}

test('internal digest reuses known ledger acceptance without a provider submission', async () => {
  const send = vi.fn();
  const complete = vi.fn();
  const deps = createDefaultLifecycleJobDependencies(BASE_ENVIRONMENT, {
    resend: () => ({ emails: { send } }) as LifecycleResendClient,
    reserveProviderAttempt: async () => 'already-accepted',
    completeProviderAttempt: complete,
  });

  const result = await deps.sendInternalNotification(transactionalExecutor(), {
    subject: 'Digest',
    text: 'Body',
    idempotencyKey: 'digest:fixture',
    kind: 'digest',
  });

  expect(result).toEqual({ outcome: 'accepted' });
  expect(send).not.toHaveBeenCalled();
  expect(complete).toHaveBeenCalledWith(
    expect.anything(),
    providerIdempotencyKey('preview', 'internal:digest:fixture'),
    'already-accepted',
  );
});

for (const kind of ['notify', 'digest'] as const) {
  test(`${kind} action tokens start their lifetime at delayed first submission`, async () => {
    const delayHours = kind === 'notify' ? 25 : 8 * 24;
    const submittedAt = new Date(NOW.getTime() + delayHours * 60 * 60 * 1000);
    const subject = kind === 'digest' ? digestJob() : job('notify');
    const deps = dependencies({ now: () => submittedAt });
    const purpose =
      kind === 'notify' ? 'founder_stop' : 'founder_approve_install';
    const maxAgeSeconds =
      kind === 'notify'
        ? FOUNDER_STOP_TOKEN_MAX_AGE_SECONDS
        : FOUNDER_APPROVE_INSTALL_TOKEN_MAX_AGE_SECONDS;

    await dispatchLifecycleAppOwnedJob(
      transactionalExecutor(),
      subject,
      {},
      deps,
    );
    const request = vi.mocked(deps.sendInternalNotification).mock.calls[0]?.[1];
    const token = request?.text.match(
      /\?token=(g1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/u,
    )?.[1];
    const verified = verifyGrowthActionToken(token ?? '', {
      expectedPurpose: purpose,
      keyring: { active: TOKEN_KEY },
      now: submittedAt,
      maxAgeSeconds,
    });
    const expired = verifyGrowthActionToken(token ?? '', {
      expectedPurpose: purpose,
      keyring: { active: TOKEN_KEY },
      now: new Date(submittedAt.getTime() + (maxAgeSeconds + 1) * 1000),
      maxAgeSeconds,
    });

    expect(verified).toMatchObject({
      contactId:
        kind === 'notify'
          ? CONTACT_ID
          : DIGEST_CANDIDATE.firstInstallObservationId,
      purpose,
      issuedAt: submittedAt,
      eventNonce: JOB_ID,
    });
    expect(expired).toBeNull();
    expect(deps.claimInternalNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ now: submittedAt }),
    );
    if (kind === 'digest') {
      expect(deps.readInstallDigestContext).toHaveBeenCalledWith(
        expect.anything(),
        { since: new Date(subject.createdAt.getTime() - 86400000) },
      );
    }
  });

  for (const outcome of ['accepted', 'unknown'] as const) {
    test(`${kind} never resubmits a consumed claim after ${outcome}`, async () => {
      const subject = kind === 'digest' ? digestJob() : job('notify');
      const deps = dependencies({
        claimInternalNotification: vi
          .fn()
          .mockResolvedValueOnce('claimed')
          .mockResolvedValue('already_claimed'),
        sendInternalNotification: vi.fn().mockResolvedValue({ outcome }),
        completeJob: vi
          .fn()
          .mockRejectedValue(new Error('settlement interrupted')),
      });
      const executor = transactionalExecutor();

      const first = dispatchLifecycleAppOwnedJob(executor, subject, {}, deps);
      if (outcome === 'accepted') {
        await expect(first).rejects.toThrow('settlement interrupted');
      } else {
        expect(await first).toBe('failed');
      }
      deps.now = () => new Date(NOW.getTime() + 8 * 86400000);
      const retried = await dispatchLifecycleAppOwnedJob(
        executor,
        subject,
        {},
        deps,
      );

      expect(retried).toBe('failed');
      expect(deps.claimInternalNotification).toHaveBeenCalledTimes(2);
      expect(deps.sendInternalNotification).toHaveBeenCalledOnce();
      expect(deps.markInternalNotificationUnknown).toHaveBeenLastCalledWith(
        executor,
        expect.objectContaining({ jobId: JOB_ID, kind }),
      );
    });
  }
}
