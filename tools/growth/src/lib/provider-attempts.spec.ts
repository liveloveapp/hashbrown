import { expect, test } from 'vitest';

import {
  providerIdempotencyKey,
  reserveProviderAttempt,
} from './provider-attempts.ts';
import { executorWith } from './testing/fake-executor.ts';

test('provider keys isolate products and environments without exceeding provider limits', () => {
  expect(providerIdempotencyKey('production', 'job:1')).not.toBe(
    providerIdempotencyKey('preview', 'job:1'),
  );
  expect(
    providerIdempotencyKey('production', 'x'.repeat(1000)).length,
  ).toBeLessThan(256);
});

test('payload drift under a retry key is rejected before a second send', async () => {
  const { executor } = executorWith({
    'provider-attempt-insert': () => ({ rows: [] }),
    'provider-attempt-lock': () => ({
      rows: [
        {
          first_attempted_at: new Date('2026-10-22T00:00:00Z'),
          payload_sha256: 'different',
          provider_email_id: null,
        },
      ],
    }),
  });

  await expect(
    reserveProviderAttempt(
      executor,
      'key',
      { text: 'changed token' },
      new Date('2026-10-22T01:00:00Z'),
    ),
  ).rejects.toThrow('payload');
});

test('unknown sends cannot be retried beyond 23 hours', async () => {
  const { executor } = executorWith({
    'provider-attempt-insert': () => ({ rows: [] }),
    'provider-attempt-lock': () => ({
      rows: [
        {
          first_attempted_at: new Date('2026-10-22T00:00:00Z'),
          payload_sha256: 'unused',
          provider_email_id: null,
        },
      ],
    }),
  });

  await expect(
    reserveProviderAttempt(
      executor,
      'key',
      { text: 'same' },
      new Date('2026-10-22T23:00:00Z'),
    ),
  ).rejects.toThrow('expired');
});
