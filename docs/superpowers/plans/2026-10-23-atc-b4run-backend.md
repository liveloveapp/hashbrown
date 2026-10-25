# ATC Optional b4.run Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not delegate implementation unless the user requests it.

**Goal:** Add an opt-in b4.run chat backend while preserving the direct Hashbrown OpenAI example and its default behavior.

**Architecture:** Both framework applications continue calling `/api/run`. A shared server policy pins inputs before either the direct OpenAI handler or the b4.run adapter sees them. The adapter translates Hashbrown's schema extension and forwards b4.run's AG-UI stream; browser tools stay in Hashbrown.

**Tech Stack:** TypeScript, Nx, Vitest, Playwright, Hashbrown, b4.run, Node 24, existing Vercel packaging.

**Approved spec:** `docs/superpowers/specs/2026-10-23-atc-b4run-backend-design.md`.

## Execution boundary

**2026-10-23 source compatibility gate: passed against the local fixes.**
The b4.run branch `blove/atc-agent-compatibility` at `ef984f37c` (worktree
`/private/tmp/b4run-atc-compat`) passes the actual Hashbrown browser-tool probe,
including all 15 response schemas, all 16 browser tools, continuation, duplicate
and partial results, visitor isolation, cancellation, and the 4096-token cap.
Its package builds, typechecks, and library tests pass. The fixes are committed
upstream; the user will handle releases separately. Do not publish packages or
change this repository's dependency declarations as part of source integration.

Implementation may proceed using that coherent local package set for validation.
The existing installed/published 0.14.0 runtime is not compatible: selecting it
must fail explicitly rather than silently losing the output cap. Production
readiness remains gated on a compatible released package set, shared storage,
and isolated artifact verification. OpenAI stays fully usable throughout.

### Verified runtime contract and remaining implementation decisions

- Local Node embedding: public `@b4run/cli/runtime` exports
  `createRuntimeFetchHandler` and `buildStaticRouteModule`; the Node wrapper
  supplies supported SQLite fallbacks. The fetch-only entry
  `@b4run/cli/fetch` is used only with all stores supplied.
- Static module: route `/atc#agent`, descriptor from `@b4run/sdk` `agent()`,
  pinned `SYSTEM_PROMPT`, `provider: 'openai'`, `maxOutputTokens: 4096`,
  bounded `recursionLimit`, no server tools. Pass `tools: []` to
  `buildStaticRouteModule`; the deterministic probe confirms no default tools.
- AG-UI config: `clientTools: ['/atc']`,
  `clientForwardedProps: { '/atc': ['responseSchema'] }`,
  `clientToolTtlMs: 600000`, `clientToolRetentionMs: 86400000`.
  The adapter constructs `forwardedProps.responseSchema` from pinned
  Hashbrown props and invokes only `/agui/` plus encoded `/atc#agent`.
- Auth: `defineAuth` receives a server-issued, verified anonymous identity;
  `ownedThreads()` enforces ownership. The outer adapter never forwards
  caller identity headers. A signed HttpOnly/SameSite cookie lasts 24 hours.
  Only `/api/run` is public; no runtime administration endpoint is mounted.
- Local validation can overlay existing dependency resolution with built local
  packages without changing `package.json` or `package-lock.json`. Document
  that source validation does not prove compatibility with current releases.
- Hosted storage uses the existing `@b4run/postgres-storage` and database driver
  dependencies, with separate ATC tables. Missing shared storage or signing
  configuration is a startup error for a selected hosted b4.run backend only.
- Thread admission ends 24 hours after creation. Add an operator cleanup command
  using supported store `deleteThread` APIs and pending-call pruning. Cleanup
  must run with all ATC b4.run instances stopped; no scheduler is introduced.
  Document that physical retention depends on that operational cleanup, and do
  not claim automatic TTL deletion. Test expiration and retryable cleanup.
- Packaging must use the public b4.run build output and a guarded outer adapter,
  following the existing lifecycle wrapper pattern. Verify from an isolated
  artifact; do not bundle native runtime code with the default Vite path.
  Preserve the seven existing API functions and Angular hosting default.

The user authorized continuing implementation after the upstream fixes and is
handling releases independently. No dependency additions are authorized; ask
before introducing any if the existing packages cannot support these APIs.

## Registry 0.15.2 continuation (2026-10-24)

Updated the same existing pins and lockfile to `0.15.2` and validated a fresh
registry-only install. This release still drops `maxOutputTokens`, so six
server tests remain blocked by the compatibility guard. Shared Postgres store
tests pass (3), lifecycle build/test/lint pass (98 tests), and the full core
suite passes serially (1515 tests; the initial concurrent run had one timeout).

The missing source fixes are now rebased onto b4.run main at `014918499` and
published as draft https://github.com/cacheplane/b4run/pull/1101. Rebase review
found a cancelled-parallel-call replay intersection; the fix now preserves its
arguments while reopening the call, with a failing-then-passing regression.
Review, CI, merge and a release containing those changes must precede another
pin update and complete agent/Postgres/artifact validation. No merge, release
or deployment was performed here.

## Released-package follow-up (2026-10-24)

Pins/lockfile now use registry packages `0.15.1`, and verification uses a clean
lockfile install instead of the local source overlay. Full core conformance now
passes (1515 tests); lifecycle build/test/lint and the default ATC build pass.
The release **does not include `maxOutputTokens`** and still fails the existing
ATC guard: six server tests and the optional agent build remain blocked. The
local compatibility branch has no upstream tracking branch/PR. Merge and
release those fixes before treating the agent as available from the registry.

A new uncached `atc-server:test-integration` target validates the shared stores
with `ATC_TEST_DATABASE_URL` pointing at disposable Postgres. Three tests pass
for cross-pool checkpoint/thread state, atomic partial/duplicate results, failed
result persistence and retryable offline cleanup. Complete agent execution,
HTTP ownership and generated-artifact checks with Postgres remain gated on the
compatible agent release. Deployed-host validation remains separate.

## Implementation record

Source implementation and review are complete against the local compatibility
fixes. The original task checklists below preserve the planned verification
scope; this record states what was actually executed and what remains external.
Implementation was kept together on `blove/atc-b4run-backend` rather than split
into the suggested intermediate commits.

- Shared policy, strict selection, guarded Node/fetch adapters, signed anonymous
  visitors, thread ownership/expiration, and offline cleanup are implemented.
- The real SQLite-backed runtime tests cover sequential and parallel client
  tools, partial/duplicate results, schema continuity, ownership, and expiration.
  The earlier source probe additionally covers failed results, cancellation,
  and abandonment. HTTP tests cover streaming/cancellation. Existing browser
  recovery tests remain; the new real-backend browser matrix covers query →
  map action → narrowed card and fresh identity after reload. Stop/retry under
  the b4.run backend has not received a separate real-browser scenario.
- The browser matrix exposed a React schema reset between model completion and
  tool execution. Core now keeps loading true while a tool turn is reserved;
  regression tests preserve pending-interrupt and synchronous Stop behavior.
- Both Vercel packaging paths build. Authored b4.run inputs are precompiled to
  ESM under ignored `server/.b4-app/`, then built by the public CLI. The native
  generated function is wrapped without rewriting its runtime. Isolated
  artifacts verify default startup, hidden runtime endpoints, and selection
  mismatch. Live Postgres ownership through the generated artifact remains an
  external gate, not a completed check.
- Server: 162 tests; recorder: 38 tests; full browser suite: 86 tests. Core: 1443
  tests across 77 suites with the SDK tool-step conformance suite excluded due
  to the local 0.14 SDK API mismatch. Server/core/e2e lint, server build, ATC
  builds, and e2e typecheck were run. See the report for exact limitations.
- No dependencies were added, no prompts changed, no release or deployment ran,
  and the original dirty b4.run checkout was left alone.

## File responsibilities

Existing paths:

- `examples/atc/server/src/run-handler.ts`: retain the readable direct provider call.
- `examples/atc/server/src/filter-handler.ts`: retain direct OpenAI filtering.
- `examples/atc/shared/src/response-schemas.ts`: retain schema definitions and allowlist.
- `examples/atc/server/src/app.ts`, `main.ts`, `vercel/run.ts`: select the chat handler.
- `examples/atc/server/project.json`: Nx build/test/lint/serve integration.
- `examples/atc/tools/build-vercel-output.mts`: preserve default output; add conditional b4.run packaging only after the gate.
- `examples/atc/e2e/playwright.config.ts`, `src/atc.spec.ts`, `src/model.ts`, `src/stubs.ts`: existing browser test infrastructure.
- `examples/atc/README.md`: teach the two backend architectures and configuration.

Proposed new paths, finalized after Task 1:

- `examples/atc/server/src/run-policy.ts` and `.test.ts`: pure shared pinning and request limits.
- `examples/atc/server/src/chat-backend.ts` and `.test.ts`: configuration and handler selection.
- `examples/atc/server/src/b4run/request.ts` and `.test.ts`: explicit protocol normalization.
- `examples/atc/server/src/b4run/handler.ts` and `.test.ts`: Node request/response and runtime boundary.
- `examples/atc/server/src/b4run/visitor.ts` and `.test.ts`: anonymous cookie identity.
- `examples/atc/server/src/b4run/runtime.test.ts`: real-runtime deterministic integration proof.
- `examples/atc/server/agent/b4.config.ts`, `src/app/atc/index.ts`, `src/auth.ts`, `src/thread-access.ts`: b4.run app configuration, agent, and ownership, if supported by the verified runtime interface.
- `docs/superpowers/reports/2026-10-23-atc-b4run-compatibility.md`: evidence and gate decision.

## Task 1: Resolve runtime and package compatibility

**Files:** Create the compatibility report above. Amend this plan and, only when needed, the approved design with findings. Use temporary probe files under `/private/tmp`; do not install into either repository.

- [ ] Record the repository state and exact dependency declarations with `git status --short` and `rg -n '"@b4run|"@ag-ui' package.json package-lock.json`. Record local b4.run `main` commit using `git -C /Users/blove/repos/b4run rev-parse main`; do not change its working checkout.
- [ ] Inspect package exports and installed/resolved versions without dumping environment variables or secrets. Distinguish declarations, installed artifacts, registry metadata, and local source. Explain the CLI/core/storage 0.14.0 and SDK 0.15.0 mix.
- [ ] Identify a coherent published package set, consulting official package metadata/documentation as needed. Inspect supported runtime/build exports, client tool stores, checkpoint/thread stores, `agent()` configuration, default-tool exclusion, and thread access APIs. Record exact names and versions, not inferred equivalents.
- [ ] Write a minimal executable probe using available artifacts and a scripted provider: initial user request → browser query call → tool-result continuation → browser map action → tool-result continuation → narrowed UI JSON stream. Keep thread identity stable and run IDs distinct. Assert names and tool-call IDs, terminal event identities, and the final schema supplied to the provider on every resumed call.
- [ ] If required artifacts cannot be used without adding dependencies, report the exact package changes and seek approval before installing. Do not mark source inspection as an executed probe.
- [ ] Extend the probe for two parallel calls and partial result submission; a duplicate result must not restart model execution. Check failed tool results, stream abort, a new user message over a parked call, and whether any default server tools reach the model.
- [ ] Verify the supported embedding interface works behind an outer request adapter. Prove schema/tool normalization happens before b4.run reads the body. Record any generated-artifact loading requirements and demonstrate cancellation through the chosen boundary.
- [ ] Verify anonymous principal/thread ownership and the serverless shared-store configuration for checkpoints, threads, and pending calls. Establish supported cleanup commands/APIs. Propose explicit tool TTL, settled-record retention, and abandoned-thread retention values; do not create a new scheduler without authorization. State the operational cleanup mechanism.
- [ ] Record exact probe commands, exit codes, assertions, package versions, limits, and unresolved failures in the report. A check that did not run is labeled unverified.
- [ ] Decide the gate: pass only if the end-to-end contract and supported in-process adapter are demonstrated. If embedding fails, present the evidence and a private-service alternative for user review. If runtime fixes are needed upstream, document those instead of broadening this repository's scope.
- [ ] On pass, amend Tasks 2–7 into a complete executable plan using the verified APIs and commands. Include precise storage cleanup settings and deployment tests. Obtain review of that amended plan before application changes.

Expected outcome: evidence-backed package/runtime selection and an amended plan, or a concrete compatibility blocker with no application behavior changes. Run `git diff --check` and commit only the report and plan amendments using a message such as `docs(atc): record agent backend compatibility`.

## Task 2: Extract shared endpoint policy without changing behavior

**Files:** Create `run-policy.ts` and `.test.ts`; modify `run-handler.ts`, `run-handler.test.ts`, `filter-handler.ts`, `filter-handler.test.ts`.

- [ ] Write characterization tests first for existing behavior: known tool definition replacement; unknown/repeated tool removal; system/developer removal; all 15 allowlisted schemas; unrecognized-schema full fallback; absent-schema free text; 256 KiB body, 100 messages, and 16,000 characters per message limits. Preserve existing error statuses and shapes.
- [ ] Run `npx nx test atc-server` to confirm the new tests pass against existing behavior before extraction. For new policy entry points, establish a failing import/behavior test before adding them.
- [ ] Move policy functions/constants into a framework-free module with TSDoc. Keep Node body reading and provider-specific token/reasoning transforms at their respective boundaries. Update filter imports without changing its behavior. Preserve any existing exports still used elsewhere until their consumers are updated.
- [ ] Run `npx nx test atc-server`, `npx nx build atc-server`, and `npx nx lint atc-server`. Inspect all outputs. Commit the passing extraction: `refactor(atc): share chat endpoint policy`.

## Task 3: Add configuration with an unchanged default path

**Files:** Create `chat-backend.ts` and `.test.ts`; modify `app.ts`, `main.ts`, `vercel/run.ts` and their affected callers.

- [ ] Write failing tests for absent → OpenAI, explicit `openai`, explicit `b4run`, empty/unknown → configuration error. Test that selecting OpenAI never constructs the b4.run runtime or reads its storage settings; no fallback when b4.run startup fails.
- [ ] Implement a pure backend parser and an injectable handler factory. Keep `/api/run`, filter behavior, and all other routes unchanged. Construct shared state once per runtime instance, not on every request.
- [ ] Wire local and Vercel entry points to the same selection contract using the runtime interface resolved in Task 1. Make build/runtime selection consistent; fail clearly if a deployed artifact does not contain the selected backend.
- [ ] Run failing then passing tests with `npx nx test atc-server`; finish with server build/lint. Commit: `feat(atc): select the chat backend through configuration`.

## Task 4: Implement the guarded b4.run path

**Files:** Add the `src/b4run/` modules/tests, the verified app/config/auth/thread files, and necessary Nx target changes listed above.

- [ ] Write failing request tests before implementation. Normalize from a constructed output envelope: validated thread/run IDs, allowed messages, pinned tools, bounded state/context policy, and only the selected schema in `forwardedProps.responseSchema`. Client-supplied top-level schema aliases must not bypass Hashbrown schema pinning. Do not carry unknown forwarded keys through.
- [ ] Implement request translation using Task 2 policy. A present invalid schema falls back to full; absence omits the key. Strip client instruction messages. Preserve tool result content and IDs needed to match pending calls.
- [ ] Write failing anonymous-identity tests: cookie flags, invalid cookie replacement, stable visitor identity across tool continuations, distinct visitors, cross-visitor thread denial. Implement the verified principal/thread policy. Never trust a caller-supplied identity header; never expose administrative or alternate execution endpoints.
- [ ] Define the agent with the existing `SYSTEM_PROMPT`, selected model, 4096 output-token cap, verified reasoning settings, bounded graph execution, and no additional default tools. Enable client tools and only the response schema forwarded key for the ATC route.
- [ ] Write failing handler tests for status/header propagation, immediate SSE forwarding, backpressure, close cancellation, errors before/after streaming, and cookies before response headers. Implement against the verified supported runtime adapter.
- [ ] Apply Task 1 storage/TTL/retention settings. Fail clearly when selected b4.run storage is unavailable; do not let a serverless deployment silently use local files. Keep optional runtime initialization out of the OpenAI path.
- [ ] Run server test/build/lint and any Nx-backed runtime checks established in Task 1. Commit cohesive passing changes with `feat(atc): add the guarded agent backend`.

## Task 5: Prove the complete Hashbrown/browser continuation contract

**Files:** Add `src/b4run/runtime.test.ts` and committed deterministic fixtures selected in Task 1; extend existing e2e infrastructure without replacing Hashbrown's transport/hooks.

- [ ] Write failing real-runtime tests for browser query → map action → streamed card. Do not mock away b4.run's pending-call store, checkpoint/resume, or schema binding. Stub the model at its provider HTTP boundary.
- [ ] Add parallel/partial results, retry, failure, cancellation, and abandoned-call scenarios. Assert browser side effects execute once during normal continuation/retry, not just that the server accepts repeated results.
- [ ] Assert a narrowed schema remains selected on every model call after continuations, all 15 subsets pass policy, and nonallowlisted shapes cannot reach the provider. Assert only the ATC tool set is offered.
- [ ] Parameterize browser coverage over backend and framework: OpenAI/Angular, OpenAI/React, b4.run/Angular, b4.run/React. Verify streamed components, map mutations, Stop/new-message recovery, and fresh conversation identity after reload.
- [ ] Ensure new b4.run integration scenarios hit the real `/api/run` adapter rather than browser-intercepted synthetic responses. Keep existing fast UI stubs for unrelated tests.
- [ ] Run `npx nx test atc-server`, `npx nx e2e atc-e2e`, `npx nx typecheck atc-e2e`, `npx nx test atc-e2e`, and `npx nx lint atc-e2e` with the amended deterministic runtime harness. Commit: `test(atc): cover both chat backends through browser tools`.

## Task 6: Package the optional backend

**Files:** Modify `examples/atc/tools/build-vercel-output.mts`, server Nx targets/config, and add packaging checks at paths established after Task 1.

- [ ] Write failing isolated-artifact checks first. Default output still has the seven existing API functions, hosts Angular as before, and starts without any b4.run storage settings. Do not change `HOSTED_APPS`.
- [ ] Implement conditional b4.run packaging using the verified build interface. Avoid bundling native runtime dependencies through an unsupported generic Vite path. Verify any new storage settings are required only for the opted-in artifact.
- [ ] Test from an isolated temporary directory so workspace modules cannot conceal missing runtime files. Test ownership and adapter bypass restrictions on the produced artifact, not only the source app.
- [ ] Run `npx nx build atc` for the default and the verified opt-in packaging configuration. Inspect route manifests, streaming configuration, runtime version, and execution limits. No deploy is needed to complete this task.
- [ ] Run server build/test/lint and affected packaging checks. Commit: `build(atc): package the optional agent backend`.

## Task 7: Document and verify the showcase

**Files:** Modify `examples/atc/README.md` and, if file maps change, `examples/atc/AGENTS.md`.

- [ ] Document the OpenAI default, the exact `ATC_CHAT_BACKEND=b4run` Nx serve command, verified runtime setup, cleanup procedure, and optional deployment configuration. Explain required OpenAI credentials still apply to `/api/filter`.
- [ ] Show readers the direct `HashbrownOpenAI` call and the b4.run agent route. Explain Hashbrown owns components/browser tools; b4.run owns the optional agent continuation. Include anonymous ownership and no restoration; add no UI controls.
- [ ] Run build/test/lint for each changed package: at minimum `atc-server` and `atc-e2e`; add `atc-shared`, `atc-angular`, `atc-react`, core/provider packages, and lifecycle when their code or shared dependencies change. Use `npx nx <target> <project>` throughout. Run ATC build, e2e, and e2e typecheck as above.
- [ ] Run prompt/decision live evals only if relevant prompts/contracts change, per `examples/atc/AGENTS.md`; report required credentials or unavailable checks honestly. No prompt changes are intended.
- [ ] Run `git diff --check`, inspect the complete diff, and record checks, warnings, limitations, and remaining approvals. Commit documentation: `docs(atc): explain the two chat backends`.

## Completion criteria

OpenAI remains the default and visibly uses Hashbrown's provider. Selecting
b4.run demonstrates the same trusted UI and browser actions through a real
agent runtime in both frameworks. Schema pinning holds across tool continuations,
the adapter cannot be bypassed, visitors cannot access each other's threads,
anonymous records have bounded retention, and neither restored chat nor new
server capabilities have entered scope. Both packaged paths and all affected
checks pass, or concrete external blockers are reported without success claims.
