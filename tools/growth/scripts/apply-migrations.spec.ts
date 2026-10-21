import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'vitest';

import type { SqlExecutor, SqlTransaction } from '../src/lib/database.ts';
import { applyMigrations, discoverMigrations } from './apply-migrations.mts';

interface Recorded {
  sql: string;
  parameters: readonly unknown[];
}

function fakeExecutor(ledger: Record<string, string>) {
  const transactions: Recorded[][] = [];
  const executor: SqlExecutor = {
    async execute() {
      throw new Error('migrations must run inside transactions');
    },
    async transaction<T>(operation: (t: SqlTransaction) => Promise<T>) {
      const recorded: Recorded[] = [];
      transactions.push(recorded);
      return operation({
        async execute(sql: string, parameters: readonly unknown[] = []) {
          recorded.push({ sql, parameters });
          if (sql.includes('from growth_schema_migrations')) {
            const checksum = ledger[String(parameters[0])];
            return {
              rows: (checksum
                ? [{ name: parameters[0], checksum }]
                : []) as never,
            };
          }
          return { rows: [] };
        },
      });
    },
  };
  return { executor, transactions };
}

async function directoryWith(files: Record<string, string>): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'growth-migrations-'));
  for (const [name, contents] of Object.entries(files)) {
    await writeFile(join(directory, name), contents);
  }
  return directory;
}

test('discoverMigrations sorts by name and ignores a malformed filename', async () => {
  const directory = await directoryWith({
    '0002_b.sql': 'select 2',
    '0001_a.sql': 'select 1',
    'bad name.sql': 'select 3',
    'notes.md': 'x',
  });

  const migrations = await discoverMigrations(directory);

  expect(migrations.map((m) => m.name)).toEqual(['0001_a.sql', '0002_b.sql']);
  expect(migrations[0]?.checksum).toMatch(/^[0-9a-f]{64}$/);
});

test('applyMigrations skips a file whose checksum matches the ledger', async () => {
  const directory = await directoryWith({ '0001_a.sql': 'select 1' });
  const migrations = await discoverMigrations(directory);
  const checksum = migrations[0]?.checksum ?? '';
  const { executor } = fakeExecutor({ '0001_a.sql': checksum });

  const result = await applyMigrations({ directory, executor });

  expect(result).toEqual({ applied: [], skipped: ['0001_a.sql'] });
});

test('applyMigrations aborts when an applied file has a changed checksum', async () => {
  const directory = await directoryWith({ '0001_a.sql': 'select 1' });
  const { executor } = fakeExecutor({ '0001_a.sql': 'stale' });

  const run = applyMigrations({ directory, executor });

  await expect(run).rejects.toThrow(
    'Checksum mismatch for applied migration 0001_a.sql',
  );
});

test('applyMigrations runs each file in its own transaction behind the advisory lock', async () => {
  const directory = await directoryWith({
    '0001_a.sql': 'select 1',
    '0002_b.sql': 'select 2',
  });
  const { executor, transactions } = fakeExecutor({});

  const result = await applyMigrations({ directory, executor });

  expect(result.applied).toEqual(['0001_a.sql', '0002_b.sql']);
  expect(transactions).toHaveLength(2);
  for (const [index, recorded] of transactions.entries()) {
    expect(recorded[1]?.sql).toContain('pg_advisory_xact_lock');
    expect(recorded[1]?.sql).toContain('hashtextextended');
    expect(recorded[1]?.parameters).toEqual(['hashbrown-schema-migrations-v1']);
    expect(recorded.some((r) => r.sql === `select ${index + 1}`)).toBe(true);
    expect(recorded.at(-1)?.sql).toContain(
      'insert into growth_schema_migrations',
    );
  }
});
