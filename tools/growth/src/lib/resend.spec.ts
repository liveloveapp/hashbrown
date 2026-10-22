import { expect, test, vi } from 'vitest';

import type { SqlExecutor } from './database.ts';
import type { FinalSendAuthorization } from './jobs.ts';
import type { GrowthJob } from './models.ts';
import {
  assertRecipientDeliveryPolicy,
  CAMPAIGN_TEMPLATE_IDS,
  classifyResendProviderError,
  isCampaignTemplateId,
  RECIPIENT_EMAIL_SENDER,
  type RecipientDeliveryPolicy,
  type RecipientEmailInput,
  type RecipientSendDependencies,
  reconcilePendingResendMessageIds,
  sendRecipientEmail,
  VERIFIED_DOMAIN,
} from './resend.ts';
import {
  ProviderMessageIdBindingError,
  replySubjectSha256,
} from './replies.ts';
import { executorWith } from './testing/fake-executor.ts';
import {
  createUnsubscribeActionUrl,
  unsubscribeActionUrlValue,
} from './tokens.ts';

const contactId = '00000000-0000-4000-8000-000000000001';
const jobId = '00000000-0000-4000-8000-000000000101';
const leaseToken = '00000000-0000-4000-8000-000000000201';
const now = new Date('2026-10-21T15:00:00.000Z');
const executor = {} as SqlExecutor;
const unsubscribeUrl = createUnsubscribeActionUrl(
  { contactId, issuedAt: now },
  { version: 1, secret: 's'.repeat(32) },
  'https://hashbrown.dev',
);
const unsubscribeValue = unsubscribeActionUrlValue(unsubscribeUrl);

function policy(
  overrides: Partial<RecipientDeliveryPolicy> = {},
): RecipientDeliveryPolicy {
  return {
    campaignEnabled: true,
    deliveryEnabled: true,
    environment: 'production',
    databaseEnvironment: 'production',
    senderVerified: true,
    verifiedDomain: VERIFIED_DOMAIN,
    configuredSender: RECIPIENT_EMAIL_SENDER,
    providerTrackingDisabled: true,
    nonProductionRecipientAllowlist: [],
    ...overrides,
  };
}

function job(overrides: Partial<GrowthJob> = {}): GrowthJob {
  return {
    id: jobId,
    kind: 'send_step',
    contactId,
    projectId: null,
    status: 'leased',
    availableAt: now,
    leaseUntil: now,
    leaseToken,
    attempts: 1,
    idempotencyKey: 'send_step:contact:1',
    payload: { campaign_version: 'v1', step: 2 },
    providerEmailId: null,
    rfcMessageId: null,
    gmailSeedMessageId: null,
    deliveryStatus: 'not_submitted',
    lastErrorCode: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as GrowthJob;
}

function authorized(
  overrides: Partial<GrowthJob> = {},
): FinalSendAuthorization {
  return {
    authorized: true,
    job: job(overrides),
    recipient: { contactId, emailNormalized: 'ada@example.com' },
    boundedRaceNotice: 'a_future_stop_can_overlap_provider_submission',
  };
}

function input(
  overrides: Partial<RecipientEmailInput> = {},
): RecipientEmailInput {
  return {
    jobId,
    leaseToken,
    subject: 'Hello',
    text: 'Hello there',
    campaignTemplate: 'day-3',
    unsubscribeUrl,
    ...overrides,
  };
}

function dependencies(
  send: RecipientSendDependencies['resend']['emails']['send'],
  authorization: FinalSendAuthorization = authorized(),
) {
  return {
    now: () => now,
    resend: { emails: { send: vi.fn(send) } },
    authorizeLeasedJobForSubmission: vi.fn(async () => authorization),
    recordProviderAcceptance: vi.fn(async () => undefined),
    markProviderAcceptanceUnknown: vi.fn(async () => undefined),
    markProviderRejection: vi.fn(async () => undefined),
  } as unknown as RecipientSendDependencies & {
    resend: { emails: { send: ReturnType<typeof vi.fn> } };
    authorizeLeasedJobForSubmission: ReturnType<typeof vi.fn>;
    recordProviderAcceptance: ReturnType<typeof vi.fn>;
    markProviderAcceptanceUnknown: ReturnType<typeof vi.fn>;
    markProviderRejection: ReturnType<typeof vi.fn>;
  };
}

function rejection(policyValue: RecipientDeliveryPolicy): string {
  try {
    assertRecipientDeliveryPolicy(policyValue);
    return 'accepted';
  } catch (error) {
    return (error as Error).message;
  }
}

test('the campaign template ids are the three hashbrown steps', () => {
  const ids = [...CAMPAIGN_TEMPLATE_IDS];

  const known = ['day-8', 'streaming_foundation', 7].map(isCampaignTemplateId);

  expect(ids).toEqual(['immediate', 'day-3', 'day-8']);
  expect(known).toEqual([true, false, false]);
});

test('assertRecipientDeliveryPolicy refuses tracking on, unverified sender, wrong domain, and mismatched environments', () => {
  const policies = [
    policy({ providerTrackingDisabled: false }),
    policy({ senderVerified: false }),
    policy({ verifiedDomain: 'threadplane.ai' }),
    policy({ configuredSender: 'Brian <brian@example.com>' }),
    policy({ databaseEnvironment: 'preview' }),
  ];

  const outcomes = policies.map(rejection);

  expect(rejection(policy())).toBe('accepted');
  expect(outcomes).toEqual([
    'Exact verified Hashbrown sender configuration is required',
    'Exact verified Hashbrown sender configuration is required',
    'Exact verified Hashbrown sender configuration is required',
    'Exact verified Hashbrown sender configuration is required',
    'Delivery environment must match the database environment',
  ]);
});

test('outside production the recipient is redirected and must be allowlisted', async () => {
  const preview = {
    environment: 'preview' as const,
    databaseEnvironment: 'preview' as const,
  };
  const deps = dependencies(async () => ({
    data: { id: 'email_1' },
    error: null,
  }));

  const result = await sendRecipientEmail(
    executor,
    input(),
    policy({
      ...preview,
      nonProductionRecipientAllowlist: ['QA@hashbrown.dev'],
      nonProductionRedirectTo: 'qa@hashbrown.dev',
    }),
    deps,
  );

  expect(result).toEqual({ accepted: true, providerEmailId: 'email_1' });
  expect(deps.resend.emails.send.mock.calls[0][0].to).toBe('qa@hashbrown.dev');
  expect(rejection(policy(preview))).toBe(
    'A non-production recipient allowlist is required',
  );
  expect(
    rejection(
      policy({
        ...preview,
        nonProductionRecipientAllowlist: ['qa@hashbrown.dev'],
        nonProductionRedirectTo: 'other@hashbrown.dev',
      }),
    ),
  ).toBe('Non-production recipient is not allowlisted');
  await expect(
    sendRecipientEmail(
      executor,
      input(),
      policy({
        ...preview,
        nonProductionRecipientAllowlist: ['qa@hashbrown.dev'],
      }),
      dependencies(async () => ({ data: { id: 'email_2' }, error: null })),
    ),
  ).rejects.toThrow('Non-production recipient is not allowlisted');
});

test('sendRecipientEmail sends with the unsubscribe headers, tags, and the job idempotency key', async () => {
  const deps = dependencies(async () => ({
    data: { id: 'email_1' },
    error: null,
  }));
  const html = `<p>Hello there</p>\n<p>You can unsubscribe <a href="${unsubscribeValue}">here</a>.</p>`;

  const result = await sendRecipientEmail(
    executor,
    input({ html }),
    policy(),
    deps,
  );

  expect(result).toEqual({ accepted: true, providerEmailId: 'email_1' });
  expect(deps.resend.emails.send).toHaveBeenCalledWith(
    {
      from: 'Brian at Hashbrown <brian@hashbrown.dev>',
      to: 'ada@example.com',
      replyTo: 'Brian at Hashbrown <brian@hashbrown.dev>',
      subject: 'Hello',
      text: 'Hello there',
      html,
      headers: {
        'List-Unsubscribe': `<${unsubscribeValue}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Hashbrown-Job-ID': jobId,
      },
      tags: [
        { name: 'environment', value: 'production' },
        { name: 'job_kind', value: 'send_step' },
        { name: 'campaign_version', value: 'v1' },
        { name: 'campaign_step', value: '2' },
        { name: 'campaign_template', value: 'day-3' },
      ],
    },
    { idempotencyKey: 'send_step:contact:1' },
  );
  expect(deps.recordProviderAcceptance).toHaveBeenCalledWith(executor, {
    jobId,
    leaseToken,
    acceptedAt: now,
    providerEmailId: 'email_1',
    subjectSha256: replySubjectSha256('Hello'),
  });
});

test('sendRecipientEmail rejects an HTML part that drops the unsubscribe anchor', async () => {
  const deps = dependencies(async () => ({
    data: { id: 'email_1' },
    error: null,
  }));

  const attempt = sendRecipientEmail(
    executor,
    input({ html: '<p>Hello there</p>' }),
    policy(),
    deps,
  );

  await expect(attempt).rejects.toThrow(
    'html must link the unsubscribe URL exactly once',
  );
  expect(deps.resend.emails.send).not.toHaveBeenCalled();
});

test('a send_step outside the injected send window is not sent', async () => {
  const deps = {
    ...dependencies(async () => ({ data: { id: 'email_1' }, error: null })),
    isSendWindow: () => false,
  };

  const result = await sendRecipientEmail(executor, input(), policy(), deps);

  expect(result).toEqual({ accepted: false, reason: 'outside_send_window' });
  expect(deps.resend.emails.send).not.toHaveBeenCalled();
});

test.each([
  [
    'a 500',
    async () => ({
      data: null,
      error: { name: 'internal_server_error', statusCode: 500, message: 'x' },
    }),
  ],
  [
    'a 429',
    async () => ({
      data: null,
      error: { name: 'rate_limit_exceeded', statusCode: 429, message: 'x' },
    }),
  ],
  [
    'a thrown send',
    async () => {
      throw new Error('socket hang up');
    },
  ],
  [
    'an idempotency conflict',
    async () => ({
      data: null,
      error: {
        name: 'concurrent_idempotent_requests',
        statusCode: 400,
        message: 'x',
      },
    }),
  ],
] as const)(
  'ambiguous provider outcome marks acceptance unknown: %s',
  async (_label, send) => {
    const deps = dependencies(
      send as RecipientSendDependencies['resend']['emails']['send'],
    );

    const result = await sendRecipientEmail(executor, input(), policy(), deps);

    expect(result).toEqual({
      accepted: false,
      reason: 'provider_outcome_unknown',
    });
    expect(deps.markProviderAcceptanceUnknown).toHaveBeenCalledWith(executor, {
      jobId,
      leaseToken,
      occurredAt: now,
      errorCode: 'resend_submission_outcome_unknown',
    });
    expect(deps.markProviderRejection).not.toHaveBeenCalled();
    expect(deps.recordProviderAcceptance).not.toHaveBeenCalled();
  },
);

test('classifyResendProviderError treats null, 5xx, retryable statuses, and idempotency names as unknown', () => {
  const errors = [
    { name: 'application_error', statusCode: null },
    { name: 'internal_server_error', statusCode: 503 },
    { name: 'x', statusCode: 408 },
    { name: 'x', statusCode: 409 },
    { name: 'x', statusCode: 425 },
    { name: 'invalid_idempotent_request', statusCode: 400 },
    { name: 'validation_error', statusCode: 422 },
  ] as Parameters<typeof classifyResendProviderError>[0][];

  const classes = errors.map(classifyResendProviderError);

  expect(classes).toEqual([
    'unknown',
    'unknown',
    'unknown',
    'unknown',
    'unknown',
    'unknown',
    'rejected',
  ]);
});

test('a rejected outcome marks rejection with resend_<name>', async () => {
  const deps = dependencies(async () => ({
    data: null,
    error: { name: 'validation_error', statusCode: 422, message: 'bad' },
  }));

  const result = await sendRecipientEmail(executor, input(), policy(), deps);

  expect(result).toEqual({ accepted: false, reason: 'provider_rejected' });
  expect(deps.markProviderRejection).toHaveBeenCalledWith(executor, {
    errorCode: 'resend_validation_error',
    jobId,
    leaseToken,
    occurredAt: now,
  });
  expect(deps.markProviderAcceptanceUnknown).not.toHaveBeenCalled();
});

test('an unauthorized job is not sent', async () => {
  const deps = dependencies(
    async () => ({ data: { id: 'email_1' }, error: null }),
    { authorized: false, reason: 'contact_stopped', job: job() },
  );

  const result = await sendRecipientEmail(executor, input(), policy(), deps);

  expect(result).toEqual({ accepted: false, reason: 'contact_stopped' });
  expect(deps.resend.emails.send).not.toHaveBeenCalled();
});

test('only fulfill and send_step jobs are sent', async () => {
  const deps = dependencies(
    async () => ({ data: { id: 'email_1' }, error: null }),
    authorized({ kind: 'digest', payload: {} }),
  );

  const attempt = sendRecipientEmail(
    executor,
    input({ campaignTemplate: undefined }),
    policy(),
    deps,
  );

  await expect(attempt).rejects.toThrow(
    'Unsupported recipient job kind: digest',
  );
  expect(deps.resend.emails.send).not.toHaveBeenCalled();
});

test('the unsubscribe URL must belong to the authorized contact', async () => {
  const otherUrl = createUnsubscribeActionUrl(
    { contactId: '00000000-0000-4000-8000-000000000002', issuedAt: now },
    { version: 1, secret: 's'.repeat(32) },
    'https://hashbrown.dev',
  );
  const deps = dependencies(async () => ({
    data: { id: 'email_1' },
    error: null,
  }));

  const attempt = sendRecipientEmail(
    executor,
    input({ unsubscribeUrl: otherUrl }),
    policy(),
    deps,
  );

  await expect(attempt).rejects.toThrow('contact binding does not match');
  expect(deps.resend.emails.send).not.toHaveBeenCalled();
});

const lookupEnv = {
  RESEND_API_KEY: 're_test_lookup',
  DELIVERY_ENVIRONMENT: 'preview',
  GROWTH_DATABASE_ENVIRONMENT: 'preview',
};

function lookupResponse(id: string, environment = 'preview'): Response {
  return new Response(
    JSON.stringify({
      id,
      message_id: `<${id}@resend.dev>`,
      tags: [{ name: 'environment', value: environment }],
    }),
  );
}

test('reconcilePendingResendMessageIds claims at most 5, backs off per attempt and ignores foreign environments', async () => {
  const claimedIds = ['email_a', 'email_b', 'email_c'];
  const { executor: lookupExecutor, calls } = executorWith({
    'claim-provider-message-lookups': () => ({
      rows: claimedIds.map((provider_email_id) => ({ provider_email_id })),
    }),
  });
  const fetch = vi.fn(async (url: string | URL | Request) => {
    const id = decodeURIComponent(String(url).split('/').at(-1) ?? '');
    return id === 'email_b'
      ? lookupResponse(id, 'production')
      : id === 'email_c'
        ? new Response('x'.repeat(131_073))
        : lookupResponse(id);
  });
  const bindProviderMessageId = vi.fn(async () => 'bound' as const);
  const signal = new AbortController().signal;

  const result = await reconcilePendingResendMessageIds(
    lookupExecutor,
    { now, signal },
    { fetch, env: lookupEnv, bindProviderMessageId },
  );

  expect(result).toEqual({ claimed: 3, bound: 1, deferred: 2 });
  const [claim] = calls;
  expect(claim?.params).toEqual([now]);
  expect(claim?.sql).toContain('limit 5 for update of job skip locked');
  expect(claim?.sql).toContain('job.rfc_message_id is null');
  expect(claim?.sql).toContain("'message_id_lookup_after'");
  expect(claim?.sql).toContain('make_interval(mins => least(60, power(2,');
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(fetch).toHaveBeenCalledWith(
    'https://api.resend.com/emails/email_a',
    expect.objectContaining({
      method: 'GET',
      headers: { Authorization: 'Bearer re_test_lookup' },
      redirect: 'error',
    }),
  );
  expect(bindProviderMessageId).toHaveBeenCalledExactlyOnceWith(
    lookupExecutor,
    { providerEmailId: 'email_a', rfcMessageId: '<email_a@resend.dev>' },
  );
});

test('reconcilePendingResendMessageIds skips without delivery configuration and throws on mismatched environments', async () => {
  const { executor: lookupExecutor, calls } = executorWith({});
  const fetch = vi.fn();
  const signal = new AbortController().signal;

  const unconfigured = await reconcilePendingResendMessageIds(
    lookupExecutor,
    { now, signal },
    { fetch, env: {} },
  );
  const mismatched = reconcilePendingResendMessageIds(
    lookupExecutor,
    { now, signal },
    {
      fetch,
      env: { ...lookupEnv, GROWTH_DATABASE_ENVIRONMENT: 'production' },
    },
  );

  expect(unconfigured).toEqual({ claimed: 0, bound: 0, deferred: 0 });
  await expect(mismatched).rejects.toThrow(
    'Provider lookup requires matching environments and credentials',
  );
  expect(calls).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
});

test('reconcilePendingResendMessageIds defers binding conflicts and surfaces database errors', async () => {
  const { executor: lookupExecutor } = executorWith({
    'claim-provider-message-lookups': () => ({
      rows: [{ provider_email_id: 'email_a' }],
    }),
  });
  const fetch = vi.fn(async () => lookupResponse('email_a'));
  const signal = new AbortController().signal;

  const conflict = await reconcilePendingResendMessageIds(
    lookupExecutor,
    { now, signal },
    {
      fetch,
      env: lookupEnv,
      bindProviderMessageId: async () => {
        throw new ProviderMessageIdBindingError('conflict');
      },
    },
  );
  const failure = reconcilePendingResendMessageIds(
    lookupExecutor,
    { now, signal },
    {
      fetch,
      env: lookupEnv,
      bindProviderMessageId: async () => {
        throw new Error('database unavailable');
      },
    },
  );

  expect(conflict).toEqual({ claimed: 1, bound: 0, deferred: 1 });
  await expect(failure).rejects.toThrow('database unavailable');
});
