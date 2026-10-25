# Chrome Tool Phases Implementation Plan

> Use the executing-plans/subagent-driven-development workflow with independent
> spec and quality review. The user authorized design and implementation through
> merge/verification; routine API choices do not require duplicate approval.

**Goal:** Let applications select a single tool phase or direct schema/UI
finalization from validated current-turn history.

**Architecture:** Keep full canonical history validation and native typed replay;
select request-local active declarations before native session creation. Reuse
framework handlers and final output rendering. No shared phase counter or deps.

**Tech Stack:** TypeScript, Nx, Jest, Playwright, aimock, downloaded Chrome v4.

## 1. Core contract and implementation

Files: new `packages/core/src/transport/chrome-tool-phase.ts` and `.spec.ts`;
`experimental-chrome-tools-transport.ts` / `.spec.ts`; `transport/index.ts`.

- [x] Write failing tests for context extraction and deeply frozen ownership,
  including raw errors, previous turns, missing user and rejected selections.
- [x] Run `npx nx test core --runInBand --testPathPatterns='chrome-tool-phase|experimental-chrome-tools-transport'`;
  verify intended failures before implementation.
- [x] Implement the public types/context+selection helper in a focused file.
  Evaluate once before capability checks after full history validation.
- [x] Add transport tests for selected-only declarations, unchanged typed history,
  direct constrained terminal request with historical-only native declarations, atomic exactly-one selected call, no-call
  error, no tool-phase prose, abort/disposal and overlapping turns/defaults.
- [x] Implement explicit tool/finalize stream modes without altering defaults.
  Export public types and document all reusable/public functions.
- [x] Run focused/full core tests, build/lint/API report; review spec and quality.

## 2. Native replay feasibility and framework contracts

Files: both hosts' `local-transport.ts`, optional shared phase policy;
`tools/conformance/local-models/native-ui-workflows.e2e.ts` and native config/targets
if needed to keep model-led evidence/tests distinct; conformance README.

- [x] Add an explicit application-phase fixture opt-in and failing aimock tests
  before wiring. Keep model-led fixtures/22 contracts available unchanged.
- [x] Select phase from completedCalls/current user, not mutable closure state;
  lookup-only and dependent workflows finalize immediately after required result.
- [x] Verify exact selected tool lists, number of prompts, raw schema/tree, real
  operations/props/DOM, replay and Stop/recovery with adversarial repeats.
- [ ] Build hosts and run native typed-history compatibility for changed tool and
  terminal sessions retaining historical declarations but no executable calls. Stop for a design decision if Chrome rejects replay.
- [x] Run deterministic phase and existing model-led contracts; keep CI refusal.

## 3. Qualification and integration

- [ ] Run two predetermined complete native production phase samples, retaining
  all prompts/chunks/schemas/DOM/errors/resources; do not retry unchanged to pass.
- [ ] Update recipes/research/API and the PR body with actual scope/results.
- [ ] Synchronize main without overwriting pending checkpoint docs; run affected
  build/test/lint/API, host/conformance TypeScript and browser/provider/local suites.
- [ ] Independent spec/quality review; address feedback and verify final diff.
- [ ] Push/attach PR #749, wait for exact-head green CI, merge and compare reviewed
  tree to merged main. Preserve worktree and no package publication.

## Native feasibility blocker

The independent raw probe passed changed-tool typed replay but zero-declaration
finalization rejected typed history with NotSupportedError (session not
initialized with tool support). Core implementation tests pass, but this native
contract does not. Stop framework implementation and qualification pending the
user's choice. An explicit historical-declarations alternative is being probed;
no production workaround is authorized by the current design. Retain full evidence
in the dated phase research and preserve existing broad/bounded failures.

## Reviewed compatibility adjustment

The user authorized application-controlled phase design and implementation.
Independent review approved preserving zero executable calls during finalization
while retaining only native declarations referenced by validated typed history,
in original catalog order. This is browser replay compatibility; the model may
see retained names, but every attempted call fails before executable events or
handlers. No unused/dummy declarations, history flattening or hosted fallback.
Update the earlier blocked zero-native-declaration design to this explicit
contract, retain both raw probe failures and resume implementation.

Predetermined native matrix: both frameworks each run lookup/leaf, dependent
lookup/follow/leaf, lookup/nested and no-tools/leaf (8 cases), plus a dependent
workflow followed by a new user turn with no additional tools (2 replay cases),
then a second full
sample with unchanged source/instructions/assertions. Include assistant replay
and fresh current-turn context in deterministic contracts. The native phase
identity/declarations, exact tool operations, raw constrained output, parsed
trees, DOM and resource checks must all pass; retain every failure.

A reviewed private phase directive is appended to the same native prompt after
the complete unchanged canonical-history prefix. Tool names are JSON-quoted;
terminal instructions state tools are complete. Context extraction happens
before appending, no extra inference pass occurs and default mode stays
unchanged. Verify directives remain absent from canonical/replayed history and
rendered output; raw evidence retains them. Instructions do not relax validation.
