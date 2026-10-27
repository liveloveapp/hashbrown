# Native .NET mixed-tool sessions implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship authenticated, PostgreSQL-owned native MAF mixed-tool turns with strict browser-history ownership, invocation fences and durable terminal publication.

**Architecture:** Keep MAF's native tool loop and opaque session serialization. Compose a storage journal, native `AgentSessionStore` adapter, request lease, function middleware, one bounded public-history projection and genuine-terminal publication gate. Keep the stateless/application-confirmation path unchanged. Follow the approved [specification](../specs/2026-10-26-dotnet-native-tools-design.md); native approvals are the next separate milestone.

**Tech Stack:** Existing pinned .NET 10/MAF/AGUI/OpenAI/Azure.Core/Npgsql packages, PostgreSQL 18, Nx/Jest/Playwright, published SDK 0.8.3. No dependencies or version updates.

## Execution controls

- Use `/private/tmp/hashbrown-native-tools-8Gn7E86N/env.sh` for the installed SDK, fixture-only PostgreSQL and serialized Nx flags. Do not read credentials or run real providers in implementation agents.
- Exactly one owner runs the repository Nx graph at a time. Independent file work may overlap only after shared contracts land. Root owns integration, actual live model calls, PRs and green merges.
- Tests use top-level `test(...)`, arrange/act/assert, genuine native clients and strict aimock. C# public APIs receive XML docs; TypeScript reusable APIs receive TSDoc. Keep per-file `MAAI001` experimental pragmas justified.
- No private StateBag key access, synthetic tool/model events, SDK replay-guard relaxation, automatic unknown-effect replay, source aliases in published consumers or release work.

## Task 1: Storage contracts, canonical admission and PostgreSQL journal

**Create:** `Integration/NativeSessionContracts.cs`, `NativeToolCatalog.cs`, `NativeSessionHistory.cs`, `PostgresNativeSessionJournal.cs`, `PostgresNativeSessionInvocations.cs`, `PostgresNativeSessionOperations.cs`, `PostgresNativeSessionMaintenance.cs`; `tests/native-session-store.spec.ts`, `tests/fixtures/native-session-store.cs.txt` and a minimal native probe helper following existing fixture compilation patterns.

The contract must separate storage POCOs from the MAF adapter. Use an immutable `NativeSessionKey` (stable agent, trusted scope, selector, full partitions), options/limits, owned request token/generation/revision, a saved-publication receipt and cloned model-emitted call descriptors. The journal API must cover initialization, acquisition/read, model-call capture, start/complete invocation, lease renewal, atomic native/public snapshot save, publication authorization/finalization, bounded failure cleanup, scoped inspection/reconciliation, retirement and maintenance. Status codes distinguish bad input, missing/retired state, conflict and storage unavailability. Model/catalog compatibility is stored beside the selector rather than hidden in a changed lookup key.

- [ ] Write a real PostgreSQL probe test that creates an owner, records a model-emitted call, commits `Started`, completes it and rejects duplicate dispatch/stale save. Run `npx nx test dotnet-conformance --testPathPatterns=native-session-store --output-style=static`; confirm meaningful red before implementing the contracts/journal.
- [ ] Implement validated immutable contracts and canonical argument/config comparison. Initial input rejects imported tool/approval history. Existing sessions accept only an exact owned prefix plus expected browser results or a new user turn after completion. Do not trust client-replayed server calls. Preserve every native key partition; reject missing trusted scope/configuration and inconsistent keys.
- [ ] Initialize additive native schema version 1 under an advisory lock, preserving all existing schema-3 tables and rows. Reject future versions. Use parameterized SQL, validated schema identifiers and database time after row locking. Transactions never span application/model/streaming work.
- [ ] Implement owner CAS/lease transitions, model descriptor capture, durable per-call `Started` before dispatch and completion metadata. Existing call IDs, changed descriptors and stale generations cannot execute. Ambiguity is retained; no cached-result retry or replay is added.
- [ ] Save opaque native JSON, one canonical public prefix, pending IDs/descriptors and compatibility atomically. Save keeps ownership. Authorize publication for the saved receipt; retain `Publishing` until bounded write finalization. Expired publication cannot be automatically taken over.
- [ ] Add separate scoped operator inspection/reconciliation with audit, expected state/generation/revision, bounded evidence and explicit quiescence. Reconciliation/retirement invalidates outstanding authority and never executes. Expiry/delete retain a selector tombstone even for sessions without effects. Bound payload and selector capacities; do not delete unknown fences.
- [ ] Add table-driven tests for independent scopes/agents/partitions, conflicting/missing config, simultaneous creates/claims, pre-effect takeover, stale callbacks, renewal loss, corruption/size limits, schema compatibility, tombstones after cleanup, capacity and all publication states. Use deterministic gates/SQL expiry controls rather than guessed sleeps.
- [ ] Run focused tests, `npx nx build dotnet-conformance`, `npx nx lint dotnet-conformance`. Request spec then quality review; fix findings and commit owned files.

## Task 2: Native agent composition, endpoint admission and publication

**Create:** `Integration/NativeSessionContext.cs`, `NativeMafSessionStore.cs`, `NativeSessionAgentFactory.cs`, `NativeSessionEndpointConfiguration.cs`, `NativeSessionTerminalResult.cs`, `NativeSessionProjection.cs`; modify `Integration/HashbrownRequestClient.cs` only for capability-gated mixed-tool handling. Add `tests/native-session-host.spec.ts` and its native probe fixture.

- [ ] Write failing actual pinned `MapAGUIServer` loopback tests: the native host exposes its terminal while save is gated; the mixed stateless path rejects; full browser history duplicates under default MAF storage. Assert the new composition must prevent each issue before implementation.
- [ ] Implement the `AgentSessionStore` adapter using only public `SerializeSessionAsync`/`DeserializeSessionAsync`, returning independent instances. Bind the active request to its complete key/session instance; never fall back to fresh state for a continuation whose blob is missing/invalid/retired.
- [ ] Register a trusted `AgentIsolationKeyProvider` using the existing abstract hosting API/IHttpContextAccessor, plus keyed store by stable agent name. Require a named authorization policy and explicit server scope resolver on native routes. Validate body/config/tool disjointness and acquire ownership before model/function work. Keep the existing anonymous fixture/stateless behavior separate.
- [ ] Compose native bypass and public empty MAF history filters atomically. Capture actual native model-emitted function descriptors before yielding them to bypass; gate invocation through the public `AIAgent.AsBuilder().Use` function callback. Call native `next` only after the durable marker succeeds. Keep caller/tool authorization application-owned and documented.
- [ ] Add one bounded canonical projection from admitted input plus genuine events. Match SDK canonical IDs/fallback and native supplied identities. Share existing framing/folding primitives where safe while preserving checkpoint behavior; do not create a second MAF transcript provider. Unrepresentable output blocks further continuation instead of accepting browser reconstruction.
- [ ] Implement a terminal-buffering `IResult`/body wrapper: intercept and retain terminal bytes without awaiting save inside the write, let upstream save finish, authorize the saved revision, write the genuine terminal and finalize publication. Own/await lease renewal and cleanup; retain post-dispatch/publication uncertainty. No synthetic success/error/model/tool events.
- [ ] Test after-save/before-authorization retirement/takeover, reserved-publication competitor waiting, failed save, cancellation, ownership loss, late result/save, malformed/split UTF-8 frames, native errors and unknown metadata. Verify no SDK browser callback or server effect before durable publication where relevant.
- [ ] Known native approval requests remain explicitly unsupported in this first composition until the second milestone's bridge is added; never publish a falsely resumable approval or remove the stateless rejection globally.
- [ ] Run focused host/store tests, full native tests, build/lint. Request independent spec/quality review, then commit.

## Task 3: Real HTTP fixtures, effect observations and browser matrix

**Modify:** `Program.cs`, `Testing/FixtureTools.cs`; add isolated native fixture controls/barriers in `Testing/`; extend `harness/http-fixture.ts`, `durable-fixture.ts`, `browser-fixture.ts` only as necessary. Create `tests/native-session-durability.spec.ts`, `specs/native-sessions.spec.ts`; extend `specs/native-wire.spec.ts` for exact histories.

- [ ] Add failing same-turn browser-first/server-first cases for both APIs/providers using strict aimock. Enable native mode through an explicit fixture option, authenticated `alice` requests and real PostgreSQL. Preserve existing stateless rejection tests and the original 360-case baseline.
- [ ] Wire the native composition in a dedicated fixture mode with its own session schema/journal and registered tool versions. Observe real backend execution in PostgreSQL; fixture counters alone cannot prove cross-process effects. Never expose fixture headers/control endpoints in the production recipe.
- [ ] Add barriers before pending save/publication, before marker, after marker before invocation, after effect before completion/save, and after saved revision before publication. Add deterministic expiry/storage outage controls. Bound/clean owned processes and random schemas.
- [ ] Exercise process restart with the browser alive, other-instance callback, competing same-principal requests, cross-principal/session/config forgery, cancellation and a fresh thread. Reload never automatically reruns historical/browser calls; show bounded owned status/unavailable state when client results are missing.
- [ ] Browser assertions: one browser execution, one server effect, one native call/result per ID, correct ordering and subsequent turns without replay. Cover multiple siblings and both sibling orderings on React/Angular × OpenAI/Azure × both APIs.
- [ ] Add read-only native recovery/status and separate protected native operator routes. Reuse the existing snapshot/refresh revision guards; new application-owned dispositions must fail closed and disable sends/decisions appropriately. Keep native opaque JSON private.
- [ ] Run all native tests and `npx nx provider-e2e dotnet-conformance --output-style=static`; inspect every project/result, zero skips/retries. Review and commit after fixes.

## Task 4: Production recipe and compiled docs

**Create:** `www/content/docs/{react,angular}/platform/dotnet-native-tools.md`, `tools/conformance/dotnet/verify-native-recipe.mjs`; modify main `platform/dotnet.md` only for the mode distinction/link, menu data, `README.md`, `project.json:check-docs`, and targeted docs tests.

- [ ] Write failing checks that both framework native recipes contain identical server examples, retain the locked dependency set, require real authorization/isolation, initialize PostgreSQL and configure the complete native composition.
- [ ] Document the new opt-in setup, stable agent/catalog/model identities, caller-owned tool permissions, native full-history filters, save barrier, bounded selector tombstones, unknown-effect reconciliation and expiry/new-thread behavior. State plain native approvals are the next milestone and keep application confirmation distinct.
- [ ] Compile exact new examples for OpenAI/Azure and Responses/Chat Completions as applicable, using the locked actual Integration source. Keep all existing 16 combinations and SDK 0.8.2 diagnostic minimum. Do not add a fifth C# block that silently bypasses the original verifier.
- [ ] Run `npx nx check-docs dotnet-conformance`; build/test/lint www; routes/workbench e2e; inspect C# and XML syntax colors on both new native and existing .NET pages.
- [ ] Request docs/spec/quality review and commit.

## Task 5: Bounded live and actual published SDK qualification

**Modify:** existing `harness/live-*`, `live-specs/qualification.spec.ts`, live fixture C# controls and tests; keep current seven groups unchanged. Update README/current counts. Record evidence in a new research document after runs.

- [ ] First add failing manifest/ledger/native-dispatch tests for `mixed-native-tools`: eight groups × six projects = 48 distinct results; fixed reservation 99; maximum remains 128/run and four/scenario, 384 output tokens, 60-second scenario, 15-minute run. Derive planned/required counts from the frozen manifest rather than leaving hard-coded 42 checks.
- [ ] Add a server-only PostgreSQL fixture context to the parent/native-child path for native groups, with task-owned random schema cleanup. Never add database/provider credentials to `publicChildEnvironment`, builds, Playwright or Chromium. Preserve projected diagnostics and actual failure canaries.
- [ ] The new live group requests genuine same-response browser/server calls through native clients, verifies the native co-emission, browser result, deferred backend execution, final answer and two actual model calls. Do not synthesize mixed calls or silently accept sequential fallback. Keep native attempt caps/retries unchanged.
- [ ] Run focused runner/native tests, full conformance build/test/lint and final affected builds/tests/lint. Review all changes and the complete failure-artifact canary.
- [ ] Root prepares a fresh physical npm 0.8.3 consumer, verifies registry/SRI/origins/source/bundle hashes, runs the full current deterministic browser matrix and the 48-case live matrix against that same metadata. Root alone uses the already authorized local credential source/model/resource. Keep failures as evidence; investigate before any new invocation.
- [ ] Measure actual outcomes, native proof intersection, preflights, requests, effects/cancellations, HTTP statuses and incomplete usage. Independent final review must parse raw JSON/proofs and compare documentation against evidence.
- [ ] PR, attach, enable merge on green, resync main without merge holds, verify required CI, merged-tree equality, main CI/deployment and live docs. Record final integration in the PR without resetting successful CI for routine status edits.

## Next milestone

After this PR is verified, create and review the native approval specification/plan. Use the already-proven outer request/response bridge and trusted redundant-call projection. Add durable pending-descriptor recovery, approval/decline/cancel/expiry/competition/forgery tests and the four-call native-approval live group (54 cases / 123 reserved / maximum 128). No core replay guard relaxation, SDK publication or unrelated roadmap work.
