import { createHash } from 'node:crypto';
import { expect, test, vi } from 'vitest';

import { admitInboxEvent, processInboxReceipt } from './inbox-replies.ts';
import { recoverInbox } from './inbox-recovery.ts';
import { buildInboxForward, forwardInboxReceipt } from './inbox-forward.ts';
import { executorWith } from './testing/fake-executor.ts';

const config = {
  enabled: true as const,
  address: 'brian@replies.hashbrown.dev',
  startedAt: new Date('2026-10-22T00:00:00Z'),
};
const now = new Date('2026-10-22T01:00:00Z');

for (const address of ['BRIAN@HASHBROWN.DEV', 'BRIAN@REPLIES.HASHBROWN.DEV']) {
  test(`admits ${address} into the existing mailbox ledger`, async () => {
    const { executor, calls } = executorWith({
      'inbox-ensure-mailbox': () => ({ rows: [{ address: config.address }] }),
      'inbox-admit': () => ({ rows: [] }),
    });

    const id = await admitInboxEvent(
      executor,
      {
        type: 'email.received',
        created_at: now.toISOString(),
        data: { email_id: 'incoming-1', to: [address] },
      },
      config,
    );

    expect(id).toBe('incoming-1');
    expect(calls.find((call) => call.marker === 'inbox-admit')?.params).toEqual(
      ['incoming-1', config.address, now],
    );
  });

  test(`matches authoritative replies at ${address} and applies the canonical stop`, async () => {
    const stopContact = vi.fn(async () => ({ applied: true }));
    const { executor } = executorWith({
      'inbox-receipt-lock': () => ({
        rows: [{ recipient: config.address, status: 'pending' }],
      }),
      'inbox-match': () => ({
        rows: [
          { contact_id: 'contact-1', rfc_message_id: '<sent@resend.com>' },
        ],
      }),
      'inbox-contact-lock': () => ({
        rows: [
          {
            id: 'contact-1',
            deleted_at: null,
            email_normalized: 'reader@example.com',
          },
        ],
      }),
      'inbox-complete': () => ({ rows: [] }),
    });

    const result = await processInboxReceipt(executor, 'incoming-1', config, {
      getReceived: async () => ({
        id: 'incoming-1',
        to: [address],
        from: 'reader@example.com',
        created_at: now.toISOString(),
        headers: { 'In-Reply-To': '<sent@resend.com>' },
      }),
      stopContact: stopContact as never,
    });

    expect(result).toBe('stopped');
    expect(stopContact).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        contactId: 'contact-1',
        reason: 'campaign.reply_received',
        eventKey: 'resend:reply:incoming-1:stop',
      }),
    );
  });

  test(`recovers ${address} using the original coverage boundary`, async () => {
    const { executor, calls } = executorWith({
      'inbox-ensure-mailbox': () => ({ rows: [{ address: config.address }] }),
      'inbox-recovery-start': () => ({ rows: [{ healthy_through: null }] }),
      'inbox-unbound': () => ({ rows: [] }),
      'inbox-admit': () => ({ rows: [] }),
      'inbox-list-pending': () => ({ rows: [] }),
      'inbox-recovery-complete': () => ({
        rows: [{ address: config.address }],
      }),
    });

    const result = await recoverInbox(executor, config, {
      listReceived: async function* () {
        yield {
          id: 'incoming-1',
          to: [address],
          created_at: now.toISOString(),
        };
      },
      getSent: vi.fn(),
      getReceived: vi.fn(),
      stopContact: vi.fn(),
      now: () => now,
    });

    expect(result).toEqual({ received: 1, processed: 0 });
    expect(
      calls.find((call) => call.marker === 'inbox-ensure-mailbox')?.params,
    ).toEqual([config.address, config.startedAt]);
  });

  test(`forwards ${address} once to the fixed human destination`, async () => {
    const email = {
      id: 'incoming-1',
      to: [address],
      from: 'reader@example.com',
      created_at: now.toISOString(),
      headers: {},
      raw: { download_url: 'https://example.com/raw' },
    };
    const raw = Buffer.from('original MIME');
    const payload = buildInboxForward(email, raw, 'production');
    const send = vi.fn(async () => 'forward-1');
    const { executor } = executorWith({
      'inbox-forward-receipt': () => ({
        rows: [
          {
            recipient: config.address,
            forward_provider_id: null,
            last_error_code: null,
          },
        ],
      }),
      'inbox-forward-accepted': () => ({ rows: [] }),
      'provider-attempt-insert': () => ({ rows: [] }),
      'provider-attempt-lock': () => ({
        rows: [
          {
            first_attempted_at: now,
            payload_sha256: createHash('sha256')
              .update(JSON.stringify(payload))
              .digest('hex'),
            provider_email_id: null,
          },
        ],
      }),
      'provider-attempt-complete': () => ({
        rows: [{ idempotency_key: 'key' }],
      }),
      'inbox-forward-complete': () => ({ rows: [{ id: email.id }] }),
    });

    const result = await forwardInboxReceipt(executor, email.id, {
      environment: 'production',
      isErasedSender: async () => false,
      getReceived: async () => email,
      getRaw: async () => raw,
      send,
      now: () => now,
    });

    expect(result).toBe('forward-1');
    expect(send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        to: 'brian@cacheplane.ai',
        replyTo: email.from,
      }),
      expect.stringContaining('hashbrown:production:'),
    );
  });
}

for (const address of [
  'other@hashbrown.dev',
  'brian+tag@hashbrown.dev',
  'brian@threadplane.ai',
]) {
  test(`does not admit an unconfigured address ${address}`, async () => {
    const { executor, calls } = executorWith({});

    const result = await admitInboxEvent(
      executor,
      {
        type: 'email.received',
        created_at: now.toISOString(),
        data: { email_id: 'incoming-1', to: [address] },
      },
      config,
    );

    expect(result).toBeNull();
    expect(calls).toEqual([]);
  });
}

test('authoritative content for a different root alias cannot stop or forward', async () => {
  const email = {
    id: 'incoming-1',
    to: ['other@hashbrown.dev'],
    from: 'reader@example.com',
    created_at: now.toISOString(),
    headers: { 'In-Reply-To': '<sent@resend.com>' },
    raw: { download_url: 'https://example.com/raw' },
  };
  const stopContact = vi.fn();
  const send = vi.fn();
  const getRaw = vi.fn();
  const { executor, calls } = executorWith({
    'inbox-forward-receipt': () => ({
      rows: [
        {
          recipient: config.address,
          forward_provider_id: null,
          last_error_code: null,
        },
      ],
    }),
    'inbox-forward-accepted': () => ({ rows: [] }),
  });

  await expect(
    processInboxReceipt(executor, email.id, config, {
      getReceived: async () => email,
      stopContact,
    }),
  ).rejects.toThrow('Received mailbox mismatch');
  await expect(
    forwardInboxReceipt(executor, email.id, {
      environment: 'production',
      isErasedSender: async () => false,
      getReceived: async () => email,
      getRaw,
      send,
    }),
  ).rejects.toThrow('Forward source mismatch');

  expect(stopContact).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
  expect(getRaw).not.toHaveBeenCalled();
  expect(calls.some((call) => call.marker === 'provider-attempt-insert')).toBe(
    false,
  );
});
