import { afterEach, expect, test, vi } from 'vitest';
import {
  processVerifiedResendWebhook,
  ResendWebhookPayloadError,
  stopContact,
} from '@hashbrownai-internal/growth';

import { createResendWebhookRoute } from '../../src/app/%5F/webhooks/resend/route';

const HEADERS = {
  'svix-id': 'msg_1',
  'svix-timestamp': '1760000000',
  'svix-signature': 'v1,abc',
};

function setup(overrides: Record<string, unknown> = {}) {
  const close = vi.fn(async () => undefined);
  const process = vi.fn(async () => ({
    applied: true as const,
    activityKind: 'email.delivered',
    deliveryStatus: 'delivered',
  }));
  const verify = vi.fn(() => ({ type: 'email.delivered' }));
  const route = createResendWebhookRoute({
    loadWebhookSecret: () => 'whsec_test',
    loadDatabaseEnvironment: () => 'test',
    verify,
    createDatabase: () => ({ close }) as never,
    processVerifiedResendWebhook: process as never,
    ...overrides,
  } as never);
  return { route, close, process, verify };
}

function request(body: string, headers: Record<string, string> = HEADERS) {
  return new Request('https://hashbrown.dev/_/webhooks/resend', {
    method: 'POST',
    headers,
    body,
  });
}

afterEach(() => vi.restoreAllMocks());

test('webhook rejects missing svix headers with 400 and oversize bodies with 413', async () => {
  const { route, verify } = setup();

  const missing = await route.POST(request('{}', { 'svix-id': 'msg_1' }));
  const oversize = await route.POST(request('x'.repeat(65_537)));

  expect(missing.status).toBe(400);
  expect(oversize.status).toBe(413);
  expect(verify).not.toHaveBeenCalled();
});

test('webhook returns 503 without a secret and 400 on a bad signature', async () => {
  const noSecret = setup({ loadWebhookSecret: () => '' });
  const badSignature = setup({
    verify: () => {
      throw new Error('bad signature');
    },
  });

  const first = await noSecret.route.POST(request('{}'));
  const second = await badSignature.route.POST(request('{}'));

  expect(first.status).toBe(503);
  expect(second.status).toBe(400);
});

test('webhook returns 503 for retryable_unmatched_job and 200 otherwise', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const retry = setup({
    processVerifiedResendWebhook: async () => ({
      applied: false,
      reason: 'retryable_unmatched_job',
    }),
  });
  const ok = setup();

  const retryable = await retry.route.POST(request('{}'));
  const accepted = await ok.route.POST(request('{}'));

  expect(retryable.status).toBe(503);
  expect(accepted.status).toBe(200);
  expect(await accepted.text()).toBe('Accepted');
  expect(accepted.headers.get('cache-control')).toBe('no-store');
  expect(ok.process).toHaveBeenCalledWith(
    expect.anything(),
    { providerEventId: 'msg_1', payload: { type: 'email.delivered' } },
    expect.objectContaining({ databaseEnvironment: 'test' }),
  );
  expect(ok.close).toHaveBeenCalledTimes(1);
});

test('webhook maps payload errors to 400 and other faults to 503', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const invalid = setup({
    processVerifiedResendWebhook: async () => {
      throw new ResendWebhookPayloadError();
    },
  });
  const fault = setup({
    processVerifiedResendWebhook: async () => {
      throw new Error('db down');
    },
  });

  const first = await invalid.route.POST(request('{}'));
  const second = await fault.route.POST(request('{}'));

  expect(first.status).toBe(400);
  expect(second.status).toBe(503);
  expect(await second.text()).toBe('Unable to process request');
  expect(info).toHaveBeenCalledTimes(2);
});

test('mismatched environment returns 200 and writes nothing', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const execute = vi.fn();
  const transaction = vi.fn();
  const close = vi.fn(async () => undefined);
  const { route } = setup({
    loadDatabaseEnvironment: () => 'production',
    createDatabase: () => ({ execute, transaction, close }),
    processVerifiedResendWebhook,
    stopContact,
    verify: () => ({
      type: 'email.delivered',
      created_at: '2026-10-21T12:00:00.000Z',
      data: {
        created_at: '2026-10-21T12:00:00.000Z',
        from: 'Hashbrown <hello@example.com>',
        subject: 'Hello',
        to: ['a@example.com'],
        email_id: 'em_1',
        tags: { environment: 'test' },
      },
    }),
  });

  const response = await route.POST(request('{}'));

  expect(response.status).toBe(200);
  expect(transaction).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledTimes(1);
});
