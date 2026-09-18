import { sql } from 'drizzle-orm';
import {
  integer,
  jsonb,
  pgSchema,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { Session, ThreadRecord } from './types';

/**
 * Both documents share one shape: a primary key, a version for
 * compare-and-swap, and the record itself as JSONB. The columns are declared
 * once here and reused by the DDL below, so the table the queries type against
 * is the table that gets created.
 */
const columns = {
  version: integer('version').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
};

const sessionColumns = {
  id: uuid('id').primaryKey(),
  value: jsonb('value').$type<Session>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  ...columns,
};

const threadColumns = {
  threadId: text('thread_id').primaryKey(),
  value: jsonb('value').$type<ThreadRecord>().notNull(),
  ...columns,
};

export const SESSIONS_TABLE = 'invoicing_sessions';
export const THREADS_TABLE = 'invoicing_threads';

export interface Tables {
  readonly sessions: ReturnType<typeof sessionsIn>;
  readonly threads: ReturnType<typeof threadsIn>;
}

const sessionsIn = (schema: string) =>
  schema === 'public'
    ? pgTable(SESSIONS_TABLE, sessionColumns)
    : pgSchema(schema).table(SESSIONS_TABLE, sessionColumns);

const threadsIn = (schema: string) =>
  schema === 'public'
    ? pgTable(THREADS_TABLE, threadColumns)
    : pgSchema(schema).table(THREADS_TABLE, threadColumns);

/**
 * Bind the tables to a schema. Tests isolate themselves in one of their own;
 * production uses `public`.
 */
export function tablesIn(schema: string): Tables {
  return { sessions: sessionsIn(schema), threads: threadsIn(schema) };
}

/**
 * Create the schema and both tables if they are absent.
 *
 * The example owns no migration tooling on purpose: two documents with a fixed
 * shape do not need it, and a reader should be able to see the whole storage
 * contract in this file. Add drizzle-kit the moment the shape starts changing.
 *
 * `IF NOT EXISTS` never alters a table that already exists, so this DDL has to
 * keep describing what deployed databases already have. That is why `id` and
 * `version` carry no column default and every insert states them: a default
 * added here would apply to new databases only, and the insert would write
 * NULL into every database created before it.
 */
export const ddl = (schema: string) => [
  sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(schema)}`,
  sql`CREATE TABLE IF NOT EXISTS ${sql.identifier(schema)}.${sql.identifier(SESSIONS_TABLE)} (
    id uuid PRIMARY KEY,
    version integer NOT NULL,
    value jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now())`,
  sql`CREATE TABLE IF NOT EXISTS ${sql.identifier(schema)}.${sql.identifier(THREADS_TABLE)} (
    thread_id text PRIMARY KEY,
    version integer NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now())`,
];
