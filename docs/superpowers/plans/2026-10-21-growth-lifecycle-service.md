# Growth Lifecycle Service (PR 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The worker that turns approved contacts into the fixed three-step founder sequence and sends Brian the daily install digest: `tools/lifecycle`, a b4run 0.14 app on Vercel whose single `/dispatch#workflow` route runs the growth job dispatcher, plus the growth-library pieces it needs (campaign calendar, enrollment, install digest, hello-path approval, reply intake, message-id reconciliation, scoring), the www cron, approve-install and reply routes, the `/call` redirect, and one shared announcements catalog for the website pill and the runtime collector. After this PR the preview lifecycle deployment runs end to end against a controlled recipient; production stays off behind the section 14 switches until PR 7.

**Architecture:** Copied and adapted from threadplane (`/Users/blove/repos/angular-agent-framework`: `apps/lifecycle/*`, `libs/growth/src/lib/{campaign-schedule,jobs,replies,resend,dispatcher,scoring,contacts}.ts`, `libs/growth/src/lib/observability/{install-digest,install-runtime}.ts`, migrations `0007`–`0008`, `apps/website/src/app/api/{cron/lifecycle,growth/approve-install,growth/replies/google}`, `apps/website/src/lib/growth/lifecycle-client.ts`). b4run (formerly Dawn) is the hosting shell, not a decision maker: the route is a plain `workflow` function, every decision is SQL plus code, and no model is called. Hashbrown differences: b4run `0.14.0` instead of Dawn `0.8.26`, so the config, CLI wrapper, Vercel adapter and state-database binding are rebuilt (design section 4, "Worker runtime"); no enrichment, research, capture, or LangSmith; the route prefix is `/_/` and the env var is `LIFECYCLE_URL`; three approval paths (form, founder digest, install-runtime hello); the digest is due at 07:00 Pacific; the website pill and runtime announcements share one catalog.

**Tech Stack:** New root dependencies, exact pins, **ask Brian before `npm install`**: `@b4run/sdk@0.14.0`, `@b4run/cli@0.14.0`, `@b4run/core@0.14.0`, `@b4run/postgres-storage@0.14.0`, `hono` (the version `@b4run/cli@0.14.0` depends on). Already present: `@neondatabase/serverless 0.10.4`, `resend 6.10.0`, `zod ^4`, `tsx`, `vitest 4.1.10`, `esbuild` (through `@b4run/cli`). Node 24 (`.nvmrc`). No `@dawn-ai/*`, no `pg`, no `@react-email/*`.

**Spec:** `docs/superpowers/specs/2026-10-20-growth-lifecycle-design.md` sections 4, 5.1 (`lifecycle`), 5.2, 6.6, 7, 8, 11, 12 (items 7 and 11), 14 item 5, as amended by Task 11 of this plan (three approval paths; shared announcements). Reconnaissance notes: the side-session note `growth-pr5-lifecycle-recon.md` (outside the repo; facts about threadplane and b4run 0.14 that this plan relies on).

## Open questions for Brian (answer before Task 1)

1. **Dependencies.** May the five root dependencies be added: `@b4run/sdk`, `@b4run/cli`, `@b4run/core`, `@b4run/postgres-storage` (all `0.14.0`, or the release that carries `B4_DATABASE_URL` if Task 0 lands on outcome B) and `hono`?
2. **Announcement expiry.** How long should the v0.7 pill entry stay live once it moves into the shared catalog (Task 9)? Default if unanswered: 90 days from 2026-10-08.
3. **Dogfood mailbox.** Which address goes on `RESEND_NON_PRODUCTION_ALLOWLIST` / `RESEND_NON_PRODUCTION_REDIRECT_TO` for the preview run (Task 11)? Set it on Vercel's Preview target; never paste it into the PR.

## Decisions from brainstorming (2026-10-21, Brian)

1. b4run hosts the dispatcher as a `workflow` route invoked over the Agent Protocol, with a hand-built outer adapter, "similar to threadplane". No cron inside b4run; future agent work may land in the same app.
2. If b4run's generated Vercel function cannot bind the state database per request, the fix is upstream in b4run (`B4_DATABASE_URL` accepted before `DATABASE_URL`), released and pinned before this PR deploys. The two Neon stores stay separate. Never rewrite `process.env.DATABASE_URL`.
3. The three email texts and subjects in design section 8.5 are final copy.
4. Outreach is also approved automatically when an install and a runtime session link up (`GROWTH_INSTALL_RUNTIME_HELLO_ENABLED`), limited to work-domain emails exactly as the digest candidate list is. Section 8.2's "exactly two paths" becomes three.
5. The website announcement pill and the runtime announcements read one shared catalog, built inside this PR.

## Global Constraints

- Public copy, identifiers, docs and runbooks never use the word "tracking" (`RESEND_TRACKING_DISABLED` and `DO_NOT_TRACK` are the ecosystem exceptions already in the code). Use lifecycle, delivery, sequence, observation.
- Sender is exactly `Brian at Hashbrown <brian@hashbrown.dev>` on `hashbrown.dev` (`RECIPIENT_EMAIL_SENDER`, `VERIFIED_DOMAIN` in `tools/growth/src/lib/resend.ts`). Every recipient message carries `List-Unsubscribe`, `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, `X-Hashbrown-Job-ID`, the job's idempotency key, and the tags `environment`, `job_kind`, and for `send_step` also `campaign_version=v1`, `campaign_step`, `campaign_template ∈ immediate | day-3 | day-8`.
- Only `growth_contacts.outreach_approved_at`, backed by a matching approval activity (`form.outreach_approved` with `source_form = 'unstuck'`, `contact.reauthorized` with `provenance = 'founder_action'`, or `install_runtime.outreach_approved`), authorizes a `send_step`; `fulfill` needs no approval. Every send re-authorizes under the privacy lock immediately before Resend (`authorizeLeasedJobForSubmission`, unchanged).
- Calendar: `America/Los_Angeles`. Step 1 due `businessMorningAfter(enrolledAt, 1)` and never before `campaign.enrolled:v1` is five minutes old; step 2 `max(existing, businessMorningAfter(step1AcceptedAt, 3))`; step 3 `businessMorningAfter(step1AcceptedAt, 8)` then `businessMorningAfter(step2AcceptedAt, 5)`; `greatest()` so a replay never moves a send earlier. Send window: Monday to Friday, Pacific hour 7, enforced in the lease SQL, in `authorizeLeasedJobForSubmission` (via `isSendWindow`) and in `sendRecipientEmail`. Weekends skipped, holidays not. Digest due `nextPacificBusinessMorning(now)` (Task 2), never on a weekend.
- Switches accept only the exact strings `true` / `false`; unset is `false`; any other value throws at configuration load: `CAMPAIGN_ENABLED`, `CAMPAIGN_ENROLLMENT_ENABLED`, `DELIVERY_ENABLED`, `LIFECYCLE_CRON_ENABLED` (www), `GROWTH_OBSERVATION_PROCESSING_ENABLED`, `GROWTH_INSTALL_DIGEST_ENABLED`, `GROWTH_INSTALL_RUNTIME_HELLO_ENABLED`. `CAMPAIGN_ENROLLMENT_START_AT` is canonical `YYYY-MM-DDTHH:MM:SS.mmmZ`, required only when enrollment is on, immutable once recorded (`campaign:v1:configuration`).
- Two databases, never falling back: `DATABASE_URL` (growth) for every growth query; `B4_DATABASE_URL` (b4run threads, checkpoints, permissions) bound to the b4run runtime only. `GROWTH_DATABASE_ENVIRONMENT === DELIVERY_ENVIRONMENT` or the delivery policy throws. Outside production the policy requires `RESEND_NON_PRODUCTION_ALLOWLIST` and any `RESEND_NON_PRODUCTION_REDIRECT_TO` on it.
- The lifecycle service answers 503 without `LIFECYCLE_SERVICE_SECRET`, 401 without the exact bearer on **every** path including `/healthz`, `/readyz`, `/threads*`, `/memory/*`, and 503 with a bearer but no `B4_DATABASE_URL`. The bearer check also runs in b4run middleware (`src/middleware.ts`) so execution endpoints are gated twice.
- Dispatcher: batch 1..25 (default 20, `LIFECYCLE_BATCH_SIZE`), lease 60 000 ms renewed every 20 000 ms, sequential job loop, `maxDuration` 60. Order per tick: Resend message-id reconciliation → observation projection (when enabled; a failure is the `observation_projection_failed` alert and does not block) → hello activations (when enabled) → enrollment materialization (when enabled) → digest enqueue (when enabled, Pacific weekday) → lease → dispatch. `DeterministicLifecycleJobError` quarantines the job (`failLeasedJob`, code `deterministic_job_poison`) and the loop continues.
- Templates: at most 120 words, one `?`, subject ≤ 80 chars with no URL or newline, body ≤ 1200 chars, no HTML, markdown, email address or injected header; links only from `APPROVED_CAMPAIGN_LINKS = { https://hashbrown.dev/docs, https://hashbrown.dev/unstuck, https://threadplane.ai, https://hashbrown.dev/call }`; at most one link, except step 3 (`day-8`) which may carry two; the surveillance, calendar-host and tracking-markup regexes from threadplane verbatim. The linter runs on every template at test time.
- No secret in any log, committed file, fixture or test name. Nothing from a contact (email, name, company) reaches PostHog; this PR adds no PostHog events.
- Tests: top-level `test(...)` only, arrange/act/assert with blank lines, TSDoc on every export, `npx nx <target> <project>`. Before the PR: `npx nx build growth && npx nx test growth && npx nx lint growth && npx nx build lifecycle && npx nx test lifecycle && npx nx lint lifecycle && npx nx test www && npx nx lint www && npx nx build www`, plus `GROWTH_INTEGRATION=1 npx nx test-integration growth` against the test store.

## Review Focus

1. A cron tick at 06:59:58 Pacific that acquires locks and reaches the send at 07:00:01 must still obey the window at the moment of the Resend call, and a tick at 07:59:59 must not send at 08:00:00 (Task 2 test "isCampaignSendWindow flips exactly at Pacific 07:00 and 08:00 on both sides of a DST change"; the existing `authorizeLeasedJobForSubmission` re-reads `currentTime` after locks).
2. Two overlapping ticks (a cron and a form nudge) must never double-send: the second sees the first's lease (Task 6 test "concurrent dispatches lease each due job once and the loser gets zero jobs", integration).
3. A reply from the recipient between step 1 and step 2 must cancel steps 2 and 3 even when the Resend `message_id` has not been reconciled yet (Task 4 test "a reply matched by subject fallback stops the contact and cancels pending steps"; `reply_reconcile` retries until the id binds).
4. The hello path must never approve from a CI install, a redacted install, an install with two different emails, or a personal-domain email, and must create at most one contact per email across key rotations (Task 3 tests "hello activation outcomes").
5. The outer adapter must refuse an unauthenticated `GET /threads/<id>/state` and `GET /readyz` even though b4run's own middleware would allow them (Task 7 test "adapter rejects every unauthenticated path incl. /healthz, /readyz, /threads, /memory/candidates", and the isolated artifact check).

---

### Task 0: Spike: how b4run 0.14's Vercel function binds its database (throwaway)

**Files:**

- Create (temporary, deleted at the end of the task): a scratch b4run app under the scratchpad directory, not in the repo.

**Interfaces:**

- Produces: a decision recorded at the top of Task 7 as either **(A)** "the generated `functions/b4.func/index.mjs` exports a Hono app whose `fetch(request, env)` reads `env.DATABASE_URL` for its stores, so the adapter passes `{ DATABASE_URL: process.env.B4_DATABASE_URL }`" or **(B)** "the stores read `process.env.DATABASE_URL` only, so b4run needs the `B4_DATABASE_URL` binding".

- [ ] **Step 1:** In the scratchpad, `npm init -y && npm install @b4run/sdk@0.14.0 @b4run/cli@0.14.0 @b4run/core@0.14.0 @b4run/postgres-storage@0.14.0 @neondatabase/serverless hono`, write `b4.config.ts` with `build: { targets: ['vercel'], vercel: { reconcileVercelJson: false } }`, one `src/app/dispatch/index.ts` exporting `workflow`, run `npx b4 check && npx b4 build`.
- [ ] **Step 2:** Read `.vercel/output/functions/b4.func/index.mjs`: find the store factory and record (quote the lines) whether `DATABASE_URL` is read from the Hono `env`/`c.env` binding, from `process.env`, or both; note the exported handler shape and whether `B4_PG_SCHEMA` is read the same way.
- [ ] **Step 3:** Write the outcome, with the quoted lines, as a dated note at the top of Task 7 in this plan, and as a comment in the shared side-session notes file. If **(B)**: open the b4run PR (`packages/*` store factory for the `hono`/`vercel` targets: read `B4_DATABASE_URL` first, then `DATABASE_URL`; docs page `deployment/vercel` updated; a test), get it released, and change every `0.14.0` pin in this plan to that release before Task 1 runs. Delete the scratch app.

---

### Task 1: Dependencies and the `lifecycle` Nx project skeleton

**Files:**

- Modify: root `package.json` (the five dependencies above, after Brian's OK; `npm install`; commit `package-lock.json`), `.gitignore` (`tools/lifecycle/.b4/`, `tools/lifecycle/.vercel/`). No `tsconfig.base.json` path: nothing outside `tools/lifecycle` imports it.
- Create: `tools/lifecycle/package.json` (`@hashbrownai-internal/lifecycle`, private, `type: module`, `engines.node >=24`), `tools/lifecycle/project.json`, `tools/lifecycle/tsconfig.json` + `tsconfig.spec.json` (same shape as `tools/growth`), `tools/lifecycle/vitest.config.mts`, `tools/lifecycle/b4.config.ts`, `tools/lifecycle/vercel.json`, `tools/lifecycle/src/growth.ts`, `tools/lifecycle/src/service-auth.ts`, `tools/lifecycle/src/middleware.ts`, `tools/lifecycle/src/app/dispatch/state.ts`, `tools/lifecycle/src/app/dispatch/index.ts` (stub returning `{ ...current, result: { leased: 0, dispatched: 0, recoveryPaused: false, operatorAlerts: [] } }` until Task 6), `tools/lifecycle/scripts/b4-cli.mts`
- Test: `tools/lifecycle/src/service-auth.spec.ts`, `tools/lifecycle/src/middleware.spec.ts`, `tools/lifecycle/src/app/dispatch/state.spec.ts`

**Interfaces:**

- `b4.config.ts`: `import { config } from '@b4run/cli'; export default config({ appDir: 'src/app', build: { targets: ['vercel'], vercel: { reconcileVercelJson: false, maxDuration: 60 } } })`. `vercel.json`: `{ "$schema": "https://openapi.vercel.sh/vercel.json", "framework": null, "fluid": true }` (Fluid is already set on the project by the bootstrap; the file documents it; no `buildCommand`, CI deploys prebuilt).
- `src/growth.ts`: `export * from '../../growth/src/index.ts';` (relative, so b4run's bundler inlines the workspace library as threadplane's `growth.ts` does).
- `hasExactBearerToken(authorization: string | undefined, secret: string | undefined): boolean` in `service-auth.ts`: constant-time compare of `Bearer ${secret}`, false on any missing value or length mismatch.
- `src/middleware.ts`: `defineMiddleware((request) => hasExactBearerToken(request.headers.authorization, process.env['LIFECYCLE_SERVICE_SECRET']) ? allow({ service: 'hashbrown-www' }) : reject(401, { error: 'Unauthorized' }))`.
- `state.ts` default export (zod 4, `.strict()`): `{ trigger: z.enum(['cron', 'nudge']), submission_id: z.uuid().optional(), dogfood_fixture_marker: z.literal('hashbrown-preview-dogfood-v1').optional(), result: z.object({ leased: int ≥ 0, dispatched: int ≥ 0, recoveryPaused: boolean, operatorAlerts: z.array(z.enum(['mailbox_recovery_required', 'observation_projection_failed'])) }).strict().optional() }`. Export `type DispatchState`.
- `scripts/b4-cli.mts`: requires Node ≥ 24, resolves `@b4run/cli` from the root `node_modules`, asserts its version equals the pinned `0.14.0` (read from root `package.json`, so the pin lives once), spawns `b4 <args>` with `--cwd tools/lifecycle`.
- `project.json` targets: `lint` (`eslint tools/lifecycle`), `test` (`vitest run --config tools/lifecycle/vitest.config.mts`), `check` (`node --import tsx tools/lifecycle/scripts/b4-cli.mts check`, then `tsc --noEmit -p tools/lifecycle/tsconfig.json`), `build` (Task 7 fills it; for now `check`), `implicitDependencies: ['growth']`, `projectType: 'application'` so `nx show projects --affected --type=app` selects it for deploy.

- [ ] **Step 1: Write the failing tests**

```ts
test('hasExactBearerToken accepts only the exact bearer and never a prefix, suffix or empty secret', ...);
test('middleware rejects 401 without the bearer and allows with service hashbrown-www', ...);
test('dispatch state rejects unknown keys, a non-uuid submission_id and an unknown alert', ...);
```

- [ ] **Step 2:** Run `npx nx test lifecycle`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Add the dependencies (after Brian's OK), write the files above.
- [ ] **Step 4:** Run `npx nx test lifecycle && npx nx lint lifecycle && npx nx check lifecycle`. Expected: PASS; `b4 check` lists one route `/dispatch#workflow`.
- [ ] **Step 5: Commit** `feat(lifecycle): b4run app skeleton with bearer middleware and dispatch state`

---

### Task 2: Campaign calendar, enrollment materialization, cadence anchoring, job context

**Files:**

- Create: `tools/growth/src/lib/campaign-schedule.ts`, `tools/growth/src/lib/campaign-schedule.spec.ts`
- Modify: `tools/growth/src/lib/jobs.ts` (`materializeCampaignEnrollment`, `readLifecycleJobContext`, `claimInternalNotificationSubmission`, `markInternalNotificationUnknown`, cadence anchoring inside `recordProviderAcceptance`, the `send_step` lease predicate gains the Pacific weekday/hour-7 SQL and the three approval kinds, the final-authorization lateral join accepts `source_form = 'unstuck'` and `install_runtime.outreach_approved`), `tools/growth/src/lib/contacts.ts` (`FormSubmittedFacts.form_kind: 'unstuck'`, `source_form` allowlist), `tools/growth/src/lib/models.ts` (`GrowthLifecycleJobContext`), `tools/growth/src/index.ts`
- Test: `tools/growth/src/lib/jobs.spec.ts` (extend), `tools/growth/test/*.integration.spec.ts` (extend the existing integration layout for enrollment + anchoring)

**Interfaces:**

- `CAMPAIGN_TIME_ZONE = 'America/Los_Angeles'`; `businessMorningAfter(anchor: Date, businessDays: number): Date` (1..366 weekdays after the anchor's Pacific date, 07:00 Pacific, DST-correct via `Intl.DateTimeFormat` parts as threadplane); `isCampaignSendWindow(now: Date): boolean`; `pacificCalendarDate(now: Date): { date: string; weekday: boolean }`; new `nextPacificBusinessMorning(now: Date): Date` (today 07:00 if `now` is a weekday before 07:00, else `businessMorningAfter(now, 1)`), used by the digest in Task 3.
- `materializeCampaignEnrollment(executor, { enrollmentEnabled: boolean; enrollmentStartAt: Date; now: Date; batchSize: 1..1000 }): Promise<{ enrolledContactIds: string[]; createdJobs: number }>` as threadplane minus `project.claimed`, with the approval kinds listed in Global Constraints; `campaign.enrolled:v1` data carries `enrollment_reason ∈ 'unstuck_form' | 'install_digest' | 'install_runtime'`; the three `send_step` jobs have idempotency keys `campaign:v1:<contactId>:step:<n>` and `available_at = businessMorningAfter(now, 1)`.
- `recordProviderAcceptance` (existing) gains the anchoring update: after step 1, step 2 `available_at = greatest(available_at, businessMorningAfter(acceptedAt, 3))` and step 3 `greatest(available_at, businessMorningAfter(acceptedAt, 8))`; after step 2, step 3 `greatest(available_at, businessMorningAfter(acceptedAt, 5))`. Only pending, not-submitted siblings move.
- `readLifecycleJobContext(executor, { jobId }): Promise<GrowthLifecycleJobContext>` = `{ contactId, displayName, companyName, companyDomain, emailClassification, formSubmission: { form_kind?, submission_id?, message_present? } | null, enrollmentAt, campaignEnrollmentReason }` (no artifact fields: no enrichment).
- `claimInternalNotificationSubmission(executor, { jobId, leaseToken, now, kind: 'notify' | 'digest' }): Promise<'claimed' | 'already_claimed'>` and `markInternalNotificationUnknown(executor, { jobId, leaseToken, occurredAt, errorCode })` as threadplane.
- `leaseDueJobs` keeps its `isSendWindow` parameter and additionally embeds the SQL window predicate for `send_step` (`extract(isodow from $2 at time zone 'America/Los_Angeles') between 1 and 5 and extract(hour ...) = 7`), so a caller cannot forget it.

- [ ] **Step 1: Write the failing tests**

```ts
test('businessMorningAfter skips weekends, excludes the anchor day and lands on 07:00 Pacific', ...);
test('businessMorningAfter is 07:00 Pacific across the 2026-11-01 DST change', ...);
test('isCampaignSendWindow flips exactly at Pacific 07:00 and 08:00 on both sides of a DST change', ...); // Review Focus 1
test('nextPacificBusinessMorning returns today 07:00 before 07:00 on a weekday, else the next business morning', ...);
test('materializeCampaignEnrollment enrols unstuck, founder-digest and install-runtime approvals once and never an unapproved or stopped contact', ...); // integration
test('materializeCampaignEnrollment throws when CAMPAIGN_ENROLLMENT_START_AT differs from the recorded configuration', ...); // integration
test('step 1 is not leased within five minutes of enrollment', ...); // integration
test('recordProviderAcceptance pushes steps 2 and 3 out by 3 and 8 business days and a replay never moves them earlier', ...); // integration
test('leaseDueJobs never leases a send_step outside Monday-Friday 07:00 Pacific even when isSendWindow says yes', ...); // integration
test('final authorization accepts source_form unstuck and install_runtime.outreach_approved and rejects whitepaper', ...); // integration
```

- [ ] **Step 2:** Run `npx nx test growth` and `GROWTH_INTEGRATION=1 npx nx test-integration growth` (test store). Expected: FAIL.
- [ ] **Step 3:** Implement. Port threadplane's SQL; remove the `project.claimed`, abuse-assessment and enrichment-artifact clauses; rename the form list.
- [ ] **Step 4:** Run the same commands plus `npx nx build growth && npx nx lint growth`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(growth): campaign calendar, enrollment materialization and cadence anchoring`

---

### Task 3: Install digest, hello-path approval, scoring, migration 0005

**Files:**

- Create: `tools/growth/migrations/0005_growth_lifecycle.sql`, `tools/growth/src/lib/observability/install-digest.ts` (+ spec), `tools/growth/src/lib/observability/install-runtime.ts` (+ spec), `tools/growth/src/lib/scoring.ts` (+ spec)
- Modify: `tools/growth/src/lib/contacts.ts` (`approveContactFromInstallDigest`, `approveContactFromInstallRuntimeInTransaction`, `findOrInsertIdentityContactInTransaction` if not already present), `tools/growth/src/lib/observability/journey-report.ts` (funnel gains `approvedByHello` and `digested` counts), `tools/growth/migrations/0004_growth_observability_views.sql` is **not** edited; new views go in 0005; `tools/growth/src/index.ts`
- Test: integration specs for the digest and hello paths

**Interfaces:**

- Migration `0005_growth_lifecycle.sql`: `growth_install_runtime_links` and `growth_install_digest_reports` exactly as threadplane `0007`/`0008` (columns quoted in the recon note), plus `growth_contact_scores (contact_id uuid primary key references growth_contacts, score integer, tier text check (tier in ('low','medium','high','very_high')), policy_version text, reasons jsonb, computed_at timestamptz)`, plus `growth_jobs_kind_check` unchanged (kinds already include `digest`, `notify`, `reply_reconcile`).
- `PERSONAL_EMAIL_DOMAINS` (threadplane's list verbatim) exported from `install-digest.ts` and shared with the hello path.
- `readInstallDigestCandidates(executor, { limit: 1..1000; keyring?: EmailHmacKeyring }): Promise<InstallDigestCandidate[]>` with `InstallDigestCandidate` as threadplane plus `highestMilestone: 'installed' | 'started' | 'streamed' | 'tool' | 'component'`, `framework: 'react' | 'angular' | null`, `scoreTier: GrowthScoreTier` (design 8.7: one line per identity with package, version, framework, highest milestone, score tier); `readInstallDigestContext(executor, { since })`; `enqueueInstallDigestJob(executor, { now; idempotencyKey; businessDate; keyring; availableAt })` where the dispatcher passes `availableAt = nextPacificBusinessMorning(now)`; `markInstallDigestReported(...)`; `INSTALL_DIGEST_MAX_PACKAGES = 20`.
- `processInstallRuntimeActivations(db, { enabled; limit: 1..100; now; keyring }): Promise<{ approved; ineligible; conflicted; disabled }>` as threadplane minus `enqueueInstallRuntimeEnrichment`, with an added predicate: the install identity's email domain is not in `PERSONAL_EMAIL_DOMAINS` (otherwise outcome `ineligible`). Approval records `install_runtime.outreach_approved` with `data = { install_observation_id, runtime_observation_id, policy_version: 'growth-v1', verification: 'linked_observations' }` and `source = 'install_runtime'`.
- `approveContactFromInstallDigest(executor, { installObservationId; occurredAt; eventKey; keyring }): Promise<{ approved: true; contactId; changed: boolean } | { approved: false; reason: 'identity_unavailable' | 'deleted' | 'stopped' }>` as threadplane.
- `scoring.ts`: `GROWTH_SCORE_POLICY_VERSION = 'growth-score-policy:v1'`, tiers `low | medium | high | very_high`, reasons `milestone.started`, `milestone.streamed`, `milestone.tool`, `milestone.component`, `project.returned_7d`, `contact.approved_work_email_form`, `contact.approved_install_digest`, `content.docs_engaged` (design 6.6; threadplane's weights, thresholds and set-based tiering copied, reasons renamed); `recomputeContactScore(executor, { contactId; now }): Promise<GrowthScoreResult>`; `scoreForInstallIdentity(...)` used by the digest to fill `scoreTier` from the linked subject's facts without a contact.

- [ ] **Step 1: Write the failing tests**

```ts
test('migration 0005 applies after 0004 and the ledger records its checksum', ...);
test('digest candidates exclude CI, redacted, personal-domain, contact-matched and already-reported identities and group package@version newest 20', ...); // integration
test('enqueueInstallDigestJob is idempotent per business date and due at the next Pacific business morning', ...); // integration
test('hello activation outcomes: approved for one work email; ineligible for CI, redacted, personal domain; conflicted for two emails; one contact across key rotation', ...); // Review Focus 4, integration
test('approveContactFromInstallDigest creates and approves once, reports stopped and deleted, and is inert on replay', ...); // integration
test('score tiers and renamed reasons match the policy table', ...);
```

- [ ] **Step 2:** Run growth unit + integration tests. Expected: FAIL.
- [ ] **Step 3:** Implement; apply `0005` to the test store through `npx nx migrate-growth growth` with `DATABASE_URL` pointed at `TEST_DATABASE_URL` (never the preview store before merge).
- [ ] **Step 4:** Run `npx nx build growth && npx nx test growth && npx nx lint growth && GROWTH_INTEGRATION=1 npx nx test-integration growth`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(growth): install digest, install-runtime approval, scoring and migration 0005`

---

### Task 4: Reply intake, message-id reconciliation, library dispatcher

**Files:**

- Create: `tools/growth/src/lib/replies.ts` (+ spec), `tools/growth/src/lib/dispatcher.ts` (+ spec)
- Modify: `tools/growth/src/lib/resend.ts` (`reconcilePendingResendMessageIds`), `tools/growth/src/lib/stops.ts` (reason `campaign.reply_received` already present; add provenance `mailbox_reply` usage), `tools/growth/src/index.ts`
- Test: integration spec for reply → stop → cancellation

**Interfaces:**

- `replies.ts` as threadplane with `BRIAN_EMAIL = 'brian@hashbrown.dev'`, header names `x-hashbrown-timestamp | x-hashbrown-nonce | x-hashbrown-signature`, secret `GOOGLE_REPLY_HMAC_SECRET` (already provisioned): `verifyGoogleReplySignature`, `parseGoogleMailboxEvent`, `processGoogleMailboxEvent`, `settleGoogleReplyReconciliation`, `isGoogleMailboxRecoveryPaused`, `bindProviderMessageId`, `sha256Base64Url`, `rankGoogleReplyCandidates`, `selectBestGoogleReplyResolution`, and the event types. Reply bodies are never stored; only `gmailMessageId`, `inReplyTo`/`references`, subject hash and timestamps.
- `reconcilePendingResendMessageIds(executor, { now; signal }, deps = { fetch, env }): Promise<{ claimed; bound; deferred }>` as threadplane (5 per tick, `GET https://api.resend.com/emails/:id`, 5 s timeout, 128 KiB cap, environment tag check).
- `dispatcher.ts`: `GrowthDispatchResult = 'completed' | 'deferred' | 'cancelled' | 'failed' | 'recovery_paused'`, `GrowthAppJobKind = 'fulfill' | 'notify' | 'send_step' | 'digest'`, `GrowthAppJobHandler`, `GrowthAppJobHandlers`, `dispatchGrowthLeasedJob(executor, job, deps)` (handles `reply_reconcile` itself, pauses `send_step`/`reply_reconcile` while mailbox recovery is open, otherwise calls the app handler).

- [ ] **Step 1: Write the failing tests**

```ts
test('verifyGoogleReplySignature rejects a stale timestamp, a short secret and a tampered body', ...);
test('a reply matched by subject fallback stops the contact and cancels pending steps', ...); // Review Focus 3, integration
test('an unmatched reply enqueues reply_reconcile 5 minutes out and settles once the message id binds', ...); // integration
test('recovery_required pauses send_step and reply_reconcile dispatch until recovery_completed', ...);
test('reconcilePendingResendMessageIds claims at most 5, backs off per attempt and ignores foreign environments', ...);
test('dispatchGrowthLeasedJob throws for an unleased job and an unknown kind', ...);
```

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx nx build growth && npx nx test growth && npx nx lint growth` and the integration target. Expected: PASS.
- [ ] **Step 5: Commit** `feat(growth): reply intake, Resend message-id reconciliation and job dispatcher`

---

### Task 5: Templates and the draft linter

**Files:**

- Create: `tools/lifecycle/src/campaign/templates.ts` (+ spec), `tools/lifecycle/src/fulfillment/templates.ts` (+ spec), `tools/lifecycle/src/notifications/templates.ts` (+ spec), `tools/lifecycle/src/notifications/install-digest.ts` (+ spec)

**Interfaces:**

- `campaign/templates.ts`: `FOUNDER_BOOKING_URL = 'https://hashbrown.dev/call'`, `APPROVED_CAMPAIGN_LINKS` (Global Constraints), `CampaignStep = 'immediate' | 'day-3' | 'day-8'`, `CampaignDraft = { subject: string; body: string }`, `campaignDraftViolations(candidate: unknown, options?: { maxLinks?: 1 | 2 }): string[]`, `normalizeCampaignDraft(candidate, options?)`, `renderCampaignTemplate(step): CampaignDraft`. Copy: the three texts of design 8.5 verbatim (subjects "Engineer to engineer", "Get your generative UI working", "One last note from the Hashbrown founder"); the body excludes greeting and signature, which the handler adds. `day-8` is rendered with `maxLinks: 2`; the others with `1`.
- `fulfillment/templates.ts`: `renderFulfillmentTemplate({ context: 'unstuck' }): { subject: 'Got your note'; body }` with the design 8.4 acknowledgement text; any other context throws.
- `notifications/templates.ts`: `renderInternalNotificationSummary({ scoreVersion; scoreReasons ≤ 10; submission: { framework; messagePresent: boolean; messageLength }; drafts: exactly 3; founderStopUrl })`. The stop URL must be `https://hashbrown.dev/_/growth/stop?token=g1.<payload>.<43-char sig>` (origin from `GROWTH_PUBLIC_ACTION_ORIGIN`, so preview builds its own). The "Where are you stuck?" text itself is included in the founder notification (design 8.4 says the notify "includes the text") as a quoted block, max 1000 chars, control characters stripped; it never goes anywhere else.
- `notifications/install-digest.ts`: `renderInstallDigest({ businessDate; publicActionOrigin; candidates: 1..200; context })`: one block per identity with email, display name, domain, repository hint, packages (max 20), install count with first/last ISO times, `framework`, `highest milestone`, `score tier`, and "Approve outreach (valid 7 days): https://<origin>/_/growth/approve-install?token=…"; footer with anonymous and CI subject counts.

- [ ] **Step 1: Write the failing tests**

```ts
test('every shipped campaign template passes the linter and immediate carries no link', ...);
test('day-8 carries exactly the booking and threadplane links and is rejected with maxLinks 1', ...);
test('linter rejects surveillance phrasing, a calendar host, utm markup, two question marks, 121 words and an unapproved link', ...);
test('renderFulfillmentTemplate renders Got your note and rejects any other context', ...);
test('internal notification embeds the bounded message, three draft previews and a canonical founder stop URL only', ...);
test('install digest renders framework, highest milestone, score tier and one approve URL per identity under the given origin', ...);
test('no template or subject contains the word tracking', ...);
```

- [ ] **Step 2:** Run `npx nx test lifecycle`. Expected: FAIL.
- [ ] **Step 3:** Implement; port the three regexes verbatim from threadplane.
- [ ] **Step 4:** Run `npx nx test lifecycle && npx nx lint lifecycle`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(lifecycle): founder sequence, acknowledgement, notification and digest templates with the draft linter`

---

### Task 6: Job handlers, runtime configuration, dispatcher, dispatch route

**Files:**

- Create: `tools/lifecycle/src/campaign/send.ts` (+ spec), `tools/lifecycle/src/dispatcher.ts` (+ spec), `tools/lifecycle/src/job-errors.ts`, `tools/lifecycle/src/email-keyring.ts`
- Modify: `tools/lifecycle/src/app/dispatch/index.ts` (replace the stub)
- Test: `tools/lifecycle/src/dispatcher.integration.spec.ts` (runs under `GROWTH_INTEGRATION=1` with `TEST_DATABASE_URL`; add a `test-integration` target mirroring growth's)

**Interfaces:**

- `job-errors.ts`: `class DeterministicLifecycleJobError extends Error`.
- `send.ts`: `STEP_NAMES = { 1: 'immediate', 2: 'day-3', 3: 'day-8' }`, `RETRY_DELAY_MS = 60_000`, `INSTALL_DIGEST_CANDIDATE_LIMIT = 200`, `campaignGreeting(displayName: string | null): string` ("Hey <first>," or "Hey there,"), `prepareCampaignMessage({ context, job, unsubscribeUrl }): { subject; text; html; template: CampaignTemplateId }` (greeting + body + `\n\nBrian`, `renderPlainText`/`renderPlainHtml` from growth), `loadLifecycleRuntimeConfiguration(env): { campaignEnabled; campaignEnrollmentEnabled; installRuntimeHelloEnabled; installDigestEnabled; observationProcessingEnabled; deliveryEnabled; campaignEnrollmentStartAt?: Date }`, `createLifecycleAppJobHandlers(...)` returning handlers for `fulfill`, `send_step`, `notify`, `digest`. `notify` subject `Hashbrown lifecycle review`; `digest` subject `Hashbrown install digest for ${date}: ${n} new identity|identities` to `FOUNDER_NOTIFICATION_EMAIL`. Result mapping as threadplane (accepted → completed; `campaign_disabled | delivery_disabled | outside_send_window | reply_binding_pending` → defer 60 s; `contact_*` → cancel; `mailbox_recovery_required` → recovery_paused; `provider_rejected` → failed; `provider_outcome_unknown` → failed with manual review already recorded by the sender).
- Delivery policy built once per tick from env: `environment = DELIVERY_ENVIRONMENT`, `databaseEnvironment = GROWTH_DATABASE_ENVIRONMENT`, `senderVerified = RESEND_SENDER_VERIFIED === 'true'`, `verifiedDomain = 'hashbrown.dev'`, `configuredSender = RECIPIENT_EMAIL_SENDER`, `providerTrackingDisabled = RESEND_TRACKING_DISABLED === 'true'`, allowlist CSV and redirect.
- `dispatcher.ts`: `dispatchLifecycleJobs({ batchSize; campaignEnabled; campaignEnrollmentEnabled; installRuntimeHelloEnabled; installDigestEnabled; observationProcessingEnabled; campaignEnrollmentStartAt?; signal }, deps): Promise<{ leased; dispatched; recoveryPaused; operatorAlerts }>` with the constants and order in Global Constraints; `LEASED_KINDS = ['fulfill', 'notify', 'send_step', 'reply_reconcile', 'digest']`.
- `app/dispatch/index.ts`: `export async function workflow(current: DispatchState, context: RuntimeContext): Promise<DispatchState>` reading `LIFECYCLE_BATCH_SIZE` (default 20, integer or throw).

- [ ] **Step 1: Write the failing tests**

```ts
test('loadLifecycleRuntimeConfiguration accepts only true/false and requires a canonical start time when enrollment is on', ...);
test('campaignGreeting uses a plain first name and falls back to Hey there', ...);
test('send_step maps every RecipientSendResult to the documented dispatch outcome', ...);
test('notify defers while delivery is disabled and claims at most once', ...);
test('digest completes without sending when no candidates remain and marks reported on acceptance', ...);
test('dispatcher runs reconciliation, projection, hello, enrollment, digest, lease, dispatch in order and projection failure only alerts', ...);
test('dispatcher quarantines a DeterministicLifecycleJobError and continues', ...);
test('dispatcher renews leases every 20 s and aborts the loop when a renewal fails', ...);
test('concurrent dispatches lease each due job once and the loser gets zero jobs', ...); // Review Focus 2, integration
test('workflow returns {...current, result} and rejects a non-integer LIFECYCLE_BATCH_SIZE', ...);
```

- [ ] **Step 2:** Run `npx nx test lifecycle` and `GROWTH_INTEGRATION=1 npx nx test-integration lifecycle`. Expected: FAIL.
- [ ] **Step 3:** Implement, porting threadplane's `dispatcher.ts` and `campaign/send.ts` without the enrich/research branches, the whitepaper attachment, and `draftFor`'s artifact logic (every step is the fixed template).
- [ ] **Step 4:** Run the lifecycle test, integration, lint and check targets. Expected: PASS; `b4 check` still lists one route.
- [ ] **Step 5: Commit** `feat(lifecycle): job handlers, tick dispatcher and the dispatch workflow route`

---

### Task 7: Vercel adapter, build verification, deploy target, env

> Spike result (Task 0), 2026-10-21: **(A)**. Built with `@b4run/*@0.14.0`, `functions/b4.func/index.mjs` default-exports a Hono app (`app.fetch(request, env)`), and its store factory resolves every setting with `const binding = (env, name) => env?.[name] ?? readRuntimeEnv(name);` (`DATABASE_URL`, `B4_PG_SCHEMA`, `B4_PG_TABLE_PREFIX`, `B4_PG_DRIVER`, `B4_PG_WS_PROXY`), where `env` is `c.env ?? {}` from the catch-all `app.all("*", ...)`. Calling `app.fetch(new Request("http://localhost/readyz"), { DATABASE_URL: "postgres://x:y@127.0.0.1:1/z" })` with `process.env.DATABASE_URL` unset failed with `ECONNREFUSED 127.0.0.1:1` (the env-passed host), while calling it with no env failed with "DATABASE_URL is not set". So the adapter passes `{ DATABASE_URL: process.env.B4_DATABASE_URL, B4_PG_SCHEMA, B4_PG_TABLE_PREFIX }` as the second `fetch` argument; no b4run change is needed and the `0.14.0` pins stand. Caveat: provider keys are seeded from the first request's env only (`seedRuntimeEnvOnce`), and the request must reach `app.fetch` directly (not Hono `mount()`).

**Files:**

- Create: `tools/lifecycle/src/vercel-adapter.ts` (+ spec), `tools/lifecycle/scripts/verify-vercel-adapter.mts` (+ spec), `tools/lifecycle/README.md`
- Modify: `tools/lifecycle/project.json` (`build` = `b4-cli.mts build --clean` then `verify-vercel-adapter.mts`; `outputs: ['{projectRoot}/.b4/build', '{projectRoot}/.vercel/output']`), `.github/workflows/pr-main.yml` (`DEPLOY_TARGETS` gains `{"key":"lifecycle","dir":"tools/lifecycle","project_id_secret":"VERCEL_PROJECT_ID_LIFECYCLE","optional":true}`), `tools/vercel/bootstrap.mjs` (lifecycle `env` gains `CAMPAIGN_ENROLLMENT_START_AT` and `LIFECYCLE_BATCH_SIZE`; `GOOGLE_REPLY_HMAC_SECRET` already reaches www, which owns the replies route), `tools/growth/scripts/provision/index.mjs` (`CAMPAIGN_ENROLLMENT_START_AT` left unset with a manual checklist line "set when enabling enrollment; immutable"), `.env.example`, `AGENTS.md` (the `lifecycle` targets)

**Interfaces:**

- `createLifecycleVercelAdapter(b4App: { fetch(request: Request, env: Record<string, string>): Response | Promise<Response> }, deps = { readSecret, readDeploymentId, readStateDatabaseUrl: () => process.env['B4_DATABASE_URL'] }): { fetch(request: Request): Promise<Response> }`. Order: no secret → 503 `{ error: 'service_secret_missing' }`; wrong bearer → 401; no state URL → 503; else, under outcome **(A)**, `b4App.fetch(request, { ...boundEnv, DATABASE_URL: stateUrl })` where `boundEnv` is the b4run runtime env minus the growth `DATABASE_URL`; under outcome **(B)**, `b4App.fetch(request, process.env)` with the b4run release that reads `B4_DATABASE_URL` and a startup assertion that `B4_DATABASE_URL !== DATABASE_URL`. Adds `x-hashbrown-deployment-id` on `/healthz` only, after authentication. `cache-control: no-store` on every adapter response.
- `verify-vercel-adapter.mts`: `finalizeVercelAdapter(appRoot)` asserts `.vercel/output/config.json` routes everything to `/b4`, bundles `lifecycle.mjs` beside the generated `index.mjs` with esbuild (`platform: 'node'`, `target: 'node24'`, ESM, `./index.mjs` external; only `./index.mjs` and `node:crypto` may be imported), rewrites `.vc-config.json` to `{ ...generated, handler: 'lifecycle.mjs', maxDuration: 60 }`, leaves `index.mjs` byte-identical; `verifyVercelAdapter(appRoot)` imports the function in an isolated temp dir with only `PATH`, `LIFECYCLE_SERVICE_SECRET=artifact-check`, `VERCEL_DEPLOYMENT_ID=dpl_check` and asserts 401 on `/healthz`, `/readyz`, `/threads`, `/threads/x/state`, `/memory/candidates` without a bearer, 503 with a bearer and no `B4_DATABASE_URL`.
- Deploy: the generic path in `deploy.yml` already runs `npx nx build lifecycle --configuration=production` and deploys `tools/lifecycle/.vercel/output` prebuilt; the `--configuration=production` flag must be accepted (add an empty `configurations.production` to the `build` target).

- [ ] **Step 1: Write the failing tests**

```ts
test('adapter rejects every unauthenticated path incl. /healthz, /readyz, /threads, /memory/candidates', ...); // Review Focus 5
test('adapter answers 503 without a secret and 503 with a bearer but no B4_DATABASE_URL, never calling b4', ...);
test('adapter binds the state database and never passes the growth DATABASE_URL to b4', ...); // shape depends on (A)/(B)
test('deployment id header appears only on authenticated /healthz', ...);
test('finalizeVercelAdapter rewrites the handler and maxDuration and leaves index.mjs byte-identical', ...);
test('DEPLOY_TARGETS lists lifecycle as optional with the lifecycle project secret', ...); // parse pr-main.yml
test('bootstrap lifecycle env lists CAMPAIGN_ENROLLMENT_START_AT and LIFECYCLE_BATCH_SIZE', ...);
```

- [ ] **Step 2:** Run `npx nx test lifecycle` and `node --test tools/vercel/*.test.mjs tools/growth/scripts/provision/*.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Implement; run `npx nx build lifecycle` and inspect `.vercel/output`.
- [ ] **Step 4:** Run `npx nx build lifecycle && npx nx test lifecycle && npx nx lint lifecycle`; rerun `node tools/vercel/bootstrap.mjs --env-file tools/growth/.provision/growth.env --skip-workflow --skip-token-secrets` so the new keys reach Vercel (`CAMPAIGN_ENROLLMENT_START_AT` stays unset). Expected: PASS; the bootstrap checklist shows the new keys as `updated` or `skipped (unset)`.
- [ ] **Step 5: Commit** `feat(lifecycle): Vercel adapter, artifact verification and deploy target`

---

### Task 8: www routes: cron, approve-install, Google replies, `/call`

**Files:**

- Create: `www/src/lib/growth/lifecycle-client.ts` (+ `www/test/growth/lifecycle-client.spec.ts`), `www/src/app/%5F/cron/lifecycle/route.ts` (+ `www/test/growth/cron-lifecycle.spec.ts`), `www/src/app/%5F/growth/approve-install/route.ts` (+ spec), `www/src/app/%5F/growth/replies/google/route.ts` (+ spec), `www/vercel.json`
- Modify: `www/next.config.ts` (`/call` → `https://calendar.app.google/nK961tWHZd21izKR6`, `permanent: false`), `www/test/redirects.spec.ts`, `www/test/next-config.spec.ts` (the rewrites still skip `/_/cron` and `/_/growth/*`)

**Interfaces:**

- `invokeLifecycle({ baseUrl; serviceSecret; timeoutMs: 250..30000; trigger: 'cron' | 'nudge'; submissionId? }): Promise<{ operatorAlerts: LifecycleOperatorAlert[]; threadId }>`: `POST ${origin}/threads/${randomUUID()}/runs/wait` with `{ route: '/dispatch#workflow', input: { trigger, submission_id? } }`, bearer, `redirect: 'error'`, 64 KiB response cap, exact response shape `{ trigger, result: { leased, dispatched, recoveryPaused, operatorAlerts }, submission_id? }`; `LifecycleOperatorAlert = 'mailbox_recovery_required' | 'observation_projection_failed'` (both accepted, fixing threadplane's 503-on-projection-alert bug). `nudgeLifecycle({ submissionId })` exported for PR 6, 2 s timeout, swallows errors.
- `GET /_/cron/lifecycle`: `Authorization: Bearer ${CRON_SECRET}` constant-time, else 401; `LIFECYCLE_CRON_ENABLED !== 'true'` → 503; missing `LIFECYCLE_URL`/`LIFECYCLE_SERVICE_SECRET` → 503; invoke with 15 s; 200 `{ accepted: true, operator_alerts }` logging each alert as `[lifecycle-operator-alert]`; failure → 503 `{ accepted: false }`. `dynamic = 'force-dynamic'`, `cache-control: no-store`. `www/vercel.json`: `{ "crons": [{ "path": "/_/cron/lifecycle", "schedule": "*/30 * * * *" }] }`.
- `GET|POST /_/growth/approve-install` as threadplane: GET with a valid 7-day `founder_approve_install` token renders the confirmation form (POST-only approval, so prefetchers cannot approve); POST (`application/x-www-form-urlencoded`, ≤ 2048 bytes, exactly one `token` field, no query string) verifies and calls `approveContactFromInstallDigest`; 200 HTML "Outreach approved. They'll be enrolled on the next lifecycle tick." or a generic 400; 503 with `Retry-After: 30` on a database fault. Reuse the HTML helpers from `www/src/app/%5F/growth/stop/route.ts` by moving them to `www/src/app/%5F/_internal/action-page.ts`.
- `POST /_/growth/replies/google` as threadplane with the `x-hashbrown-*` headers and `GOOGLE_REPLY_HMAC_SECRET`; plain-text 200/400/413/503.

- [ ] **Step 1: Write the failing tests**

```ts
test('invokeLifecycle posts route /dispatch#workflow with the bearer and rejects a response of the wrong shape or over 64 KiB', ...);
test('invokeLifecycle accepts both operator alerts', ...);
test('cron route: 401 wrong secret, 503 when disabled or unconfigured, 200 with operator_alerts, 503 on invoke failure', ...);
test('approve-install GET renders a form for a valid token and 400 otherwise; POST approves once, rejects a query string, a second field and an oversize body', ...);
test('replies/google: 400 on bad signature, stale timestamp or schema; 413 oversize; 200 Accepted; 503 on database fault', ...);
test('/call redirects temporarily to the Google Calendar booking page', ...);
test('vercel.json schedules /_/cron/lifecycle every 30 minutes', ...);
```

- [ ] **Step 2:** Run `npx nx test www`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx nx test www && npx nx lint www && npx nx build www`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(www): lifecycle cron, approve-install and reply routes, /call redirect`

---

### Task 9: One announcements catalog for the website pill and the runtime collector

**Files:**

- Create: `www/src/lib/announcements/catalog.ts` (+ `www/test/site/announcements-catalog.spec.ts`)
- Modify: `www/src/components/site/Announcement.tsx` (read the newest live entry; dismissal date = its `publishedAt`; delete `ANNOUNCEMENT_DATE`), `www/src/lib/growth/runtime-announcements.ts` (`catalog` becomes the shared module's runtime projection), existing `Announcement` and `runtime-announcements` specs

**Interfaces:**

- `interface SiteAnnouncement { id: string; text: string; publishedAt: string; expiresAt: string; href: string; runtime?: { packageNames: readonly PackageName[]; minVersion: string; maxVersion?: string; documentationUrl: string } }`; `ANNOUNCEMENTS: readonly SiteAnnouncement[]` with the one current entry (`id: 'v0-7-ag-ui-1-0'`, text "New: Hashbrown v0.7 moves to AG-UI 1.0", `href: '/blog/2026-10-08-hashbrown-v-0-7-0'`, `publishedAt: '2026-10-08T18:00:00Z'`, an expiry Brian picks, default 90 days, no `runtime` block); `currentSiteAnnouncement(now: Date): SiteAnnouncement | undefined`; `runtimeAnnouncementCatalog(): RuntimeAnnouncement[]` projecting only entries with a `runtime` block. `documentationUrl` must satisfy the existing `approvedDocumentationUrl`; `href` must be a site-relative path starting with `/`.

- [ ] **Step 1: Write the failing tests**

```ts
test('currentSiteAnnouncement returns the newest live entry and none when all expired', ...);
test('runtimeAnnouncementCatalog excludes entries without a runtime block and rejects a non-docs documentationUrl', ...);
test('Announcement pill dismissal compares against the entry publishedAt', ...);
test('selectRuntimeAnnouncements reads the shared catalog', ...);
```

- [ ] **Step 2:** Run `npx nx test www`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx nx test www && npx nx lint www && npx nx build www`. Expected: PASS; the pill still renders on the home page in `next dev`.
- [ ] **Step 5: Commit** `feat(www): one announcements catalog for the site pill and runtime collectors`

---

### Task 10: Runbook, spec amendments, control-plane doc updates

**Files:**

- Create: `docs/superpowers/runbooks/2026-10-21-growth-lifecycle-service.md`
- Modify: `docs/superpowers/specs/2026-10-20-growth-lifecycle-design.md` (section 4 row "Enrollment sources" adds the install-runtime hello path; section 8.2 lists three paths with the work-domain rule; section 6.3 "Announcements" notes the shared catalog; section 8.7 digest due time; section 14 item 5 mentions the shared announcements catalog), `docs/superpowers/runbooks/2026-10-21-growth-control-plane.md` ("Not in PR 1" trimmed), `docs/superpowers/runbooks/2026-10-21-growth-observation-intake.md` (the manual `process` step now says "until `LIFECYCLE_CRON_ENABLED=true`"), `.env.example`

**Runbook contents:** what the service is and is not (no model, no cron inside b4run); the two databases and the `B4_DATABASE_URL` binding as decided in Task 0; every env var and switch with its meaning; the tick order; the calendar and send window; the three approval paths and their activity kinds; how to run locally (`npx nx check lifecycle`, `b4 dev` against the test store with `DELIVERY_ENABLED=false`); how to invoke a tick by hand with `curl` against a preview (bearer, `/threads/<uuid>/runs/wait`); preview dogfood procedure (Task 11); operator alerts and what to do; manual steps still open (mailbox, Apps Script poller, Resend webhook secret, `CAMPAIGN_ENROLLMENT_START_AT`); the enable order from section 14 item 7.

- [ ] **Step 1:** Write the runbook and the amendments; `npx nx lint www` (markdown is not linted; run `npx prettier --check` on the changed `.md` files).
- [ ] **Step 2: Commit** `docs(growth): lifecycle service runbook and design amendments`

---

### Task 11: Live verification (preview dogfood)

Needs: a preview deployment of `hashbrown-lifecycle` (label the PR `preview`), the preview growth store, `RESEND_NON_PRODUCTION_ALLOWLIST` and `RESEND_NON_PRODUCTION_REDIRECT_TO` set by Brian to a mailbox he controls, `DELIVERY_ENVIRONMENT=preview`, `GROWTH_DATABASE_ENVIRONMENT=preview`, `LIFECYCLE_URL` on www preview pointing at the lifecycle preview URL. Record every output without identifiers in the PR body.

- [ ] The preview growth store may only receive migrations that are on `main` (control-plane runbook), so the dogfood runs against the test store: in Vercel, add a Preview `DATABASE_URL` on `hashbrown-lifecycle` and on `hashbrown-www` **scoped to this PR's branch** with the `TEST_DATABASE_URL` value (the Neon integration's unscoped preview value stays), redeploy the previews, and remove both branch-scoped values after the dogfood. Apply `0005` to the test store with `migrate-growth` first.
- [ ] `curl -i https://<preview>/healthz` without a bearer → 401; with the bearer → 200 and `x-hashbrown-deployment-id`; `GET /readyz` without bearer → 401.
- [ ] Phase 1, `DELIVERY_ENABLED=false`: insert a fixture contact approved through `form.outreach_approved` (`source_form: 'unstuck'`) with the allowlisted email; set `CAMPAIGN_ENROLLMENT_ENABLED=true`, `CAMPAIGN_ENABLED=true`, `CAMPAIGN_ENROLLMENT_START_AT`; invoke a tick by hand; expected: `campaign.enrolled:v1`, three `send_step` jobs, step 1 `available_at` at the next 07:00 Pacific; a second tick inside the window leases step 1 and defers it with `delivery_disabled` (`attempts = 1`); two concurrent ticks lease once.
- [ ] Phase 2, `DELIVERY_ENABLED=true` with the allowlist: a tick inside the send window (a weekday at 07:xx Pacific; no override flag exists or is added) submits step 1 to Resend; expected: Resend accepts, `delivery_status = submitted`, the webhook flips it to `delivered`, the message arrives at the allowlisted mailbox with `List-Unsubscribe` headers, from `Brian at Hashbrown`, text and HTML parts; step 2 `available_at` moved to +3 business days.
- [ ] Reply to the message from the allowlisted mailbox and post a synthetic `reply` event to `/_/growth/replies/google` signed with the preview `GOOGLE_REPLY_HMAC_SECRET`; expected: `campaign.reply_received` stop, steps 2 and 3 cancelled.
- [ ] Digest: insert a non-CI install observation with a work-domain identity (synthetic domain you control) linked to a runtime session; `GROWTH_INSTALL_DIGEST_ENABLED=true`; tick; expected: one `digest` job due at the next 07:00 Pacific; when due, the digest arrives at the redirected mailbox with one approve link; GET the link → form; POST → approved; next tick enrols with `enrollment_reason = 'install_digest'`.
- [ ] Hello: with `GROWTH_INSTALL_RUNTIME_HELLO_ENABLED=true`, a second synthetic install+runtime pair with a work-domain email is approved and enrolled with `enrollment_reason = 'install_runtime'`; a `gmail.com` pair is `ineligible`.
- [ ] Cron: `GET https://<www preview>/_/cron/lifecycle` with the preview `CRON_SECRET` → 200 `{ accepted: true, operator_alerts: [] }`; without → 401; with `LIFECYCLE_CRON_ENABLED=false` → 503.
- [ ] Clean every fixture row (contacts, jobs, activity, observations, digest reports, install-runtime links, b4run threads via `DELETE /threads/:id` with the bearer); revert the dogfood `DATABASE_URL`; `npx nx run growth:report -- health` shows no leftovers.

---

## Not in this PR

The `npx nx control growth -- status|approve|stop|delete --email` operator command from design section 9 (PR 7, before enabling production; the dogfood uses SQL fixtures). The Get unstuck page and `POST /_/forms/unstuck` (PR 6, which also adds the first announcements entry with a `runtime` block, enqueues `fulfill`/`notify`/`send_step` and calls `nudgeLifecycle`); the Apps Script mailbox poller and its runbook section (after the `brian@hashbrown.dev` mailbox exists); production switches (PR 7); PostHog dashboards for email (none planned; Neon views are the record).
