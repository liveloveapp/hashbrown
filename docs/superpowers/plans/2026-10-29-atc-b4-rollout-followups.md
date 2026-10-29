# ATC B4 rollout follow-up implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans, with independent source/manifest/evidence reviews. Each hosted phase remains blocked on its actual access and budget prerequisites.

**Goal:** Prepare and execute the approved bounded preview timeout/restart/rollback qualification, then document the remaining production operating contract without enabling B4.

**Architecture:** Keep the existing import-safe provenance/database guard and canonical-state checks. Add a separate durable aggregate ledger and narrowly scoped operator helpers; all external mutations are restricted to recorded owned preview resources. Frozen runtime source stays a2f92a4; harness and docs commits are separately identified.

**Tech stack:** Existing Node.js ESM, node:test, published B4 0.15.7, existing Postgres/Ajv/Vercel dependencies; no added dependency.

## Task 1 — Record approval and prerequisites

- [ ] Record the human's latest instruction as approval to proceed with the reviewed design and at most 16 additional reservations; retain the former phase ledgers unchanged.
- [ ] Ask for provider-spend ceiling, operating targets and disposable Neon project/branch/compute plus management access. Never print secrets, restart a shared compute, or interpret absent access as authority to create paid infrastructure.
- [ ] Verify #828 actual merged state and Phase A acceptance receipts: exact-source core/OpenAI/ATC server/shared build/test/lint; all86 browser fixtures; complete B4 build; unchanged installedB4versions/rootSRI/lock; full tree paths/types/modes/content comparison. Preserve the independent comment-only equivalence review and identify separate frontend/non-B4 output changes. Carry forward old hosted evidence ONLY with its old source/deployment/raw-hash attribution; no new-hosted-execution claim.
- [ ] Update design status to approved preparation; missing spend/access still blocks corresponding network execution.

## Task 2 — Aggregate controls and immutable timeout variant

**Create:** tools/atc-readiness/rollout-controls.mjs and rollout-controls.test.mjs.

- [ ] Write failing top-level tests for missing explicit spend approval, absent/stale/wrong-scope authoritative usage observations, conservative remaining-spend exhaustion, wrong prior receipt digests/counts, malformed/private-file violations, aggregate 16 cap, phase 6/6/4 caps, duplicate reservation identities, concurrent runs and missing ledger. Failed/inconclusive reservations must remain counted.
- [ ] Add a private stage-bound ledger initialized once with approval source, frozen runtime source and prior 99/10 receipt bindings. Durable writes use exclusive run ownership, private regular files, fsync and fail-closed validation. Do not edit existing ledgers.
- [ ] Require a named authoritative usage source/scope with a current observed spend, freshness limit and a reviewed conservative worst-case incremental reserve including bounded runtime/provider retries before EACH request. Stop before dispatch when the source is unavailable/stale or observation plus outstanding reserves plus next reserve would exceed the approved ceiling. A receipt boolean is not authority; real-source binding must be independently reviewed. Disable automatic harness retries; preserve unavoidable upstream retry observations and never call HTTP count complete billing.
- [ ] Test phase timing: one request at a time, 20-second thread pacing with only one explicit conflict exception per scenario, 55-second request and 20-minute phase deadlines, stop on failure/throttle/deadline and close owned resources.
- [ ] Test and implement a pure timeout-config transformer plus tree-diff verifier. Normal complete output is preserved; fault copy differs only in the existing api/run.func/.vc-config.json maxDuration value from60 to1. Require supported runtime/handler/streaming/cancellation fields to remain unchanged; reject links and additional file/mode/content changes. Always use raw actual hashes in manifests.
- [ ] Run `node --test tools/atc-readiness/*.test.mjs` and `npx eslint tools/atc-readiness/*.mjs`, format and independent source review, then commit.

## Task 3 — Managed timeout protocol

**Create:** tools/atc-readiness/managed-timeout.mjs and managed-timeout.test.mjs.
**Modify:** tools/atc-readiness/README.md with private input schemas, offline/hosted commands, actual classification outcomes, access/spend prerequisites and failed-cleanup recovery.

- [ ] Write failing controlled tests for identity mismatch before database open/fetch, non-platform client timeout, no observed active admission, naturally fast inconclusive response, graceful release classification, expiry/conflict ordering, prefix mutation, first post-EOF nonzero, and cleanup errors.
- [ ] Test and enforce the durable maximum TWO timeout fault dispatches, even if their outcomes fail or are inconclusive; six phase reservations never authorize a third fault.
- [ ] Implement an import-safe injected protocol using the aggregate request control. Separate pure classification/state-machine logic from the real IO adapter. Reuse common context, schema validation, canonical summaries and committed-prefix helpers; do not clone or weaken their checks.
- [ ] Require authenticated exact preview/project/team/raw-tree bindings for normal and fault artifacts. New deployed normal and fault identities need independently reviewed real inspection evidence; old source IDs cannot be relabeled.
- [ ] Implement real HTTP transport preserving response/request IDs, signed cookie, body/schema/4096 cap, pinned stream identities, redirect:error and55s deadline. Establish committed seed before fault attempt; record actual observed active admission and durable input. Vercel platform timeout proof must correlate exact deployment/request ID via supported logs/error; a fetch abort is not proof.
- [ ] If lease remains, check managed409 wholly before database-clock expiry, then success after expiry. If lease releases promptly, classify graceful release separately. Preserve full committed prefixes and one canonical successor; first DB query after successful EOF must be admission snapshot without polling; >=75s full-state snapshot.
- [ ] Run all harness tests/lint, review source independently, commit before hosted use.

## Task 4 — Compute restart and rollback protocols

**Create:** tools/atc-readiness/compute-restart.mjs, compute-restart.test.mjs, rollback-check.mjs, rollback-check.test.mjs.

- [ ] Test provider mutation guards against wrong project/branch/endpoint, shared/production ownership, missing management auth, uncertain repeat mutation and expired total deadline.
- [ ] Implement one supported restart only after committed prefix plus proven active owner/provider identity. Save operation ID, inspect terminal provider state and fresh DB-clock query. Mark reconnect-only or untested assertions honestly when interruption/stale-owner resumption cannot be proven. Use six aggregate reservations and the same canonical/cleanup checks.
- [ ] Test rollback against exact owned alias and independently verified normal OpenAI/B4 artifact identities. Require initial mapping; forbid production domains/aliases, environment-only backend switching, missing restoration or unexpected state writes.
- [ ] Implement four-reservation preview-only rehearsal with fresh visitors, actual route/backend output and absence of B4 writes on OpenAI request. Restore and verify the recorded initial mapping, then remove a test-only alias. Record existing conversation limitations.
- [ ] Run harness tests/lint, review source, commit. Real compute execution remains blocked until independently verified disposable ownership and management access exist.

## Task 5 — Build/provenance and hosted execution

- [ ] Create or reuse a clean isolated exact a2 runtime checkout; install only published registry lockfile packages and build complete normal B4 output. Preserve all raw hashes and copies. Build/verify direct OpenAI output separately and preserve that complete output too.
- [ ] Pull only needed preview credentials into mode0600/mode0700 staging when hosted execution is ready; use credential-redacting wrappers and reject ambient production database fallback.
- [ ] Before each external mutation, inventory exact owned resource IDs/target/initial mappings. Do not create paid compute without approved budget. Inspect real READY normal/fault/OpenAI previews and raw output bindings; independently review manifests.
- [ ] Execute sequentially within aggregate16, phase6/6/4,55s and20-minute bounds, after spend ceiling is approved and conservatively enforceable. Record all failures, retries, inconclusive attempts and cleanup. No automatic new load ramp.
- [ ] Review actual terminal receipts independently; never set true flags from planned or pending operations.

## Task 6 — Operating contract, cleanup and report

- [ ] Capture supplied traffic/SLO/error/provider-spend targets, operational owner, alerting and offline retention schedule. Where missing, draft explicit decision fields rather than claim production readiness.
- [ ] Check production configuration read-only; actual future storage/cookie/TLS/isolation verification requires separate production provisioning authority. Keep B4 production selection unchanged.
- [ ] Remove exact owned fault preview, close requests/pools/children, restore/remove test-only alias, suspend/remove explicitly created disposable compute as recorded. Retain normal previews and audit rows with explicit inventory; verify outcomes rather than assume cleanup.
- [ ] Scan sanitized report/evidence against actual secrets before deleting temporary files; verify absence and preserve originals.
- [ ] Run all affected checks, independent final evidence/scope review, commit and open/attach a follow-up report PR. Do not merge it or enable production without direct authorization.
