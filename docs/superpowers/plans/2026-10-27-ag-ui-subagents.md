# Native AG-UI subagent implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development serially, with failing tests first and independent specification then quality review. Parent owns staging/commits. Tests are top-level test(...) with arrange/act/assert.

**Goal:** Display native subagent lifecycle and truthful output provenance in Hashbrown, including concurrent streams and interrupt continuation.

**Architecture:** A pure protocol fold owns subagent/stream identity and correlation; canonical root acceptance remains the transaction boundary. Existing message projections preserve owner fields, while per-assistant accumulators retain partial parses. Frameworks expose the same runtime state and neutral types.

**Tech Stack:** Existing TypeScript, AG-UI 1.0.3, Nx/Jest/Vitest/React/Angular; no dependencies added.

**Spec:** `docs/superpowers/specs/2026-10-27-ag-ui-subagents-design.md`; original tool-step Rules remain binding.

## Task 1: Pure protocol and lifecycle model

Create `packages/core/src/models/subagent-run.ts`,
`packages/core/src/reducers/ag-ui-subagents.ts` and
`packages/core/src/reducers/ag-ui-subagents.spec.ts`.

- [x] Define public readonly SubagentRun exactly as the spec, with TSDoc; do not export the public barrel yet.
- [x] Write failing tests for lifecycle transitions/validation, unknown/late attribution, null compatibility, opaque/prototype IDs, closed parents, duplicate starts, independent owner-specific step names, snapshot ownership, tool parent inheritance/results, ID-based continuations and ambiguous chunks.
- [x] Run `NX_DAEMON=false NX_ISOLATE_PLUGINS=false npx nx test core --testFile=ag-ui-subagents.spec.ts --runInBand --output-style=static`; record assertion or missing-module RED.
- [x] Implement a pure constructor seeded from native messages and optional prior records, plus fold returning `{ state, events }`. `events` holds implicit chunk ends followed by the normalized original event. Export reusable internal helpers with TSDoc (ɵ prefix when later shared through core root). No global mutable state or clocks.
- [x] Use distinct owner buckets and Map keys (undefined parent vs empty string), immutable copies and original state identity for unchanged events. Follow installed SDK verifier/chunk semantics, retaining native history validation as caller responsibility.
- [x] Run focused tests/scoped lint; independent spec review, then quality review; fix findings and parent commits only reviewed files.

## Task 2: Lossless public/native provenance

Modify `packages/core/src/models/{view.models.ts,internal.models.ts,internal_helpers.ts,server-tool-call-display.ts}`;
`packages/core/src/reducers/{ag-ui-message-history.ts,ag-ui-message-accumulator.ts,ag-ui-activity.ts}`;
their existing specs. Add a focused owner-aware reasoning helper module/spec if needed to share the three projection/index loops.

- [x] Write failing round-trip tests for assistant/user/call subagentRunId and independent resultSubagentRunId, including client-settled parent results, native restored history, encrypted/provider continuation metadata and frozen inputs.
- [x] Add public/internal optional fields with TSDoc; carry them through source projection, cached reconciliation, view conversion and lowering. ToolCall has no native tag, so use its assistant owner; tool-result tag stays independent.
- [x] Make reasoning association owner-aware in source indexes, full projection, cached reconciliation and hydration; sibling assistants/results must not consume another owner's pending reasoning. Preserve prior untagged behavior and cancellation/diagnostic barriers.
- [x] Make activity recomputation use latest assistant/tool per owner, retaining replacing-snapshot semantics. Add caller/result owner identity barriers to existing call grouping, with a failing cross-owner regression first. Keep shared agent state run-scoped.
- [x] Run affected focused core specs with confirmed RED/GREEN and scoped lint; independent spec then quality review; parent commits.


Reviewed fixes also thread the current schema through local provenance indexing
in messages.reducer.ts and align two existing activity fixtures with same-owner
link semantics. Full core after all fixes: 102 suites, 2,400 tests, 14 snapshots
passed; build/lint passed with three pre-existing tool-step warnings.

## Task 3: Root acceptance, concurrency and resume

Modify `packages/core/src/reducers/{ag-ui-messages.reducer.ts,index.ts,streaming-message.reducer.ts}` and existing root/streaming specs. Add focused `packages/core/src/reducers/subagent-integration.spec.ts` (real root store) as useful. Use small leaf helpers rather than growing the existing large reducers unnecessarily.

- [x] Write root-store failing tests using `createStore({reducers,prepareAction:ɵprepareRootAction})`: siblings and parent interleave text/tool/reasoning chunks, unknown tags, parent/sole/ambiguous chunks, mismatches rejected without changing any projections, owned steps and attributed shared state.
- [x] Integrate the pure fold before canonical application; remove reliance on global pointers for correlation. Apply normalized events/implicit chunk ends atomically; expose internal accepted event batches for streaming consumers as needed. Keep normal single-owner selectors and canonical ID behavior compatible.
- [x] Store committed and speculative lifecycle data with existing attempt ownership. Commit on accepted completion/interruption; discard rejected/retried/stopped speculative work. RUN_FINISHED validates announced invocations are closed; RUN_ERROR can abort them. Subagent errors do not fail enclosing runs or invent tool-step outcomes.
- [x] Retain one parser accumulator per assistant message; aggregate all partial view/tool projections, preserving legacy foreground selectors for tests. Snapshot replacement reseeds all accumulators; closure only affects the owning lane. Test partial structured JSON and tool arguments across owner switches, not only plain text.
- [x] Track the exact claimed resume batch. At matching resume acknowledgement resolve waiting records through interrupt IDs, including suspended ancestors; reused IDs continue their rows and new IDs do not leave old rows waiting. Commit answered-wait resolution so post-ack rollback cannot resurrect answered approvals; pre-ack failures retain waiting. Ignore stale claims/acknowledgements.
- [x] Seed unknown records on restored history and awaiting owners from restored native interrupt batches. Clear/reseed on replacement/thread reset. Add no lifecycle wire/storage fields.
- [x] Run focused root, projection, streaming, interrupt/runtime regressions and complete core test/lint/build; independent spec then quality review; parent commits.


Task 3 reviewed fixes include known-ID parent reuse, schema removal/provider
parsing guards, partial hydration, exact resume ownership and stable partial-tool
references. Full core before the last isolated guards: 103 suites / 2,440 tests /
14 snapshots passed. Final seven focused suites: 378 tests passed; core build
and lint passed with three pre-existing warnings. Root suite has 46 cases.

## Task 4: Reactive public state, docs and verification

Modify core `chat-runtime.ts`, model barrel; React chat/UI/structured facades and `public-api.ts`; Angular chat/UI/structured resources and `public_api.ts`; appropriate existing runtime/facade specs; both installed-package compatibility tests and both framework activity/tool guides. Inspect decision chat adapters for forwarding rather than adding unrelated APIs. No completion-only API expansion unless an existing shared chat facade requires it.

- [x] Write failing core/runtime/framework tests for a readonly live subagents property and typed SubagentRun. Forward the same state through structured/UI chat without private ɵ types in public signatures or extra render effects/state.
- [x] Expose core StateSignal, React readonly array and Angular Signal; export the shared public type from all entrypoints.
- [x] Extend installed consumer checks with actual UiChatMessage types, owner/result fields and lifecycle state access. Do not add new installs/dependencies to the test infrastructure.
- [x] Document lifecycle, nesting links, provenance, result independence, attribution-only/unknown restored records, suspension/resume and one shared run state. Use pure derived data and retain existing demos. Keep file search deferred and no release notes.
- [x] Run core unit/build/lint/e2e; React unit/build/inferred eslint:lint/e2e; Angular unit/build/lint/e2e; API reports for all three; docs test/lint/build. Use bounded workers and static logs, report warnings accurately.
- [x] Independent spec then quality review, followed by aggregate review. Update verification evidence and parent commits.

## Delivery

- [x] Confirm #805 merged when its refreshed CI turns green; keep other merges moving. No background schedule.
- [x] Fetch main and replay only this branch's subagent commits onto main after #805 squash merge (current feature base ed0f431e). Resolve genuine conflicts without losing other work; verify after any source changes.
- [x] Publish and attach reviewable PR #812 (initially stacked on #805, then rebased and retargeted to main after its merge). No automatic merge of this next PR without authorization. Keep the managed worktree attached for review.

## Baseline

Locked dependencies installed with no manifest changes. Core baseline passed
before implementation; logs `/private/tmp/hashbrown-subagents-core-baseline.log`.
Existing setup warnings include ignored install scripts, Nx/Vite deprecations,
color environment flags, project discovery and local pyenv shim permissions.

## Final verification

All four tasks passed independent specification and quality review; aggregate
review found no remaining P1/P2 findings. Core: 103 suites / 2,448 tests / 14
snapshots; React: 21 files / 222 tests; Angular: 24 files / 290 tests; docs:
230 files / 1,575 tests after rebasing onto merged main. Distribution suites passed core 5, React 4 and Angular 2
tests, including clean installed-package TypeScript checks. Core, React, Angular
and docs builds, all three public API reports, and affected lint targets passed.
The four new documentation examples parse successfully.

Warnings: three existing core lint warnings and ten existing React lint warnings;
Nx/Vite executor/plugin deprecations and color flags; API extractor release-tag,
link and forgotten-export warnings (including the docs extractor's existing
external core namespace limitation for JsonValue referenced by SubagentRun);
Next.js middleware deprecation and two dynamic filesystem tracing warnings.
No dependencies, release notes, live recordings or file search were added.

Verification logs: `/private/tmp/hashbrown-subagents-final-{core-test,core-e2e,
react-e2e,angular-e2e,core-api,react-api,angular-api,www-test,www-lint,www-build}.log`
and `/tmp/task4-{react,angular}-all.log`, `/tmp/task4-{core,react,angular}-lint.log`.

PR #805 merged with all required checks green at 2026-10-28T06:41:55Z as
`5fcb8b4cf64e023cde7eddea5320dab2265a8695`. Its previous job was cut off by
the 75-minute overall limit after all preceding suites passed. A reviewed
75-to-90-minute budget adjustment allowed the final native browser regression
to complete in about 4.5 minutes. The eight subagent commits replayed onto main
without conflicts; range-diff confirmed every patch unchanged.

Post-rebase core (2,448), React (222), Angular (290), docs (1,575) tests and
affected lint targets passed again. Source patches remained identical.

## PR #812 CI follow-up

The .NET native projection parity check exposed a regression: an explicitly
parented tool changed the owner-local text assistant fallback for the next
parentless call. Preserve the actual text assistant context while retaining
each tool's independent stored parent. Eight parent/child, explicit/chunk and
text/no-text cases failed before the fix and passed afterward. The unchanged
.NET parity test also failed before and passed after the core fix. Independent
review approved the change. Full core: 103 suites / 2,456 tests passed; build and
lint passed with the same three existing warnings. Main was merged cleanly
before verification. File search remains deferred.
