# .NET recovery and reconciliation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Execute tasks sequentially with independent spec and quality review. Steps use checkbox syntax for tracking.

**Goal:** Restore retained checkpoint-associated conversations safely after reload or acknowledged stream failure, and inspect/reconcile ambiguous effects without replaying them.

**Architecture:** Public atomic client restoration consumes authenticated server-owned snapshots. Memory/PostgreSQL checkpoint records retain bounded original requests and fenced terminal response snapshots. Separate operator policies protect scoped inspection and terminal reconciliation with immutable audit evidence.

**Tech Stack:** Existing core/React/Angular runtimes, native AG-UI, ASP.NET Core, Microsoft Agent Framework, Npgsql 10.0.3/PostgreSQL 18, Jest/Vitest/Playwright and aimock. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-24-dotnet-recovery-reconciliation-design.md`, independently approved after tightening capture ownership. User already authorized routine decisions, implementation, PR, protected merge on green and verification.

## Preparation and coordination

- [x] Reuse the current isolated worktree and start `blove/dotnet-recovery-reconciliation` from fetched main (`9b4ef137`). Working tree was clean.
- [x] Explore three approaches, choose explicit atomic restore rather than synthetic recovery generations or a general session service, write and review the spec.
- [x] Establish the existing interrupt baseline: `npx nx test core --runInBand --testPathPatterns=chat-runtime-interrupt.spec --output-style=static`, 22 tests passed. Existing Nx/Vite/color notices remain.
- [x] Independently review this plan, resolve material findings and commit it before implementation.

Use one Nx graph at a time. Do not run builds from separate agents against shared outputs. Root coordinates graph ownership, hooks and commits. All tests use top-level `test(...)` with arrange/act/assert blanks. Read applicable repository instructions; keep public doc comments and public framework types free of internal `ɵ` types. Do not change another workspace's processes or ports. Do not add dependencies without user approval.

## Task 1: Atomic client restoration and framework facades

**Files:**
- Add `packages/core/src/models/conversation-recovery.ts` and focused runtime recovery tests.
- Modify `packages/core/src/chat-runtime.ts`, `actions/dev.actions.ts`, relevant reducers/selectors, `effects/generate-message.effects.ts`, `completion-input.ts`, model/public exports and existing interrupt/completion tests.
- Modify React `hooks/use-chat.tsx`, `use-structured-chat.tsx`, `use-ui-chat.tsx`, completion result/forwarding wrappers and integration tests.
- Modify Angular `resources/chat-resource.fn.ts`, structured/UI chat and completion wrappers, completion input adapter and integration tests.
- Generate core/React/Angular API reports using their configured targets; include only generated tracked changes attributable to the feature.

- [ ] Write a failing core test for restoring original canonical history and a complete interrupt list into a fresh idle runtime, before starting effects. Assert no network/tool calls, then start effects and assert it remains inert. Verify a fresh local batch ID and exact resumed request IDs/order after explicit resume.
- [ ] Add failing tests for acknowledged-failure replacement, invalid/stale revision, busy/reentrant scheduling rejection, ownership cloning, unknown/expired interrupts, malformed/tool-incomplete history and trusted schema/state validation. Invalid restore must leave all old state intact.
- [ ] Add public types and API:

```ts
interface ConversationSnapshot<State = unknown> {
  readonly threadId: string;
  readonly messages: readonly Readonly<Message>[];
  readonly state?: State;
  readonly interrupts?: readonly Interrupt[];
  readonly configuredSystemMessageId?: string;
}
interface ConversationRecoveryState {
  readonly revision: number;
  readonly required: boolean;
}
// On runtime: recovery signal, getRecoveryConfiguration(), and restoreConversation(snapshot, { expectedRevision }): void.
```

- [ ] Validate with existing canonical message/interrupt/JSON helpers, build trusted projections from current local schema/tools and atomically commit a dedicated restore action. Retire old ownership and drafts/errors/terminal metadata. Mint a fresh local batch. Preserve runtime configuration and configured system text; validate/adopt only the supplied first overlay ID and remove only that overlay from stored canonical history.
- [ ] Write a failing pure-configuration getter test, then expose `getRecoveryConfiguration()` on runtime/facades using the same native request configuration construction as generation. Return only owned current system/tools/forwardedProps; no handler/credential/run data or probe generation. Test structured/UI request schemas and configuration revision invalidation.
- [ ] Implement local revision invalidation and idle reservation/CAS checks, including queued/reentrant actions. Suppress implicit generation on initial effect startup and restart. Historical tools must stay inert both on restore and on later sends.
- [ ] Write failing facade tests, then forward recovery signal/value and command through chat, structured/UI and related completion facades. Add completion-input restoration suppression so an unchanged current input is consumed rather than automatically resent after an epoch change. New explicit input retains ordinary semantics.
- [ ] Verify stale asynchronous recovery cannot overwrite a newer idle thread or configuration. Verify old local batch IDs stay stale even when server IDs and thread are identical. Verify the effective configured system overlay and subsequent system updates keep the adopted ID.
- [ ] Run core/React/Angular affected build, available test and lint targets in one graph. React inferred targets may differ from its explicit project file: inspect `npx nx show project react --json` first. Run `npx nx build-api-report core`, `react`, `angular` without overlapping graphs. Record red/green evidence and exact warnings.
- [ ] Request fresh spec-compliance review against the approved client contract, resolve findings; then code-quality review and fixes. Run equivalent normal staged checks serially if needed to avoid shared-output hook races; commit only Task 1 files after green checks.

## Task 2: Recovery storage, authenticated endpoints and safe reconciliation

**Files:**
- Add focused contracts/recovery endpoint/canonical SSE observer files under `tools/conformance/dotnet/Integration/`.
- Extend `InterruptContracts.cs`, `PendingInterruptStore.cs`, `PostgresInterruptStore.cs`, `HashbrownEndpointConfiguration.cs` and request-local integration as required.
- Extend `Program.cs`, `Testing/FixtureInterruptStore.cs`, `Testing/FixtureTools.cs` with fixture-only claims/policies, process barriers and failure controls.
- Add `tests/recovery.spec.ts`, `tests/reconciliation.spec.ts`, focused observer tests through an executable fixture, and extend `harness/durable-fixture.ts` only as needed.

- [ ] Write an HTTP regression first: create a pending batch on A, kill A, query recovery on B using the same authenticated principal and current system/tools/forwarded configuration. Assert the owned original request and public interrupts return, with no model/effect calls. Observe the missing-endpoint failure before implementation.
- [ ] Extend memory and PostgreSQL contracts with owned original input, recovery-visible revision, independent generation outcome and bounded terminal snapshot. Keep privileged args and claim/capture handles out of public DTOs. Implement original-request size checks before accepting a checkpoint.
- [ ] Persist original native request bytes/text rather than JSONB, preserving fingerprint-significant property order. Implement schema version 1-to-2 migration under the startup advisory lock; clean creation must produce the same final schema. Legacy rows without original input remain safe and truthfully unavailable. Add independent audit retention, scoped lookup/list indexes, bounded cleanup and tests for concurrent migration/startup.
- [ ] Add deterministic failing tests before missing behavior: current config mismatch; wrong principal/role; malformed/oversized requests; expiry, active lease and expired lease; legacy/future schema; database/registry failures; terminal output capture/persistence failure; retained history limits; scoped listing and audit retention.
- [ ] Implement opt-in recovery builder with required authorization policy and server scope resolver. Use bounded read-only POST `/threads/{threadId}/recovery`; derive scope from authenticated principal, return no-store versioned envelopes, and use nondisclosing 404 before compatibility checks. Compare current tools/forwarded configuration and first configured system prefix. Return busy/unknown/expired/terminal disposition independently of optional restorable history.
- [ ] Implement bounded incremental native SSE observation and a pure supported-event-to-canonical-history fold. Cover UTF-8/frame chunk boundaries, multiple frames, tool results, structured text, unsupported/incomplete events and byte/message limits. Capture only checkpoint-associated output, never replay stored events. Persist successful terminal history before acknowledging its terminal event; otherwise mark unavailable without undoing or repeating effects.
- [ ] Fence every capture start, terminal, failure and cleanup write with checkpoint ID plus the accepted claim token/generation. Allow the current owner to persist model output after effect completion, but never allow a stale wrapper or reconciled owner to overwrite new output.
- [ ] Implement scoped bounded operator list/inspect and summaries under a separate required policy and authenticated actor resolver. Reconcile only `EffectStarted`/`FailedAfterEffect` with expected state/generation/revision, bounded reason/evidence and required quiescence acknowledgement. Lock/check, append audit and terminalize/retire both execution and capture ownership in one transaction. Never reopen, retry or invoke an executor/model.
- [ ] Test reconciliation races, same-revision operators, late worker finish, old wrapper after successor output, late capture after reconciliation, audit rollback atomicity and consumed replay after cleanup. Observe durable effect counts separately from model requests. Test that CAS cannot claim to revoke already-issued dispatch authority; operator evidence is an admission prerequisite, not database proof.
- [ ] Use real PostgreSQL 18 through an owned disposable container or explicit fixture connection. Run `npx nx build dotnet-conformance`, `npx nx test dotnet-conformance`, `npx nx lint dotnet-conformance`; preserve all 66 existing HTTP cases. Do not weaken budgets or silently skip durable tests.
- [ ] Obtain independent spec review then quality review, resolve findings and re-review. Commit coherent Task 2 source/tests only after appropriate checks and reviewed guarantees.

## Task 3: Browser recovery/reconciliation matrix and compiled recipes

**Files:**
- Extend the existing React/Angular conformance hosts and interrupt controls with explicit recovery and operational status UI, fixture credentials and recovery URL options. Do not put server internals into public application UI.
- Add `tools/conformance/dotnet/specs/recovery.spec.ts` and reconciliation scenarios, extending `harness/routed-endpoint.ts` for stable recovery/operations routing as needed.
- Update both `www/content/docs/{react,angular}/platform/dotnet.md`, `tools/conformance/dotnet/README.md`, `verify-recipe.mjs`, project inputs and relevant core/framework API guidance.

- [ ] Write failing browser scenarios across React/Angular × OpenAI/Azure before wiring recovery. Use actual `page.reload`, stable thread selectors and authenticated server lookup; no synthetic user message or stored local batch token.
- [ ] Wire explicit authenticated snapshot fetch with local revision capture and `restoreConversation`. Remember only thread selectors in browser storage. Display disposition separately from assistant messages; disable approval/new sends for busy/unknown state until refresh, reconciliation or deliberate new thread.
- [ ] Cover pending reload, restart plus reload, acknowledged pre-effect stream failure and explicit post-lease recovery, busy state, two-tab approval competition, principal isolation, stale delayed lookup, final answer reload, completed effect/missing answer, unknown effect with operator reconciliation and inert restored historical browser tools. Assert zero model/effect work on lookup/restore/reconciliation and exact original fingerprint on explicit recovered resume.
- [ ] Exercise operator policy denial, scoped inspect/list, evidence/quiescence requirements, stale revision conflict and successful terminal reconciliation through the fixture UI or browser HTTP controls. Verify a subsequent stale settlement cannot overwrite its disposition and no retry action is offered.
- [ ] Update recipes with identical compiled C# setup, both endpoint policies and scope responsibilities, new client restore API examples, explicit user recovery controls, operational limitations, retained sensitive data policy, migration and no-exactly-once guarantees. Ensure the recipe grants no arbitrary browser operator authority.
- [ ] Extend exact snippet compilation for every documented setup combination with checked insertion anchors. Preserve original memory/PostgreSQL and confirmation/no-confirmation combinations; compile with the actual Integration source and locked dependencies.
- [ ] Run final build/test/lint for every affected project in a single graph; run API report generation and docs production route report (`NODE_ENV=production`) after current main integration. Run shared browser suites using supported unused ports if defaults belong to another workspace, then full .NET provider-e2e sequentially. Preserve original 108 .NET browser cases and prior shared coverage.
- [ ] Obtain separate spec then quality reviews and a final complete-diff review. Fix and rerun checks appropriate to any correction. Commit Task 3 and concise validation records; leave no unrelated formatter changes.

## Task 4: Protected integration and verification

- [ ] Fetch main, rebase committed work if required, inspect the final diff, run checks appropriate to intervening changes and confirm a clean tree.
- [ ] Push the feature branch, create a PR from the repository template with a body file describing behavior, guarantees, migration and actual validation. Attach the PR to this chat.
- [ ] Enable squash auto-merge for the verified head through normal required checks. Stay with CI, fix genuine failures and satisfy strict up-to-date protection without admin bypasses.
- [ ] Verify actual merged state/SHA, main CI and production deployment. Fetch both public .NET recipes and verify recovery/reconciliation setup, code blocks, limitations and navigation against merged source.
- [ ] Record remote evidence in the PR, remove only owned disposable resources, preserve useful worktree/review records, and provide a concise final result with test counts, warnings and practical limits. Do not create the deferred upstream OpenAI report.

## Execution environment

Use the existing isolated SDK if it remains available: `PATH=/tmp/hashbrown-dotnet/sdk:$PATH`, `DOTNET_HOST_PATH=/tmp/hashbrown-dotnet/sdk/dotnet`, `DOTNET_CLI_HOME=/tmp/hashbrown-dotnet/cli`, `NUGET_PACKAGES=/tmp/hashbrown-dotnet/nuget`, `DOTNET_CLI_TELEMETRY_OPTOUT=1`, `NX_DAEMON=false`, `NX_NO_CLOUD=true`, `NX_ISOLATE_PLUGINS=false`. Under demonstrated local contention, `DOTNET_PROCESSOR_COUNT=2` bounds only local process scaling; CI keeps its normal runtime settings. Do not change test deadlines to mask a failure.

The prior disposable container was removed after PR734; create only uniquely named owned resources for this work. Graph/hook ownership must be announced between agents. Network, sockets and Git writes use the approved escalation flow where the sandbox requires it. No user confirmation is necessary for already authorized reversible implementation/review work; new dependencies still need explicit approval.
