# Agent Framework Display Conformance Execution Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Work test-first, review spec compliance and quality independently, and keep Git mutations with the parent.

**PR:** [#832](https://github.com/liveloveapp/hashbrown/pull/832), with user-authorized merge on green.

**Goal:** Add reproducible conformance tests for real AG-UI framework bridges and Hashbrown's activity/tool-display consumer, then merge the implementation when required CI passes.

**Architecture:** Real deterministic framework hosts produce unmodified AG-UI event traces. A versioned evidence corpus runs through the prepared Hashbrown root store; the existing React/Angular runtime hosts exercise the public consumer. Record per-capability gaps rather than synthesizing missing producer events. Reuse the maintained .NET host and Thread Plane's test patterns, not its native session implementation.

**Tech Stack:** Existing Nx/Jest/Playwright tooling, isolated Node bridge manifests (dependency set approved 2026-10-29), existing .NET test host. No Hashbrown runtime dependencies. File search stays deferred.

## Task 0: Establish evidence and versions

- [x] Branch from current main; carry forward the selected design.
- [x] Inspect published bridge bytes and exact peers; isolated Node test dependencies approved 2026-10-29.
- [x] Inventory existing .NET activity, steps, errors, restore and subagent coverage without introducing a second host.
- [x] Review this execution plan before implementing.

## Task 1: Shared evidence corpus and root-store consumer

Files: `tools/conformance/agent-frameworks/{README.md,capabilities.json}`, `tools/conformance/agent-frameworks/node/capture.mjs`, `tools/conformance/agent-frameworks/harness/capture.spec.mjs`, `packages/core/src/models/agent-framework-display.conformance.spec.ts`, `packages/core/src/models/fixtures/agent-frameworks/*.json`.

- [x] Write failing capture-helper tests for bounded waits, event byte preservation, failed runs and manifest provenance; run them before helper implementation.
- [x] Implement the smallest capture/provenance helper; never fabricate producer fields.
- [x] Add root-store tests over real captured events using `createStore({reducers,prepareAction:ɵprepareRootAction})`, public selectors, canonical JSON commit/restore and next-turn input. Freeze inputs.
- [ ] Include activity snapshot/delta, independent call ownership, readable supplied errors and baseline without optional `b4.step` enrichment where the actual producer supports them.
- [x] No core production defect demonstrated; producer omissions recorded as gaps. Consumer fixes would require an observed regression.

## Task 2: Real LangGraph and Mastra producers

Files: isolated `tools/conformance/agent-frameworks/node/{package.json,package-lock.json,langgraph.spec.mjs,mastra.spec.mjs}`, real host helpers, generated corpus and version manifest.

- [x] Install only approved pinned test dependencies and inspect public bridge APIs.
- [x] Use real graph/agent execution with deterministic model output. Any simulated SDK transport must be labeled separately from real local graph execution.
- [x] For live server-tool profiles, gate actual tool completion and assert START was observed before releasing it. Default buffered Mastra is a separate profile.
- [x] Test success, readable failure, cancellation and next-turn history/restore where the bridge supports them. Add actual activity/subagent scenarios only through public supported hooks.
- [x] Keep optional metadata recipes explicit. Missing attributed subagents in the published package remain a versioned gap.
- [x] Generate traces through one command. Preserve raw output unchanged; compare a documented semantic projection that ignores only nondeterministic IDs/timestamps. Verify exact installed package versions and raw capture hashes; never hand-edit producer output.
- [x] Record Python LangGraph separately until a real Python bridge host is implemented and its dependency set approved.

### Minimum delivery acceptance

Each delivered framework must execute its real bridge and at least one actual successful server tool, assert START timing according to its configured profile, and pass the resulting trace through the prepared store and both UI consumers. Register an identically named browser tool and prove it executes zero times; retain an ordinary client-tool control that executes exactly once. A fixture replay proves consumer compatibility, not a live timing or native checkpoint claim.

Consumer JSON commit/restore and native checkpoint restore are separate capability rows. Native restore requires a second real framework execution from durable native history; an in-memory transcript projection is insufficient.

CI uses `node --test` for the isolated `.spec.mjs` suite and `npm ci --prefix tools/conformance/agent-frameworks/node` for its lock. `conformance:test` depends on `agent-framework-test`, and existing `example-e2e` includes the browser spec. Dedicated `npx nx agent-framework-test conformance` / `npx nx agent-framework-e2e conformance` targets support focused runs; Jest's unrelated globs are not relied upon.

## Task 3: Existing-host and browser integration

Files: `tools/conformance/project.json`, existing conformance Playwright specs/hosts and .NET coverage inventory.

- [x] Add dedicated Nx generation/verification targets with no credential or model requirement; integrate deterministic checks in CI.
- [x] Replay actual bridge traces through both maintained browser consumers and verify display/ownership without executing server calls as browser tools.
- [ ] Follow-up: extend the existing .NET host for the audited display gaps; do not relabel source-only inventory as real producer coverage.
- [x] Document exact tested versions and passed/unsupported/missing-upstream/recipe-required/not-tested capabilities. Strands is a candidate supported by Thread Plane reference tests, not yet Hashbrown evidence.

## Task 4: Verification and integration

- [x] Run isolated host tests and generation reproducibility checks.
- [x] Run `npx nx test core`, `npx nx build core`, `npx nx lint core` if core tests/source change; run relevant core e2e/API checks for production changes.
- [x] Run `npx nx test conformance`, `npx nx build conformance`, `npx nx lint conformance`, dedicated bridge/browser targets, affected runtime host builds and docs checks if public docs change.
- [x] Obtain independent spec and quality review; correct actionable findings.
- [ ] Open and attach implementation PR(s); enable merge on green under the user's authorization. Check required CI/reviews and address failures; confirm actual merge rather than equating auto-merge with completion.

The [broader design and roadmap in #826](https://github.com/liveloveapp/hashbrown/pull/826) remain separate documentation work for additional Python, richer framework profiles and future frameworks. This PR carries its own executable plan to avoid duplicating those pending files. This execution plan must report incomplete capabilities honestly; a green harness alone does not qualify a framework.

## Initial batch delivery record

Implemented: approved exact Node pins/lock; capture/provenance helpers; three real
success profiles; actual tool failure/cancellation host checks; generated corpus;
prepared-store frozen replay/commit/JSON restore; both browser consumers; ordinary
client-tool control and inert completed name-collision checks; CI target wiring.

The binding shared design classifies ordinary calls by declared client-tool names.
The same-name case therefore verifies no historical reexecution, while undeclared
calls verify server display. No provider identity is fabricated for these traces.

Deferred roadmap: activities, subagents, citations/rich metadata recipes, actual
Python/API-server bridges, native framework checkpoint restore and new .NET display
scenarios. The .NET source audit is complete; it is not a fresh conformance run.
File search remains deferred. No core production behavior was changed.

Local verification: 2,467 core tests; 112 existing conformance tests; 22 capture/evidence
helper tests; 13 real-host/harness tests; all three capture reproducibility checks;
16 React/Angular browser cases; affected builds/lints passed. Existing Nx/Vite
migration, color-environment and bundle-size warnings remain. Negative tool-failure
scenarios produce expected framework diagnostics.

CI integration follow-up: a fresh production-mode graph exposed Nx's unnamed inferred
project for the isolated package. Added explicit project metadata and disabled
package-script inference; the parent conformance project depends on it. The shared
capture implementation lives inside that project so host imports do not introduce
a parent/child project cycle. The existing website production-resolution regression
is the test-first failure/verification for this fix.
