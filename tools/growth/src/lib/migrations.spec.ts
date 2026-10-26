import { readFile } from 'node:fs/promises';

import { expect, test } from 'vitest';

const read = (name: string) =>
  readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8');

test('control plane migration creates the five tables with NO ACTION foreign keys', async () => {
  const sql = await read('0001_growth_control_plane.sql');

  const tables = [...sql.matchAll(/CREATE TABLE (\w+)/g)].map((m) => m[1]);

  expect(tables).toEqual([
    'growth_contacts',
    'growth_projects',
    'growth_activity',
    'growth_jobs',
    'growth_artifacts',
  ]);
  expect(sql.match(/REFERENCES/g)?.length).toBe(8);
  expect(sql).not.toMatch(/ON DELETE|ON UPDATE/i);
  expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS citext');
  expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  expect(sql).toContain('growth_jobs_campaign_predecessor');
  for (const table of ['contacts', 'projects', 'jobs']) {
    expect(sql).toMatch(
      new RegExp(
        `BEFORE UPDATE ON growth_${table}\\s+FOR EACH ROW EXECUTE FUNCTION growth_set_updated_at\\(\\)`,
      ),
    );
  }
});

test('jobs table constrains kind, status and delivery_status to the closed lists', async () => {
  const sql = await read('0001_growth_control_plane.sql');

  const jobs = sql.slice(
    sql.indexOf('CREATE TABLE growth_jobs'),
    sql.indexOf('CREATE TABLE growth_artifacts'),
  );

  expect(jobs).toMatch(
    /CHECK \(kind IN \('fulfill', ?'notify', ?'send_step', ?'digest', ?'reply_reconcile'\)\)/,
  );
  expect(jobs).toContain(
    "CHECK (status IN ('pending', 'leased', 'completed', 'failed', 'cancelled'))",
  );
  expect(jobs).toContain(
    "'not_submitted', 'submitted', 'delivered', 'bounced'",
  );
  expect(jobs).toContain("'complained', 'suppressed', 'failed', 'unknown'");
});

test('projects table has no claim columns', async () => {
  const sql = await read('0001_growth_control_plane.sql');
  const views = await read('0002_growth_reporting_views.sql');

  expect(sql).not.toMatch(/claim_/);
  expect(views).not.toMatch(/claim_/);
});

test('reporting migration defines exactly four views', async () => {
  const sql = await read('0002_growth_reporting_views.sql');

  const views = [...sql.matchAll(/CREATE VIEW (\w+)/g)].map((m) => m[1]);

  expect(views).toEqual([
    'growth_contact_overview_v1',
    'growth_funnel_daily_v1',
    'growth_campaign_performance_v1',
    'growth_job_health_v1',
  ]);
  expect(sql).not.toContain('growth_legacy_progress_v1');
});

test('observability migration creates the eight tables with CASCADE only on observation children', async () => {
  const sql = await read('0003_growth_observability.sql');

  const tables = [...sql.matchAll(/CREATE TABLE (\w+)/gi)].map((m) => m[1]);
  const cascades = [
    ...sql.matchAll(/REFERENCES (\w+)\(id\) ON DELETE CASCADE/g),
  ].map((m) => m[1]);

  expect(tables).toEqual([
    'growth_observation_subjects',
    'growth_observations',
    'growth_observation_identities',
    'growth_observation_redactions',
    'growth_observation_work',
    'growth_observation_facts',
    'growth_collection_budgets',
    'growth_observation_operations',
  ]);
  expect(sql.match(/REFERENCES/g)?.length).toBe(5);
  expect(cascades).toEqual([
    'growth_observation_subjects',
    'growth_observations',
    'growth_observations',
    'growth_observations',
    'growth_observation_subjects',
  ]);
  expect(sql).not.toMatch(/ON UPDATE/i);
  expect(sql).toContain(
    "namespace IN ('website_session','installation','development_browser')",
  );
  expect(sql).toContain("CHECK (trust='client_reported')");
  expect(sql).toMatch(
    /CREATE INDEX growth_observation_facts_subject_milestone ON growth_observation_facts\s*\(subject_id,\s*milestone_kind\)/,
  );
});

test('milestone_kind is constrained to the three runtime milestones and source has no form', async () => {
  const sql = await read('0003_growth_observability.sql');

  const milestones = sql.match(/milestone_kind IN \(([^)]*)\)/)?.[1];
  const sources = [...sql.matchAll(/source IN \(([^)]*)\)/g)].map((m) => m[1]);

  expect(milestones?.split(',').map((kind) => kind.trim())).toEqual([
    "'runtime.first_stream_completed'",
    "'tool.first_call_executed'",
    "'component.first_rendered'",
  ]);
  expect(sources).toEqual([
    "'website','install','runtime'",
    "'website','install','runtime'",
  ]);
  expect(sql).not.toContain("'form'");
  expect(sql).not.toMatch(/transport\.connected|thread\.persisted/);
});

test('observations carry installation_token_digest with a hex64 check', async () => {
  const sql = await read('0003_growth_observability.sql');

  expect(sql).toMatch(
    /alter table growth_observations add column installation_token_digest text;/i,
  );
  expect(sql).toContain(
    "check (installation_token_digest is null or installation_token_digest ~ '^[0-9a-f]{64}$')",
  );
  expect(sql).toMatch(
    /create index growth_observation_installation_token on growth_observations\(installation_token_digest,source\)\s+where installation_token_digest is not null;/i,
  );
  expect(sql).not.toContain('growth_install_runtime_links');
});

test('views migration defines exactly six views', async () => {
  const sql = await read('0004_growth_observability_views.sql');

  const views = [...sql.matchAll(/CREATE VIEW (\w+)/gi)].map((m) => m[1]);

  expect(views).toEqual([
    'growth_observation_source_health_v1',
    'growth_observation_subject_overview_v1',
    'growth_observation_work_health_v1',
    'growth_observation_runtime_funnel_v1',
    'growth_observation_install_funnel_v1',
    'growth_observation_funnel_daily_v1',
  ]);
  expect(sql).toContain(
    "count(DISTINCT (f.milestone_kind,o.properties->>'integration'))",
  );
  expect(sql).toContain("namespace = 'development_browser'");
  expect(sql).toContain("properties->>'environment' IS DISTINCT FROM 'ci'");
  expect(sql).toContain('o.redacted_at IS NULL');
  expect(sql).toContain('r.redacted_at IS NULL');
  expect(sql).toContain('AND i.installation_token_digest IS NOT NULL');
});

test('observability views compute days in UTC, never in the session time zone', async () => {
  const sql = await read('0004_growth_observability_views.sql');

  const utcDays = sql.match(/AT TIME ZONE 'utc'\)::date/g) ?? [];

  expect(sql).not.toMatch(/\bdate\(/i);
  expect(sql).not.toMatch(/current_date/i);
  expect(utcDays.length).toBe(4);
});

test('lifecycle migration creates the install runtime links, digest reports and contact scores', async () => {
  const sql = await read('0005_growth_lifecycle.sql');

  const tables = [...sql.matchAll(/create table (\w+)/gi)].map((m) => m[1]);

  expect(tables).toEqual([
    'growth_install_runtime_links',
    'growth_install_digest_reports',
    'growth_contact_scores',
  ]);
  expect(sql).toContain(
    'runtime_observation_id uuid primary key references growth_observations(id) on delete cascade',
  );
  expect(sql).toContain(
    'contact_id uuid references growth_contacts(id) on delete set null',
  );
  expect(sql).toContain(
    "outcome text not null check (outcome in ('approved','ineligible','conflicted'))",
  );
  expect(sql).toContain(
    'digest_job_id uuid not null references growth_jobs(id)',
  );
  expect(sql).toContain('primary key (email_key_version, email_lookup_hmac)');
  expect(sql).toContain(
    'contact_id uuid primary key references growth_contacts(id)',
  );
  expect(sql).toContain(
    "tier text not null check (tier in ('low','medium','high','very_high'))",
  );
  expect(sql).not.toMatch(/growth_jobs_kind_check|add column/i);
});

test('unbound message index migration only adds one partial index on growth_jobs', async () => {
  const sql = await read('0009_growth_unbound_message_index.sql');

  const statements = sql
    .split(';')
    .map((statement) => statement.replace(/--.*$/gmu, '').trim())
    .filter(Boolean);

  expect(statements).toHaveLength(1);
  expect(statements[0]).toMatch(
    /^CREATE INDEX growth_jobs_unbound_provider_message\s+ON growth_jobs \(updated_at\)\s+WHERE/u,
  );
  expect(statements[0]).toContain("kind IN ('fulfill', 'send_step')");
  expect(statements[0]).toContain("status = 'completed'");
  expect(statements[0]).toContain('provider_email_id IS NOT NULL');
  expect(statements[0]).toContain('rfc_message_id IS NULL');
});

test('dead Gmail schema migration drops the seed column and index and narrows job kinds', async () => {
  const sql = await read('0010_growth_drop_gmail_schema.sql');

  const statements = sql
    .split(';')
    .map((statement) =>
      statement.replace(/--.*$/gmu, '').replace(/\s+/gu, ' ').trim(),
    )
    .filter(Boolean);

  expect(statements).toEqual([
    'DROP INDEX growth_jobs_gmail_seed',
    'ALTER TABLE growth_jobs DROP COLUMN gmail_seed_message_id',
    "ALTER TABLE growth_jobs DROP CONSTRAINT growth_jobs_kind_check, ADD CONSTRAINT growth_jobs_kind_check CHECK (kind IN ('fulfill', 'notify', 'send_step', 'digest'))",
  ]);
});
