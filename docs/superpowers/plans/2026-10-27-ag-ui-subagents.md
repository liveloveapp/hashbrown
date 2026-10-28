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

- [ ] Write failing round-trip tests for assistant/user/call subagentRunId and independent resultSubagentRunId, including client-settled parent results, native restored history, encrypted/provider continuation metadata and frozen inputs.
- [ ] Add public/internal optional fields with TSDoc; carry them through source projection, cached reconciliation, view conversion and lowering. ToolCall has no native tag, so use its assistant owner; tool-result tag stays independent.
- [ ] Make reasoning association owner-aware in source indexes, full projection, cached reconciliation and hydration; sibling assistants/results must not consume another owner's pending reasoning. Preserve prior untagged behavior and cancellation/diagnostic barriers.
- [ ] Make activity recomputation use latest assistant/tool per owner, retaining replacing-snapshot semantics. Add caller/result owner identity barriers to existing call grouping, with a failing cross-owner regression first. Keep shared agent state run-scoped.
- [ ] Run affected focused core specs with confirmed RED/GREEN and scoped lint; independent spec then quality review; parent commits.

## Task 3: Root acceptance, concurrency and resume

Modify `packages/core/src/reducers/{ag-ui-messages.reducer.ts,index.ts,streaming-message.reducer.ts}` and existing root/streaming specs. Add focused `packages/core/src/reducers/subagent-integration.spec.ts` (real root store) as useful. Use small leaf helpers rather than growing the existing large reducers unnecessarily.

- [ ] Write root-store failing tests using `createStore({reducers,prepareAction:ɵprepareRootAction})`: siblings and parent interleave text/tool/reasoning chunks, unknown tags, parent/sole/ambiguous chunks, mismatches rejected without changing any projections, owned steps and attributed shared state.
- [ ] Integrate the pure fold before canonical application; remove reliance on global pointers for correlation. Apply normalized events/implicit chunk ends atomically; expose internal accepted event batches for streaming consumers as needed. Keep normal single-owner selectors and canonical ID behavior compatible.
- [ ] Store committed and speculative lifecycle data with existing attempt ownership. Commit on accepted completion/interruption; discard rejected/retried/stopped speculative work. RUN_FINISHED validates announced invocations are closed; RUN_ERROR can abort them. Subagent errors do not fail enclosing runs or invent tool-step outcomes.
- [ ] Retain one parser accumulator per assistant message; aggregate all partial view/tool projections, preserving legacy foreground selectors for tests. Snapshot replacement reseeds all accumulators; closure only affects the owning lane. Test partial structured JSON and tool arguments across owner switches, not only plain text.
- [ ] Track the exact claimed resume batch. At matching resume acknowledgement resolve waiting records through interrupt IDs, including suspended ancestors; reused IDs continue their rows and new IDs do not leave old rows waiting. Commit answered-wait resolution so post-ack rollback cannot resurrect answered approvals; pre-ack failures retain waiting. Ignore stale claims/acknowledgements.
- [ ] Seed unknown records on restored history and awaiting owners from restored native interrupt batches. Clear/reseed on replacement/thread reset. Add no lifecycle wire/storage fields.
- [ ] Run focused root, projection, streaming, interrupt/runtime regressions and complete core test/lint/build; independent spec then quality review; parent commits.

## Task 4: Reactive public state, docs and verification

Modify core `chat-runtime.ts`, model barrel; React chat/UI/structured facades and `public-api.ts`; Angular chat/UI/structured resources and `public_api.ts`; appropriate existing runtime/facade specs; both installed-package compatibility tests and both framework activity/tool guides. Inspect decision chat adapters for forwarding rather than adding unrelated APIs. No completion-only API expansion unless an existing shared chat facade requires it.

- [ ] Write failing core/runtime/framework tests for a readonly live subagents property and typed SubagentRun. Forward the same state through structured/UI chat without private ɵ types in public signatures or extra render effects/state.
- [ ] Expose core StateSignal, React readonly array and Angular Signal; export the shared public type from all entrypoints.
- [ ] Extend installed consumer checks with actual UiChatMessage types, owner/result fields and lifecycle state access. Do not add new installs/dependencies to the test infrastructure.
- [ ] Document lifecycle, nesting links, provenance, result independence, attribution-only/unknown restored records, suspension/resume and one shared run state. Use pure derived data and retain existing demos. Keep file search deferred and no release notes.
- [ ] Run core unit/build/lint/e2e; React unit/build/inferred eslint:lint/e2e; Angular unit/build/lint/e2e; API reports for all three; docs test/lint/build. Use bounded workers and static logs, report warnings accurately.
- [ ] Independent spec then quality review, followed by aggregate review. Update verification evidence and parent commits.

## Delivery

- [ ] Confirm #805 merged when its refreshed CI turns green; keep other merges moving. No background schedule.
- [ ] Fetch main and replay only this branch's subagent commits onto main after #805 squash merge (current feature base ed0f431e). Resolve genuine conflicts without losing other work; verify after any source changes.
- [ ] Publish and attach a new reviewable PR. No automatic merge of this next PR without authorization. Keep the managed worktree attached for review.

## Baseline

Locked dependencies installed with no manifest changes. Core baseline passed
before implementation; logs `/private/tmp/hashbrown-subagents-core-baseline.log`.
Existing setup warnings include ignored install scripts, Nx/Vite deprecations,
color environment flags, project discovery and local pyenv shim permissions.
