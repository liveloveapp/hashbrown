# Plain LangGraph UI implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Follow test-first development and independent spec then quality review. Use top-level test(...) with arrange/act/assert and TSDoc for new reusable/public functionality.

**Goal:** Deliver plain LangGraph tool-step producers, checkpoint persistence and restore recipes that Hashbrown consumes, keeping file search deferred.

**Architecture:** An isolated `@b4run/langgraph/ui` subpath reuses the SDK contract and public LangChain APIs. Existing edge-safe entry points do not import it. Hashbrown receives docs and real-store fixture tests without dependencies.

**Tech Stack:** Existing repo LangChain core 1.2.12, LangChain 1.5.12, LangGraph 1.4.17; pnpm/Vitest/TypeScript/Biome in B4, Nx/Jest/Next.js in Hashbrown. User approved these peers/test dependencies on 2026-10-24.

**Spec:** `docs/superpowers/specs/2026-10-24-plain-langgraph-ui-design.md`; shared binding Rules in `2026-10-21-b4-tool-step-contract-design.md`.

**Workspaces:** Hashbrown `/Users/blove/.codex/worktrees/e2d8/hashbrown`, branch `blove/langgraph-tool-step`, rebased base `e2e5d57e`. Reused clean B4 worktree `/Users/blove/.codex/worktrees/b4-step-emission-restore`, branch `blove/plain-langgraph-tool-step`, base `de0fdca77`. Do not touch the unrelated dirty B4 primary checkout. No bare stash, keys, live requests or recordings.

## Task 1: Emitter and isolated package surface

B4 files: new `packages/langgraph/src/ui.ts`, `tool-step.ts`, `test/tool-step.test.ts`, `test/ui-packed-consumer.test.ts`; modify `package.json`, `vitest.config.ts`, `pnpm-lock.yaml` and narrowly required pack-surface inventory. New middleware is Task 2 and must not be imported until it exists.

- [x] Refresh locked baseline dependencies, build before dist-based probes, record existing LangGraph tests.
- [x] Add approved optional peers and matching dev dependencies, keeping existing entry point imports unchanged. Run `pnpm install` at B4 root; no other new dependencies.
- [x] Write failing real RunnableLambda streamEvents v2 tests for v1 CUSTOM identity, validation/normalization, Unicode labels, errors, owned sources and dispatch failure isolation. Run scoped Vitest, observe intended failures.
- [x] Implement documented `emitToolStep` and internal normalization with SDK contract helpers. Add the `/ui` export and alias before the bare package alias.
- [x] Write and run packed-export/consumer tests, including existing root entry without optional peers. Build and typecheck public types.
- [x] Independent spec then quality review; fix findings with red/green. Keep changes uncommitted until all shared-worktree writers are idle.

## Task 2: Middleware lifecycle and durable results

B4 files: new `packages/langgraph/src/tool-step-middleware.ts`, `test/tool-step-middleware.test.ts`, `test/tool-step-agent.test.ts`; modify `src/ui.ts`. Coordinate with Task 1 for its stable emitter API.

- [x] Write failing tests around real tools and deterministic fake-model createAgent: immediate running before blocked work, parallel isolation, returned/thrown failures, callback failures, unchanged messages/artifacts, denial/cancellation, interruption/resume and abort.
- [x] Write failing Command object/tuple updates and no-matching-result cases. Assert state/graph/goto/resume and unrelated messages survive without mutation.
- [x] Implement map-based display options, safe callback evaluation, per-call timestamps, settled metadata copies, ordinary error ToolMessages and control-flow propagation. Do not fabricate results or normalize provider built-ins.
- [x] Verify the persisted step omits toolCallId and equals the emitted settled step after stripping that carrier identity; JSON checkpoint round trip preserves it. Generate a deterministic live/stored fixture for Hashbrown conformance with source provenance documented.
- [x] Run package build/test/lint/typecheck. Independent spec then quality review and regression fixes.

## Task 3: Recipes, docs and consumer conformance

B4 files: `packages/langgraph/README.md`, `apps/web/content/docs/api/langgraph.mdx`, relevant `ag-ui.mdx`/`upgrading.mdx`, a patch `.changeset`, and new tested recipe sources under `packages/langgraph/examples/` with test coverage as needed. Hashbrown files: new `www/content/docs/{react,angular}/platform/langgraph.md`, nav registration if required, new `packages/core/src/models/langgraph-tool-step.conformance.spec.ts` and a small fixture beside it.

- [x] Add a plain JavaScript agent/manual helper example and Python emission/persistence recipe, plus a checkpoint-pinned Python LangGraphAgent snapshot subclass. Reuse parent mapping/IDs, preserve metadata/errors and ignore unknown versions.
- [x] Test projection logic/syntax and TypeScript examples; verify upstream extension points against primary sources. State any unexecuted external integration boundary honestly.
- [x] Add failing real-root Hashbrown tests using the helper-generated fixture: ordinary lifecycle, pre-START CUSTOM holding, failed stored ToolMessage.error, committed wire serialization and snapshot restore. Fix core only if the fixture obeys binding Rules and exposes a real bug.
- [x] Document Node-only UI peers separately from edge-safe routes, headless rendering, metadata projection responsibility, middleware approval ordering, and deferred file search. No Hashbrown runtime dependency or release notes.
- [x] Independent integration spec then quality review; verify no unrelated public API/dependency changes.

## Task 4: Final verification and delivery

- [x] B4: `pnpm build`, scoped LangGraph build/test/lint/typecheck, applicable root lint/typecheck/test, release-integrity/inventory/changeset/docs/pack/TypeScript consumer checks, and mandatory validation lanes as feasible. Build before all dist-based tests and run dependency-sharing commands sequentially. Record unavailable infrastructure accurately.
- [x] Hashbrown: `npx nx test core --runInBand`, `npx nx build core`, `npx nx lint core`, `npx nx e2e core`; `npx nx build react`, `npx nx build angular`; docs build/test/lint. Use `NX_DAEMON=false NX_NO_CLOUD=true` and no live credentials.
- [x] Final independent review, whitespace checks, unchanged Hashbrown dependency manifests, no keys or unrelated generated files. Record counts/warnings/review regressions below.
- [x] Commit reviewed files only when writers idle; push both branches, create/attach both PRs and link their dependency. Keep unmerged; do not publish packages.

## Evidence

- Existing B4 LangGraph baseline: 3 test files / 11 tests pass before changes. Locked dependency refresh succeeds; it reports existing ignored dependency build scripts.

- Task 1 independently approved for spec compliance and then quality; committed in B4 as df8fbe6aa. Final sequential gates: full build 29/29, LangGraph 32 tests across 5 files (19 emitter, 2 packed, 11 existing), typecheck, lint (16 files), 59 pack-check tests and full tarball validation pass. No release-owner inventory changes were needed.
- Python verification environment is isolated at /private/tmp/hb-langgraph-python-venv: ag-ui-langgraph 0.0.47, ag-ui-protocol 1.0.0, LangChain core 1.7.0, LangGraph 1.2.17. A real MemorySaver graph confirms a durable checkpoint ID and the unmodified bridge drops saved b4_step metadata while returning the generic error sentinel. The older global bridge 0.0.25 lacks the snapshot hook and is left untouched.
- Existing B4 warnings so far: ignored dependency build scripts/peer notices, web filesystem-tracing warnings, preservation of an example Dockerfile, and no output files for software-factory-server build.

- Task 2 independently approved for spec and quality after red/green fixes for genuine CJS Commands and coded-error failure display. B4 package build/typecheck/lint and 50 tests across 7 files pass. The helper-generated fixture remains deterministic. Release integrity (33 tests) and build-cache configuration gates also pass.

- Task 3 B4 recipes/docs independently approved for spec and quality. A red/green two-call regression fixed Python legacy source identity collisions. Actual Python emission/failure/interrupt, parent ID preservation, checkpoint race and namespace checks pass; TypeScript recipes, package typecheck/lint and web lint pass. Full package/API audit gates remain pending after local subprocess timeouts. React and Angular builds pass. B4 content committed as 5300b9f6f and SEO regenerated for only its three changed routes.

- Task 3 Hashbrown spec and quality approved after a real React18 rendering regression added HTTP(S)-only source links to the guide. Fixture exactly matches B4 SHA256 21b41944831950bba2a896e544dc3c23219b11deb4b25cf40ea9ebb231e3dda4. Core: 85 suites / 1,673 tests; build and 5 e2e tests pass. Focused nav19/19 and actual guide URL/render12/12 pass. Core lint retains only3 pre-existing tool-step.ts unused-destructure warnings; new test warning fixed. B4 API catalog/count and search-index ownership fixes reviewed, 39 search tests and full web build pass; gzip search budget increased1KB for measured136.6KB docs corpus.

- Hashbrown final gates: 802 website tests across117 files, website lint/build, core1673 tests/build/lint/5e2e and React/Angular builds pass. Initial default-worker website run had six unrelated render timeouts plus the expected sitemap count change; bounded rerun passes after103-page count and route assertions. Final cross-repository integration review approved after Python ISO legacy timing regression fix (B4 15345d220). B4 full build29/29 and source lint pass; broad B4 test/controller/docs/pack/harness gates still in progress.


### Delivery verification

- Draft PRs: [B4 #1098](https://github.com/cacheplane/b4run/pull/1098) and [Hashbrown #743](https://github.com/liveloveapp/hashbrown/pull/743), attached and cross-linked. Keep both unmerged; Hashbrown documentation is held until the helper package is published. Version 0.15.2 does not contain `/ui`. No release notes or file search included.
- Hashbrown rebased onto `e2e5d57e` (including current Threadplane docs). Fresh core 1,739 tests/build/lint/5 e2e, React/Angular builds and website 862 tests/build/lint pass. CI pipeline `6adcff7fe5f30fef18f2f026` succeeds. Dependency manifests and production core code are unchanged. Fixture digest remains `21b41944831950bba2a896e544dc3c23219b11deb4b25cf40ea9ebb231e3dda4`.
- Final B4 package: 57 passing tests, one optional Python integration skipped; actual Python bridge recipes pass separately. Build/typecheck/lint pass. Browser boundary regression fails before the explicit Node import, then all five bundle boundary tests pass. Independent final integration review approves.
- B4 full build (29 tasks), full typecheck (59 tasks plus root), root lint, docs audit, release integrity (33 tests), cache configuration, chart and harness self-tests pass. Root lint retains 378 existing warnings; website build retains two filesystem tracing warnings. No new LangGraph warnings.
- B4 CI run `40122182909` passes release-controller, canonical package/TypeScript smoke, harness, browser security, Windows, edge and infrastructure jobs. Source tests report 12,602 passing and one failing API reference heading-template assertion. Corrected the recipe to nest under the required Examples section, retaining all six top-level reference sections; focused template tests pass. Full API reference/search regression checks now pass 293 tests; affected web build/lint pass, SEO digest regenerated. Corrections pushed as `34fc42cce`/`554cbad8b`; CI rerun pending.
- Broad local B4 source run: 12,586 passing, five failures. The same heading assertion is corrected. The other four failures (SQLite contention in two unchanged chat tests, CLI loopback connection and artifact infrastructure classification) all pass on isolated retries. Full local release-controller: 4,017/4,021 pass initially; every failed case passes targeted retries. Registry retry uses direct Node with the installed pnpm binary on a temporary PATH to avoid Corepack bootstrap under isolated HOME. No unrelated source changes were made; canonical CI controller passes in full.
- Nx self-healing is disabled; the available tools cannot enable Auto-fix. Both draft PRs have auto-merge off. No package publication or merge performed.
