import type { SqlExecutor } from './database.ts';

/** The growth score policy every stored score names. */
export const GROWTH_SCORE_POLICY_VERSION = 'growth-score-policy:v1' as const;

/** Deterministic score bands; see {@link growthScoreTierFor}. */
export type GrowthScoreTier = 'low' | 'medium' | 'high' | 'very_high';

/** Why a score has points. */
export type GrowthScoreReasonCode =
  | 'milestone.started'
  | 'milestone.streamed'
  | 'milestone.tool'
  | 'milestone.component'
  | 'project.returned_7d'
  | 'contact.approved_work_email_form'
  | 'contact.approved_install_digest'
  | 'content.docs_engaged';

/** Points for one reason: per distinct identifier, once, or capped. */
export interface GrowthScoreRule {
  points: number;
  /** Award `points` once when the fact holds, with the identifier `once`. */
  once?: true;
  /** Count at most this many distinct identifiers (smallest first). */
  maxIdentifiers?: number;
}

/**
 * The `growth-score-policy:v1` table. Weights, thresholds and set-based
 * counting are threadplane's, with hashbrown reason codes: each milestone
 * counts once per distinct development-browser subject that reached it.
 * `contact.approved_install_digest` carries the work-form approval weight.
 * `content.docs_engaged` keeps threadplane's architecture-content weight, but
 * nothing emits a docs-engagement fact yet, so it never scores today.
 */
export const GROWTH_SCORE_POLICY: Readonly<
  Record<GrowthScoreReasonCode, GrowthScoreRule>
> = {
  'milestone.started': { points: 15 },
  'milestone.streamed': { points: 20 },
  'milestone.tool': { points: 15 },
  'milestone.component': { points: 15 },
  'project.returned_7d': { points: 15 },
  'contact.approved_work_email_form': { points: 30, once: true },
  'contact.approved_install_digest': { points: 30, once: true },
  'content.docs_engaged': { points: 5, maxIdentifiers: 3 },
};

/** One scored reason and the sorted identifiers that earned it. */
export interface GrowthScoreReason {
  code: GrowthScoreReasonCode;
  points: number;
  identifiers: string[];
}

/** The milestones a runtime subject can reach, besides installing. */
export type GrowthRuntimeMilestone =
  'started' | 'streamed' | 'tool' | 'component';

/** The furthest an install identity got, in funnel order. */
export type GrowthMilestone = 'installed' | GrowthRuntimeMilestone;

/** The facts a score is computed from. */
export interface GrowthScoreFacts {
  /** Distinct development-browser subject ids that reached each milestone. */
  milestones: Readonly<Record<GrowthRuntimeMilestone, readonly string[]>>;
  /** Subjects with a second session on a later UTC day within 7 days. */
  returnedSubjects: readonly string[];
  approvedWorkEmailForm: boolean;
  approvedInstallDigest: boolean;
  /** Engaged docs content ids; no producer exists yet. */
  docsEngagedContentIds: readonly string[];
}

/** A computed score. It orders work and never authorizes a send. */
export interface GrowthScoreResult {
  subject: { type: 'contact' | 'install_identity'; id: string };
  score: number;
  tier: GrowthScoreTier;
  policyVersion: typeof GROWTH_SCORE_POLICY_VERSION;
  /** The policy version; there is no content registry to fold in. */
  scoreVersion: string;
  reasons: GrowthScoreReason[];
}

/** One runtime observation linked to an install identity or a contact. */
export interface InstallRuntimeObservation {
  subjectId: string;
  kind: string;
  /** The UTC day of `least(occurred_at, received_at)`, `YYYY-MM-DD`. */
  day: string;
  integration: string | null;
  receivedAt: Date;
}

/** Runtime observation kinds and the milestone each one marks. */
export const RUNTIME_MILESTONE_KINDS: Readonly<
  Record<string, GrowthRuntimeMilestone>
> = {
  'runtime.session_started': 'started',
  'runtime.first_stream_completed': 'streamed',
  'tool.first_call_executed': 'tool',
  'component.first_rendered': 'component',
};

const MILESTONE_ORDER: readonly GrowthMilestone[] = [
  'installed',
  'started',
  'streamed',
  'tool',
  'component',
];

const DAY_MS = 86_400_000;

/**
 * Maps a score to its tier: 70 and above `very_high`, 40 `high`, 15 `medium`,
 * otherwise `low`.
 *
 * @throws When the score is negative or not finite.
 */
export function growthScoreTierFor(score: number): GrowthScoreTier {
  if (!Number.isFinite(score) || score < 0) {
    throw new Error('growth score must be a finite non-negative number');
  }
  if (score >= 70) return 'very_high';
  if (score >= 40) return 'high';
  if (score >= 15) return 'medium';
  return 'low';
}

function reasonFor(
  code: GrowthScoreReasonCode,
  identifiers: Iterable<string>,
): GrowthScoreReason | null {
  const rule = GROWTH_SCORE_POLICY[code];
  const sorted = [...new Set(identifiers)].sort();
  const counted =
    rule.maxIdentifiers === undefined
      ? sorted
      : sorted.slice(0, rule.maxIdentifiers);
  const points = rule.once
    ? counted.length > 0
      ? rule.points
      : 0
    : counted.length * rule.points;
  return points === 0 ? null : { code, points, identifiers: counted };
}

/** Scores a set of facts under {@link GROWTH_SCORE_POLICY}. */
export function scoreGrowthFacts(
  subject: GrowthScoreResult['subject'],
  facts: GrowthScoreFacts,
): GrowthScoreResult {
  const candidates: [GrowthScoreReasonCode, Iterable<string>][] = [
    ['milestone.started', facts.milestones.started],
    ['milestone.streamed', facts.milestones.streamed],
    ['milestone.tool', facts.milestones.tool],
    ['milestone.component', facts.milestones.component],
    ['project.returned_7d', facts.returnedSubjects],
    [
      'contact.approved_work_email_form',
      facts.approvedWorkEmailForm ? ['once'] : [],
    ],
    [
      'contact.approved_install_digest',
      facts.approvedInstallDigest ? ['once'] : [],
    ],
    ['content.docs_engaged', facts.docsEngagedContentIds],
  ];
  const reasons = candidates
    .map(([code, identifiers]) => reasonFor(code, identifiers))
    .filter((reason): reason is GrowthScoreReason => reason !== null);
  const score = reasons.reduce((total, reason) => total + reason.points, 0);
  return {
    subject,
    score,
    tier: growthScoreTierFor(score),
    policyVersion: GROWTH_SCORE_POLICY_VERSION,
    scoreVersion: GROWTH_SCORE_POLICY_VERSION,
    reasons,
  };
}

/**
 * Derives milestone and return facts from runtime observations. A subject
 * returned when a `runtime.session_started` falls on a later UTC day at most
 * seven days after its first one.
 */
export function runtimeFactsFromObservations(
  observations: readonly InstallRuntimeObservation[],
): Pick<GrowthScoreFacts, 'milestones' | 'returnedSubjects'> {
  const milestones: Record<GrowthRuntimeMilestone, Set<string>> = {
    started: new Set(),
    streamed: new Set(),
    tool: new Set(),
    component: new Set(),
  };
  const sessionDays = new Map<string, number[]>();
  for (const observation of observations) {
    const milestone = RUNTIME_MILESTONE_KINDS[observation.kind];
    if (!milestone) continue;
    milestones[milestone].add(observation.subjectId);
    if (milestone === 'started') {
      const days = sessionDays.get(observation.subjectId) ?? [];
      sessionDays.set(observation.subjectId, [
        ...days,
        Date.parse(`${observation.day}T00:00:00.000Z`),
      ]);
    }
  }
  const returnedSubjects = [...sessionDays]
    .filter(([, days]) => {
      const first = Math.min(...days);
      return days.some((day) => day > first && day <= first + 7 * DAY_MS);
    })
    .map(([subjectId]) => subjectId)
    .sort();
  const sorted = (set: Set<string>) => [...set].sort();
  return {
    milestones: {
      started: sorted(milestones.started),
      streamed: sorted(milestones.streamed),
      tool: sorted(milestones.tool),
      component: sorted(milestones.component),
    },
    returnedSubjects,
  };
}

/** The furthest milestone any of the observations marks; `installed` when none. */
export function highestMilestoneFor(
  observations: readonly InstallRuntimeObservation[],
): GrowthMilestone {
  return observations.reduce<GrowthMilestone>((highest, observation) => {
    const milestone = RUNTIME_MILESTONE_KINDS[observation.kind];
    return milestone &&
      MILESTONE_ORDER.indexOf(milestone) > MILESTONE_ORDER.indexOf(highest)
      ? milestone
      : highest;
  }, 'installed');
}

/**
 * Scores an install identity that has no contact from the runtime
 * observations that share its installation tokens. Used by the install digest.
 */
export function scoreForInstallIdentity(input: {
  identityId: string;
  runtimeObservations: readonly InstallRuntimeObservation[];
}): GrowthScoreResult {
  return scoreGrowthFacts(
    { type: 'install_identity', id: input.identityId },
    {
      ...runtimeFactsFromObservations(input.runtimeObservations),
      approvedWorkEmailForm: false,
      approvedInstallDigest: false,
      docsEngagedContentIds: [],
    },
  );
}

/** A row of runtime observations as the score readers select them. */
export interface RuntimeObservationRow extends Record<string, unknown> {
  subject_id: string;
  kind: string;
  day: string;
  integration: string | null;
  received_at: Date | string;
}

/** Maps a selected runtime observation row to an {@link InstallRuntimeObservation}. */
export function toInstallRuntimeObservation(
  row: RuntimeObservationRow,
): InstallRuntimeObservation {
  return {
    subjectId: row.subject_id,
    kind: row.kind,
    day: row.day,
    integration: row.integration,
    receivedAt: new Date(row.received_at),
  };
}

function isVerifiedWorkApproval(
  kind: string,
  data: Record<string, unknown>,
): boolean {
  return (
    kind === 'form.outreach_approved' &&
    data['email_classification'] === 'work' &&
    data['verification'] === 'server_verified' &&
    typeof data['source'] === 'string' &&
    data['source'].length > 0 &&
    typeof data['source_form'] === 'string' &&
    data['source_form'].length > 0
  );
}

function isInstallDigestApproval(
  kind: string,
  data: Record<string, unknown>,
): boolean {
  return (
    kind === 'contact.reauthorized' &&
    data['provenance'] === 'founder_action' &&
    data['reason'] === 'founder_install_digest_approval' &&
    typeof data['install_observation_id'] === 'string'
  );
}

/**
 * Recomputes a contact's score from its approval activities and the runtime
 * observations linked to it (through approved install-runtime links and
 * founder digest approvals), then stores it in `growth_contact_scores`. A
 * deleted contact scores zero and its stored score is removed.
 *
 * @throws When the contact does not exist.
 */
export async function recomputeContactScore(
  executor: SqlExecutor,
  input: { contactId: string; now: Date },
): Promise<GrowthScoreResult> {
  if (!Number.isFinite(input.now.getTime())) {
    throw new Error('now must be a valid Date');
  }
  const contact = await executor.execute<{
    id: string;
    deleted_at: Date | string | null;
  }>(
    `/* growth:read-score-contact */
     select id, deleted_at from growth_contacts where id = $1`,
    [input.contactId],
  );
  const row = contact.rows[0];
  if (!row) throw new Error(`Growth contact not found: ${input.contactId}`);
  const subject = { type: 'contact' as const, id: input.contactId };
  if (row.deleted_at !== null) {
    await executor.execute(
      `/* growth:delete-contact-score */
       delete from growth_contact_scores where contact_id = $1`,
      [input.contactId],
    );
    return scoreGrowthFacts(subject, {
      milestones: { started: [], streamed: [], tool: [], component: [] },
      returnedSubjects: [],
      approvedWorkEmailForm: false,
      approvedInstallDigest: false,
      docsEngagedContentIds: [],
    });
  }
  const approvals = await executor.execute<{
    kind: string;
    data: Record<string, unknown>;
  }>(
    `/* growth:read-contact-score-approvals */
     select kind, data from growth_activity
     where contact_id = $1
       and kind in ('form.outreach_approved', 'contact.reauthorized')
       and occurred_at <= $2
     order by occurred_at, id`,
    [input.contactId, input.now],
  );
  const runtime = await executor.execute<RuntimeObservationRow>(
    `/* growth:read-contact-score-runtime */
     with tokens as (
       select install.installation_token_digest as token
       from growth_install_runtime_links l
       join growth_observations install on install.id = l.install_observation_id
       where l.contact_id = $1
         and l.outcome = 'approved'
         and install.redacted_at is null
       union
       select install.installation_token_digest
       from growth_activity a
       join growth_observations install
         on install.id::text = a.data->>'install_observation_id'
       where a.contact_id = $1
         and a.kind = 'contact.reauthorized'
         and a.data->>'provenance' = 'founder_action'
         and install.redacted_at is null
     )
     select r.subject_id,
            r.kind,
            to_char((least(r.occurred_at, r.received_at) at time zone 'utc')::date, 'YYYY-MM-DD') as day,
            r.properties->>'integration' as integration,
            r.received_at
     from growth_observations r
     where r.source = 'runtime'
       and r.redacted_at is null
       and r.received_at <= $2
       and r.installation_token_digest in (
         select token from tokens where token is not null
       )
     order by r.received_at, r.id`,
    [input.contactId, input.now],
  );
  const result = scoreGrowthFacts(subject, {
    ...runtimeFactsFromObservations(
      runtime.rows.map(toInstallRuntimeObservation),
    ),
    approvedWorkEmailForm: approvals.rows.some(({ kind, data }) =>
      isVerifiedWorkApproval(kind, data),
    ),
    approvedInstallDigest: approvals.rows.some(({ kind, data }) =>
      isInstallDigestApproval(kind, data),
    ),
    docsEngagedContentIds: [],
  });
  await executor.execute(
    `/* growth:upsert-contact-score */
     insert into growth_contact_scores (
       contact_id, score, tier, policy_version, reasons, computed_at
     ) values ($1, $2, $3, $4, $5::jsonb, $6)
     on conflict (contact_id) do update
     set score = excluded.score,
         tier = excluded.tier,
         policy_version = excluded.policy_version,
         reasons = excluded.reasons,
         computed_at = excluded.computed_at`,
    [
      input.contactId,
      result.score,
      result.tier,
      result.policyVersion,
      JSON.stringify(result.reasons),
      input.now,
    ],
  );
  return result;
}
