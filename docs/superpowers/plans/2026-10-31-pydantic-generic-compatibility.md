# Generic Pydantic Compatibility Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans. Follow test-first steps and preserve native baseline evidence.

**Goal:** Qualify a minimal B4-independent Pydantic AG-UI compatibility adapter and generic Hashbrown terminal tool outcomes.

**Architecture:** Standard AG-UI carries all lifecycle/actions/progress. Only missing typed terminal outcomes use the small hashbrown.tool metadata extension. Optional Python subclasses augment native events/history while core consumes neutral outcomes separately from legacy B4 support.

**Tech Stack:** Existing TypeScript/Jest/Nx/Playwright; approved Python package dependencies and uv build; isolated exact pinned Python qualification.

**Spec:** docs/superpowers/specs/2026-10-31-pydantic-generic-compatibility-design.md.

## Task 1: Generic core tool outcomes

Files: create packages/core/src/models/tool-outcome.ts and tool-outcome.spec.ts; modify reducers/ag-ui-message-history.ts, reducers/ag-ui-messages.reducer.ts and models/internal_helpers.ts, models/view.models.ts, models/server-tool-call-display.ts, reducers/ag-ui-message-accumulator.ts and reducers/tool-calls.reducer.ts; add prepared-store qualification tests.

- [x] Write top-level tests for neutral metadata validation, malformed/unknown input, immutable merge, failed/denied/cancelled precedence, explicit failure error and unrelated metadata preservation. Run `npx nx test core --testFile=tool-outcome.spec.ts --runInBand` and observe missing support.
- [x] Implement independent pure helpers; do not synthesize B4 metadata. Document reusable functions; internal-only core exports use ɵ if cross-package access is necessary.
- [x] Write failing prepared-store tests for neutral RESULT failure/denial/cancellation, duplicate success, explicit interrupted/retried labels and nongrouping, neutral/B4 conflict precedence, direct/prepared projection parity, native canonical snapshot restore and next request. Check both canonical and projected metadata have no B4 keys.
- [x] Implement metadata settlement/merge and public projection. Preserve existing B4 tests and client ownership. Run core build/test/lint.

## Task 2: Installable Python adapter

Files: packages/pydantic-ai/{pyproject.toml,README.md,project.json,src/hashbrown_pydantic_ai/**init**.py,src/hashbrown_pydantic_ai/adapter.py,tests/adapter_test.py}.

- [x] Write real FunctionModel/native tool event tests before adapter implementation. Assert failure/denied/interrupted classifications, original content and continuity events, native frontend tool handoff/resume and no B4 output. Observe failure first.
- [x] Implement public subclass hooks only, preserve all inherited options. Augment dump_messages using actual native parts/call IDs, avoiding inbound outcome trust and preserving native loader sanitization. Qualify retried outcomes explicitly. Test builtin history ID mapping, empty failure detail, RunCancelled vs external CancelledError and ordinary errors with a cancellation context, callback/closure preservation and per-run isolation.
- [x] Build wheel/sdist with approved uv backend; install wheel into isolated pinned host and verify imported file resides in installed distribution. Add Nx build/test/lint targets, packaging/source input coverage.

## Task 3: Real producer and consumer recipe qualification

Files: new tools/conformance/agent-frameworks/python-recipe host/controller/capture/evidence/project files, packages/core/src/models/pydantic-recipe.conformance.spec.ts, tools/conformance/pydantic-ai recipe browser tests/config.

- [x] Keep old native producer files/evidence byte-identical. Use installed wheel and existing native mechanisms, with fixture-only model/gates/counters.
- [x] Test callback failure, cancellation, approval deny/resume, client round trip, live streaming, concurrent isolation and native continuity. Retain actual raw SSE/execution/request observations.
- [x] Qualify prepared store, canonical restore/next request and React/Angular live browsers. Require typed outcomes without B4 metadata or error-string guessing.
- [x] Probe native broader capabilities separately; retain truthful gaps and not-tested scope. No custom app infrastructure to manufacture native recovery support.

## Task 4: Evidence, affected gates, weekly and public matrix

Files: tools/conformance/agent-frameworks/program/{pydantic-qualification.json,additional-qualification.mjs,catalog.json,report*.mjs}, conformance README and CI setup/workflows as needed.

- [x] Add recipe record separately; tests reject fabricated stages, stale package/capture inputs, modified baseline and failed provenance. Extend validator only with demonstrated recipe evidence.
- [x] Add actual affected graph/cache tests for package, recipe host, consumers and evidence; preserve isolation of unrelated projects. Extend existing weekly job with pinned recipe execution.
- [x] Regenerate public compatibility docs and verify deterministic output. No release notes or file search.

## Task 5: Review, PR and green merge

- [x] Run affected package build/test/lint, producer installed-wheel tests, prepared root-store tests, both browser suites, program evidence checks and website checks as appropriate. Record warnings.
- [x] Independently review spec and quality, fix findings, verify no B4 coupling in adapter, no keys/dependency leakage.
- [ ] Commit, push, open and attach PR. Address review/CI, update if required without stopping other merges, merge only with current green checks (authorized). Confirm actual merge.
