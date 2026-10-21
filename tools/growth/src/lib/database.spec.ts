import { expect, test, vi } from 'vitest';

import {
  createDatabaseExecutor,
  nestedExecutor,
  privacyLock,
  type SqlTransaction,
} from './database';

interface FakePoolClient {
  query(sql: string): Promise<{ rows: unknown[] }>;
  release(error?: unknown): void;
}

const neon = vi.hoisted(() => ({
  client: {
    query: async () => ({ rows: [] }),
    release: () => undefined,
  } as FakePoolClient,
}));

vi.mock('@neondatabase/serverless', () => ({
  Pool: class {
    async connect() {
      return neon.client;
    }
    async end() {
      return undefined;
    }
  },
}));

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

test('a failed rollback does not mask the original error', async () => {
  const original = new Error('operation failed');
  const rollbackFailure = new Error('rollback failed');
  const statements: string[] = [];
  const released: unknown[][] = [];
  neon.client = {
    async query(sql: string) {
      statements.push(sql);
      if (sql === 'rollback') throw rollbackFailure;
      return { rows: [] };
    },
    release(...args: unknown[]) {
      released.push(args);
    },
  };
  const executor = createDatabaseExecutor('postgres://fake.invalid/db');

  const attempt = executor.transaction(async () => {
    throw original;
  });

  await expect(attempt).rejects.toBe(original);
  expect(statements).toEqual(['begin', 'rollback']);
  expect(released).toEqual([[rollbackFailure]]);
});

test('a successful rollback releases the client for reuse', async () => {
  const original = new Error('operation failed');
  const released: unknown[][] = [];
  neon.client = {
    async query() {
      return { rows: [] };
    },
    release(...args: unknown[]) {
      released.push(args);
    },
  };
  const executor = createDatabaseExecutor('postgres://fake.invalid/db');

  const attempt = executor.transaction(async () => {
    throw original;
  });

  await expect(attempt).rejects.toBe(original);
  expect(released).toEqual([[]]);
});
