import { randomUUID } from 'node:crypto';
import { Pool, type PoolConfig } from 'pg';
import {
  ConflictError,
  type Repositories,
  type Session,
  type ThreadRecord,
} from './types';

export interface PostgresRepositoryOptions extends PoolConfig {
  /** Optional schema for isolation (tests); production uses `public`. */
  readonly schema?: string;
}

const identifier = (value: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('invalid_identifier');
  return `"${value}"`;
};

/** JSONB document repositories with optimistic concurrency. */
export async function createPostgresRepositories(
  options: PostgresRepositoryOptions,
): Promise<Repositories> {
  const { schema = 'public', ...poolConfig } = options;
  const pool = new Pool({ max: 2, ...poolConfig });
  pool.on('error', () => undefined);
  const s = identifier(schema);
  const sessionsTable = `${s}.invoicing_sessions`;
  const threadsTable = `${s}.invoicing_threads`;

  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${s}`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${sessionsTable} (
    id uuid PRIMARY KEY,
    version integer NOT NULL,
    value jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${threadsTable} (
    thread_id text PRIMARY KEY,
    version integer NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now())`);

  return {
    sessions: {
      async create(initial: Session) {
        const id = randomUUID();
        await pool.query(
          `INSERT INTO ${sessionsTable} (id, version, value) VALUES ($1, 0, $2)`,
          [id, JSON.stringify(initial)],
        );
        return id;
      },
      async load(id) {
        const { rows } = await pool.query<{ version: number; value: Session }>(
          `SELECT version, value FROM ${sessionsTable} WHERE id = $1`,
          [id],
        );
        return rows[0];
      },
      async commit(id, expectedVersion, next) {
        const { rowCount } = await pool.query(
          `UPDATE ${sessionsTable} SET value = $3, version = version + 1, updated_at = now()
           WHERE id = $1 AND version = $2`,
          [id, expectedVersion, JSON.stringify(next)],
        );
        if (rowCount !== 1) throw new ConflictError();
      },
    },
    threads: {
      async load(threadId) {
        const { rows } = await pool.query<{
          version: number;
          value: ThreadRecord;
        }>(`SELECT version, value FROM ${threadsTable} WHERE thread_id = $1`, [
          threadId,
        ]);
        return rows[0];
      },
      async commit(threadId, expectedVersion, next) {
        if (expectedVersion === null) {
          const { rowCount } = await pool.query(
            `INSERT INTO ${threadsTable} (thread_id, version, value) VALUES ($1, 0, $2)
             ON CONFLICT (thread_id) DO NOTHING`,
            [threadId, JSON.stringify(next)],
          );
          if (rowCount !== 1) throw new ConflictError();
          return;
        }
        const { rowCount } = await pool.query(
          `UPDATE ${threadsTable} SET value = $3, version = version + 1, updated_at = now()
           WHERE thread_id = $1 AND version = $2`,
          [threadId, expectedVersion, JSON.stringify(next)],
        );
        if (rowCount !== 1) throw new ConflictError();
      },
    },
    async close() {
      if (schema !== 'public') await pool.query(`DROP SCHEMA ${s} CASCADE`);
      await pool.end();
    },
  };
}
