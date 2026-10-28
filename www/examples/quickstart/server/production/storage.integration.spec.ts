import { randomUUID } from 'node:crypto';
import { createPostgresPool } from '@b4run/postgres-storage/node';
import { expect, test } from 'vitest';
import { createApplicationStore } from './storage';

test('an approved operation atomically applies once across independently created stores', async () => {
  const connectionString = process.env['PRODUCTION_TEST_DATABASE_URL'];
  if (!connectionString)
    throw new Error(
      'Set PRODUCTION_TEST_DATABASE_URL to the owned disposable database',
    );
  const pool = createPostgresPool({ connectionString });
  const store = createApplicationStore(pool);
  await store.ready();
  const thread = randomUUID();
  await store.create(thread, 'owner');

  const results = await Promise.all([
    store.accept(thread, 'owner'),
    createApplicationStore(pool).accept(thread, 'owner'),
  ]);

  expect(results.every((result) => result.revision === 1)).toBe(true);
  expect(await store.read(thread, 'foreign')).toBeUndefined();
  expect(await store.receiptCount(thread)).toBe(1);
  await pool.query(
    'DELETE FROM hashbrown_production.application_receipts WHERE thread_id = $1',
    [thread],
  );
  await pool.query(
    'DELETE FROM hashbrown_production.application_plans WHERE thread_id = $1',
    [thread],
  );
  await pool.end();
});

test('independent shared admissions cannot both claim a thread and terminal owners cannot write', async () => {
  const connectionString = process.env['PRODUCTION_TEST_DATABASE_URL'];
  if (!connectionString) throw new Error('Set PRODUCTION_TEST_DATABASE_URL');
  const pool = createPostgresPool({ connectionString });
  const { createPostgresRunAdmission } =
    await import('@b4run/postgres-storage/node');
  const naming = {
    pool,
    schema: 'hashbrown_production',
    tablePrefix: `lease_${randomUUID().replaceAll('-', '')}`,
  };
  const first = createPostgresRunAdmission(naming);
  const second = createPostgresRunAdmission(naming);
  await Promise.all([first.ready(), second.ready()]);
  const thread = randomUUID();

  const results = await Promise.all([
    first.tryAcquire(thread),
    second.tryAcquire(thread),
  ]);
  await first.close();
  await second.close();

  expect(results.filter(Boolean)).toHaveLength(1);
  await expect(first.pool.query('SELECT 1')).rejects.toThrow();
  await expect(second.pool.query('SELECT 1')).rejects.toThrow();
  await pool.end();
});

test('native durable grants consume once when two independent replicas race', async () => {
  const connectionString = process.env['PRODUCTION_TEST_DATABASE_URL'];
  if (!connectionString) throw new Error('Set PRODUCTION_TEST_DATABASE_URL');
  const pool = createPostgresPool({ connectionString });
  const { createPostgresInterruptGrantStore } =
    await import('@b4run/postgres-storage/node');
  const naming = {
    pool,
    schema: 'hashbrown_production',
    tablePrefix: `grant_${randomUUID().replaceAll('-', '')}`,
  };
  const first = createPostgresInterruptGrantStore(naming);
  const second = createPostgresInterruptGrantStore(naming);
  await Promise.all([first.ready(), second.ready()]);
  const threadId = randomUUID();
  const interruptId = randomUUID();
  const at = new Date().toISOString();
  await first.issue({
    threadId,
    interruptId,
    checkpointNs: '',
    tokenHash: 'a'.repeat(64),
    issuedAt: at,
    expiresAt: null,
    consumedAt: null,
    consumedDecision: null,
    consumedBy: null,
    voidedAt: null,
  });

  const results = await Promise.all([
    first.consume({ threadId, interruptId, decision: 'once', at, by: 'owner' }),
    second.consume({
      threadId,
      interruptId,
      decision: 'once',
      at,
      by: 'owner',
    }),
  ]);

  expect(results.map((result) => result.outcome).sort()).toEqual([
    'already_consumed',
    'consumed',
  ]);
  await pool.end();
});
