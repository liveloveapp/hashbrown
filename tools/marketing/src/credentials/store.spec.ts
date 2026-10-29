import { randomBytes } from 'node:crypto';

import { expect, test } from 'vitest';

import type { SqlExecutor } from '../growth.ts';
import { decryptCredentials } from './crypto.ts';
import { createCredentialStore } from './store.ts';

const key = randomBytes(32).toString('base64');

function fakeExecutor(rows: Record<string, unknown>[] = []) {
  const calls: Array<{ sql: string; parameters: readonly unknown[] }> = [];
  const executor: SqlExecutor = {
    async execute(sql, parameters = []) {
      calls.push({ sql, parameters });
      return { rows } as never;
    },
    async transaction() {
      throw new Error('not used');
    },
  };
  return { executor, calls };
}

test('put upserts one encrypted row per channel with the expiry', async () => {
  const { executor, calls } = fakeExecutor();
  const store = createCredentialStore(executor, key);

  await store.put('x', {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresAt: '2026-12-01T00:00:00.000Z',
  });

  expect(calls).toHaveLength(1);
  expect(calls[0].sql).toMatch(/insert into marketing_channel_credentials/i);
  expect(calls[0].sql).toMatch(/on conflict \(channel\) do update/i);
  const [channel, ciphertext, expiresAt] = calls[0].parameters as string[];
  expect(channel).toBe('x');
  expect(ciphertext).not.toContain('access-1');
  expect(decryptCredentials(ciphertext, key).accessToken).toBe('access-1');
  expect(expiresAt).toBe('2026-12-01T00:00:00.000Z');
});

test('put stores a null expiry when the credentials have none', async () => {
  const { executor, calls } = fakeExecutor();

  await createCredentialStore(executor, key).put('linkedin', {
    accessToken: 'li-1',
  });

  expect(calls[0].parameters[2]).toBeNull();
});

test('get decrypts the stored row and returns undefined when there is none', async () => {
  const writer = fakeExecutor();
  await createCredentialStore(writer.executor, key).put('x', {
    accessToken: 'access-1',
  });
  const ciphertext = writer.calls[0].parameters[1];

  const found = await createCredentialStore(
    fakeExecutor([{ ciphertext }]).executor,
    key,
  ).get('x');
  const missing = await createCredentialStore(fakeExecutor().executor, key).get(
    'x',
  );

  expect(found).toEqual({ accessToken: 'access-1' });
  expect(missing).toBeUndefined();
});

test('expiringWithin queries the cutoff and returns ISO expiries', async () => {
  const { executor, calls } = fakeExecutor([
    { channel: 'linkedin', expires_at: new Date('2026-11-05T00:00:00.000Z') },
  ]);

  const expiring = await createCredentialStore(executor, key).expiringWithin(
    new Date('2026-11-01T00:00:00.000Z'),
    7,
  );

  expect(calls[0].parameters).toEqual(['2026-11-08T00:00:00.000Z']);
  expect(expiring).toEqual([
    { channel: 'linkedin', expiresAt: '2026-11-05T00:00:00.000Z' },
  ]);
});
