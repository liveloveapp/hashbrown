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
