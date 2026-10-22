import { expect, test } from 'vitest';

import {
  GROWTH_SCORE_POLICY,
  GROWTH_SCORE_POLICY_VERSION,
  growthScoreTierFor,
  highestMilestoneFor,
  type InstallRuntimeObservation,
  recomputeContactScore,
  runtimeFactsFromObservations,
  scoreForInstallIdentity,
  scoreGrowthFacts,
} from './scoring.ts';
import { executorWith } from './testing/fake-executor.ts';

const contactId = '00000000-0000-4000-8000-000000000001';
const now = new Date('2026-10-21T15:00:00.000Z');

function observation(
  subjectId: string,
  kind: string,
  day: string,
  integration: string | null = 'react',
): InstallRuntimeObservation {
  return {
    subjectId,
    kind,
    day,
    integration,
    receivedAt: new Date(`${day}T12:00:00.000Z`),
  };
}

test('score tiers and renamed reasons match the policy table', () => {
  const empty = {
    milestones: { started: [], streamed: [], tool: [], component: [] },
    returnedSubjects: [],
    approvedWorkEmailForm: false,
    approvedInstallDigest: false,
    docsEngagedContentIds: [],
  };

  const everything = scoreGrowthFacts(
    { type: 'contact', id: contactId },
    {
      milestones: {
        started: ['b', 'a', 'a'],
        streamed: ['a'],
        tool: ['a'],
        component: ['a'],
      },
      returnedSubjects: ['a'],
      approvedWorkEmailForm: true,
      approvedInstallDigest: true,
      docsEngagedContentIds: ['d4', 'd1', 'd3', 'd2'],
    },
  );
  const nothing = scoreGrowthFacts({ type: 'contact', id: contactId }, empty);

  expect(GROWTH_SCORE_POLICY_VERSION).toBe('growth-score-policy:v1');
  expect(GROWTH_SCORE_POLICY).toEqual({
    'milestone.started': { points: 15 },
    'milestone.streamed': { points: 20 },
    'milestone.tool': { points: 15 },
    'milestone.component': { points: 15 },
    'project.returned_7d': { points: 15 },
    'contact.approved_work_email_form': { points: 30, once: true },
    'contact.approved_install_digest': { points: 30, once: true },
    'content.docs_engaged': { points: 5, maxIdentifiers: 3 },
  });
  expect(
    [0, 14, 15, 39, 40, 69, 70, 500].map((score) => growthScoreTierFor(score)),
  ).toEqual([
    'low',
    'low',
    'medium',
    'medium',
    'high',
    'high',
    'very_high',
    'very_high',
  ]);
  expect(() => growthScoreTierFor(-1)).toThrow(/non-negative/u);
  expect(everything.reasons).toEqual([
    { code: 'milestone.started', points: 30, identifiers: ['a', 'b'] },
    { code: 'milestone.streamed', points: 20, identifiers: ['a'] },
    { code: 'milestone.tool', points: 15, identifiers: ['a'] },
    { code: 'milestone.component', points: 15, identifiers: ['a'] },
    { code: 'project.returned_7d', points: 15, identifiers: ['a'] },
    {
      code: 'contact.approved_work_email_form',
      points: 30,
      identifiers: ['once'],
    },
    {
      code: 'contact.approved_install_digest',
      points: 30,
      identifiers: ['once'],
    },
    {
      code: 'content.docs_engaged',
      points: 15,
      identifiers: ['d1', 'd2', 'd3'],
    },
  ]);
  expect(everything).toMatchObject({
    subject: { type: 'contact', id: contactId },
    score: 170,
    tier: 'very_high',
    policyVersion: 'growth-score-policy:v1',
    scoreVersion: 'growth-score-policy:v1',
  });
  expect(nothing).toMatchObject({ score: 0, tier: 'low', reasons: [] });
});

test('runtime facts count milestones per subject and a return on a later day within 7 days', () => {
  const observations = [
    observation('a', 'runtime.session_started', '2026-10-01'),
    observation('a', 'runtime.session_started', '2026-10-08'),
    observation('b', 'runtime.session_started', '2026-10-01'),
    observation('b', 'runtime.session_started', '2026-10-09'),
    observation('c', 'runtime.session_started', '2026-10-01'),
    observation('c', 'runtime.session_started', '2026-10-01'),
    observation('a', 'runtime.first_stream_completed', '2026-10-01'),
    observation('b', 'tool.first_call_executed', '2026-10-02'),
    observation('c', 'component.first_rendered', '2026-10-02'),
    observation('c', 'package.installed', '2026-10-02'),
  ];

  const facts = runtimeFactsFromObservations(observations);

  expect(facts).toEqual({
    milestones: {
      started: ['a', 'b', 'c'],
      streamed: ['a'],
      tool: ['b'],
      component: ['c'],
    },
    returnedSubjects: ['a'],
  });
});

test('highest milestone ranks installed, started, streamed, tool, component', () => {
  const started = [observation('a', 'runtime.session_started', '2026-10-01')];
  const tool = [
    ...started,
    observation('a', 'tool.first_call_executed', '2026-10-01'),
    observation('a', 'runtime.first_stream_completed', '2026-10-01'),
  ];

  const results = [
    highestMilestoneFor([]),
    highestMilestoneFor(started),
    highestMilestoneFor(tool),
    highestMilestoneFor([
      ...tool,
      observation('b', 'component.first_rendered', '2026-10-01'),
    ]),
  ];

  expect(results).toEqual(['installed', 'started', 'tool', 'component']);
});

test('scoreForInstallIdentity scores the linked runtime facts without a contact', () => {
  const runtimeObservations = [
    observation('a', 'runtime.session_started', '2026-10-01'),
    observation('a', 'runtime.first_stream_completed', '2026-10-01'),
  ];

  const result = scoreForInstallIdentity({
    identityId: 'install-1',
    runtimeObservations,
  });

  expect(result).toMatchObject({
    subject: { type: 'install_identity', id: 'install-1' },
    score: 35,
    tier: 'medium',
  });
  expect(result.reasons.map(({ code }) => code)).toEqual([
    'milestone.started',
    'milestone.streamed',
  ]);
});

test('recomputeContactScore reads approvals and linked runtime observations and stores the score', async () => {
  const { executor, calls } = executorWith({
    'read-score-contact': () => ({
      rows: [{ id: contactId, deleted_at: null }],
    }),
    'read-contact-score-approvals': () => ({
      rows: [
        {
          kind: 'form.outreach_approved',
          data: {
            email_classification: 'work',
            verification: 'server_verified',
            policy_version: 'growth-v1',
            source: 'website',
            source_form: 'unstuck',
          },
        },
        {
          kind: 'contact.reauthorized',
          data: {
            provenance: 'founder_action',
            reason: 'founder_install_digest_approval',
            install_observation_id: '00000000-0000-4000-8000-0000000000aa',
          },
        },
      ],
    }),
    'read-contact-score-runtime': () => ({
      rows: [
        {
          subject_id: 's1',
          kind: 'runtime.session_started',
          day: '2026-10-01',
          integration: 'angular',
          received_at: '2026-10-01T12:00:00.000Z',
        },
      ],
    }),
    'upsert-contact-score': () => ({ rows: [] }),
  });

  const result = await recomputeContactScore(executor, { contactId, now });

  expect(result).toMatchObject({ score: 75, tier: 'very_high' });
  expect(calls.map(({ marker }) => marker)).toEqual([
    'read-score-contact',
    'read-contact-score-approvals',
    'read-contact-score-runtime',
    'upsert-contact-score',
  ]);
  expect(calls[2]?.sql).toContain('growth_install_runtime_links');
  expect(calls[2]?.sql).toContain("l.outcome = 'approved'");
  expect(calls[2]?.sql).toContain('redacted_at is null');
  const upsert = calls[3];
  expect(upsert?.params.slice(0, 4)).toEqual([
    contactId,
    75,
    'very_high',
    'growth-score-policy:v1',
  ]);
  expect(JSON.parse(String(upsert?.params[4]))).toEqual(result.reasons);
  expect(upsert?.params[5]).toEqual(now);
});

test('recomputeContactScore removes the stored score of a deleted contact and throws for a missing one', async () => {
  const deleted = executorWith({
    'read-score-contact': () => ({
      rows: [{ id: contactId, deleted_at: now }],
    }),
    'delete-contact-score': () => ({ rows: [] }),
  });
  const missing = executorWith({ 'read-score-contact': () => ({ rows: [] }) });

  const result = await recomputeContactScore(deleted.executor, {
    contactId,
    now,
  });

  expect(result).toMatchObject({ score: 0, tier: 'low', reasons: [] });
  expect(deleted.calls.map(({ marker }) => marker)).toEqual([
    'read-score-contact',
    'delete-contact-score',
  ]);
  await expect(
    recomputeContactScore(missing.executor, { contactId, now }),
  ).rejects.toThrow(`Growth contact not found: ${contactId}`);
});
