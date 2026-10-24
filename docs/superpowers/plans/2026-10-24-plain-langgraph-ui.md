# Plain LangGraph UI implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Follow test-first development and independent spec then quality review. Use top-level test(...) with arrange/act/assert and TSDoc for new reusable/public functionality.

**Goal:** Deliver plain LangGraph tool-step producers, checkpoint persistence and restore recipes that Hashbrown consumes, keeping file search deferred.

**Architecture:** An isolated `@b4run/langgraph/ui` subpath reuses the SDK contract and public LangChain APIs. Existing edge-safe entry points do not import it. Hashbrown receives docs and real-store fixture tests without dependencies.

**Tech Stack:** Existing repo LangChain core 1.2.12, LangChain 1.5.12, LangGraph 1.4.17; pnpm/Vitest/TypeScript/Biome in B4, Nx/Jest/Next.js in Hashbrown. User approved these peers/test dependencies on 2026-10-24.

**Spec:** `docs/superpowers/specs/2026-10-24-plain-langgraph-ui-design.md`; shared binding Rules in `2026-10-21-b4-tool-step-contract-design.md`.

**Workspaces:** Hashbrown `/Users/blove/.codex/worktrees/e2d8/hashbrown`, branch `blove/langgraph-tool-step`, base `834998549`. Reused clean B4 worktree `/Users/blove/.codex/worktrees/b4-step-emission-restore`, branch `blove/plain-langgraph-tool-step`, base `de0fdca77`. Do not touch the unrelated dirty B4 primary checkout. No bare stash, keys, live requests or recordings.

## Task 1: Emitter and isolated package surface

B4 files: new `packages/langgraph/src/ui.ts`, `tool-step.ts`, `test/tool-step.test.ts`, `test/ui-packed-consumer.test.ts`; modify `package.json`, `vitest.config.ts`, `pnpm-lock.yaml` and narrowly required pack-surface inventory. New middleware is Task 2 and must not be imported until it exists.

- [ ] Refresh locked baseline dependencies, build before dist-based probes, record existing LangGraph tests.
- [ ] Add approved optional peers and matching dev dependencies, keeping existing entry point imports unchanged. Run `pnpm install` at B4 root; no other new dependencies.
- [ ] Write failing real RunnableLambda streamEvents v2 tests for v1 CUSTOM identity, validation/normalization, Unicode labels, errors, owned sources and dispatch failure isolation. Run scoped Vitest, observe intended failures.
- [ ] Implement documented `emitToolStep` and internal normalization with SDK contract helpers. Add the `/ui` export and alias before the bare package alias.
- [ ] Write and run packed-export/consumer tests, including existing root entry without optional peers. Build and typecheck public types.
- [ ] Independent spec then quality review; fix findings with red/green. Keep changes uncommitted until all shared-worktree writers are idle.

## Task 2: Middleware lifecycle and durable results

B4 files: new `packages/langgraph/src/tool-step-middleware.ts`, `test/tool-step-middleware.test.ts`, `test/tool-step-agent.test.ts`; modify `src/ui.ts`. Coordinate with Task 1 for its stable emitter API.

- [ ] Write failing tests around real tools and deterministic fake-model createAgent: immediate running before blocked work, parallel isolation, returned/thrown failures, callback failures, unchanged messages/artifacts, denial/cancellation, interruption/resume and abort.
- [ ] Write failing Command object/tuple updates and no-matching-result cases. Assert state/graph/goto/resume and unrelated messages survive without mutation.
- [ ] Implement map-based display options, safe callback evaluation, per-call timestamps, settled metadata copies, ordinary error ToolMessages and control-flow propagation. Do not fabricate results or normalize provider built-ins.
- [ ] Verify the persisted step omits toolCallId and equals the emitted settled step after stripping that carrier identity; JSON checkpoint round trip preserves it. Generate a deterministic live/stored fixture for Hashbrown conformance with source provenance documented.
- [ ] Run package build/test/lint/typecheck. Independent spec then quality review and regression fixes.

## Task 3: Recipes, docs and consumer conformance

B4 files: `packages/langgraph/README.md`, `apps/web/content/docs/api/langgraph.mdx`, relevant `ag-ui.mdx`/`upgrading.mdx`, a patch `.changeset`, and new tested recipe sources under `packages/langgraph/examples/` with test coverage as needed. Hashbrown files: new `www/content/docs/{react,angular}/platform/langgraph.md`, nav registration if required, new `packages/core/src/models/langgraph-tool-step.conformance.spec.ts` and a small fixture beside it.

- [ ] Add a plain JavaScript agent/manual helper example and Python emission/persistence recipe, plus a checkpoint-pinned Python LangGraphAgent snapshot subclass. Reuse parent mapping/IDs, preserve metadata/errors and ignore unknown versions.
- [ ] Test projection logic/syntax and TypeScript examples; verify upstream extension points against primary sources. State any unexecuted external integration boundary honestly.
- [ ] Add failing real-root Hashbrown tests using the helper-generated fixture: ordinary lifecycle, pre-START CUSTOM holding, failed stored ToolMessage.error, committed wire serialization and snapshot restore. Fix core only if the fixture obeys binding Rules and exposes a real bug.
- [ ] Document Node-only UI peers separately from edge-safe routes, headless rendering, metadata projection responsibility, middleware approval ordering, and deferred file search. No Hashbrown runtime dependency or release notes.
- [ ] Independent integration spec then quality review; verify no unrelated public API/dependency changes.

## Task 4: Final verification and delivery

- [ ] B4: `pnpm build`, scoped LangGraph build/test/lint/typecheck, applicable root lint/typecheck/test, release-integrity/inventory/changeset/docs/pack/TypeScript consumer checks, and mandatory validation lanes as feasible. Build before all dist-based tests and run dependency-sharing commands sequentially. Record unavailable infrastructure accurately.
- [ ] Hashbrown: `npx nx test core --runInBand`, `npx nx build core`, `npx nx lint core`, `npx nx e2e core`; `npx nx build react`, `npx nx build angular`; docs build/test/lint. Use `NX_DAEMON=false NX_NO_CLOUD=true` and no live credentials.
- [ ] Final independent review, whitespace checks, unchanged Hashbrown dependency manifests, no keys or unrelated generated files. Record counts/warnings/review regressions below.
- [ ] Commit reviewed files only when writers idle; push both branches, create/attach both PRs and link their dependency. Keep unmerged; do not publish packages.

## Evidence

- Existing B4 LangGraph baseline: 3 test files / 11 tests pass before changes. Locked dependency refresh succeeds; it reports existing ignored dependency build scripts.
