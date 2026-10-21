import { expect, test } from 'vitest';

import { executorWith, type MarkerHandler } from '../testing/fake-executor.ts';
import { readContactJourney, readGrowthFunnel } from './journey-report.ts';

const contactId = '11111111-1111-4111-8111-111111111111';
const emptyRows = () => ({ rows: [] });

function controlRow(deletedAt: string | null): MarkerHandler {
  return () => ({
    rows: [
      {
        id: contactId,
        outreach_approved_at: null,
        deleted_at: deletedAt,
        updated_at: '2026-10-01T00:00:00.000Z',
        latest_hard_stop_kind: null,
        latest_hard_stop_at: null,
      },
    ],
  });
}

test('readGrowthFunnel reads the runtime, install, and daily funnel views', async () => {
  const from = new Date('2026-10-01T00:00:00.000Z');
  const to = new Date('2026-10-08T00:00:00.000Z');
  const runtime = {
    started: 3,
    streamed: 2,
    tool_used: 1,
    component_rendered: 1,
    activated: 1,
    stalled_after_hello_world: 1,
  };
  const install = {
    installed: 2,
    reached_runtime: 1,
    stalled_before_first_request: 1,
  };
  const day = { day: '2026-10-02', installed: 2, started: 3 };
  const packageRow = {
    package_name: '@hashbrownai/react',
    installs: 4,
    subjects: 3,
  };
  const { executor, calls } = executorWith({
    'observation-read-independent-signals': () => ({
      rows: [{ source: 'runtime', observations: '3' }],
    }),
    'observation-read-processing-states': () => ({
      rows: [{ status: 'completed', observations: '3' }],
    }),
    'observation-read-runtime-funnel': () => ({ rows: [runtime] }),
    'observation-read-install-funnel': () => ({ rows: [install] }),
    'observation-read-installs-by-package': () => ({ rows: [packageRow] }),
    'observation-read-funnel-daily': () => ({ rows: [day] }),
  });

  const funnel = await readGrowthFunnel(executor, { from, to });

  expect(calls.map((c) => c.marker)).toEqual([
    'observation-read-independent-signals',
    'observation-read-processing-states',
    'observation-read-runtime-funnel',
    'observation-read-install-funnel',
    'observation-read-installs-by-package',
    'observation-read-funnel-daily',
  ]);
  expect(calls.every((c) => c.params[0] === from && c.params[1] === to)).toBe(
    true,
  );
  expect(calls[2].sql).toContain('from growth_observation_runtime_funnel_v1');
  expect(calls[2].sql).toContain('started_day');
  expect(calls[3].sql).toContain('from growth_observation_install_funnel_v1');
  expect(calls[3].sql).toContain('installed_day');
  expect(calls[4].sql).toContain('from growth_observations');
  expect(calls[4].sql).toContain("kind='package.installed'");
  expect(calls[4].sql).toContain(
    "properties->>'environment' is distinct from 'ci'",
  );
  expect(calls[4].sql).toContain('redacted_at is null');
  expect(calls[4].sql).toContain("group by properties->>'packageName'");
  expect(calls[4].sql).not.toContain('installation_token_digest');
  expect(calls[5].sql).toContain('from growth_observation_funnel_daily_v1');
  expect(funnel).toMatchObject({
    from: from.toISOString(),
    to: to.toISOString(),
    independentSignals: { rows: [{ source: 'runtime', observations: '3' }] },
    observationProcessing: {
      rows: [{ status: 'completed', observations: '3' }],
    },
    runtimeFunnel: runtime,
    installFunnel: {
      ...install,
      unit: expect.stringContaining('token-bearing'),
    },
    installedByPackage: {
      unit: 'non-CI, non-redacted package.installed observations by package, all packages',
      window: 'installed_day in UTC days whose midnight is in [from,to)',
      rows: [packageRow],
    },
    daily: [day],
  });
  expect(funnel).not.toHaveProperty('activationDecisions');
  expect(funnel).not.toHaveProperty('linkedContactCohort');
  expect(funnel.unavailable.length).toBeGreaterThan(0);
});

test('readContactJourney scrubs URLs and reports a deleted contact as deleted', async () => {
  const deleted = executorWith({
    'observation-read-journey-contact': () => ({ rows: [{ id: contactId }] }),
    'read-control-state': controlRow('2026-10-02T00:00:00.000Z'),
  });
  const live = executorWith({
    'observation-read-journey-contact': () => ({ rows: [{ id: contactId }] }),
    'read-control-state': controlRow(null),
    'observation-read-journey-observations': () => ({
      rows: [{ id: 'o1', kind: 'runtime.session_started' }],
    }),
    'observation-read-journey-jobs': () => ({
      rows: [{ id: 'j1', kind: 'send_step', status: 'pending' }],
    }),
    'observation-read-journey-activity': () => ({
      rows: [
        {
          id: 'a1',
          kind: 'see https://example.invalid/about?email=person%40example.org#x and http://example.invalid/x',
        },
        { id: 'a2', kind: 'mail person@example.org' },
      ],
    }),
  });

  const deletedJourney = await readContactJourney(deleted.executor, contactId);
  const liveJourney = await readContactJourney(live.executor, contactId);

  expect(deletedJourney).toEqual({
    contact: { id: contactId, authorization: 'deleted' },
  });
  expect(deleted.calls.map((c) => c.marker)).toEqual([
    'observation-read-journey-contact',
    'read-control-state',
  ]);
  expect(liveJourney).toEqual({
    contact: { id: contactId, authorization: 'unapproved' },
    observations: [{ id: 'o1', kind: 'runtime.session_started' }],
    jobs: [{ id: 'j1', kind: 'send_step', status: 'pending' }],
    activity: [
      {
        id: 'a1',
        kind: 'see https://example.invalid/about and [redacted]',
      },
      { id: 'a2', kind: 'mail [redacted]' },
    ],
  });
  expect(live.calls.map((c) => c.marker)).toEqual([
    'observation-read-journey-contact',
    'read-control-state',
    'observation-read-journey-observations',
    'observation-read-journey-jobs',
    'observation-read-journey-activity',
  ]);
  expect(live.calls.slice(2).map((c) => c.params)).toEqual([
    [contactId, 50],
    [contactId, 50],
    [contactId, 50],
  ]);
  expect(live.calls[2].sql).toContain('email_lookup_hmac');
  expect(live.calls[2].sql).toContain("'contact.lookup_alias_added'");
  expect(live.calls[3].sql).not.toContain('payload');
  expect(live.calls[4].sql).not.toContain('data');
});

test('readContactJourney rejects a non-uuid and returns null for a missing contact', async () => {
  const { executor, calls } = executorWith({
    'observation-read-journey-contact': emptyRows,
  });

  const invalid = readContactJourney(executor, 'email@example.invalid');
  const missing = await readContactJourney(
    executor,
    '22222222-2222-4222-8222-222222222222',
  );

  await expect(invalid).rejects.toMatchObject({ code: 'invalid_payload' });
  expect(missing).toBeNull();
  expect(calls.map((c) => c.marker)).toEqual([
    'observation-read-journey-contact',
  ]);
});
