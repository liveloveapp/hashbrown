import { Pool, type PoolClient } from '@neondatabase/serverless';

/** Rows returned by a SQL statement. */
export interface SqlQueryResult<
  Row extends Record<string, unknown> = Record<string, unknown>,
> {
  rows: Row[];
}

/** Runs parameterized SQL inside one connection or transaction. */
export interface SqlTransaction {
  execute<Row extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    parameters?: readonly unknown[],
  ): Promise<SqlQueryResult<Row>>;
}

/** A pooled executor that can also open transactions. */
export interface SqlExecutor extends SqlTransaction {
  transaction<T>(
    operation: (transaction: SqlTransaction) => Promise<T>,
  ): Promise<T>;
  close?(): Promise<void>;
}

function queryExecutor(
  queryable: Pick<Pool | PoolClient, 'query'>,
): SqlTransaction {
  return {
    async execute<Row extends Record<string, unknown>>(
      sql: string,
      parameters: readonly unknown[] = [],
    ): Promise<SqlQueryResult<Row>> {
      const result = await queryable.query<Row>(sql, [...parameters]);
      return { rows: result.rows };
    },
  };
}

/**
 * Creates a Neon-backed executor.
 *
 * @param databaseUrl - Connection string; defaults to `DATABASE_URL`.
 * @throws When no connection string is available.
 */
export function createDatabaseExecutor(
  databaseUrl: string | undefined = process.env['DATABASE_URL'],
): SqlExecutor {
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required to create the growth database executor',
    );
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const root = queryExecutor(pool);

  return {
    execute: root.execute,
    async transaction<T>(
      operation: (transaction: SqlTransaction) => Promise<T>,
    ): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await operation(queryExecutor(client));
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },
    async close(): Promise<void> {
      await pool.end();
    },
  };
}

/**
 * Wraps an open transaction as an executor, so code written against
 * `SqlExecutor` joins the caller's transaction instead of opening its own.
 * `transaction` runs its callback on the outer transaction.
 */
export function nestedExecutor(tx: SqlTransaction): SqlExecutor {
  return {
    execute: (sql, parameters) => tx.execute(sql, parameters),
    transaction: (operation) => operation(tx),
  };
}

/**
 * Takes the transaction-scoped advisory lock that serializes privacy
 * operations (stops, erasure) against the work that reads personal data.
 *
 * @param tx - The open transaction.
 * @param exclusive - Take the exclusive lock; otherwise the shared one.
 */
export async function privacyLock(
  tx: SqlTransaction,
  exclusive = false,
): Promise<void> {
  await tx.execute(
    exclusive
      ? `/* growth:privacy-lock */ select pg_advisory_xact_lock(hashtextextended('growth-privacy-v1', 0))`
      : `/* growth:privacy-lock */ select pg_advisory_xact_lock_shared(hashtextextended('growth-privacy-v1', 0))`,
  );
}
