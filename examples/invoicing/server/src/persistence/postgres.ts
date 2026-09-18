import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';
import { ddl, tablesIn } from './schema';
import { ConflictError, type Repositories } from './types';

export interface PostgresRepositoryOptions extends PoolConfig {
  /** Optional schema for isolation (tests); production uses `public`. */
  readonly schema?: string;
}

const identifier = (value: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('invalid_identifier');
  return value;
};

/** Every write bumps the version and stamps the clock. */
const revise = <T>(value: T, version: number) => ({
  value,
  version: version + 1,
  updatedAt: sql`now()`,
});

/**
 * JSONB document repositories with optimistic concurrency.
 *
 * Each write is one statement guarded by the version the caller read, and
 * `returning()` reports whether it matched: no rows means someone else
 * committed first, which is a `ConflictError` for the caller to retry.
 */
export async function createPostgresRepositories(
  options: PostgresRepositoryOptions,
): Promise<Repositories> {
  const { schema = 'public', ...poolConfig } = options;
  const name = identifier(schema);
  const pool = new Pool({ max: 2, ...poolConfig });
  pool.on('error', () => undefined);
  const db = drizzle(pool);
  const { sessions, threads } = tablesIn(name);

  for (const statement of ddl(name)) await db.execute(statement);

  return {
    sessions: {
      async create(initial) {
        const [row] = await db
          .insert(sessions)
          .values({ id: randomUUID(), version: 0, value: initial })
          .returning({ id: sessions.id });
        return row.id;
      },
      async load(id) {
        const [row] = await db
          .select({ version: sessions.version, value: sessions.value })
          .from(sessions)
          .where(eq(sessions.id, id));
        return row;
      },
      async commit(id, expectedVersion, next) {
        const rows = await db
          .update(sessions)
          .set(revise(next, expectedVersion))
          .where(
            and(eq(sessions.id, id), eq(sessions.version, expectedVersion)),
          )
          .returning({ id: sessions.id });
        if (rows.length !== 1) throw new ConflictError();
      },
    },
    threads: {
      async load(threadId) {
        const [row] = await db
          .select({ version: threads.version, value: threads.value })
          .from(threads)
          .where(eq(threads.threadId, threadId));
        return row;
      },
      async commit(threadId, expectedVersion, next) {
        const rows =
          expectedVersion === null
            ? await db
                .insert(threads)
                .values({ threadId, version: 0, value: next })
                .onConflictDoNothing()
                .returning({ threadId: threads.threadId })
            : await db
                .update(threads)
                .set(revise(next, expectedVersion))
                .where(
                  and(
                    eq(threads.threadId, threadId),
                    eq(threads.version, expectedVersion),
                  ),
                )
                .returning({ threadId: threads.threadId });
        if (rows.length !== 1) throw new ConflictError();
      },
    },
    async close() {
      if (name !== 'public')
        await db.execute(sql`DROP SCHEMA ${sql.identifier(name)} CASCADE`);
      await pool.end();
    },
  };
}
