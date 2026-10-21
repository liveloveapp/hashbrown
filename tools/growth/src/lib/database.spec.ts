import { expect, test } from 'vitest';

import {
  createDatabaseExecutor,
  nestedExecutor,
  privacyLock,
  type SqlTransaction,
} from './database';

function recordingTransaction(): {
  tx: SqlTransaction;
  calls: { sql: string; parameters?: readonly unknown[] }[];
} {
  const calls: { sql: string; parameters?: readonly unknown[] }[] = [];
  return {
    calls,
    tx: {
      async execute(sql, parameters) {
        calls.push({ sql, parameters });
        return { rows: [] };
      },
    },
  };
}

test('createDatabaseExecutor throws without a connection string', () => {
  const attempt = () => createDatabaseExecutor(undefined);

  const previous = process.env['DATABASE_URL'];
  delete process.env['DATABASE_URL'];
  try {
    expect(attempt).toThrow('DATABASE_URL is required');
  } finally {
    if (previous !== undefined) process.env['DATABASE_URL'] = previous;
  }
});

test('nestedExecutor runs transaction callbacks on the outer transaction', async () => {
  const { tx, calls } = recordingTransaction();
  const executor = nestedExecutor(tx);

  const seen = await executor.transaction(async (inner) => {
    await inner.execute('select 1', [1]);
    return inner;
  });
  await executor.execute('select 2');

  expect(seen).toBe(tx);
  expect(calls.map((call) => call.sql)).toEqual(['select 1', 'select 2']);
});

test('privacyLock takes the shared lock by default and the exclusive one on request', async () => {
  const { tx, calls } = recordingTransaction();

  await privacyLock(tx);
  await privacyLock(tx, true);

  expect(calls[0].sql).toContain('pg_advisory_xact_lock_shared');
  expect(calls[1].sql).toContain('pg_advisory_xact_lock(');
  expect(calls[1].sql).not.toContain('_shared');
  expect(calls.every((call) => call.sql.includes("'growth-privacy-v1'"))).toBe(
    true,
  );
  expect(calls.every((call) => call.sql.includes('/* growth:'))).toBe(true);
});
