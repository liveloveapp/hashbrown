# Pydantic AI Qualification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Qualify the first isolated Pydantic AI AG-UI HTTP baseline through real producer execution, Hashbrown's prepared root store and React/Angular browser consumers, publish only evidenced claims, and gate regressions.

**Architecture:** Extend the approved conformance program with an isolated Python ASGI host and explicit Node controller. Script only model behavior; execute real Python tools and the public Pydantic AG-UI adapter over loopback HTTP. Keep original Node profiles/capture fingerprints unchanged. Bind new qualifications to retained wire/execution/consumer evidence and exact source/lock hashes; keep native recovery and broader capabilities unqualified.

**Tech Stack:** Existing Nx, Node test runner, Jest and Playwright; proposed Python 3.12.12, pydantic-ai-slim[ag-ui] 2.64.0, ag-ui-protocol 1.0.0, Starlette 1.10.0, Uvicorn 0.54.0; isolated uv lock (dependency approval required before install). No runtime dependencies.

**Approved spec:** `docs/superpowers/specs/2026-10-30-framework-conformance-program-design.md`.

## Boundaries and evidence

- File search stays deferred. No release notes or live model/provider calls.
- Baseline: streaming text, causally gated server tool, independent browser tool round trip, explicit failure probe, first-party cancellation vs disconnect, multi-turn history.
- Use installed public adapter; retain requested/effective protocol, raw SSE bytes, parsed events, callback/gate observations and native history. Do not rewrite producer outcomes or mark an unsupported field passed.
- Consumer canonical JSON restore and next request are separate from durable backend recovery. No durable restart claim.
- Existing browser hosts must execute actual application handlers against the Python endpoint. Capture replay alone does not establish a live round trip.
- Approval/state/structured UI, attribution/subagents and native recovery remain not-tested unless independently qualified later.
- Pins only for the first weekly candidate constraint; candidate resolves identically and is explicitly deduplicated. Broader candidate ranges require reviewed approval.

### Task 1: Isolated real Python host and execution controls

**Files:** Create `tools/conformance/agent-frameworks/python/{pyproject.toml,uv.lock,.python-version,host.py,host_test.py,project.json}`; controller modules/tests alongside the host.

- [ ] Obtain explicit dependency approval and lock complete transitive dependencies. Record Python and uv toolchain versions; frozen sync only in gates.
- [ ] Write failing tests for real HTTP streaming start before gated completion, callback entry/release, exact pins, history and client-tool continuation; prove failures before implementation.
- [ ] Implement deterministic FunctionModel responses, actual registered tool callbacks, per-thread controls, HTTP run/control endpoints and bounded cleanup. Public AG-UI adapter generates wire events.
- [ ] Probe real callback failure and cancellation with explicit server cancellation and subscriber disconnect separately. Assert observed wire classification; preserve demonstrated gaps without parsing prose.
- [ ] Keep tests top-level with explicit try/finally cleanup; use stdlib Python testing/assertions and Node test APIs without new test dependencies.
- [ ] Run host build/test/lint equivalents via Nx and commit.

### Task 2: Prepared-store and real browser qualification

**Files:** Create separate Pydantic captures/evidence under `tools/conformance/agent-frameworks/python/evidence/`; add `packages/core/src/models/pydantic-ai.conformance.spec.ts`; add `tools/conformance/specs/pydantic-ai.spec.ts` and dedicated Playwright configuration; reuse neutral host observations.

- [ ] Write failing prepared-store tests for streaming, tool projection, exact terminal classification, immutable capture, canonical restore and next native request.
- [ ] Capture actual endpoint bytes explicitly; verify captures against fresh execution with narrowly tested normalization of generated identities/timestamps, preserving relationships and payloads. Never edit producer traces.
- [ ] Drive events through createStore({reducers,prepareAction:ɵprepareRootAction}) and public projection; verify protocol errors and no duplicate authority.
- [ ] Write failing live browser tests for both consumers: streaming before release, server execution once, independent client handler once with its result reaching Python, history and cancellation/failed outcome observations.
- [ ] Implement only necessary harness support; fix core only for demonstrated contract-compliant consumer bugs with dedicated regression tests.
- [ ] Run affected core/conformance/consumer package build/test/lint and both browser projects. Commit evidence and tests.

### Task 3: Extend versioned inventory without rewriting legacy qualification

**Files:** `tools/conformance/agent-frameworks/program/{inventory.mjs,inventory-evidence.mjs,inventory.spec.mjs,report*.mjs,report.spec.mjs,catalog.json}` plus a separate Pydantic qualification record and retained evidence summary.

- [ ] Test rejection of missing stages, altered wire bytes, source/runtime/lock mismatch, fabricated passed outcomes and native recovery claims.
- [ ] Introduce additive non-legacy profile validation; retain original seven-profile digest and provenance rules unchanged.
- [ ] Publish only executed scenarios with all required stages. For demonstrated missing producer information, retain raw evidence and explicit gap; unexecuted scenarios stay not-tested. Pydantic planned broader coverage remains visible.
- [ ] Bind exact framework/bridge/server/runtime versions, protocol negotiation, source hashes and qualification date/source execution identity. Distinguish local retained evidence from eventual CI acceptance; do not invent CI provenance.
- [ ] Regenerate React/Angular compatibility pages via data-only generator; test determinism/stale output and source links. Commit.

### Task 4: Affected gates and isolated weekly health

**Files:** `tools/conformance/agent-frameworks/python/project.json`, `tools/conformance/project.json`, `tools/conformance/harness/select-ci-setup{,.spec}.ts`, `.github/workflows/{pr-main,framework-compatibility}.yml`, program selection/weekly tests and docs.

- [ ] Test actual task graphs: Python source/lock/runtime changes select its producer/core/browser gates; shared consumers select all qualified profiles; matrix-only/unrelated docs do not install Python.
- [ ] Add Python setup using fixture selection, pinned toolchain and frozen lock. Keep production dependency graphs free of Python packages.
- [ ] Add isolated weekly Pydantic job with bounded stage timeouts and sanitized success/failure/infrastructure artifacts; one ecosystem failure must not hide another. Preserve original nightly jobs.
- [ ] Explicitly deduplicate identical pinned candidate, with no unapproved version upgrades or lock edits. Test failure/fallback reporting and process cleanup.
- [ ] Update conformance README and design delivery status, run program/conformance/website build/test/lint plus relevant e2e. Report warnings and commit.

### Task 5: Independent review, PR and green merge

- [ ] Independently review implementation against spec and quality/security concerns; resolve actionable issues.
- [ ] Verify clean intended diff, no dependency leakage, no credentials, deferred file search and source evidence integrity.
- [ ] Open PR with problem/behavior, exact qualification boundaries and verification; attach it to this chat.
- [ ] Address CI/review failures. Keep main merges moving; update this branch when required and merge normally only on current green checks. User already authorizes green merge.
- [ ] Confirm actual merge and report remaining qualification gaps and warnings.

## Concrete acceptance commands

All commands use `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_NO_CLOUD=true` locally. New project ID is `pydantic-ai-conformance`; its `build` compiles Python without writing tracked bytecode, `test` executes real host/controller assertions, `lint` checks stdlib syntax plus Node ESLint, `consumer-test` runs the dedicated prepared-store Jest file, and `example-e2e` runs the dedicated live React/Angular Playwright configuration. Project dependencies must avoid cycles with core/conformance.

- `npx nx build pydantic-ai-conformance`
- `npx nx test pydantic-ai-conformance`
- `npx nx lint pydantic-ai-conformance`
- `npx nx consumer-test pydantic-ai-conformance`
- `npx nx example-e2e pydantic-ai-conformance`
- `npx nx build core`; `npx nx test core`; `npx nx lint core`
- `npx nx build conformance`; `npx nx test conformance`; `npx nx lint conformance`
- `npx nx build framework-conformance-program`; `npx nx test framework-conformance-program`; `npx nx lint framework-conformance-program`
- `npx nx build angular`; `npx nx test angular`; `npx nx lint angular`; `npx nx build react`
- `npx nx build www`; `npx nx test www`; `npx nx lint www`
- `npx nx e2e www` if generated public docs layout/policy changes require browser review.

Tool ownership acceptance includes both an undeclared Python server tool and a registered same-name browser tool: an explicitly provider-classified server call must not dispatch the browser handler, while an independent client tool executes exactly once and returns into native Python history. Native output without provider classification retains existing matching-client semantics; report any observed ownership enrichment gap without manufacturing classification or an unconditional passed cell. Cancellation must observe callback cancellation and no late completion side effect even after the release endpoint is invoked. Per-thread gates must not release or cancel another thread. Bound control waits by explicit deadlines, not arbitrary sleeps. Include malformed input/abnormal EOF only as separately labeled consumer fault injection if tested.

Task-graph/cache tests must also cover shared catalog and harness edits, captured wire/evidence records and CI setup/workflow changes. Use actual `nx affected --graph` output, not only mocked task IDs. Shared changes must select required consumers and qualified producer gates; evidence-only data validation must remain data-only unless executable capture input changes. Preserve the existing seven Node profiles' exact fingerprint rules.
