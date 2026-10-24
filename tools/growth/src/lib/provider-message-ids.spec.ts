import { expect, test } from 'vitest';

import {
  bindProviderMessageId,
  normalizeReplySubject,
  ProviderMessageIdBindingError,
  replySubjectSha256,
  sha256Base64Url,
} from './provider-message-ids.ts';
import { executorWith } from './testing/fake-executor.ts';

test('replySubjectSha256 hashes the subject after stripping reply prefixes and whitespace', () => {
  const sent = 'Engineer to engineer';

  const normalized = normalizeReplySubject(
    '  RE: Fwd:re:  Engineer   to engineer ',
  );
  const digests = [
    replySubjectSha256(sent),
    replySubjectSha256('Re: Engineer to engineer'),
    replySubjectSha256('AW: engineer TO engineer'),
  ];

  expect(normalized).toBe('engineer to engineer');
  expect(new Set(digests)).toEqual(
    new Set([sha256Base64Url('engineer to engineer')]),
  );
  expect(replySubjectSha256('Got your note')).not.toBe(digests[0]);
});

test('bindProviderMessageId rejects malformed identities before touching the database', async () => {
  const { executor, calls } = executorWith({});

  const badMessageId = bindProviderMessageId(executor, {
    providerEmailId: 'resend-1',
    rfcMessageId: 'not-a-message-id',
  });
  const badProviderId = bindProviderMessageId(executor, {
    providerEmailId: ' bad id',
    rfcMessageId: '<a@resend.dev>',
  });

  await expect(badMessageId).rejects.toBeInstanceOf(
    ProviderMessageIdBindingError,
  );
  await expect(badProviderId).rejects.toBeInstanceOf(
    ProviderMessageIdBindingError,
  );
  expect(calls).toEqual([]);
});

test('bindProviderMessageId binds a completed send without any reply reconciliation', async () => {
  const job = {
    id: '00000000-0000-4000-8000-000000000001',
    kind: 'send_step',
    contact_id: '00000000-0000-4000-8000-000000000002',
    status: 'completed',
    provider_email_id: 'resend-1',
    delivery_status: 'submitted',
    rfc_message_id: null,
  };
  const { executor, calls } = executorWith({
    'discover-provider-message-job': () => ({ rows: [job] }),
    'lock-provider-message-contact': () => ({
      rows: [{ id: job.contact_id, deleted_at: null }],
    }),
    'lock-provider-message-job': () => ({ rows: [job] }),
    'check-provider-message-conflicts': () => ({ rows: [] }),
    'bind-provider-message-id': () => ({ rows: [{ id: job.id }] }),
  });

  const result = await bindProviderMessageId(executor, {
    providerEmailId: 'resend-1',
    rfcMessageId: '<Abc@Resend.dev>',
  });

  expect(result).toBe('bound');
  expect(calls.map(({ marker }) => marker)).toEqual([
    'discover-provider-message-job',
    'lock-provider-message-contact',
    'lock-provider-message-job',
    'check-provider-message-conflicts',
    'bind-provider-message-id',
  ]);
  expect(calls.at(-1)?.params).toEqual([
    job.id,
    'resend-1',
    '<Abc@resend.dev>',
  ]);
});
