# .NET Responses API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Qualify native Responses for OpenAI/Azure and both frameworks, keeping all Chat Completions behavior and durable recovery guarantees.

**Architecture:** Trusted API selection chooses pinned native clients under the same IChatClient/MAF/AG-UI pipeline. The test harness gains an explicit API dimension and native-wire assertions. Persisted server compatibility prevents checkpoints crossing API/provider/model/endpoint boundaries.

**Tech Stack:** .NET 10.0.402, pinned Microsoft Agent Framework/AG-UI/OpenAI/MEAI, PostgreSQL 18, aimock, Nx, Playwright, Jest, React and Angular.

**Spec:** `docs/superpowers/specs/2026-10-26-dotnet-responses-design.md`.

## Task 1: Native Responses feasibility and request contract

Files: `tools/conformance/dotnet/Integration/ProviderFactory.cs`, `Integration/HashbrownRequestClient.cs`, `harness/http-fixture.ts`, focused `tests/responses-contract.spec.ts`.

- [x] Write failing HTTP tests selecting Responses for both providers via fixture environment. Require actual `/v1/responses` or Azure `/openai/v1/responses`, correct deployment in model, native authentication, streaming text, exact strict schema in `text.format`, no schema leakage, invalid selector rejection, no browser API override, `store=false`, no previous_response_id/conversation on all request turns. Preserve omitted selector Chat Completions behavior.
- [x] Run focused tests through Nx using the pinned SDK on PATH; record semantic red output rather than setup failure.
- [x] Implement `ModelApi=responses|chat-completions`, default compatibility path, native `ResponsesClient(...).AsIChatClient(model)` and Azure v1 endpoint handling. Use native per-call options to disable store/continuation without mutating shared options. No dependencies should be needed.
- [x] Make tests pass, run .NET build/test/lint, inspect real captured payloads and document any adapter gaps. Add native tool call/output contract tests before moving to the browser matrix.
- [x] Review task against spec and quality; commit bounded changes.

## Task 2: Server compatibility and native recovery evidence

Files: `Integration/InterruptContracts.cs`, `PendingInterruptStore.cs`, `PostgresInterruptStore.cs`, `PostgresInterruptRecovery.cs`, `RecoveryContracts.cs`, `CheckpointSseObserver.cs`, provider/client integration, `Program.cs`, relevant store/HTTP tests.

- [x] Design a secret-free stable server identity for API/provider/model/endpoint. Write failing tests proving unchanged browser requests cannot recover or directly resume a batch under a different identity (both directions, memory/PG, restart); no model/effect work on mismatch. Cover legacy rows, unavailable history and mixed-version deployment.
- [x] Persist and validate that identity through optional backward-compatible configuration wiring, including migration checks. Ensure cleanup/operator inspection does not grant authority or leak private parameters; don't add API authority to forwardedProps. Legacy identity behavior must be explicit and cannot be reassigned to Responses.
- [x] Inject genuine native Responses reasoning/encrypted/hosted/incomplete/error items before adaptation. Establish where data is lost; add bounded pre-loss evidence detection if needed. Prove unavailable capture rather than silent successful canonical recovery. Keep ordinary supported text/tool transcripts recoverable. Do not fabricate reasoning or provider continuation state.
- [x] Run failing tests before implementation and passing tests after; inspect migration/rollback, cancellation, retention and reconciliation regressions. Complete affected .NET checks, two-stage review, commit.

## Task 2C: Retain native browser-tool declarations

- [x] Confirm full captured tool arrays lose the browser description/schema after a result on both APIs; add actual HTTP tests for both providers/APIs and every-turn browser assertions, preserving original server declarations and zero server execution of browser handlers.
- [x] Observe semantic red, then replace only browser function placeholders with fresh non-invocable `AIFunctionFactory.CreateDeclaration` values from current AG-UI input. Clone request options; preserve other tools and actual server handlers, strict schema and mixed ownership checks. Do not mutate caller input or install a server browser-tool handler.
- [x] Run focused red/green, .NET build/lint and all eight browser history cases; obtain independent spec/quality reviews and commit the bounded repair before final matrix validation.

## Task 3: Full browser parity matrix

Files: `dotnet.playwright.config.ts`, `harness/http-fixture.ts`, `harness/durable-fixture.ts`, new focused native-wire readers, `specs/*.spec.ts`.

- [x] Add four Responses projects while preserving original four project identities, zero retries and current timeouts. Propagate the API through every fixture worker/restart without shared mutable globals.
- [x] Make focused Responses streaming/schema/tool/recovery cases fail first. Native text gates count forwarded `response.output_text.delta` events as well as Chat Completions deltas.
- [x] Use explicit API-aware readers for wire assertions, never production wire translation. Assert exact schemas/tools and original history, arguments, function call IDs and outputs exactly once on recovery and subsequent turns. Do not weaken existing assertions to make both shapes pass.
- [x] Run targeted cases in both APIs, then all eight framework/provider/API combinations. Expected minimum 344 cases, 43 per project, plus added regressions; zero failures/skips/retries. Validate native cancellation, actual browser rendering, explicit approvals, durable restart, tab contention, authenticated isolation, diagnostics and reconciliation.
- [x] Complete affected host/conformance/.NET build/test/lint, review spec/quality, commit.

## Task 4: Recipes and compatibility documentation

Files: both `www/content/docs/{react,angular}/platform/dotnet.md`, `tools/conformance/dotnet/README.md`, `verify-recipe.mjs`, validation evidence research document.

- [ ] Recommend explicit Responses configuration with OpenAI/Azure v1 endpoints, model/deployment mapping and correct credentials; show explicit Chat Completions compatibility selection. Document stateless storage, server identity migration policy and qualified feature limits.
- [ ] Compile both guides' identical C# blocks across both APIs and all existing memory/PG × confirmation × recovery combinations; verify insertion targets and intended API selections. No live account credentials are needed for compilation.
- [ ] Run docs normal-environment test/lint, production-environment build/routes, exact recipe verification and full relevant tests. Record warnings, counts and environment in research evidence. Do not claim aimock is live-cloud qualification or change SDK version/publish.
- [ ] Review complete diff independently and fix material findings before PR.

## Task 5: PR, green merge and verification

- [ ] Fetch latest main, inspect changed inputs, integrate normally without discarding other work and rerun impacted checks. Keep Nx graphs serialized per workspace.
- [ ] Push `blove/dotnet-responses`, create and attach a PR describing final behavior and verified counts. Merge only on required green checks; retain strict branch rules.
- [ ] Verify actual merge tree, main CI, production docs, published SDK compatibility (existing 0.8.2 APIs), real C#/XML highlighting and current recipe availability. Record remote evidence on the PR.
- [ ] Stop owned servers/containers, preserve test reports and leave a clean worktree. No new release publication is authorized by this migration.
