import { expect, test } from 'vitest';

import type { SqlExecutor } from './database.ts';
import { executorWith } from './testing/fake-executor.ts';
import type { StopContactInput } from './stops.ts';
import {
  loadGrowthDatabaseEnvironment,
  type ProcessResendWebhookDependencies,
  processVerifiedResendWebhook,
  ResendWebhookPayloadError,
} from './webhooks.ts';

type TestRow = Record<string, unknown>;

const now = new Date('2026-09-01T12:00:00.000Z');
const jobId = '00000000-0000-4000-8000-000000000001';
const contactId = '00000000-0000-4000-8000-000000000002';
const providerEmailId = 'resend-email-1';
const tags = {
  app: 'hashbrown',
  environment: 'production',
  job_kind: 'send_step',
  campaign_version: 'v1',
  campaign_step: '1',
};

const legacyTags = Object.fromEntries(
  Object.entries(tags).filter(([name]) => name !== 'app'),
);

const baseData = {
  created_at: now.toISOString(),
  email_id: providerEmailId,
  from: 'Brian at Hashbrown <brian@hashbrown.dev>',
  to: ['developer@example.com'],
  subject: 'A note',
  tags,
};

const payloads: Record<string, unknown> = {
  'email.sent': {
    type: 'email.sent',
    created_at: now.toISOString(),
    data: baseData,
  },
  'email.delivered': {
    type: 'email.delivered',
    created_at: now.toISOString(),
    data: baseData,
  },
  'email.delivery_delayed': {
    type: 'email.delivery_delayed',
    created_at: now.toISOString(),
    data: baseData,
  },
  'email.complained': {
    type: 'email.complained',
    created_at: now.toISOString(),
    data: baseData,
  },
  'email.bounced': bounced('Permanent'),
  'email.failed': {
    type: 'email.failed',
    created_at: now.toISOString(),
    data: { ...baseData, failed: { reason: 'provider_rejected' } },
  },
  'email.suppressed': {
    type: 'email.suppressed',
    created_at: now.toISOString(),
    data: {
      ...baseData,
      suppressed: { type: 'Suppressed', message: 'suppressed' },
    },
  },
};

function bounced(type: string): unknown {
  return {
    type: 'email.bounced',
    created_at: now.toISOString(),
    data: {
      ...baseData,
      bounce: { type, subType: 'General', message: 'bounced' },
    },
  };
}

function jobRow(overrides: TestRow = {}): TestRow {
  return {
    id: jobId,
    kind: 'send_step',
    contact_id: contactId,
    project_id: null,
    status: 'completed',
    payload: { campaign_version: 'v1', step: 1 },
    provider_email_id: providerEmailId,
    delivery_status: 'submitted',
    ...overrides,
  };
}

function harness(options: { deliveryStatus?: string; jobs?: TestRow[] } = {}) {
  const stops: StopContactInput[] = [];
  const updates: unknown[][] = [];
  const job = jobRow({
    delivery_status: options.deliveryStatus ?? 'submitted',
  });
  const { executor, calls } = executorWith({
    'inbox-bind-outbound': () => ({ rows: [{ id: jobId }] }),
    'read-resend-webhook-activity': () => ({ rows: [] }),
    'discover-resend-webhook-job': () => ({
      rows: (options.jobs ?? [job]).map((row) => ({
        id: row['id'],
        contact_id: row['contact_id'],
      })),
    }),
    'lock-resend-webhook-contact': () => ({ rows: [{ id: contactId }] }),
    'lock-resend-webhook-job': () => ({ rows: options.jobs ?? [job] }),
    'insert-resend-webhook-activity': (params) => ({
      rows: [{ event_key: params[0] }],
    }),
    'update-resend-delivery-status': (params) => {
      updates.push([...params]);
      return { rows: [] };
    },
  });
  const dependencies: ProcessResendWebhookDependencies = {
    databaseEnvironment: 'production',
    stopContact: async (_executor: SqlExecutor, input) => {
      stops.push(input);
      return { applied: true, effective: true };
    },
  };
  return { executor, calls, dependencies, stops, updates };
}

test('verified delivery persists the outbound RFC Message-ID for reply matching', async () => {
  const { executor, calls, dependencies } = harness();

  await processVerifiedResendWebhook(
    executor,
    {
      providerEventId: 'event-with-message-id',
      payload: {
        type: 'email.sent',
        created_at: now.toISOString(),
        data: { ...baseData, message_id: '<outbound@resend.com>' },
      },
    },
    dependencies,
  );

  expect(
    calls.find((call) => call.marker === 'inbox-bind-outbound')?.params,
  ).toEqual([providerEmailId, '<outbound@resend.com>']);
});

const mapping = [
  ['email.sent', 'delivery.sent', 'submitted', undefined],
  ['email.delivered', 'delivery.delivered', 'delivered', undefined],
  ['email.delivery_delayed', 'delivery.delayed', 'submitted', undefined],
  ['email.bounced', 'delivery.bounced', 'bounced', 'hard_bounce'],
  ['email.complained', 'delivery.complained', 'complained', 'complaint'],
  [
    'email.suppressed',
    'delivery.suppressed',
    'suppressed',
    'provider_suppression',
  ],
  ['email.failed', 'delivery.failed', 'failed', undefined],
] as const;

for (const [type, activityKind, status, stopReason] of mapping) {
  test(`${type} maps to ${activityKind} and ${status}`, async () => {
    const { executor, dependencies, stops } = harness({
      deliveryStatus: 'submitted',
    });

    const result = await processVerifiedResendWebhook(
      executor,
      { providerEventId: 'evt-1', payload: payloads[type] },
      dependencies,
    );

    expect(result).toEqual({
      applied: true,
      activityKind,
      deliveryStatus: status === 'submitted' ? 'submitted' : status,
    });
    expect(stops.map((stop) => stop.reason)).toEqual(
      stopReason ? [stopReason] : [],
    );
  });
}

test('delivery status only moves up the precedence order', async () => {
  const lower = harness({ deliveryStatus: 'complained' });
  const higher = harness({ deliveryStatus: 'submitted' });

  const stays = await processVerifiedResendWebhook(
    lower.executor,
    { providerEventId: 'evt-1', payload: payloads['email.delivered'] },
    lower.dependencies,
  );
  const moves = await processVerifiedResendWebhook(
    higher.executor,
    { providerEventId: 'evt-1', payload: payloads['email.delivered'] },
    higher.dependencies,
  );

  expect(stays).toMatchObject({ applied: true, deliveryStatus: 'complained' });
  expect(lower.updates).toEqual([]);
  expect(moves).toMatchObject({ applied: true, deliveryStatus: 'delivered' });
  expect(higher.updates).toEqual([[jobId, 'delivered', providerEmailId]]);
});

test('a permanent bounce stops the contact with hard_bounce; a transient one does not', async () => {
  const permanent = harness();
  const transient = harness();

  await processVerifiedResendWebhook(
    permanent.executor,
    { providerEventId: 'evt-1', payload: bounced('Permanent') },
    permanent.dependencies,
  );
  await processVerifiedResendWebhook(
    transient.executor,
    { providerEventId: 'evt-2', payload: bounced('Transient') },
    transient.dependencies,
  );

  expect(permanent.stops).toEqual([
    {
      contactId,
      reason: 'hard_bounce',
      eventKey: 'resend:evt-1:stop',
      occurredAt: now,
      source: 'resend_webhook',
      provenance: {
        actor: 'resend',
        kind: 'provider_webhook',
        policyVersion: 'growth-lifecycle-v1',
      },
    },
  ]);
  expect(transient.stops).toEqual([]);
});

test('complained and suppressed stop with their reasons', async () => {
  const complained = harness();
  const suppressed = harness();

  await processVerifiedResendWebhook(
    complained.executor,
    { providerEventId: 'evt-1', payload: payloads['email.complained'] },
    complained.dependencies,
  );
  await processVerifiedResendWebhook(
    suppressed.executor,
    { providerEventId: 'evt-2', payload: payloads['email.suppressed'] },
    suppressed.dependencies,
  );

  expect(complained.stops.map((stop) => stop.reason)).toEqual(['complaint']);
  expect(suppressed.stops.map((stop) => stop.reason)).toEqual([
    'provider_suppression',
  ]);
});

test('environment tag mismatch returns environment_mismatch before any database call', async () => {
  const { executor, calls, dependencies } = harness();

  const result = await processVerifiedResendWebhook(
    executor,
    { providerEventId: 'evt-1', payload: payloads['email.sent'] },
    { ...dependencies, databaseEnvironment: 'preview' },
  );

  expect(result).toEqual({ applied: false, reason: 'environment_mismatch' });
  expect(calls).toEqual([]);
});

test('an event from a sender outside hashbrown.dev returns foreign_sender before any database call', async () => {
  const { executor, calls, dependencies } = harness();
  const payload = {
    type: 'email.delivered',
    created_at: now.toISOString(),
    data: {
      ...baseData,
      from: 'Brian at Threadplane <brian@threadplane.ai>',
      tags: { environment: 'production', job_kind: 'fulfill' },
    },
  };

  const result = await processVerifiedResendWebhook(
    executor,
    { providerEventId: 'evt-1', payload },
    dependencies,
  );

  expect(result).toEqual({ applied: false, reason: 'foreign_sender' });
  expect(calls).toEqual([]);
});

for (const app of ['threadplane']) {
  test(`a same-domain event with ${app ?? 'missing'} app is ignored before any database call`, async () => {
    const { executor, calls, dependencies, stops } = harness();
    const eventTags = {
      environment: 'production',
      job_kind: 'send_step',
      campaign_version: 'v1',
      campaign_step: '1',
      ...(app === undefined ? {} : { app }),
    };

    const result = await processVerifiedResendWebhook(
      executor,
      {
        providerEventId: 'evt-foreign-product',
        payload: {
          type: 'email.complained',
          created_at: now.toISOString(),
          data: {
            ...baseData,
            message_id: '<foreign@resend.com>',
            tags: eventTags,
          },
        },
      },
      dependencies,
    );

    expect(result).toEqual({ applied: false, reason: 'foreign_product' });
    expect(calls).toEqual([]);
    expect(stops).toEqual([]);
  });
}

test('sender domains are compared case-insensitively and in bare form', async () => {
  const bare = harness();
  const lookalike = harness();
  const bareSender = {
    type: 'email.sent',
    created_at: now.toISOString(),
    data: { ...baseData, from: 'Brian@HashBrown.DEV' },
  };
  const lookalikeSender = {
    type: 'email.sent',
    created_at: now.toISOString(),
    data: { ...baseData, from: 'Brian <brian@mail.hashbrown.dev.evil.test>' },
  };

  const accepted = await processVerifiedResendWebhook(
    bare.executor,
    { providerEventId: 'evt-1', payload: bareSender },
    bare.dependencies,
  );
  const refused = await processVerifiedResendWebhook(
    lookalike.executor,
    { providerEventId: 'evt-2', payload: lookalikeSender },
    lookalike.dependencies,
  );

  expect(accepted).toMatchObject({ applied: true });
  expect(refused).toEqual({ applied: false, reason: 'foreign_sender' });
  expect(lookalike.calls).toEqual([]);
});

test('an unsupported event type is ignored', async () => {
  const { executor, calls, dependencies } = harness();

  const result = await processVerifiedResendWebhook(
    executor,
    {
      providerEventId: 'evt-1',
      payload: {
        type: 'email.opened',
        created_at: now.toISOString(),
        data: {},
      },
    },
    dependencies,
  );

  expect(result).toEqual({ applied: false, reason: 'ignored_event_type' });
  expect(calls).toEqual([]);
});

test('a replayed svix id returns replay', async () => {
  const { dependencies } = harness();
  const { executor } = executorWith({
    'read-resend-webhook-activity': () => ({
      rows: [
        {
          event_key: 'resend:evt-1',
          contact_id: contactId,
          project_id: null,
          kind: 'delivery.sent',
          occurred_at: now,
          data: {
            provider: 'resend',
            provider_event_id: 'evt-1',
            provider_email_id: providerEmailId,
            event_type: 'email.sent',
            category: 'sent',
          },
        },
      ],
    }),
  });

  const result = await processVerifiedResendWebhook(
    executor,
    { providerEventId: 'evt-1', payload: payloads['email.sent'] },
    dependencies,
  );

  expect(result).toEqual({ applied: false, reason: 'replay' });
});

test('our own tags with no matching job return retryable_unmatched_job', async () => {
  const { executor, dependencies } = harness({ jobs: [] });

  const result = await processVerifiedResendWebhook(
    executor,
    { providerEventId: 'evt-1', payload: payloads['email.sent'] },
    dependencies,
  );

  expect(result).toEqual({ applied: false, reason: 'retryable_unmatched_job' });
});

for (const eventTags of [
  { app: 'hashbrown', environment: 'production', job_kind: 'fulfill' },
  { ...tags, campaign_template: 'immediate' },
]) {
  test(`our ${eventTags.job_kind} tags with ${Object.keys(eventTags).length} entries remain retryable`, async () => {
    const { executor, dependencies } = harness({ jobs: [] });

    const result = await processVerifiedResendWebhook(
      executor,
      {
        providerEventId: 'evt-1',
        payload: {
          type: 'email.sent',
          created_at: now.toISOString(),
          data: { ...baseData, tags: eventTags },
        },
      },
      dependencies,
    );

    expect(result).toEqual({
      applied: false,
      reason: 'retryable_unmatched_job',
    });
  });
}

test('non-growth Hashbrown tags with no matching job return unmatched_job', async () => {
  const { executor, dependencies } = harness({ jobs: [] });
  const payload = {
    type: 'email.sent',
    created_at: now.toISOString(),
    data: {
      ...baseData,
      tags: { app: 'hashbrown', environment: 'production', other: 'x' },
    },
  };

  const result = await processVerifiedResendWebhook(
    executor,
    { providerEventId: 'evt-1', payload },
    dependencies,
  );

  expect(result).toEqual({ applied: false, reason: 'unmatched_job' });
});

test('tags that contradict the matched job are rejected', async () => {
  const { executor, dependencies } = harness({
    jobs: [jobRow({ payload: { campaign_version: 'v1', step: 2 } })],
  });

  const act = processVerifiedResendWebhook(
    executor,
    { providerEventId: 'evt-1', payload: payloads['email.sent'] },
    dependencies,
  );

  await expect(act).rejects.toThrow('Resend webhook corroboration conflict');
});

test('malformed payloads throw ResendWebhookPayloadError', async () => {
  const { executor, dependencies } = harness();
  const malformed = [
    null,
    'text',
    { type: 'email.sent', created_at: 'yesterday', data: baseData },
    { type: 'email.sent', created_at: now.toISOString(), data: {} },
    {
      type: 'email.sent',
      created_at: now.toISOString(),
      data: { ...baseData, to: [] },
    },
    { ...(payloads['email.sent'] as object), extra: true },
    {
      type: 'email.delivered',
      created_at: now.toISOString(),
      data: { ...baseData, bounce: {} },
    },
  ];

  for (const payload of malformed) {
    await expect(
      processVerifiedResendWebhook(
        executor,
        { providerEventId: 'evt-1', payload },
        dependencies,
      ),
    ).rejects.toBeInstanceOf(ResendWebhookPayloadError);
  }
  await expect(
    processVerifiedResendWebhook(
      executor,
      { providerEventId: 'bad id', payload: payloads['email.sent'] },
      dependencies,
    ),
  ).rejects.toBeInstanceOf(ResendWebhookPayloadError);
});

test('loadGrowthDatabaseEnvironment accepts only the three environments', () => {
  const accepted = loadGrowthDatabaseEnvironment({
    GROWTH_DATABASE_ENVIRONMENT: 'preview',
  });

  expect(accepted).toBe('preview');
  expect(() => loadGrowthDatabaseEnvironment({})).toThrow(
    'GROWTH_DATABASE_ENVIRONMENT must be production, preview, or test',
  );
  expect(() =>
    loadGrowthDatabaseEnvironment({ GROWTH_DATABASE_ENVIRONMENT: 'staging' }),
  ).toThrow();
});

for (const [type, reason, deliveryStatus] of [
  ['email.complained', 'complaint', 'complained'],
  ['email.bounced', 'hard_bounce', 'bounced'],
] as const) {
  test(`legacy tagless ${type} still stops its authoritatively matched contact`, async () => {
    const { executor, dependencies, stops } = harness();
    const payload = {
      type,
      created_at: now.toISOString(),
      data: {
        ...baseData,
        tags: legacyTags,
        ...(type === 'email.bounced'
          ? {
              bounce: {
                type: 'Permanent',
                subType: 'General',
                message: 'bounced',
              },
            }
          : {}),
      },
    };

    const result = await processVerifiedResendWebhook(
      executor,
      {
        providerEventId: `legacy-${type}`,
        payload,
      },
      dependencies,
    );

    expect(result).toMatchObject({ applied: true, deliveryStatus });
    expect(stops).toEqual([expect.objectContaining({ contactId, reason })]);
  });
}

test('unmatched legacy tagless events are acknowledged without activity or stops', async () => {
  const { executor, calls, dependencies, stops, updates } = harness({
    jobs: [],
  });

  const result = await processVerifiedResendWebhook(
    executor,
    {
      providerEventId: 'unmatched-legacy',
      payload: {
        type: 'email.complained',
        created_at: now.toISOString(),
        data: { ...baseData, tags: legacyTags },
      },
    },
    dependencies,
  );

  expect(result).toEqual({ applied: false, reason: 'unmatched_job' });
  expect(calls.map(({ marker }) => marker)).toEqual([
    'read-resend-webhook-activity',
    'discover-resend-webhook-job',
  ]);
  expect(stops).toEqual([]);
  expect(updates).toEqual([]);
});

test('matched legacy tagless events must pass corroboration before any write', async () => {
  const { executor, calls, dependencies, stops } = harness();

  await expect(
    processVerifiedResendWebhook(
      executor,
      {
        providerEventId: 'conflicting-legacy',
        payload: {
          type: 'email.complained',
          created_at: now.toISOString(),
          data: { ...baseData, tags: { ...legacyTags, campaign_step: '2' } },
        },
      },
      dependencies,
    ),
  ).rejects.toThrow('corroboration conflict');

  expect(
    calls.some(({ marker }) => marker === 'insert-resend-webhook-activity'),
  ).toBe(false);
  expect(stops).toEqual([]);
});
