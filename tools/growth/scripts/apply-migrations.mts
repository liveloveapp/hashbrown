import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  createDatabaseExecutor,
  type SqlExecutor,
} from '../src/lib/database.ts';
import { validateGrowthDatabaseEnvironment } from './growth-database-preflight.mts';

const migrationFilePattern = /^\d{4,}_[a-z0-9]+(?:[-_][a-z0-9]+)*\.sql$/;
const advisoryLockName = 'hashbrown-schema-migrations-v1';
const scriptDirectory = dirname(fileURLToPath(import.meta.url));

const createLedgerSql = `
  create table if not exists growth_schema_migrations (
    name text primary key,
    checksum text not null,
    applied_at timestamptz not null default now()
  )
`;

/** A migration file read from disk. */
export interface Migration {
  name: string;
  checksum: string;
  sql: string;
}

/** Inputs to {@link applyMigrations}. */
export interface ApplyMigrationsOptions {
  directory: string;
  executor: SqlExecutor;
}

/** Names of migrations applied by, or skipped during, a run. */
export interface ApplyMigrationsResult {
  applied: string[];
  skipped: string[];
}

function checksum(contents: string): string {
  return createHash('sha256').update(contents, 'utf8').digest('hex');
}

/** The `tools/growth/migrations` directory next to this script. */
export function defaultMigrationsDirectory(): string {
  return resolve(scriptDirectory, '../migrations');
}

/**
 * Reads every well-formed `NNNN_name.sql` file in a directory, sorted by name.
 * Files with other names are ignored.
 */
export async function discoverMigrations(
  directory: string,
): Promise<Migration[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isFile() && migrationFilePattern.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(resolve(directory, name), 'utf8');
      return { name, sql, checksum: checksum(sql) };
    }),
  );
}

/**
 * Applies pending migrations, one transaction per file, serialized by a
 * Postgres advisory lock. A file already in the ledger is skipped when its
 * checksum matches and aborts the run when it does not.
 */
export async function applyMigrations({
  directory,
  executor,
}: ApplyMigrationsOptions): Promise<ApplyMigrationsResult> {
  const migrations = await discoverMigrations(directory);
  const result: ApplyMigrationsResult = { applied: [], skipped: [] };

  for (const migration of migrations) {
    await executor.transaction(async (transaction) => {
      await transaction.execute('set local search_path to public');
      await transaction.execute(
        'select pg_advisory_xact_lock(hashtextextended($1, 0))',
        [advisoryLockName],
      );
      await transaction.execute(createLedgerSql);

      const applied = await transaction.execute<{
        checksum: string;
        name: string;
      }>(
        `select name, checksum
         from growth_schema_migrations
         where name = $1`,
        [migration.name],
      );
      const existing = applied.rows[0];

      if (existing) {
        if (existing.checksum !== migration.checksum) {
          throw new Error(
            `Checksum mismatch for applied migration ${migration.name}`,
          );
        }
        result.skipped.push(migration.name);
        return;
      }

      await transaction.execute(migration.sql);
      await transaction.execute(
        `insert into growth_schema_migrations (name, checksum)
         values ($1, $2)`,
        [migration.name, migration.checksum],
      );
      result.applied.push(migration.name);
    });
  }

  return result;
}

async function main(): Promise<void> {
  validateGrowthDatabaseEnvironment({
    mode: 'migration',
    environment: process.env,
    nodeVersion: process.versions.node,
  });
  const executor = createDatabaseExecutor();
  try {
    const result = await applyMigrations({
      directory: defaultMigrationsDirectory(),
      executor,
    });
    process.stdout.write(
      `Migrations complete: ${result.applied.length} applied, ${result.skipped.length} unchanged.\n`,
    );
  } finally {
    await executor.close?.();
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Migration failed: ${message}\n`);
    process.exitCode = 1;
  });
}
