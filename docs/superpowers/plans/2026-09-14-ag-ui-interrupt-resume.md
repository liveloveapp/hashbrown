# AG-UI Interrupt and Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved protocol-standard interrupt/resume contract across core, React, and Angular, verify it against HTTP/SSE transcripts, and merge a focused PR once green.

**Architecture:** An immutable interrupt reducer owns batch identity, claims, resumed-interaction ownership, and recovery. The existing driver/coordinators preserve interrupt outcomes and atomically commit checkpoints without local tool execution. Framework adapters expose public types and defer completion input until full resumed-interaction success.

**Tech Stack:** TypeScript, existing micro-ngrx store, AG-UI 0.0.59, Skillet parser, React hooks, Angular signals/resources, Nx, Jest/Vitest, Playwright. No new dependencies.

**Approved spec:** `design/core/ag-ui-interrupt-and-resume.md` (approved 2026-09-14).

## Execution constraints and verification conventions

- Work in `/Users/blove/.codex/worktrees/519e/hashbrown`, branch `blove/ag-ui-interrupt-resume`, based on current origin/main `cd58105`.
- Follow AGENTS.md. Top-level `test(...)` only; arrange/act/assert blank lines. Public/reusable APIs require TSDoc. Internal cross-package exports use `ɵ`; public signatures do not.
- For every behavior: write the test, observe its expected assertion failure, implement the smallest change, rerun, then refactor. Missing-import/type failures must not be the only red evidence; add minimal declarations if necessary so the behavior assertion fails.
- Use `npx nx <target> <project>` for targets. Set `NX_DAEMON=false` for reproducible local runs. Focused core tests use `--runInBand --testFile=<file> --skipNxCache`.
- Store progress/evidence in this plan. Commit exact task files after focused tests and diff checks; no product-name references in commit/PR text. Do not stage unrelated changes.
- Implementation review has separate spec-compliance and code-quality passes. Fix important findings before proceeding; final verification is not replaced by focused tests.

## File responsibilities

| Unit | Files | Responsibility |
| --- | --- | --- |
| Public contracts | `packages/core/src/models/interrupt.ts`, `models/index.ts` | Owned public Interrupt, PendingInterruptBatch, ResumeEntry, ResumeOptions |
| Validation | `packages/core/src/transport/interrupt-validation.ts` | Pure owned JSON shape, expiry, batch membership validation |
| Ownership | `packages/core/src/reducers/interrupts.reducer.ts`, `actions/dev.actions.ts`, `actions/internal.actions.ts`, `reducers/index.ts` | Synchronous claim, acknowledgment, release, recovery, retirement |
| Driver and request | `transport/ag-ui-run-driver.ts`, `transport/hashbrown-run-agent-input.ts` | Validated terminal distinction and exact wire resume array |
| Execution | `effects/logical-run-coordinator.ts`, `effects/logical-run-retry-policy.ts`, `effects/assistant-turn-coordinator.ts`, `effects/generate-message.effects.ts` | Retry boundary, no paused tools, resumed interaction lifecycle |
| Projection | `reducers/ag-ui-message-accumulator.ts`, `reducers/streaming-message.reducer.ts`, `reducers/status.reducer.ts` | Partial output at pause; atomic idle and batch publication |
| Runtime API | `packages/core/src/chat-runtime.ts`, `public_api.ts` | Public commands/signals and synchronous guards |
| Completion scheduling | New `packages/core/src/utils/completion-input.ts` if shared logic is useful; otherwise focused local helpers | Latest-input deferral, successful interaction release, new-thread reset |
| React | Six `packages/react/src/hooks/use-{chat,structured-chat,ui-chat,completion,structured-completion,ui-completion}.tsx` | Values/commands and completion deferral |
| Angular | Six matching `packages/angular/src/resources/*-resource.fn.ts` | Signals/commands and completion deferral |
| Conformance | `tools/runtime-smoke/e2e/specs/interrupt-resume.spec.ts`, existing independent endpoint harness and plain/structured/UI smoke screens | Real gated request/event assertions |
| Documentation | `www/analog/src/app/pages/docs/{react,angular}/concept/interrupt-and-resume.md`, nearby navigation files | Usage and limitations; no persistence claims |

## Task 1: Baseline and owned protocol contracts

- [x] Install locked dependencies (`npm ci --ignore-scripts`); inspect install warnings and verify no lock changes. Run required package postinstall only if a specific runtime requires it.
- [x] Discover effective targets using `npx nx show project core --json`, similarly react/angular/runtime-smoke; inferred React test/lint targets may not be in project.json.
- [x] Run `npx nx test core --runInBand --skipNxCache`, `npx nx test react --skipNxCache`, and `npx nx test angular --skipNxCache` before changes. Record pre-existing failures; diagnose without changing unrelated code.
- [x] Create `packages/core/src/transport/interrupt-validation.spec.ts`. Test owned clones preserve all optional interrupt fields including subagentRunId; no outcome/success stay ordinary; nonempty batch required; unknown reasons valid; required fields, duplicates, malformed expiry, nested non-JSON values rejected.
- [x] Run focused validation tests red. Implement `models/interrupt.ts` using approved public declarations and `transport/interrupt-validation.ts` using existing JSON clone/freeze helpers and pinned protocol schemas where appropriate. Export public types via models/index.ts. Do not require JSON Schema validation.
- [x] Add outgoing tests: exactly one response per pending ID independent of ordering; reject stale batch ID, duplicates/missing/unknown entries, invalid statuses, non-JSON payload/metadata; omit absent values. Preserve null/false/zero and metadata. Cancelled entries omit payload on the wire; reject a supplied meaningful payload rather than silently deleting it.
- [x] Inject `now` into pure expiry validation. Test exact deadline (`now >= deadline`), expired and invalid timestamps, earliest expiry blocks entire batch, and input mutation leaves owned copy intact.
- [x] Run focused tests green and `git diff --check`; commit `feat(core): define owned interrupt and resume contracts`.

Contract example used by all tests:

```ts
const entries = [
  { interruptId: 'approval', status: 'resolved' as const, payload: { approved: true } },
  { interruptId: 'address', status: 'cancelled' as const },
];
// Resume command includes a local batch ID; wire input includes only entries.
```

## Task 2: Preserve interrupt outcomes and request serialization

**Files:** `transport/ag-ui-run-driver.ts` and `.spec.ts`; `transport/hashbrown-run-agent-input.ts` and `.spec.ts`; `effects/logical-run-coordinator.ts` and `.spec.ts`; `effects/assistant-turn-coordinator.ts` and `.spec.ts`.

- [x] Add a driver transcript with matching RUN_STARTED then interrupt RUN_FINISHED; assert a distinct interrupted outcome retaining the owned batch. Red command: `npx nx test core --runInBand --testFile=packages/core/src/transport/ag-ui-run-driver.spec.ts --skipNxCache`.
- [x] Add invalid-interrupt tests asserting no terminal acceptance callback and nonretryable protocol error; retain identity checking and response disposal.
- [x] Implement outcome propagation (`{ kind: 'interrupted', interrupts }`) through driver and both coordinators. Assistant-turn coordinator returns immediately without reading/reserving/executing local tools. Compile all exhaustive outcome branches.
- [x] Add request tests for optional readonly resume entries lowered to wire input, no batchId field, no resume on ordinary runs, absent state omitted, canonical IDs retained. Red, implement optional `resume`, green.
- [x] Add logical-run tests that count sends: initial resumed request may retry before onStarted, cannot retry after onStarted; ordinary runs retain existing retry behavior. Use an explicit per-model-run resume marker, not the interaction-wide UI flag, to select policy.
- [x] Recheck expiry immediately before each actual send, including after transport factory setup; if expired, do not invoke transport.send. Preserve exact captured input across retries except opaque per-attempt run/request identity.
- [x] Run all four focused suites green; commit `feat(core): preserve interrupted run outcomes and resume requests`.

## Task 3: Synchronous interrupt ownership and runtime commands

**Files:** new `reducers/interrupts.reducer.ts`/`.spec.ts`; `actions/dev.actions.ts`, `actions/internal.actions.ts`, `reducers/index.ts`/`.spec.ts`, `chat-runtime.ts`/`.spec.ts`, `reducers/agent-state.reducer.ts` and relevant tests.

- [x] Write pure reducer transitions and runtime preflight tests before implementing. Add minimal declarations to reach behavioral red if necessary. Cover lifecycle below, stale generation/attempt tokens, and all no-op releases from replaced ownership.

```text
valid interrupt terminal -> pending(batch)
valid resume(batch.id) -> claimed(batch, generation, captured input)
matching RUN_STARTED -> consumed(resumed generation)
failure/stop before any start -> pending(same batch, unless retired)
expired before send -> pending visible + error, no actionable send
failure/stop after initial acknowledgment -> recovery-required
successful whole interaction -> idle
another interrupt -> pending(new batch ID)
different thread -> idle; old callbacks rejected
```

- [x] Reserve ownership synchronously before asynchronous scheduling. Extend the runtime's reentrant reservation pattern and root action preparation so two calls in the same stack cannot both claim; a listener calling resume/setState during dispatch cannot race validation. Invalid API calls mutate nothing.
- [x] Expose `pendingInterrupts`, `isResuming`, and `resume(options): void`. Keep batch ID out of shared state/wire payload. Register resume as an explicit scheduling action even if the canonical tail normally would not trigger generation.
- [x] Test `setState()` allowed while pending; same-stack state write after valid claim rejected; invalid resume leaves state writable. Capture state/messages/options required for resume before debounce/factory resolution (the existing factory is synchronous).
- [x] Test pending/claimed send/setMessages/resend/reload rejection; recovery guard blocks every scheduling route. Retain existing explicit-message supersession after consumption unless recovery is required, as approved; deferred completion input remains blocked until success.
- [x] Test same effective thread ID no-op, changed ID/explicit undefined retirement, stable local checkpoint, no stale callback mutation, new identity when generated from undefined. Updating unrelated options must not retire a batch.
- [x] Run reducer/root/runtime tests green; commit `feat(core): own interrupt batches and synchronous resume claims`.

## Task 4: Atomic checkpoint finish, hard pause, and recovery integration

**Files:** `effects/generate-message.effects.ts`/`.spec.ts`; `reducers/streaming-message.reducer.ts`/`.spec.ts`; `reducers/ag-ui-message-accumulator.ts`/`.spec.ts`; `reducers/status.reducer.ts`/`.spec.ts`; `reducers/index.spec.ts`; `chat-runtime.spec.ts`.

- [x] Write gated transcripts that publish STATE_SNAPSHOT/DELTA, MESSAGES_SNAPSHOT, proposed calls, then interrupt. Assert a subscriber observes committed messages/state/batch with idle flags atomically and a registered matching handler has zero invocations. Observe red.
- [x] Split interrupt finish from ordinary finish in the coordinator effect. Validate before acceptance, commit all slices in the existing store transaction, never reserve tools, clear attempt ownership only on commit, settle interrupted interaction without manufacturing assistant output/error.
- [x] Add structured/UI tests where content is absent or schema-incomplete at interrupt; keep available streaming projection and canonical checkpoint without calling success-only finalization that invents Invalid structured output. Malformed events/JSON that already produced actual parser/protocol errors remain errors; do not suppress unrelated validation failures.
- [x] Add resume transcripts checking exact committed state/history (including paused application state edits), response entries, baseline tool IDs, and server TOOL_CALL_RESULT for old calls without a repeated start. Add a new call and prove only it executes locally.
- [x] Test retries roll back partial drafts; batch remains visible while claimed; matching start consumes it; stop/failure/expiry behavior matches spec; duplicate/stale resumed commands fail without affecting active execution.
- [x] Track interaction-wide `isResuming` through genuine new tools and ordinary follow-up runs. Initial request/retries alone carry resume. Whole-interaction terminal failure/cancel after initial acknowledgment sets recovery even if a later retry failed before its own start. Keep earlier successful checkpoints/tool results.
- [x] Verify thread retirement and reentrant terminal subscribers cannot leak late events, stale claims, old tool settlement, or old draft commits. Test independent new batch IDs when server reuses interrupt IDs.
- [x] Run focused suites and full core test/build/lint/API report/e2e. Review spec compliance, then code quality. Commit `feat(core): commit interrupted checkpoints and enforce resume lifecycle`.

## Task 5: Framework chat parity

**Files:** React `use-chat.tsx`, `use-structured-chat.tsx`, `use-ui-chat.tsx` and matching specs; Angular `chat-resource.fn.ts`, `structured-chat-resource.fn.ts`, `ui-chat-resource.fn.ts` and specs; package public API/type exports as needed.

- [ ] Add real runtime-backed tests with controllable transport for each chat family: batch exposed, claimed visible, matching start clears batch, isResuming through terminal, exact resume entries, duplicate rejection, fresh thread recovery. Observe behavioral red in `npx nx test react --skipNxCache` and `npx nx test angular --skipNxCache`.
- [ ] Add readonly public members using the approved core types. Reuse existing signal adapters; stabilize React commands consistent with existing runtime methods. Avoid new effects for derived batch/status values.
- [ ] Wire Angular values/status independently of Resource output so an interrupt with no assistant value remains observable. Keep existing Resource API behavior and avoid public internal-prefixed types.
- [ ] Verify all text/structured/UI variations and no-interrupt regressions. Build both packages and inspect API output/type inference. Review spec compliance then quality; commit `feat: expose interrupt and resume through chat APIs`.

## Task 6: Completion parity and latest-input deferral

**Files:** Six React/Angular completion modules and their specs. If shared state machine is extracted: `packages/core/src/utils/completion-input.ts`/`.spec.ts`, exported internally from `public_api.ts` with `ɵ` only.

- [ ] Write table-driven scheduler tests for A interrupted, B then C selected, A resumed, C submitted exactly once after full success; B never sent. Also A->B->A must not regenerate unchanged original input. Use framework's existing input identity/eligibility conventions.
- [ ] Test multiple interrupt cycles, before-start stop then successful retry, expiry, post-start failure/stop, local tool/follow-up phases, and new-thread handoff of unchanged latest input. Pending-batch disappearance alone must never release deferred input.
- [ ] Implement minimal latest-input bookkeeping. On a blocked input change, retain only newest input without mutating history. Gate release on successful resumed interaction settlement, not aggregate idle alone. Expose an internal runtime selector/helper if success/recovery cannot be derived reliably from public flags; do not parse error messages.
- [ ] Preserve scheduling when no interruption has occurred; do not make all ordinary completions wait for previous completion. A changed thread clears old ownership/deferral and permits latest eligible input once without resume entries.
- [ ] Add public pendingInterrupts/isResuming/resume to all completion result/ref types. Surface API errors predictably, never as unhandled framework effect errors. Preserve current output until existing projection updates it.
- [ ] Run scheduler/core and React/Angular suites green, then package builds/lints. Review spec compliance then quality; commit `feat: resume interrupted completions and defer latest input`.

## Task 7: HTTP/SSE conformance and user documentation

**Files:** new `tools/runtime-smoke/e2e/specs/interrupt-resume.spec.ts`; existing `harness/independent-endpoint.ts`, `harness/app-driver.ts`, smoke React/Angular screens; new React/Angular concept docs and existing navigation registration.

- [ ] Use existing independent endpoint and event gate. Write browser tests for both frameworks before extending smoke controls. Verify full-batch two-interrupt display, form draft batch ID, disabled controls while claimed, committed state/messages, no execution at pause, exact posted resume, historical TOOL_CALL_RESULT, and successful idle.
- [ ] Add gated failure cases: before-start transport failure preserves batch, post-start failure requires new thread, repeated interrupt ID has fresh batch ID, expiration prevents request. Test one structured/UI interrupted transcript and completion latest-input handoff through a follow-up/tool phase.
- [ ] Run `npx nx test runtime-smoke --skipNxCache`, `npx nx typecheck runtime-smoke`, `npx nx lint runtime-smoke`, `npx nx e2e runtime-smoke --skipNxCache`; build affected smoke applications. Use configured local ports and stop only task-owned servers.
- [ ] Document `pendingInterrupts`, responseSchema, batch-associated draft answers, full responses, cancellation versus denial, state edits, expiry, retry/stop recovery, completion deferral, no reload persistence, thread switching, and server-side idempotency responsibilities. Use protocol reason `input_required`, immutable examples, and no legacy CUSTOM/Activity/A2UI/MCP scope.
- [ ] Build/test/lint docs via available www targets; inspect effective targets rather than inventing missing ones. Review and commit `docs: demonstrate AG-UI interrupt and resume workflows`.

## Task 8: Final verification, reviews, PR, and merge

- [ ] Run `npx nx build core`, `npx nx test core --runInBand`, `npx nx lint core`, `npx nx build-api-report core`, `npx nx e2e core`.
- [ ] Run corresponding build/test/lint/build-api-report/e2e targets for react and angular. If a required target is absent, report that accurately and run the existing equivalent; do not invent targets merely to satisfy a checklist.
- [ ] Run runtime-smoke test/typecheck/lint/e2e and affected app builds; run existing endpoint/progressive tests to protect PRs #537/#539. Run broader affected checks when new failures or CI impact justify them.
- [ ] Inspect generated API reports: additive public types/methods, no internal names in public signatures, no unrelated report churn. Commit intentional reports and relevant documentation only.
- [ ] Independent final spec-compliance review, then code-quality review of `origin/main...HEAD`. Address findings with regression-first fixes and appropriate reruns. Record verified results and warnings.
- [ ] Refresh origin/main and integrate upstream if it changed; rerun relevant checks after conflict resolution. Verify clean status and focused diff.
- [ ] Create focused draft PR using `gh pr create --draft --body-file <file>` with problem/result, protocol limitations, and actual validation. No assistant product names. Existing user instruction authorizes PR and eventual merge; do not ask again for already authorized actions.
- [ ] Mark ready, monitor required CI/preview/aggregate checks, diagnose and fix failures; do not equate local success with CI success. Merge only after required checks are green. Verify merge commit on main and report PR URL and any remaining limitations.

## Progress and evidence

- [x] Spec independently reviewed and approved by user.
- [x] Refreshed origin/main; still cd58105 on 2026-09-14.
- [x] Plan independently reviewed; approved without blocking findings.
- [x] Baseline verified: core 933, React 92, Angular 161 tests passed.
- [ ] Tasks 1–8 complete.

Task 1 completed as 2ed525a and passed independent spec and quality reviews.
Behavioral red/green evidence covers ownership, malformed outcomes, membership,
JSON values, expiry, sparse input arrays, and early-year leap dates. Core 984
tests/17 snapshots, focused validation 51, build and lint passed. Parent reran
focused51 successfully. API report generation passed; existing missing-release
tag warnings remain outside this change. Reports are generated/ignored under
the repository's current convention; inspect them without force-adding them.

Task 2 implemented as 634cd73: driver/coordinator terminal distinction, request
serialization, pre-start retry cutoff and pre-send validation hook. Independent
spec review approved and reran focused 99 tests; quality review approved.
Full core 1,001 tests, build and lint passed.

Tasks 3–4 are being implemented together because claim ownership and atomic
terminal integration are tightly coupled; separate commits remain planned.

Task 7 browser RED established before fixture changes: both Angular and React
fail the interrupted-batch transcript at the missing interrupt-count UI assertion.
Log: /tmp/hashbrown-pr2-browser-red.log. Additional fresh-batch and expiry
transcripts are prepared for the same real HTTP/SSE suite.

Locked dependency installation completed without lockfile changes. npm reported
58 existing audit findings (22 moderate, 36 high), plus deprecation warnings.
Baseline React: 92 tests passed. Baseline Angular: 161 tests passed. Both reported
existing Nx/Vite/Angular configuration/deprecation warnings. Core baseline
completed successfully: 46 suites, 933 tests, 17 snapshots.

Additional browser RED: eight lifecycle cases fail at the expected missing batch
UI, two structured cases likewise, and two completion cases at the missing
completion input. Failure ownership cases also fail at the expected batch UI.
Fixture controls are now prepared against the approved API pending facades.
Docs build/test/lint passed; lint reports 27 existing warnings. Docs build reports
existing API extraction/configuration warnings. Generated TSDoc line-ending
churn was removed.

Smoke harness unit tests (42), typecheck, and lint pass. Full browser green
verification awaits runtime/facade integration. Factory inspection corrected
the plan: transport factories are synchronous; no Promise-returning public
factory API will be introduced. Expiry still runs after setup before each send.

Core Tasks 3–4 initially committed together as 3654b03. Full core 1,021 tests,
17 snapshots, build/lint/API/e2e (3 tests) passed; parent independently reran
16 runtime tests. Spec review reproduced two untested boundary defects:
structured parser errors were not propagated as failed resumed interactions,
and thread retirement synthesized a cancellation result into retained history.
Regression-first fixes are in progress. The latter corrects an inaccurate
pre-existing-behavior assumption in the design; the approved requirement to
preserve committed checkpoints takes precedence over older tests expecting
thread-change cancellation results. Explicit stop/supersession remain distinct.

Adapter integration notes from core review:
- Forward the exact runtime.resume function; the private scheduling accessor
  uses its stable identity, avoiding internal types on public facade results.
- Avoid forwarding an unchanged explicit undefined thread option whenever an
  unrelated option changes: observe thread option changes independently so
  generated thread identities and pending batches survive ordinary rerenders.
- Test reload while pending even when history has no assistant value. Existing
  facade eligibility checks can return false before reaching runtime guards;
  pending/recovery rejection must not depend on having an output value.

Core review fixes committed as 9952608 and 58554aa. Final core verification:
49 suites / 1,026 tests / 17 snapshots; build, clean lint, API report, and
2 e2e suites / 3 tests passed. Parent reran the 21 runtime tests. Spec reviewer
approved after independently running 21 runtime and 125 effects tests; quality
review is in progress. The additional atomic thread update regression proves
an epoch subscriber can submit latest input once using the replacement identity.

Core Tasks 3–4 passed independent quality review at 58554aa. Reviewer reran all
21 runtime tests and found no important issues. Task 5 chat facade parity is
in progress across React/Angular text, structured, and UI families. Preserve
raw resume command identity and keep completion scheduling scoped to Task 6.
