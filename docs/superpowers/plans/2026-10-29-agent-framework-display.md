# Agent Framework Display Qualification Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or
> superpowers:executing-plans after design approval. Parent owns Git; tasks use
> test-first steps and independent spec/quality review.

**Status:** draft implementation outline for user review. Do not execute until
its design and dependency decisions are approved.

**Goal:** Qualify activities, tool display and restore through real LangGraph and
Mastra bridges and the existing Microsoft Agent Framework host.

**Architecture:** AG-UI remains the browser boundary. Real framework test hosts
produce versioned fixtures consumed by the prepared core store and both framework
browser hosts. Enrichment recipes address verified bridge gaps; native framework
transports remain separate work.

**Tech Stack:** Existing Nx/Jest/Playwright consumer infrastructure; isolated
Node/Python framework hosts with exact versions approved before dependency adds.

**Spec:** ../specs/2026-10-29-agent-framework-display-design.md.

## Task 0: Approve boundaries and inventory

Files: spec above; tools/conformance/README.md; new
`tools/conformance/agent-frameworks/README.md` and `capabilities.json`.

- [ ] Resolve whether “direct LangGraph” means no B4 agent over AG-UI (this plan)
  or a native LangGraph SDK transport (new spec). Keep file search deferred.
- [ ] Inventory exact installed/current producer/bridge versions and native
  public hooks. Separate live, fixture-only and source-inspection evidence.
- [ ] Request approval for exact isolated dev/test dependencies before adding
  Node package manifests or Python requirements. No Hashbrown runtime dependency.
- [ ] Define matrix rows and required scenarios from the spec; preserve gaps as
  explicit unsupported/missing-upstream/not-tested rows, not skipped green tests.
- [ ] Review and commit the inventory separately.

## Task 1: Shared consumer qualification

Files: create `packages/core/src/models/agent-framework-display.conformance.spec.ts`,
`packages/core/src/models/fixtures/agent-frameworks/{manifest.json,*.json}`;
create `tools/conformance/agent-frameworks/harness/{capture.ts,assert-profile.ts}`;
modify `tools/conformance/project.json` for a dedicated opt-in fixture target.

- [ ] Write top-level consumer tests for lost supplied error metadata, invalid
  activity patches, mixed-owner child outputs and lost restore fields. Captured
  traces verify event ordering only; actual live START timing belongs in the
  blocked-tool host tests in Tasks 2/3. Core must not repair omitted producer
  STARTs or fabricate rich fields.
  Use createStore({reducers,prepareAction:ɵprepareRootAction}), apiActions and
  selectViewMessages as in langgraph-tool-step.conformance.spec.ts. Include no-
  enrichment baseline cases; expected labels/outcomes must not be invented.
- [ ] Run `npx nx test core --testFile=agent-framework-display.conformance.spec.ts
  --runInBand`; confirm actual RED for each intended failure before production fixes.
- [ ] Implement only test harness/provenance helpers initially. Fixture manifests
  record framework/bridge versions, source revision, generation command and
  deterministic scenario name. Copy producer output; do not edit it to fit core.
- [ ] If a consumer defect is demonstrated, fix it minimally with its own RED/GREEN
  regression and independent review. Upstream producer loss stays a documented
  gap or separate opt-in recipe, never a name-based core heuristic.
- [ ] Test commit/JSON snapshot/restore and next request as separate boundaries.
  Inputs remain frozen; duplicate deliveries retain identity.
- [ ] Run core build/test/lint/e2e/API report and framework builds when core changes.
  Review, commit and open the harness PR without claiming framework qualification.

## Task 2: Plain LangGraph, no B4 agent/runtime

Files: create isolated `tools/conformance/agent-frameworks/langgraph/{node,python}`
with approved manifests/locks, `host` and top-level test files; extend fixture
manifest/core corpus and both `www/content/docs/{react,angular}/platform/langgraph.md`.

- [ ] Test real upstream JS/Python bridges with deterministic fake models. Compare
  ordinary tool baseline with optional /ui producer enrichment; helper use is
  explicit and never a requirement for the AG-UI baseline.
- [ ] Block tool execution with a test gate and require subscriber START before
  release; cover late START/held CUSTOM, parallel calls, readable tool errors,
  approval interrupt/resume, abort and actual checkpoint restore.
- [ ] Confirm checkpoint metadata and snapshot are read from the same durable
  checkpoint. Audit Node extension points rather than override private hooks.
- [ ] Generate fixtures from those tests, run core consumer conformance and both
  React/Angular browser hosts, verify next-turn native histories and client dispatch.
- [ ] Document each verified version/profile and honest gaps. Add recipes only
  for proven losses; no native SDK transport under this task.
- [ ] Run dedicated Nx host target (define in Task 1), core targeted/full tests,
  conformance lint/test/build, and docs test/lint/build. Independent review + PR.

## Task 3: Mastra qualification

Files: create `tools/conformance/agent-frameworks/mastra/{host.ts,scenarios.spec.ts}`
and approved isolated manifest/lock; extend corpus and create framework-specific
platform guides only after actual version qualification.

- [ ] Pin a published @ag-ui/mastra/@mastra/core/client set matching audited source.
  First prove ordinary local server and client-tool behavior with real bridge
  code and a fake model; do not rely on hand-authored AG-UI traces.
- [ ] Separate profiles for normal tools, live server-tool opt-in, background/
  suspended tools, observational-memory activities and attributed subagents.
  Assert documented option defaults and incompatibilities. Never enable every
  option globally to make a test appear rich.
- [ ] Prove immediate START while blocked, result failure, parent-run cancellation,
  concurrent delegation IDs, child result independence and failure provenance.
- [ ] Test ACTIVITY_SNAPSHOT/DELTA using actual bridge chunks. If terminal background
  delivery is absent, record that limit and leave untilIdle disabled; no fabricated
  completed event or indefinite fixture wait.
- [ ] Exercise fresh restore and next-turn input for every advertised capability;
  reject advertising a live-only profile as durable restore support.
- [ ] Run host tests, generated core fixtures and React/Angular consumers; docs and
  Nx conformance checks. Review and open a separate Mastra PR.

## Task 4: Microsoft Agent Framework display gaps

Files: existing `tools/conformance/dotnet/tests`, `specs`, native fixture host and
package-browser tests; both existing dotnet platform guides. Select exact test
files after Task 0's gap audit, keeping one maintained server host.

- [ ] Map existing native/package/browser/recovery coverage to the shared matrix.
- [ ] Add failing activity, custom-step, readable failure/restore and subagent
  cases only where missing. Preserve native serializer, dispatch fencing,
  approval-journal and owner semantics; no parallel replacement host.
- [ ] Generate/consume versioned evidence and run the existing package-pr-acceptance
  lane plus affected Nx tests/lint/build and cross-framework display checks.
- [ ] Review differences from LangGraph/Mastra as capabilities, not bespoke UI.

## Task 5: Compatibility docs and next candidates

Files: shared capability inventory, conformance README and both framework docs.

- [ ] Publish per-capability qualified versions and limitations, including omitted
  producer evidence, required options and durable versus live-only behavior.
- [ ] Keep model-provider qualification separate from orchestration qualification.
- [ ] Compare Pydantic AI and Google ADK as optional next candidates using their
  real AG-UI producer hooks. CrewAI/AG2/Vercel remain research unless demand or
  existing executable coverage justifies another milestone.
- [ ] Run docs test/lint/build and final independent aggregate review. No upstream
  posting, live recording, publication, release notes or auto-merge in this plan.
