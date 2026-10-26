# HTTP response retry implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement the approved opt-in core HTTP response retry API and prove ATC browser recovery after cancellation.

**Architecture:** Keep retry policy execution before HTTP headers enter AG-UI parsing. Put policy types, validation, request snapshotting, bounded error reading, Retry-After interpretation and owned abort/deadline cleanup into a focused core module. Configure the public API from one shared ATC factory used by both frameworks; preserve default transports for decisions and filters.

**Tech Stack:** Existing TypeScript, Fetch/Streams, Jest core tests, Vitest ATC tests, Playwright browsers and Nx; no new dependencies.

Approved specification: `docs/superpowers/specs/2026-10-26-http-response-retry-design.md`.

## Task 1: Core response retry policy

Files: create `packages/core/src/transport/http-response-retry.ts` and `http-response-retry.spec.ts`; modify `http-transport.ts`, its tests, transport exports and generated core API report.

- [x] Write tests for opt-in conflict then success, unchanged default/maxRetries0, request snapshot/middleware, Retry-After delta/date/fallback/overflow, count/deadline, body byte limit/read failure and predicate failures.
- [x] Run `npx nx test core --testPathPatterns=http-response-retry.spec.ts --runInBand --output-style=static`; record expected red failure before implementing.
- [x] Implement public `HttpResponseRetryPolicy`/`HttpResponseRetryContext` and the isolated retry executor. Validate enabled request bodies are strings, clone headers per physical fetch, preserve IDs/bytes and propagate network errors without policy retries.
- [x] Integrate the executor inside the callback supplied to `createHttpEventSource`, keeping execution inside the existing subscription. Do not await fetch/retries in `send`; a TransportResponse must remain available for immediate disposal while fetch, body reading or predicate work is pending. Add a red/green integration test for disposal during a pending predicate/read. Leave absent/disabled paths untouched. Adopt the current nonretryable HTTP error formatter for final policy failures.
- [x] Add red tests for a delayed initial fetch: accepted 2xx after the budget still streams; non2xx after the budget terminates without predicate/retry. Keep elapsed deadline timers inactive during an issued fetch and accepted SSE stream, and verify streams outlive the former deadline. Implement until these focused tests pass.
- [x] Add and verify abort/dispose during read/predicate/wait, hung cleanup, late fetch resolution, concurrent sends and accepted-stream non-replay tests.
- [x] Run focused HTTP tests, then core build/test/lint/API report. Fix failures before committing core code.

## Task 2: ATC shared policy configuration

Files: create `examples/atc/shared/src/chat-transport.ts` and `.test.ts`; update shared barrel and Angular/React main provider setup.

- [x] Write failing tests requiring 409 + complete JSON + request_error + error.details.code run_in_flight + positive valid Retry-After. Reject unrelated status/errors, malformed/truncated bodies and missing/nonpositive hints.
- [x] Run `npx nx test atc-shared --output-style=static` and record red result.
- [x] Implement a shared factory returning `createHttpTransport({ baseUrl:'/api/run', retry:{maxRetries:60,maxElapsedMs:60000,shouldRetry} })`, with TSDoc and optional fetch override for deterministic tests. Use a lazy provider factory in Angular and a stable module-level transport in React.
- [x] Verify accepted continuation preserves IDs and pinned schema. Verify decisions and `/api/filter` keep existing transports.
- [x] Run shared/framework build/test/lint checks and commit after green verification.

## Task 3: Runtime and browser cancellation recovery

Files: `packages/core/src/chat-runtime-recovery.spec.ts`, `examples/atc/e2e/src/backends.spec.ts`, `examples/atc/e2e/src/fixtures/backend-server.cts`; provider entry points `examples/atc/angular/src/main.ts` and `examples/atc/react/src/main.tsx`. Keep browser probes under `/private/tmp/atc-conflict-recovery-validation`.

- [x] Add deterministic runtime cancellation → immediate follow-up → admission409 → success test with the actual HttpTransport and core runtime. Assert one accepted final response, stable replay bytes and no stale-generation write or duplicate browser tool action.
- [x] Add deterministic Angular/React browser coverage for conflict recovery, exhaustion/Retry UI and reload during waiting using existing fixture boundaries. Do not add a product Stop control.
- [x] Run `npx nx e2e atc-e2e` and affected typecheck/lint/test targets, both ATC backend builds and generated-artifact checks as applicable.
- [x] Deploy a preview only, using the dedicated existing ATC Postgres settings; exercise real cancellation/follow-up and inspect canonical checkpoints after quiescence. Never enable the production backend or prune user data.

## Task 4: Documentation, review and PR

Files: `packages/core/README.md`, `examples/atc/README.md`, `docs/superpowers/reports/2026-10-26-atc-http-conflict-recovery.md` and matching `-evidence.json`; core API report generated by its configured extractor target.

- [x] Explain opt-in classification safety, Retry-After precedence, physical HTTP versus generation retry budgets, middleware replay rules and ATC configuration.
- [x] Run build/test/lint for each changed package plus required API/e2e checks. Report existing warnings and actual limits; do not claim hosted success without evidence.
- [x] Obtain independent specification-compliance and code-quality review, address actionable issues, inspect final diff/secret scan, commit and open an attached PR.
- [ ] Separately verify #776's CI/merge. If it merges, rebase only the follow-up work onto its merged main commit; do not include duplicate upgrade commits in the new PR.

Implementation approval was granted by the user on October 26, 2026. Execute without another permission checkpoint for this approved scope; library publication and production enablement remain separate.

## Verification command details

Run focused core tests after each red/green slice: `npx nx test core --testPathPatterns=http-response-retry.spec.ts --runInBand --output-style=static`, then `npx nx test core --testPathPatterns=http-transport.spec.ts --runInBand --output-style=static`. Expected: tests first fail on missing behavior, then pass without weakening assertions.

Full checks: `npx nx run-many -t build,test,lint -p core atc-shared atc-server atc-angular atc-react atc-e2e --parallel=2 --output-style=static`; `npx nx build-api-report core`; `npx nx typecheck atc-e2e`; `npx nx e2e atc-e2e`. Default artifact: `npx nx build atc`; optional artifact: `ATC_CHAT_BACKEND=b4run npx nx build atc`.

Hosted procedure: use the existing secret-redacting `/private/tmp/atc-vercel-cli.mjs` wrapper to pull preview settings into a private mode-0600 file, never print them. Copy the verified optional artifact into a fresh private deployment directory linked to the existing ATC project. Deploy preview with explicit `ATC_CHAT_BACKEND=b4run` override and no production flag. Exercise the actual core runtime and transport against the preview, stopping a run after RUN_STARTED, immediately sending a follow-up, asserting a 409 retry occurred followed by one completed response; inspect latest canonical Postgres state through the public checkpointer before/after 75 seconds. Use fresh synthetic threads, preserve raw credentials privately, commit only sanitized counts/IDs/timings, remove temporary settings afterward.
