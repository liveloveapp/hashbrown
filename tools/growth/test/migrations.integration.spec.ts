import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, expect, test } from 'vitest';

import {
  applyMigrations,
  defaultMigrationsDirectory,
} from '../scripts/apply-migrations.mts';
import { createDatabaseExecutor } from '../src/lib/database.ts';

const executor = createDatabaseExecutor(process.env['TEST_DATABASE_URL']);

afterAll(async () => {
  await executor.close?.();
});

test('migrations apply twice against Postgres and the second run applies nothing', async () => {
  const directory = defaultMigrationsDirectory();

  await applyMigrations({ directory, executor });
  const repeated = await applyMigrations({ directory, executor });

  expect(repeated.applied).toEqual([]);
  expect(repeated.skipped).toEqual([
    '0001_growth_control_plane.sql',
    '0002_growth_reporting_views.sql',
    '0003_growth_observability.sql',
    '0004_growth_observability_views.sql',
    '0005_growth_inbox_replies.sql',
    '0005_growth_lifecycle.sql',
    '0006_growth_provider_attempts.sql',
  ]);

  const tables = await executor.execute<{ table_name: string }>(`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
      and table_name like 'growth\\_%' escape '\\'
    order by table_name
  `);
  expect(tables.rows.map((row) => row.table_name)).toEqual([
    'growth_activity',
    'growth_artifacts',
    'growth_collection_budgets',
    'growth_contact_scores',
    'growth_contacts',
    'growth_install_digest_reports',
    'growth_install_runtime_links',
    'growth_jobs',
    'growth_observation_facts',
    'growth_observation_identities',
    'growth_observation_operations',
    'growth_observation_redactions',
    'growth_observation_subjects',
    'growth_observation_work',
    'growth_observations',
    'growth_projects',
    'growth_provider_attempts',
    'growth_reply_mailboxes',
    'growth_reply_receipts',
    'growth_schema_migrations',
  ]);

  const views = await executor.execute<{ table_name: string }>(`
    select table_name from information_schema.views
    where table_schema = 'public' and table_name like 'growth\\_%' escape '\\'
    order by table_name
  `);
  expect(views.rows.map((row) => row.table_name)).toEqual([
    'growth_campaign_performance_v1',
    'growth_contact_overview_v1',
    'growth_funnel_daily_v1',
    'growth_job_health_v1',
    'growth_observation_funnel_daily_v1',
    'growth_observation_install_funnel_v1',
    'growth_observation_runtime_funnel_v1',
    'growth_observation_source_health_v1',
    'growth_observation_subject_overview_v1',
    'growth_observation_work_health_v1',
  ]);

  const ledger = await executor.execute<{
    checksum_length: number;
    name: string;
  }>(`
    select name, length(checksum) as checksum_length
    from public.growth_schema_migrations order by name
  `);
  expect(ledger.rows).toEqual([
    { name: '0001_growth_control_plane.sql', checksum_length: 64 },
    { name: '0002_growth_reporting_views.sql', checksum_length: 64 },
    { name: '0003_growth_observability.sql', checksum_length: 64 },
    { name: '0004_growth_observability_views.sql', checksum_length: 64 },
    { name: '0005_growth_inbox_replies.sql', checksum_length: 64 },
    { name: '0005_growth_lifecycle.sql', checksum_length: 64 },
    { name: '0006_growth_provider_attempts.sql', checksum_length: 64 },
  ]);
});

test('migration 0005 applies after 0004 and the ledger records its checksum', async () => {
  const directory = defaultMigrationsDirectory();
  const expected = createHash('sha256')
    .update(await readFile(join(directory, '0005_growth_lifecycle.sql')))
    .digest('hex');

  await applyMigrations({ directory, executor });

  const ledger = await executor.execute<{ name: string; checksum: string }>(
    `select name, checksum from public.growth_schema_migrations
     where name in ('0004_growth_observability_views.sql', '0005_growth_lifecycle.sql')
     order by applied_at, name`,
  );
  expect(ledger.rows.map(({ name }) => name)).toEqual([
    '0004_growth_observability_views.sql',
    '0005_growth_lifecycle.sql',
  ]);
  expect(ledger.rows[1]?.checksum).toBe(expected);
  const tiers = await executor.execute<{ definition: string }>(
    `select pg_get_constraintdef(oid) as definition from pg_constraint
     where conrelid = 'public.growth_contact_scores'::regclass and contype = 'c'`,
  );
  expect(tiers.rows.map(({ definition }) => definition).join(' ')).toContain(
    'very_high',
  );
});

test('observability views compute against the test store', async () => {
  const views = [
    'growth_observation_source_health_v1',
    'growth_observation_subject_overview_v1',
    'growth_observation_work_health_v1',
    'growth_observation_runtime_funnel_v1',
    'growth_observation_install_funnel_v1',
    'growth_observation_funnel_daily_v1',
  ];
  await applyMigrations({ directory: defaultMigrationsDirectory(), executor });

  const results = await Promise.all(
    views.map((view) =>
      executor.execute(`select * from public.${view} limit 1`),
    ),
  );

  for (const result of results) {
    expect(Array.isArray(result.rows)).toBe(true);
  }
});
