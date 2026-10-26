# Durable .NET confirmation checkpoints implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Resume application confirmations after server restart and across replicas with PostgreSQL-backed, fenced, conservative execution claims.

**Architecture:** A common asynchronous interrupt store supports memory and PostgreSQL. Persist immutable operation descriptors and resolve them through a versioned server registry. Short PostgreSQL transactions claim preparation and commit an irreversible dispatch marker before application execution. Retain the upstream AG-UI endpoint and browser ownership contract.

**Tech Stack:** .NET 10, Npgsql 10.0.3 (user approved), PostgreSQL 18, current Microsoft Agent Framework/AG-UI packages, Jest, Playwright, aimock, Nx.

**Spec:** `docs/superpowers/specs/2026-10-24-dotnet-durable-checkpoints-design.md` (independent review approved).

## Task 1: Executable store and workflow integration

**Files:**
- Add focused contracts/registry/validation and PostgreSQL backend files under `tools/conformance/dotnet/Integration/`.
- Modify `PendingInterruptStore.cs`, `InterruptWorkflowClient.cs`, `HashbrownEndpointConfiguration.cs`, `Program.cs`, `Testing/FixtureTools.cs`.
- Modify `Hashbrown.Conformance.csproj` and deliberate `packages.lock.json` restore for Npgsql 10.0.3.
- Extend `harness/http-fixture.ts`; add `harness/postgres-fixture.ts`, `tests/durable-interrupts.spec.ts` and focused test-only fixtures as needed.

- [x] Write an HTTP test that interrupts on process A, kills A, then resumes the same batch on process B. Assert persisted original arguments and a shared durable effect count; run and observe failure with the current memory-only implementation.
- [x] Implement the asynchronous store contract, immutable operation descriptor/registry validation, server-created token/generation claim handle, and request-local handle propagation. Replace delegate checkpoints in the memory path and preserve its existing semantics.
- [x] Add pinned Npgsql and lockfile. Implement versioned initialization safe under concurrent startup, complete-batch lookup, atomic bounded creation, row-locked validation/claims, lease takeover, fenced marker/finish, terminal decisions and cleanup. Use PostgreSQL server time after row locking. No DB transaction spans application/model/SSE work.
- [x] Add fixture-only process lifecycle and barriers at prepare, post-marker and post-effect boundaries. Persist effect observations outside process memory. Local helper owns disposable PostgreSQL resources or accepts an explicit CI connection; test schemas are isolated.
- [x] Write and run failing tests for each missing safety behavior before implementing it: identical-run-ID competition; create race; stale worker after takeover; preparation crash/cancel; dispatch-marker crash; effect-complete crash; expiry vs valid active lease; decline/cancel restart; altered scope/thread/fingerprint/answers; unknown registry version/invalid stored args; DB/dispatch-write outage; capacity and retained tombstones. Cover both providers where model continuation is relevant.
- [x] Verify `npx nx build dotnet-conformance`, `npx nx test dotnet-conformance`, and `npx nx lint dotnet-conformance`; capture red/green evidence and any warnings. Use the existing isolated SDK environment. Do not run overlapping Nx graphs that rebuild shared outputs.
- [x] Request independent spec compliance review; address material findings and re-review. Then request code-quality review, fix and re-review. Commit only task files.

## Task 2: Browser matrix, recipes and CI

**Files:**
- Add `tools/conformance/dotnet/specs/durable.spec.ts`; extend harness only as needed.
- Modify both `www/content/docs/{react,angular}/platform/dotnet.md`, `tools/conformance/dotnet/verify-recipe.mjs`, `README.md` and `project.json`.
- Modify `.github/workflows/pr-main.yml` to supply real PostgreSQL 18 before any affected tests require it.

- [x] Write browser cases across React/OpenAI, React/Azure, Angular/OpenAI and Angular/Azure: live pending browser survives server restart, resumes on another instance, and concurrent instance claims dispatch once. Assert real trusted UI state and shared durable effects where applicable; no browser reload persistence claim.
- [x] Run the new cases, observe failures if harness/backend integration is missing, and implement only missing wiring. Preserve all original 100 browser cases.
- [x] Update both server recipes with identical compiled memory and PostgreSQL examples, exact dependencies, pooled source lifetime, initialization/permissions, authentication, registry versioning, server-owned JSON args and effect ID. Explain lease configuration, ambiguous outcomes and application idempotency; preserve browser ownership limits.
- [x] Update exact snippet compilation for all documented combinations. Compile the snippets against the actual recipe source and locked packages.
- [x] Add PostgreSQL 18 CI service with readiness and fixture-only credentials; pass an explicit test connection string. Ensure tests isolate schemas and do not mutate another application's DB. Test absence of DB fails required durable coverage rather than silently skipping it.
- [x] Verify build/test/lint for `dotnet-conformance`, `conformance`, `www` as affected; run .NET provider-e2e and shared example-e2e sequentially. If runtime host source changes, also run each host build/lint and existing available tests.
- [x] Obtain separate spec compliance then code-quality reviews and resolve findings. Commit coherent changes.

## Task 3: PR, merge, and publication verification

- [x] Confirm original PR727 merges and its main deployment succeeds. Fetch both public framework recipe routes and verify content/navigation against merged source. If there is a deployment defect, fix it in the authorized follow-up with appropriate checks.
- [x] Once PR727 is squashed, rebase the follow-up using its known implementation boundary onto current main without duplicating the original commits; inspect diff and working tree.
- [x] Record final local validation and known limitations. Review the complete final diff independently, including race/crash tests and production instructions.
- [ ] Push `blove/dotnet-durable-checkpoints`, create a ready PR against main using a body file, and attach it to the current chat. State concrete guarantees and validation; no upstream OpenAI report.
- [ ] Wait for CI; fix genuine failures and rerun. Enable squash auto-merge through normal protections with the verified head. Rebase if strict up-to-date protection requires it; never bypass checks.
- [ ] Verify PR state MERGED, merge SHA, main CI and docs deployment. Fetch published React/Angular recipes and confirm durable content. Remove only owned temporary PostgreSQL containers and test resources.

## Execution notes

The user explicitly authorized autonomous brainstorming, specification, review, implementation with subagents, PR, merge on green and verification. No additional design or execution confirmation is needed. Npgsql was explicitly approved. Browser reload recovery, external-effect exactly-once claims, operator reconciliation, retry queues, Entra and Responses are outside scope.

Task 1 completed in `3426919e`: restart tests first returned 410 instead of 200 for both providers. The implementation then passed all 66 HTTP tests against PostgreSQL 18, plus a targeted concurrent-startup rerun after serializing fixture-table initialization. C# builds reported zero warnings/errors. Spec and code-quality reviews passed after clarifying expired-lease authority and correcting test cleanup error handling. The normal lint-staged checks passed with `--concurrent=false`; the commit disabled only the duplicate hook invocation after those identical checks completed. Existing Nx/Jest deprecation and color-environment notices were reported. Task 2 will verify browser and recipe behavior on the merged baseline.

Task 2 completed after independent spec and quality review. All 108 .NET browser cases and all 72 shared browser/provider cases passed. Build/test/lint passed for the three affected projects, including 66 HTTP, 45 shared and 698 docs tests; four exact recipe variants compiled without warnings. A pre-existing truncated-stream assertion now waits for observed graceful EOF before checking UI propagation and passed twelve repeated checks. Heavy local CPU contention required only a test-process environment override (`DOTNET_PROCESSOR_COUNT=2`), without changing source deadlines or worker counts. Task 3 follows the already authorized normal protected PR/merge workflow; its remote completion evidence belongs to that PR.
