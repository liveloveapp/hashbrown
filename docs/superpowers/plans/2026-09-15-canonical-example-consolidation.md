# Canonical Example Consolidation Implementation Plan

> Execute using superpowers:executing-plans, with independent review at each boundary.

**Goal:** Make invoicing the canonical example and e2e owner, preserve all inventoried
non-Vox behavioral coverage, fix unbounded model context, and retire legacy sources.

**Architecture:** Real React/Pretable application with B4 agents; deterministic
application scenarios plus internal Angular/React conformance and native-provider
hosts all owned by `samples/invoicing/e2e`. Dedicated test hosts are excluded from
the public app build. Library unit tests stay in their libraries. No new packages.

**Tech Stack:** Existing Nx, React, Angular, B4, Pretable, Jest, Vitest, Playwright,
aimock, OpenAI adapter, TypeScript.

Scope authority: latest user revisions in `2026-09-15-legacy-example-retirement.md`.
Ledger design: `../specs/2026-09-15-invoicing-ledger-queries-design.md`.
Assertion baseline: `canonical-example/assertion-baseline.json` (22 files, 67 static
test declarations, 491 expect sites; parameterized runtime counts differ).

## Coverage destinations and real application scope

| Existing suite | Preserve | Canonical destination / meaningful application scenario |
|---|---|---|
| plain-streaming, gated-progressive | partial text before terminal, explicit gate release, idle/error state | conformance/specs unchanged; application financial explanation streams before completion |
| structured-output | incremental typed values and completed result | conformance/specs; bounded financial-summary/trend response displayed as trusted insight UI |
| generative-ui | schema-constrained trusted components and progressive rendering | conformance/specs; allocation and ledger insight cards in the real application |
| request-contract | exact plain/structured/UI requests, stable thread/message IDs, schema placement | conformance/specs; application captures its actual contextual requests without exposing full ledger |
| tool-continuation | three sequential tools exactly once, history/opaque metadata preserved, final probe | conformance/specs; summary → filtered payments → selected detail read-only workflow |
| reasoning | provider-supplied safe summary and opaque metadata retained | conformance/specs; do not expose encrypted payloads or fabricate chain-of-thought in product UI |
| cancellation | partial result cancellation and explicit new send | conformance/specs; add a real assistant Stop action and verify composer recovery without ledger mutation |
| retry-and-errors | transport/run failure and missing-terminal retry without history corruption | conformance/specs; application contextual retry/error state, avoiding blind financial retries |
| interrupt-resume | complete batches, fresh identities, expiration, before/after acknowledgment stop/failure, partial structured interruption, deferred completion | conformance/specs; retain actual allocation locking, approve/decline and unknown-result reconciliation tests; synthetic protocol edge cases remain internal |
| endpoint-interop | plain/tool/structured/UI against independent HTTP server | conformance/specs; keep actual HTTP boundary, not only page-level mocked JSON |
| Smart Home native browser cases | strict schema forwarded to provider, real SSE, trusted UI, one tool mutation/continuation, thread/tool history, no browser errors | provider/native-ui.spec.ts, both Angular and React internal hosts using native adapter; replace light state with simulated payment-selection state, never an unapproved allocation |
| Fast Food and Smart Home route unit cases | Express and Worker content type/events and injected config | provider/routes.spec.ts and provider/fixtures; real HashbrownOpenAI boundary with aimock upstream |
| harness unit suites | gates, abort cleanup, SSE terminal identity, input validation, hygiene allowance counts, aimock teardown failures | conformance/harness, assertions moved intact |
| invoicing workflow/live suites | ambiguous selection, advances, failed review retry, unknown allocation outcome, approvals/declines/isolation | retain existing files and domain assertions |

The JSON baseline records original assertion expressions and line references. For
each adapted assertion, record its destination file/line, framework/platform,
equivalence evidence and verified status in the JSON. Unchanged copied suites can
use verified body identity plus both-framework test results; record that evidence
for their assertion entries. No pending assertion can pass the migration gate. Never satisfy
coverage by lowering counts, deleting difficult assertions, or substituting React
for Angular. Extra product scenarios complement rather than replace exact protocol
assertions. Test hosts should remain small; no second user-facing showcase.

## Batch 1: Establish canonical e2e ownership (no feature deletion)

Files: `samples/invoicing/e2e/project.json`, dedicated `jest.conformance.config.ts`,
`tsconfig.conformance.json`, `conformance.playwright.config.ts`, `conformance/`,
`hosts/{react,angular}/`; source `tools/runtime-smoke/{e2e,react,angular}`.

- [x] Copy harness/specs/fixtures to canonical conformance paths, preserving bodies.
- [x] Move internal framework hosts under canonical e2e, updating relative tsconfig,
  package aliases, build outputs and project roots. Keep Nx host project names
  initially to limit graph churn. The canonical project owns their build dependencies.
- [x] Add a Jest `test` target for harness tests and distinct conformance browser
  target. Extend canonical build/lint to all new files; keep Jest/Playwright discovery
  separate so unit suites never import browser suites accidentally.
- [x] Define `conformance-e2e` and rename the current application runner to
  `application-e2e`. Configure `example-e2e` to run those two targets sequentially
  without self-recursion. In Batch 2 add `provider-e2e` only once it exists and passes.
  Live-model remains explicitly opt-in.
- [x] Validate target discovery via `npx nx show project invoicing-e2e --json`.
- [x] Run `npx nx test invoicing-e2e`, `npx nx build invoicing-e2e`,
  `npx nx lint invoicing-e2e`, and canonical conformance target: expect retained
  42 harness cases and 56 both-framework browser cases before replacements.
  Run `npx nx conformance-e2e invoicing-e2e` for the browser baseline.
- [x] Update CI artifact paths and verify affected detection for core, Angular,
  React and provider changes. Keep the old runner, sample-specific specs and
  their build/serve edges until Batch 2 has replaced native-provider coverage.

## Batch 2: Remove native-provider dependence on showcases

Files: `samples/invoicing/e2e/provider/{routes.spec.ts,native-ui.spec.ts,fixtures/}`,
internal hosts, project/config files; old route/example specs.

- [ ] First transplant assertions to new tests pointing at missing test-owned
  routes; run targeted suite to establish failure before writing handlers.
- [ ] Implement minimal Express and Worker handlers using existing HashbrownOpenAI
  and EventEncoder. Explicitly inject credentials/base URL/model into test hosts.
  Preserve HTTP content type, lifecycle, cancellation and teardown behavior.
- [ ] Adapt the two browser scenarios for both framework hosts; verify UI rendering
  and one simulated selection tool with delayed continuation. Keep all original
  provider request/schema/history/browser-error assertions from the baseline.
- [ ] Include `provider/routes.spec.ts` explicitly in the canonical Jest
  testMatch alongside conformance/harness; exclude `provider/native-ui.spec.ts`
  from Jest and route tests from Playwright. Use `npx nx test invoicing-e2e
  --listTests` plus Playwright listing to verify each file is discovered once by
  its intended runner; retain all three migrated route cases.
- [ ] Add `provider-e2e`, then include it in the canonical `example-e2e` umbrella.
  Run canonical test/build/lint/example-e2e. Verify native provider scenarios
  execute four framework cases and the three route cases remain represented.
- [ ] Remove old imports and Smart Home build/serve edges only after these pass.
  Require `rg 'samples/(smart-home|fast-food)' samples/invoicing/e2e tools/runtime-smoke`
  to find no executable dependencies (the old tools tree may now be absent).
- [ ] Independent review checks assertion equivalence before committing migration.

## Batch 3: Realistic ledger tools and performance

Files: server `assistant-middleware.ts`, `assistant-tools.ts`, new
`ledger-query.ts`/`ledger-query.spec.ts`, B4 assistant tool files and prompt;
React trusted insight components; e2e application and performance scenarios.

- [ ] BEFORE any query/model change, record three baseline runs of each of the
  four prompts below against the unchanged implementation, including payloads,
  first UI time, completion, tool count and correctness. Use the same seed/model
  and fresh-session policy for the later comparison. Existing two timing samples
  are diagnostic evidence, not a sufficient comparative baseline.
- [ ] Write failing pure query tests for summary-without-records, 20 default / 50
  maximum page size, filters, current balance date semantics, currency-separated
  totals, stable pagination, session isolation, invalid/stale cursors and changes
  after allocation. Summary fixture response must stay below 4 KB.
- [ ] Implement summary, list and detail tools as specified in the ledger design.
  Validate boundaries in server code, not only model schemas. All nested record
  collections are bounded. Monthly grouping is opt-in, maximum 24 buckets.
- [ ] Add deterministic e2e assertions that the agent's routine tool result contains
  no complete history, pages report truncation, and displayed aggregates are exact.
- [ ] Add financial insight components as needed for visible totals/trends, with
  application-owned validation and no new mutation capability. Add Stop/retry
  behavior with failing React and browser tests first. Preserve batch authority.
- [ ] Profile the same four prompts: total unapplied, matching candidates, selected
  payment explanation and 24-month comparison; then ask again after an allocation
  in the same thread and session, checking fresh totals rather than cached history.
- [ ] Record tool bytes, first UI time, total duration, tool count and correctness
  for three runs each. Compare context-only changes before tuning reasoning.
  Target: seeded summary under 4 KB, no unbounded result, median first useful UI
  under 10 s for totals and 20 s for matching/trends, median completion under 30 s.
  These are proposed acceptance goals, not measured promises or a CI network SLA.
  Report misses; do not silently relax budgets. Use deterministic payload/count
  gates in CI and record live latency separately to avoid flaky network thresholds.
- [ ] Only experiment with reduced reasoning or the rendering call after baseline
  measurements; preserve exact trusted output and answer quality. Do not claim an
  intermittent-failure fix without a reproducer.
- [ ] Run server/React/contracts build/test/lint, canonical complete deterministic
  suite, and real Chrome use plus explicit live-model evaluation.

## Batch 4: Retire Vox and Lambda repository surfaces

This does not depend on canonical hosting; these features are explicitly dropped.
Files: `packages/vox`, `samples/react-vox-demo`, `wasm/vad-audio-worklet`,
`samples/lambda-chat`, `nx.json`, `tsconfig.base.json`, `package*.json`, docs.

- [ ] Inventory all tracked VAD/WASM build scripts/assets and references before
  removal; `wasm/vad-audio-worklet/promote.sh` and embed scripts feed Vox assets.
- [ ] Remove Vox package/demo/build sources and aliases/plugin overrides together.
  Remove Lambda source/Nx/Serverless config and commands. Do not invoke deploy,
  Serverless remove or unpublish; external resource cleanup is separate.
- [ ] Inspect release-version test fixtures referencing Vox; replace obsolete
  sample fixture names only when needed while retaining their generic assertions.
- [ ] Use `npm explain` and source/config scans before pruning exclusive dependencies;
  regenerate lockfile with existing package manager, add no dependencies.
- [ ] Run `npm ls --all`, Nx graph/affected checks, release-version script tests and
  affected build/test/lint; retain archival changelog entries.

## Batch 5: Retire remaining legacy showcases and public references

Blocked on migrated coverage, performance acceptance, and canonical deployment.

- [ ] Verify canonical deployment separately: record its deployed revision and URL,
  check same-origin snapshot/agent endpoints, then run the question/approve/decline
  and session-isolation scenarios against that URL. If no canonical deployment is
  available, stop Batch 5 at an explicit deployment prerequisite; retain showcases
  and their public targets. Batches 1–4 remain independently deliverable.
- [ ] Remove remaining legacy roots, Nx references and exclusive dependencies using
  the inventory, including hardcoded Smart Home Storybook CI step and its tests.
- [ ] Update README, contributing, AGENTS, sample pages/navigation and framework
  onboarding; Angular docs must still teach Angular. Retain useful recipe content.
- [ ] Update Cloudflare target registry/tests and redirect/archive public links.
  External resources/DNS deletion requires its separate inventory.
- [ ] Final gate: all canonical e2e targets discover/run migrated assertions;
  no active legacy imports/commands/links; npm tree and affected CI pass.

## Execution boundary

Proceed in reviewable batches on isolated branches. Keep old coverage runnable
until replacement passes. No refresh persistence, collections, new financial
mutation type, new dependency, new AWS deployment or library public API expansion.
The original retirement inventory remains the source map; its old tools-based
permanent destination is superseded by this canonical-owned layout.

## Plan review

Independent review approved the plan after correcting preservation ordering,
pre-change performance measurement, assertion-level equivalence tracking and
provider unit-test discovery. All 491 assertion IDs are unique; all 22 baseline
source files exist. This is planning evidence only; migration statuses remain
pending until implementation and execution verification.

## Batch 1 execution checkpoint

Canonical e2e now owns copied harness/specs and relocated Angular/React hosts.
All 28 harness/spec/fixture files match original bodies after relative import
adjustment; all 18 host source/assets are unchanged. Old native-provider runner
remains runnable until Batch 2. The canonical project graph responds to core,
Angular, React, OpenAI and host changes.

Verified: canonical build/lint; 42 Jest cases; four application browser cases;
56 conformance browser cases; four retained native-provider browser cases; both
host builds/lints; 116 deployment-workflow tests. Independent review approved.
CI uploads include canonical application and conformance failure artifacts.
Existing Nx/Vite/Jest deprecations, color warnings and host chunk warning remain.
No new dependency or application behavior change. Live-model test was not rerun
for this test-ownership relocation. Native-provider assertion entries remain
pending until their final canonical fixture replacement in Batch 2.
