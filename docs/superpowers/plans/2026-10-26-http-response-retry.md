# HTTP response retry implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement the approved opt-in core HTTP response retry API and prove ATC browser recovery after cancellation.

**Architecture:** Keep retry policy execution before HTTP headers enter AG-UI parsing. Put policy types, validation, request snapshotting, bounded error reading, Retry-After interpretation and owned abort/deadline cleanup into a focused core module. Configure the public API from one shared ATC factory used by both frameworks; preserve default transports for decisions and filters.

**Tech Stack:** Existing TypeScript, Fetch/Streams, Jest core tests, Vitest ATC tests, Playwright browsers and Nx; no new dependencies.

Approved specification: `docs/superpowers/specs/2026-10-26-http-response-retry-design.md`.

## Task 1: Core response retry policy

Files: create `packages/core/src/transport/http-response-retry.ts` and `http-response-retry.spec.ts`; modify `http-transport.ts`, its tests, transport exports and generated core API report.

- [ ] Write tests for opt-in conflict then success, unchanged default/maxRetries0, request snapshot/middleware, Retry-After delta/date/fallback/overflow, count/deadline, body byte limit/read failure and predicate failures.
- [ ] Run `npx nx test core --testPathPatterns=http-response-retry.spec.ts --runInBand --output-style=static`; record expected red failure before implementing.
- [ ] Implement public `HttpResponseRetryPolicy`/`HttpResponseRetryContext` and the isolated retry executor. Validate enabled request bodies are strings, clone headers per physical fetch, preserve IDs/bytes and propagate network errors without policy retries.
- [ ] Integrate opt-in execution at the existing HttpTransport fetch boundary, leaving absent/disabled paths untouched. Adopt the current nonretryable HTTP error formatter for final policy failures.
- [ ] Add and verify abort/dispose during read/predicate/wait, hung cleanup, late fetch resolution, concurrent sends and accepted-stream non-replay tests.
- [ ] Run focused HTTP tests, then core build/test/lint/API report. Fix failures before committing core code.

## Task 2: ATC shared policy configuration

Files: create `examples/atc/shared/src/chat-transport.ts` and `.test.ts`; update shared barrel and Angular/React main provider setup.

- [ ] Write failing tests requiring 409 + complete JSON + request_error + error.details.code run_in_flight + positive valid Retry-After. Reject unrelated status/errors, malformed/truncated bodies and missing/nonpositive hints.
- [ ] Run `npx nx test atc-shared --output-style=static` and record red result.
- [ ] Implement a shared factory returning `createHttpTransport({ baseUrl:'/api/run', retry:{maxRetries:60,maxElapsedMs:60000,shouldRetry} })`, with TSDoc and optional fetch override for deterministic tests. Use a lazy provider factory in Angular and a stable module-level transport in React.
- [ ] Verify accepted continuation preserves IDs and pinned schema. Verify decisions and `/api/filter` keep existing transports.
- [ ] Run shared/framework build/test/lint checks and commit after green verification.

## Task 3: Runtime and browser cancellation recovery

Files: extend core chat-runtime recovery tests and the existing ATC backend browser fixture/suite as needed; keep any browser probes outside product code.

- [ ] Add deterministic runtime cancellation → immediate follow-up → admission409 → success test with the actual HttpTransport and core runtime. Assert one accepted final response, stable replay bytes and no stale-generation write or duplicate browser tool action.
- [ ] Add deterministic Angular/React browser coverage for conflict recovery, exhaustion/Retry UI and reload during waiting using existing fixture boundaries. Do not add a product Stop control.
- [ ] Run `npx nx e2e atc-e2e` and affected typecheck/lint/test targets, both ATC backend builds and generated-artifact checks as applicable.
- [ ] Deploy a preview only, using the dedicated existing ATC Postgres settings; exercise real cancellation/follow-up and inspect canonical checkpoints after quiescence. Never enable the production backend or prune user data.

## Task 4: Documentation, review and PR

Files: core transport usage documentation, `examples/atc/README.md`, new sanitized dated validation report/evidence, generated API report.

- [ ] Explain opt-in classification safety, Retry-After precedence, physical HTTP versus generation retry budgets, middleware replay rules and ATC configuration.
- [ ] Run build/test/lint for each changed package plus required API/e2e checks. Report existing warnings and actual limits; do not claim hosted success without evidence.
- [ ] Obtain independent specification-compliance and code-quality review, address actionable issues, inspect final diff/secret scan, commit and open an attached PR.
- [ ] Separately verify #776's CI/merge. If it merges, rebase only the follow-up work onto its merged main commit; do not include duplicate upgrade commits in the new PR.

Implementation approval was granted by the user on October 26, 2026. Execute without another permission checkpoint for this approved scope; library publication and production enablement remain separate.
