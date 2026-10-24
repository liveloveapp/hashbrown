# Bedrock provider steps implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Follow TDD, AGENTS.md and the shared contract Rules. Independent spec compliance then quality review per task.

**Goal:** Deliver Bedrock provider steps and exact native replay, preserving visible grounding citations; keep file search and the public code-execution enabling key deferred.

**Architecture:** Provider-local native JSON/bytes capture and canonical envelope codec, lifecycle/result normalization and citation fold. Reuse the existing core footer; no dependency changes. Real-store conformance exposed a shared core projection bug: retain argument completion after TOOL_CALL_END so pending provider calls show executing rather than streaming arguments.

**Tech Stack:** Existing TypeScript, AWS SDK 3.1153.0, AG-UI, Nx/Jest/Playwright. No new dependencies/live calls/recordings.

**Design:** `docs/superpowers/specs/2026-10-24-bedrock-provider-steps-design.md`. Main baseline `9b4ef137`, branch `blove/bedrock-provider-steps`, existing isolated worktree. Baseline 34 unit tests pass.

## Task 1: native codec/capture, request and history

Files: new `packages/bedrock/src/stream/bedrock-native.ts/spec.ts`, `bedrock-history.ts/spec.ts`; existing `bedrock-request.ts/spec.ts`, `types.ts`, `index.ts`. No live mapper edits yet.

- [x] Write failing binary codec and indexed capture tests: exact interleaved blocks, signed/redacted bytes, result array text/JSON order, citation native locations, unknown/truncated blocks (including closed invocation then EOF without messageStop and implicit text/citation blocks without STOP), mutation isolation, malformed claims and binary tag collision.
- [x] Run `npx nx test bedrock --testPathPatterns='bedrock-(native|history|request)' --output-style=static`; observe intended red.
- [x] Implement pure capture/codec helpers. Establish exported internal interfaces: `createBedrockCapture`, `captureBedrockEvent`, `readBedrockCaptureContent`, `encodeBedrockNative`, `decodeBedrockNative`. Capture records block closure/completeness; unsupported native reconstruction is explicit.
- [x] Write failing request/history cases: true/object defaults, app-only behavior, immutable input, exact native replay once, earliest represented anchor, reasoning/tool/result-only owners, represented marker/role/ID overlap, provenance/type/chronology checks, pending results across responses and foreign provider filtering.
- [x] Implement exported public `BedrockBuiltInTools`, optional third request context `{builtInTools}`, and validated history API `readBedrockHistory(messages) => {responses,representedMessageIds,providerCallIds}` plus footer creation. Payload contains encoded ordered ContentBlocks and represented IDs; no test-only core exports.
- [x] Run focused tests; independent spec then quality review; fix findings with red/green. Keep files stable for integration and commit when no writers active.

## Task 2: tools and citations

Files: new `packages/bedrock/src/stream/bedrock-tools.ts/spec.ts`, `bedrock-annotations.ts/spec.ts`.

- [x] Write failing tests for native discriminator before dispatch, same-name app calls, known/unknown server names, stable IDs and validated query labels, result identity/type mismatch, success/error, interpreter isError/nonzero exitCode/STDERR-only, readable failure and opaque preservation.
- [x] Write failing citation tests: web/source URL, call-less annotations, repeated source identity versus citation occurrences, quote-only source coordinates, late sources, native document locations, explicit proven tool source reuse, invalid links/indices and input ownership.
- [x] Run `npx nx test bedrock --testPathPatterns='bedrock-(tools|annotations)' --output-style=static`; observe red.
- [x] Implement pure helpers with TSDoc, shared core labels, conservative typed errors/source extraction and immutable answer annotations. Normalize transformed native interpreter calls without adding a public key.
- [x] Run focused tests; independent spec then quality review and red/green fixes.

## Task 3: live mapping and context plumbing

Files: existing `bedrock-events.ts/spec.ts`, `text.fn.ts/spec.ts`; new `bedrock-provider-events.spec.ts`.

- [x] Write failing SDK streams for immediate START before blocked read, incremental ARGS, result STOP settlement before another chunk, unknown/typed results, pending restored calls, fresh result owner, native/app collisions, no success at END/EOF, result errors and byte/signature tails.
- [x] Write failing annotation/footer cases: text/tool/reasoning/result-only owner, call-less citations, metadata-only RAW, cancellation/truncation/provider errors/cleanup precedence, native interleaving and token/finish regressions.
- [x] Run focused tests red, then integrate helpers. Pass canonical messages and actual transformed request to mapper. Keep client continuation flag separate from provider lifecycle. Owner markers include stable Bedrock response identity and native provenance. Footer only for normal complete capture; closure does not settle invocations.
- [x] Update only additive legacy expectations, asserting strict new metadata/footer fields separately. Run full Bedrock unit tests.
- [x] Independent spec then quality review; regressions for findings; keep source stable.

## Task 4: conformance and docs

Files: new `packages/bedrock/src/stream/bedrock-provider-conformance.spec.ts`; existing `packages/bedrock/src/integration.spec.ts`; both `www/content/docs/{react,angular}/platform/bedrock.md`.

- [x] Drive deterministic mapper output through real root store and its `selectViewMessages` public projection (which uses `toViewMessagesFromInternal`); assert provider status/labels/sources/errors and answer citations, no client dispatch or protocol error.
- [x] Commit canonical history, serialize real wire input, restore MESSAGES_SNAPSHOT, construct next request. Assert exact native block order/type/status/signature/bytes once; app results retain user chronology; later server results settle old calls under fresh owners.
- [x] Add regression tests before integration fixes. Keep any test-only module boundary exception minimal and explained.
- [x] Run existing recorded e2e and update only additive native metadata/footer assertions. No new recordings; explicitly separate recorder limitations from deterministic native coverage.
- [x] Document option/configuration, Nova constraints, mandatory source-link display, native persistence/legacy fallback and deferred features. No release notes.
- [x] Independent final spec/quality integration review; verify public API and unchanged dependencies.

## Task 5: final gates and PR

Use `NX_DAEMON=false NX_NO_CLOUD=true`, escalate for Nx local worker sockets if needed. Log to `/private/tmp/hb-bedrock-*`; never print credentials. Keep all dependency-sharing tasks sequential.

- [x] `npx nx test bedrock`, `npx nx build bedrock`, `npx nx lint bedrock`, `npx nx e2e bedrock`, `npx nx build-api-report bedrock`.
- [x] `npx nx test core`, `npx nx build core`, `npx nx lint core`; if core changes also e2e/API report.
- [x] `npx nx build react`, `npx nx build angular`.
- [x] `npx nx build conformance`, `npx nx lint conformance`, `npx nx test conformance`, `npx nx conformance-e2e conformance`, `npx nx provider-e2e conformance`.
- [x] Format docs and changed sources; `npx nx test www`, `npx nx lint www` sequential with builds/browser suites.
- [x] Record pass counts, red/green review regressions, warnings/failures/reruns. Check `git diff --check`, no new dependencies or keys.
- [ ] Commit reviewed files only when other writers idle, push, create and attach PR. No coding-agent attribution in commit/PR. Leave unmerged.

## Verification evidence

- Baseline: 34 Bedrock unit tests and 9 recorded app-tool integration tests pass on SDK 3.1153.0.
- Shared core: 1,665 tests pass serially; core build/lint, React build, Angular build pass. Initial parallel core run timed out in the 25-round tool test and produced a subsequent settlement-count failure; the affected spec passed all 135 tests in isolation, then the full suite passed without code or timeout changes. Subsequent real-store tests required the narrow core completion fix described below.
- Existing warnings observed so far: three unused-variable warnings in core tool-step.ts; Nx Jest executor deprecation and FORCE_COLOR/NO_COLOR notices. Final provider/docs/browser warnings will be recorded below.

- Shared conformance build/lint and 45 unit tests pass. Initial browser launch found the default port 4411 already occupied; rerun uses isolated available ports through existing environment overrides, without changing host configuration or stopping another service.

- Task 1: native codec/capture and history/request public API independently approved for spec compliance and then code quality. Final focused run: 41 tests pass. Review regressions reject conflicting block families, reasoning replacement, unknown events/orphan stops, unsafe array subclasses, malformed claims, duplicate native IDs/results, invented app results, incomplete unsafe replay and capture groups that reorder intervening client results. Cross-realm plain SDK values, Uint8Array and Buffer round-trip safely.
- Shared browser conformance rerun passed 64 tests; provider browser suite passed 8. Framework and conformance sources are unchanged; their gates are repeated after the narrow shared core fix.

- Task 2 focused tests: 28 pass, lint clean. Added red/green regressions for fragmented interpreter JSON text, opaque JSON Document strings, nonzero exit codes, source-ID namespace separation, late source ownership and getter-safe input validation. Independent spec and quality reviews approved, including error-code fallback regressions.

- Task 3: independent spec and quality reviews approved. Native live mapping focused suites pass 69 tests; final empty-text-start regressions bring that to 72. Findings fixed with red/green: valid results survive unrelated unknown blocks, invocation IDs cannot collide across app/provider ownership, redacted byte chunks are owned, malformed provisional calls cannot settle, and aborted iteration never emits a complete footer.

- Final integration review approved spec compliance and quality. Real-store conformance covers five interleaved/tool-only/reasoning-only/call-less citation/late-result paths, exact wire serialization and snapshot restore. Review added the stored ToolMessage.error failure carrier (red: 1 failed, 4 passed; green in the full Bedrock suite).
- Core integration regression: the prepared canonical projection previously discarded TOOL_CALL_END argument completion, leaving provider steps at inProgress. Preserve it through metadata/footer updates for unchanged invocations, clear it on START or replacement snapshot, and retain resolved local app arguments. Independent spec and quality review approved. Final core: 1,670 tests across 84 suites plus 5 built-package e2e tests pass; core build, lint and API report pass. Canonical parity tests explicitly account for this local progress field.
- Final Bedrock: 131 unit tests across 9 suites, 9 recorded e2e tests, build, lint and API report pass. Valid empty text starts now permit complete native capture; explicit unknown starts remain unusable. No live calls or recordings.
- Branch rebased cleanly onto main b6a2b025 (docs PR #735). Docs: 800 tests across 117 files and lint pass, including prerequisite React and Angular builds. Final conformance build/test/lint and browser reruns are recorded below.
- Warnings: existing core tool-step.ts unused variables (3), Nx deprecated Jest/ESLint/Vite executors/plugins, FORCE_COLOR overriding NO_COLOR, ESM/CommonJS configuration notices, API Extractor's bundled TypeScript 5.9.3 versus workspace 6.0.3, existing TSDoc/export/link/release-tag warnings. Browser builds also report existing bundle size warnings. No new provider lint errors or warnings.

- Final shared conformance rerun after the core fix: build/lint, 45 unit tests, 64 browser tests and 8 provider UI browser tests pass on isolated dynamically allocated ports. Final source/docs whitespace check is clean. No dependency manifests changed.
