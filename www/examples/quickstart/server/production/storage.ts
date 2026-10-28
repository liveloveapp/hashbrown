import type { SqlPool } from '@b4run/postgres-storage/node';

import { PRODUCTION_PLAN } from '../../runtime/workbench-production';

/** Fixed application-owned recording plan; model arguments cannot select its contents. */
export const recordingPlan = PRODUCTION_PLAN;
/** Server-owned application state, stored separately from conversation checkpoints. */
export interface ApplicationState {
  readonly revision: number;
  readonly plan: {
    readonly title: string;
    readonly steps: readonly string[];
  } | null;
}

/** Builds the owner-scoped application transaction boundary on a supplied (optionally fenced) pool. */
export function createApplicationStore(pool: SqlPool) {
  const read = async (
    threadId: string,
    owner: string,
  ): Promise<ApplicationState | undefined> => {
    const result = await pool.query<ApplicationState>(
      'SELECT revision, plan FROM hashbrown_production.application_plans WHERE thread_id = $1 AND owner_id = $2',
      [threadId, owner],
    );
    return result.rows[0];
  };
  return {
    ready: async () => {
      await pool.query('CREATE SCHEMA IF NOT EXISTS hashbrown_production');
      await pool.query(
        'CREATE TABLE IF NOT EXISTS hashbrown_production.application_plans (thread_id text PRIMARY KEY, owner_id text NOT NULL, configuration text NOT NULL, revision integer NOT NULL DEFAULT 0, plan jsonb)',
      );
      await pool.query(
        'CREATE TABLE IF NOT EXISTS hashbrown_production.application_receipts (thread_id text NOT NULL REFERENCES hashbrown_production.application_plans(thread_id), operation_revision integer NOT NULL, owner_id text NOT NULL, PRIMARY KEY(thread_id, operation_revision))',
      );
    },
    create: async (threadId: string, owner: string) => {
      await pool.query(
        'INSERT INTO hashbrown_production.application_plans (thread_id, owner_id, configuration) VALUES ($1,$2,$3)',
        [threadId, owner, 'recording-plan-v1'],
      );
    },
    read,
    binding: async (threadId: string, owner: string) =>
      (
        await pool.query<{ configuration: string }>(
          'SELECT configuration FROM hashbrown_production.application_plans WHERE thread_id = $1 AND owner_id = $2',
          [threadId, owner],
        )
      ).rows[0]?.configuration,
    accept: async (
      threadId: string,
      owner: string,
    ): Promise<ApplicationState> => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const found = await client.query<ApplicationState>(
          'SELECT revision, plan FROM hashbrown_production.application_plans WHERE thread_id = $1 AND owner_id = $2 AND configuration = $3 FOR UPDATE',
          [threadId, owner, 'recording-plan-v1'],
        );
        const current = found.rows[0];
        if (!current) throw new Error('Unknown owned plan');
        if (current.revision === 0) {
          await client.query(
            'INSERT INTO hashbrown_production.application_receipts (thread_id, operation_revision, owner_id) VALUES ($1,0,$2)',
            [threadId, owner],
          );
          await client.query(
            'UPDATE hashbrown_production.application_plans SET revision = 1, plan = $3 WHERE thread_id = $1 AND owner_id = $2 AND revision = 0',
            [threadId, owner, JSON.stringify(recordingPlan)],
          );
        } else if (current.revision !== 1)
          throw new Error('Stale plan revision');
        await client.query('COMMIT');
        return { revision: 1, plan: recordingPlan };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    receiptCount: async (threadId: string) =>
      Number(
        (
          await pool.query<{ count: string }>(
            'SELECT count(*) FROM hashbrown_production.application_receipts WHERE thread_id = $1',
            [threadId],
          )
        ).rows[0].count,
      ),
  };
}
