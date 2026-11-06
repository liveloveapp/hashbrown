# .NET Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Execute tasks with specification review followed by code-quality review. Root owns Git, shared integrations, live credentials, service acquisition and full-suite execution.

**Goal:** Prepare npm 0.9.0 / NuGet 0.1.0-preview.2, usable .NET onboarding, discoverable C# reference and honest release qualification, then merge on green without publication.

**Architecture:** Separate current candidate identities from immutable public baselines. Reuse exact archive consumers and existing qualification infrastructure. Add a real same-origin example and generated C# documentation input consumed by the website without a .NET SDK.

**Tech Stack:** Existing Nx, TypeScript/React/Angular, .NET 10, Microsoft Agent Framework/AG-UI, OpenAI/Azure, PostgreSQL 18, Next.js/Shiki. No additional third-party dependencies.

Specification: `docs/superpowers/specs/2026-11-06-dotnet-release-readiness-design.md` (independently approved).

## Execution rules

- [ ] Use the already isolated worktree and `blove/dotnet-release-readiness-20261106` branch. Preserve other worktrees.
- [ ] Keep root logs and receipts in `/private/tmp/hashbrown-release-090-20261106`. Use pinned Node 24.18.0; .NET 10.0.403 is permitted by current latestPatch policy. Preserve the initial Node24.20 cleanup-test failure; investigate before attributing it to changes.
- [ ] Each behavioral slice: write a meaningful failing top-level test, root runs it and records the failure, implement the smallest complete change, root verifies GREEN. No weakening existing strict assertions or counts.
- [ ] Each implementer owns a bounded slice and does not commit, publish or acquire shared services. Root commits reviewed work and executes integrations. Reviewers receive concrete paths/spec rather than conversation history.
- [ ] Do not publish, create release tags/releases, move channel tags or invoke publisher workflows. Publication evidence stays pending until the new release session.

## Task 1: Candidate versions and preserved historical baselines

**Files:** ten `packages/*/package.json` release manifests, root `package-lock.json`, React/Angular package-version constants; `packages/dotnet/Hashbrown.AspNetCore.csproj`; `packages/dotnet/tools/{verify-package.mjs,package.test.mjs}`; `tools/conformance/dotnet/{candidate-consumer,nuget-consumer}` preparation, qualification, templates and tests; `scripts/nuget-release.spec.mjs`.

- [ ] Add failing tests for exact internal SDK dependency/peer version substitution and generated lock consistency, while altered external graph/version/integrity remains rejected.
- [ ] Add failing tests for explicit historical preview1 verification after current identity becomes preview2; ordinary current verification must reject old or metadata-selected identity.
- [ ] Bump only the existing npm release group to0.9.0 with exact internal graph pins; update the root lock intentionally. Set current NuGet identity topreview2 and keep third-party pins/SDK policy unchanged.
- [ ] Update current-package helpers, consumer templates, recipe compilation and proof fixtures to select current identity. Historical verifier selection must use trusted pinned producer information, not supplied metadata.
- [ ] Preserve baseline live-consumer manifest/lock/verifier, preview1 archives/provenance, old qualification reports and all original frozen compatibility inputs byte-for-byte.
- [ ] Reconcile published-guide preview1 install examples with candidate compilation explicitly: validate truthful published instructions separately from building extracted C# programs with the selected candidate reference. Do not claim preview2 is on NuGet.org.
- [ ] Root verifies `node scripts/verify-release-versions.mjs --tag v0.9.0`, helper tests, `npx nx test-package dotnet-conformance`, `npx nx build dotnet-sdk`, `npx nx test dotnet-sdk`, `npx nx lint dotnet-sdk`, and exact candidate preparation/isolation.
- [ ] Independent SPEC review, fix/review loop, then QUALITY review; root commits only green reviewed slice.

## Task 2: C# reference generation and website discovery

**Files:** `packages/dotnet/tools/ApiSnapshot*` or a focused SDK-only sibling tool; generated `packages/dotnet/api/reference-docs.json`; SDK project targets/tests; `www/src/lib/dotnet-reference.ts`; API route integration under `www/src/app/api`; menu, search and llms generators; focused `www/test` tests.

- [ ] Write failing tests for authored XML member coverage, overloaded IDs/anchors, parameter/returns/remarks and cross-reference preservation, escaped content, missing/stale generated input and deterministic output.
- [ ] Build reference input from compiled XML and reviewed exported types. Preserve compatibility snapshots and exclude synthesized members without authored prose from human reference lists without changing the ABI baseline.
- [ ] Generate readable type/member presentation; never label raw reflection metadata as valid C#. Keep overload identities distinct and links valid.
- [ ] Commit generated input outside the TypeScript collector's reset directory. SDK validation checks freshness; website builds use the committed input with no .NET process.
- [ ] Integrate static API pages, API navigation, search and llms content using existing Next/Shiki rendering. Ensure `collect-docs` cannot delete this input or silently omit C# routes.
- [ ] Root verifies SDK build/test/lint and website focused tests/build/test/lint plus route/layout coverage for representative reference types and anchors.
- [ ] SPEC then QUALITY review and reviewed root commit.

## Task 3: Runnable .NET starter and bounded maintenance

**Files:** new `examples/dotnet-starter/{README.md,global.json,project.json,server,react,angular,tools}` and targeted tests; use exact current SDK PackageReference and existing framework dependency versions.

- [ ] Write failing tests for disabled/non-Development/nonloopback development identity, unsafe origins, caller-controlled scope rejection, and production configuration refusal.
- [ ] Write failing meaningful maintenance tests for host cancellation, one bounded pass per tick, deadline/failure observation, shared registration and absence of model/tool dispatch.
- [ ] Implement the actual native PostgreSQL server composition with Responses startup default, server-owned configuration, real browser/server tool and native approval, recovery endpoint and explicit new-thread lifecycle. Do not import internal Testing sources.
- [ ] Implement small pure React and signal-driven standalone Angular clients with trusted components, escaped messages/diagnostics, explicit interrupt/resume and cold-recovery settlement controls. Serve either built client from ASP.NET Core on the same origin.
- [ ] Add application-owned bounded maintenance BackgroundService using the exact endpoint journal/catalog/configuration registration. Document application production authentication and downstream idempotency requirements.
- [ ] Add exact-archive candidate preparation and honest future registry instructions. Candidate outputs are owned/external, use explicit local feeds/mapping and integrity/loaded-identity checks, and do not rewrite public manifests to imply publication.
- [ ] Integrate Nx build/test/lint/serve and both real client smoke paths. Build and run the public starter against actual candidate packages, not workspace source aliases or substitute fixture endpoints.
- [ ] Root verifies both framework browser paths, actual starter server/DB readiness, authentication refusals, maintenance and cleanup, plus example build/test/lint.
- [ ] SPEC then QUALITY review and reviewed root commit.

## Task 4: Release recovery qualification profile

**Files:** focused new `tools/conformance/dotnet/release-consumer` and/or `harness/live-recovery-*` modules; explicit CLI/profile targets and tests; reuse existing owned worker/archive/provenance helpers where their contracts fit.

- [ ] Add failing selection tests: exact current public versions or current candidate archives accepted only with their required provenance; reject ranges/latest/mixed origins/missing publication receipt/altered package or loaded-DLL anchors/source fallback. Preserve historical54 selection unchanged.
- [ ] Add failing inventory/budget tests for six existing framework/auth projects ×cold-restore/result-reconciliation (12cases),3preflights,39reserved calls,384output tokens,60s case/900s run,serial/zero retries. Provider-free `--list` must precede credential loading.
- [ ] Implement candidate and future-public selectors with before/after qualification. Public selection requires actual official registry/integrity/signature/payload/producer witnesses; no invented future signed hashes or relabeling candidates as published.
- [ ] Implement separate passive recovery observations and real cold-worker lifecycle. Verify genuine Pending/V2, drained original worker, distinct replacement worker/same schema/package, original call/result input, one complete settlement, no replay and genuine usage.
- [ ] Implement genuine post-commit delivery suppression followed by Completed adoption/repeated inert reads, with no provider dispatch/effects/native run events from recovery. Validate canonical history and cleanup independently.
- [ ] Root runs selector/profile tests and both deterministic new journey controls through actual owned workers; existing complete source/cold suites remain unchanged and required. Candidate-live execution may use previously authorized root.env OpenAI/Azure CLI credentials if available; retain failures honestly and never claim future official-registry success.
- [ ] Write exact publication-session commands, required receipts, credential sourcing and bounded live budget. Keep registry publication/actual published preview2 qualification explicitly pending.
- [ ] SPEC then QUALITY review and reviewed root commit.

## Task 5: Documentation, release notes and compatibility matrix

**Files:** mirrored `www/content/docs/{react,angular}/platform/dotnet{,-native-tools,-starter}.md`, composition sections/menu entries; `packages/dotnet/README.md`; existing conformance README; upcoming release/migration notes and release-session handoff.

- [ ] Add exact published-vs-upcoming client/server compatibility table and stopped-worker/custom-journal/uncertainty upgrade guidance. Keep old install commands truthful until publication.
- [ ] Link runnable starter, maintenance sample, composition choice and generated C# reference from both framework guides and package README.
- [ ] Add next-release notes for npm0.9.0/NuGetpreview2 and the prose rename with existing migration links. Label supported features versus separately deferred managed identity/runtime/rolling-upgrade gaps.
- [ ] Preserve the workbench teaser's honest client-replay description; do not claim it runs the new starter or native server.
- [ ] Root compiles all32 documented programs against exact candidate package and runs website build/test/lint and route/layout checks including new pages. SPEC then QUALITY review and root commit.

## Task 6: Integrated acceptance, PR and merge

- [ ] Review all changed paths and frozen baseline hashes; run required build/test/lint for every affected npm release project plus dotnet-sdk, dotnet-conformance, starter and www. Run API reports where required.
- [ ] Run full exact-package acceptance, source664, candidate cold372/isolation20/cleanup40, ABI/old-server compatibility and startup/browser checks. Reuse already qualified exact artifacts only where their source/provenance still match; never present stale receipts as new runs.
- [ ] Finish independent whole-change SPEC and QUALITY review. Fix important findings, rerun affected checks and record actual results/warnings.
- [ ] Create concrete PR with exact target versions, publication hold, tested scope and post-publication checklist. Push no tags. Resync latest main as needed; do not ask other chats to hold merges.
- [ ] Merge only the exact green reviewed head through normal rules. Verify actual merge/main CI and deployed documentation revision/routes/C# highlighting.
- [ ] Final handoff states what shipped to main, candidate qualification results, remaining publication/live-registry steps, explicit no-publication result and any unresolved external constraints. Do not start the coordinated release.
