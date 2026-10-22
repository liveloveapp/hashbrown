# Growth Control Plane (PR 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The `@hashbrownai-internal/growth` library, its schema, and the three www routes that let a contact be approved, emailed once through Resend, stopped by any path, and reported on, with every stop idempotent and every send re-authorized against Neon.

**Architecture:** A TypeScript library under `tools/growth/src/` copied and adapted from threadplane's `libs/growth/src/lib` (reference checkout: `/Users/blove/repos/angular-agent-framework`), with raw SQL over `@neondatabase/serverless`, no ORM, no config schema. Each SQL statement carries a `/* growth:<marker> */` comment so unit tests dispatch on markers through a fake executor; integration specs run the same code against a real Neon database when `GROWTH_INTEGRATION=1`. The campaign calendar, reply binding, observations, scoring, and install paths are *not* ported; where threadplane's code reaches into them, this plan names the injected hook or the removal.

**Tech Stack:** TypeScript (strict), Node 24, `@neondatabase/serverless` 0.10.x, `resend` 6.x (webhook verification uses its bundled svix), Vitest 4 (already in the repo), `tsx` for scripts. Two new root dependencies, both already approved in the design's section 7 and 8; confirm with Brian before `npm install`.

**Spec:** `docs/superpowers/specs/2026-10-20-growth-lifecycle-design.md` §5.1, §7, §8.1, §8.6, §9 (views), §11; the threadplane survey facts are recorded inline per task.

## Global Constraints

- Tests use top-level `test(...)` with arrange, act, assert separated by blank lines (threadplane's `describe`/`it` specs are rewritten, not copied). Every exported function carries TSDoc.
- Copy threadplane's SQL text, markers, lock order (advisory lock, then contact `FOR UPDATE`, then job `FOR UPDATE`), idempotency keys, and error classes verbatim unless a task says otherwise. Rename `X-Threadplane-Job-ID` → `X-Hashbrown-Job-ID`, `threadplane_schema_migrations` → `growth_schema_migrations`, advisory lock strings `threadplane-…` → `hashbrown-…`.
- Sender `Brian at Hashbrown <brian@hashbrown.dev>`; verified domain `hashbrown.dev`; `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` on every recipient mail; Resend tags `environment`, `job_kind`, `campaign_version`, `campaign_step`, `campaign_template`; Resend idempotency key = `growth_jobs.idempotency_key`; the sender throws unless `RESEND_TRACKING_DISABLED=true` and `DELIVERY_ENVIRONMENT === GROWTH_DATABASE_ENVIRONMENT`.
- Stop reasons, exactly: `unsubscribe, complaint, hard_bounce, provider_suppression, invalid_address, manual_suppression, campaign.reply_received, deletion`. Job kinds: `fulfill | notify | send_step | digest | reply_reconcile`. Job status: `pending | leased | completed | failed | cancelled`. Delivery status: `not_submitted | submitted | delivered | bounced | complained | suppressed | failed | unknown`, precedence `not_submitted:-1, unknown:-1, submitted:0, delivered:1, failed:1, bounced:2, suppressed:3, complained:4`.
- Token wire format `g1.<base64url(canonical JSON {c,i,k,n?,p,r?})>.<base64url(HMAC-SHA256)>`, purposes `unsubscribe | founder_stop | founder_approve_install`, 300 s clock skew, founder stop max age 86400 s, approve-install 604800 s, unsubscribe max age 5 years (set in the route).
- Routes live under `www/src/app/%5F/` (served as `/_/…`), are Web `Request`/`Response` handlers exported from a factory with injectable dependencies, create and close a database executor per request, and set `Cache-Control: no-store`.
- No secret reaches a log, an error message, or a response body.
- Run `npx nx build growth`, `npx nx test growth`, `npx nx lint growth`, `npx nx test www`, `npx nx lint www` before the PR. Integration specs run with `GROWTH_INTEGRATION=1 TEST_DATABASE_URL=<preview store url> npx nx test-integration growth` (the URL comes from `vercel env pull` on `hashbrown-www` preview; never commit it).

## Review Focus

1. A stop arriving while a `send_step` is leased and already authorized for submission must not cancel the job silently; it must record `delivery.stop_race_review` and keep the job for settlement (Task 6 test "stop after submission authorization keeps the job and records a race review").
2. A webhook whose `environment` tag differs from `GROWTH_DATABASE_ENVIRONMENT` must be acknowledged with 200 and change nothing (Task 9 route test "mismatched environment returns 200 and writes nothing").
3. A Resend send whose outcome is ambiguous (5xx, 408/409/425/429, idempotency conflict, thrown) must mark the job `unknown` and never be retried blindly (Task 8 test "ambiguous provider outcome marks acceptance unknown").
4. Replaying the same unsubscribe token twice must apply once and return the stored result (Task 6 test "replaying a stop returns the persisted result without new writes").
5. A migration file whose checksum changed after it was applied must abort the run (Task 3 test "changed checksum aborts").

---

### Task 1: Library scaffold, database executor, crypto, keyrings

**Files:**
- Create: `tools/growth/package.json` (`"name": "@hashbrownai-internal/growth", "private": true, "type": "module"`), `tools/growth/tsconfig.json`, `tools/growth/tsconfig.spec.json`, `tools/growth/vitest.config.mts`, `tools/growth/src/index.ts`
- Create: `tools/growth/src/lib/database.ts`, `crypto.ts`, `email-keyring.ts`, `models.ts`
- Test: `tools/growth/src/lib/crypto.spec.ts`, `email-keyring.spec.ts`, `database.spec.ts`
- Modify: `tools/growth/project.json` (add `build`: `tsc --noEmit -p tools/growth/tsconfig.json`; `test`: run both `node --test tools/growth/scripts/**/*.test.mjs` and `vitest run --config tools/growth/vitest.config.mts`; `test-integration`: `vitest run --config tools/growth/vitest.integration.config.mts`), `tsconfig.base.json` (path alias `@hashbrownai-internal/growth` → `tools/growth/src/index.ts`), root `package.json` (add `@neondatabase/serverless` and `resend`, after Brian's OK)

**Interfaces:**
- Produces (verbatim from threadplane `database.ts`): `SqlQueryResult<Row>`, `SqlTransaction { execute<Row>(sql, parameters?) }`, `SqlExecutor extends SqlTransaction { transaction<T>(op): Promise<T>; close?() }`, `createDatabaseExecutor(databaseUrl = process.env.DATABASE_URL): SqlExecutor`, plus `nestedExecutor(tx: SqlTransaction): SqlExecutor` (the wrap-the-transaction pattern threadplane repeats privately in `stops.ts` and `webhooks.ts`, extracted once).
- From `crypto.ts`: `normalizeEmail`, `normalizeRecipientEmail`, `EmailHmacKey`, `EmailHmacKeyring`, `createEmailLookupHmac`, `createEmailLookupCandidates`, `compareEmailLookupHmac`.
- From `email-keyring.ts`: `parseEmailHmacKeyring(env = process.env)` reading `GROWTH_EMAIL_HMAC_ACTIVE_SECRET`, `GROWTH_EMAIL_HMAC_ACTIVE_VERSION`, `GROWTH_EMAIL_HMAC_PREVIOUS_KEYS`.
- From `models.ts`: `GrowthJobStatus`, `GrowthDeliveryStatus`, `GrowthJobKind` (the five kinds), `GrowthContact`, `GrowthProject`, `GrowthActivity`, `GrowthJob`, `GrowthArtifact`.

- [ ] **Step 1: Write the failing tests**

```ts
test('normalizeEmail trims, NFC-normalizes and lowercases', ...);           // 'Jordan@Acme.DEV ' → 'jordan@acme.dev'
test('normalizeEmail rejects whitespace and multiple @', ...);
test('createEmailLookupHmac is base64url sha256 of the normalized email', ...); // assert against node:crypto directly
test('createEmailLookupCandidates lists the active key first and rejects duplicate versions', ...);
test('compareEmailLookupHmac is false for non-canonical digests', ...);
test('parseEmailHmacKeyring requires a 32-byte active secret and unique versions', ...);
test('createDatabaseExecutor throws without a connection string', ...);
test('nestedExecutor runs transaction callbacks on the outer transaction', ...);
```

- [ ] **Step 2: Run to see them fail.** Run: `npx vitest run --config tools/growth/vitest.config.mts`. Expected: FAIL, modules missing.
- [ ] **Step 3: Implement** by copying threadplane's four files, renaming nothing but the package, and adding `nestedExecutor`. Add the Nx targets and the tsconfig alias.
- [ ] **Step 4: Run tests, build, lint.** Run: `npx nx build growth && npx nx test growth && npx nx lint growth`. Expected: PASS (existing provisioning `.mjs` tests still run under the same `test` target).
- [ ] **Step 5: Commit** `feat(growth): library scaffold, database executor, crypto, keyrings`

---

### Task 2: Schema migrations

**Files:**
- Create: `tools/growth/migrations/0001_growth_control_plane.sql`, `tools/growth/migrations/0002_growth_reporting_views.sql`
- Test: `tools/growth/src/lib/migrations.spec.ts` (static assertions on the SQL text)

**Interfaces:**
- Produces the tables `growth_contacts`, `growth_projects`, `growth_activity`, `growth_jobs`, `growth_artifacts` exactly as threadplane's `0002_growth_control_plane.sql`, with these changes: `growth_projects` drops `claim_key_hash`, `claim_consumed_at`, `claim_method` (no claim flow); `growth_jobs.kind` gains `CHECK (kind IN ('fulfill','notify','send_step','digest','reply_reconcile'))`; the `growth_jobs_campaign_predecessor` index stays (PR 5 needs it). Extensions `citext`, `pgcrypto`; trigger `growth_set_updated_at()` on contacts, projects, jobs; all FKs default NO ACTION.
- Views from threadplane's `0003`: `growth_contact_overview_v1`, `growth_funnel_daily_v1`, `growth_campaign_performance_v1`, `growth_job_health_v1`. The `growth_legacy_progress_v1` view is not ported.

- [ ] **Step 1: Write the failing tests** (read the SQL files as text):

```ts
test('control plane migration creates the five tables with NO ACTION foreign keys', ...);
test('jobs table constrains kind, status and delivery_status to the closed lists', ...);
test('projects table has no claim columns', ...);
test('reporting migration defines exactly four views', ...);
```

- [ ] **Step 2: Run to see them fail.** Expected: FAIL, files missing.
- [ ] **Step 3: Write the two SQL files** by copying and editing threadplane's.
- [ ] **Step 4: Run tests.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(growth): control plane schema and reporting views`

---

### Task 3: Migration runner and Nx target

**Files:**
- Create: `tools/growth/scripts/apply-migrations.mts`, `tools/growth/scripts/growth-database-preflight.mts`
- Test: `tools/growth/scripts/apply-migrations.spec.ts` (fake executor), `tools/growth/test/migrations.integration.spec.ts`
- Create: `tools/growth/vitest.integration.config.mts` (throws unless `GROWTH_INTEGRATION=1` and `TEST_DATABASE_URL` set; `fileParallelism: false`; 30 s timeouts; includes `tools/growth/test/**/*.integration.spec.ts`)
- Modify: `tools/growth/project.json` (`migrate-growth`: `node --import tsx tools/growth/scripts/apply-migrations.mts`)

**Interfaces:**
- `applyMigrations({ directory, executor }): Promise<{ applied: string[]; skipped: string[] }>`, `discoverMigrations(directory)`, `defaultMigrationsDirectory()`. Ledger table `growth_schema_migrations (name text primary key, checksum text not null, applied_at timestamptz default now())`; one transaction per file; `pg_advisory_xact_lock(hashtextextended('hashbrown-schema-migrations-v1',0))`; same checksum skips, different checksum throws.
- `validateGrowthDatabaseEnvironment({ mode: 'migration' | 'integration' })`: Node ≥ 24, non-empty `DATABASE_URL` (migration) or `TEST_DATABASE_URL` with `DATABASE_URL` absent (integration); `B4_DATABASE_URL` must be absent in both.

- [ ] **Step 1: Write the failing tests**

```ts
test('discoverMigrations sorts by name and rejects a malformed filename', ...);
test('applyMigrations skips a file whose checksum matches the ledger', ...);
test('changed checksum aborts', ...);                        // Review Focus 5
test('applyMigrations runs each file in its own transaction behind the advisory lock', ...);
// integration:
test('migrations apply twice against Postgres and the second run applies nothing', ...);
```

- [ ] **Step 2: Run to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement** by copying threadplane's `scripts/apply-migrations.mts` and `growth-database-preflight.mts` with the renames.
- [ ] **Step 4: Run unit tests; then run the integration spec against the preview store** (`vercel env pull` on `hashbrown-www` preview into a private file; `GROWTH_INTEGRATION=1 TEST_DATABASE_URL=… npx nx test-integration growth`). Expected: PASS; second run `applied: []`.
- [ ] **Step 5: Commit** `feat(growth): migration runner and migrate-growth target`

---

### Task 4: Activity ledger and contacts

**Files:**
- Create: `tools/growth/src/lib/activity.ts` (the `insertActivityOnce` helper threadplane keeps private in several modules, extracted once with the canonical-JSON replay check and the `Growth activity event key conflict: <key>` error), `tools/growth/src/lib/contacts.ts`
- Test: `tools/growth/src/lib/activity.spec.ts`, `contacts.spec.ts`, `tools/growth/test/contacts.integration.spec.ts`
- Create: `tools/growth/src/lib/testing/fake-executor.ts` (threadplane's marker-dispatch fake: `executorWith(handlers)` returning `{ executor, calls }`, throwing on an unexpected marker; auto-stubs the advisory-lock markers)

**Interfaces:**
- `insertActivityOnce(tx, { eventKey, contactId, projectId, kind, occurredAt, data }): Promise<'inserted' | 'replayed'>`.
- `CONTACT_HARD_STOP_REASONS` (the eight reasons), `findContactIdByEmail(executor, email, keyring)`, `readContactControlState(executor, contactId): { authorization: 'approved'|'stopped'|'deleted'|'unapproved'; canSend }`, `approveContactFromForm(executor, input)` and `approveContactFromFormInTransaction(tx, input)` (per-email advisory lock, keyring rotation coverage check, rekey alias activity, `contact.form_submission` + `form.outreach_approved` activities, approval only when no hard stop), `reauthorizeContact(executor, input)`, `deleteContact(executor, input)` **without** the observation-redaction call and the install paths (those arrive in PR 2 and PR 6; leave a `redactEvidence?: (tx, contactId) => Promise<void>` hook on `DeleteContactInput`, default no-op). `privacyLock(tx, exclusive)` moves into `database.ts` as the advisory lock `hashtextextended('growth-privacy-v1',0)`.

- [ ] **Step 1: Write the failing tests** (rewrite the relevant threadplane `contacts.spec.ts` cases as top-level tests):

```ts
test('insertActivityOnce inserts, and replays an identical event without error', ...);
test('insertActivityOnce throws on a conflicting replay', ...);
test('findContactIdByEmail matches any keyring candidate and throws on two matches', ...);
test('approveContactFromForm serializes on the email lock and sets outreach_approved_at once', ...);
test('approveContactFromForm refuses when a stored key version is not in the keyring', ...);
test('approveContactFromForm rekeys an old digest and records a lookup alias', ...);
test('approveContactFromForm does not approve a contact with a hard stop', ...);
test('reauthorizeContact is blocked by deletion and by a stop after the request time', ...);
test('deleteContact nulls contact fields, cancels jobs, keeps stop and delivery activity', ...);
// integration: approve then delete a contact end to end
```

- [ ] **Step 2: Run to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement** by copying `contacts.ts` (1540 lines) and cutting the imports listed in the survey; every SQL keeps its `/* growth:… */` marker.
- [ ] **Step 4: Run unit tests, then the integration spec.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(growth): activity ledger and contacts`

---

### Task 5: HMAC action tokens

**Files:**
- Create: `tools/growth/src/lib/tokens.ts`
- Test: `tools/growth/src/lib/tokens.spec.ts`

**Interfaces:** verbatim from threadplane: `TOKEN_VERSION = 'g1'`, `FOUNDER_STOP_TOKEN_MAX_AGE_SECONDS = 86400`, `FOUNDER_APPROVE_INSTALL_TOKEN_MAX_AGE_SECONDS = 604800`, `createGrowthActionToken`, `verifyGrowthActionToken` (constant-time, returns `null`), `createUnsubscribeActionUrl` (branded, WeakMap-bound; path `/_/unsubscribe?token=…`), `unsubscribeActionUrlValue`, `unsubscribeActionUrlValueForContact`, `normalizeGrowthPublicActionOrigin`, `growthStopEventKey`, `loadGrowthTokenKeyring(env)` reading `GROWTH_ACTION_TOKEN_ACTIVE_SECRET`, `_ACTIVE_VERSION`, `_PREVIOUS_KEYS`.

- [ ] **Step 1: Write the failing tests**

```ts
test('a token round-trips through create and verify with the expected purpose', ...);
test('verify returns null for a tampered signature, a wrong purpose, an unknown key version, and a future issuedAt beyond 300 s', ...);
test('verify enforces maxAgeSeconds', ...);
test('unsubscribe URLs are bound to their contact', ...);     // unsubscribeActionUrlValueForContact throws on mismatch
test('normalizeGrowthPublicActionOrigin rejects paths, http, and credentials', ...);
test('growthStopEventKey includes the nonce when present', ...);
```

- [ ] **Step 2: Run to see them fail.** — **Step 3: Copy `tokens.ts`** with the `/_/unsubscribe` path. — **Step 4: Run tests.** Expected: PASS. — **Step 5: Commit** `feat(growth): HMAC action tokens`

---

### Task 6: Jobs queue and stops

**Files:**
- Create: `tools/growth/src/lib/jobs.ts`, `tools/growth/src/lib/stops.ts`
- Test: `tools/growth/src/lib/jobs.spec.ts`, `stops.spec.ts`, `tools/growth/test/{jobs,stops,concurrency}.integration.spec.ts`

**Interfaces:**
- `jobs.ts`: `JobLeaseConflictError`, `FinalSendAuthorizationConflictError`, `FinalSendAuthorization`, `enqueueJob(tx, { kind, contactId, availableAt, idempotencyKey, payload }): Promise<{ status: 'inserted' | 'exists'; job }>` (the inline insert-on-conflict threadplane repeats, extracted once; a same-key row with a different kind, contact, or payload throws), `leaseDueJobs(executor, { kinds, now, batchSize ≤ 100, leaseDurationMs, campaignEnabled, isSendWindow })`, `renewJobLease`, `completeLeasedJob`, `failLeasedJob`, `cancelLeasedJob`, `deferLeasedJob`, `authorizeLeasedJobForSubmission(executor, { jobId, leaseToken, now, campaignEnabled, deliveryEnabled, isSendWindow })`, `recordProviderAcceptance`, `markProviderRejection`, `markProviderAcceptanceUnknown`. **Adaptation:** the campaign-calendar predicates (`isCampaignSendWindow`, `businessMorningAfter`) become one injected `isSendWindow: (now: Date) => boolean` (default `() => true`); the form-abuse, mailbox-recovery, and install-runtime predicates in `leaseDueJobs` and the authorization gates are removed (PR 5 adds the calendar; the mailbox guard returns with the poller). Gate order otherwise unchanged: `delivery_disabled`, `campaign_disabled`, `contact_deleted`, approval/stop check for non-fulfill kinds, lease validity (throw), send window.
- `stops.ts` verbatim: `CANONICAL_STOP_REASONS`, `StopProvenanceKind`, `StopContactInput`, `StopContactResult`, `providerSyncActionForStopReason`, `stopContact` (the eight-step transaction, including `delivery.stop_race_review` and the persisted `data.result` replay), `stopLegacyEmailUnsubscribe`.

- [ ] **Step 1: Write the failing tests**

```ts
test('enqueueJob inserts once and returns exists for the same idempotency key', ...);
test('enqueueJob throws when the existing job differs in kind or payload', ...);
test('leaseDueJobs leases only due pending or expired jobs and increments attempts', ...);
test('leaseDueJobs fails expired leases that were already authorized for submission', ...);
test('lease-guarded transitions throw JobLeaseConflictError on a stale token', ...);
test('authorizeLeasedJobForSubmission gates in order and records submission_authorized once', ...);
test('recordProviderAcceptance completes the job and replays idempotently', ...);
test('markProviderAcceptanceUnknown sets unknown and never completes', ...);
test('stopContact cancels pending jobs, clears approval, and persists the result', ...);
test('replaying a stop returns the persisted result without new writes', ...);   // Review Focus 4
test('stop after submission authorization keeps the job and records a race review', ...); // Review Focus 1
test('a stop dated before approval is not effective', ...);
test('providerSyncActionForStopReason suppresses for provider reasons and not for a reply', ...);
test('stopLegacyEmailUnsubscribe is idempotent per approval epoch', ...);
// integration: two executors racing a stop against a lease; stop then acceptance settles the job
```

- [ ] **Step 2: Run to see them fail.** — **Step 3: Copy and cut** per the Interfaces block; keep every marker. — **Step 4: Run unit, then integration.** Expected: PASS. — **Step 5: Commit** `feat(growth): jobs queue and idempotent stops`

---

### Task 7: Resend webhook processing

**Files:**
- Create: `tools/growth/src/lib/webhooks.ts`
- Test: `tools/growth/src/lib/webhooks.spec.ts`

**Interfaces:** `loadGrowthDatabaseEnvironment(env): 'production' | 'preview' | 'test'`, `ResendWebhookPayloadError`, `processVerifiedResendWebhook(executor, { providerEventId, payload }, { databaseEnvironment, stopContact }): Promise<ProcessResendWebhookResult>` with results `applied | replay | ignored_event_type | environment_mismatch | unmatched_job | retryable_unmatched_job`. The event mapping, precedence, strict payload validation, tag corroboration (`job_kind`, campaign tags), and the stop call with event key `resend:<id>:stop` and provenance `{ actor: 'resend', kind: 'provider_webhook', policyVersion: 'growth-lifecycle-v1' }` are verbatim. **Adaptation:** drop `bindProviderMessageId`; `isThreadplaneGrowthSend` becomes `isHashbrownGrowthSend` over the same tag set.

- [ ] **Step 1: Write the failing tests**

```ts
test('each Resend event type maps to its activity kind and delivery status', ...);   // table-driven over the seven types
test('delivery status only moves up the precedence order', ...);
test('a permanent bounce stops the contact with hard_bounce; a transient one does not', ...);
test('complained and suppressed stop with their reasons', ...);
test('environment tag mismatch returns environment_mismatch before any database call', ...);
test('a replayed svix id returns replay', ...);
test('our own tags with no matching job return retryable_unmatched_job', ...);
test('malformed payloads throw ResendWebhookPayloadError', ...);
```

- [ ] **Step 2: Run to see them fail.** — **Step 3: Copy and cut.** — **Step 4: Run tests.** — **Step 5: Commit** `feat(growth): Resend webhook processing`

---

### Task 8: Resend sender and HTML alternative

**Files:**
- Create: `tools/growth/src/lib/resend.ts`, `tools/growth/src/lib/email-html.ts`
- Test: `tools/growth/src/lib/resend.spec.ts`, `email-html.spec.ts`

**Interfaces:**
- `email-html.ts`: `renderPlainHtml({ text, unsubscribeUrl: string, signature: string }): string` (threadplane's `signedHtml` from `apps/lifecycle/src/campaign/send.ts:341`, moved into the library: escape, `\n\n` → `<p>`, `\n` → `<br>`, auto-link bare `https://` URLs, append the signature and `<p>You can unsubscribe <a href="…">here</a>.</p>`), `assertPlainHtml(html, unsubscribeUrl)` (threadplane's `optionalPlainHtml` validator: ≤ 40 KB; only `p`, `br`, `a`; https hrefs; exactly one anchor equal to the unsubscribe URL).
- `resend.ts`: `RECIPIENT_EMAIL_SENDER = 'Brian at Hashbrown <brian@hashbrown.dev>'`, `VERIFIED_DOMAIN = 'hashbrown.dev'`, `classifyResendProviderError`, `DeliveryEnvironment`, `RecipientDeliveryPolicy`, `assertRecipientDeliveryPolicy`, `CAMPAIGN_TEMPLATE_IDS = ['immediate','day-3','day-8']`, `RecipientEmailInput`, `RecipientResendClient`, `sendRecipientEmail(executor, input, policy, deps)` with the header `X-Hashbrown-Job-ID`. **Adaptation:** `reconcilePendingResendMessageIds` and the attachment registry are not ported (no PDFs); `attachments` is removed from the input; the campaign-window recheck becomes the injected `isSendWindow`.

- [ ] **Step 1: Write the failing tests**

```ts
test('renderPlainHtml paragraphs, line breaks, links and the unsubscribe footer', ...);
test('assertPlainHtml rejects images, scripts, styles, event handlers, http links, and a missing unsubscribe anchor', ...);
test('assertRecipientDeliveryPolicy refuses tracking on, unverified sender, wrong domain, and mismatched environments', ...);
test('outside production the recipient is redirected and must be allowlisted', ...);
test('sendRecipientEmail sends with the unsubscribe headers, tags, and the job idempotency key', ...);
test('ambiguous provider outcome marks acceptance unknown', ...);     // Review Focus 3, table over 500, 429, thrown, idempotency conflict
test('a rejected outcome marks rejection with resend_<name>', ...);
test('an unauthorized job is not sent', ...);
```

- [ ] **Step 2: Run to see them fail.** — **Step 3: Copy, move the HTML builder, cut.** — **Step 4: Run tests.** — **Step 5: Commit** `feat(growth): Resend sender with plain HTML alternative`

---

### Task 9: The three www routes

**Files:**
- Create: `www/src/app/%5F/_internal/read-bounded-body.ts`, `www/src/app/%5F/unsubscribe/route.ts`, `www/src/app/%5F/growth/stop/route.ts`, `www/src/app/%5F/webhooks/resend/route.ts`
- Test: `www/test/growth/read-bounded-body.spec.ts`, `unsubscribe-route.spec.ts`, `founder-stop-route.spec.ts`, `resend-webhook-route.spec.ts`
- Modify: `www/tsconfig.json` or `www/next.config.ts` only if the `@hashbrownai-internal/growth` alias needs `transpilePackages`; `www/eslint.config.mjs` for the module-boundary rule if it fires.

**Interfaces:** factories `createUnsubscribeRoute(overrides)`, `createFounderStopRoute(overrides)`, `createResendWebhookRoute(deps)`, each also exporting `GET`/`POST` built with the real dependencies. Behaviour verbatim from the survey's §3 (status codes table for the webhook; one-click and form POST shapes for unsubscribe; 24 h founder stop token; 503 with `Retry-After: 30` on a database fault for unsubscribe; `no-store` everywhere). Webhook verification through `new Resend().webhooks.verify({ payload, headers: { id, timestamp, signature }, webhookSecret })` with the secret from `RESEND_WEBHOOK_SECRET`. The unsubscribe page copy says "Hashbrown"; no other branding.

- [ ] **Step 1: Write the failing tests** (real `Request` objects, `vi.fn` dependencies, top-level `test`):

```ts
test('readBoundedBody returns null over the byte cap and on invalid UTF-8', ...);
test('GET /_/unsubscribe with a valid token renders the confirm form', ...);
test('GET /_/unsubscribe with an invalid token returns 400', ...);
test('POST one-click unsubscribe stops the contact with one_click provenance', ...);
test('POST form unsubscribe stops the contact and returns 200', ...);
test('unsubscribe returns 503 with Retry-After on a database fault', ...);
test('founder stop GET verifies a 24 hour token and POST stops with manual_suppression', ...);
test('webhook rejects missing svix headers with 400 and oversize bodies with 413', ...);
test('webhook returns 503 for retryable_unmatched_job and 200 otherwise', ...);
test('mismatched environment returns 200 and writes nothing', ...);     // Review Focus 2
```

- [ ] **Step 2: Run to see them fail.** Run: `npx nx test www`. — **Step 3: Implement** by copying the three routes and the helper, swapping `NextResponse` for `Response`, paths to `/_/…`. — **Step 4: Run `npx nx test www && npx nx lint www && npx nx build www`.** Expected: PASS. — **Step 5: Commit** `feat(www): unsubscribe, founder stop, and Resend webhook routes`

---

### Task 10: Barrel, docs, verification

**Files:**
- Modify: `tools/growth/src/index.ts` (export everything public from Tasks 1–8), `.env.example` (add the `GROWTH_*`, `RESEND_*`, `DELIVERY_ENVIRONMENT`, `GROWTH_DATABASE_ENVIRONMENT`, `TEST_DATABASE_URL`, `GROWTH_INTEGRATION` keys as comments), `docs/superpowers/runbooks/2026-10-21-growth-control-plane.md` (how to pull the preview connection string, run migrations, run integration specs, and what each switch means), `AGENTS.md` (add the `growth` targets under Packages)

- [ ] **Step 1:** Write the runbook and the example keys.
- [ ] **Step 2:** Run `npx nx build growth && npx nx test growth && npx nx lint growth && npx nx test www && npx nx lint www && npx nx build www`. Expected: all PASS.
- [ ] **Step 3:** Run `npx nx migrate-growth growth` with `DATABASE_URL` set to the preview store, twice; expected second run applies nothing. Then run the integration suite once more. Record both outputs (no URLs) in the PR description.
- [ ] **Step 4: Commit** `docs(growth): control plane runbook and env keys`
