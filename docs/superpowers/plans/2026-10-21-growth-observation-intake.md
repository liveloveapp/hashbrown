# Growth Observation Intake (PR 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The server side of observation collection: a public, budgeted, schema-strict intake route; observation storage with replay protection and identity redaction fences; projection into facts; hashbrown's four-milestone funnel with its 30-day activation and 3/7-day stall rules as SQL; and the operator report commands. After this PR a collector (PR 3) has somewhere to send, and Brian can see who stalled.

**Architecture:** Copied and adapted from threadplane's `libs/growth/src/lib/observability/` (reference checkout `/Users/blove/repos/angular-agent-framework`), its `apps/website/src/lib/growth/collection-route.ts`, migrations `0004`–`0005` plus the token-digest column from `0007`, and `scripts/growth-observability.mts`. Everything lands in `tools/growth/src/lib/observability/` with the same SQL markers, locks, and idempotency rules, under the existing `growth` Nx project. The projection runner is a library function plus an operator command in this PR; the cron tick that calls it arrives with the lifecycle service in PR 5.

**Tech Stack:** As PR 1: TypeScript, `@neondatabase/serverless`, Vitest, the marker-dispatching fake executor, integration specs gated on `GROWTH_INTEGRATION=1` + `TEST_DATABASE_URL` (now the dedicated test store from #677). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-20-growth-lifecycle-design.md` §6.1–6.5, §7, §9, §10 (deletion), §11, §14 item 2. PR 1's plan `docs/superpowers/plans/2026-10-21-growth-control-plane.md` describes the library this builds on.

## Global Constraints

- Tests are top-level `test(...)` with arrange, act, assert separated by blank lines; threadplane's `describe`/`it` specs are rewritten. TSDoc on every export. Every SQL string carries a `/* growth:<marker> */` comment. No new dependencies.
- Copy threadplane's SQL, markers, lock order, idempotency keys, error codes, budgets, backoff, and lease rules verbatim unless a task says otherwise. The privacy lock is PR 1's `privacyLock` from `database.ts` (`growth-privacy-v1`), not a second key.
- Sources `website | install | runtime`; subject namespaces `website_session | installation | development_browser`; scopes `persistent | session | memory`; batch ≤ 20 events, body ≤ 65,536 bytes; `occurredAt` within [now − 24 h, now + 5 min]; budgets 1,200/min per source and 120/min per subject in fixed one-minute windows; projection lease 30 s, 5 attempts, backoff 1 m / 5 m / 30 m.
- Hashbrown kinds, exactly: install `package.installed`; runtime `runtime.session_started`, `runtime.first_stream_completed`, `tool.first_call_executed`, `component.first_rendered`; website `website.session_started`, `website.content_viewed`. `MILESTONES` (runtime facts) = the three runtime kinds other than `session_started`. `package.installed` is not a milestone kind; it is the funnel's first stage through the install-token link.
- Property enums: `packageName` ∈ the ten published packages (`@hashbrownai/core`, `react`, `angular`, `openai`, `anthropic`, `azure`, `bedrock`, `google`, `ollama`, `typesafe`); `integration` ∈ `react | angular`; `transport` ∈ `http | local | delegating | custom`; optional `provider` ∈ `openai | anthropic | azure | bedrock | google | ollama | typesafe`; `durationBucket` ∈ `lt_1s | 1s_to_5s | 5s_to_30s | 30s_plus` on `runtime.first_stream_completed` only; website `topic` ∈ `getting_started | concepts | react | angular | platform | reference | blog | other`; `contentId` must exist in the www docs content catalog.
- Funnel rules (§6.5), as SQL: per `development_browser` subject, `started` = first `runtime.session_started` fact; `activated` = facts for all three milestone kinds with `active_day` ≤ started + 30 days; `stalled_after_hello_world` = a `runtime.first_stream_completed` fact, no tool or component fact within 7 days of it, and now > that day + 7; per `installation` subject, `stalled_before_first_request` = a non-CI `package.installed` observation whose `installation_token_digest` matches no runtime observation within 3 days, and now > install day + 3.
- No raw install token, Git email, or connection string reaches a log, error, response, or committed file. Identity is accepted only on the `install` source, stored once in `growth_observation_identities`, and HMAC-linked to contacts with PR 1's keyring.
- Run `npx nx build growth && npx nx test growth && npx nx lint growth && npx nx test www && npx nx lint www && npx nx build www` before the PR; integration specs via `GROWTH_INTEGRATION=1 npx nx test-integration growth` against the dedicated test store; `npx nx migrate-growth growth` applied twice to the test store, second run applying nothing.

## Review Focus

1. A replayed batch whose public digest differs from the stored event must roll the whole batch back with `event_conflict` (Task 3 test "a conflicting replay rolls back the batch").
2. A redacted email must fence every future install carrying that Git email, even with a rotated key version (Task 5 test "a fence written under the previous key suppresses an install signed with the active key").
3. The route must charge the source budget before reading the body, so malformed traffic still costs (Task 7 test "invalid JSON still consumes the source budget").
4. A subject that reached all three milestones on day 31 is not activated, and one that reached them on day 30 is (Task 6 test "activation window is inclusive of day 30 and excludes day 31").
5. Two workers claiming the same observation must produce exactly one fact (Task 4 integration test "concurrent processing yields one fact per observation").

---

### Task 1: Contracts, canonical digests, admission budgets

**Files:**
- Create: `tools/growth/src/lib/observability/contracts.ts`, `canonical.ts`, `admission.ts`
- Test: `contracts.spec.ts`, `canonical.spec.ts`, `admission.spec.ts`
- Modify: `tools/growth/src/index.ts` (export the three modules)

**Interfaces:**
- From `contracts.ts` (threadplane `contracts.ts`, 357 lines, with hashbrown kinds and enums): `COLLECTION_SOURCES`, `CollectionSource`, `ObservationSource`, `SubjectNamespace`, `IdentityScope`, `ObservationIdentity`, `CollectionEventV1`, `CollectionBatchV1`, `CollectionAcknowledgment`, `ObservationError` (with `code`), `MILESTONES` (the three runtime milestone kinds), `INSTALL_KIND = 'package.installed'`, `PACKAGE_NAMES`, `INTEGRATIONS`, `TRANSPORTS`, `PROVIDERS`, `WEBSITE_TOPICS`, `MAX_BATCH_EVENTS = 20`, `MAX_BODY_BYTES = 65536`, `parseCollectionBatch(source, value, receivedAt)`, `collectionSource(value)`, `uuid(value)`. Closed objects, control-character rejection, UUID v4 ids, strict namespace-per-source, `installationToken` forbidden for website, `identity` allowed only for install, the install cross-field CI rules, runtime `sessionId` required, `durationBucket` only on `first_stream_completed`, website campaign/referrer rules, identity normalization through `normalizeEmail`. Runtime properties: `packageName`, `packageVersion`, `integration`, `transport`, optional `provider`. Install properties as threadplane plus `packageName` from `PACKAGE_NAMES`.
- From `canonical.ts`: `canonicalJson` (reuse PR 1's `activity.ts` export rather than a copy), `publicDigest(value): string` (sha256 hex), `identityDigest(identity, keyring): { digest; keyVersion }` (HMAC with domain tag `growth-observation-identity-v1\0`).
- From `admission.ts`: `consumeSourceBudget(db, source, now)`, `consumeSubjectBudgets(db, source, events, now)` with the upsert on `growth_collection_budgets`, sorted bucket keys, fail-closed `admission_unavailable`.

- [ ] **Step 1: Write the failing tests** (rewrite threadplane's `contracts.spec.ts` cases as top-level tests, plus hashbrown-specific ones):

```ts
test('accepts a valid install event and rejects unknown keys, trust fields, and bad UUIDs', ...);
test('rejects occurredAt outside the 24h/5min window and impossible dates', ...);
test('namespace must match the source path', ...);
test('install requires environment/evidence consistency and allows identity', ...);
test('runtime requires sessionId, accepts the four runtime kinds, and allows durationBucket only on first_stream_completed', ...);
test('runtime rejects packageName, integration, transport, or provider outside the enums', ...);
test('website rejects identity and installationToken and validates topic and campaign fields', ...);
test('batch rejects more than 20 events and duplicate eventIds', ...);
test('publicDigest is stable across key order; identityDigest uses the active key and fails closed without one', ...);
test('consumeSubjectBudgets charges every bucket even when denying and returns the next-minute retryAfterSec', ...);
test('admission fails closed on a storage error', ...);
```

- [ ] **Step 2: Run to see them fail.** Run: `npx vitest run --config tools/growth/vitest.config.mts tools/growth/src/lib/observability`. Expected: FAIL.
- [ ] **Step 3: Implement** by copying and editing the three threadplane files.
- [ ] **Step 4: Run `npx nx build growth && npx nx test growth && npx nx lint growth`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(growth): observation contracts, digests, and admission budgets`

---

### Task 2: Observability schema

**Files:**
- Create: `tools/growth/migrations/0003_growth_observability.sql`, `tools/growth/migrations/0004_growth_observability_views.sql`
- Modify: `tools/growth/src/lib/migrations.spec.ts` (static assertions), `tools/growth/test/migrations.integration.spec.ts` (the pinned table and view set)

**Interfaces:**
- `0003` = threadplane `0004` with: the `milestone_kind` CHECK over hashbrown's three runtime milestones; `source` CHECK `website | install | runtime` (no `form` yet; PR 6 widens it); `growth_observations.installation_token_digest text CHECK (hex64)` with its partial index `(installation_token_digest, source)` (from threadplane `0007`); an added index `growth_observation_facts (subject_id, milestone_kind)`; tables `growth_observation_subjects`, `growth_observations`, `growth_observation_identities`, `growth_observation_redactions`, `growth_observation_work`, `growth_observation_facts`, `growth_collection_budgets`, `growth_observation_operations`. The trust CHECK is `client_reported` only.
- `0004` = threadplane `0005`'s three views (`growth_observation_source_health_v1`, `growth_observation_subject_overview_v1`, `growth_observation_work_health_v1`) plus two hashbrown views:
  - `growth_observation_runtime_funnel_v1`: one row per `development_browser` subject: `subject_id`, `started_day`, `streamed_day`, `tool_day`, `component_day`, `activated boolean`, `stalled_after_hello_world boolean`, computed by the Global Constraints rules with `current_date` as "now".
  - `growth_observation_install_funnel_v1`: one row per non-CI `package.installed` observation: `observation_id`, `subject_id`, `package_name`, `installed_day`, `first_runtime_day` (via `installation_token_digest` join to runtime observations), `stalled_before_first_request boolean`.
  - `growth_observation_funnel_daily_v1`: per day, counts `installed`, `started`, `streamed`, `tool_used`, `component_rendered`, `activated`, `stalled_before_first_request`, `stalled_after_hello_world` derived from the two views above by their first-day columns.

- [ ] **Step 1: Write the failing tests**

```ts
test('observability migration creates the eight tables with CASCADE only on observation children', ...);
test('milestone_kind is constrained to the three runtime milestones and source has no form', ...);
test('observations carry installation_token_digest with a hex64 check', ...);
test('views migration defines exactly six views', ...);
// integration: the pinned set now includes the eight tables and six views
```

- [ ] **Step 2–5:** fail, write SQL, pass (`npx nx test growth`, then the integration migrations spec against the test store), commit `feat(growth): observability schema and funnel views`

---

### Task 3: Ingest and the privacy store

**Files:**
- Create: `tools/growth/src/lib/observability/store.ts` (`assertIdentityKeyCoverage(tx, keyring)` only; the lock comes from `database.ts`), `ingest.ts`
- Test: `ingest.spec.ts`, `tools/growth/test/observability-ingest.integration.spec.ts`, `tools/growth/test/observability-fixtures.ts` (threadplane's `evidenceKeys`, `evidenceFixture`, `cleanEvidence`)

**Interfaces:** `acceptObservationBatch(db, source, input: unknown, { now, keyring? }): Promise<CollectionAcknowledgment>` verbatim: shared privacy lock, identity key coverage when identities are present, subjects inserted in sorted order and locked `for update`, events in sorted `eventId` order, suppression check against `growth_observation_redactions` by subject fence and by every email HMAC candidate, `on conflict (source, event_id) do nothing`, replay comparison on public and identity digests throwing `event_conflict`, identity row insert under the active key, `installation_token_digest = publicDigest({ installationToken })`, subject first/last update, work row insert, dispositions in batch order.

- [ ] **Step 1: Write the failing tests**

```ts
test('accepts a multi-subject batch, inserts subjects and events in sorted order, and queues work', ...);
test('a duplicate event returns duplicate and does not refresh the subject', ...);
test('a conflicting replay rolls back the batch', ...);                   // Review Focus 1
test('an install with identity stores the identity under the active key and digests the token', ...);
test('a fenced subject or email is stored redacted without identity', ...);
test('identity without a keyring throws identity_key_unavailable', ...);
// integration: opposing-order batches do not deadlock; concurrent retries dedupe; conflict rolls back
```

- [ ] **Step 2–5:** fail, copy and cut, pass (unit, then integration), commit `feat(growth): observation ingest with replay protection and redaction fences`

---

### Task 4: Projection, work leasing, replay

**Files:**
- Create: `tools/growth/src/lib/observability/projection.ts`, `replay.ts`
- Test: `projection.spec.ts`, `replay.spec.ts`, `tools/growth/test/observability-projection.integration.spec.ts`

**Interfaces:** `PROJECTION_VERSION = 'observation-facts-v1'`, `ObservationLease`, `leaseObservationWork(db, { now, limit })`, `projectObservation(db, lease, { now })`, `processObservations(db, { enabled, limit, now }): { completed, leaseLost, retryScheduled, failed, disabled }`, `replayObservations(db, selector, now)`. Verbatim: the claim CTE with exhaustion to `failed`, `for update skip locked`, 30 s lease, `active_day = date(least(occurred_at, received_at))`, `milestone_kind` by membership in `MILESTONES`, the fact upsert, the fenced settle, 1 m / 5 m / 30 m backoff, budget garbage collection, operation-ledgered replay with `selection_overflow` and `operation_conflict`.

- [ ] **Step 1: Write the failing tests**

```ts
test('leaseObservationWork fails exhausted items and claims due ones with skip locked', ...);
test('projectObservation writes active_day and milestone_kind and settles under the lease', ...);
test('a lost lease rolls back the fact', ...);
test('failures back off 1m, 5m, 30m then fail after five attempts', ...);
test('replay bumps generations, resets work, deletes facts, and is idempotent by operation id', ...);
// integration: concurrent processing yields one fact per observation (Review Focus 5); expired-lease recovery; old worker fenced after replay
```

- [ ] **Step 2–5:** fail, copy, pass, commit `feat(growth): observation projection, leasing, and replay`

---

### Task 5: Redaction and the contact-deletion hook

**Files:**
- Create: `tools/growth/src/lib/observability/redaction.ts`
- Modify: `tools/growth/src/lib/contacts.ts` (`deleteContact` default `redactEvidence` becomes `redactContactObservationEvidence`), `tools/growth/src/lib/contacts.spec.ts`
- Test: `redaction.spec.ts`, `tools/growth/test/observability-redaction.integration.spec.ts`

**Interfaces:** `redactObservationEvidence(db, { subjectId } | { email }, { operationId, now, keyring }): { selectedCount }`, `redactContactObservationEvidence(tx, contactId, occurredAt)`, `initializeObservationRedactions(db, { limit, cursor? }, now): { processed, nextCursor }`. Verbatim except: no install-runtime enrichment job scrub (that job kind does not exist here) and no `growth_observation_form_links` join (PR 6 adds it). Exclusive privacy lock, fences for subject and every email HMAC candidate, identity rows deleted, `identity_digest` nulled, facts deleted, work regenerated so the observation re-projects anonymously.

- [ ] **Step 1: Write the failing tests**

```ts
test('redacting by email fences every candidate key version and scrubs identity', ...);
test('a fence written under the previous key suppresses an install signed with the active key', ...); // Review Focus 2
test('redaction is idempotent by operation id and conflicts on a different selection', ...);
test('deleteContact runs the observation redaction inside its transaction', ...);
test('initializeObservationRedactions backfills fences for deleted contacts with a cursor', ...);
// integration: subject redaction fences future installs; leased work is fenced; deletion hook end to end
```

- [ ] **Step 2–5:** fail, copy and cut, pass, commit `feat(growth): observation redaction and the contact deletion hook`

---

### Task 6: Queries, funnel, and journey report

**Files:**
- Create: `tools/growth/src/lib/observability/queries.ts`, `journey-report.ts`
- Test: `queries.spec.ts`, `journey-report.spec.ts`, `tools/growth/test/observability-funnel.integration.spec.ts`

**Interfaces:** `readTimeline(db, subjectId, { limit ≤ 100, cursor? })` (keyset, base64url cursor ≤ 300), `readObservationIdentity(db, observationId)`, `readObservationHealth(db, { from, to ≤ 31 d })` (activity by source/kind/collector/environment, `growth_observation_work_health_v1`, `ingressFailures: 'service_logs'`), `readGrowthFunnel(db, { from, to ≤ 31 d })` returning `{ independentSignals, observationProcessing, runtimeFunnel, installFunnel, daily, unavailable }` where the last three read the hashbrown views, and `readContactJourney(db, contactId)` limited to what PR 1 stores (contact, activity, jobs) plus linked observations by email HMAC. No install-runtime activation decisions and no campaign cohort (later PRs).

- [ ] **Step 1: Write the failing tests**

```ts
test('readTimeline paginates by (received_at, id) and rejects a cursor over 300 chars', ...);
test('readObservationHealth and readGrowthFunnel reject ranges over 31 days', ...);
test('readGrowthFunnel reads the runtime, install, and daily funnel views', ...);
test('readContactJourney scrubs URLs and reports a deleted contact as deleted', ...);
// integration: activation window is inclusive of day 30 and excludes day 31 (Review Focus 4);
//              a streamed-only subject becomes stalled_after_hello_world on day 8;
//              a non-CI install with no runtime within 3 days is stalled_before_first_request, a CI install is not
```

- [ ] **Step 2–5:** fail, copy and adapt (the funnel SQL is new; write it against the views), pass, commit `feat(growth): observation queries and the milestone funnel report`

---

### Task 7: The collection route

**Files:**
- Create: `www/src/lib/growth/collection-route.ts`, `www/src/lib/growth/website-content.ts` (`isKnownWebsiteContent(contentId)` built from the docs content catalog `www/src/lib/...` that the search index already walks), `www/src/lib/growth/runtime-announcements.ts` (the version-gated catalog, empty in this PR), `www/src/app/%5F/growth/collect/v1/[source]/route.ts`
- Test: `www/test/growth/collection-route.spec.ts`, `website-content.spec.ts`, `runtime-announcements.spec.ts`

**Interfaces:** `createCollectionRoute(deps)` with `{ environment, createDatabase, loadKeyring, now, sourceBudget, subjectBudgets, accept, validateWebsite, runtimeAnnouncements, log }`; `defaultCollectionRouteDependencies()`; route exports `POST` and `OPTIONS` with `runtime = 'nodejs'`. Verbatim flow and status table: 404 unknown source; 204 preflight with `Access-Control-Allow-Origin: *`; 405 non-POST; `GROWTH_COLLECTION_SOURCES` gating with 503 + `Retry-After: 60`; source budget charged before the body; 429 with `Retry-After`; 415; `readBoundedBody` 65,536 under a 3 s abort → 413; 400 bad JSON; `parseCollectionBatch`; website content validation; subject budgets; `accept`; 200 acknowledgment (runtime adds `announcements`); 409 `event_conflict`; 400 invalid payload; 503 + `Retry-After: 30` otherwise; `{ error: code }` bodies; one structured log line with counts and latency, never values; `db.close()` in `finally`.

- [ ] **Step 1: Write the failing tests**

```ts
test('preflight returns 204 with CORS headers and touches no database', ...);
test('a source not in GROWTH_COLLECTION_SOURCES returns 503 with Retry-After 60', ...);
test('invalid JSON still consumes the source budget', ...);                 // Review Focus 3
test('oversize and stalled bodies return 413', ...);
test('website events with an unknown contentId are rejected', ...);
test('a runtime acknowledgment carries announcements after the commit and tolerates a catalog failure', ...);
test('event_conflict maps to 409 and storage errors to 503 with no detail', ...);
test('website traffic is accepted without a keyring; install identity loads it', ...);
```

- [ ] **Step 2–5:** fail, copy and adapt, pass (`npx nx test www && npx nx lint www && npx nx build www`), commit `feat(www): observation collection route`

---

### Task 8: Operator commands, env, docs

**Files:**
- Create: `tools/growth/scripts/growth-observability.mts`, `tools/growth/scripts/growth-observability.spec.ts`
- Modify: `tools/growth/project.json` (targets `report`: `funnel | journey | health | timeline | detail`; `observability`: `process | replay | redact | initialize-redactions`, both `node --import tsx tools/growth/scripts/growth-observability.mts <command>`), `.env.example` (`GROWTH_COLLECTION_SOURCES`, `GROWTH_OBSERVATION_PROCESSING_ENABLED`), `AGENTS.md` (the two targets), `docs/superpowers/runbooks/2026-10-21-growth-control-plane.md` → extend, or create `docs/superpowers/runbooks/2026-10-21-growth-observation-intake.md` (the route contract, the switches, how to run projection by hand until PR 5's cron, the funnel definitions in words, redaction and replay procedures, the `--include-identity` acknowledgment)

**Interfaces:** `runGrowthObservability(argv, deps): Promise<0 | 1 | 2>` with threadplane's strict flag parsing, one JSON line on stdout, error codes only on stderr, `process` printing `{ disabled: true }` unless `GROWTH_OBSERVATION_PROCESSING_ENABLED === 'true'`, email for `redact` read from stdin only.

- [ ] **Step 1: Write the failing tests**

```ts
test('rejects unknown flags and duplicate flags with exit 2', ...);
test('process is disabled unless the switch is exactly true', ...);
test('redact reads the email from stdin and never echoes it', ...);
test('a storage failure prints operation_failed and closes the executor', ...);
```

- [ ] **Step 2–5:** fail, copy and adapt, pass, write the docs, commit `feat(growth): observability operator commands and docs`

---

### Task 9: Verification

- [ ] Run `npx nx build growth && npx nx test growth && npx nx lint growth && npx nx test www && npx nx lint www && npx nx build www`. Expected: PASS.
- [ ] Apply migrations to the test store twice via `npx nx migrate-growth growth` with `DATABASE_URL` from `tools/growth/.provision/test-database.env`; expected second run applies nothing. Run the integration suite; expected PASS and zero rows left.
- [ ] Post a synthetic batch to the route from a local `next dev` (`GROWTH_COLLECTION_SOURCES=website,install,runtime`, `DATABASE_URL` = test store) for each source, run `npx nx observability growth -- process --limit 20`, then `npx nx report growth -- funnel --from … --to …`; expected the three subjects appear with their milestone days. Record outputs in the PR without identifiers.
