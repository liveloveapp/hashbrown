import { expect, test, vi } from 'vitest';

import { createInboxRuntime } from './inbox-runtime.ts';
import { forwardInboxReceipt } from './inbox-forward.ts';
import { executorWith } from './testing/fake-executor.ts';

vi.mock('./inbox-forward.ts', () => ({
  downloadInboxRaw: vi.fn(),
  forwardInboxReceipt: vi.fn(async (_db, _id, deps) =>
    deps.send({ text: 'mail', replyTo: 'reader@example.com' }, 'stable-key'),
  ),
}));

test('inbox runtime bounds sending and separates read and send credentials with fixed environment', async () => {
  const environment = {
    RESEND_API_KEY: 'send-key',
    GROWTH_EMAIL_HMAC_ACTIVE_SECRET: 'k'.repeat(32),
    GROWTH_EMAIL_HMAC_ACTIVE_VERSION: '1',
    RESEND_INBOX_READ_API_KEY: 'read-key',
    GROWTH_DATABASE_ENVIRONMENT: 'production',
  };
  const { executor } = executorWith({});
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(Response.json({ id: 'incoming-1' }))
    .mockResolvedValueOnce(Response.json({ id: 'forward-1' }));
  const timeout = vi.spyOn(AbortSignal, 'timeout');
  const runtime = createInboxRuntime(environment);
  environment.GROWTH_DATABASE_ENVIRONMENT = 'preview';
  environment.RESEND_API_KEY = 'changed-send-key';
  environment.RESEND_INBOX_READ_API_KEY = 'changed-read-key';

  try {
    await runtime.getReceived('incoming-1');
    const result = await runtime.forwardReceipt(executor, 'incoming-1');

    expect(result).toBe('forward-1');
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      'https://api.resend.com/emails/receiving/incoming-1',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer read-key' }),
      }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      'https://api.resend.com/emails',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer send-key',
          'Content-Type': 'application/json',
          'Idempotency-Key': 'stable-key',
        },
        redirect: 'error',
        signal: expect.any(AbortSignal),
        body: JSON.stringify({ text: 'mail', reply_to: 'reader@example.com' }),
      },
    );
    expect(timeout).toHaveBeenLastCalledWith(15000);
    expect(forwardInboxReceipt).toHaveBeenCalledWith(
      executor,
      'incoming-1',
      expect.objectContaining({ environment: 'production' }),
    );
  } finally {
    fetcher.mockRestore();
    timeout.mockRestore();
  }
});

test.each(['http', 'invalid-json', 'missing-id', 'transport'])(
  'inbox runtime redacts %s forwarding failures',
  async (kind) => {
    const fetcher = vi.spyOn(globalThis, 'fetch');
    if (kind === 'transport')
      fetcher.mockRejectedValue(new Error('secret provider response'));
    else
      fetcher.mockResolvedValue(
        kind === 'http'
          ? new Response('secret provider response', { status: 500 })
          : kind === 'invalid-json'
            ? new Response('secret provider response')
            : Response.json({ message: 'secret provider response' }),
      );
    const { executor } = executorWith({});
    const runtime = createInboxRuntime({
      RESEND_API_KEY: 'send-key',
      GROWTH_EMAIL_HMAC_ACTIVE_SECRET: 'k'.repeat(32),
      GROWTH_EMAIL_HMAC_ACTIVE_VERSION: '1',
      RESEND_INBOX_READ_API_KEY: 'read-key',
      GROWTH_DATABASE_ENVIRONMENT: 'production',
    });

    try {
      await expect(
        runtime.forwardReceipt(executor, 'incoming-1'),
      ).rejects.toThrow(/^Inbox forward submission failed$/);
    } finally {
      fetcher.mockRestore();
    }
  },
);

test('inbox runtime requires sending credentials and a registered environment', () => {
  expect(() =>
    createInboxRuntime({
      RESEND_INBOX_READ_API_KEY: 'read-key',
      GROWTH_DATABASE_ENVIRONMENT: 'production',
    }),
  ).toThrow();
  expect(() =>
    createInboxRuntime({
      RESEND_API_KEY: 'send-key',
      GROWTH_EMAIL_HMAC_ACTIVE_SECRET: 'k'.repeat(32),
      GROWTH_EMAIL_HMAC_ACTIVE_VERSION: '1',
      RESEND_INBOX_READ_API_KEY: 'read-key',
    }),
  ).toThrow();
});

for (const state of ['deleted', 'active', 'unknown'] as const) {
  test(`runtime erasure guard resolves ${state} senders through retained HMAC lookups`, async () => {
    const { executor, calls } = executorWith({
      'founder-find-contact-by-email': () => ({
        rows: state === 'unknown' ? [] : [{ id: 'contact-1' }],
      }),
      'inbox-forward-sender-deletion': () => ({
        rows: [{ deleted_at: state === 'deleted' ? new Date() : null }],
      }),
    });
    vi.mocked(forwardInboxReceipt).mockImplementationOnce(
      async (_db, _id, deps) =>
        (await deps.isErasedSender(executor, 'reader@example.com'))
          ? 'erased'
          : null,
    );
    const environment = {
      RESEND_API_KEY: 'send-key',
      RESEND_INBOX_READ_API_KEY: 'read-key',
      GROWTH_DATABASE_ENVIRONMENT: 'production',
      GROWTH_EMAIL_HMAC_ACTIVE_SECRET: 'k'.repeat(32),
      GROWTH_EMAIL_HMAC_ACTIVE_VERSION: '1',
    };
    const runtime = createInboxRuntime(environment);
    environment.GROWTH_EMAIL_HMAC_ACTIVE_SECRET = 'changed';

    const result = await runtime.forwardReceipt(executor, 'incoming-1');

    expect(result).toBe(state === 'deleted' ? 'erased' : null);
    expect(
      calls.find((call) => call.marker === 'founder-find-contact-by-email'),
    ).toBeDefined();
    expect(JSON.stringify(calls)).not.toContain('reader@example.com');
  });
}
