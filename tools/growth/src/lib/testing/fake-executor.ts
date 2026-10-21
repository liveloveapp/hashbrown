import type {
  SqlExecutor,
  SqlQueryResult,
  SqlTransaction,
} from '../database.ts';

/** One SQL statement the fake executor saw. */
export interface RecordedCall {
  marker: string;
  sql: string;
  params: readonly unknown[];
}

/** Answers one growth-marked SQL statement. */
export type MarkerHandler = (
  params: readonly unknown[],
  sql: string,
) => SqlQueryResult | Promise<SqlQueryResult>;

/**
 * A marker-dispatch fake for unit tests. Statements are routed by their
 * `growth:<marker>` SQL comment; advisory-lock markers answer with no rows
 * unless a handler overrides them, and any other unknown marker throws.
 * `transaction` runs its callback on the same executor.
 */
export function executorWith(handlers: Record<string, MarkerHandler>): {
  executor: SqlExecutor;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const transaction: SqlTransaction = {
    async execute<Row extends Record<string, unknown>>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<SqlQueryResult<Row>> {
      const marker = /\/\* growth:([a-z0-9-]+) \*\//u.exec(sql)?.[1] ?? '';
      const handler =
        handlers[marker] ??
        (marker.endsWith('-lock') ? () => ({ rows: [] }) : undefined);
      if (!handler) throw new Error(`Unexpected growth SQL marker: ${marker}`);
      calls.push({ marker, sql, params });
      return (await handler(params, sql)) as SqlQueryResult<Row>;
    },
  };
  const executor: SqlExecutor = {
    execute: transaction.execute,
    transaction: (operation) => operation(transaction),
  };
  return { executor, calls };
}
